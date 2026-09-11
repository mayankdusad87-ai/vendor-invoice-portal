import { NextRequest, NextResponse } from 'next/server';
import { requireAccounts, isAuthError } from '@/lib/auth';
import { getInvoiceById, setAccountsQuery, addApprovalHistory, ConflictError } from '@/lib/google-sheets';
import { sanitizeString, rateLimit, getRateLimitKey, rateLimitResponse } from '@/lib/security';

/**
 * POST /api/invoices/accounts-reject — accounts team raises a query on an approved invoice
 * Body: { invoiceId, reason }
 *
 * This sets the invoice status to "accounts_query" (NOT "rejected") and stores
 * the query details. The approver will then see it and either accept the query
 * (sending for correction) or disagree and re-approve.
 */
export async function POST(request: NextRequest) {
  const session = requireAccounts(request);
  if (isAuthError(session)) return session;

  // Rate limit: 5 queries per minute per IP
  const rlKey = getRateLimitKey(request, 'accounts-reject');
  const rlCheck = rateLimit(rlKey, { maxRequests: 5, windowMs: 60_000 });
  if (!rlCheck.allowed) return rateLimitResponse(rlCheck.retryAfterMs!);

  try {
    const body = await request.json();
    const invoiceId = sanitizeString(body.invoiceId, 50);
    const reason = sanitizeString(body.reason, 500);

    if (!invoiceId || !reason) {
      return NextResponse.json(
        { error: 'Invoice ID and query reason are required' },
        { status: 400 }
      );
    }

    if (reason.length < 5) {
      return NextResponse.json(
        { error: 'Query reason must be at least 5 characters' },
        { status: 400 }
      );
    }

    // Get the invoice
    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Accounts can only raise queries on approved or partially_paid invoices
    if (invoice.status !== 'approved' && invoice.status !== 'partially_paid') {
      return NextResponse.json(
        { error: `Cannot raise query — invoice status is "${invoice.status}"` },
        { status: 400 }
      );
    }

    // Build approval comments trail (append, don't overwrite)
    const queryNote = `[Accounts Query by ${session.accountsName}] ${reason}`;
    const existingComments = invoice.approvalComments || '';
    const updatedComments = existingComments
      ? `${existingComments}\n${queryNote}`
      : queryNote;

    // Set status to accounts_query with full metadata (with concurrency check)
    const success = await setAccountsQuery(
      invoiceId,
      session.accountsName,
      reason,
      invoice.status,    // preserve previous status for re-approval
      updatedComments,
      invoice.updatedAt, // optimistic concurrency
    );

    if (!success) {
      return NextResponse.json({ error: 'Failed to raise query' }, { status: 500 });
    }

    // Log to ApprovalHistory for audit trail
    await addApprovalHistory({
      invoiceId,
      amount: '0',
      cumulativeTotal: invoice.approvedAmount || '0',
      approvedBy: `Accounts: ${session.accountsName}`,
      comments: `[ACCOUNTS_QUERY] ${reason} (${invoice.status} → accounts_query)`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Accounts query error:', error);
    return NextResponse.json({ error: 'Failed to raise query' }, { status: 500 });
  }
}
