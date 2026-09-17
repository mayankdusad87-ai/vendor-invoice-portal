import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { getInvoiceById, updatePhysicalCopyTracking, addApprovalHistory } from '@/lib/google-sheets';
import { sanitizeString, sanitizeDate } from '@/lib/security';

/**
 * PATCH /api/invoices/physical-copy
 *
 * Track physical copy dispatch and receipt:
 * - Billing engineer marks "sent to HO" (action: 'sent')
 * - Accounts marks "received at HO" (action: 'received')
 */
export async function PATCH(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();
    const invoiceId = sanitizeString(body.invoiceId, 50);
    const action = body.action as 'sent' | 'received';
    const date = sanitizeDate(body.date);

    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }
    if (!action || !['sent', 'received'].includes(action)) {
      return NextResponse.json({ error: 'Action must be "sent" or "received"' }, { status: 400 });
    }
    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    if (action === 'sent' && session.type !== 'engineer' && session.type !== 'admin') {
      return NextResponse.json({ error: 'Only billing engineers can mark physical copy as sent' }, { status: 403 });
    }
    if (action === 'received' && session.type !== 'accounts' && session.type !== 'admin') {
      return NextResponse.json({ error: 'Only accounts team can mark physical copy as received' }, { status: 403 });
    }

    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (action === 'received' && !invoice.physicalCopySentAt) {
      return NextResponse.json(
        { error: 'Cannot mark as received: physical copy has not been marked as sent yet' },
        { status: 400 },
      );
    }

    let actorName = 'Admin';
    if (session.type === 'engineer') {
      actorName = (session as import('@/lib/auth').EngineerToken).engineerName;
    } else if (session.type === 'accounts') {
      actorName = (session as import('@/lib/auth').AccountsToken).accountsName;
    }

    const updated = await updatePhysicalCopyTracking(
      invoiceId,
      action,
      actorName,
      date,
      invoice.updatedAt,
    );

    if (!updated) {
      return NextResponse.json(
        { error: 'Failed to update physical copy tracking. The invoice may have been modified by someone else. Please refresh and try again.' },
        { status: 409 },
      );
    }

    const tag = action === 'sent' ? '[PHYSICAL_COPY_SENT]' : '[PHYSICAL_COPY_RECEIVED]';
    const docType = invoice.documentStage === 'tax_invoice' ? 'Tax Invoice' : 'Proforma Invoice';
    await addApprovalHistory({
      invoiceId,
      amount: '0',
      cumulativeTotal: invoice.approvedAmount || '0',
      approvedBy: actorName,
      comments: `${tag} ${docType} physical copy ${action === 'sent' ? 'sent to Head Office' : 'received at Head Office'} on ${date} by ${actorName}`,
    });

    return NextResponse.json({
      success: true,
      action,
      date,
      actorName,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    console.error('Physical copy tracking error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update physical copy tracking';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
