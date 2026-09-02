'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AdminHeader from '@/components/layout/AdminHeader';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import type { InvoiceStatus } from '@/lib/constants';

interface Invoice {
  id: string;
  vendorName: string;
  invoiceDate: string;
  invoiceNumber: string;
  purpose: string;
  amount: string;
  status: InvoiceStatus;
  submittedAt: string;
}

export default function AdminDashboard() {
  const { token, isReady } = useAdminAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      try {
        const res = await fetch('/api/invoices', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
          setInvoices(data.invoices || []);
        }
      } catch {
        console.error('Failed to fetch data');
      }
      setLoading(false);
    };
    fetchData();
  }, [token]);

  if (!isReady) return null;

  const totalAmount = invoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);
  const pendingCount = invoices.filter((i) => i.status === 'submitted' || i.status === 'under_review').length;
  const approvedCount = invoices.filter((i) => i.status === 'approved' || i.status === 'paid').length;
  const recentInvoices = invoices.slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader />

      <main className="max-w-6xl mx-auto p-4 mt-4">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading dashboard...</div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <StatCard
                title="Total Invoices"
                value={invoices.length}
                bgColor="bg-blue-100"
                textColor="text-blue-600"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
              />
              <StatCard
                title="Pending"
                value={pendingCount}
                bgColor="bg-yellow-100"
                textColor="text-yellow-600"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
              <StatCard
                title="Approved/Paid"
                value={approvedCount}
                bgColor="bg-green-100"
                textColor="text-green-600"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
              <StatCard
                title="Total Amount"
                value={`₹${totalAmount.toLocaleString('en-IN')}`}
                bgColor="bg-purple-100"
                textColor="text-purple-600"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
            </div>

            {/* Recent Invoices */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Recent Invoices</h2>
                <Link href="/admin/invoices" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                  View All →
                </Link>
              </div>

              {recentInvoices.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No invoices submitted yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-2 text-gray-500 font-medium">Invoice #</th>
                        <th className="text-left py-2 px-2 text-gray-500 font-medium">Vendor</th>
                        <th className="text-left py-2 px-2 text-gray-500 font-medium hidden sm:table-cell">Purpose</th>
                        <th className="text-right py-2 px-2 text-gray-500 font-medium">Amount</th>
                        <th className="text-center py-2 px-2 text-gray-500 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentInvoices.map((invoice) => (
                        <tr key={invoice.id} className="border-b border-gray-100 dark:border-gray-700/50">
                          <td className="py-2.5 px-2 font-medium text-gray-900 dark:text-white">
                            {invoice.invoiceNumber}
                          </td>
                          <td className="py-2.5 px-2 text-gray-600 dark:text-gray-300">
                            {invoice.vendorName}
                          </td>
                          <td className="py-2.5 px-2 text-gray-600 dark:text-gray-300 hidden sm:table-cell max-w-[200px] truncate">
                            {invoice.purpose}
                          </td>
                          <td className="py-2.5 px-2 text-right font-semibold text-gray-900 dark:text-white">
                            ₹{Number(invoice.amount).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <StatusBadge status={invoice.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
