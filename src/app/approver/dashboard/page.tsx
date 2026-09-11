'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import StatusBadge from '@/components/ui/StatusBadge';
import TypeBadge from '@/components/ui/TypeBadge';
import PhotoViewer from '@/components/ui/PhotoViewer';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useApproverAuth } from '@/hooks/useApproverAuth';
import type { InvoiceStatus } from '@/lib/constants';

interface Invoice {
  id: string;
  project?: string;
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
  approvedAmount?: string;
  gstAmount?: string;
  poNumber?: string;
  challanUrl?: string;
  challanName?: string;
  approvedDate?: string;
  accountsQueryBy?: string;
  accountsQueryReason?: string;
  accountsQueryAt?: string;
  previousStatus?: string;
}

interface BulkSummary {
  totalPaid: number;
  remaining: number;
  availableToPay: number;
  isFullyPaid: boolean;
  approvedCapReached: boolean;
  paymentCount: number;
}

interface PaymentSummary {
  payments: { id: string; amount: string; utrReference: string; paymentDate: string; paidBy: string; notes: string; createdAt: string }[];
  totalPaid: number;
  invoiceAmount: number;
  approvedAmount: number;
  remaining: number;
  isFullyPaid: boolean;
  approvedCapReached?: boolean;
}

interface RejectionReason {
  id: string;
  reason: string;
}

function isImageUrl(url: string, fileName?: string): boolean {
  if (!url) return false;
  // R2 proxy URLs — check extension from key path
  if (url.startsWith('/api/r2/')) {
    return /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(url);
  }
  if (url.startsWith('/api/files/')) {
    if (fileName) return /\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(fileName);
    return false;
  }
  if (url.includes('lh3.googleusercontent.com/d/')) return true;
  if (url.includes('drive.google.com/uc')) return true;
  if (/\.(jpg|jpeg|png|webp|gif|heic)(\?|$)/i.test(url)) return true;
  return false;
}

function getPreviewUrl(url: string): string | null {
  if (!url) return null;
  if (url.startsWith('/api/files/')) return url;
  if (url.startsWith('/api/r2/')) return url; // R2 proxy URLs work directly
  const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)\//);
  if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
  return null;
}

/** Get two-letter initials from vendor name */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Status → left border color */
function statusBorderColor(status: InvoiceStatus): string {
  switch (status) {
    case 'submitted': return 'border-l-amber-400';
    case 'under_review': return 'border-l-amber-500';
    case 'approved': return 'border-l-emerald-500';
    case 'partially_paid': return 'border-l-violet-500';
    case 'paid': return 'border-l-emerald-400';
    case 'rejected': return 'border-l-red-500';
    case 'accounts_query': return 'border-l-orange-500';
    case 'correction_required': return 'border-l-rose-500';
    default: return 'border-l-gray-300';
  }
}

/** Status → aria label */
function statusAriaLabel(status: InvoiceStatus): string {
  switch (status) {
    case 'submitted': return 'Pending invoice';
    case 'under_review': return 'Under review invoice';
    case 'approved': return 'Approved invoice';
    case 'partially_paid': return 'Partially paid invoice';
    case 'paid': return 'Fully paid invoice';
    case 'rejected': return 'Rejected invoice';
    case 'accounts_query': return 'Accounts query raised';
    case 'correction_required': return 'Correction required';
    default: return 'Invoice';
  }
}

/** Parse date strings — handles ISO, dd/mm/yyyy, and dd/mm/yyyy, HH:mm:ss IST */
function parseFlexDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const ddMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (ddMatch) {
    const [, dd, mm, yyyy] = ddMatch;
    return new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '—';
  if (/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) return dateStr.split(',')[0].trim();
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

export default function ApproverDashboard() {
  const { approverName, isReady, logout } = useApproverAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [initialFilterApplied, setInitialFilterApplied] = useState(false);

  // Bulk payment summaries (loaded once for all invoices — for card-level progress)
  const [bulkSummaries, setBulkSummaries] = useState<Record<string, BulkSummary>>({});

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Per-invoice action state
  const [comments, setComments] = useState<Record<string, string>>({});
  const [approvedAmounts, setApprovedAmounts] = useState<Record<string, string>>({});
  const [selectedReasons, setSelectedReasons] = useState<Record<string, string>>({});
  const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Payment data cache (for partially_paid / paid invoices)
  const [paymentCache, setPaymentCache] = useState<Record<string, PaymentSummary>>({});
  const [paymentLoadErrors, setPaymentLoadErrors] = useState<Record<string, boolean>>({});

  // Approval history cache
  const [approvalHistoryCache, setApprovalHistoryCache] = useState<Record<string, Array<{
    id: string; invoiceId: string; amount: string; cumulativeTotal: string;
    approvedBy: string; comments: string; createdAt: string;
  }>>>({});

  // Increase approved amount modal
  const [increaseAmountInvoice, setIncreaseAmountInvoice] = useState<Invoice | null>(null);
  const [newApprovedAmount, setNewApprovedAmount] = useState('');
  const [increaseComment, setIncreaseComment] = useState('');
  const [increaseLoading, setIncreaseLoading] = useState(false);

  // Confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    action: InvoiceStatus;
    message: string;
  } | null>(null);

  // Accounts query resolution state
  const [queryResolutionComments, setQueryResolutionComments] = useState<Record<string, string>>({});
  const [queryResolutionLoading, setQueryResolutionLoading] = useState<string | null>(null);
  const [queryResolutionError, setQueryResolutionError] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isReady) return;
    fetchInvoices();
    fetchRejectionReasons();
    fetchBulkSummaries();
  }, [isReady]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchInvoices = async () => {
    try {
      const res = await fetch('/api/invoices');
      const data = await res.json();
      if (res.ok) {
        const loaded = data.invoices || [];
        setInvoices(loaded);
        // Auto-filter to accounts queries (urgent) or pending on first load
        if (!initialFilterApplied) {
          const hasAccountsQuery = loaded.some((i: Invoice) => i.status === 'accounts_query');
          const hasPending = loaded.some((i: Invoice) => i.status === 'submitted' || i.status === 'under_review');
          if (hasAccountsQuery) setFilter('accounts_query');
          else if (hasPending) setFilter('pending');
          setInitialFilterApplied(true);
        }
      }
    } catch {
      console.error('Failed to fetch invoices');
    }
    setLoading(false);
  };

  const fetchBulkSummaries = async () => {
    try {
      const res = await fetch('/api/payments/bulk-summary');
      if (res.ok) {
        const data = await res.json();
        setBulkSummaries(data.summaries || {});
      }
    } catch {
      console.error('Failed to load bulk payment summaries');
    }
  };

  const fetchRejectionReasons = async () => {
    try {
      const res = await fetch('/api/rejection-reasons?active=true');
      const data = await res.json();
      if (res.ok) setRejectionReasons(data.reasons || []);
    } catch {
      console.error('Failed to fetch rejection reasons');
    }
  };

  // Fetch payment summary for an invoice
  const fetchPaymentSummary = useCallback(async (invoiceId: string): Promise<PaymentSummary | null> => {
    if (paymentCache[invoiceId]) return paymentCache[invoiceId];
    // Clear previous error for this invoice
    setPaymentLoadErrors((prev) => { const n = { ...prev }; delete n[invoiceId]; return n; });
    try {
      const res = await fetch(`/api/payments?invoiceId=${invoiceId}`);
      if (!res.ok) {
        setPaymentLoadErrors((prev) => ({ ...prev, [invoiceId]: true }));
        return null;
      }
      const data = await res.json();
      setPaymentCache((prev) => ({ ...prev, [invoiceId]: data }));
      return data;
    } catch {
      setPaymentLoadErrors((prev) => ({ ...prev, [invoiceId]: true }));
      return null;
    }
  }, [paymentCache]);

  // Fetch approval history for an invoice
  const fetchApprovalHistory = useCallback(async (invoiceId: string) => {
    if (approvalHistoryCache[invoiceId]) return;
    try {
      const res = await fetch(`/api/approval-history?invoiceId=${invoiceId}`);
      if (res.ok) {
        const data = await res.json();
        setApprovalHistoryCache((prev) => ({ ...prev, [invoiceId]: data.history || [] }));
      }
    } catch {
      // Silently fail — history is supplementary
    }
  }, [approvalHistoryCache]);

  // Handle increase approved amount
  const [increaseError, setIncreaseError] = useState('');

  const handleIncreaseApprovedAmount = useCallback(async () => {
    if (!increaseAmountInvoice) return;
    setIncreaseError('');

    const additionalAmount = parseFloat(newApprovedAmount);
    if (!newApprovedAmount || isNaN(additionalAmount) || additionalAmount <= 0) {
      setIncreaseError('Please enter a valid amount greater than ₹0');
      return;
    }
    const currentApproved = parseFloat(increaseAmountInvoice.approvedAmount || increaseAmountInvoice.amount) || 0;
    const baseAmt = parseFloat(increaseAmountInvoice.amount) || 0;
    const gst = parseFloat(increaseAmountInvoice.gstAmount || '') || 0;
    const totalInvoiceAmt = baseAmt + gst;
    const newCumulative = currentApproved + additionalAmount;
    if (newCumulative > totalInvoiceAmt + 0.01) {
      const maxAdditional = Math.max(0, totalInvoiceAmt - currentApproved);
      setIncreaseError(`Additional ₹${additionalAmount.toLocaleString('en-IN')} would exceed invoice total. Maximum additional: ₹${maxAdditional.toLocaleString('en-IN')}`);
      return;
    }

    setIncreaseLoading(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: increaseAmountInvoice.id,
          action: 'increase_approved_amount',
          approvedAmount: newApprovedAmount, // This is the ADDITIONAL amount
          approvalComments: increaseComment || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');

      const invoiceId = increaseAmountInvoice.id;
      const newTotal = parseFloat(data.approvedAmount) || newCumulative;
      setToast({ message: `Additional ₹${additionalAmount.toLocaleString('en-IN')} authorized (total: ₹${newTotal.toLocaleString('en-IN')})`, type: 'success' });
      setIncreaseAmountInvoice(null);
      setNewApprovedAmount('');
      setIncreaseComment('');
      // Refresh approval history for this invoice
      setApprovalHistoryCache((prev) => { const n = { ...prev }; delete n[invoiceId]; return n; });
      fetchApprovalHistory(invoiceId);
      // Update local invoice state with the new cumulative approved amount
      setInvoices((prev) =>
        prev.map((i) =>
          i.id === invoiceId ? { ...i, approvedAmount: String(newTotal) } : i
        )
      );
      // Re-fetch payment data so the payment progress section updates immediately
      try {
        const payRes = await fetch(`/api/payments?invoiceId=${invoiceId}`);
        if (payRes.ok) {
          const payData = await payRes.json();
          setPaymentCache((prev) => ({ ...prev, [invoiceId]: payData }));
        } else {
          setPaymentCache((prev) => { const n = { ...prev }; delete n[invoiceId]; return n; });
        }
      } catch {
        setPaymentCache((prev) => { const n = { ...prev }; delete n[invoiceId]; return n; });
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to increase amount', type: 'error' });
    } finally {
      setIncreaseLoading(false);
    }
  }, [increaseAmountInvoice, newApprovedAmount, increaseComment]);

  const getComment = (id: string) => comments[id] || '';
  const getReason = (id: string) => selectedReasons[id] || '';
  const getError = (id: string) => actionError[id] || '';
  /** Default approved amount = amount + GST (total invoice amount) */
  const getApprovedAmount = (id: string, invoiceAmount: string, gstAmount?: string) => {
    if (approvedAmounts[id] !== undefined) return approvedAmounts[id];
    const base = parseFloat(invoiceAmount) || 0;
    const gst = parseFloat(gstAmount || '') || 0;
    return String(base + gst);
  };

  const setComment = (id: string, value: string) =>
    setComments((prev) => ({ ...prev, [id]: value }));
  const setReason = (id: string, value: string) =>
    setSelectedReasons((prev) => ({ ...prev, [id]: value }));
  const setApprovedAmount = (id: string, value: string) =>
    setApprovedAmounts((prev) => ({ ...prev, [id]: value }));
  const setError = (id: string, value: string) =>
    setActionError((prev) => ({ ...prev, [id]: value }));
  const clearError = (id: string) =>
    setActionError((prev) => { const next = { ...prev }; delete next[id]; return next; });

  const requestAction = (invoiceId: string, invoiceNumber: string, status: InvoiceStatus, invoiceAmount?: string, gstAmount?: string) => {
    clearError(invoiceId);
    const comment = getComment(invoiceId).trim();
    const reason = getReason(invoiceId);

    if (status === 'approved' && !comment) {
      setError(invoiceId, 'Please add approval remarks before approving');
      return;
    }
    if (status === 'approved' && invoiceAmount) {
      const amt = getApprovedAmount(invoiceId, invoiceAmount, gstAmount);
      const parsed = parseFloat(amt);
      const baseAmt = parseFloat(invoiceAmount) || 0;
      const gst = parseFloat(gstAmount || '') || 0;
      const totalInvoiceAmt = baseAmt + gst;
      if (!amt || isNaN(parsed) || parsed <= 0) {
        setError(invoiceId, 'Please enter a valid approved amount greater than ₹0');
        return;
      }
      if (parsed < 1) {
        setError(invoiceId, 'Approved amount must be at least ₹1');
        return;
      }
      if (parsed > totalInvoiceAmt + 0.01) {
        setError(invoiceId, `Approved amount cannot exceed total invoice amount (₹${totalInvoiceAmt.toLocaleString('en-IN')})`);
        return;
      }
    }
    if (status === 'rejected' && !reason && !comment) {
      setError(invoiceId, 'Please select a rejection reason or add comments');
      return;
    }

    const actionLabels: Record<string, string> = {
      approved: 'APPROVE',
      rejected: 'REJECT',
      under_review: 'mark as Under Review',
    };

    const approvedAmt = status === 'approved' && invoiceAmount
      ? getApprovedAmount(invoiceId, invoiceAmount, gstAmount)
      : undefined;
    const amtDisplay = approvedAmt ? ` for ₹${parseFloat(approvedAmt).toLocaleString('en-IN')}` : '';

    setConfirmDialog({
      invoiceId,
      invoiceNumber,
      action: status,
      message: `Are you sure you want to ${actionLabels[status] || status} invoice ${invoiceNumber}${amtDisplay}?`,
    });
  };

  const executeAction = useCallback(async () => {
    if (!confirmDialog) return;
    const { invoiceId, invoiceNumber, action } = confirmDialog;
    setConfirmDialog(null);

    const comment = getComment(invoiceId).trim();
    const reason = getReason(invoiceId);
    const inv = invoices.find((i) => i.id === invoiceId);

    const approvalComments = action === 'rejected'
      ? (reason ? `${reason}${comment ? ` — ${comment}` : ''}` : comment)
      : comment;

    // Get approved amount for approval actions (defaults to amount + GST)
    const approvedAmount = action === 'approved' && inv
      ? getApprovedAmount(invoiceId, inv.amount, inv.gstAmount)
      : undefined;

    setActionLoading(invoiceId);
    clearError(invoiceId);
    try {
      const res = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: invoiceId, status: action, approvalComments, approvedAmount }),
      });

      const data = await res.json();
      if (res.ok) {
        const approvedAmt = approvedAmount ? `₹${parseFloat(approvedAmount).toLocaleString('en-IN')}` : '';
        setInvoices((prev) =>
          prev.map((i) =>
            i.id === invoiceId
              ? {
                  ...i,
                  status: action,
                  approvalComments,
                  approvedBy: approverName,
                  ...(action === 'approved' ? {
                    approvedAmount: data.approvedAmount || approvedAmount || i.amount,
                    approvedDate: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                  } : {}),
                }
              : i
          )
        );
        setComment(invoiceId, '');
        setReason(invoiceId, '');
        setApprovedAmounts((prev) => { const next = { ...prev }; delete next[invoiceId]; return next; });
        setExpandedId(null);

        // Toast notification
        if (action === 'approved') {
          setToast({ message: `Invoice ${invoiceNumber} approved ${approvedAmt ? `— ${approvedAmt}` : ''}`, type: 'success' });
        } else if (action === 'rejected') {
          setToast({ message: `Invoice ${invoiceNumber} rejected`, type: 'error' });
        } else {
          setToast({ message: `Invoice ${invoiceNumber} marked as Under Review`, type: 'success' });
        }
      } else {
        setError(invoiceId, data.error || 'Action failed');
      }
    } catch {
      setError(invoiceId, 'Network error. Please try again.');
    }
    setActionLoading(null);
  }, [confirmDialog, comments, selectedReasons, approvedAmounts, approverName, invoices]);

  // Handle accounts query resolution (accept or disagree)
  const handleResolveQuery = useCallback(async (invoiceId: string, resolution: 'accept' | 'disagree') => {
    const comment = (queryResolutionComments[invoiceId] || '').trim();
    if (!comment || comment.length < 3) {
      setQueryResolutionError((prev) => ({ ...prev, [invoiceId]: 'Please add a comment (at least 3 characters)' }));
      return;
    }

    const actionLabel = resolution === 'accept' ? 'accept the query and send for correction' : 'disagree and send back to accounts';
    if (!window.confirm(`Are you sure you want to ${actionLabel}?`)) return;

    setQueryResolutionLoading(invoiceId);
    setQueryResolutionError((prev) => { const n = { ...prev }; delete n[invoiceId]; return n; });

    try {
      const res = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: invoiceId,
          action: 'resolve_accounts_query',
          resolution,
          approvalComments: comment,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const inv = invoices.find((i) => i.id === invoiceId);
        const newStatus = data.newStatus as InvoiceStatus;
        setInvoices((prev) =>
          prev.map((i) =>
            i.id === invoiceId
              ? { ...i, status: newStatus, approvalComments: `${i.approvalComments || ''}\n[${resolution === 'accept' ? 'Query Accepted' : 'Query Disagreed'} by ${approverName}] ${comment}`.trim() }
              : i
          )
        );
        setQueryResolutionComments((prev) => { const n = { ...prev }; delete n[invoiceId]; return n; });
        setExpandedId(null);
        // Clear cached approval history so it reloads with the new entry
        setApprovalHistoryCache((prev) => { const n = { ...prev }; delete n[invoiceId]; return n; });
        setToast({
          message: resolution === 'accept'
            ? `Invoice ${inv?.invoiceNumber || invoiceId} sent for correction`
            : `Invoice ${inv?.invoiceNumber || invoiceId} sent back to accounts`,
          type: 'success',
        });
      } else {
        setQueryResolutionError((prev) => ({ ...prev, [invoiceId]: data.error || 'Failed to resolve query' }));
      }
    } catch {
      setQueryResolutionError((prev) => ({ ...prev, [invoiceId]: 'Network error. Please try again.' }));
    }
    setQueryResolutionLoading(null);
  }, [queryResolutionComments, invoices, approverName]);

  // Stats
  const stats = useMemo(() => {
    const pending = invoices.filter((i) => i.status === 'submitted' || i.status === 'under_review');
    const approved = invoices.filter((i) => i.status === 'approved');
    const rejected = invoices.filter((i) => i.status === 'rejected');
    const inPayment = invoices.filter((i) => i.status === 'partially_paid' || i.status === 'paid');
    const accountsQuery = invoices.filter((i) => i.status === 'accounts_query');
    const correctionRequired = invoices.filter((i) => i.status === 'correction_required');
    const sumAmount = (arr: Invoice[]) => arr.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    return {
      total: invoices.length,
      totalAmount: sumAmount(invoices),
      pendingCount: pending.length,
      pendingAmount: sumAmount(pending),
      approvedCount: approved.length,
      approvedAmount: sumAmount(approved),
      rejectedCount: rejected.length,
      rejectedAmount: sumAmount(rejected),
      inPaymentCount: inPayment.length,
      inPaymentAmount: sumAmount(inPayment),
      accountsQueryCount: accountsQuery.length,
      accountsQueryAmount: sumAmount(accountsQuery),
      correctionCount: correctionRequired.length,
      correctionAmount: sumAmount(correctionRequired),
    };
  }, [invoices]);

  // Derive unique vendor names
  const vendorNames = useMemo(() => {
    const names = new Set(invoices.map((i) => i.vendorName).filter(Boolean));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [invoices]);

  // Filter + search + sort
  const filteredInvoices = useMemo(() => {
    let list = invoices.filter((inv) => {
      if (filter === 'pending') return inv.status === 'submitted' || inv.status === 'under_review';
      if (filter === 'approved') return inv.status === 'approved';
      if (filter === 'rejected') return inv.status === 'rejected';
      if (filter === 'in_payment') return inv.status === 'partially_paid' || inv.status === 'paid';
      if (filter === 'accounts_query') return inv.status === 'accounts_query';
      if (filter === 'correction') return inv.status === 'correction_required';
      return true;
    });

    // Vendor filter
    if (selectedVendor) {
      list = list.filter((inv) => inv.vendorName === selectedVendor);
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.vendorName.toLowerCase().includes(q) ||
          inv.purpose.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (sortBy === 'amount') return (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0);
      const da = parseFlexDate(a.submittedAt)?.getTime() || 0;
      const db = parseFlexDate(b.submittedAt)?.getTime() || 0;
      return db - da;
    });

    return list;
  }, [invoices, filter, selectedVendor, searchTerm, sortBy]);

  // Label for "Showing X invoices"
  const filterLabel = filter === 'pending' ? 'pending' : filter === 'approved' ? 'approved' : filter === 'rejected' ? 'rejected' : filter === 'in_payment' ? 'in payment' : filter === 'accounts_query' ? 'accounts queries' : filter === 'correction' ? 'correction required' : 'all';

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
              <h1 className="text-xl font-bold text-gray-900">Approver Dashboard</h1>
              <p className="text-xs text-gray-500">Welcome back, {approverName}</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative hidden sm:block">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search invoices..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-52 min-h-[40px]"
                  aria-label="Search invoices"
                />
              </div>
              {/* User icon + logout */}
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
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full min-h-[44px]"
                aria-label="Search invoices"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 fade-in">
        {/* ── Stat Cards — white with colored bottom borders ── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
          {/* Total */}
          <button
            onClick={() => setFilter('all')}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden group hover:shadow-md ${
              filter === 'all' ? 'ring-2 ring-blue-500 ring-offset-1' : ''
            }`}
            aria-label={`Total invoices: ${stats.total}`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-gray-500">Total</p>
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
            <p className="text-xs text-gray-400 mt-0.5">₹{stats.totalAmount.toLocaleString('en-IN')}</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500" />
          </button>

          {/* Pending */}
          <button
            onClick={() => setFilter('pending')}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden group hover:shadow-md ${
              filter === 'pending' ? 'ring-2 ring-amber-500 ring-offset-1' : ''
            }`}
            aria-label={`Pending review: ${stats.pendingCount}`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-gray-500">Pending</p>
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-amber-600 mt-1">{stats.pendingCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">worth ₹{stats.pendingAmount.toLocaleString('en-IN')}</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500" />
          </button>

          {/* Approved */}
          <button
            onClick={() => setFilter('approved')}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden group hover:shadow-md ${
              filter === 'approved' ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
            }`}
            aria-label={`Approved: ${stats.approvedCount}`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-gray-500">Approved</p>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.approvedCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">worth ₹{stats.approvedAmount.toLocaleString('en-IN')}</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
          </button>

          {/* In Payment (partially_paid + paid) */}
          <button
            onClick={() => setFilter('in_payment')}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden group hover:shadow-md ${
              filter === 'in_payment' ? 'ring-2 ring-violet-500 ring-offset-1' : ''
            }`}
            aria-label={`In payment: ${stats.inPaymentCount}`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-gray-500">In Payment</p>
              <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-violet-600 mt-1">{stats.inPaymentCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">worth ₹{stats.inPaymentAmount.toLocaleString('en-IN')}</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-violet-500" />
          </button>

          {/* Rejected */}
          <button
            onClick={() => setFilter('rejected')}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden group hover:shadow-md ${
              filter === 'rejected' ? 'ring-2 ring-red-500 ring-offset-1' : ''
            }`}
            aria-label={`Rejected: ${stats.rejectedCount}`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-gray-500">Rejected</p>
              <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-red-600 mt-1">{stats.rejectedCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">worth ₹{stats.rejectedAmount.toLocaleString('en-IN')}</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-red-500" />
          </button>

          {/* Accounts Queries */}
          <button
            onClick={() => setFilter('accounts_query')}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden group hover:shadow-md ${
              filter === 'accounts_query' ? 'ring-2 ring-orange-500 ring-offset-1' : ''
            }`}
            aria-label={`Accounts queries: ${stats.accountsQueryCount}`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-gray-500">Queries</p>
              <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-orange-600 mt-1">{stats.accountsQueryCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {stats.correctionCount > 0 ? `+ ${stats.correctionCount} correction` : `worth ₹${stats.accountsQueryAmount.toLocaleString('en-IN')}`}
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-orange-500" />
          </button>
        </div>

        {/* ── Filter bar: vendor + count + sort ── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="flex items-center gap-3 flex-1">
            <select
              value={selectedVendor}
              onChange={(e) => { setSelectedVendor(e.target.value); setExpandedId(null); }}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[36px] max-w-xs"
              aria-label="Filter by vendor"
            >
              <option value="">All Vendors</option>
              {vendorNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <p className="text-sm text-gray-500">
              Showing {filterLabel === 'all' ? 'all' : filterLabel}{' '}
              <strong className="text-gray-700">{filteredInvoices.length}</strong> invoice{filteredInvoices.length !== 1 ? 's' : ''}
              {selectedVendor && <> for <strong className="text-gray-700">{selectedVendor}</strong></>}
            </p>
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'amount')}
            className="text-sm text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-h-[36px]"
            aria-label="Sort invoices"
          >
            <option value="date">Sort by date</option>
            <option value="amount">Sort by amount</option>
          </select>
        </div>

        {/* ── Invoice List ── */}
        {loading ? (
          <LoadingSkeleton variant="card" count={3} />
        ) : filteredInvoices.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm text-center py-16 px-6">
            {filter === 'pending' && !searchTerm ? (
              <>
                <div className="text-4xl mb-3">🎉</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">All caught up!</h3>
                <p className="text-gray-500 text-sm">No pending invoices to review. Great work.</p>
              </>
            ) : (
              <>
                <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <p className="text-gray-500 text-sm">
                  {searchTerm ? `No invoices match "${searchTerm}"` : 'No invoices found'}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredInvoices.map((invoice) => {
              const isExpanded = expandedId === invoice.id;
              const photoUrls = invoice.workPhotos ? invoice.workPhotos.split(',').filter(Boolean) : [];
              const invoiceIsImage = isImageUrl(invoice.invoiceFileUrl, invoice.invoiceFileName);
              const invoicePreview = !invoiceIsImage ? getPreviewUrl(invoice.invoiceFileUrl) : null;
              const measurementIsImage = isImageUrl(invoice.measurementSheetUrl, invoice.measurementSheetName);
              const measurementPreview = !measurementIsImage ? getPreviewUrl(invoice.measurementSheetUrl) : null;
              const isPending = invoice.status === 'submitted' || invoice.status === 'under_review';
              const isAccountsQuery = invoice.status === 'accounts_query';
              const isPaymentPhase = invoice.status === 'partially_paid' || invoice.status === 'paid';
              const cachedPayment = paymentCache[invoice.id];

              return (
                <div
                  key={invoice.id}
                  className={`group bg-white rounded-xl border border-gray-200 shadow-sm transition-all hover:shadow-md border-l-4 ${statusBorderColor(invoice.status)}`}
                  aria-label={statusAriaLabel(invoice.status)}
                >
                  {/* Invoice row */}
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer"
                    onClick={() => {
                      const newExpanded = isExpanded ? null : invoice.id;
                      setExpandedId(newExpanded);
                      // Fetch payment data for payment-phase invoices when expanding
                      if (newExpanded && isPaymentPhase && !paymentCache[invoice.id]) {
                        fetchPaymentSummary(invoice.id);
                      }
                      // Fetch approval history when expanding approved/payment-phase invoices
                      if (newExpanded && (invoice.status === 'approved' || isPaymentPhase)) {
                        fetchApprovalHistory(invoice.id);
                      }
                    }}
                    role="button"
                    aria-expanded={isExpanded}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        const newExpanded = isExpanded ? null : invoice.id;
                        setExpandedId(newExpanded);
                        if (newExpanded && isPaymentPhase && !paymentCache[invoice.id]) {
                          fetchPaymentSummary(invoice.id);
                        }
                        if (newExpanded && (invoice.status === 'approved' || isPaymentPhase)) {
                          fetchApprovalHistory(invoice.id);
                        }
                      }
                    }}
                  >
                    {/* Vendor avatar */}
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                      {getInitials(invoice.vendorName)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {invoice.project && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">
                            {invoice.project}
                          </span>
                        )}
                        <span className="font-bold text-gray-900 text-sm">{invoice.invoiceNumber}</span>
                        <span className="text-gray-400 text-xs">·</span>
                        <span className="text-sm text-gray-600">{invoice.vendorName}</span>
                        {invoice.invoiceType && <TypeBadge type={invoice.invoiceType} />}
                        <StatusBadge status={invoice.status} />
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5 truncate">{invoice.purpose}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {(() => {
                          const baseAmt = parseFloat(invoice.amount) || 0;
                          const gst = parseFloat(invoice.gstAmount || '') || 0;
                          const total = baseAmt + gst;
                          return (
                            <>
                              {gst > 0 ? (
                                <>
                                  <span className="text-base font-bold text-gray-900">
                                    ₹{total.toLocaleString('en-IN')}
                                  </span>
                                  <span className="text-[10px] text-gray-400">
                                    (₹{baseAmt.toLocaleString('en-IN')} + GST ₹{gst.toLocaleString('en-IN')})
                                  </span>
                                </>
                              ) : (
                                <span className="text-base font-bold text-gray-900">
                                  ₹{baseAmt.toLocaleString('en-IN')}
                                </span>
                              )}
                            </>
                          );
                        })()}
                        {invoice.approvedAmount && (() => {
                          const baseAmt = parseFloat(invoice.amount) || 0;
                          const gst = parseFloat(invoice.gstAmount || '') || 0;
                          const total = baseAmt + gst;
                          const approved = parseFloat(invoice.approvedAmount) || 0;
                          return approved !== total ? (
                            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                              Approved: ₹{approved.toLocaleString('en-IN')}
                            </span>
                          ) : null;
                        })()}
                        <span className="text-xs text-gray-400">
                          {formatDisplayDate(invoice.submittedAt || invoice.invoiceDate)}
                        </span>
                        {invoice.submittedBy && (
                          <span className="text-xs text-gray-400 hidden sm:inline">
                            · by {invoice.submittedBy}
                          </span>
                        )}
                      </div>

                      {/* Approved date — when this was sent to accounts */}
                      {invoice.approvedDate && !isPending && (
                        <p className="text-xs text-gray-400 mt-1">
                          <span className="text-emerald-600">✓</span> Sent to accounts on {formatDisplayDate(invoice.approvedDate)}
                          {invoice.approvedBy && <> · Approved by <span className="text-gray-500">{invoice.approvedBy}</span></>}
                        </p>
                      )}

                      {/* Mini payment progress bar on card (for invoices with payment data) */}
                      {!isPending && bulkSummaries[invoice.id] && bulkSummaries[invoice.id].paymentCount > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden max-w-[160px]">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                              style={{ width: `${Math.min(100, (bulkSummaries[invoice.id].totalPaid / (parseFloat(invoice.amount) || 1)) * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">
                            ₹{bulkSummaries[invoice.id].totalPaid.toLocaleString('en-IN')} paid
                            {bulkSummaries[invoice.id].isFullyPaid && (
                              <span className="text-emerald-600 font-medium ml-1">✓ Complete</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right side: hover actions for pending, or chevron */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Hover-reveal quick actions for pending invoices (desktop only) */}
                      {isPending && !isExpanded && (
                        <div className="hidden lg:flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedId(invoice.id); }}
                            className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200"
                            title="Expand to approve"
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedId(invoice.id); }}
                            className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors border border-red-200"
                            title="Expand to reject"
                          >
                            ✕ Reject
                          </button>
                        </div>
                      )}

                      {isAccountsQuery && !isExpanded && (
                        <div className="hidden lg:flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedId(invoice.id); }}
                            className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors border border-orange-200"
                            title="Expand to resolve query"
                          >
                            ? Resolve Query
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

                        {/* Remarks */}
                        {invoice.remarks && (
                          <div className="mb-4">
                            <p className="text-xs font-medium text-gray-500 mb-1">Remarks</p>
                            <p className="text-sm text-gray-700">{invoice.remarks}</p>
                          </div>
                        )}

                        {/* Invoice Document */}
                        {invoice.invoiceFileUrl && (
                          <div className="mb-4 rounded-lg p-4 bg-blue-50/50 border border-blue-100">
                            <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                              </svg>
                              Invoice — {invoice.invoiceFileName || 'Uploaded file'}
                            </p>
                            {invoiceIsImage && (
                              <img src={invoice.invoiceFileUrl} alt={`Invoice ${invoice.invoiceNumber}`}
                                className="w-full max-h-[500px] object-contain rounded-lg cursor-pointer hover:opacity-90 transition-opacity bg-white border border-gray-200"
                                onClick={() => setLightboxUrl(invoice.invoiceFileUrl)} />
                            )}
                            {invoicePreview && (
                              <iframe src={invoicePreview} className="w-full rounded-lg border border-gray-200"
                                style={{ height: '500px' }} title={`Invoice ${invoice.invoiceNumber} preview`} allow="autoplay" />
                            )}
                            {!invoiceIsImage && !invoicePreview && (
                              <a href={invoice.invoiceFileUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors min-h-[44px]">
                                Open Invoice in New Tab
                              </a>
                            )}
                            {(invoiceIsImage || invoicePreview) && (
                              <a href={invoice.invoiceFileUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs mt-2 text-blue-600 hover:underline">
                                Open in new tab ↗
                              </a>
                            )}
                          </div>
                        )}

                        {/* Work Photos — with R2 version history */}
                        {(photoUrls.length > 0 || invoice.workPhotos) && (
                          <PhotoViewer
                            invoiceId={invoice.id}
                            quickPhotoUrls={photoUrls}
                            showVersionHistory={true}
                          />
                        )}

                        {/* Measurement Sheet */}
                        {invoice.measurementSheetUrl && (
                          <div className="mb-4">
                            <p className="text-xs font-medium text-gray-500 mb-2">
                              Measurement Sheet — {invoice.measurementSheetName || 'Uploaded file'}
                            </p>
                            {measurementIsImage && (
                              <img src={invoice.measurementSheetUrl} alt="Measurement sheet"
                                className="w-full max-h-[400px] object-contain rounded-lg cursor-pointer hover:opacity-90 transition-opacity bg-white border border-gray-200"
                                onClick={() => setLightboxUrl(invoice.measurementSheetUrl)} />
                            )}
                            {measurementPreview && (
                              <iframe src={measurementPreview} className="w-full rounded-lg border border-gray-200"
                                style={{ height: '400px' }} title="Measurement sheet preview" allow="autoplay" />
                            )}
                            {!measurementIsImage && !measurementPreview && (
                              <a href={invoice.measurementSheetUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                                {invoice.measurementSheetName || 'View Measurement Sheet'} ↗
                              </a>
                            )}
                            {(measurementIsImage || measurementPreview) && (
                              <a href={invoice.measurementSheetUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs mt-2 text-blue-600 hover:underline">
                                Open in new tab ↗
                              </a>
                            )}
                          </div>
                        )}

                        {/* Previous approval info */}
                        {invoice.approvedBy && (
                          <div className="mb-4 rounded-lg p-3 bg-gray-50 border border-gray-100">
                            <p className="text-xs text-gray-500">
                              {invoice.status === 'rejected' ? 'Rejected' : 'Approved'} by{' '}
                              <strong className="text-gray-700">{invoice.approvedBy}</strong>
                              {invoice.approvedAmount && (
                                <span className="ml-2">
                                  · Approved <strong className="text-emerald-700">₹{Number(invoice.approvedAmount).toLocaleString('en-IN')}</strong>
                                  {(() => {
                                    const baseAmt = parseFloat(invoice.amount) || 0;
                                    const gst = parseFloat(invoice.gstAmount || '') || 0;
                                    const total = baseAmt + gst;
                                    const approved = parseFloat(invoice.approvedAmount) || 0;
                                    if (approved < total) {
                                      return <span className="text-gray-400"> of ₹{total.toLocaleString('en-IN')}</span>;
                                    }
                                    return null;
                                  })()}
                                </span>
                              )}
                            </p>
                            {invoice.approvalComments && (
                              <p className="text-sm text-gray-600 mt-1 italic">&ldquo;{invoice.approvalComments}&rdquo;</p>
                            )}
                          </div>
                        )}

                        {/* Payment progress for partially_paid / paid invoices */}
                        {isPaymentPhase && (
                          <div className="mb-4 rounded-lg p-4 bg-violet-50/50 border border-violet-100">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold text-gray-900">Payment Progress</span>
                              <StatusBadge status={invoice.status} />
                            </div>
                            {cachedPayment ? (
                              <>
                                <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                                  <div>
                                    <p className="text-gray-400">Invoice</p>
                                    <p className="font-bold text-gray-900">₹{cachedPayment.invoiceAmount.toLocaleString('en-IN')}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-400">Paid</p>
                                    <p className="font-bold text-emerald-600">₹{cachedPayment.totalPaid.toLocaleString('en-IN')}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-400">Remaining</p>
                                    <p className={`font-bold ${cachedPayment.remaining === 0 ? 'text-emerald-600' : 'text-violet-600'}`}>
                                      ₹{cachedPayment.remaining.toLocaleString('en-IN')}
                                    </p>
                                  </div>
                                </div>
                                {/* Progress bar based on invoice amount */}
                                <div className="h-2 rounded-full bg-gray-200 overflow-hidden mb-2">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                                    style={{ width: `${Math.min(100, (cachedPayment.totalPaid / cachedPayment.invoiceAmount) * 100)}%` }}
                                  />
                                </div>
                                <div className="flex items-center justify-between text-xs text-gray-400">
                                  <span>{cachedPayment.payments.length} payment{cachedPayment.payments.length !== 1 ? 's' : ''}</span>
                                  <span>{Math.round((cachedPayment.totalPaid / cachedPayment.invoiceAmount) * 100)}% of invoice</span>
                                </div>
                                {/* Show approved cap info */}
                                {cachedPayment.approvedAmount < cachedPayment.invoiceAmount && (
                                  <div className="mt-2 pt-2 border-t border-violet-100">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-gray-500">
                                        Approved cap: ₹{cachedPayment.approvedAmount.toLocaleString('en-IN')}
                                        <span className="text-gray-400"> of ₹{cachedPayment.invoiceAmount.toLocaleString('en-IN')}</span>
                                      </span>
                                      {cachedPayment.approvedCapReached && invoice.status === 'partially_paid' && (
                                        <span className="text-amber-600 font-medium">Cap reached</span>
                                      )}
                                    </div>
                                    {/* Increase Approved Amount button */}
                                    {invoice.status === 'partially_paid' && (
                                      <button
                                        onClick={() => {
                                          setIncreaseAmountInvoice(invoice);
                                          setNewApprovedAmount('');
                                        }}
                                        className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors min-h-[44px]"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Authorize Additional Payment
                                      </button>
                                    )}
                                  </div>
                                )}
                              </>
                            ) : paymentLoadErrors[invoice.id] ? (
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-red-500">Failed to load payment data</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); fetchPaymentSummary(invoice.id); }}
                                  className="text-xs px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 font-medium transition-colors"
                                >
                                  Retry
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-sm text-gray-400">
                                <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-violet-500 rounded-full animate-spin" />
                                Loading payment data…
                              </div>
                            )}
                          </div>
                        )}

                        {/* Approval History Timeline */}
                        {(invoice.status === 'approved' || isPaymentPhase) && approvalHistoryCache[invoice.id] && approvalHistoryCache[invoice.id].length > 0 && (
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Authorization History</h4>
                            <div className="relative">
                              {/* Timeline line */}
                              <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-200" />
                              <div className="space-y-3">
                                {approvalHistoryCache[invoice.id].map((entry, idx) => (
                                  <div key={entry.id} className="relative flex gap-3 items-start">
                                    {/* Timeline dot */}
                                    <div className={`relative z-10 flex-shrink-0 w-4 h-4 rounded-full border-2 mt-0.5 ${idx === 0 ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-gray-300'}`} />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-semibold text-gray-900">
                                            +₹{parseFloat(entry.amount).toLocaleString('en-IN')}
                                          </span>
                                          <span className="text-xs text-gray-400">→</span>
                                          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                            Total: ₹{parseFloat(entry.cumulativeTotal).toLocaleString('en-IN')}
                                          </span>
                                        </div>
                                        <span className="text-[10px] text-gray-400 whitespace-nowrap">{entry.createdAt}</span>
                                      </div>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-xs text-gray-500">by {entry.approvedBy}</span>
                                        {entry.comments && (
                                          <>
                                            <span className="text-gray-300">·</span>
                                            <span className="text-xs text-gray-400 italic truncate">{entry.comments}</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Action form for pending invoices */}
                        {isPending && (
                          <div className="space-y-3 bg-gray-50 rounded-lg p-4 border border-gray-100">
                            {/* Invoice Amount Breakdown */}
                            {(() => {
                              const baseAmt = parseFloat(invoice.amount) || 0;
                              const gst = parseFloat(invoice.gstAmount || '') || 0;
                              const total = baseAmt + gst;
                              return (
                                <div className="rounded-lg bg-white border border-gray-200 p-3">
                                  <p className="text-xs font-medium text-gray-500 mb-2">Invoice Amount Breakdown</p>
                                  <div className="flex items-center gap-3 text-sm">
                                    <div>
                                      <p className="text-[10px] text-gray-400 uppercase">Amount</p>
                                      <p className="font-semibold text-gray-900">₹{baseAmt.toLocaleString('en-IN')}</p>
                                    </div>
                                    {gst > 0 && (
                                      <>
                                        <span className="text-gray-300">+</span>
                                        <div>
                                          <p className="text-[10px] text-gray-400 uppercase">GST</p>
                                          <p className="font-semibold text-blue-600">₹{gst.toLocaleString('en-IN')}</p>
                                        </div>
                                        <span className="text-gray-300">=</span>
                                        <div>
                                          <p className="text-[10px] text-gray-400 uppercase">Total</p>
                                          <p className="font-bold text-gray-900">₹{total.toLocaleString('en-IN')}</p>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Approved Amount */}
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                Approved Amount <span className="text-red-500">*</span>
                                <span className="font-normal text-gray-400"> (total incl. GST — required to approve)</span>
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  max={String((parseFloat(invoice.amount) || 0) + (parseFloat(invoice.gstAmount || '') || 0))}
                                  value={getApprovedAmount(invoice.id, invoice.amount, invoice.gstAmount)}
                                  onChange={(e) => { setApprovedAmount(invoice.id, e.target.value); clearError(invoice.id); }}
                                  className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px]"
                                  aria-label="Approved amount"
                                />
                              </div>
                              {(() => {
                                const approvedVal = parseFloat(getApprovedAmount(invoice.id, invoice.amount, invoice.gstAmount)) || 0;
                                const baseAmt = parseFloat(invoice.amount) || 0;
                                const gst = parseFloat(invoice.gstAmount || '') || 0;
                                const totalInvoiceAmt = baseAmt + gst;
                                if (approvedVal > 0 && approvedVal < totalInvoiceAmt) {
                                  const diff = totalInvoiceAmt - approvedVal;
                                  return (
                                    <p className="text-xs text-amber-600 mt-1">
                                      ₹{diff.toLocaleString('en-IN')} less than total invoice amount (₹{totalInvoiceAmt.toLocaleString('en-IN')})
                                    </p>
                                  );
                                }
                                return null;
                              })()}
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                Rejection Reason <span className="text-red-500">*</span>
                                <span className="font-normal text-gray-400"> (required to reject)</span>
                              </label>
                              <select
                                value={getReason(invoice.id)}
                                onChange={(e) => { setReason(invoice.id, e.target.value); clearError(invoice.id); }}
                                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                                aria-label="Select rejection reason"
                              >
                                <option value="">— Select reason —</option>
                                {rejectionReasons.map((r) => (
                                  <option key={r.id} value={r.reason}>{r.reason}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                Remarks / Comments <span className="text-red-500">*</span>
                                <span className="font-normal text-gray-400"> (required to approve or reject)</span>
                              </label>
                              <textarea
                                value={getComment(invoice.id)}
                                onChange={(e) => { setComment(invoice.id, e.target.value); clearError(invoice.id); }}
                                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                rows={2}
                                placeholder="e.g., Verified work completion on site, amounts match..."
                              />
                            </div>

                            {getError(invoice.id) && (
                              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">
                                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                                </svg>
                                {getError(invoice.id)}
                              </div>
                            )}

                            <div className="flex gap-2">
                              <button
                                onClick={() => requestAction(invoice.id, invoice.invoiceNumber, 'approved', invoice.amount, invoice.gstAmount)}
                                disabled={actionLoading === invoice.id}
                                className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                Approve
                              </button>
                              <button
                                onClick={() => requestAction(invoice.id, invoice.invoiceNumber, 'rejected')}
                                disabled={actionLoading === invoice.id}
                                className="flex-1 inline-flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Reject
                              </button>
                              <button
                                onClick={() => requestAction(invoice.id, invoice.invoiceNumber, 'under_review')}
                                disabled={actionLoading === invoice.id}
                                className="inline-flex items-center justify-center gap-1 bg-amber-500 text-white px-3 py-2.5 rounded-lg font-semibold text-sm hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                              >
                                Review
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Accounts Query resolution form */}
                        {isAccountsQuery && (
                          <div className="space-y-3 bg-orange-50 rounded-lg p-4 border border-orange-200">
                            {/* Query details */}
                            <div className="rounded-lg bg-white border border-orange-200 p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                                </svg>
                                <p className="text-sm font-semibold text-orange-800">Accounts Query Raised</p>
                              </div>
                              <div className="space-y-1.5 text-sm">
                                <div className="flex items-start gap-2">
                                  <span className="text-gray-500 whitespace-nowrap min-w-[70px]">Raised by:</span>
                                  <span className="font-medium text-gray-900">{invoice.accountsQueryBy || '—'}</span>
                                </div>
                                <div className="flex items-start gap-2">
                                  <span className="text-gray-500 whitespace-nowrap min-w-[70px]">Reason:</span>
                                  <span className="font-medium text-gray-900">{invoice.accountsQueryReason || '—'}</span>
                                </div>
                                <div className="flex items-start gap-2">
                                  <span className="text-gray-500 whitespace-nowrap min-w-[70px]">Date:</span>
                                  <span className="text-gray-600">{invoice.accountsQueryAt ? formatDisplayDate(invoice.accountsQueryAt) : '—'}</span>
                                </div>
                                {invoice.previousStatus && (
                                  <div className="flex items-start gap-2">
                                    <span className="text-gray-500 whitespace-nowrap min-w-[70px]">Was:</span>
                                    <StatusBadge status={invoice.previousStatus as InvoiceStatus} />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Resolution comment */}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Your Response <span className="text-red-500">*</span>
                                <span className="font-normal text-gray-400"> (required for both actions)</span>
                              </label>
                              <textarea
                                value={queryResolutionComments[invoice.id] || ''}
                                onChange={(e) => {
                                  setQueryResolutionComments((prev) => ({ ...prev, [invoice.id]: e.target.value }));
                                  setQueryResolutionError((prev) => { const n = { ...prev }; delete n[invoice.id]; return n; });
                                }}
                                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                rows={2}
                                placeholder="Explain your decision..."
                              />
                            </div>

                            {queryResolutionError[invoice.id] && (
                              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">
                                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                                </svg>
                                {queryResolutionError[invoice.id]}
                              </div>
                            )}

                            <div className="flex gap-2">
                              <button
                                onClick={() => handleResolveQuery(invoice.id, 'accept')}
                                disabled={queryResolutionLoading === invoice.id}
                                className="flex-1 inline-flex items-center justify-center gap-2 bg-orange-600 text-white px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                Accept &amp; Send for Correction
                              </button>
                              <button
                                onClick={() => handleResolveQuery(invoice.id, 'disagree')}
                                disabled={queryResolutionLoading === invoice.id}
                                className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                                </svg>
                                Disagree &amp; Send Back to Accounts
                              </button>
                            </div>
                          </div>
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

      {/* ── Confirmation Dialog ── */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setConfirmDialog(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm action"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full text-center p-6" onClick={(e) => e.stopPropagation()}>
            <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-3 ${
              confirmDialog.action === 'approved' ? 'bg-emerald-50' : confirmDialog.action === 'rejected' ? 'bg-red-50' : 'bg-amber-50'
            }`}>
              {confirmDialog.action === 'approved' && (
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {confirmDialog.action === 'rejected' && (
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {confirmDialog.action === 'under_review' && (
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Action</h3>
            <p className="text-sm text-gray-600 mb-5">{confirmDialog.message}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDialog(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors min-h-[44px]">
                Cancel
              </button>
              <button onClick={executeAction}
                className={`flex-1 px-4 py-2.5 rounded-lg text-white font-semibold text-sm min-h-[44px] transition-colors ${
                  confirmDialog.action === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700'
                  : confirmDialog.action === 'rejected' ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-amber-500 hover:bg-amber-600'
                }`}>
                Yes, {confirmDialog.action === 'approved' ? 'Approve' : confirmDialog.action === 'rejected' ? 'Reject' : 'Mark Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Authorize Additional Payment Modal (Additive Model) ── */}
      {increaseAmountInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setIncreaseAmountInvoice(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Authorize Additional Payment"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Authorize Additional Payment</h3>
              <button onClick={() => setIncreaseAmountInvoice(null)} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="Close">×</button>
            </div>

            {(() => {
              const cachedPay = paymentCache[increaseAmountInvoice.id];
              const totalPaid = cachedPay?.totalPaid ?? 0;
              const currentApproved = parseFloat(increaseAmountInvoice.approvedAmount || increaseAmountInvoice.amount) || 0;
              const invoiceAmt = parseFloat(increaseAmountInvoice.amount) || 0;
              const gstAmt = parseFloat(increaseAmountInvoice.gstAmount || '') || 0;
              const totalInvoiceAmt = invoiceAmt + gstAmt;
              const maxAdditional = Math.max(0, totalInvoiceAmt - currentApproved);
              const remainingOnInvoice = totalInvoiceAmt - totalPaid;
              const additionalVal = parseFloat(newApprovedAmount) || 0;
              const newCumulative = currentApproved + additionalVal;
              return (
                <>
                  <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 mb-4">
                    <p className="text-sm font-medium text-gray-900">
                      #{increaseAmountInvoice.invoiceNumber} — {increaseAmountInvoice.vendorName}
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2 text-xs">
                      <div>
                        <span className="text-gray-400">Invoice Total</span>
                        <p className="font-bold text-gray-900">₹{totalInvoiceAmt.toLocaleString('en-IN')}</p>
                        {gstAmt > 0 && <p className="text-[10px] text-gray-400">(₹{invoiceAmt.toLocaleString('en-IN')} + GST ₹{gstAmt.toLocaleString('en-IN')})</p>}
                      </div>
                      <div>
                        <span className="text-gray-400">Total Authorized So Far</span>
                        <p className="font-bold text-emerald-700">₹{currentApproved.toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Already Paid</span>
                        <p className="font-bold text-violet-600">₹{totalPaid.toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Remaining on Invoice</span>
                        <p className="font-bold text-amber-600">₹{remainingOnInvoice.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Additional Amount to Authorize <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={maxAdditional}
                          value={newApprovedAmount}
                          onChange={(e) => { setNewApprovedAmount(e.target.value); setIncreaseError(''); }}
                          className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 min-h-[44px]"
                          placeholder={`Up to ₹${maxAdditional.toLocaleString('en-IN')}`}
                          aria-label="Additional amount to authorize"
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Max additional: ₹{maxAdditional.toLocaleString('en-IN')} · This amount will be <strong>added</strong> to the current authorization
                      </p>
                      {additionalVal > 0 && additionalVal <= maxAdditional + 0.01 && (
                        <div className="mt-2 p-2 rounded bg-emerald-50 border border-emerald-100">
                          <p className="text-xs text-emerald-700">
                            New total authorized: ₹{currentApproved.toLocaleString('en-IN')} + ₹{additionalVal.toLocaleString('en-IN')} = <strong>₹{newCumulative.toLocaleString('en-IN')}</strong>
                          </p>
                          <p className="text-xs text-emerald-600 mt-0.5">
                            Accounts can pay ₹{Math.max(0, newCumulative - totalPaid).toLocaleString('en-IN')} after this
                          </p>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Comments (optional)</label>
                      <textarea
                        value={increaseComment}
                        onChange={(e) => setIncreaseComment(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                        rows={2}
                        placeholder="Reason for authorizing additional payment…"
                      />
                    </div>
                  </div>

                  {/* Validation error */}
                  {increaseError && (
                    <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-100 text-red-700 text-xs" role="alert">
                      <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                      </svg>
                      {increaseError}
                    </div>
                  )}

                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={() => { setIncreaseAmountInvoice(null); setIncreaseError(''); }}
                      className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors min-h-[44px]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleIncreaseApprovedAmount}
                      disabled={increaseLoading || !newApprovedAmount}
                      className="flex-1 px-4 py-2.5 rounded-lg bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                    >
                      {increaseLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Authorizing…
                        </span>
                      ) : (
                        'Authorize Payment'
                      )}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-label="Full size photo"
        >
          <button onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            aria-label="Close lightbox">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img src={lightboxUrl} alt="Full size"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
