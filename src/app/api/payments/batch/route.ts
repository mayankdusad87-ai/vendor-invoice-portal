import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import {
  getInvoiceById,
  getPaymentsByInvoiceId,
  addPayment,
  updateInvoiceStatus,
  addApprovalHistory,
  addDeduction,
  ConflictError,
  findPaymentByUtr,
  getPayments,
} from '@/lib/google-sheets';
import { sanitizeString, sanitizeDate, rateLimit, getRateLimitKey, rateLimitResponse } from '@/lib/security';

interface BatchInvoiceItem {
  invoiceId: string;
  amount: number;
  tdsAmount: number;
  retentionAmount: number;
  basicAmount: string;
  gstAmount: string;
  paymentType: string;
}

interface BatchResult {
  invoiceId: string;
  invoiceNumber: string;
  success: boolean;
  error?: string;
  paymentId?: string;
  newStatus?: string;
  amountPaid?: number;
}

/**
 * POST /api/payments/batch
 *
 * Record a single bank transfer (one UTR) that pays multiple invoices
 * for the same vendor in one shot. Each invoice gets its own payment
 * row, audit trail entry, and status update.
 *
 * Body: {
 *   utrReference: string,
 *   paymentDate: string,
 *   notes?: string,
 *   invoices: [{
 *     invoiceId, amount, tdsAmount?, retentionAmount?,
 *     basicAmount?, gstAmount?, paymentType?
 *   }]
 * }
 */
export async function POST(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  if (session.type !== 'accounts' && session.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: accounts role required' }, { status: 403 });
  }

  const rlKey = getRateLimitKey(request, 'batch-payment');
  const rlCheck = rateLimit(rlKey, { maxRequests: 5, windowMs: 60_000 });
  if (!rlCheck.allowed) return rateLimitResponse(rlCheck.retryAfterMs!);

  try {
    const body = await request.json();

    // ─── VALIDATE SHARED FIELDS ──────────────────────────────────────
    const utrReference = sanitizeString(body.utrReference, 100);
    const paymentDate = sanitizeDate(body.paymentDate);
    const notes = sanitizeString(body.notes, 500) || '';

    if (!utrReference || utrReference.length < 3) {
      return NextResponse.json({ error: 'UTR/Reference must be at least 3 characters' }, { status: 400 });
    }
    if (!paymentDate) {
      return NextResponse.json({ error: 'Payment date is required' }, { status: 400 });
    }

    const parsedDate = new Date(paymentDate);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: 'Invalid payment date' }, { status: 400 });
    }
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (parsedDate > thirtyDaysFromNow) {
      return NextResponse.json({ error: 'Payment date cannot be more than 30 days in the future' }, { status: 400 });
    }

    // ─── VALIDATE INVOICES ARRAY ─────────────────────────────────────
    if (!Array.isArray(body.invoices) || body.invoices.length === 0) {
      return NextResponse.json({ error: 'At least one invoice is required' }, { status: 400 });
    }
    if (body.invoices.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 invoices per batch' }, { status: 400 });
    }

    // Check for duplicate invoice IDs in the batch
    const invoiceIds = body.invoices.map((i: { invoiceId: string }) => sanitizeString(i.invoiceId, 50));
    const uniqueIds = new Set(invoiceIds);
    if (uniqueIds.size !== invoiceIds.length) {
      return NextResponse.json({ error: 'Duplicate invoice IDs in batch' }, { status: 400 });
    }

    // ─── UTR DUPLICATE CHECK (existing non-batch payments) ───────────
    // If this UTR was already used in a NON-batch context, block it.
    // We check all existing payments — if any use this UTR, reject unless
    // they all belong to the same batch (which can't exist yet since
    // batch payments are created atomically below).
    const existingWithUtr = await findPaymentByUtr(utrReference);
    if (existingWithUtr) {
      // UTR already used — check if it's from a previous batch with same UTR
      // (idempotent retry). For safety, reject and ask user to confirm.
      const allPayments = await getPayments();
      const matchingPayments = allPayments.filter(
        p => p.utrReference.toLowerCase() === utrReference.toLowerCase()
      );
      const matchingInvoiceIds = new Set(matchingPayments.map(p => p.invoiceId));
      const requestedIds = new Set(invoiceIds);

      // If exact same set of invoices — idempotent retry
      if (
        matchingInvoiceIds.size === requestedIds.size &&
        [...matchingInvoiceIds].every(id => requestedIds.has(id))
      ) {
        return NextResponse.json({
          success: true,
          idempotent: true,
          message: 'Batch payment already recorded with this UTR',
          results: matchingPayments.map(p => ({
            invoiceId: p.invoiceId,
            invoiceNumber: p.invoiceNumber,
            success: true,
            paymentId: p.id,
            amountPaid: parseFloat(p.amount) || 0,
          })),
          batchId: `BATCH-${utrReference}`,
        });
      }

      return NextResponse.json(
        { error: `UTR "${utrReference}" is already used for invoice ${existingWithUtr.invoiceNumber}. Each UTR can only be used once (use batch payment if paying multiple invoices with one UTR).` },
        { status: 400 }
      );
    }

    // ─── PARSE AND VALIDATE EACH INVOICE ─────────────────────────────
    const items: BatchInvoiceItem[] = [];
    let batchVendor = '';

    for (let i = 0; i < body.invoices.length; i++) {
      const entry = body.invoices[i];
      const invoiceId = sanitizeString(entry.invoiceId, 50);
      if (!invoiceId) {
        return NextResponse.json({ error: `Invoice at index ${i}: invoiceId is required` }, { status: 400 });
      }

      const amount = parseFloat(entry.amount);
      if (isNaN(amount) || amount <= 0) {
        return NextResponse.json({ error: `Invoice ${invoiceId}: amount must be a positive number` }, { status: 400 });
      }
      if (amount > 1_000_000_000) {
        return NextResponse.json({ error: `Invoice ${invoiceId}: amount exceeds maximum` }, { status: 400 });
      }

      const tdsAmount = parseFloat(entry.tdsAmount) || 0;
      const retentionAmount = parseFloat(entry.retentionAmount) || 0;
      if (tdsAmount < 0 || retentionAmount < 0) {
        return NextResponse.json({ error: `Invoice ${invoiceId}: TDS and retention cannot be negative` }, { status: 400 });
      }

      // Fetch and validate the invoice
      const invoice = await getInvoiceById(invoiceId);
      if (!invoice) {
        return NextResponse.json({ error: `Invoice ${invoiceId} not found` }, { status: 404 });
      }
      if (invoice.status !== 'approved' && invoice.status !== 'partially_paid') {
        return NextResponse.json(
          { error: `Invoice ${invoice.invoiceNumber}: cannot pay — status is "${invoice.status}"` },
          { status: 400 }
        );
      }

      // All invoices must be for the same vendor
      if (i === 0) {
        batchVendor = invoice.vendorName;
      } else if (invoice.vendorName !== batchVendor) {
        return NextResponse.json(
          { error: `All invoices must be for the same vendor. Expected "${batchVendor}", got "${invoice.vendorName}" for ${invoice.invoiceNumber}` },
          { status: 400 }
        );
      }

      // Proforma GST lock
      const gstPayAttempt = parseFloat(entry.gstAmount) || 0;
      if (invoice.documentStage === 'proforma' && gstPayAttempt > 0) {
        return NextResponse.json(
          { error: `Invoice ${invoice.invoiceNumber}: GST payment locked — upload tax invoice first` },
          { status: 400 }
        );
      }

      // Overpayment check
      const existingPayments = await getPaymentsByInvoiceId(invoiceId);
      const nonRelease = existingPayments.filter(p => p.paymentType !== 'retention_release');
      const totalConsumed = nonRelease.reduce((sum, p) =>
        sum + (parseFloat(p.amount) || 0) + (parseFloat(p.tdsAmount) || 0) + (parseFloat(p.retentionAmount) || 0)
      , 0);

      const baseAmt = parseFloat(invoice.amount) || 0;
      const gstAmt = parseFloat(invoice.gstAmount) || 0;
      const invoiceTotal = baseAmt + gstAmt;
      const approvedAmount = invoice.approvedAmount ? parseFloat(invoice.approvedAmount) || invoiceTotal : invoiceTotal;
      const remainingApproved = approvedAmount - totalConsumed;
      const grossAmount = amount + tdsAmount + retentionAmount;

      if (remainingApproved <= 0) {
        const totalPaid = existingPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        const remainingInvoice = invoiceTotal - totalPaid;
        if (remainingInvoice <= 0) {
          return NextResponse.json({ error: `Invoice ${invoice.invoiceNumber}: already fully paid` }, { status: 400 });
        }
        return NextResponse.json(
          { error: `Invoice ${invoice.invoiceNumber}: approved amount fully consumed. Approver must increase approved amount.` },
          { status: 400 }
        );
      }

      if (grossAmount > remainingApproved + 0.01) {
        return NextResponse.json(
          { error: `Invoice ${invoice.invoiceNumber}: gross payment ₹${grossAmount.toLocaleString('en-IN')} exceeds remaining approved ₹${remainingApproved.toLocaleString('en-IN')}` },
          { status: 400 }
        );
      }

      // Validate basic/GST split
      let basicAmount = '';
      let gstAmountStr = '';
      if (entry.basicAmount !== undefined || entry.gstAmount !== undefined) {
        const basic = parseFloat(entry.basicAmount) || 0;
        const gst = parseFloat(entry.gstAmount) || 0;
        if (basic < 0 || gst < 0) {
          return NextResponse.json({ error: `Invoice ${invoice.invoiceNumber}: basic/GST amounts cannot be negative` }, { status: 400 });
        }
        if (Math.abs((basic + gst) - amount) > 0.01) {
          return NextResponse.json(
            { error: `Invoice ${invoice.invoiceNumber}: basic + GST must equal total amount` },
            { status: 400 }
          );
        }
        basicAmount = String(basic);
        gstAmountStr = String(gst);
      }

      items.push({
        invoiceId,
        amount,
        tdsAmount,
        retentionAmount,
        basicAmount,
        gstAmount: gstAmountStr,
        paymentType: sanitizeString(entry.paymentType, 20) || 'combined',
      });
    }

    // ─── ALL VALIDATION PASSED — PROCESS PAYMENTS ────────────────────
    const paidBy = session.type === 'accounts' ? session.accountsName : 'Admin';
    const batchId = `BATCH-${Date.now()}`;
    const results: BatchResult[] = [];
    let totalBatchAmount = 0;

    for (const item of items) {
      try {
        const invoice = await getInvoiceById(item.invoiceId);
        if (!invoice) {
          results.push({ invoiceId: item.invoiceId, invoiceNumber: '?', success: false, error: 'Invoice not found' });
          continue;
        }

        // Record payment
        const payment = await addPayment({
          invoiceId: item.invoiceId,
          vendorName: invoice.vendorName,
          invoiceNumber: invoice.invoiceNumber,
          amount: String(item.amount),
          utrReference,
          paymentDate,
          paidBy,
          notes: `[Batch: ${batchId}] ${notes}`.trim(),
          paymentStatus: 'recorded',
          basicAmount: item.basicAmount,
          gstAmount: item.gstAmount,
          paymentType: item.paymentType,
          idempotencyKey: `${batchId}-${item.invoiceId}`,
          tdsAmount: item.tdsAmount > 0 ? String(item.tdsAmount) : '',
          retentionAmount: item.retentionAmount > 0 ? String(item.retentionAmount) : '',
        });

        // Re-read to get true totals after write
        const paymentsAfterWrite = await getPaymentsByInvoiceId(item.invoiceId);
        const trueTotalPaid = paymentsAfterWrite.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        const trueTotalConsumed = paymentsAfterWrite.reduce((sum, p) =>
          sum + (parseFloat(p.amount) || 0) + (parseFloat(p.tdsAmount) || 0) + (parseFloat(p.retentionAmount) || 0), 0);
        const baseAmt = parseFloat(invoice.amount) || 0;
        const gstAmt = parseFloat(invoice.gstAmount) || 0;
        const invoiceTotal = baseAmt + gstAmt;
        const newStatus = trueTotalConsumed >= invoiceTotal ? 'paid' : 'partially_paid';

        // Update invoice status
        const freshInvoice = await getInvoiceById(item.invoiceId);
        try {
          await updateInvoiceStatus(
            item.invoiceId,
            newStatus,
            undefined,
            undefined,
            undefined,
            freshInvoice?.updatedAt || invoice.updatedAt,
          );
        } catch (statusErr) {
          console.error(`Batch: status update failed for ${item.invoiceId}:`, statusErr);
        }

        // Audit trail
        let approvalHistoryId = '';
        try {
          const auditEntry = await addApprovalHistory({
            invoiceId: item.invoiceId,
            amount: String(item.amount),
            cumulativeTotal: String(trueTotalConsumed),
            approvedBy: `Accounts: ${paidBy}`,
            comments: `[BATCH PAYMENT] ₹${item.amount.toLocaleString('en-IN')} paid (UTR: ${utrReference}, Batch: ${batchId})${item.tdsAmount > 0 ? ` [TDS: ₹${item.tdsAmount.toLocaleString('en-IN')}]` : ''}${item.retentionAmount > 0 ? ` [Retention: ₹${item.retentionAmount.toLocaleString('en-IN')}]` : ''}${newStatus === 'paid' ? ' — Invoice fully paid' : ''} (${invoice.status} → ${newStatus})`,
          });
          approvalHistoryId = auditEntry.id;
        } catch (auditErr) {
          console.error(`Batch: audit failed for ${item.invoiceId}:`, auditErr);
        }

        // Record deductions if any
        if ((item.tdsAmount > 0 || item.retentionAmount > 0) && approvalHistoryId) {
          try {
            const trancheNumber = String(paymentsAfterWrite.filter(p => p.paymentType !== 'retention_release').length);
            await addDeduction({
              invoiceId: item.invoiceId,
              approvalHistoryId,
              trancheNumber,
              tdsAmount: item.tdsAmount > 0 ? String(item.tdsAmount) : '0',
              retentionAmount: item.retentionAmount > 0 ? String(item.retentionAmount) : '0',
              retentionStatus: item.retentionAmount > 0 ? 'held' : 'held',
              releasedAt: '',
              releasedBy: '',
              updatedBy: paidBy,
            });
          } catch (dedErr) {
            console.error(`Batch: deduction record failed for ${item.invoiceId}:`, dedErr);
          }
        }

        totalBatchAmount += item.amount;
        results.push({
          invoiceId: item.invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          success: true,
          paymentId: payment.id,
          newStatus,
          amountPaid: item.amount,
        });
      } catch (err) {
        const invoice = await getInvoiceById(item.invoiceId).catch(() => null);
        results.push({
          invoiceId: item.invoiceId,
          invoiceNumber: invoice?.invoiceNumber || '?',
          success: false,
          error: err instanceof ConflictError
            ? 'Invoice was modified by someone else — refresh and retry'
            : err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: failCount === 0,
      batchId,
      utrReference,
      vendor: batchVendor,
      totalAmount: totalBatchAmount,
      successCount,
      failCount,
      results,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    console.error('Batch payment error:', error);
    return NextResponse.json({ error: 'Failed to process batch payment' }, { status: 500 });
  }
}
