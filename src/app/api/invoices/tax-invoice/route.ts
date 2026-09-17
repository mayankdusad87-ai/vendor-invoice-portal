import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import {
  getInvoiceById, updateInvoiceDocumentStage, addApprovalHistory,
  getPaymentsByInvoiceId, updateInvoiceStatus,
} from '@/lib/google-sheets';
import { sanitizeString, sanitizeDate, sanitizeAmount } from '@/lib/security';

/**
 * PATCH /api/invoices/tax-invoice
 *
 * Upload a tax invoice against a proforma invoice.
 * Transitions documentStage from "proforma" → "tax_invoice", unlocking GST payments.
 * GST amount is mandatory — a tax invoice by definition carries GST.
 * If the new total (base + GST) exceeds the current approved amount, the invoice
 * is flagged for approval extension and status is recalculated.
 * Only engineers (who submitted the proforma) can upload.
 */
export async function PATCH(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  if (session.type !== 'engineer' && session.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: engineer role required' }, { status: 403 });
  }

  try {
    const body = await request.json();

    const invoiceId = sanitizeString(body.invoiceId, 50);
    const taxInvoiceFileUrl = sanitizeString(body.taxInvoiceFileUrl, 2000);
    const taxInvoiceFileName = sanitizeString(body.taxInvoiceFileName, 200);
    const taxInvoiceNumber = sanitizeString(body.taxInvoiceNumber, 50);
    const taxInvoiceDate = sanitizeDate(body.taxInvoiceDate);
    const revisedGstAmount = body.revisedGstAmount !== undefined && body.revisedGstAmount !== ''
      ? sanitizeAmount(body.revisedGstAmount)
      : '';
    const revisionReason = sanitizeString(body.revisionReason, 500) || '';

    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }
    if (!taxInvoiceFileUrl || !taxInvoiceFileName) {
      return NextResponse.json({ error: 'Tax invoice file is required' }, { status: 400 });
    }
    if (!taxInvoiceNumber) {
      return NextResponse.json({ error: 'Tax invoice number is required' }, { status: 400 });
    }
    if (!taxInvoiceDate) {
      return NextResponse.json({ error: 'Tax invoice date is required' }, { status: 400 });
    }

    // GST is mandatory for tax invoices
    if (!revisedGstAmount || parseFloat(revisedGstAmount) <= 0) {
      return NextResponse.json(
        { error: 'GST amount is required for tax invoices. A tax invoice must include GST.' },
        { status: 400 }
      );
    }

    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (invoice.documentStage !== 'proforma') {
      return NextResponse.json(
        { error: `Cannot upload tax invoice: document stage is "${invoice.documentStage || 'not set'}", expected "proforma"` },
        { status: 400 }
      );
    }

    const uploadedBy = session.type === 'engineer'
      ? (session as import('@/lib/auth').EngineerToken).engineerName
      : 'Admin';

    const originalGst = parseFloat(invoice.gstAmount) || 0;
    const newGst = parseFloat(revisedGstAmount) || 0;
    const baseAmount = parseFloat(invoice.amount) || 0;
    const oldTotal = baseAmount + originalGst;
    const newTotal = baseAmount + newGst;
    const currentApproved = parseFloat(invoice.approvedAmount) || oldTotal;
    const extensionNeeded = Math.max(0, newTotal - currentApproved);

    const gstVariance = originalGst > 0 ? Math.abs(newGst - originalGst) / originalGst : 0;
    const varianceNote = gstVariance > 0.1
      ? ` | GST variance: ${(gstVariance * 100).toFixed(1)}% (₹${originalGst.toLocaleString('en-IN')} → ₹${newGst.toLocaleString('en-IN')})`
      : '';

    await updateInvoiceDocumentStage(invoiceId, {
      taxInvoiceFileUrl,
      taxInvoiceFileName,
      taxInvoiceNumber,
      taxInvoiceDate,
      uploadedBy,
      revisedGstAmount,
    });

    // Recalculate status: if invoice was 'paid' but new total > consumed, revert to partially_paid
    let statusChanged = false;
    const oldStatus = invoice.status;
    if (oldStatus === 'paid' || oldStatus === 'partially_paid') {
      const payments = await getPaymentsByInvoiceId(invoiceId);
      const totalConsumed = payments.reduce((sum, p) =>
        sum + (parseFloat(p.amount) || 0) + (parseFloat(p.tdsAmount) || 0) + (parseFloat(p.retentionAmount) || 0), 0);
      const correctStatus = totalConsumed >= newTotal ? 'paid' : 'partially_paid';

      if (correctStatus !== oldStatus) {
        const freshInvoice = await getInvoiceById(invoiceId);
        await updateInvoiceStatus(
          invoiceId,
          correctStatus,
          undefined,
          undefined,
          undefined,
          freshInvoice?.updatedAt || invoice.updatedAt,
        );
        statusChanged = true;
      }
    }

    // Build audit trail
    const extensionNote = extensionNeeded > 0
      ? ` | Extension required: ₹${extensionNeeded.toLocaleString('en-IN')} (approved: ₹${currentApproved.toLocaleString('en-IN')} → new total: ₹${newTotal.toLocaleString('en-IN')})`
      : '';
    const statusNote = statusChanged
      ? ` | Status: ${oldStatus} → partially_paid`
      : '';

    await addApprovalHistory({
      invoiceId,
      amount: '0',
      cumulativeTotal: invoice.approvedAmount || '0',
      approvedBy: uploadedBy,
      comments: `[TAX_INVOICE] Uploaded tax invoice #${taxInvoiceNumber} (proforma → tax_invoice). GST: ₹${newGst.toLocaleString('en-IN')}${varianceNote}${extensionNote}${statusNote}${revisionReason ? ` | Reason: ${revisionReason}` : ''}`,
    });

    return NextResponse.json({
      success: true,
      documentStage: 'tax_invoice',
      gstAmount: newGst,
      newTotal,
      extensionNeeded,
      statusChanged,
      gstVariancePercent: gstVariance > 0 ? (gstVariance * 100).toFixed(1) : null,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    console.error('Tax invoice upload error:', error);
    const message = error instanceof Error ? error.message : 'Failed to upload tax invoice';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
