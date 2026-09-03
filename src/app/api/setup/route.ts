import { NextRequest, NextResponse } from 'next/server';
import { initializeSheetHeaders, getActiveRejectionReasons, addRejectionReason } from '@/lib/google-sheets';
import { getOrCreateFolder } from '@/lib/google-drive';
import { requireAdmin, isAuthError } from '@/lib/auth';
import { rateLimit, getRateLimitKey, rateLimitResponse } from '@/lib/security';

export async function POST(request: NextRequest) {
  // Rate limit: 3 setup calls per minute per IP
  const key = getRateLimitKey(request, 'setup');
  const check = rateLimit(key, { maxRequests: 3, windowMs: 60_000 });
  if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

  // Admin only
  const session = requireAdmin(request);
  if (isAuthError(session)) return session;

  try {
    await initializeSheetHeaders();

    // Also ensure Google Drive folder exists and is shared with the owner
    const folderId = await getOrCreateFolder();

    // Seed default rejection reasons if none exist
    const existingReasons = await getActiveRejectionReasons();
    if (existingReasons.length === 0) {
      const defaultReasons = [
        'Incorrect Amount',
        'Missing Supporting Documents',
        'Duplicate Invoice',
        'Work Not Completed',
        'Invoice Not Matching PO',
        'Vendor Not Approved',
        'GST/Tax Mismatch',
        'Incomplete Description',
      ];
      for (const reason of defaultReasons) {
        await addRejectionReason({ reason, status: 'active' });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Sheet initialized and Drive folder shared successfully',
      driveFolderId: folderId,
      driveFolderUrl: `https://drive.google.com/drive/folders/${folderId}`,
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to initialize setup' },
      { status: 500 }
    );
  }
}
