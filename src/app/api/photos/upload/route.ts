import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { rateLimit, getRateLimitKey, rateLimitResponse } from '@/lib/security';
import { getInvoiceById, updateInvoicePhotos } from '@/lib/google-sheets';
import {
  uploadToR2,
  getLatestPhotoVersion,
  isAllowedPhotoType,
  extFromMime,
  MAX_PHOTO_SIZE,
  MAX_PHOTOS_PER_UPLOAD,
} from '@/lib/r2';

/**
 * POST /api/photos/upload — upload work photos to R2 (versioned per invoice)
 *
 * FormData:
 *   invoiceId  — the invoice these photos belong to
 *   photos     — 1–5 image files (JPG/PNG/HEIC, max 5 MB each)
 *
 * On new submission: stores as v1
 * On resubmission:  stores as v(N+1), old versions preserved as audit trail
 *
 * Returns: { version, photos: [{ key, url, fileName }] }
 */
export async function POST(request: NextRequest) {
  // ── 1. Auth — engineers, vendors, admin can upload ──
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  if (session.type !== 'engineer' && session.type !== 'vendor' && session.type !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden: upload not allowed for this role' },
      { status: 403 }
    );
  }

  // ── 2. Rate limit: 10 per minute per IP ──
  const key = getRateLimitKey(request, 'photo-upload');
  const check = rateLimit(key, { maxRequests: 10, windowMs: 60_000 });
  if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

  try {
    const formData = await request.formData();
    const invoiceId = formData.get('invoiceId') as string;

    if (!invoiceId || typeof invoiceId !== 'string' || invoiceId.length < 3) {
      return NextResponse.json(
        { error: 'invoiceId is required' },
        { status: 400 }
      );
    }

    // Verify invoice exists
    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // ── 3. Collect and validate photos ──
    const photos = formData.getAll('photos') as File[];

    if (photos.length === 0) {
      return NextResponse.json(
        { error: 'At least one photo is required' },
        { status: 400 }
      );
    }

    if (photos.length > MAX_PHOTOS_PER_UPLOAD) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PHOTOS_PER_UPLOAD} photos per upload` },
        { status: 400 }
      );
    }

    // Validate each photo
    for (const photo of photos) {
      // Check type (allow common image types; mobile browsers may report 'image/jpg')
      const mime = photo.type.toLowerCase();
      if (!isAllowedPhotoType(mime) && mime !== 'image/jpg') {
        return NextResponse.json(
          { error: `Only JPG, PNG, and HEIC photos are allowed. Got: ${photo.type}` },
          { status: 400 }
        );
      }

      if (photo.size > MAX_PHOTO_SIZE) {
        return NextResponse.json(
          { error: `Each photo must be under 5 MB. "${photo.name}" is ${(photo.size / 1024 / 1024).toFixed(1)} MB` },
          { status: 400 }
        );
      }

      if (photo.size === 0) {
        return NextResponse.json(
          { error: `"${photo.name}" is empty` },
          { status: 400 }
        );
      }
    }

    // ── 4. Determine version ──
    const latestVersion = await getLatestPhotoVersion(invoiceId);
    const newVersion = latestVersion + 1;

    // ── 5. Upload each photo to R2 ──
    const uploadedPhotos: { key: string; url: string; fileName: string }[] = [];

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const ext = extFromMime(photo.type) || 'jpg';
      const r2Key = `invoices/${invoiceId}/v${newVersion}/photo-${i + 1}.${ext}`;

      const arrayBuffer = await photo.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      await uploadToR2(r2Key, buffer, photo.type);

      uploadedPhotos.push({
        key: r2Key,
        url: `/api/r2/${r2Key}`,
        fileName: photo.name,
      });
    }

    // ── 6. Update the invoice's workPhotos field with latest version URLs ──
    const photoUrls = uploadedPhotos.map((p) => p.url).join(',');
    await updateInvoicePhotos(invoiceId, photoUrls);

    return NextResponse.json({
      success: true,
      version: newVersion,
      photos: uploadedPhotos,
    });
  } catch (error) {
    console.error('Photo upload error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Photo upload failed: ${msg}` },
      { status: 500 }
    );
  }
}
