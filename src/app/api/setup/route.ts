import { NextRequest, NextResponse } from 'next/server';
import { initializeSheetHeaders, migrateVendorRows, migrateOldPaymentRows, migrateInvoiceColumns, fixOrphanedPaymentStatuses, getActiveRejectionReasons, addRejectionReason } from '@/lib/google-sheets';
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
    // Migrate invoice columns BEFORE setting headers — the migration detects
    // old order by checking headers (e.g. col H = "PO Number" = old 24/25-col format).
    // It moves GST next to Amount & adds Total column. Then initializeSheetHeaders
    // force-updates the header row to match the new 26-column layout (A–Z).
    const migratedInvoiceCols = await migrateInvoiceColumns();

    await initializeSheetHeaders();

    // Migrate vendor rows: remove PIN column from old 7-col format
    const migratedVendors = await migrateVendorRows();

    // Migrate any old 8-column payment rows to the new 11-column format
    const migratedPayments = await migrateOldPaymentRows();

    // Fix invoices marked paid/partially_paid with no matching payment rows
    const fixedStatuses = await fixOrphanedPaymentStatuses();

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

    const folderId = process.env.DRIVE_FOLDER_ID || '(not set)';

    return NextResponse.json({
      success: true,
      message: 'Sheet initialized successfully',
      migratedInvoiceColumns: migratedInvoiceCols,
      migratedVendorRows: migratedVendors,
      migratedPaymentRows: migratedPayments,
      fixedOrphanedStatuses: fixedStatuses,
      driveFolderId: folderId,
      driveFolderUrl: folderId !== '(not set)' ? `https://drive.google.com/drive/folders/${folderId}` : null,
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to initialize setup' },
      { status: 500 }
    );
  }
}
