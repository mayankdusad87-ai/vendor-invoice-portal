import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { getInvoices, getAllDeductions, getPaymentsByInvoiceId } from '@/lib/google-sheets';

/**
 * GET /api/deductions/vendor-summary
 *
 * Returns a per-vendor outstanding summary across all invoices.
 * For each vendor: total approved, total TDS, total retention (held/released),
 * total paid, and outstanding = approved - TDS - retentionHeld - paid.
 */
export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  // Only accounts and admin can view vendor summaries
  if (session.type !== 'accounts' && session.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: accounts role required' }, { status: 403 });
  }

  try {
    const [invoices, allDeductions] = await Promise.all([
      getInvoices(),
      getAllDeductions(),
    ]);

    // Only consider invoices that have been approved or beyond
    const activeStatuses = ['approved', 'partially_paid', 'paid'];
    const activeInvoices = invoices.filter(inv => activeStatuses.includes(inv.status));

    // Build deductions map: invoiceId → deduction entries
    const deductionsByInvoice = new Map<string, typeof allDeductions>();
    for (const d of allDeductions) {
      const existing = deductionsByInvoice.get(d.invoiceId) || [];
      existing.push(d);
      deductionsByInvoice.set(d.invoiceId, existing);
    }

    // Aggregate by vendor
    interface VendorSummary {
      vendorName: string;
      invoiceCount: number;
      totalApproved: number;
      totalTDS: number;
      totalRetentionHeld: number;
      totalRetentionReleased: number;
      totalPaid: number;
      outstanding: number;  // approved - TDS - retentionHeld - paid
    }

    const vendorMap = new Map<string, VendorSummary>();

    // Fetch all payments in parallel for active invoices
    const paymentPromises = activeInvoices.map(inv => getPaymentsByInvoiceId(inv.id));
    const allPayments = await Promise.all(paymentPromises);

    for (let i = 0; i < activeInvoices.length; i++) {
      const inv = activeInvoices[i];
      const payments = allPayments[i];
      const deductions = deductionsByInvoice.get(inv.id) || [];

      const approved = parseFloat(inv.approvedAmount || '0') || 0;
      const paid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const tds = deductions.reduce((sum, d) => sum + (parseFloat(d.tdsAmount) || 0), 0);
      const retHeld = deductions
        .filter(d => d.retentionStatus === 'held')
        .reduce((sum, d) => sum + (parseFloat(d.retentionAmount) || 0), 0);
      const retReleased = deductions
        .filter(d => d.retentionStatus === 'released')
        .reduce((sum, d) => sum + (parseFloat(d.retentionAmount) || 0), 0);

      const vendorKey = inv.vendorName.toLowerCase().trim();
      const existing = vendorMap.get(vendorKey) || {
        vendorName: inv.vendorName,
        invoiceCount: 0,
        totalApproved: 0,
        totalTDS: 0,
        totalRetentionHeld: 0,
        totalRetentionReleased: 0,
        totalPaid: 0,
        outstanding: 0,
      };

      existing.invoiceCount += 1;
      existing.totalApproved += approved;
      existing.totalTDS += tds;
      existing.totalRetentionHeld += retHeld;
      existing.totalRetentionReleased += retReleased;
      existing.totalPaid += paid;
      existing.outstanding = existing.totalApproved - existing.totalTDS - existing.totalRetentionHeld - existing.totalPaid;

      vendorMap.set(vendorKey, existing);
    }

    // Return sorted by outstanding (highest first), only vendors with outstanding > 0
    const vendors = Array.from(vendorMap.values())
      .filter(v => v.outstanding > 0.01 || v.totalRetentionHeld > 0)
      .sort((a, b) => b.outstanding - a.outstanding);

    return NextResponse.json({ vendors });
  } catch (error) {
    console.error('Failed to build vendor summary:', error);
    return NextResponse.json({ error: 'Failed to build vendor summary' }, { status: 500 });
  }
}
