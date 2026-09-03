import { NextRequest, NextResponse } from 'next/server';
import { downloadFileFromDrive } from '@/lib/google-drive';
import { requireAuth, isAuthError } from '@/lib/auth';

/**
 * Secure file proxy — serves Google Drive files to authenticated users.
 * Files are never made public; this endpoint downloads via the service account
 * and streams the content back with proper headers.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  // ── 1. Authenticate — any logged-in user can view files ──
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  const { fileId } = await params;

  if (!fileId || fileId.length < 10) {
    return NextResponse.json({ error: 'Invalid file ID' }, { status: 400 });
  }

  try {
    const { buffer, mimeType, fileName } = await downloadFileFromDrive(fileId);

    // Build response with proper headers
    const headers = new Headers();
    headers.set('Content-Type', mimeType);
    headers.set('Content-Length', String(buffer.length));
    headers.set('Cache-Control', 'private, max-age=3600'); // 1hr cache, private (auth required)
    headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);

    // Security headers
    headers.set('X-Content-Type-Options', 'nosniff');

    return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
  } catch (error: unknown) {
    console.error('File proxy error:', error);

    // Check if it's a Google API 404
    const status = (error as { code?: number })?.code;
    if (status === 404) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to load file' },
      { status: 500 }
    );
  }
}
