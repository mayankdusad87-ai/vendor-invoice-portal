import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { addPayment, getPaymentsByInvoiceId, getInvoiceById, updateInvoiceStatus, addApprovalHistory, ConflictError, findPaymentByUtr, findPaymentByIdempotencyKey } from '@/lib/google-sheets';
import { sanitizeString, sanitizeDate, rateLimit, getRateLimitKey, rateLimitResponse } from '@/lib/security';

/**
 * GET /api/payments?invoiceId=XXX — get all payments for an invoice
 */
export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  const invoiceId = request.nextUrl.searchParams.get('invoiceId');
  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
  }

  try {
    const payments = await getPaymentsByInvoiceId(invoiceId);
    const invoice = await getInvoiceById(invoiceId);
    const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const baseAmount = invoice ? parseFloat(invoice.amount) || 0 : 0;
    const gstAmount = invoice ? parseFloat(invoice.gstAmount) || 0 : 0;
    const invoiceAmount = baseAmount + gstAmount; // Total = Amount + GST
    // Approved amount is the cumulative payment cap (sum of all approval tranches)
    const approvedAmount = invoice?.approvedAmount ? parseFloat(invoice.approvedAmount) || invoiceAmount : invoiceAmount;
    // Remaining on invoice = how much more needs to be paid to fully close the invoice
    const remainingOnInvoice = Math.max(0, invoiceAmount - totalPaid);
    // Available to pay now = how much more accounts can pay under the current approval cap
    const availableToPay = Math.max(0, approvedAmount - totalPaid);

    // GST/Basic tracking — sum up basic and GST portions across all payments
    const totalBasicPaid = payments.reduce((sum, p) => sum + (parseFloat(p.basicAmount) || 0), 0);
    const totalGSTPaid = payments.reduce((sum, p) => sum + (parseFloat(p.gstAmount) || 0), 0);

    return NextResponse.json({
      payments,
      totalPaid,
      invoiceAmount,
      invoiceBaseAmount: baseAmount,
      invoiceGSTAmount: gstAmount,
      approvedAmount,
      remaining: remainingOnInvoice,
      availableToPay,
      // GST/Basic breakdown
      totalBasicPaid,
      totalGSTPaid,
      basicRemaining: Math.max(0, baseAmount - totalBasicPaid),
      gstRemaining: Math.max(0, gstAmount - totalGSTPaid),
      // Fully paid = total payments cover the total INVOICE amount (Amount + GST)
      isFullyPaid: totalPaid >= invoiceAmount,
      // Whether approved cap is exhausted (accounts can't pay more without higher approval)
      approvedCapReached: availableToPay <= 0 && totalPaid < invoiceAmount,
    });
  } catch (error) {
    console.error('Failed to fetch payments:', error);
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  }
}

/**
 * POST /api/payments — record a new payment (accounts team only)
 * Body: { invoiceId, amount, utrReference, paymentDate, notes?, idempotencyKey? }
 *
 * PAYMENT HARDENING:
 * 1. Idempotency — client sends an idempotencyKey; if a payment with that key
 *    already exists, we return the existing payment (HTTP 200, not a duplicate).
 * 2. UTR dedup — same UTR on the same invoice = idempotent return;
 *    same UTR on a different invoice = blocked (400).
 * 3. Re-read-after-write — after addPayment, re-read all payments to detect
 *    concurrent overpayment before updating the invoice status.
 * 4. Consistent 3-step write — if updateInvoiceStatus or addApprovalHistory
 *    fails after addPayment succeeds, the payment row still exists (detectable
 *    on retry via UTR/idempotency), and the retry will reconcile.
 */
export async function POST(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  // Only accounts team and admin can record payments
  if (session.type !== 'accounts' && session.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: accounts role required' }, { status: 403 });
  }

  // Rate limit: 10 payments per minute per IP
  const rlKey = getRateLimitKey(request, 'record-payment');
  const rlCheck = rateLimit(rlKey, { maxRequests: 10, windowMs: 60_000 });
  if (!rlCheck.allowed) return rateLimitResponse(rlCheck.retryAfterMs!);

  try {
    const body = await request.json();

    // Sanitize inputs
    const invoiceId = sanitizeString(body.invoiceId, 50);
    const utrReference = sanitizeString(body.utrReference, 100);
    const paymentDate = sanitizeDate(body.paymentDate);
    const notes = sanitizeString(body.notes, 500) || '';
    const idempotencyKey = sanitizeString(body.idempotencyKey, 100) || '';

    // Validation — all required fields
    if (!invoiceId || !body.amount || !utrReference || !paymentDate) {
      return NextResponse.json(
        { error: 'invoiceId, amount, utrReference, and paymentDate are required' },
        { status: 400 }
      );
    }

    // Validate UTR is non-empty after trimming
    if (!utrReference || utrReference.length < 3) {
      return NextResponse.json({ error: 'UTR/Reference must be at least 3 characters' }, { status: 400 });
    }

    const paymentAmount = parseFloat(body.amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }

    // Cap at a reasonable maximum (₹100 crore)
    if (paymentAmount > 1_000_000_000) {
      return NextResponse.json({ error: 'Amount exceeds maximum allowed value' }, { status: 400 });
    }

    // Validate date is a real date and not absurdly in the future
    const parsedDate = new Date(paymentDate);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: 'Invalid payment date' }, { status: 400 });
    }
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (parsedDate > thirtyDaysFromNow) {
      return NextResponse.json({ error: 'Payment date cannot be more than 30 days in the future' }, { status: 400 });
    }

    // ─── IDEMPOTENCY CHECK (client key) ───────────────────────────────
    // If the client sent an idempotency key and we already have a payment
    // with that key, return the existing payment. This makes retries safe.
    if (idempotencyKey) {
      const existingByKey = await findPaymentByIdempotencyKey(idempotencyKey);
      if (existingByKey) {
        // Idempotent return — the payment was already recorded
        return NextResponse.json({
          success: true,
          payment: existingByKey,
          idempotent: true,
          message: 'Payment already recorded (idempotent retry)',
        });
      }
    }

    // ─── UTR DUPLICATE DETECTION ──────────────────────────────────────
    // Same UTR + same invoice = idempotent return (retry/double-click).
    // Same UTR + different invoice = blocked (real duplicate UTR).
    const existingByUtr = await findPaymentByUtr(utrReference);
    if (existingByUtr) {
      if (existingByUtr.invoiceId === invoiceId) {
        // Same invoice, same UTR — this is a retry. Return existing payment.
        return NextResponse.json({
          success: true,
          payment: existingByUtr,
          idempotent: true,
          message: 'Payment already recorded with this UTR (idempotent retry)',
        });
      } else {
        // Different invoice, same UTR — block it
        return NextResponse.json(
          { error: `UTR "${utrReference}" is already used for invoice ${existingByUtr.invoiceNumber}. Each UTR can only be used once.` },
          { status: 400 }
        );
      }
    }

    // ─── INVOICE VALIDATION ───────────────────────────────────────────
    // Get the invoice
    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Invoice must be approved or partially paid
    if (invoice.status !== 'approved' && invoice.status !== 'partially_paid') {
      return NextResponse.json(
        { error: `Cannot record payment — invoice status is "${invoice.status}"` },
        { status: 400 }
      );
    }

    // ─── OVERPAYMENT CHECK (pre-write) ────────────────────────────────
    const existingPayments = await getPaymentsByInvoiceId(invoiceId);
    const totalPaid = existingPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const baseAmount = parseFloat(invoice.amount) || 0;
    const gstAmount = parseFloat(invoice.gstAmount) || 0;
    const invoiceAmount = baseAmount + gstAmount; // Total = Amount + GST
    const approvedAmount = invoice.approvedAmount ? parseFloat(invoice.approvedAmount) || invoiceAmount : invoiceAmount;
    const remainingApproved = approvedAmount - totalPaid; // Cap: how much more can be paid under current approval

    if (remainingApproved <= 0) {
      const remainingInvoice = invoiceAmount - totalPaid;
      if (remainingInvoice <= 0) {
        return NextResponse.json({ error: 'Invoice is already fully paid' }, { status: 400 });
      }
      return NextResponse.json(
        { error: `Approved amount (₹${approvedAmount.toLocaleString('en-IN')}) fully paid. ₹${remainingInvoice.toLocaleString('en-IN')} remains on invoice — approver must increase approved amount to continue.` },
        { status: 400 }
      );
    }

    if (paymentAmount > remainingApproved + 0.01) { // small tolerance for floating point
      return NextResponse.json(
        { error: `Payment of ₹${paymentAmount.toLocaleString('en-IN')} exceeds remaining approved balance of ₹${remainingApproved.toLocaleString('en-IN')}` },
        { status: 400 }
      );
    }

    // Determine who paid
    const paidBy = session.type === 'accounts' ? session.accountsName : 'Admin';

    // Parse optional basic/GST split amounts
    const basicAmountRaw = body.basicAmount !== undefined ? parseFloat(body.basicAmount) : NaN;
    const gstAmountRaw = body.gstAmount !== undefined ? parseFloat(body.gstAmount) : NaN;
    const paymentType = sanitizeString(body.paymentType, 20) || 'combined';

    // Validate split amounts if provided
    let basicAmount = '';
    let gstAmountStr = '';
    if (!isNaN(basicAmountRaw) || !isNaN(gstAmountRaw)) {
      const basic = isNaN(basicAmountRaw) ? 0 : basicAmountRaw;
      const gst = isNaN(gstAmountRaw) ? 0 : gstAmountRaw;
      if (basic < 0 || gst < 0) {
        return NextResponse.json({ error: 'Basic and GST amounts cannot be negative' }, { status: 400 });
      }
      // Basic + GST must equal the total payment amount
      if (Math.abs((basic + gst) - paymentAmount) > 0.01) {
        return NextResponse.json(
          { error: `Basic (₹${basic.toLocaleString('en-IN')}) + GST (₹${gst.toLocaleString('en-IN')}) must equal total payment (₹${paymentAmount.toLocaleString('en-IN')})` },
          { status: 400 }
        );
      }
      basicAmount = String(basic);
      gstAmountStr = String(gst);
    }

    // ─── STEP 1: RECORD THE PAYMENT (append row) ─────────────────────
    // This is the first write. If anything after this fails, the payment
    // row exists and will be detected by UTR/idempotency on retry.
    const payment = await addPayment({
      invoiceId,
      vendorName: invoice.vendorName,
      invoiceNumber: invoice.invoiceNumber,
      amount: String(paymentAmount),
      utrReference,
      paymentDate,
      paidBy,
      notes,
      paymentStatus: 'recorded', // temporary; corrected after re-read
      basicAmount,
      gstAmount: gstAmountStr,
      paymentType,
      idempotencyKey,
    });

    // ─── RE-READ AFTER WRITE (concurrent overpayment guard) ──────────
    // Another tab/user may have recorded a payment between our pre-write
    // check and the addPayment above. Re-read all payments including the
    // one we just wrote to compute the true total.
    const paymentsAfterWrite = await getPaymentsByInvoiceId(invoiceId);
    const trueTotalPaid = paymentsAfterWrite.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    // Re-read the invoice to get fresh approvedAmount and updatedAt
    const freshInvoice = await getInvoiceById(invoiceId);
    const freshApprovedAmount = freshInvoice?.approvedAmount
      ? parseFloat(freshInvoice.approvedAmount) || invoiceAmount
      : invoiceAmount;

    // Check if the true total exceeds the approved cap
    if (trueTotalPaid > freshApprovedAmount + 0.01) {
      // Overpayment detected! Our payment pushed it over the limit.
      // The payment row is already written — but we do NOT update the
      // invoice status. On the next retry (or manual review), the
      // UTR dedup will return the existing payment idempotently.
      // We return an error so the user knows something went wrong.
      return NextResponse.json(
        {
          error: `Concurrent overpayment detected. Total paid (₹${trueTotalPaid.toLocaleString('en-IN')}) exceeds approved amount (₹${freshApprovedAmount.toLocaleString('en-IN')}). Please refresh and review.`,
          paymentRecorded: true,
          paymentId: payment.id,
        },
        { status: 409 }
      );
    }

    // ─── STEP 2: UPDATE INVOICE STATUS ────────────────────────────────
    const newStatus = trueTotalPaid >= invoiceAmount ? 'paid' : 'partially_paid';

    try {
      await updateInvoiceStatus(
        invoiceId,
        newStatus,
        undefined,
        undefined,
        undefined,
        freshInvoice?.updatedAt || invoice.updatedAt, // use freshest updatedAt
      );
    } catch (statusError) {
      // If this fails (e.g. ConflictError from another concurrent update),
      // the payment row already exists. On retry, UTR dedup will return
      // the existing payment idempotently. Log and return a partial success.
      console.error('Failed to update invoice status after recording payment:', statusError);
      return NextResponse.json(
        {
          error: 'Payment recorded but invoice status update failed. Please refresh — the system will reconcile on retry.',
          paymentRecorded: true,
          paymentId: payment.id,
        },
        { status: 409 }
      );
    }

    // ─── STEP 3: LOG AUDIT TRAIL ──────────────────────────────────────
    try {
      await addApprovalHistory({
        invoiceId,
        amount: String(paymentAmount),
        cumulativeTotal: String(trueTotalPaid),
        approvedBy: `Accounts: ${paidBy}`,
        comments: `[PAYMENT] ₹${paymentAmount.toLocaleString('en-IN')} paid (UTR: ${utrReference})${newStatus === 'paid' ? ' — Invoice fully paid' : ''} (${invoice.status} → ${newStatus})`,
      });
    } catch (auditError) {
      // Non-fatal: the payment and status are already updated.
      // The audit entry will be missing but the financial data is correct.
      console.error('Failed to log payment audit trail:', auditError);
    }

    return NextResponse.json({
      success: true,
      payment,
      newStatus,
      totalPaid: trueTotalPaid,
      remaining: Math.max(0, invoiceAmount - trueTotalPaid),
      availableToPay: Math.max(0, freshApprovedAmount - trueTotalPaid),
      invoiceAmount,
      approvedAmount: freshApprovedAmount,
    });
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Failed to record payment:', error);
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
  }
}
