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

    // Extract approval events from history
    // These are entries whose comments contain "→ approved" or "→ partially_paid"
    // and have a non-zero amount (the tranche amount, not cumulative)
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
      // Match approval entries: "→ approved" in comments
      if (entry.comments?.includes('→ approved') || entry.comments?.includes('→ partially_paid')) {
        const trancheAmt = parseFloat(entry.amount) || 0;
        const cumulative = parseFloat(entry.cumulativeTotal) || 0;
        if (trancheAmt > 0) {
          approvalEvents.push({
            date: entry.createdAt,
            approvedBy: entry.approvedBy,
            trancheAmount: trancheAmt,
            cumulativeApproved: cumulative,
            comments: entry.comments,
            historyId: entry.id,
          });
        }
      }
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

    // Summary
    const totalApproved = approvalEvents.reduce((sum, e) => sum + e.trancheAmount, 0);
    const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalBasicPaid = payments.reduce((sum, p) => sum + (parseFloat(p.basicAmount) || 0), 0);
    const totalGSTPaid = payments.reduce((sum, p) => sum + (parseFloat(p.gstAmount) || 0), 0);

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
        pendingPayment: Math.max(0, totalApproved - totalPaid),
        remainingOnInvoice: Math.max(0, invoiceTotal - totalPaid),
        trancheCount: tranches.length,
        paymentCount: payments.length,
      },
    });
  } catch (error) {
    console.error('Failed to build payment lifecycle:', error);
    return NextResponse.json({ error: 'Failed to build payment lifecycle' }, { status: 500 });
  }
}
