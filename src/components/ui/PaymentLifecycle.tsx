'use client';

import { useState, useEffect, useCallback } from 'react';

/* ───────── Types ───────── */

interface TranchePayment {
  id: string;
  amount: number;
  basicAmount: number;
  gstAmount: number;
  tdsAmount: number;
  retentionAmount: number;
  grossAmount: number;
  utr: string;
  date: string;
  paidBy: string;
  notes: string;
  paymentType: string;
}

interface Tranche {
  trancheNumber: number;
  approvedAmount: number;
  cumulativeApproved: number;
  approvedBy: string;
  approvedDate: string;
  approvalComments: string;
  historyId: string;
  payments: TranchePayment[];
  totalPaid: number;
  totalTDS: number;
  totalRetention: number;
  totalConsumed: number;
  pendingAmount: number;
  status: 'fully_paid' | 'partially_paid' | 'pending';
}

interface TimelineEvent {
  type: 'approval' | 'payment' | 'query' | 'query_accepted' | 'query_disagreed' | 'rejection' | 'resubmission';
  date: string;
  actor: string;
  amount: number;
  details: string;
  utr?: string;
}

interface LifecycleSummary {
  totalApproved: number;
  totalPaid: number;
  totalBasicPaid: number;
  totalGSTPaid: number;
  basicRemaining: number;
  gstRemaining: number;
  pendingPayment: number;
  remainingOnInvoice: number;
  trancheCount: number;
  paymentCount: number;
  totalTDS?: number;
  totalRetention?: number;
  totalConsumed?: number;
}

interface LifecycleData {
  invoiceId: string;
  invoiceNumber: string;
  vendorName: string;
  invoiceTotal: number;
  baseAmount: number;
  gstAmount: number;
  status: string;
  tranches: Tranche[];
  timeline: TimelineEvent[];
  summary: LifecycleSummary;
}

/* ───────── Helpers ───────── */

function formatCurrency(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function trancheStatusBadge(status: Tranche['status']) {
  switch (status) {
    case 'fully_paid':
      return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Paid</span>;
    case 'partially_paid':
      return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">◐ Partial</span>;
    case 'pending':
      return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">⏳ Pending</span>;
  }
}

function eventIcon(type: TimelineEvent['type']) {
  switch (type) {
    case 'approval': return { color: 'bg-emerald-500', icon: '✓' };
    case 'payment': return { color: 'bg-violet-500', icon: '₹' };
    case 'query': return { color: 'bg-amber-500', icon: '?' };
    case 'query_accepted': return { color: 'bg-orange-500', icon: '↩' };
    case 'query_disagreed': return { color: 'bg-blue-500', icon: '✗' };
    case 'rejection': return { color: 'bg-red-500', icon: '✗' };
    case 'resubmission': return { color: 'bg-indigo-500', icon: '↑' };
    default: return { color: 'bg-gray-400', icon: '·' };
  }
}

function eventLabel(type: TimelineEvent['type']) {
  switch (type) {
    case 'approval': return 'Approved';
    case 'payment': return 'Payment';
    case 'query': return 'Accounts Query';
    case 'query_accepted': return 'Query Accepted';
    case 'query_disagreed': return 'Query Disagreed';
    case 'rejection': return 'Rejected';
    case 'resubmission': return 'Resubmitted';
    default: return '';
  }
}

/* ───────── Component ───────── */

interface PaymentLifecycleProps {
  invoiceId: string;
  /** Which role is viewing — affects emphasis */
  role: 'approver' | 'accounts';
}

export default function PaymentLifecycle({ invoiceId, role }: PaymentLifecycleProps) {
  const [data, setData] = useState<LifecycleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'tranches' | 'timeline'>('tranches');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/lifecycle?invoiceId=${invoiceId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load');
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payment lifecycle');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* Loading state */
  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-violet-500 rounded-full animate-spin" />
          Loading payment lifecycle…
        </div>
      </div>
    );
  }

  /* Error state */
  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-600 mb-2">{error || 'No data'}</p>
        <button
          onClick={fetchData}
          className="text-xs px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 hover:bg-red-50 font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  /* No tranches yet */
  if (data.tranches.length === 0 && data.timeline.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-500">No payment activity yet.</p>
      </div>
    );
  }

  const { summary, tranches, timeline } = data;
  const hasDeductions = (summary.totalTDS || 0) > 0 || (summary.totalRetention || 0) > 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Header with summary */}
      <div className="bg-gradient-to-r from-violet-50 to-blue-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Payment Lifecycle
          </h4>
          {/* Tab toggle */}
          <div className="flex rounded-md border border-gray-300 overflow-hidden text-[10px] font-medium">
            <button
              onClick={() => setView('tranches')}
              className={`px-2.5 py-1 transition-colors ${view === 'tranches' ? 'bg-violet-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Tranches
            </button>
            <button
              onClick={() => setView('timeline')}
              className={`px-2.5 py-1 border-l border-gray-300 transition-colors ${view === 'timeline' ? 'bg-violet-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Timeline
            </button>
          </div>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-4 gap-2 text-[11px]">
          <div>
            <p className="text-gray-400">Invoice</p>
            <p className="font-bold text-gray-800">{formatCurrency(data.invoiceTotal)}</p>
          </div>
          <div>
            <p className="text-gray-400">Approved</p>
            <p className="font-bold text-emerald-700">{formatCurrency(summary.totalApproved)}</p>
          </div>
          <div>
            <p className="text-gray-400">Paid to Vendor</p>
            <p className="font-bold text-violet-700">{formatCurrency(summary.totalPaid)}</p>
          </div>
          <div>
            <p className="text-gray-400">{role === 'accounts' ? 'To Pay' : 'Pending'}</p>
            <p className={`font-bold ${summary.pendingPayment > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {formatCurrency(summary.pendingPayment)}
            </p>
          </div>
        </div>

        {/* Deduction summary row */}
        {hasDeductions && (
          <div className="mt-2 pt-2 border-t border-gray-200/50 grid grid-cols-4 gap-2 text-[10px]">
            <div>
              <p className="text-gray-400">Total TDS</p>
              <p className="font-semibold text-red-600">{formatCurrency(summary.totalTDS || 0)}</p>
            </div>
            <div>
              <p className="text-gray-400">Total Retention</p>
              <p className="font-semibold text-amber-600">{formatCurrency(summary.totalRetention || 0)}</p>
            </div>
            <div>
              <p className="text-gray-400">Total Consumed</p>
              <p className="font-semibold text-gray-700">{formatCurrency(summary.totalConsumed || 0)}</p>
            </div>
            <div>
              <p className="text-gray-400">Remaining</p>
              <p className="font-semibold text-blue-700">{formatCurrency(summary.pendingPayment)}</p>
            </div>
          </div>
        )}

        {/* Basic / GST breakdown */}
        {(summary.totalBasicPaid > 0 || summary.totalGSTPaid > 0) && (
          <div className="mt-2 pt-2 border-t border-gray-200/50 grid grid-cols-4 gap-2 text-[10px]">
            <div>
              <p className="text-gray-400">Basic</p>
              <p className="font-semibold text-gray-700">{formatCurrency(data.baseAmount)}</p>
            </div>
            <div>
              <p className="text-gray-400">GST</p>
              <p className="font-semibold text-gray-700">{formatCurrency(data.gstAmount)}</p>
            </div>
            <div>
              <p className="text-gray-400">Basic Paid</p>
              <p className="font-semibold text-violet-600">{formatCurrency(summary.totalBasicPaid)}</p>
            </div>
            <div>
              <p className="text-gray-400">GST Paid</p>
              <p className="font-semibold text-violet-600">{formatCurrency(summary.totalGSTPaid)}</p>
            </div>
          </div>
        )}
      </div>

      {/* ─── TRANCHES VIEW ─── */}
      {view === 'tranches' && (
        <div className="divide-y divide-gray-100">
          {tranches.map((tranche) => (
            <div key={tranche.trancheNumber} className="px-4 py-3">
              {/* Tranche header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500">
                    Tranche {tranche.trancheNumber}
                  </span>
                  {trancheStatusBadge(tranche.status)}
                </div>
                <span className="text-xs font-bold text-emerald-700">
                  {formatCurrency(tranche.approvedAmount)}
                </span>
              </div>

              {/* Approval info */}
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-2">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold">✓</span>
                <span>
                  Approved by <strong className="text-gray-700">{tranche.approvedBy}</strong>
                </span>
                <span className="text-gray-300">·</span>
                <span className="text-gray-400">{tranche.approvedDate}</span>
              </div>

              {/* Tranche deduction summary (aggregated from payments) */}
              {(tranche.totalTDS > 0 || tranche.totalRetention > 0) && (
                <div className="ml-2 pl-3 border-l-2 border-orange-200 mb-2">
                  <div className="rounded-md bg-orange-50/60 px-3 py-2">
                    <div className="grid grid-cols-4 gap-2 text-[10px]">
                      <div>
                        <p className="text-gray-400">TDS Deducted</p>
                        <p className="font-bold text-red-600">{formatCurrency(tranche.totalTDS)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Retention Held</p>
                        <p className="font-bold text-amber-600">{formatCurrency(tranche.totalRetention)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Net to Vendor</p>
                        <p className="font-bold text-violet-700">{formatCurrency(tranche.totalPaid)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Remaining</p>
                        <p className="font-bold text-blue-700">{formatCurrency(tranche.pendingAmount)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Payments under this tranche */}
              {tranche.payments.length > 0 ? (
                <div className="ml-2 pl-3 border-l-2 border-violet-200 space-y-2">
                  {tranche.payments.map((p) => (
                    <div key={p.id} className="rounded-md bg-violet-50/50 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-violet-100 text-violet-700 text-[9px] font-bold">₹</span>
                          <span className="text-xs font-bold text-violet-800">{formatCurrency(p.amount)}</span>
                          <span className="text-[10px] text-gray-400">net to vendor</span>
                        </div>
                        <span className="text-[10px] text-gray-400">{p.date}</span>
                      </div>
                      {/* Deduction breakdown per payment */}
                      {(p.tdsAmount > 0 || p.retentionAmount > 0) && (
                        <div className="flex items-center gap-2 mt-1 text-[10px]">
                          {p.tdsAmount > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">
                              TDS: {formatCurrency(p.tdsAmount)}
                            </span>
                          )}
                          {p.retentionAmount > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">
                              Retention: {formatCurrency(p.retentionAmount)}
                            </span>
                          )}
                          <span className="text-gray-400">
                            Gross: {formatCurrency(p.grossAmount)}
                          </span>
                        </div>
                      )}
                      {/* Basic/GST split */}
                      {p.basicAmount > 0 && p.gstAmount > 0 && (
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-400">
                          Basic: {formatCurrency(p.basicAmount)} + GST: {formatCurrency(p.gstAmount)}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-500">
                        <span>
                          Paid by <strong className="text-gray-600">{p.paidBy}</strong>
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="font-mono text-gray-500">UTR: {p.utr}</span>
                      </div>
                      {p.notes && (
                        <p className="mt-1 text-[10px] text-gray-400 italic">{p.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ml-2 pl-3 border-l-2 border-blue-200">
                  <p className="text-[11px] text-blue-600 font-medium py-1">
                    ⏳ Awaiting payment — {formatCurrency(tranche.pendingAmount)} pending
                  </p>
                </div>
              )}

              {/* Partial payment remaining */}
              {tranche.status === 'partially_paid' && (
                <div className="mt-2 ml-2 pl-3 border-l-2 border-amber-200">
                  <p className="text-[11px] text-amber-600 font-medium py-1">
                    ◐ {formatCurrency(tranche.pendingAmount)} remaining on this tranche
                  </p>
                </div>
              )}
            </div>
          ))}

          {tranches.length === 0 && (
            <div className="px-4 py-3 text-sm text-gray-500">
              No approval tranches recorded yet.
            </div>
          )}
        </div>
      )}

      {/* ─── TIMELINE VIEW ─── */}
      {view === 'timeline' && (
        <div className="px-4 py-3">
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[9px] top-3 bottom-3 w-0.5 bg-gray-200" />
            <div className="space-y-3">
              {timeline.map((event, idx) => {
                const ei = eventIcon(event.type);
                return (
                  <div key={idx} className="relative flex gap-3 items-start">
                    {/* Dot */}
                    <div className={`relative z-10 flex-shrink-0 w-5 h-5 rounded-full ${ei.color} flex items-center justify-center text-white text-[10px] font-bold mt-0.5`}>
                      {ei.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-gray-800">{eventLabel(event.type)}</span>
                          {event.amount > 0 && (
                            <span className={`text-xs font-bold ${event.type === 'payment' ? 'text-violet-700' : 'text-emerald-700'}`}>
                              {formatCurrency(event.amount)}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">{event.date}</span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        <span>{event.actor}</span>
                        {event.utr && (
                          <>
                            <span className="text-gray-300 mx-1">·</span>
                            <span className="font-mono text-gray-400">UTR: {event.utr}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Footer with counts */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
        <span>{summary.trancheCount} tranche{summary.trancheCount !== 1 ? 's' : ''} · {summary.paymentCount} payment{summary.paymentCount !== 1 ? 's' : ''}</span>
        <button
          onClick={fetchData}
          className="text-violet-600 hover:text-violet-800 font-medium"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
