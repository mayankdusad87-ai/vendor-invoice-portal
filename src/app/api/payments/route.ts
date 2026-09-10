import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { addPayment, getPaymentsByInvoiceId, getInvoiceById, updateInvoiceStatus } from '@/lib/google-sheets';
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
 * Body: { invoiceId, amount, utrReference, paymentDate, notes? }
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

    // Check payment doesn't exceed remaining approved amount (the payment cap)
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

    // Determine new status based on total paid vs total INVOICE amount (Amount + GST)
    const newTotalPaid = totalPaid + paymentAmount;
    const newStatus = newTotalPaid >= invoiceAmount ? 'paid' : 'partially_paid';

    // Record the payment with vendor name, invoice number, and status for easy sheet reading
    const payment = await addPayment({
      invoiceId,
      vendorName: invoice.vendorName,
      invoiceNumber: invoice.invoiceNumber,
      amount: String(paymentAmount),
      utrReference,
      paymentDate,
      paidBy,
      notes,
      paymentStatus: newStatus,
      basicAmount,
      gstAmount: gstAmountStr,
      paymentType,
    });

    // Update invoice status on the Invoices sheet
    await updateInvoiceStatus(invoiceId, newStatus, undefined, undefined);

    return NextResponse.json({
      success: true,
      payment,
      newStatus,
      totalPaid: newTotalPaid,
      remaining: Math.max(0, invoiceAmount - newTotalPaid),
      availableToPay: Math.max(0, approvedAmount - newTotalPaid),
      invoiceAmount,
      approvedAmount,
    });
  } catch (error) {
    console.error('Failed to record payment:', error);
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
  }
}
