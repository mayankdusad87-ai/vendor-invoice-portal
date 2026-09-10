import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { getPayments, getInvoices, getAllApprovalHistory } from '@/lib/google-sheets';

/**
 * GET /api/payments/bulk-summary — get payment totals for all invoices in one call.
 * Returns a map of invoiceId → { totalPaid, remaining, availableToPay, isFullyPaid, approvedCapReached, paymentCount, hasNewAuthorization, ... }
 * Used by the accounts dashboard to show paid/remaining columns without N+1 API calls.
 */
export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  // Accounts, admin, and approvers can use this bulk view
  if (session.type !== 'accounts' && session.type !== 'admin' && session.type !== 'approver') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Load all payments, invoices, and approval history in parallel (3 sheet reads, not N)
    const [allPayments, allInvoices, allApprovalHistory] = await Promise.all([
      getPayments(),
      getInvoices(),
      getAllApprovalHistory(),
    ]);

    // Group payments by invoice ID — track totals and latest timestamp
    const paymentsByInvoice: Record<string, number> = {};
    const paymentCountByInvoice: Record<string, number> = {};
    const latestPaymentAt: Record<string, string> = {};
    for (const p of allPayments) {
      const amt = parseFloat(p.amount) || 0;
      paymentsByInvoice[p.invoiceId] = (paymentsByInvoice[p.invoiceId] || 0) + amt;
      paymentCountByInvoice[p.invoiceId] = (paymentCountByInvoice[p.invoiceId] || 0) + 1;
      // Track latest payment timestamp
      if (!latestPaymentAt[p.invoiceId] || p.createdAt > latestPaymentAt[p.invoiceId]) {
        latestPaymentAt[p.invoiceId] = p.createdAt;
      }
    }

    // Group approval history by invoice ID — track latest entry
    const latestApprovalAt: Record<string, string> = {};
    const latestApprovalAmount: Record<string, string> = {};
    const latestApprovalBy: Record<string, string> = {};
    const approvalCountByInvoice: Record<string, number> = {};
    for (const ah of allApprovalHistory) {
      approvalCountByInvoice[ah.invoiceId] = (approvalCountByInvoice[ah.invoiceId] || 0) + 1;
      if (!latestApprovalAt[ah.invoiceId] || ah.createdAt > latestApprovalAt[ah.invoiceId]) {
        latestApprovalAt[ah.invoiceId] = ah.createdAt;
        latestApprovalAmount[ah.invoiceId] = ah.amount;
        latestApprovalBy[ah.invoiceId] = ah.approvedBy;
      }
    }

    // Build summary for each invoice the accounts team would see
    const summaries: Record<string, {
      totalPaid: number;
      remaining: number;
      availableToPay: number;
      isFullyPaid: boolean;
      approvedCapReached: boolean;
      paymentCount: number;
      hasNewAuthorization: boolean;
      newAuthorizationAmount?: string;
      newAuthorizationBy?: string;
    }> = {};

    for (const inv of allInvoices) {
      // Include invoices visible to accounts and approvers
      if (!['submitted', 'under_review', 'approved', 'partially_paid', 'paid', 'rejected'].includes(inv.status)) continue;

      const baseAmount = parseFloat(inv.amount) || 0;
      const gstAmount = parseFloat(inv.gstAmount) || 0;
      const invoiceTotal = baseAmount + gstAmount; // Total = Amount + GST
      const approvedAmount = inv.approvedAmount ? parseFloat(inv.approvedAmount) || invoiceTotal : invoiceTotal;
      const totalPaid = paymentsByInvoice[inv.id] || 0;
      const remaining = Math.max(0, invoiceTotal - totalPaid);
      const availableToPay = Math.max(0, approvedAmount - totalPaid);
      const paymentCount = paymentCountByInvoice[inv.id] || 0;

      // Detect new authorization: a new approval tranche was added AFTER the last payment
      // and there's money available to pay (meaning accounts hasn't acted on it yet)
      const lastPayment = latestPaymentAt[inv.id] || '';
      const lastApproval = latestApprovalAt[inv.id] || '';
      const hasNewAuthorization =
        availableToPay > 0 &&
        paymentCount > 0 &&
        lastApproval > lastPayment;

      summaries[inv.id] = {
        totalPaid,
        remaining,
        availableToPay,
        isFullyPaid: totalPaid >= invoiceTotal,
        approvedCapReached: availableToPay <= 0 && totalPaid < invoiceTotal,
        paymentCount,
        hasNewAuthorization,
        ...(hasNewAuthorization ? {
          newAuthorizationAmount: latestApprovalAmount[inv.id],
          newAuthorizationBy: latestApprovalBy[inv.id],
        } : {}),
      };
    }

    return NextResponse.json({ summaries });
  } catch (error) {
    console.error('Failed to fetch bulk payment summaries:', error);
    return NextResponse.json({ error: 'Failed to fetch payment summaries' }, { status: 500 });
  }
}
