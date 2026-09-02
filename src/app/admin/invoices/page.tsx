'use client';

import { useState, useEffect } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import StatusBadge from '@/components/ui/StatusBadge';
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
  submittedAt: string;
  updatedAt: string;
}

export default function AdminInvoices() {
  const { token, isReady } = useAdminAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  const updateStatus = async (invoiceId: string, newStatus: InvoiceStatus) => {
    setUpdatingId(invoiceId);
    try {
      const res = await fetch('/api/invoices', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: invoiceId, status: newStatus }),
      });

      if (res.ok) {
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === invoiceId ? { ...inv, status: newStatus } : inv
          )
        );
      }
    } catch {
      console.error('Failed to update status');
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader />

      <main className="max-w-6xl mx-auto p-4 mt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">All Invoices</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field text-sm"
              style={{ maxWidth: '200px' }}
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="input-field text-sm"
              style={{ maxWidth: '160px' }}
            >
              <option value="all">All Status</option>
              {Object.entries(INVOICE_STATUSES).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading invoices...</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500">No invoices found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredInvoices.map((invoice) => (
              <div key={invoice.id} className="card">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  {/* Invoice Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="font-bold text-gray-900 dark:text-white">
                        {invoice.invoiceNumber}
                      </span>
                      <span className="text-sm text-gray-400">•</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {invoice.vendorName}
                      </span>
                      <span className="text-sm text-gray-400">•</span>
                      <span className="text-sm text-gray-500">
                        {new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}
                      </span>
                      <StatusBadge status={invoice.status} />
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">{invoice.purpose}</p>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                      <span className="font-semibold text-base text-gray-900 dark:text-white">
                        ₹{Number(invoice.amount).toLocaleString('en-IN')}
                      </span>
                      {invoice.remarks && <span className="self-center">Remarks: {invoice.remarks}</span>}
                      {invoice.fileUrl && (
                        <a
                          href={invoice.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="self-center text-blue-600 hover:underline"
                        >
                          📎 {invoice.fileName || 'View File'}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Status Update */}
                  <div className="flex-shrink-0">
                    <select
                      value={invoice.status}
                      onChange={(e) => updateStatus(invoice.id, e.target.value as InvoiceStatus)}
                      disabled={updatingId === invoice.id}
                      className="input-field text-sm"
                      style={{ minWidth: '140px' }}
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
    </div>
  );
}
