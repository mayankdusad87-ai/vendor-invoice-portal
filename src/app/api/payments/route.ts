import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { addPayment, getPaymentsByInvoiceId, getInvoiceById, updateInvoiceStatus } from '@/lib/google-sheets';
import { sanitizeString, sanitizeDate } from '@/lib/security';

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
    const invoiceAmount = invoice ? parseFloat(invoice.amount) || 0 : 0;
    // Use approved amount as payment cap; fall back to invoice amount if not set
    const approvedAmount = invoice?.approvedAmount ? parseFloat(invoice.approvedAmount) || invoiceAmount : invoiceAmount;
    const payableAmount = approvedAmount; // This is the cap for payments

    return NextResponse.json({
      payments,
      totalPaid,
      invoiceAmount,
      approvedAmount,
      remaining: Math.max(0, payableAmount - totalPaid),
      isFullyPaid: totalPaid >= payableAmount,
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

    // Check payment doesn't exceed remaining amount (capped at approved amount)
    const existingPayments = await getPaymentsByInvoiceId(invoiceId);
    const totalPaid = existingPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const invoiceAmount = parseFloat(invoice.amount) || 0;
    const approvedAmount = invoice.approvedAmount ? parseFloat(invoice.approvedAmount) || invoiceAmount : invoiceAmount;
    const payableAmount = approvedAmount; // Payment cap is the approved amount
    const remaining = payableAmount - totalPaid;

    if (remaining <= 0) {
      return NextResponse.json({ error: 'Invoice is already fully paid' }, { status: 400 });
    }

    if (paymentAmount > remaining + 0.01) { // small tolerance for floating point
      return NextResponse.json(
        { error: `Payment of ₹${paymentAmount.toLocaleString('en-IN')} exceeds remaining balance of ₹${remaining.toLocaleString('en-IN')}` },
        { status: 400 }
      );
    }

    // Determine who paid
    const paidBy = session.type === 'accounts' ? session.accountsName : 'Admin';

    // Determine new status based on total paid vs approved amount
    const newTotalPaid = totalPaid + paymentAmount;
    const newStatus = newTotalPaid >= payableAmount ? 'paid' : 'partially_paid';

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
    });

    // Update invoice status on the Invoices sheet
    await updateInvoiceStatus(invoiceId, newStatus, undefined, undefined);

    return NextResponse.json({
      success: true,
      payment,
      newStatus,
      totalPaid: newTotalPaid,
      remaining: Math.max(0, payableAmount - newTotalPaid),
      approvedAmount: payableAmount,
    });
  } catch (error) {
    console.error('Failed to record payment:', error);
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
  }
}
