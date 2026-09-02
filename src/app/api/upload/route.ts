import { NextRequest, NextResponse } from 'next/server';
import { verifyVendorToken } from '@/lib/auth';
import { put } from '@vercel/blob';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !verifyVendorToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Validate all files
    const allowedTypes = [
      'application/pdf',
      'image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/heic', 'image/heif',
    ];

    for (const file of filesToUpload) {
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { error: `File "${file.name}" is not allowed. Only PDF, JPEG, PNG, WebP, and HEIC are supported.` },
          { status: 400 }
        );
      }
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds 10MB limit.` },
          { status: 400 }
        );
      }
    }

    // Check if Vercel Blob is configured
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      // Return placeholders in development
      const results = filesToUpload.map((file) => ({
        url: '',
        fileName: file.name,
      }));
      return NextResponse.json({
        success: true,
        files: results,
        message: 'File upload will work after Vercel Blob is configured',
      });
    }

    // Upload all files to Vercel Blob
    const uploadResults = await Promise.all(
      filesToUpload.map(async (file) => {
        const blob = await put(`invoices/${Date.now()}-${file.name}`, file, {
          access: 'public',
        });
        return {
          url: blob.url,
          fileName: file.name,
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
      { error: 'Failed to upload files' },
      { status: 500 }
    );
  }
}
