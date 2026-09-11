import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { getApprovalHistory, getPaymentsByInvoiceId, getInvoiceById } from '@/lib/google-sheets';

/**
 * GET /api/payments/lifecycle?invoiceId=XXX
 *
 * Returns a structured "tranche" view that correlates approval events with
 * payments, so the UI can show a clear timeline of:
 *   Tranche 1: Approved ₹X → Paid ₹Y (UTR, date, by whom)
 *   Tranche 2: Approved ₹Z → Pending
 *
 * This is reconstructed from ApprovalHistory (approval events marked with
 * "→ approved") and Payments data, matched chronologically.
 */
export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  const invoiceId = request.nextUrl.searchParams.get('invoiceId');
  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
  }

  try {
    const [history, payments, invoice] = await Promise.all([
      getApprovalHistory(invoiceId),
      getPaymentsByInvoiceId(invoiceId),
      getInvoiceById(invoiceId),
    ]);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const baseAmount = parseFloat(invoice.amount) || 0;
    const gstAmount = parseFloat(invoice.gstAmount) || 0;
    const invoiceTotal = baseAmount + gstAmount;

    // Extract approval events from history.
    // Strategy: any entry with a positive tranche amount that is NOT tagged as
    // a non-approval event ([PAYMENT], [ACCOUNTS_QUERY], etc.) is an approval.
    // This correctly handles:
    //   - Initial approval: "comment (submitted → approved)"
    //   - Additional tranche: "comment | +₹118 authorized (total: ₹218) (partially_paid → partially_paid)"
    //   - Old additional tranches (pre-fix): plain user comment with no marker
    // And correctly EXCLUDES:
    //   - Payments: "[PAYMENT] ₹100 paid (UTR: ...) (approved → partially_paid)"
    //     (which previously matched "→ partially_paid" and was misclassified as an approval)
    const NON_APPROVAL_TAGS = ['[PAYMENT]', '[ACCOUNTS_QUERY]', '[QUERY_ACCEPTED]', '[QUERY_DISAGREED]', '[REJECTED]', '[RESUBMITTED]'];

    interface ApprovalEvent {
      date: string;
      approvedBy: string;
      trancheAmount: number;
      cumulativeApproved: number;
      comments: string;
      historyId: string;
    }

    const approvalEvents: ApprovalEvent[] = [];
    for (const entry of history) {
      const trancheAmt = parseFloat(entry.amount) || 0;
      if (trancheAmt <= 0) continue; // Skip zero-amount entries (queries, rejections, resubmissions)

      // Skip entries tagged as non-approval events
      const isNonApproval = NON_APPROVAL_TAGS.some(tag => entry.comments?.includes(tag));
      if (isNonApproval) continue;

      const cumulative = parseFloat(entry.cumulativeTotal) || 0;
      approvalEvents.push({
        date: entry.createdAt,
        approvedBy: entry.approvedBy,
        trancheAmount: trancheAmt,
        cumulativeApproved: cumulative,
        comments: entry.comments,
        historyId: entry.id,
      });
    }

    // Extract other significant events (queries, rejections, resubmissions, payments)
    interface TimelineEvent {
      type: 'approval' | 'payment' | 'query' | 'query_accepted' | 'query_disagreed' | 'rejection' | 'resubmission';
      date: string;
      actor: string;
      amount: number;
      details: string;
      utr?: string;
      paymentId?: string;
      basicAmount?: number;
      gstAmount?: number;
    }

    const timeline: TimelineEvent[] = [];

    // Add all history entries as timeline events
    for (const entry of history) {
      const amt = parseFloat(entry.amount) || 0;
      if (entry.comments?.includes('[PAYMENT]')) {
        // Extract UTR from comment: "[PAYMENT] ₹X paid (UTR: ABC)"
        const utrMatch = entry.comments.match(/UTR:\s*([^)]+)/);
        timeline.push({
          type: 'payment',
          date: entry.createdAt,
          actor: entry.approvedBy,
          amount: amt,
          details: entry.comments,
          utr: utrMatch?.[1]?.trim(),
        });
      } else if (entry.comments?.includes('[ACCOUNTS_QUERY]')) {
        timeline.push({
          type: 'query',
          date: entry.createdAt,
          actor: entry.approvedBy,
          amount: 0,
          details: entry.comments,
        });
      } else if (entry.comments?.includes('[QUERY_ACCEPTED]')) {
        timeline.push({
          type: 'query_accepted',
          date: entry.createdAt,
          actor: entry.approvedBy,
          amount: 0,
          details: entry.comments,
        });
      } else if (entry.comments?.includes('[QUERY_DISAGREED]')) {
        timeline.push({
          type: 'query_disagreed',
          date: entry.createdAt,
          actor: entry.approvedBy,
          amount: 0,
          details: entry.comments,
        });
      } else if (entry.comments?.includes('[REJECTED]')) {
        timeline.push({
          type: 'rejection',
          date: entry.createdAt,
          actor: entry.approvedBy,
          amount: 0,
          details: entry.comments,
        });
      } else if (entry.comments?.includes('[RESUBMITTED]')) {
        timeline.push({
          type: 'resubmission',
          date: entry.createdAt,
          actor: entry.approvedBy,
          amount: 0,
          details: entry.comments,
        });
      } else if (entry.comments?.includes('→ approved') || entry.comments?.includes('→ partially_paid')) {
        timeline.push({
          type: 'approval',
          date: entry.createdAt,
          actor: entry.approvedBy,
          amount: amt,
          details: entry.comments,
        });
      }
    }

    // Build tranches: each approval event opens a tranche, payments fill it
    interface Tranche {
      trancheNumber: number;
      approvedAmount: number;
      cumulativeApproved: number;
      approvedBy: string;
      approvedDate: string;
      approvalComments: string;
      historyId: string;
      payments: Array<{
        id: string;
        amount: number;
        basicAmount: number;
        gstAmount: number;
        tdsAmount: number;
        retentionAmount: number;
        grossAmount: number;    // amount + TDS + retention
        utr: string;
        date: string;
        paidBy: string;
        notes: string;
        paymentType: string;
      }>;
      totalPaid: number;        // net to vendor
      totalTDS: number;
      totalRetention: number;
      totalConsumed: number;    // net + TDS + retention
      pendingAmount: number;
      status: 'fully_paid' | 'partially_paid' | 'pending';
    }

    // Fallback: if no approval events found in ApprovalHistory but the invoice
    // has an approvedAmount (e.g. initial approval predates the ApprovalHistory
    // feature), synthesize a single tranche from the invoice data.
    if (approvalEvents.length === 0 && invoice.approvedAmount) {
      const approvedAmt = parseFloat(invoice.approvedAmount) || 0;
      if (approvedAmt > 0) {
        approvalEvents.push({
          date: invoice.submittedAt || '',
          approvedBy: invoice.approvedBy || '',
          trancheAmount: approvedAmt,
          cumulativeApproved: approvedAmt,
          comments: invoice.approvalComments || `(${invoice.status})`,
          historyId: 'synthetic',
        });
        // Also add to timeline if not already there
        const hasApprovalInTimeline = timeline.some(e => e.type === 'approval');
        if (!hasApprovalInTimeline) {
          timeline.push({
            type: 'approval',
            date: invoice.submittedAt || '',
            actor: invoice.approvedBy || '',
            amount: approvedAmt,
            details: invoice.approvalComments || '',
          });
        }
      }
    }

    // Sort payments by creation date
    const sortedPayments = [...payments].sort((a, b) =>
      (a.createdAt || '').localeCompare(b.createdAt || '')
    );

    // Assign payments to tranches chronologically:
    // Each tranche gets payments that fall between its approval date and the next
    const tranches: Tranche[] = [];
    let paymentIdx = 0;

    for (let i = 0; i < approvalEvents.length; i++) {
      const event = approvalEvents[i];
      const nextEventDate = approvalEvents[i + 1]?.date || '9999-99-99';

      const tranche: Tranche = {
        trancheNumber: i + 1,
        approvedAmount: event.trancheAmount,
        cumulativeApproved: event.cumulativeApproved,
        approvedBy: event.approvedBy,
        approvedDate: event.date,
        approvalComments: event.comments,
        historyId: event.historyId,
        payments: [],
        totalPaid: 0,
        totalTDS: 0,
        totalRetention: 0,
        totalConsumed: 0,
        pendingAmount: event.trancheAmount,
        status: 'pending',
      };

      // Assign payments that were created between this approval and the next
      while (paymentIdx < sortedPayments.length) {
        const p = sortedPayments[paymentIdx];
        const pDate = p.createdAt || '';
        // If there's a next approval and this payment comes after it, stop
        if (pDate >= nextEventDate) break;

        const pNet = parseFloat(p.amount) || 0;
        const pTds = parseFloat(p.tdsAmount) || 0;
        const pRet = parseFloat(p.retentionAmount) || 0;
        const pGross = pNet + pTds + pRet;

        tranche.payments.push({
          id: p.id,
          amount: pNet,
          basicAmount: parseFloat(p.basicAmount) || 0,
          gstAmount: parseFloat(p.gstAmount) || 0,
          tdsAmount: pTds,
          retentionAmount: pRet,
          grossAmount: pGross,
          utr: p.utrReference,
          date: p.paymentDate,
          paidBy: p.paidBy,
          notes: p.notes,
          paymentType: p.paymentType || 'combined',
        });
        tranche.totalPaid += pNet;
        tranche.totalTDS += pTds;
        tranche.totalRetention += pRet;
        tranche.totalConsumed += pGross;
        paymentIdx++;
      }

      tranche.pendingAmount = Math.max(0, tranche.approvedAmount - tranche.totalConsumed);
      tranche.status = tranche.totalConsumed >= tranche.approvedAmount - 0.01
        ? 'fully_paid'
        : tranche.totalConsumed > 0
          ? 'partially_paid'
          : 'pending';

      tranches.push(tranche);
    }

    // Any remaining payments that weren't assigned to a tranche
    const unassignedPayments = sortedPayments.slice(paymentIdx).map(p => ({
      id: p.id,
      amount: parseFloat(p.amount) || 0,
      basicAmount: parseFloat(p.basicAmount) || 0,
      gstAmount: parseFloat(p.gstAmount) || 0,
      tdsAmount: parseFloat(p.tdsAmount) || 0,
      retentionAmount: parseFloat(p.retentionAmount) || 0,
      grossAmount: (parseFloat(p.amount) || 0) + (parseFloat(p.tdsAmount) || 0) + (parseFloat(p.retentionAmount) || 0),
      utr: p.utrReference,
      date: p.paymentDate,
      paidBy: p.paidBy,
      notes: p.notes,
      paymentType: p.paymentType || 'combined',
    }));

    // Summary — include deduction totals from payment records
    const totalApproved = approvalEvents.reduce((sum, e) => sum + e.trancheAmount, 0);
    const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalBasicPaid = payments.reduce((sum, p) => sum + (parseFloat(p.basicAmount) || 0), 0);
    const totalGSTPaid = payments.reduce((sum, p) => sum + (parseFloat(p.gstAmount) || 0), 0);

    // Deduction aggregates — from payment records
    const totalTDS = payments.reduce((sum, p) => sum + (parseFloat(p.tdsAmount) || 0), 0);
    const totalRetention = payments.reduce((sum, p) => sum + (parseFloat(p.retentionAmount) || 0), 0);
    const totalConsumed = totalPaid + totalTDS + totalRetention;
    const pendingPayment = Math.max(0, totalApproved - totalConsumed);

    return NextResponse.json({
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      vendorName: invoice.vendorName,
      invoiceTotal,
      baseAmount,
      gstAmount,
      status: invoice.status,
      tranches,
      unassignedPayments,
      timeline,
      summary: {
        totalApproved,
        totalPaid,
        totalBasicPaid,
        totalGSTPaid,
        basicRemaining: Math.max(0, baseAmount - totalBasicPaid),
        gstRemaining: Math.max(0, gstAmount - totalGSTPaid),
        pendingPayment,
        remainingOnInvoice: Math.max(0, invoiceTotal - totalPaid),
        trancheCount: tranches.length,
        paymentCount: payments.length,
        // Deduction totals
        totalTDS,
        totalRetention,
        totalConsumed,
      },
    });
  } catch (error) {
    console.error('Failed to build payment lifecycle:', error);
    return NextResponse.json({ error: 'Failed to build payment lifecycle' }, { status: 500 });
  }
}
