import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import {
  getInvoiceById, updateInvoiceDocumentStage, addApprovalHistory,
} from '@/lib/google-sheets';
import { sanitizeString, sanitizeDate, sanitizeAmount } from '@/lib/security';

/**
 * PATCH /api/invoices/tax-invoice
 *
 * Upload a tax invoice against a proforma invoice.
 * Transitions documentStage from "proforma" → "tax_invoice", unlocking GST payments.
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

    // GST variance check — log but don't block
    const originalGst = parseFloat(invoice.gstAmount) || 0;
    const newGst = revisedGstAmount ? parseFloat(revisedGstAmount) || 0 : originalGst;
    const gstVariance = originalGst > 0 ? Math.abs(newGst - originalGst) / originalGst : 0;
    const varianceNote = gstVariance > 0.1
      ? ` | GST variance: ${(gstVariance * 100).toFixed(1)}% (₹${originalGst} → ₹${newGst})`
      : '';

    await updateInvoiceDocumentStage(invoiceId, {
      taxInvoiceFileUrl,
      taxInvoiceFileName,
      taxInvoiceNumber,
      taxInvoiceDate,
      uploadedBy,
      revisedGstAmount: revisedGstAmount || undefined,
    });

    // Log to ApprovalHistory
    await addApprovalHistory({
      invoiceId,
      amount: '0',
      cumulativeTotal: invoice.approvedAmount || '0',
      approvedBy: uploadedBy,
      comments: `[TAX_INVOICE] Uploaded tax invoice #${taxInvoiceNumber} (proforma → tax_invoice)${varianceNote}${revisionReason ? ` | Reason: ${revisionReason}` : ''}`,
    });

    return NextResponse.json({
      success: true,
      documentStage: 'tax_invoice',
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
