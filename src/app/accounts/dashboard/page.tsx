'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import StatusBadge from '@/components/ui/StatusBadge';
import TypeBadge from '@/components/ui/TypeBadge';
import PhotoViewer from '@/components/ui/PhotoViewer';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useAccountsAuth } from '@/hooks/useAccountsAuth';
import type { InvoiceStatus } from '@/lib/constants';

/* =====================================================================
   TYPES
   ===================================================================== */

interface Invoice {
  id: string;
  vendorName: string;
  invoiceDate: string;
  invoiceNumber: string;
  purpose: string;
  amount: string;
  remarks: string;
  invoiceFileUrl: string;
  invoiceFileName: string;
  workPhotos: string;
  measurementSheetUrl: string;
  measurementSheetName: string;
  status: InvoiceStatus;
  approvalComments: string;
  approvedBy: string;
  submittedAt: string;
  invoiceType: string;
  submittedBy: string;
  poNumber?: string;
  challanUrl?: string;
  challanName?: string;
  approvedAmount?: string;
}

interface Payment {
  id: string;
  invoiceId: string;
  amount: string;
  utrReference: string;
  paymentDate: string;
  paidBy: string;
  notes: string;
  createdAt: string;
}

interface PaymentSummary {
  payments: Payment[];
  totalPaid: number;
  invoiceAmount: number;
  approvedAmount: number;
  remaining: number;       // invoice remaining (invoiceAmount - totalPaid)
  availableToPay: number;  // cap remaining (approvedAmount - totalPaid)
  isFullyPaid: boolean;
  approvedCapReached?: boolean;
}

/* =====================================================================
   HELPERS
   ===================================================================== */

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function statusBorderColor(status: InvoiceStatus): string {
  switch (status) {
    case 'approved': return 'border-l-emerald-500';
    case 'partially_paid': return 'border-l-violet-500';
    case 'paid': return 'border-l-emerald-400';
    case 'rejected': return 'border-l-red-500';
    default: return 'border-l-gray-300';
  }
}

function formatCurrency(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '₹0';
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function isImageUrl(url: string, fileName?: string): boolean {
  if (!url) return false;
  // R2 proxy URLs
  if (url.startsWith('/api/r2/')) {
    return /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(url);
  }
  if (url.startsWith('/api/files/')) {
    if (fileName) return /\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(fileName);
    return false;
  }
  if (/\.(jpg|jpeg|png|webp|gif|heic)(\?|$)/i.test(url)) return true;
  return false;
}

function getPreviewUrl(url: string): string | null {
  if (!url) return null;
  if (url.startsWith('/api/files/')) return url;
  if (url.startsWith('/api/r2/')) return url;
  const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)\//);
  if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
  return null;
}

/* =====================================================================
   PAYMENT MODAL (light theme)
   ===================================================================== */

function PaymentModal({
  invoice,
  paymentSummary,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  invoice: Invoice;
  paymentSummary: PaymentSummary | null;
  onClose: () => void;
  onSubmit: (data: { amount: string; utrReference: string; paymentDate: string; notes: string }) => void;
  isSubmitting: boolean;
}) {
  const [amount, setAmount] = useState('');
  const [utrReference, setUtrReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // remaining = how much is left on the invoice (invoice - paid)
  const invoiceRemaining = paymentSummary ? paymentSummary.remaining : parseFloat(invoice.amount) || 0;
  // availableToPay = how much accounts can pay now (approved cap - paid)
  const availableToPay = paymentSummary ? (paymentSummary.availableToPay ?? paymentSummary.remaining) : parseFloat(invoice.approvedAmount || invoice.amount) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Record Payment"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Record Payment</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="Close">×</button>
        </div>

        {/* Invoice summary */}
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-500">{invoice.vendorName}</span>
            <TypeBadge type={invoice.invoiceType} />
          </div>
          <p className="text-sm font-medium text-gray-900">#{invoice.invoiceNumber} — {invoice.purpose}</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm text-gray-500">Invoice Amount</span>
            <span className="text-sm text-gray-900">{formatCurrency(invoice.amount)}</span>
          </div>
          {paymentSummary && paymentSummary.approvedAmount !== paymentSummary.invoiceAmount && (
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm font-medium text-emerald-700">Approved Amount</span>
              <span className="font-bold text-emerald-700">{formatCurrency(paymentSummary.approvedAmount)}</span>
            </div>
          )}
          {!(paymentSummary && paymentSummary.approvedAmount !== paymentSummary.invoiceAmount) && (
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm text-gray-500">Approved Amount</span>
              <span className="font-bold text-gray-900">{formatCurrency(invoice.approvedAmount || invoice.amount)}</span>
            </div>
          )}
          {paymentSummary && paymentSummary.totalPaid > 0 && (
            <>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-gray-500">Already Paid</span>
                <span className="text-sm text-emerald-600">{formatCurrency(paymentSummary.totalPaid)}</span>
              </div>
              <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-100">
                <span className="text-sm font-medium text-gray-600">Invoice Remaining</span>
                <span className="font-bold text-violet-600">{formatCurrency(invoiceRemaining)}</span>
              </div>
              {availableToPay !== invoiceRemaining && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm text-amber-600">Available to Pay Now</span>
                  <span className="font-bold text-amber-600">{formatCurrency(availableToPay)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Payment form */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Payment Amount <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={availableToPay}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                placeholder="Enter payment amount"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Invoice remaining: {formatCurrency(invoiceRemaining)}
              {availableToPay !== invoiceRemaining && (
                <span className="text-amber-500"> · Available now: {formatCurrency(availableToPay)}</span>
              )}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              UTR / Reference Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={utrReference}
              onChange={(e) => setUtrReference(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              placeholder="Enter UTR or payment reference"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Payment Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={2}
              placeholder="GST payment, advance, etc."
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]">
            Cancel
          </button>
          <button
            onClick={() => onSubmit({ amount, utrReference, paymentDate, notes })}
            disabled={isSubmitting || !amount || !utrReference || !paymentDate || parseFloat(amount) <= 0 || parseFloat(amount) > availableToPay + 0.01}
            className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing…
              </span>
            ) : (
              `Pay ${amount ? formatCurrency(amount) : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   REJECT MODAL (light theme)
   ===================================================================== */

function RejectModal({
  invoice,
  rejectionReasons,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  invoice: Invoice;
  rejectionReasons: { id: string; reason: string }[];
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isSubmitting: boolean;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Reject Invoice"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-red-600">Reject Invoice</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="Close">×</button>
        </div>

        <p className="text-sm text-gray-600 mb-3">
          This will reject <strong className="text-gray-900">#{invoice.invoiceNumber}</strong> from {invoice.vendorName} back to the approver for correction.
        </p>

        {/* Rejection reasons from database */}
        {rejectionReasons.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {rejectionReasons.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setReason(r.reason)}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                  reason === r.reason
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700'
                }`}
              >
                {r.reason}
              </button>
            ))}
          </div>
        )}

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
          rows={3}
          placeholder="Describe the issue with this invoice…"
        />

        <div className="flex items-center gap-3 mt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]">
            Cancel
          </button>
          <button
            onClick={() => onSubmit(reason)}
            disabled={isSubmitting || !reason.trim()}
            className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {isSubmitting ? 'Rejecting…' : 'Reject Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   PAYMENT HISTORY MODAL (light theme)
   ===================================================================== */

function PaymentHistory({
  invoice,
  payments,
  onClose,
}: {
  invoice: Invoice;
  payments: PaymentSummary | null;
  onClose: () => void;
}) {
  if (!payments) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Payment History"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Payment History</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="Close">×</button>
        </div>

        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 mb-4">
          <p className="text-sm font-medium text-gray-900">
            #{invoice.invoiceNumber} — {invoice.vendorName}
          </p>
          <div className={`grid ${payments.approvedAmount !== payments.invoiceAmount ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'} gap-2 mt-2`}>
            <div>
              <p className="text-xs text-gray-400">Invoice Amount</p>
              <p className="text-sm font-bold text-gray-900">{formatCurrency(payments.invoiceAmount)}</p>
            </div>
            {payments.approvedAmount !== payments.invoiceAmount && (
              <div>
                <p className="text-xs text-emerald-600">Approved Amount</p>
                <p className="text-sm font-bold text-emerald-700">{formatCurrency(payments.approvedAmount)}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400">Total Paid</p>
              <p className="text-sm font-bold text-emerald-600">{formatCurrency(payments.totalPaid)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Remaining</p>
              <p className={`text-sm font-bold ${payments.remaining === 0 ? 'text-emerald-600' : 'text-violet-600'}`}>
                {formatCurrency(payments.remaining)}
              </p>
            </div>
          </div>
          {/* Progress bar — based on invoice amount (approved amount is just a payment cap) */}
          <div className="mt-3 h-2 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${Math.min(100, (payments.totalPaid / payments.invoiceAmount) * 100)}%` }}
            />
          </div>
        </div>

        {payments.payments.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <p className="text-2xl mb-1">💸</p>
            <p className="text-sm">No payments recorded yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.payments.map((p, i) => (
              <div
                key={p.id}
                className="p-3 rounded-lg border border-gray-100 bg-gray-50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">Payment #{i + 1}</span>
                  <span className="font-bold text-emerald-600">{formatCurrency(p.amount)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div>
                    <span className="text-gray-400">UTR: </span>
                    <span className="text-gray-700 font-mono">{p.utrReference}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Date: </span>
                    <span className="text-gray-700">{formatDate(p.paymentDate)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Paid by: </span>
                    <span className="text-gray-700">{p.paidBy}</span>
                  </div>
                  {p.notes && (
                    <div className="col-span-2">
                      <span className="text-gray-400">Notes: </span>
                      <span className="text-gray-700">{p.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   FILE VIEWER MODAL (light theme)
   ===================================================================== */

function FileViewerModal({
  title,
  url,
  fileName,
  onClose,
}: {
  title: string;
  url: string;
  fileName?: string;
  onClose: () => void;
}) {
  const isImage = isImageUrl(url, fileName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col p-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="Close">×</button>
        </div>
        <div className="flex-1 overflow-auto bg-gray-50 rounded-lg min-h-[300px]">
          {isImage ? (
            <img src={url} alt={title} className="w-full h-auto object-contain" />
          ) : (
            <iframe
              src={url}
              className="w-full h-[70vh] border-0"
              title={title}
              sandbox="allow-same-origin"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   MAIN DASHBOARD (light theme — matching approver)
   ===================================================================== */

type FilterTab = 'all' | 'approved' | 'partially_paid' | 'paid' | 'rejected';

export default function AccountsDashboard() {
  const { accountsName, isReady, logout } = useAccountsAuth();

  // Data
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters & search
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'vendor'>('date');

  // Modals
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [rejectInvoice, setRejectInvoice] = useState<Invoice | null>(null);
  const [historyInvoice, setHistoryInvoice] = useState<Invoice | null>(null);
  const [fileViewer, setFileViewer] = useState<{ title: string; url: string; fileName?: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Payment data cache
  const [paymentCache, setPaymentCache] = useState<Record<string, PaymentSummary>>({});

  // Rejection reasons from database
  const [rejectionReasons, setRejectionReasons] = useState<{ id: string; reason: string }[]>([]);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch('/api/invoices');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch {
      setError('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch payment summary for an invoice
  const fetchPaymentSummary = useCallback(async (invoiceId: string): Promise<PaymentSummary | null> => {
    if (paymentCache[invoiceId]) return paymentCache[invoiceId];
    try {
      const res = await fetch(`/api/payments?invoiceId=${invoiceId}`);
      if (!res.ok) return null;
      const data = await res.json();
      setPaymentCache((prev) => ({ ...prev, [invoiceId]: data }));
      return data;
    } catch {
      return null;
    }
  }, [paymentCache]);

  const fetchRejectionReasons = useCallback(async () => {
    try {
      const res = await fetch('/api/rejection-reasons?active=true');
      const data = await res.json();
      if (res.ok) setRejectionReasons(data.reasons || []);
    } catch {
      console.error('Failed to fetch rejection reasons');
    }
  }, []);

  useEffect(() => {
    if (isReady) {
      fetchInvoices();
      fetchRejectionReasons();
    }
  }, [isReady, fetchInvoices, fetchRejectionReasons]);

  // Filter & sort
  const filteredInvoices = useMemo(() => {
    let filtered = invoices;

    if (activeTab !== 'all') {
      filtered = filtered.filter((inv) => inv.status === activeTab);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (inv) =>
          inv.vendorName.toLowerCase().includes(q) ||
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.purpose.toLowerCase().includes(q) ||
          (inv.poNumber && inv.poNumber.toLowerCase().includes(q))
      );
    }

    const sorted = [...filtered];
    switch (sortBy) {
      case 'amount':
        sorted.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
        break;
      case 'vendor':
        sorted.sort((a, b) => a.vendorName.localeCompare(b.vendorName));
        break;
      default:
        sorted.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    }

    return sorted;
  }, [invoices, activeTab, searchQuery, sortBy]);

  // Stats
  const stats = useMemo(() => {
    const approved = invoices.filter((i) => i.status === 'approved');
    const partiallyPaid = invoices.filter((i) => i.status === 'partially_paid');
    const paid = invoices.filter((i) => i.status === 'paid');
    const outstanding = [...approved, ...partiallyPaid];
    const sumAmount = (arr: Invoice[]) => arr.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    return {
      approvedCount: approved.length,
      approvedAmount: sumAmount(approved),
      partiallyPaidCount: partiallyPaid.length,
      partiallyPaidAmount: sumAmount(partiallyPaid),
      paidCount: paid.length,
      paidAmount: sumAmount(paid),
      outstandingAmount: sumAmount(outstanding),
    };
  }, [invoices]);

  // Tab counts
  const tabCounts = useMemo(() => ({
    all: invoices.length,
    approved: invoices.filter((i) => i.status === 'approved').length,
    partially_paid: invoices.filter((i) => i.status === 'partially_paid').length,
    paid: invoices.filter((i) => i.status === 'paid').length,
    rejected: invoices.filter((i) => i.status === 'rejected').length,
  }), [invoices]);

  // Payment submission
  const handleRecordPayment = useCallback(
    async (data: { amount: string; utrReference: string; paymentDate: string; notes: string }) => {
      if (!paymentInvoice) return;
      setIsSubmitting(true);
      try {
        const res = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: paymentInvoice.id,
            amount: data.amount,
            utrReference: data.utrReference,
            paymentDate: data.paymentDate,
            notes: data.notes,
          }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to record payment');

        setToast({
          message: result.newStatus === 'paid'
            ? `Payment recorded — invoice fully paid!`
            : `Payment of ${formatCurrency(data.amount)} recorded`,
          type: 'success',
        });
        setPaymentInvoice(null);
        setPaymentCache((prev) => {
          const next = { ...prev };
          delete next[paymentInvoice.id];
          return next;
        });
        fetchInvoices();
      } catch (err) {
        setToast({ message: err instanceof Error ? err.message : 'Failed to record payment', type: 'error' });
      } finally {
        setIsSubmitting(false);
      }
    },
    [paymentInvoice, fetchInvoices]
  );

  // Rejection submission
  const handleReject = useCallback(
    async (reason: string) => {
      if (!rejectInvoice) return;
      setIsSubmitting(true);
      try {
        const res = await fetch('/api/invoices/accounts-reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId: rejectInvoice.id, reason }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to reject');

        setToast({ message: 'Invoice rejected — sent back to approver', type: 'error' });
        setRejectInvoice(null);
        fetchInvoices();
      } catch (err) {
        setToast({ message: err instanceof Error ? err.message : 'Failed to reject invoice', type: 'error' });
      } finally {
        setIsSubmitting(false);
      }
    },
    [rejectInvoice, fetchInvoices]
  );

  // Open payment modal (pre-fetch payment data)
  const openPaymentModal = useCallback(
    async (inv: Invoice) => {
      setPaymentInvoice(inv);
      await fetchPaymentSummary(inv.id);
    },
    [fetchPaymentSummary]
  );

  // Open history modal
  const openHistoryModal = useCallback(
    async (inv: Invoice) => {
      setHistoryInvoice(inv);
      await fetchPaymentSummary(inv.id);
    },
    [fetchPaymentSummary]
  );

  if (!isReady) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] max-w-sm px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all animate-slide-in ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {toast.message}
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Accounts Dashboard</h1>
              <p className="text-xs text-gray-500">Welcome back, {accountsName}</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Search (desktop) */}
              <div className="relative hidden sm:block">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search invoices..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-52 min-h-[40px]"
                  aria-label="Search invoices"
                />
              </div>
              {/* Logout */}
              <button
                onClick={logout}
                className="w-9 h-9 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500 hover:text-red-500 hover:border-red-200 transition-colors"
                aria-label="Log out"
                title="Logout"
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
              </button>
            </div>
          </div>
          {/* Mobile search */}
          <div className="mt-2 sm:hidden">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search invoices..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full min-h-[44px]"
                aria-label="Search invoices"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 fade-in">
        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* ── Stat Cards — white with colored bottom borders ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {/* Pending Payment */}
          <button
            onClick={() => setActiveTab('approved')}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden group hover:shadow-md ${
              activeTab === 'approved' ? 'ring-2 ring-amber-500 ring-offset-1' : ''
            }`}
            aria-label={`Pending payment: ${stats.approvedCount}`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-gray-500">Pending payment</p>
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-amber-600 mt-1">{stats.approvedCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">worth {formatCurrency(stats.approvedAmount)}</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500" />
          </button>

          {/* Partially Paid */}
          <button
            onClick={() => setActiveTab('partially_paid')}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden group hover:shadow-md ${
              activeTab === 'partially_paid' ? 'ring-2 ring-violet-500 ring-offset-1' : ''
            }`}
            aria-label={`Partially paid: ${stats.partiallyPaidCount}`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-gray-500">Partially paid</p>
              <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-violet-600 mt-1">{stats.partiallyPaidCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">worth {formatCurrency(stats.partiallyPaidAmount)}</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-violet-500" />
          </button>

          {/* Fully Paid */}
          <button
            onClick={() => setActiveTab('paid')}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden group hover:shadow-md ${
              activeTab === 'paid' ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
            }`}
            aria-label={`Fully paid: ${stats.paidCount}`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-gray-500">Fully paid</p>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.paidCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">worth {formatCurrency(stats.paidAmount)}</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
          </button>

          {/* Outstanding */}
          <button
            onClick={() => setActiveTab('all')}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden group hover:shadow-md ${
              activeTab === 'all' ? 'ring-2 ring-blue-500 ring-offset-1' : ''
            }`}
            aria-label={`Outstanding: ${formatCurrency(stats.outstandingAmount)}`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-gray-500">Unpaid Invoices</p>
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.approvedCount + stats.partiallyPaidCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">worth {formatCurrency(stats.outstandingAmount)}</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500" />
          </button>
        </div>

        {/* ── List header: count + sort ── */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-500">
            Showing <strong className="text-gray-700">{filteredInvoices.length}</strong> invoice{filteredInvoices.length !== 1 ? 's' : ''}
            {activeTab !== 'all' && ` · ${activeTab.replace('_', ' ')}`}
          </p>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-sm text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-h-[36px]"
            aria-label="Sort invoices"
          >
            <option value="date">Sort by date</option>
            <option value="amount">Sort by amount</option>
            <option value="vendor">Sort by vendor</option>
          </select>
        </div>

        {/* ── Invoice List ── */}
        {loading ? (
          <LoadingSkeleton variant="card" count={4} />
        ) : filteredInvoices.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm text-center py-16 px-6">
            {activeTab === 'paid' && !searchQuery ? (
              <>
                <div className="text-4xl mb-3">🎉</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">All payments complete!</h3>
                <p className="text-gray-500 text-sm">Every invoice has been fully paid.</p>
              </>
            ) : activeTab === 'approved' && !searchQuery ? (
              <>
                <div className="text-4xl mb-3">✅</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No pending payments</h3>
                <p className="text-gray-500 text-sm">All approved invoices have been processed.</p>
              </>
            ) : (
              <>
                <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <p className="text-gray-500 text-sm">
                  {searchQuery ? `No invoices match "${searchQuery}"` : 'No invoices found'}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredInvoices.map((inv) => {
              const isExpanded = expandedId === inv.id;
              const canPay = inv.status === 'approved' || inv.status === 'partially_paid';
              const canReject = inv.status === 'approved' || inv.status === 'partially_paid';
              const cachedPayment = paymentCache[inv.id];
              const invoiceIsImage = isImageUrl(inv.invoiceFileUrl, inv.invoiceFileName);
              const invoicePreview = !invoiceIsImage ? getPreviewUrl(inv.invoiceFileUrl) : null;

              return (
                <div
                  key={inv.id}
                  className={`group bg-white rounded-xl border border-gray-200 shadow-sm transition-all hover:shadow-md border-l-4 ${statusBorderColor(inv.status)}`}
                >
                  {/* Invoice row */}
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer"
                    onClick={() => {
                      setExpandedId(isExpanded ? null : inv.id);
                      if (!isExpanded && !paymentCache[inv.id]) {
                        fetchPaymentSummary(inv.id);
                      }
                    }}
                    role="button"
                    aria-expanded={isExpanded}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isExpanded ? null : inv.id); } }}
                  >
                    {/* Vendor avatar */}
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                      {getInitials(inv.vendorName)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-gray-900 text-sm">{inv.invoiceNumber}</span>
                        <span className="text-gray-400 text-xs">·</span>
                        <span className="text-sm text-gray-600">{inv.vendorName}</span>
                        {inv.invoiceType && <TypeBadge type={inv.invoiceType} />}
                        <StatusBadge status={inv.status} />
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5 truncate">
                        {inv.purpose}
                        {inv.poNumber && <span className="text-gray-400"> · PO: {inv.poNumber}</span>}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-base font-bold text-gray-900">
                          {formatCurrency(inv.amount)}
                        </span>
                        {inv.approvedAmount && parseFloat(inv.approvedAmount) !== parseFloat(inv.amount) && (
                          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                            Approved: {formatCurrency(inv.approvedAmount)}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {formatDate(inv.submittedAt || inv.invoiceDate)}
                        </span>
                      </div>
                    </div>

                    {/* Right side: quick actions on hover for payable invoices */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {canPay && !isExpanded && (
                        <div className="hidden lg:flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); openPaymentModal(inv); }}
                            className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200"
                            title="Record payment"
                          >
                            ₹ Pay
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setRejectInvoice(inv); }}
                            className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors border border-red-200"
                            title="Reject invoice"
                          >
                            ✕ Reject
                          </button>
                        </div>
                      )}

                      {/* Chevron */}
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* ===== Expanded Details ===== */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0">
                      <div className="border-t border-gray-100 pt-4">

                        {/* Detail grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs mb-4">
                          <div>
                            <span className="text-gray-400">Invoice Date</span>
                            <p className="text-gray-700 font-medium">{formatDate(inv.invoiceDate)}</p>
                          </div>
                          <div>
                            <span className="text-gray-400">Submitted By</span>
                            <p className="text-gray-700 font-medium">{inv.submittedBy || '—'}</p>
                          </div>
                          <div>
                            <span className="text-gray-400">Approved By</span>
                            <p className="text-gray-700 font-medium">{inv.approvedBy || '—'}</p>
                          </div>
                          {inv.approvedAmount && (
                            <div>
                              <span className="text-gray-400">Approved Amount</span>
                              <p className={`font-medium ${parseFloat(inv.approvedAmount) !== parseFloat(inv.amount) ? 'text-emerald-700' : 'text-gray-700'}`}>
                                {formatCurrency(inv.approvedAmount)}
                                {parseFloat(inv.approvedAmount) !== parseFloat(inv.amount) && (
                                  <span className="text-xs text-gray-400 ml-1">(Invoice: {formatCurrency(inv.amount)})</span>
                                )}
                              </p>
                            </div>
                          )}
                          {inv.poNumber && (
                            <div>
                              <span className="text-gray-400">PO Number</span>
                              <p className="text-gray-700 font-medium">{inv.poNumber}</p>
                            </div>
                          )}
                          {inv.remarks && (
                            <div className="col-span-2 sm:col-span-3">
                              <span className="text-gray-400">Remarks</span>
                              <p className="text-gray-700">{inv.remarks}</p>
                            </div>
                          )}
                          {inv.approvalComments && (
                            <div className="col-span-2 sm:col-span-3">
                              <span className="text-gray-400">Approval Comments</span>
                              <p className="text-gray-700">{inv.approvalComments}</p>
                            </div>
                          )}
                        </div>

                        {/* Payment progress (if any payments exist) */}
                        {cachedPayment && cachedPayment.totalPaid > 0 && (
                          <div className="mb-4 p-3 rounded-lg bg-emerald-50/50 border border-emerald-100">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-emerald-700 font-medium">
                                {cachedPayment.isFullyPaid ? '✓ Fully Paid' : `◑ ${formatCurrency(cachedPayment.totalPaid)} paid`}
                              </span>
                              <span className="text-gray-500">
                                {cachedPayment.payments.length} payment{cachedPayment.payments.length !== 1 ? 's' : ''}
                                {!cachedPayment.isFullyPaid && ` · ${formatCurrency(cachedPayment.remaining)} remaining`}
                              </span>
                            </div>
                            <div className="mt-2 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                                style={{ width: `${Math.min(100, (cachedPayment.totalPaid / cachedPayment.invoiceAmount) * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Invoice document */}
                        {inv.invoiceFileUrl && (
                          <div className="mb-4 rounded-lg p-4 bg-blue-50/50 border border-blue-100">
                            <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                              </svg>
                              Invoice — {inv.invoiceFileName || 'Uploaded file'}
                            </p>
                            {invoiceIsImage && (
                              <img src={inv.invoiceFileUrl} alt={`Invoice ${inv.invoiceNumber}`}
                                className="w-full max-h-[500px] object-contain rounded-lg cursor-pointer hover:opacity-90 transition-opacity bg-white border border-gray-200"
                                onClick={() => setFileViewer({ title: 'Invoice Document', url: inv.invoiceFileUrl, fileName: inv.invoiceFileName })} />
                            )}
                            {invoicePreview && (
                              <iframe src={invoicePreview} className="w-full rounded-lg border border-gray-200"
                                style={{ height: '500px' }} title={`Invoice ${inv.invoiceNumber} preview`} allow="autoplay" />
                            )}
                            {!invoiceIsImage && !invoicePreview && inv.invoiceFileUrl && (
                              <a href={inv.invoiceFileUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors min-h-[44px]">
                                Open Invoice in New Tab
                              </a>
                            )}
                          </div>
                        )}

                        {/* Other file links */}
                        <div className="flex flex-wrap gap-2 mb-4">
                          {inv.measurementSheetUrl && (
                            <button
                              onClick={() => setFileViewer({ title: 'Measurement Sheet', url: inv.measurementSheetUrl, fileName: inv.measurementSheetName })}
                              className="text-xs px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border border-cyan-200 transition-colors font-medium"
                            >
                              📏 Measurement Sheet
                            </button>
                          )}
                          {inv.challanUrl && (
                            <button
                              onClick={() => setFileViewer({ title: 'Challan', url: inv.challanUrl!, fileName: inv.challanName })}
                              className="text-xs px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 transition-colors font-medium"
                            >
                              📋 Challan
                            </button>
                          )}
                        </div>

                        {/* Work Photos — R2 versioned viewer */}
                        {inv.workPhotos && (
                          <PhotoViewer
                            invoiceId={inv.id}
                            quickPhotoUrls={inv.workPhotos.split(',').filter(Boolean)}
                            showVersionHistory={true}
                          />
                        )}

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2">
                          {canPay && (
                            <button
                              onClick={() => openPaymentModal(inv)}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors min-h-[44px]"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                              </svg>
                              Record Payment
                            </button>
                          )}
                          {canReject && (
                            <button
                              onClick={() => setRejectInvoice(inv)}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors min-h-[44px]"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              Reject
                            </button>
                          )}
                          {(inv.status === 'partially_paid' || inv.status === 'paid') && (
                            <button
                              onClick={() => openHistoryModal(inv)}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors min-h-[44px]"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                              </svg>
                              Payment History
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modals */}
      {paymentInvoice && (
        <PaymentModal
          invoice={paymentInvoice}
          paymentSummary={paymentCache[paymentInvoice.id] || null}
          onClose={() => setPaymentInvoice(null)}
          onSubmit={handleRecordPayment}
          isSubmitting={isSubmitting}
        />
      )}
      {rejectInvoice && (
        <RejectModal
          invoice={rejectInvoice}
          rejectionReasons={rejectionReasons}
          onClose={() => setRejectInvoice(null)}
          onSubmit={handleReject}
          isSubmitting={isSubmitting}
        />
      )}
      {historyInvoice && (
        <PaymentHistory
          invoice={historyInvoice}
          payments={paymentCache[historyInvoice.id] || null}
          onClose={() => setHistoryInvoice(null)}
        />
      )}
      {fileViewer && (
        <FileViewerModal
          title={fileViewer.title}
          url={fileViewer.url}
          fileName={fileViewer.fileName}
          onClose={() => setFileViewer(null)}
        />
      )}
    </div>
  );
}
