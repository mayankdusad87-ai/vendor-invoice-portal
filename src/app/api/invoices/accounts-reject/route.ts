import { NextRequest, NextResponse } from 'next/server';
import { requireAccounts, isAuthError } from '@/lib/auth';
import { getInvoiceById, updateInvoiceStatus } from '@/lib/google-sheets';
import { sanitizeString, rateLimit, getRateLimitKey, rateLimitResponse } from '@/lib/security';

/**
 * POST /api/invoices/accounts-reject — accounts team rejects an invoice back to approver
 * Body: { invoiceId, reason }
 *
 * This resets the invoice status to "rejected" with the accounts team's reason.
 * The approver will then see it and make corrections before re-approving.
 */
export async function POST(request: NextRequest) {
  const session = requireAccounts(request);
  if (isAuthError(session)) return session;

  // Rate limit: 5 rejections per minute per IP
  const rlKey = getRateLimitKey(request, 'accounts-reject');
  const rlCheck = rateLimit(rlKey, { maxRequests: 5, windowMs: 60_000 });
  if (!rlCheck.allowed) return rateLimitResponse(rlCheck.retryAfterMs!);

  try {
    const body = await request.json();
    const invoiceId = sanitizeString(body.invoiceId, 50);
    const reason = sanitizeString(body.reason, 500);

    if (!invoiceId || !reason) {
      return NextResponse.json(
        { error: 'Invoice ID and rejection reason are required' },
        { status: 400 }
      );
    }

    if (reason.length < 5) {
      return NextResponse.json(
        { error: 'Rejection reason must be at least 5 characters' },
        { status: 400 }
      );
    }

    // Get the invoice
    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Accounts can only reject invoices that are approved or partially_paid
    if (invoice.status !== 'approved' && invoice.status !== 'partially_paid') {
      return NextResponse.json(
        { error: `Cannot reject — invoice status is "${invoice.status}"` },
        { status: 400 }
      );
    }

    // Format rejection reason with accounts team attribution
    const rejectionComment = `[Accounts Rejection by ${session.accountsName}] ${reason}`;

    // Set status back to rejected — approver will see this and correct
    const success = await updateInvoiceStatus(
      invoiceId,
      'rejected',
      rejectionComment,
      invoice.approvedBy || '' // preserve original approver name
    );

    if (!success) {
      return NextResponse.json({ error: 'Failed to reject invoice' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Accounts rejection error:', error);
    return NextResponse.json({ error: 'Failed to reject invoice' }, { status: 500 });
  }
}
