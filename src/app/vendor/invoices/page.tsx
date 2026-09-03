'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useEngineerAuth } from '@/hooks/useEngineerAuth';
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

export default function VendorInvoices() {
  const { engineerName: loggedInName, isReady, logout } = useEngineerAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [selectedVendor, setSelectedVendor] = useState('');

  useEffect(() => {
    if (!isReady) return;

    // Load vendor list for filter
    const fetchVendors = async () => {
      try {
        const res = await fetch('/api/vendors?names=true');
        const data = await res.json();
        setVendors(data.vendors || []);
      } catch {
        console.error('Failed to load vendors');
      }
    };
    fetchVendors();
  }, [isReady]);

  // Fetch invoices when vendor selection changes
  useEffect(() => {
    if (!isReady || !selectedVendor) {
      if (isReady && !selectedVendor) setLoading(false);
      return;
    }

    setLoading(true);
    const fetchInvoices = async () => {
      try {
        const res = await fetch(`/api/invoices?vendorName=${encodeURIComponent(selectedVendor)}`);
        const data = await res.json();
        if (res.ok) {
          setInvoices(data.invoices || []);
        }
      } catch {
        console.error('Failed to fetch invoices');
      }
      setLoading(false);
    };
    fetchInvoices();
  }, [isReady, selectedVendor]);

  if (!isReady) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header — white theme */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Invoices</h1>
            <p className="text-xs text-gray-500">Welcome, {loggedInName}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/vendor/submit" className="text-sm text-blue-600 hover:underline font-medium min-h-[44px] flex items-center">
              Submit New
            </Link>
            <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700 min-h-[44px] flex items-center">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 mt-4 fade-in">
        {/* Vendor filter */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-1.5">
            Select Vendor to View Invoices
          </label>
          <select
            value={selectedVendor}
            onChange={(e) => setSelectedVendor(e.target.value)}
            className="w-full max-w-xs px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
            aria-label="Select vendor to view invoices"
          >
            <option value="">-- Select vendor --</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.name}>{v.name}</option>
            ))}
          </select>
        </div>

        {!selectedVendor ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm text-center py-12 px-6">
            <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Select a vendor</h3>
            <p className="text-gray-500">Choose a vendor from the dropdown to view their invoices</p>
          </div>
        ) : loading ? (
          <LoadingSkeleton variant="card" count={3} />
        ) : invoices.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm text-center py-12 px-6">
            <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices for {selectedVendor}</h3>
            <p className="text-gray-500 mb-4">No invoices have been submitted for this vendor yet</p>
            <Link href="/vendor/submit" className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors min-h-[44px]">
              Submit Invoice
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 mb-2">{invoices.length} invoice(s) for <strong className="text-gray-900">{selectedVendor}</strong></p>
            {invoices.map((invoice) => {
              const photoCount = invoice.workPhotos ? invoice.workPhotos.split(',').filter(Boolean).length : 0;

              return (
                <div key={invoice.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div>
                      <span className="text-sm font-bold text-gray-900">{invoice.invoiceNumber}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        {new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                    <StatusBadge status={invoice.status} />
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{invoice.purpose}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="font-semibold text-gray-900 text-base">
                      ₹{Number(invoice.amount).toLocaleString('en-IN')}
                    </span>
                    {photoCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        </svg>
                        {photoCount} photo(s)
                      </span>
                    )}
                    {invoice.measurementSheetUrl && (
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Measurement sheet
                      </span>
                    )}
                    {invoice.invoiceFileUrl && (
                      <a href={invoice.invoiceFileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                        </svg>
                        Invoice file
                      </a>
                    )}
                  </div>

                  {/* Approval info */}
                  {invoice.approvedBy && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        {invoice.status === 'rejected' ? (
                          <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {invoice.status === 'rejected' ? 'Rejected' : 'Approved'} by{' '}
                        <strong>{invoice.approvedBy}</strong>
                      </p>
                      {invoice.approvalComments && (
                        <p className="text-sm text-gray-600 mt-1 italic">
                          &ldquo;{invoice.approvalComments}&rdquo;
                        </p>
                      )}
                    </div>
                  )}

                  {/* Resubmit button for rejected invoices */}
                  {invoice.status === 'rejected' && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <Link
                        href={`/vendor/submit?resubmit=${invoice.id}`}
                        className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors min-h-[44px]"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Resubmit with Corrections
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
