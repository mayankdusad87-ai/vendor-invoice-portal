import { NextRequest, NextResponse } from 'next/server';
import { uploadFileToDrive } from '@/lib/google-drive';
import { rateLimit, getRateLimitKey, rateLimitResponse } from '@/lib/security';

export async function POST(request: NextRequest) {
  // Rate limit: 10 uploads per minute per IP
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
    const allowedTypes = [
      'application/pdf',
      'image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/heic', 'image/heif',
    ];

    let totalSize = 0;
    for (const file of filesToUpload) {
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { error: `File type not allowed. Only PDF, JPEG, PNG, WebP, and HEIC are supported.` },
          { status: 400 }
        );
      }
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { error: `Each file must be under 10MB.` },
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

    // Upload all files to Google Drive
    const uploadResults = await Promise.all(
      filesToUpload.map(async (file) => {
        const result = await uploadFileToDrive(file);
        return {
          url: result.url,
          fileName: result.fileName,
        };
      })
    );

    return NextResponse.json({
      success: true,
      files: uploadResults,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload files. Please try again.' },
      { status: 500 }
    );
  }
}
