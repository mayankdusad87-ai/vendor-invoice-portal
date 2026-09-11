import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { getInvoices, getPaymentsByInvoiceId } from '@/lib/google-sheets';

/**
 * GET /api/deductions/vendor-summary
 *
 * Returns a per-vendor outstanding summary across all invoices.
 * Aggregates from payment records: each payment has amount (net to vendor),
 * tdsAmount, and retentionAmount. Gross consumed = amount + TDS + retention.
 * Outstanding = approved - grossConsumed.
 */
export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  // Only accounts and admin can view vendor summaries
  if (session.type !== 'accounts' && session.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: accounts role required' }, { status: 403 });
  }

  try {
    const invoices = await getInvoices();

    // Only consider invoices that have been approved or beyond
    const activeStatuses = ['approved', 'partially_paid', 'paid'];
    const activeInvoices = invoices.filter(inv => activeStatuses.includes(inv.status));

    // Aggregate by vendor
    interface VendorSummary {
      vendorName: string;
      invoiceCount: number;
      totalApproved: number;
      totalTDS: number;
      totalRetention: number;
      totalPaidToVendor: number;
      totalConsumed: number;
      outstanding: number;  // approved - consumed
    }

    const vendorMap = new Map<string, VendorSummary>();

    // Fetch all payments in parallel for active invoices
    const paymentPromises = activeInvoices.map(inv => getPaymentsByInvoiceId(inv.id));
    const allPayments = await Promise.all(paymentPromises);

    for (let i = 0; i < activeInvoices.length; i++) {
      const inv = activeInvoices[i];
      const payments = allPayments[i];

      const approved = parseFloat(inv.approvedAmount || '0') || 0;
      const paidToVendor = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const tds = payments.reduce((sum, p) => sum + (parseFloat(p.tdsAmount) || 0), 0);
      const retention = payments.reduce((sum, p) => sum + (parseFloat(p.retentionAmount) || 0), 0);
      const consumed = paidToVendor + tds + retention;

      const vendorKey = inv.vendorName.toLowerCase().trim();
      const existing = vendorMap.get(vendorKey) || {
        vendorName: inv.vendorName,
        invoiceCount: 0,
        totalApproved: 0,
        totalTDS: 0,
        totalRetention: 0,
        totalPaidToVendor: 0,
        totalConsumed: 0,
        outstanding: 0,
      };

      existing.invoiceCount += 1;
      existing.totalApproved += approved;
      existing.totalTDS += tds;
      existing.totalRetention += retention;
      existing.totalPaidToVendor += paidToVendor;
      existing.totalConsumed += consumed;
      existing.outstanding = existing.totalApproved - existing.totalConsumed;

      vendorMap.set(vendorKey, existing);
    }

    // Return sorted by outstanding (highest first), only vendors with outstanding > 0
    const vendors = Array.from(vendorMap.values())
      .filter(v => v.outstanding > 0.01 || v.totalRetention > 0)
      .sort((a, b) => b.outstanding - a.outstanding);

    return NextResponse.json({ vendors });
  } catch (error) {
    console.error('Failed to build vendor summary:', error);
    return NextResponse.json({ error: 'Failed to build vendor summary' }, { status: 500 });
  }
}
