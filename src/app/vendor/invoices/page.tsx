'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { INVOICE_STATUSES } from '@/lib/constants';

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
  status: keyof typeof INVOICE_STATUSES;
  submittedAt: string;
}

export default function VendorInvoices() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorName, setVendorName] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('vendorToken');
    const name = localStorage.getItem('vendorName');
    if (!token || !name) {
      router.push('/vendor/login');
      return;
    }
    setVendorName(name);

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
    fetchInvoices();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('vendorToken');
    localStorage.removeItem('vendorName');
    router.push('/');
  };

  const getStatusBadge = (status: keyof typeof INVOICE_STATUSES) => {
    const statusInfo = INVOICE_STATUSES[status] || INVOICE_STATUSES.submitted;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
        {statusInfo.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">My Invoices</h1>
            <p className="text-xs text-gray-500">{vendorName}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/vendor/submit" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              Submit New
            </Link>
            <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-600">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 mt-4">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="card text-center py-12">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No invoices yet</h3>
            <p className="text-gray-500 mb-4">Submit your first invoice to get started</p>
            <Link href="/vendor/submit" className="btn-primary inline-block">
              Submit Invoice
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {invoice.invoiceNumber}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      {new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                  {getStatusBadge(invoice.status)}
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{invoice.purpose}</p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                  <span className="font-semibold text-gray-900 dark:text-white text-base">
                    ₹{Number(invoice.amount).toLocaleString('en-IN')}
                  </span>
                  {invoice.remarks && <span>• {invoice.remarks}</span>}
                  {invoice.fileUrl && (
                    <a href={invoice.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      📎 {invoice.fileName || 'View File'}
                    </a>
                  )}
                  <span className="ml-auto">
                    Submitted: {new Date(invoice.submittedAt).toLocaleDateString('en-IN')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
