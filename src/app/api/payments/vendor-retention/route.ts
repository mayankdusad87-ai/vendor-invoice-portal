import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { getInvoices, getPaymentsByInvoiceId, addPayment, updateInvoiceStatus, addApprovalHistory, getISTTimestamp } from '@/lib/google-sheets';

/**
 * GET /api/payments/vendor-retention?vendorName=X
 *
 * Returns per-invoice retention breakdown for a vendor:
 * - Which invoices have retention held
 * - How much is held vs already released per invoice
 * - Grouped by project for the UI
 */
export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  if (session.type !== 'accounts' && session.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: accounts role required' }, { status: 403 });
  }

  const vendorName = request.nextUrl.searchParams.get('vendorName');
  if (!vendorName) {
    return NextResponse.json({ error: 'vendorName is required' }, { status: 400 });
  }

  try {
    const invoices = await getInvoices();

    // Only approved / partially_paid / paid invoices for this vendor
    const activeStatuses = ['approved', 'partially_paid', 'paid'];
    const vendorInvoices = invoices.filter(
      inv => activeStatuses.includes(inv.status)
        && inv.vendorName.toLowerCase().trim() === vendorName.toLowerCase().trim()
    );

    // Fetch payments for all vendor invoices in parallel
    const paymentResults = await Promise.all(
      vendorInvoices.map(inv => getPaymentsByInvoiceId(inv.id))
    );

    interface InvoiceRetention {
      invoiceId: string;
      invoiceNumber: string;
      project: string;
      invoiceAmount: number;
      approvedAmount: number;
      retentionHeld: number;     // sum of retentionAmount from non-release payments
      retentionReleased: number; // sum of amount from retention_release payments
      netRetention: number;      // held - released (what can still be released)
    }

    const invoiceRetentions: InvoiceRetention[] = [];
    let totalHeld = 0;
    let totalReleased = 0;

    for (let i = 0; i < vendorInvoices.length; i++) {
      const inv = vendorInvoices[i];
      const payments = paymentResults[i];

      // Retention held = sum of retentionAmount from non-retention_release payments
      const held = payments
        .filter(p => p.paymentType !== 'retention_release')
        .reduce((sum, p) => sum + (parseFloat(p.retentionAmount) || 0), 0);

      // Retention released = sum of amount from retention_release payments
      const released = payments
        .filter(p => p.paymentType === 'retention_release')
        .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

      const net = Math.max(0, held - released);

      if (held > 0) {
        invoiceRetentions.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          project: inv.project || 'No Project',
          invoiceAmount: parseFloat(inv.amount) + (parseFloat(inv.gstAmount) || 0),
          approvedAmount: parseFloat(inv.approvedAmount || '0') || 0,
          retentionHeld: held,
          retentionReleased: released,
          netRetention: net,
        });
        totalHeld += held;
        totalReleased += released;
      }
    }

    return NextResponse.json({
      vendorName,
      totalRetentionHeld: totalHeld,
      totalRetentionReleased: totalReleased,
      totalNetRetention: Math.max(0, totalHeld - totalReleased),
      invoices: invoiceRetentions,
    });
  } catch (error) {
    console.error('Failed to fetch vendor retention:', error);
    return NextResponse.json({ error: 'Failed to fetch vendor retention details' }, { status: 500 });
  }
}

/**
 * POST /api/payments/vendor-retention
 *
 * Bulk retention release for a vendor. Creates per-invoice payment entries
 * with paymentType='retention_release'. This is the standard construction
 * industry pattern: vendor-level trigger, per-invoice accounting entries.
 *
 * Body: {
 *   releases: [{ invoiceId: string, amount: number }],
 *   utrReference: string,
 *   paymentDate: string,
 *   notes?: string
 * }
 */
export async function POST(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  if (session.type !== 'accounts' && session.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: accounts role required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { releases, utrReference, paymentDate, notes } = body;

    // Validate inputs
    if (!Array.isArray(releases) || releases.length === 0) {
      return NextResponse.json({ error: 'At least one invoice must be selected for retention release' }, { status: 400 });
    }
    if (!utrReference || typeof utrReference !== 'string' || utrReference.trim().length < 3) {
      return NextResponse.json({ error: 'UTR / Reference number is required (min 3 characters)' }, { status: 400 });
    }
    if (!paymentDate) {
      return NextResponse.json({ error: 'Payment date is required' }, { status: 400 });
    }

    const paidBy = session.type === 'accounts' ? session.accountsName : session.type === 'admin' ? session.username : 'accounts';
    const releaseNotes = (notes || 'Retention Release').trim();
    const results: Array<{ invoiceId: string; invoiceNumber: string; amount: number; paymentId: string }> = [];
    const errors: Array<{ invoiceId: string; error: string }> = [];

    for (const release of releases) {
      const { invoiceId, amount } = release;
      if (!invoiceId || !amount || amount <= 0) {
        errors.push({ invoiceId: invoiceId || 'unknown', error: 'Invalid release entry' });
        continue;
      }

      try {
        // Validate: fetch payments and check retention is actually held
        const payments = await getPaymentsByInvoiceId(invoiceId);
        const held = payments
          .filter(p => p.paymentType !== 'retention_release')
          .reduce((sum, p) => sum + (parseFloat(p.retentionAmount) || 0), 0);
        const alreadyReleased = payments
          .filter(p => p.paymentType === 'retention_release')
          .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        const netHeld = held - alreadyReleased;

        if (amount > netHeld + 0.01) {
          errors.push({
            invoiceId,
            error: `Release amount ₹${amount} exceeds held retention ₹${netHeld.toFixed(2)}`,
          });
          continue;
        }

        // Look up invoice for vendor/number info
        const invoices = await getInvoices();
        const invoice = invoices.find(inv => inv.id === invoiceId);
        if (!invoice) {
          errors.push({ invoiceId, error: 'Invoice not found' });
          continue;
        }

        // Create retention_release payment entry
        const payment = await addPayment({
          invoiceId,
          vendorName: invoice.vendorName,
          invoiceNumber: invoice.invoiceNumber,
          amount: String(amount),
          utrReference: utrReference.trim(),
          paymentDate,
          paidBy,
          notes: releaseNotes,
          paymentStatus: 'completed',
          basicAmount: String(amount), // entire release is basic (retention was from basic)
          gstAmount: '0',
          paymentType: 'retention_release',
          idempotencyKey: `ret_release_${invoiceId}_${Date.now()}`,
          tdsAmount: '0',
          retentionAmount: '0',
        });

        // Log to ApprovalHistory for audit
        await addApprovalHistory({
          invoiceId,
          amount: String(amount),
          cumulativeTotal: String(
            (parseFloat(invoice.approvedAmount || '0') || 0)
          ),
          approvedBy: paidBy,
          comments: `[PAYMENT] Retention Release ₹${amount.toLocaleString('en-IN')} (UTR: ${utrReference.trim()})`,
        });

        results.push({
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          amount,
          paymentId: payment.id,
        });
      } catch (err) {
        console.error(`Failed to release retention for ${invoiceId}:`, err);
        errors.push({ invoiceId, error: 'Failed to process release' });
      }
    }

    const totalReleased = results.reduce((sum, r) => sum + r.amount, 0);

    return NextResponse.json({
      success: true,
      totalReleased,
      releases: results,
      errors: errors.length > 0 ? errors : undefined,
      message: errors.length > 0
        ? `Released ₹${totalReleased.toLocaleString('en-IN')} across ${results.length} invoice(s). ${errors.length} failed.`
        : `Successfully released ₹${totalReleased.toLocaleString('en-IN')} across ${results.length} invoice(s).`,
    });
  } catch (error) {
    console.error('Failed to process retention release:', error);
    return NextResponse.json({ error: 'Failed to process retention release' }, { status: 500 });
  }
}
