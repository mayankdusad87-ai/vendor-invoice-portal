'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import StatusBadge from '@/components/ui/StatusBadge';
import TypeBadge from '@/components/ui/TypeBadge';
import StatCard from '@/components/ui/StatCard';
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
  remaining: number;
  isFullyPaid: boolean;
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
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function isImageUrl(url: string, fileName?: string): boolean {
  if (!url) return false;
  if (url.startsWith('/api/files/')) {
    if (fileName) return /\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(fileName);
    return false;
  }
  if (/\.(jpg|jpeg|png|webp|gif|heic)(\?|$)/i.test(url)) return true;
  return false;
}

/* =====================================================================
   TOAST COMPONENT
   ===================================================================== */

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-slide-in flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border max-w-sm ${
            t.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : t.type === 'error'
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
          }`}
        >
          <span className="text-lg" aria-hidden="true">
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}
          </span>
          <span className="text-sm font-medium flex-1">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="text-white/40 hover:text-white/70 text-lg" aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/* =====================================================================
   PAYMENT MODAL
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

  const remaining = paymentSummary ? paymentSummary.remaining : parseFloat(invoice.amount) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Record Payment"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">Record Payment</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl" aria-label="Close">×</button>
        </div>

        {/* Invoice summary */}
        <div className="p-3 rounded-lg bg-[var(--surface-muted)] border border-[var(--border-muted)] mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-[var(--text-muted)]">{invoice.vendorName}</span>
            <TypeBadge type={invoice.invoiceType} />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">#{invoice.invoiceNumber} — {invoice.purpose}</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm text-[var(--text-muted)]">Invoice Total</span>
            <span className="font-bold text-[var(--text-primary)]">{formatCurrency(invoice.amount)}</span>
          </div>
          {paymentSummary && paymentSummary.totalPaid > 0 && (
            <>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-[var(--text-muted)]">Already Paid</span>
                <span className="text-sm text-emerald-400">{formatCurrency(paymentSummary.totalPaid)}</span>
              </div>
              <div className="flex items-center justify-between mt-1 pt-1 border-t border-[var(--border-muted)]">
                <span className="text-sm font-medium text-[var(--text-secondary)]">Remaining</span>
                <span className="font-bold text-violet-400">{formatCurrency(remaining)}</span>
              </div>
            </>
          )}
        </div>

        {/* Payment form */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
              Payment Amount <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">₹</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={remaining}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-field pl-7 w-full"
                placeholder="Enter payment amount"
              />
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Remaining balance: {formatCurrency(remaining)}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
              UTR / Reference Number <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={utrReference}
              onChange={(e) => setUtrReference(e.target.value)}
              className="input-field w-full"
              placeholder="Enter UTR or payment reference"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
              Payment Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field w-full"
              rows={2}
              placeholder="GST payment, advance, etc."
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => onSubmit({ amount, utrReference, paymentDate, notes })}
            disabled={isSubmitting || !amount || !utrReference || !paymentDate || parseFloat(amount) <= 0}
            className="btn-success flex-1"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
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
   REJECT MODAL
   ===================================================================== */

function RejectModal({
  invoice,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isSubmitting: boolean;
}) {
  const [reason, setReason] = useState('');

  const presetReasons = [
    'GST amount mismatch',
    'Wrong company name on invoice',
    'Unclear purpose / work description',
    'Missing supporting documents',
    'Invoice number duplicate',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="card w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Reject Invoice"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-red-400">Reject Invoice</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl" aria-label="Close">×</button>
        </div>

        <p className="text-sm text-[var(--text-secondary)] mb-3">
          This will reject <strong className="text-[var(--text-primary)]">#{invoice.invoiceNumber}</strong> from {invoice.vendorName} back to the approver for correction.
        </p>

        {/* Preset reasons */}
        <div className="flex flex-wrap gap-2 mb-3">
          {presetReasons.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                reason === r
                  ? 'bg-red-500/15 border-red-500/30 text-red-400'
                  : 'bg-[var(--surface-muted)] border-[var(--border-muted)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="input-field w-full"
          rows={3}
          placeholder="Describe the issue with this invoice…"
        />

        <div className="flex items-center gap-3 mt-4">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => onSubmit(reason)}
            disabled={isSubmitting || !reason.trim()}
            className="btn-danger flex-1"
          >
            {isSubmitting ? 'Rejecting…' : 'Reject Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   PAYMENT HISTORY DRAWER
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="card w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Payment History"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">Payment History</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl" aria-label="Close">×</button>
        </div>

        <div className="p-3 rounded-lg bg-[var(--surface-muted)] border border-[var(--border-muted)] mb-4">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            #{invoice.invoiceNumber} — {invoice.vendorName}
          </p>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div>
              <p className="text-xs text-[var(--text-muted)]">Invoice Total</p>
              <p className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(payments.invoiceAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Total Paid</p>
              <p className="text-sm font-bold text-emerald-400">{formatCurrency(payments.totalPaid)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Remaining</p>
              <p className={`text-sm font-bold ${payments.remaining === 0 ? 'text-emerald-400' : 'text-violet-400'}`}>
                {formatCurrency(payments.remaining)}
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-2 rounded-full bg-[var(--border)] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${Math.min(100, (payments.totalPaid / payments.invoiceAmount) * 100)}%` }}
            />
          </div>
        </div>

        {payments.payments.length === 0 ? (
          <div className="text-center py-6 text-[var(--text-muted)]">
            <p className="text-2xl mb-1">💸</p>
            <p className="text-sm">No payments recorded yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.payments.map((p, i) => (
              <div
                key={p.id}
                className="p-3 rounded-lg border border-[var(--border-muted)] bg-[var(--surface)]"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[var(--text-muted)]">Payment #{i + 1}</span>
                  <span className="font-bold text-emerald-400">{formatCurrency(p.amount)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div>
                    <span className="text-[var(--text-muted)]">UTR: </span>
                    <span className="text-[var(--text-secondary)] font-mono">{p.utrReference}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)]">Date: </span>
                    <span className="text-[var(--text-secondary)]">{formatDate(p.paymentDate)}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)]">Paid by: </span>
                    <span className="text-[var(--text-secondary)]">{p.paidBy}</span>
                  </div>
                  {p.notes && (
                    <div className="col-span-2">
                      <span className="text-[var(--text-muted)]">Notes: </span>
                      <span className="text-[var(--text-secondary)]">{p.notes}</span>
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
   FILE VIEWER MODAL
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="card w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl" aria-label="Close">×</button>
        </div>
        <div className="flex-1 overflow-auto bg-[var(--background)] rounded-lg min-h-[300px]">
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
   MAIN DASHBOARD
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

  // Toast
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Toast helpers
  const addToast = useCallback((message: string, type: Toast['type']) => {
    const id = `t-${Date.now()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

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

  useEffect(() => {
    if (isReady) fetchInvoices();
  }, [isReady, fetchInvoices]);

  // Filter & sort
  const filteredInvoices = useMemo(() => {
    let filtered = invoices;

    // Tab filter
    if (activeTab !== 'all') {
      filtered = filtered.filter((inv) => inv.status === activeTab);
    }

    // Search
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

    // Sort
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
    const approved = invoices.filter((i) => i.status === 'approved').length;
    const partiallyPaid = invoices.filter((i) => i.status === 'partially_paid').length;
    const paid = invoices.filter((i) => i.status === 'paid').length;
    const totalAmount = invoices
      .filter((i) => ['approved', 'partially_paid'].includes(i.status))
      .reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
    return { approved, partiallyPaid, paid, totalAmount };
  }, [invoices]);

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

        addToast(
          result.newStatus === 'paid'
            ? `Payment recorded — invoice fully paid! 🎉`
            : `Payment of ${formatCurrency(data.amount)} recorded`,
          'success'
        );
        setPaymentInvoice(null);
        // Clear payment cache for this invoice
        setPaymentCache((prev) => {
          const next = { ...prev };
          delete next[paymentInvoice.id];
          return next;
        });
        fetchInvoices();
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed to record payment', 'error');
      } finally {
        setIsSubmitting(false);
      }
    },
    [paymentInvoice, addToast, fetchInvoices]
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

        addToast('Invoice rejected — sent back to approver', 'info');
        setRejectInvoice(null);
        fetchInvoices();
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed to reject invoice', 'error');
      } finally {
        setIsSubmitting(false);
      }
    },
    [rejectInvoice, addToast, fetchInvoices]
  );

  // Open payment modal (and pre-fetch payment data)
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

  // Tab counts
  const tabCounts = useMemo(() => ({
    all: invoices.length,
    approved: invoices.filter((i) => i.status === 'approved').length,
    partially_paid: invoices.filter((i) => i.status === 'partially_paid').length,
    paid: invoices.filter((i) => i.status === 'paid').length,
    rejected: invoices.filter((i) => i.status === 'rejected').length,
  }), [invoices]);

  /* ---- AUTH GATE ---- */
  if (!isReady) {
    return (
      <div className="min-h-screen bg-[var(--background)] p-4 sm:p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="skeleton h-10 w-10 rounded-lg" />
            <div className="skeleton h-6 w-48 rounded" />
          </div>
          <LoadingSkeleton count={4} variant="list" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-lg">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
              {getInitials(accountsName)}
            </div>
            <div>
              <h1 className="text-base font-bold text-[var(--text-primary)] leading-tight">
                Accounts Dashboard
              </h1>
              <p className="text-xs text-[var(--text-muted)]">{accountsName}</p>
            </div>
          </div>
          <button onClick={logout} className="btn-ghost text-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Error */}
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            title="Pending Payment"
            value={stats.approved}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
            bgColor="bg-yellow-100"
          />
          <StatCard
            title="Partially Paid"
            value={stats.partiallyPaid}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            bgColor="bg-purple-100"
          />
          <StatCard
            title="Fully Paid"
            value={stats.paid}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            bgColor="bg-green-100"
          />
          <StatCard
            title="Outstanding"
            value={formatCurrency(stats.totalAmount)}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
            bgColor="bg-blue-100"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1" role="tablist">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'approved', label: 'Pending' },
              { key: 'partially_paid', label: 'Partial' },
              { key: 'paid', label: 'Paid' },
              { key: 'rejected', label: 'Rejected' },
            ] as { key: FilterTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-[var(--primary-light)] text-[var(--primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface)]'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs opacity-70">{tabCounts[tab.key]}</span>
            </button>
          ))}
        </div>

        {/* Search & sort */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vendor, invoice #, PO number…"
              className="input-field w-full pl-10"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="input-field w-full sm:w-40"
          >
            <option value="date">Latest first</option>
            <option value="amount">Highest amount</option>
            <option value="vendor">Vendor A–Z</option>
          </select>
        </div>

        {/* Invoice list */}
        {loading ? (
          <LoadingSkeleton count={5} variant="list" />
        ) : filteredInvoices.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">
              {activeTab === 'paid' ? '🎉' : activeTab === 'rejected' ? '📋' : '📭'}
            </div>
            <p className="text-[var(--text-secondary)] font-medium">
              {searchQuery
                ? 'No invoices match your search'
                : activeTab === 'all'
                ? 'No invoices to process yet'
                : activeTab === 'paid'
                ? 'All payments tracked and completed!'
                : `No ${activeTab.replace('_', ' ')} invoices`}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {!searchQuery && activeTab === 'all'
                ? 'Approved invoices will appear here for payment processing'
                : ''}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredInvoices.map((inv) => {
              const isExpanded = expandedId === inv.id;
              const canPay = inv.status === 'approved' || inv.status === 'partially_paid';
              const canReject = inv.status === 'approved' || inv.status === 'partially_paid';
              const cachedPayment = paymentCache[inv.id];

              return (
                <div
                  key={inv.id}
                  className={`card border-l-4 ${statusBorderColor(inv.status)} transition-all duration-200 hover:bg-[var(--surface-hover)]`}
                >
                  {/* Row */}
                  <div
                    className="flex items-center gap-3 cursor-pointer"
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
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center text-white text-xs font-bold">
                      {getInitials(inv.vendorName)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{inv.vendorName}</span>
                        <TypeBadge type={inv.invoiceType} />
                        <StatusBadge status={inv.status} />
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                        #{inv.invoiceNumber} · {inv.purpose}
                        {inv.poNumber && ` · PO: ${inv.poNumber}`}
                      </p>
                    </div>

                    {/* Amount + date */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(inv.amount)}</p>
                      <p className="text-xs text-[var(--text-muted)]">{formatDate(inv.invoiceDate)}</p>
                    </div>

                    {/* Expand arrow */}
                    <svg
                      className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-[var(--border-muted)] space-y-4">
                      {/* Detail grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-[var(--text-muted)]">Invoice Date</span>
                          <p className="text-[var(--text-secondary)] font-medium">{formatDate(inv.invoiceDate)}</p>
                        </div>
                        <div>
                          <span className="text-[var(--text-muted)]">Submitted By</span>
                          <p className="text-[var(--text-secondary)] font-medium">{inv.submittedBy || '—'}</p>
                        </div>
                        <div>
                          <span className="text-[var(--text-muted)]">Approved By</span>
                          <p className="text-[var(--text-secondary)] font-medium">{inv.approvedBy || '—'}</p>
                        </div>
                        {inv.poNumber && (
                          <div>
                            <span className="text-[var(--text-muted)]">PO Number</span>
                            <p className="text-[var(--text-secondary)] font-medium">{inv.poNumber}</p>
                          </div>
                        )}
                        {inv.remarks && (
                          <div className="col-span-2 sm:col-span-3">
                            <span className="text-[var(--text-muted)]">Remarks</span>
                            <p className="text-[var(--text-secondary)]">{inv.remarks}</p>
                          </div>
                        )}
                        {inv.approvalComments && (
                          <div className="col-span-2 sm:col-span-3">
                            <span className="text-[var(--text-muted)]">Approval Comments</span>
                            <p className="text-[var(--text-secondary)]">{inv.approvalComments}</p>
                          </div>
                        )}
                      </div>

                      {/* Payment summary if available */}
                      {cachedPayment && cachedPayment.totalPaid > 0 && (
                        <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-emerald-400 font-medium">
                              {cachedPayment.isFullyPaid ? '✓ Fully Paid' : `◑ ${formatCurrency(cachedPayment.totalPaid)} paid`}
                            </span>
                            <span className="text-[var(--text-muted)]">
                              {cachedPayment.payments.length} payment{cachedPayment.payments.length !== 1 ? 's' : ''}
                              {!cachedPayment.isFullyPaid && ` · ${formatCurrency(cachedPayment.remaining)} remaining`}
                            </span>
                          </div>
                          <div className="mt-2 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                              style={{ width: `${Math.min(100, (cachedPayment.totalPaid / cachedPayment.invoiceAmount) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* File links */}
                      <div className="flex flex-wrap gap-2">
                        {inv.invoiceFileUrl && (
                          <button
                            onClick={() => setFileViewer({ title: 'Invoice Document', url: inv.invoiceFileUrl, fileName: inv.invoiceFileName })}
                            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--primary-light)] text-[var(--primary)] hover:bg-[var(--primary-ring)] transition-colors"
                          >
                            📄 Invoice
                          </button>
                        )}
                        {inv.measurementSheetUrl && (
                          <button
                            onClick={() => setFileViewer({ title: 'Measurement Sheet', url: inv.measurementSheetUrl, fileName: inv.measurementSheetName })}
                            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--accent-light)] text-[var(--accent)] hover:bg-[var(--accent-light)] transition-colors"
                          >
                            📏 Measurement Sheet
                          </button>
                        )}
                        {inv.challanUrl && (
                          <button
                            onClick={() => setFileViewer({ title: 'Challan', url: inv.challanUrl!, fileName: inv.challanName })}
                            className="text-xs px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors"
                          >
                            📋 Challan
                          </button>
                        )}
                        {inv.workPhotos && (
                          <button
                            onClick={() => setFileViewer({ title: 'Work Photos', url: inv.workPhotos })}
                            className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                          >
                            📸 Work Photos
                          </button>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {canPay && (
                          <button
                            onClick={() => openPaymentModal(inv)}
                            className="btn-success text-sm"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            Record Payment
                          </button>
                        )}
                        {canReject && (
                          <button
                            onClick={() => setRejectInvoice(inv)}
                            className="btn-danger text-sm"
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
                            className="btn-secondary text-sm"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Payment History
                          </button>
                        )}
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
