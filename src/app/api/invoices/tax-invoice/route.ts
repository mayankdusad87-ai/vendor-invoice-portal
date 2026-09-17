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
    const revisedAmount = body.revisedAmount !== undefined && body.revisedAmount !== ''
      ? sanitizeAmount(body.revisedAmount)
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

    const blockedStatuses = ['rejected', 'correction_required', 'accounts_query'];
    if (blockedStatuses.includes(invoice.status)) {
      return NextResponse.json(
        { error: `Cannot upload tax invoice: invoice status is "${invoice.status}". Please resolve the current status before uploading a tax invoice.` },
        { status: 400 }
      );
    }

    const uploadedBy = session.type === 'engineer'
      ? (session as import('@/lib/auth').EngineerToken).engineerName
      : 'Admin';

    const originalBase = parseFloat(invoice.amount) || 0;
    const originalGst = parseFloat(invoice.gstAmount) || 0;
    const newBase = revisedAmount ? parseFloat(revisedAmount) || 0 : originalBase;
    const newGst = parseFloat(revisedGstAmount) || 0;
    const oldTotal = originalBase + originalGst;
    const newTotal = newBase + newGst;
    const currentApproved = parseFloat(invoice.approvedAmount) || oldTotal;
    const extensionNeeded = Math.max(0, newTotal - currentApproved);

    const baseChanged = Math.abs(newBase - originalBase) > 0.01;
    const gstChanged = Math.abs(newGst - originalGst) > 0.01;

    if ((baseChanged || gstChanged) && !revisionReason) {
      return NextResponse.json(
        { error: 'Revision reason is mandatory when base amount or GST differs from the proforma invoice.' },
        { status: 400 }
      );
    }

    const baseVarianceNote = baseChanged
      ? ` | Base revised: ₹${originalBase.toLocaleString('en-IN')} → ₹${newBase.toLocaleString('en-IN')}`
      : '';
    const gstVariance = originalGst > 0 ? Math.abs(newGst - originalGst) / originalGst : 0;
    const gstVarianceNote = gstChanged
      ? ` | GST revised: ₹${originalGst.toLocaleString('en-IN')} → ₹${newGst.toLocaleString('en-IN')} (${(gstVariance * 100).toFixed(1)}%)`
      : '';

    await updateInvoiceDocumentStage(invoiceId, {
      taxInvoiceFileUrl,
      taxInvoiceFileName,
      taxInvoiceNumber,
      taxInvoiceDate,
      uploadedBy,
      revisedGstAmount,
      revisedAmount: baseChanged ? revisedAmount : undefined,
      revisionReason: (baseChanged || gstChanged) ? revisionReason : undefined,
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
      comments: `[TAX_INVOICE] Uploaded tax invoice #${taxInvoiceNumber} (proforma → tax_invoice). Base: ₹${newBase.toLocaleString('en-IN')}, GST: ₹${newGst.toLocaleString('en-IN')}, Total: ₹${newTotal.toLocaleString('en-IN')}${baseVarianceNote}${gstVarianceNote}${extensionNote}${statusNote}${revisionReason ? ` | Reason: ${revisionReason}` : ''}`,
    });

    return NextResponse.json({
      success: true,
      documentStage: 'tax_invoice',
      baseAmount: newBase,
      gstAmount: newGst,
      newTotal,
      extensionNeeded,
      statusChanged,
      baseChanged,
      gstChanged,
      originalBase: baseChanged ? originalBase : undefined,
      originalGst: gstChanged ? originalGst : undefined,
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
