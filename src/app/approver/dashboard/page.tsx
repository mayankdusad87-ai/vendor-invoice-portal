'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import StatusBadge from '@/components/ui/StatusBadge';
import TypeBadge from '@/components/ui/TypeBadge';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useApproverAuth } from '@/hooks/useApproverAuth';
import type { InvoiceStatus } from '@/lib/constants';

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
}

interface RejectionReason {
  id: string;
  reason: string;
}

function isImageUrl(url: string, fileName?: string): boolean {
  if (!url) return false;
  // Proxy URLs — check the original file name for extension
  if (url.startsWith('/api/files/')) {
    if (fileName) {
      return /\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(fileName);
    }
    return false; // Unknown type without filename — treat as non-image
  }
  // Legacy direct Google Drive image URLs
  if (url.includes('lh3.googleusercontent.com/d/')) return true;
  if (url.includes('drive.google.com/uc')) return true;
  if (/\.(jpg|jpeg|png|webp|gif|heic)(\?|$)/i.test(url)) return true;
  return false;
}

function getPreviewUrl(url: string): string | null {
  if (!url) return null;
  // Proxy URLs work directly in iframes (PDFs render inline)
  if (url.startsWith('/api/files/')) return url;
  // Legacy Google Drive URLs
  const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)\//);
  if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
  return null;
}

export default function ApproverDashboard() {
  const { approverName, isReady, logout } = useApproverAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Per-invoice action state — keyed by invoice ID so it never bleeds
  const [comments, setComments] = useState<Record<string, string>>({});
  const [selectedReasons, setSelectedReasons] = useState<Record<string, string>>({});
  const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    action: InvoiceStatus;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!isReady) return;
    fetchInvoices();
    fetchRejectionReasons();
  }, [isReady]);

  const fetchInvoices = async () => {
    try {
      // Cookie is sent automatically — no Authorization header needed
      const res = await fetch('/api/invoices');
      const data = await res.json();
      if (res.ok) setInvoices(data.invoices || []);
    } catch {
      console.error('Failed to fetch invoices');
    }
    setLoading(false);
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

  const getComment = (id: string) => comments[id] || '';
  const getReason = (id: string) => selectedReasons[id] || '';
  const getError = (id: string) => actionError[id] || '';

  const setComment = (id: string, value: string) =>
    setComments((prev) => ({ ...prev, [id]: value }));
  const setReason = (id: string, value: string) =>
    setSelectedReasons((prev) => ({ ...prev, [id]: value }));
  const setError = (id: string, value: string) =>
    setActionError((prev) => ({ ...prev, [id]: value }));
  const clearError = (id: string) =>
    setActionError((prev) => { const next = { ...prev }; delete next[id]; return next; });

  // Validate before showing confirmation
  const requestAction = (invoiceId: string, invoiceNumber: string, status: InvoiceStatus) => {
    clearError(invoiceId);
    const comment = getComment(invoiceId).trim();
    const reason = getReason(invoiceId);

    if (status === 'approved' && !comment) {
      setError(invoiceId, 'Please add approval remarks before approving');
      return;
    }

    if (status === 'rejected' && !reason && !comment) {
      setError(invoiceId, 'Please select a rejection reason or add comments');
      return;
    }

    // Show confirmation dialog
    const actionLabels: Record<string, string> = {
      approved: 'APPROVE',
      rejected: 'REJECT',
      under_review: 'mark as Under Review',
    };

    setConfirmDialog({
      invoiceId,
      invoiceNumber,
      action: status,
      message: `Are you sure you want to ${actionLabels[status] || status} invoice ${invoiceNumber}?`,
    });
  };

  const executeAction = useCallback(async () => {
    if (!confirmDialog) return;
    const { invoiceId, action } = confirmDialog;
    setConfirmDialog(null);

    const comment = getComment(invoiceId).trim();
    const reason = getReason(invoiceId);

    const approvalComments = action === 'rejected'
      ? (reason ? `${reason}${comment ? ` — ${comment}` : ''}` : comment)
      : comment;

    setActionLoading(invoiceId);
    clearError(invoiceId);
    try {
      // Cookie is sent automatically — no Authorization header needed
      const res = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: invoiceId, status: action, approvalComments }),
      });

      const data = await res.json();
      if (res.ok) {
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === invoiceId
              ? { ...inv, status: action, approvalComments, approvedBy: approverName }
              : inv
          )
        );
        // Clear form state for this invoice
        setComment(invoiceId, '');
        setReason(invoiceId, '');
        setExpandedId(null);
      } else {
        setError(invoiceId, data.error || 'Action failed');
      }
    } catch {
      setError(invoiceId, 'Network error. Please try again.');
    }
    setActionLoading(null);
  }, [confirmDialog, comments, selectedReasons, approverName]);

  const filteredInvoices = invoices.filter((inv) => {
    if (filter === 'pending') return inv.status === 'submitted' || inv.status === 'under_review';
    if (filter === 'approved') return inv.status === 'approved';
    if (filter === 'rejected') return inv.status === 'rejected';
    return true;
  });

  // Summary stats
  const stats = useMemo(() => {
    const pending = invoices.filter((i) => i.status === 'submitted' || i.status === 'under_review');
    const approved = invoices.filter((i) => i.status === 'approved');
    const rejected = invoices.filter((i) => i.status === 'rejected');
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
    };
  }, [invoices]);

  const pendingCount = stats.pendingCount;

  if (!isReady) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header — white premium */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Approver Dashboard</h1>
            <p className="text-xs text-gray-500">Welcome, {approverName} · {pendingCount} pending</p>
          </div>
          <button
            onClick={logout}
            className="text-sm font-medium min-h-[44px] px-3 text-gray-400 hover:text-red-500 transition-colors"
            aria-label="Log out"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 mt-4 fade-in">
        {/* Summary Stat Cards — dark tiles on white background */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <button
            onClick={() => setFilter('all')}
            className={`rounded-xl p-4 text-left transition-all border-2 ${
              filter === 'all' ? 'border-blue-500 shadow-lg shadow-blue-500/10' : 'border-transparent'
            }`}
            style={{ background: '#111827' }}
          >
            <p className="text-xs font-medium text-gray-400 mb-1">Total Invoices</p>
            <p className="text-2xl font-bold text-white">{stats.total}</p>
            <p className="text-xs text-gray-500 mt-1">₹{stats.totalAmount.toLocaleString('en-IN')}</p>
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`rounded-xl p-4 text-left transition-all border-2 ${
              filter === 'pending' ? 'border-amber-500 shadow-lg shadow-amber-500/10' : 'border-transparent'
            }`}
            style={{ background: '#111827' }}
          >
            <p className="text-xs font-medium text-gray-400 mb-1">Pending Review</p>
            <p className="text-2xl font-bold text-amber-400">{stats.pendingCount}</p>
            <p className="text-xs text-gray-500 mt-1">₹{stats.pendingAmount.toLocaleString('en-IN')}</p>
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`rounded-xl p-4 text-left transition-all border-2 ${
              filter === 'approved' ? 'border-emerald-500 shadow-lg shadow-emerald-500/10' : 'border-transparent'
            }`}
            style={{ background: '#111827' }}
          >
            <p className="text-xs font-medium text-gray-400 mb-1">Approved</p>
            <p className="text-2xl font-bold text-emerald-400">{stats.approvedCount}</p>
            <p className="text-xs text-gray-500 mt-1">₹{stats.approvedAmount.toLocaleString('en-IN')}</p>
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`rounded-xl p-4 text-left transition-all border-2 ${
              filter === 'rejected' ? 'border-red-500 shadow-lg shadow-red-500/10' : 'border-transparent'
            }`}
            style={{ background: '#111827' }}
          >
            <p className="text-xs font-medium text-gray-400 mb-1">Rejected</p>
            <p className="text-2xl font-bold text-red-400">{stats.rejectedCount}</p>
            <p className="text-xs text-gray-500 mt-1">₹{stats.rejectedAmount.toLocaleString('en-IN')}</p>
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1" role="tablist" aria-label="Filter invoices">
          {[
            { key: 'pending', label: `Pending (${pendingCount})` },
            { key: 'approved', label: 'Approved' },
            { key: 'rejected', label: 'Rejected' },
            { key: 'all', label: 'All' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              role="tab"
              aria-selected={filter === tab.key}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors min-h-[44px] ${
                filter === tab.key
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Invoice List */}
        {loading ? (
          <LoadingSkeleton variant="card" count={3} />
        ) : filteredInvoices.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm text-center py-12">
            <p className="text-gray-500">
              {filter === 'pending' ? 'No pending invoices to review' : 'No invoices found'}
            </p>
            {filter === 'pending' && (
              <svg className="w-10 h-10 mx-auto mt-3 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredInvoices.map((invoice) => {
              const isExpanded = expandedId === invoice.id;
              const photoUrls = invoice.workPhotos ? invoice.workPhotos.split(',').filter(Boolean) : [];
              const invoiceIsImage = isImageUrl(invoice.invoiceFileUrl, invoice.invoiceFileName);
              const invoicePreview = !invoiceIsImage ? getPreviewUrl(invoice.invoiceFileUrl) : null;
              const measurementIsImage = isImageUrl(invoice.measurementSheetUrl, invoice.measurementSheetName);
              const measurementPreview = !measurementIsImage ? getPreviewUrl(invoice.measurementSheetUrl) : null;
              const isPending = invoice.status === 'submitted' || invoice.status === 'under_review';

              return (
                <div key={invoice.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 transition-shadow hover:shadow-md">
                  {/* Invoice Header — click to expand */}
                  <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : invoice.id)}
                    role="button"
                    aria-expanded={isExpanded}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isExpanded ? null : invoice.id); } }}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-gray-900">{invoice.invoiceNumber}</span>
                        <span className="text-sm text-gray-400">·</span>
                        <span className="text-sm text-gray-600">{invoice.vendorName}</span>
                        {invoice.invoiceType && <TypeBadge type={invoice.invoiceType} />}
                        <StatusBadge status={invoice.status} />
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{invoice.purpose}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                        <span className="font-semibold text-base text-gray-900">
                          ₹{Number(invoice.amount).toLocaleString('en-IN')}
                        </span>
                        <span className="self-center">
                          {new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}
                        </span>
                        {invoice.submittedBy && (
                          <span className="self-center inline-flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                            </svg>
                            {invoice.submittedBy}
                          </span>
                        )}
                        {photoUrls.length > 0 && (
                          <span className="self-center inline-flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            </svg>
                            {photoUrls.length} photo(s)
                          </span>
                        )}
                        {invoice.invoiceFileUrl && (
                          <span className="self-center inline-flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                            </svg>
                            Invoice
                          </span>
                        )}
                      </div>
                    </div>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {/* ===== Expanded Details ===== */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100">

                      {/* Remarks */}
                      {invoice.remarks && (
                        <div className="mb-4">
                          <p className="text-xs font-medium text-gray-500 mb-1">Remarks</p>
                          <p className="text-sm text-gray-700">{invoice.remarks}</p>
                        </div>
                      )}

                      {/* ── Invoice Document ── */}
                      {invoice.invoiceFileUrl && (
                        <div className="mb-4 rounded-lg p-4 bg-blue-50 border border-blue-100">
                          <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                            </svg>
                            Invoice Document — {invoice.invoiceFileName || 'Uploaded file'}
                          </p>
                          {invoiceIsImage && (
                            <img
                              src={invoice.invoiceFileUrl}
                              alt={`Invoice ${invoice.invoiceNumber}`}
                              className="w-full max-h-[500px] object-contain rounded-lg cursor-pointer hover:opacity-90 transition-opacity bg-white border border-gray-200"
                              onClick={() => setLightboxUrl(invoice.invoiceFileUrl)}
                            />
                          )}
                          {invoicePreview && (
                            <iframe
                              src={invoicePreview}
                              className="w-full rounded-lg border border-gray-200"
                              style={{ height: '500px' }}
                              title={`Invoice ${invoice.invoiceNumber} preview`}
                              allow="autoplay"
                            />
                          )}
                          {!invoiceIsImage && !invoicePreview && (
                            <a href={invoice.invoiceFileUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                              Open Invoice in New Tab
                            </a>
                          )}
                          {(invoiceIsImage || invoicePreview) && (
                            <a href={invoice.invoiceFileUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs mt-2 text-blue-600 hover:underline">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                              Open in new tab
                            </a>
                          )}
                        </div>
                      )}

                      {/* ── Work Photos ── */}
                      {photoUrls.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            </svg>
                            Work Photos / Evidence ({photoUrls.length})
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {photoUrls.map((url, i) => (
                              <img key={i} src={url} alt={`Work photo ${i + 1}`}
                                className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity border border-gray-200"
                                onClick={() => setLightboxUrl(url)} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ── Measurement Sheet ── */}
                      {invoice.measurementSheetUrl && (
                        <div className="mb-4">
                          <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Measurement Sheet — {invoice.measurementSheetName || 'Uploaded file'}
                          </p>
                          {measurementIsImage && (
                            <img src={invoice.measurementSheetUrl} alt="Measurement sheet"
                              className="w-full max-h-[400px] object-contain rounded-lg cursor-pointer hover:opacity-90 transition-opacity bg-white border border-gray-200"
                              onClick={() => setLightboxUrl(invoice.measurementSheetUrl)} />
                          )}
                          {measurementPreview && (
                            <iframe src={measurementPreview} className="w-full rounded-lg border border-gray-200"
                              style={{ height: '400px' }}
                              title="Measurement sheet preview" allow="autoplay" />
                          )}
                          {!measurementIsImage && !measurementPreview && (
                            <a href={invoice.measurementSheetUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                              {invoice.measurementSheetName || 'View Measurement Sheet'}
                            </a>
                          )}
                          {(measurementIsImage || measurementPreview) && (
                            <a href={invoice.measurementSheetUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs mt-2 text-blue-600 hover:underline">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                              Open in new tab
                            </a>
                          )}
                        </div>
                      )}

                      {/* ── Previous approval info ── */}
                      {invoice.approvedBy && (
                        <div className="mb-4 rounded-lg p-3 bg-gray-50 border border-gray-100">
                          <p className="text-xs text-gray-500">
                            {invoice.status === 'rejected' ? 'Rejected' : 'Approved'} by <strong className="text-gray-700">{invoice.approvedBy}</strong>
                          </p>
                          {invoice.approvalComments && (
                            <p className="text-sm text-gray-600 mt-1 italic">&ldquo;{invoice.approvalComments}&rdquo;</p>
                          )}
                        </div>
                      )}

                      {/* ── Action Buttons (for pending invoices) ── */}
                      {isPending && (
                        <div className="space-y-3">
                          {/* Rejection Reason Dropdown */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              Rejection Reason
                              <span className="text-red-500 ml-0.5">*</span>
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

                          {/* Approval/Additional Comments */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              Remarks / Comments
                              <span className="text-red-500 ml-0.5">*</span>
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

                          {/* Per-invoice error */}
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
                              onClick={() => requestAction(invoice.id, invoice.invoiceNumber, 'approved')}
                              disabled={actionLoading === invoice.id}
                              className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                              title={!getComment(invoice.id).trim() ? 'Add remarks first' : 'Approve this invoice'}
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
                              title={!getReason(invoice.id) && !getComment(invoice.id).trim() ? 'Select a rejection reason first' : 'Reject this invoice'}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              Reject
                            </button>
                            <button
                              onClick={() => requestAction(invoice.id, invoice.invoiceNumber, 'under_review')}
                              disabled={actionLoading === invoice.id}
                              className="inline-flex items-center justify-center gap-2 bg-amber-500 text-white px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                            >
                              Review
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setConfirmDialog(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm action"
        >
          <div
            className="bg-white rounded-xl border border-gray-200 shadow-xl max-w-sm w-full text-center p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-3 ${
              confirmDialog.action === 'approved' ? 'bg-emerald-50'
              : confirmDialog.action === 'rejected' ? 'bg-red-50'
              : 'bg-amber-50'
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
              <button
                onClick={executeAction}
                className={`flex-1 px-4 py-2.5 rounded-lg text-white font-semibold text-sm min-h-[44px] transition-colors ${
                  confirmDialog.action === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700'
                  : confirmDialog.action === 'rejected' ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                Yes, {confirmDialog.action === 'approved' ? 'Approve' : confirmDialog.action === 'rejected' ? 'Reject' : 'Mark Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-label="Full size photo"
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            aria-label="Close lightbox"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
