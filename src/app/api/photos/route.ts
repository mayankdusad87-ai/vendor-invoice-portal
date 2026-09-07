import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { getAllPhotoVersions } from '@/lib/r2';

/**
 * GET /api/photos?invoiceId=XXX — list all photo versions for an invoice
 *
 * Returns all versions (newest first) with proxy URLs for viewing.
 * Approvers and accounts team use this to see work photo evidence.
 *
 * Response: {
 *   versions: [
 *     { version: 2, photos: [{ key, url, name }] },   // newest
 *     { version: 1, photos: [{ key, url, name }] },   // original
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  const invoiceId = request.nextUrl.searchParams.get('invoiceId');
  if (!invoiceId) {
    return NextResponse.json(
      { error: 'invoiceId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const versionData = await getAllPhotoVersions(invoiceId);

    const versions = versionData.map(({ version, keys }) => ({
      version,
      photos: keys.map((key) => ({
        key,
        url: `/api/r2/${key}`,
        name: key.split('/').pop() || key,
      })),
    }));

    return NextResponse.json({ versions });
  } catch (error) {
    console.error('Failed to list photos:', error);
    return NextResponse.json(
      { error: 'Failed to list photos' },
      { status: 500 }
    );
  }
}
