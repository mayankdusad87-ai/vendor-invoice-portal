import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { downloadFromR2 } from '@/lib/r2';

/**
 * GET /api/r2/{...key} — authenticated proxy to serve R2 objects.
 *
 * Works like /api/files/[fileId] for SharePoint, but for R2 objects.
 * Example: /api/r2/invoices/INV123/v1/photo-1.jpg
 *
 * Only authenticated users can access files. Files are cached for 1 hour
 * in the browser (private cache) to reduce R2 reads.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  // ── 1. Authenticate ──
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  const { key: keyParts } = await params;
  const r2Key = keyParts.join('/');

  if (!r2Key || r2Key.length < 5) {
    return NextResponse.json({ error: 'Invalid file key' }, { status: 400 });
  }

  // Prevent path traversal
  if (r2Key.includes('..') || r2Key.includes('\\')) {
    return NextResponse.json({ error: 'Invalid file key' }, { status: 400 });
  }

  try {
    const { buffer, contentType } = await downloadFromR2(r2Key);

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Length', String(buffer.length));
    headers.set('Cache-Control', 'private, max-age=3600'); // 1hr cache
    headers.set('X-Content-Type-Options', 'nosniff');

    // Set filename from the key's last segment
    const fileName = r2Key.split('/').pop() || 'file';
    headers.set(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(fileName)}"`
    );

    return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
  } catch (error: unknown) {
    console.error('R2 proxy error:', error);

    // Check if it's a NoSuchKey error
    const errorName = (error as { name?: string })?.name;
    if (errorName === 'NoSuchKey' || errorName === 'NotFound') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to load file' },
      { status: 500 }
    );
  }
}
