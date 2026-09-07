import { NextRequest, NextResponse } from 'next/server';
// SharePoint code kept for future use — uncomment when Azure AD app is ready
// import { uploadFileToSharePoint } from '@/lib/microsoft-drive';
import { uploadToR2, isAllowedFileType, extFromMime, MAX_FILE_SIZE } from '@/lib/r2';
import { rateLimit, getRateLimitKey, rateLimitResponse } from '@/lib/security';
import { requireAuth, isAuthError } from '@/lib/auth';

/**
 * POST /api/upload — upload general files (invoice docs, measurement sheets) to R2.
 *
 * Files are stored at: files/{timestamp}-{index}.{ext}
 * Served via: /api/r2/files/{timestamp}-{index}.{ext}
 *
 * For work photos, use /api/photos/upload instead (versioned per invoice).
 */
export async function POST(request: NextRequest) {
  // ── 1. Authenticate user ──
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  // Only engineers, vendors, and admins can upload files
  if (session.type !== 'engineer' && session.type !== 'vendor' && session.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: upload not allowed for this role' }, { status: 403 });
  }

  // ── 2. Rate limit: 10 uploads per minute per IP ──
  const key = getRateLimitKey(request, 'file-upload');
  const check = rateLimit(key, { maxRequests: 10, windowMs: 60_000 });
  if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const singleFile = formData.get('file') as File | null;

    // Support both single file and multiple files
    const filesToUpload = files.length > 0 ? files : singleFile ? [singleFile] : [];

    if (filesToUpload.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    // Cap max files per request to prevent abuse
    if (filesToUpload.length > 10) {
      return NextResponse.json(
        { error: 'Maximum 10 files per upload' },
        { status: 400 }
      );
    }

    // Validate all files
    let totalSize = 0;
    for (const file of filesToUpload) {
      if (!isAllowedFileType(file.type)) {
        return NextResponse.json(
          { error: 'File type not allowed. Only PDF, JPEG, PNG, WebP, and HEIC are supported.' },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'Each file must be under 10MB.' },
          { status: 400 }
        );
      }
      totalSize += file.size;
    }

    // Total upload size limit: 50MB
    if (totalSize > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Total upload size must be under 50MB.' },
        { status: 400 }
      );
    }

    // Upload all files to R2
    const timestamp = Date.now();
    const uploadResults = await Promise.all(
      filesToUpload.map(async (file, index) => {
        const ext = extFromMime(file.type);
        const r2Key = `files/${timestamp}-${index + 1}.${ext}`;

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await uploadToR2(r2Key, buffer, file.type);

        return {
          url: `/api/r2/${r2Key}`,
          fileName: file.name,
        };
      })
    );

    return NextResponse.json({
      success: true,
      files: uploadResults,
    });
  } catch (error: unknown) {
    console.error('Upload error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Upload failed: ${msg}` },
      { status: 500 }
    );
  }
}
