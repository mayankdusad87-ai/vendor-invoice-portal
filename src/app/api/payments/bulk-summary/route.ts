import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { getPayments, getInvoices } from '@/lib/google-sheets';

/**
 * GET /api/payments/bulk-summary — get payment totals for all invoices in one call.
 * Returns a map of invoiceId → { totalPaid, remaining, availableToPay, isFullyPaid, approvedCapReached, paymentCount }
 * Used by the accounts dashboard to show paid/remaining columns without N+1 API calls.
 */
export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  // Only accounts and admin need this bulk view
  if (session.type !== 'accounts' && session.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Load all payments and invoices in parallel (2 sheet reads, not N)
    const [allPayments, allInvoices] = await Promise.all([
      getPayments(),
      getInvoices(),
    ]);

    // Group payments by invoice ID
    const paymentsByInvoice: Record<string, number> = {};
    const paymentCountByInvoice: Record<string, number> = {};
    for (const p of allPayments) {
      const amt = parseFloat(p.amount) || 0;
      paymentsByInvoice[p.invoiceId] = (paymentsByInvoice[p.invoiceId] || 0) + amt;
      paymentCountByInvoice[p.invoiceId] = (paymentCountByInvoice[p.invoiceId] || 0) + 1;
    }

    // Build summary for each invoice the accounts team would see
    const summaries: Record<string, {
      totalPaid: number;
      remaining: number;
      availableToPay: number;
      isFullyPaid: boolean;
      approvedCapReached: boolean;
      paymentCount: number;
    }> = {};

    for (const inv of allInvoices) {
      // Accounts sees approved, partially_paid, paid, rejected
      if (!['approved', 'partially_paid', 'paid', 'rejected'].includes(inv.status)) continue;

      const invoiceAmount = parseFloat(inv.amount) || 0;
      const approvedAmount = inv.approvedAmount ? parseFloat(inv.approvedAmount) || invoiceAmount : invoiceAmount;
      const totalPaid = paymentsByInvoice[inv.id] || 0;
      const remaining = Math.max(0, invoiceAmount - totalPaid);
      const availableToPay = Math.max(0, approvedAmount - totalPaid);

      summaries[inv.id] = {
        totalPaid,
        remaining,
        availableToPay,
        isFullyPaid: totalPaid >= invoiceAmount,
        approvedCapReached: availableToPay <= 0 && totalPaid < invoiceAmount,
        paymentCount: paymentCountByInvoice[inv.id] || 0,
      };
    }

    return NextResponse.json({ summaries });
  } catch (error) {
    console.error('Failed to fetch bulk payment summaries:', error);
    return NextResponse.json({ error: 'Failed to fetch payment summaries' }, { status: 500 });
  }
}
