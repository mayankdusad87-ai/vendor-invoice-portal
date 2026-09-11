import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { getApprovalHistory, getPaymentsByInvoiceId, getInvoiceById, getDeductions } from '@/lib/google-sheets';

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
    const [history, payments, invoice, deductions] = await Promise.all([
      getApprovalHistory(invoiceId),
      getPaymentsByInvoiceId(invoiceId),
      getInvoiceById(invoiceId),
      getDeductions(invoiceId),
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
    interface TrancheDeduction {
      deductionId: string;
      tdsAmount: number;
      retentionAmount: number;
      retentionStatus: 'held' | 'released';
      releasedAt: string;
      releasedBy: string;
      netPayable: number;       // approvedAmount - TDS - retention (if held)
      totalDeducted: number;    // TDS + retention (if held)
    }

    interface Tranche {
      trancheNumber: number;
      approvedAmount: number;
      cumulativeApproved: number;
      approvedBy: string;
      approvedDate: string;
      approvalComments: string;
      historyId: string;
      deduction: TrancheDeduction | null;
      payments: Array<{
        id: string;
        amount: number;
        basicAmount: number;
        gstAmount: number;
        utr: string;
        date: string;
        paidBy: string;
        notes: string;
        paymentType: string;
      }>;
      totalPaid: number;
      pendingAmount: number;
      status: 'fully_paid' | 'partially_paid' | 'pending';
    }

    // Sort payments by creation date
    const sortedPayments = [...payments].sort((a, b) =>
      (a.createdAt || '').localeCompare(b.createdAt || '')
    );

    // Assign payments to tranches chronologically:
    // Each tranche gets payments that fall between its approval date and the next
    const tranches: Tranche[] = [];
    let paymentIdx = 0;

    // Build a map of deductions keyed by approvalHistoryId for fast lookup
    const deductionMap = new Map<string, typeof deductions[0]>();
    for (const d of deductions) {
      deductionMap.set(d.approvalHistoryId, d);
    }

    for (let i = 0; i < approvalEvents.length; i++) {
      const event = approvalEvents[i];
      const nextEventDate = approvalEvents[i + 1]?.date || '9999-99-99';

      // Look up deduction for this tranche (matched by approval history ID)
      const ded = deductionMap.get(event.historyId);
      let trancheDeduction: TrancheDeduction | null = null;
      if (ded) {
        const tds = parseFloat(ded.tdsAmount) || 0;
        const retention = parseFloat(ded.retentionAmount) || 0;
        const heldRetention = ded.retentionStatus === 'held' ? retention : 0;
        trancheDeduction = {
          deductionId: ded.id,
          tdsAmount: tds,
          retentionAmount: retention,
          retentionStatus: ded.retentionStatus as 'held' | 'released',
          releasedAt: ded.releasedAt || '',
          releasedBy: ded.releasedBy || '',
          netPayable: Math.max(0, event.trancheAmount - tds - heldRetention),
          totalDeducted: tds + heldRetention,
        };
      }

      const tranche: Tranche = {
        trancheNumber: i + 1,
        approvedAmount: event.trancheAmount,
        cumulativeApproved: event.cumulativeApproved,
        approvedBy: event.approvedBy,
        approvedDate: event.date,
        approvalComments: event.comments,
        historyId: event.historyId,
        deduction: trancheDeduction,
        payments: [],
        totalPaid: 0,
        pendingAmount: event.trancheAmount,
        status: 'pending',
      };

      // Assign payments that were created between this approval and the next
      while (paymentIdx < sortedPayments.length) {
        const p = sortedPayments[paymentIdx];
        const pDate = p.createdAt || '';
        // If there's a next approval and this payment comes after it, stop
        if (pDate >= nextEventDate) break;

        tranche.payments.push({
          id: p.id,
          amount: parseFloat(p.amount) || 0,
          basicAmount: parseFloat(p.basicAmount) || 0,
          gstAmount: parseFloat(p.gstAmount) || 0,
          utr: p.utrReference,
          date: p.paymentDate,
          paidBy: p.paidBy,
          notes: p.notes,
          paymentType: p.paymentType || 'combined',
        });
        tranche.totalPaid += parseFloat(p.amount) || 0;
        paymentIdx++;
      }

      tranche.pendingAmount = Math.max(0, tranche.approvedAmount - tranche.totalPaid);
      tranche.status = tranche.totalPaid >= tranche.approvedAmount
        ? 'fully_paid'
        : tranche.totalPaid > 0
          ? 'partially_paid'
          : 'pending';

      tranches.push(tranche);
    }

    // Any remaining payments that weren't assigned to a tranche
    // (shouldn't happen normally, but handle gracefully)
    const unassignedPayments = sortedPayments.slice(paymentIdx).map(p => ({
      id: p.id,
      amount: parseFloat(p.amount) || 0,
      basicAmount: parseFloat(p.basicAmount) || 0,
      gstAmount: parseFloat(p.gstAmount) || 0,
      utr: p.utrReference,
      date: p.paymentDate,
      paidBy: p.paidBy,
      notes: p.notes,
      paymentType: p.paymentType || 'combined',
    }));

    // Summary — include deduction totals
    const totalApproved = approvalEvents.reduce((sum, e) => sum + e.trancheAmount, 0);
    const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalBasicPaid = payments.reduce((sum, p) => sum + (parseFloat(p.basicAmount) || 0), 0);
    const totalGSTPaid = payments.reduce((sum, p) => sum + (parseFloat(p.gstAmount) || 0), 0);

    // Deduction aggregates
    const totalTDS = tranches.reduce((sum, t) => sum + (t.deduction?.tdsAmount || 0), 0);
    const totalRetention = tranches.reduce((sum, t) => sum + (t.deduction?.retentionAmount || 0), 0);
    const totalRetentionHeld = tranches.reduce((sum, t) => {
      if (t.deduction && t.deduction.retentionStatus === 'held') return sum + t.deduction.retentionAmount;
      return sum;
    }, 0);
    const totalRetentionReleased = totalRetention - totalRetentionHeld;
    const totalDeducted = totalTDS + totalRetentionHeld;
    const netPayable = Math.max(0, totalApproved - totalDeducted);

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
        pendingPayment: Math.max(0, netPayable - totalPaid),
        remainingOnInvoice: Math.max(0, invoiceTotal - totalPaid),
        trancheCount: tranches.length,
        paymentCount: payments.length,
        // Deduction summary
        totalTDS,
        totalRetention,
        totalRetentionHeld,
        totalRetentionReleased,
        totalDeducted,
        netPayable,
      },
    });
  } catch (error) {
    console.error('Failed to build payment lifecycle:', error);
    return NextResponse.json({ error: 'Failed to build payment lifecycle' }, { status: 500 });
  }
}
