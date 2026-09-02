'use client';

import { useState, useEffect } from 'react';
import StatusBadge from '@/components/ui/StatusBadge';
import { useApproverAuth } from '@/hooks/useApproverAuth';
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
  invoiceFileUrl: string;
  invoiceFileName: string;
  workPhotos: string;
  measurementSheetUrl: string;
  measurementSheetName: string;
  status: InvoiceStatus;
  approvalComments: string;
  approvedBy: string;
  submittedAt: string;
}

export default function ApproverDashboard() {
  const { token, approverName, isReady, logout } = useApproverAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetchInvoices();
  }, [token]);

  const fetchInvoices = async () => {
    try {
      const res = await fetch('/api/invoices', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setInvoices(data.invoices || []);
      }
    } catch {
      console.error('Failed to fetch invoices');
    }
    setLoading(false);
  };

  const handleAction = async (invoiceId: string, status: InvoiceStatus) => {
    setActionLoading(invoiceId);
    try {
      const res = await fetch('/api/invoices', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: invoiceId,
          status,
          approvalComments: comment,
        }),
      });

      if (res.ok) {
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === invoiceId
              ? { ...inv, status, approvalComments: comment, approvedBy: approverName }
              : inv
          )
        );
        setComment('');
        setExpandedId(null);
      }
    } catch {
      console.error('Failed to update status');
    }
    setActionLoading(null);
  };

  const filteredInvoices = invoices.filter((inv) => {
    if (filter === 'pending') return inv.status === 'submitted' || inv.status === 'under_review';
    if (filter === 'approved') return inv.status === 'approved' || inv.status === 'paid';
    if (filter === 'rejected') return inv.status === 'rejected';
    return true;
  });

  const pendingCount = invoices.filter((i) => i.status === 'submitted' || i.status === 'under_review').length;

  if (!isReady) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Approver Dashboard</h1>
            <p className="text-xs text-gray-500">Welcome, {approverName} • {pendingCount} pending</p>
          </div>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-red-600 font-medium">
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 mt-4">
        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {[
            { key: 'pending', label: `Pending (${pendingCount})` },
            { key: 'approved', label: 'Approved' },
            { key: 'rejected', label: 'Rejected' },
            { key: 'all', label: 'All' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                filter === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Invoice List */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading invoices...</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500">
              {filter === 'pending' ? 'No pending invoices to review 🎉' : 'No invoices found'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredInvoices.map((invoice) => {
              const isExpanded = expandedId === invoice.id;
              const photoUrls = invoice.workPhotos ? invoice.workPhotos.split(',').filter(Boolean) : [];

              return (
                <div key={invoice.id} className="card">
                  {/* Invoice Header */}
                  <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : invoice.id)}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-gray-900 dark:text-white">{invoice.invoiceNumber}</span>
                        <span className="text-sm text-gray-400">•</span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">{invoice.vendorName}</span>
                        <StatusBadge status={invoice.status} />
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{invoice.purpose}</p>
                      <div className="flex gap-3 mt-1 text-xs text-gray-500">
                        <span className="font-semibold text-base text-gray-900 dark:text-white">
                          ₹{Number(invoice.amount).toLocaleString('en-IN')}
                        </span>
                        <span className="self-center">
                          {new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}
                        </span>
                        {photoUrls.length > 0 && (
                          <span className="self-center">📷 {photoUrls.length} photo(s)</span>
                        )}
                      </div>
                    </div>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      {/* Remarks */}
                      {invoice.remarks && (
                        <div className="mb-3">
                          <p className="text-xs font-medium text-gray-500 mb-1">Remarks</p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">{invoice.remarks}</p>
                        </div>
                      )}

                      {/* Work Photos Gallery */}
                      {photoUrls.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs font-medium text-gray-500 mb-2">📷 Work Photos / Evidence</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {photoUrls.map((url, i) => (
                              <img
                                key={i}
                                src={url}
                                alt={`Work photo ${i + 1}`}
                                className="w-full h-32 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => setLightboxUrl(url)}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Measurement Sheet */}
                      {invoice.measurementSheetUrl && (
                        <div className="mb-4">
                          <p className="text-xs font-medium text-gray-500 mb-1">📐 Measurement Sheet</p>
                          <a
                            href={invoice.measurementSheetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                          >
                            📎 {invoice.measurementSheetName || 'View Measurement Sheet'}
                          </a>
                        </div>
                      )}

                      {/* Invoice File */}
                      {invoice.invoiceFileUrl && (
                        <div className="mb-4">
                          <p className="text-xs font-medium text-gray-500 mb-1">📄 Invoice Document</p>
                          <a
                            href={invoice.invoiceFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                          >
                            📎 {invoice.invoiceFileName || 'View Invoice'}
                          </a>
                        </div>
                      )}

                      {/* Previous approval info */}
                      {invoice.approvedBy && (
                        <div className="mb-4 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                          <p className="text-xs text-gray-500">
                            {invoice.status === 'rejected' ? 'Rejected' : 'Approved'} by <strong>{invoice.approvedBy}</strong>
                          </p>
                          {invoice.approvalComments && (
                            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">"{invoice.approvalComments}"</p>
                          )}
                        </div>
                      )}

                      {/* Action Buttons */}
                      {(invoice.status === 'submitted' || invoice.status === 'under_review') && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              Comments (optional)
                            </label>
                            <textarea
                              value={expandedId === invoice.id ? comment : ''}
                              onChange={(e) => setComment(e.target.value)}
                              className="input-field text-sm"
                              rows={2}
                              placeholder="Add approval/rejection reason..."
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAction(invoice.id, 'approved')}
                              disabled={actionLoading === invoice.id}
                              className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => handleAction(invoice.id, 'rejected')}
                              disabled={actionLoading === invoice.id}
                              className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                            >
                              ✕ Reject
                            </button>
                            <button
                              onClick={() => handleAction(invoice.id, 'under_review')}
                              disabled={actionLoading === invoice.id}
                              className="py-2.5 px-4 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors disabled:opacity-50"
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

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white text-2xl font-bold hover:text-gray-300"
          >
            ✕
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
