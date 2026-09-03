'use client';

import { useState, useEffect } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { INVOICE_STATUSES } from '@/lib/constants';
import type { InvoiceStatus } from '@/lib/constants';

interface Invoice {
  id: string;
  vendorName: string;
  invoiceDate: string;
  invoiceNumber: string;
  purpose: string;
  amount: string;
  remarks: string;
  fileUrl: string;
  fileName: string;
  status: InvoiceStatus;
  approvedBy: string;
  submittedAt: string;
  updatedAt: string;
  approvedDate: string;
}

export default function AdminInvoices() {
  const { isReady } = useAdminAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Confirmation dialog for status changes
  const [confirmDialog, setConfirmDialog] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    currentStatus: string;
    newStatus: InvoiceStatus;
  } | null>(null);

  // Comments dialog for approve/reject
  const [commentsDialog, setCommentsDialog] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    newStatus: InvoiceStatus;
    comments: string;
  } | null>(null);

  useEffect(() => {
    if (!isReady) return;
    fetchInvoices();
  }, [isReady]);

  const fetchInvoices = async () => {
    try {
      // Cookie is sent automatically — no Authorization header needed
      const res = await fetch('/api/invoices');
      const data = await res.json();
      if (res.ok) {
        setInvoices(data.invoices || []);
      }
    } catch {
      console.error('Failed to fetch invoices');
    }
    setLoading(false);
  };

  const handleStatusChange = (invoice: Invoice, newStatus: InvoiceStatus) => {
    if (newStatus === invoice.status) return;

    // For approve/reject, require comments
    if (newStatus === 'approved' || newStatus === 'rejected') {
      setCommentsDialog({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        newStatus,
        comments: '',
      });
      return;
    }

    // For other statuses, show simple confirmation
    setConfirmDialog({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      currentStatus: INVOICE_STATUSES[invoice.status]?.label || invoice.status,
      newStatus,
    });
  };

  const executeStatusChange = async (invoiceId: string, newStatus: InvoiceStatus, comments?: string) => {
    setConfirmDialog(null);
    setCommentsDialog(null);
    setUpdatingId(invoiceId);
    setStatusMessage(null);

    try {
      // Cookie is sent automatically — no Authorization header needed
      const res = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: invoiceId,
          status: newStatus,
          approvalComments: comments || '',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === invoiceId ? { ...inv, status: newStatus } : inv
          )
        );
        setStatusMessage({ type: 'success', text: `Invoice status updated to ${INVOICE_STATUSES[newStatus]?.label || newStatus}` });
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Failed to update status' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Network error. Please try again.' });
    }
    setUpdatingId(null);
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesFilter = filter === 'all' || inv.status === filter;
    const matchesSearch =
      !searchTerm ||
      inv.vendorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.purpose.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (!isReady) return null;

  return (
    <div className="page-container">
      <AdminHeader />

      <main className="max-w-6xl mx-auto p-4 mt-4 fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">All Invoices</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field text-sm"
              style={{ maxWidth: '200px' }}
              aria-label="Search invoices"
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="input-field text-sm"
              style={{ maxWidth: '160px' }}
              aria-label="Filter by status"
            >
              <option value="all">All Status</option>
              {Object.entries(INVOICE_STATUSES).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Status change message */}
        {statusMessage && (
          <div className={`alert ${statusMessage.type === 'success' ? 'alert-success' : 'alert-error'} mb-4`}>
            {statusMessage.text}
          </div>
        )}

        {loading ? (
          <LoadingSkeleton variant="card" count={4} />
        ) : filteredInvoices.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-[var(--text-muted)]">No invoices found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredInvoices.map((invoice) => (
              <div key={invoice.id} className="card">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  {/* Invoice Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="font-bold text-[var(--text-primary)]">
                        {invoice.invoiceNumber}
                      </span>
                      <span className="text-sm text-[var(--text-muted)]">&bull;</span>
                      <span className="text-sm text-[var(--text-secondary)]">
                        {invoice.vendorName}
                      </span>
                      <span className="text-sm text-[var(--text-muted)]">&bull;</span>
                      <span className="text-sm text-[var(--text-muted)]">
                        {new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}
                      </span>
                      <StatusBadge status={invoice.status} />
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] mb-1">{invoice.purpose}</p>
                    <div className="flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
                      <span className="font-semibold text-base text-[var(--text-primary)]">
                        ₹{Number(invoice.amount).toLocaleString('en-IN')}
                      </span>
                      {invoice.remarks && <span className="self-center">Remarks: {invoice.remarks}</span>}
                      {invoice.fileUrl && (
                        <a
                          href={invoice.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="self-center inline-flex items-center gap-1 hover:underline"
                          style={{ color: 'var(--primary)' }}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                          </svg>
                          {invoice.fileName || 'View File'}
                        </a>
                      )}
                    </div>
                    {/* Dates */}
                    <div className="flex flex-wrap gap-4 text-xs text-[var(--text-muted)] mt-1.5">
                      {invoice.submittedAt && (
                        <span className="inline-flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Submitted: {new Date(invoice.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                      {(invoice.status === 'approved' || invoice.status === 'paid') && invoice.approvedDate && (
                        <span className="inline-flex items-center gap-1" style={{ color: 'var(--success)' }}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Approved: {new Date(invoice.approvedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {invoice.approvedBy && ` by ${invoice.approvedBy}`}
                        </span>
                      )}
                      {invoice.status === 'rejected' && invoice.updatedAt && (
                        <span className="inline-flex items-center gap-1" style={{ color: 'var(--danger)' }}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Rejected: {new Date(invoice.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status Update */}
                  <div className="flex-shrink-0">
                    <select
                      value={invoice.status}
                      onChange={(e) => handleStatusChange(invoice, e.target.value as InvoiceStatus)}
                      disabled={updatingId === invoice.id}
                      className="input-field text-sm"
                      style={{ minWidth: '140px' }}
                      aria-label={`Update status for ${invoice.invoiceNumber}`}
                    >
                      {Object.entries(INVOICE_STATUSES).map(([key, val]) => (
                        <option key={key} value={key}>{val.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Simple Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => {
            // Revert the select to current status
            setConfirmDialog(null);
          }}
          role="dialog" aria-modal="true"
        >
          <div className="card max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Change Status?</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-5">
              Change <strong>{confirmDialog.invoiceNumber}</strong> from{' '}
              <strong>{confirmDialog.currentStatus}</strong> to{' '}
              <strong>{INVOICE_STATUSES[confirmDialog.newStatus]?.label || confirmDialog.newStatus}</strong>?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDialog(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => executeStatusChange(confirmDialog.invoiceId, confirmDialog.newStatus)}
                className="btn-primary flex-1"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comments Dialog for approve/reject */}
      {commentsDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setCommentsDialog(null)}
          role="dialog" aria-modal="true"
        >
          <div className="card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">
              {commentsDialog.newStatus === 'approved' ? 'Approve' : 'Reject'} Invoice
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {commentsDialog.newStatus === 'approved'
                ? `Add approval remarks for ${commentsDialog.invoiceNumber}:`
                : `Add rejection reason for ${commentsDialog.invoiceNumber}:`}
            </p>
            <textarea
              value={commentsDialog.comments}
              onChange={(e) => setCommentsDialog({ ...commentsDialog, comments: e.target.value })}
              className="input-field text-sm mb-4"
              rows={3}
              placeholder={commentsDialog.newStatus === 'approved'
                ? 'e.g., Verified and approved for payment...'
                : 'e.g., Invoice amount does not match PO...'}
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setCommentsDialog(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => {
                  if (!commentsDialog.comments.trim()) return;
                  executeStatusChange(commentsDialog.invoiceId, commentsDialog.newStatus, commentsDialog.comments.trim());
                }}
                disabled={!commentsDialog.comments.trim()}
                className={`flex-1 ${commentsDialog.newStatus === 'approved' ? 'btn-success' : 'btn-danger'}`}
              >
                {commentsDialog.newStatus === 'approved' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
