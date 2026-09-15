'use client';

import { useState, useEffect, useMemo } from 'react';
import StatusBadge from '@/components/ui/StatusBadge';
import TypeBadge from '@/components/ui/TypeBadge';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { INVOICE_STATUSES } from '@/lib/constants';
import type { InvoiceStatus } from '@/lib/constants';

interface Invoice {
  id: string;
  project?: string;
  vendorName: string;
  invoiceDate: string;
  invoiceNumber: string;
  purpose: string;
  amount: string;
  gstAmount?: string;
  remarks: string;
  fileUrl: string;
  fileName: string;
  status: InvoiceStatus;
  approvedBy: string;
  submittedAt: string;
  updatedAt: string;
  approvedDate: string;
  invoiceType: string;
  submittedBy: string;
  documentStage?: string;
}

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'partially_paid', label: 'Partially Paid' },
  { key: 'paid', label: 'Paid' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'accounts_query', label: 'Query' },
  { key: 'correction_required', label: 'Correction' },
];

const PAGE_SIZE = 25;

export default function AdminInvoices() {
  const { isReady } = useAdminAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    currentStatus: string;
    newStatus: InvoiceStatus;
  } | null>(null);

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
    if (newStatus === 'approved' || newStatus === 'rejected') {
      setCommentsDialog({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        newStatus,
        comments: '',
      });
      return;
    }
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
        setStatusMessage({ type: 'success', text: `Status updated to ${INVOICE_STATUSES[newStatus]?.label || newStatus}` });
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Failed to update status' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Network error. Please try again.' });
    }
    setUpdatingId(null);
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: invoices.length };
    for (const inv of invoices) {
      counts[inv.status] = (counts[inv.status] || 0) + 1;
    }
    return counts;
  }, [invoices]);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return invoices.filter((inv) => {
      if (activeTab !== 'all' && inv.status !== activeTab) return false;
      if (q) {
        return (
          inv.vendorName.toLowerCase().includes(q) ||
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.purpose.toLowerCase().includes(q) ||
          (inv.project || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [invoices, activeTab, searchTerm]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageInvoices = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [activeTab, searchTerm]);

  if (!isReady) return null;

  return (
    <div>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Invoices</h2>
          <p className="text-xs text-[var(--text-muted)]">{invoices.length} total invoices</p>
        </div>
        <div className="relative" style={{ maxWidth: '260px', width: '100%' }}>
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            placeholder="Search invoices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field text-sm pl-9"
            aria-label="Search invoices"
          />
        </div>
      </div>

      {/* Status tabs */}
      <div className="admin-status-tabs">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`admin-status-tab ${activeTab === tab.key ? 'active' : ''}`}
          >
            {tab.label}
            {(statusCounts[tab.key] || 0) > 0 && (
              <span className="tab-count">{statusCounts[tab.key]}</span>
            )}
          </button>
        ))}
      </div>

      {statusMessage && (
        <div className={`alert ${statusMessage.type === 'success' ? 'alert-success' : 'alert-error'} mb-4`}>
          {statusMessage.text}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton variant="list" count={8} />
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--text-muted)]">
            {searchTerm ? 'No invoices match your search' : 'No invoices in this category'}
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="pl-4">Invoice #</th>
                    <th>Vendor</th>
                    <th className="hidden md:table-cell">Project</th>
                    <th className="hidden lg:table-cell">Type</th>
                    <th className="text-right">Amount</th>
                    <th className="hidden sm:table-cell">Date</th>
                    <th>Status</th>
                    <th className="pr-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="pl-4 font-medium text-[var(--text-primary)]">
                        {invoice.invoiceNumber}
                      </td>
                      <td className="max-w-[160px] truncate">{invoice.vendorName}</td>
                      <td className="hidden md:table-cell text-[var(--text-muted)]">
                        {invoice.project || '—'}
                      </td>
                      <td className="hidden lg:table-cell">
                        {invoice.invoiceType ? <TypeBadge type={invoice.invoiceType} /> : '—'}
                      </td>
                      <td className="text-right font-semibold text-[var(--text-primary)] whitespace-nowrap">
                        ₹{Number(invoice.amount).toLocaleString('en-IN')}
                        {invoice.gstAmount && parseFloat(invoice.gstAmount) > 0 && (
                          <span className="block text-[0.625rem] font-normal text-[var(--text-muted)]">
                            +₹{Number(invoice.gstAmount).toLocaleString('en-IN')} GST
                          </span>
                        )}
                      </td>
                      <td className="hidden sm:table-cell whitespace-nowrap text-[var(--text-muted)]">
                        {invoice.submittedAt
                          ? new Date(invoice.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                          : '—'}
                      </td>
                      <td>
                        <StatusBadge status={invoice.status} />
                      </td>
                      <td className="pr-4 text-right">
                        <select
                          value={invoice.status}
                          onChange={(e) => handleStatusChange(invoice, e.target.value as InvoiceStatus)}
                          disabled={updatingId === invoice.id}
                          className="input-field text-xs py-1 px-2"
                          style={{ minWidth: '110px', minHeight: '32px' }}
                          aria-label={`Update status for ${invoice.invoiceNumber}`}
                        >
                          {Object.entries(INVOICE_STATUSES).map(([key, val]) => (
                            <option key={key} value={key}>{val.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary text-xs disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-[var(--text-muted)]">
                Page {page + 1} of {totalPages} ({filtered.length} invoices)
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn-secondary text-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setConfirmDialog(null)}
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

      {/* Comments Dialog */}
      {commentsDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
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
