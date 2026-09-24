'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/ui/StatusBadge';
import TypeBadge from '@/components/ui/TypeBadge';
import PhotoViewer from '@/components/ui/PhotoViewer';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import StatCard from '@/components/ui/StatCard';
import DocStageBadge from '@/components/ui/DocStageBadge';
import InvoiceDrawer, { DrawerSection, DrawerField } from '@/components/ui/InvoiceDrawer';
import DocumentViewer from '@/components/ui/DocumentViewer';
import { useEngineerAuth } from '@/hooks/useEngineerAuth';
import type { InvoiceStatus } from '@/lib/constants';

/* =====================================================================
   TYPES
   ===================================================================== */

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
  approvedDate?: string;
  documentStage?: 'proforma' | 'tax_invoice' | 'direct' | '';
  taxInvoiceFileUrl?: string;
  taxInvoiceFileName?: string;
  taxInvoiceNumber?: string;
  taxInvoiceDate?: string;
  originalAmount?: string;
  originalGstAmount?: string;
  revisionReason?: string;
  physicalCopySentAt?: string;
  physicalCopySentBy?: string;
  physicalCopyReceivedAt?: string;
  physicalCopyReceivedBy?: string;
  dueDate?: string;
}

/* =====================================================================
   HELPERS
   ===================================================================== */

function formatCurrency(val: number | string): string {
  const n = typeof val === 'string' ? parseFloat(val) || 0 : val;
  return `₹${n.toLocaleString('en-IN')}`;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const ddMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (ddMatch) {
    const [, dd, mm, yyyy] = ddMatch;
    return new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  if (/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) {
    return dateStr.split(',')[0].trim();
  }
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/* =====================================================================
   MAIN PAGE
   ===================================================================== */

type FilterTab = 'all' | 'pending' | 'approved' | 'in_payment' | 'rejected' | 'action_needed' | 'awaiting_tax_invoice';

export default function VendorInvoices() {
  const { engineerName: loggedInName, isReady, logout } = useEngineerAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'vendor'>('date');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refreshInvoices = async () => {
    try {
      const res = await fetch('/api/invoices');
      const data = await res.json();
      if (res.ok) setInvoices(data.invoices || []);
    } catch {
      console.error('Failed to fetch invoices');
    }
  };

  useEffect(() => {
    if (!isReady) return;
    setLoading(true);
    refreshInvoices().finally(() => setLoading(false));
  }, [isReady]);

  const vendorNames = useMemo(() => {
    const names = new Set(invoices.map((i) => i.vendorName).filter(Boolean));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [invoices]);

  const stats = useMemo(() => {
    const pending = invoices.filter((i) => i.status === 'submitted' || i.status === 'under_review');
    const approved = invoices.filter((i) => i.status === 'approved');
    const inPayment = invoices.filter((i) => i.status === 'partially_paid' || i.status === 'paid');
    const rejected = invoices.filter((i) => i.status === 'rejected');
    const correctionRequired = invoices.filter((i) => i.status === 'correction_required');
    const actionNeeded = [...rejected, ...correctionRequired];
    const awaitingTaxInvoice = invoices.filter((i) => i.documentStage === 'proforma' && i.status !== 'rejected');
    const sumAmount = (arr: Invoice[]) => arr.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    return {
      total: invoices.length,
      totalAmount: sumAmount(invoices),
      pendingCount: pending.length,
      pendingAmount: sumAmount(pending),
      approvedCount: approved.length,
      approvedAmount: sumAmount(approved),
      inPaymentCount: inPayment.length,
      inPaymentAmount: sumAmount(inPayment),
      rejectedCount: rejected.length,
      rejectedAmount: sumAmount(rejected),
      actionNeededCount: actionNeeded.length,
      actionNeededAmount: sumAmount(actionNeeded),
      awaitingTaxInvoiceCount: awaitingTaxInvoice.length,
    };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    let list = invoices;
    if (activeTab === 'pending') list = list.filter((i) => i.status === 'submitted' || i.status === 'under_review');
    else if (activeTab === 'approved') list = list.filter((i) => i.status === 'approved');
    else if (activeTab === 'in_payment') list = list.filter((i) => i.status === 'partially_paid' || i.status === 'paid');
    else if (activeTab === 'rejected') list = list.filter((i) => i.status === 'rejected');
    else if (activeTab === 'action_needed') list = list.filter((i) => i.status === 'rejected' || i.status === 'correction_required');
    else if (activeTab === 'awaiting_tax_invoice') list = list.filter((i) => i.documentStage === 'proforma' && i.status !== 'rejected');

    if (selectedVendor) list = list.filter((i) => i.vendorName === selectedVendor);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) => i.invoiceNumber.toLowerCase().includes(q) ||
               i.vendorName.toLowerCase().includes(q) ||
               i.purpose.toLowerCase().includes(q)
      );
    }

    const sorted = [...list];
    switch (sortBy) {
      case 'amount':
        sorted.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
        break;
      case 'vendor':
        sorted.sort((a, b) => a.vendorName.localeCompare(b.vendorName));
        break;
      default: {
        sorted.sort((a, b) => {
          const da = parseDate(a.submittedAt)?.getTime() || 0;
          const db = parseDate(b.submittedAt)?.getTime() || 0;
          return db - da;
        });
      }
    }
    return sorted;
  }, [invoices, activeTab, selectedVendor, searchQuery, sortBy]);

  const selectedInvoice = useMemo(() => {
    if (!selectedId) return null;
    return invoices.find(i => i.id === selectedId) || null;
  }, [selectedId, invoices]);

  if (!isReady) return null;

  return (
    <div className="min-h-screen bg-[var(--background)] light-theme">
      {/* ── Header ── */}
      <header className="bg-[var(--surface)] border-b border-[var(--border)] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Invoices</h1>
              <p className="text-xs text-[var(--text-muted)]">Welcome, {loggedInName}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative hidden sm:block">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search invoices..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] w-52 min-h-[40px]"
                  aria-label="Search invoices"
                />
              </div>
              <Link
                href="/vendor/submit"
                className="inline-flex items-center gap-2 bg-[var(--primary)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--primary-hover)] transition-colors min-h-[40px]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Submit New</span>
                <span className="sm:hidden">New</span>
              </Link>
              <button
                onClick={logout}
                className="w-9 h-9 rounded-full bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--danger)] hover:border-[var(--danger-border)] transition-colors"
                aria-label="Log out"
                title="Logout"
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
              </button>
            </div>
          </div>
          <div className="mt-2 sm:hidden">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search invoices..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] w-full min-h-[44px]"
                aria-label="Search invoices"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5 fade-in">
        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <StatCard
            title="Total"
            value={stats.total}
            subtitle={`₹${stats.totalAmount.toLocaleString('en-IN')}`}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>}
            color="blue"
            active={activeTab === 'all'}
            onClick={() => { setActiveTab('all'); setSelectedId(null); }}
          />
          <StatCard
            title="Pending Review"
            value={stats.pendingCount}
            subtitle={`worth ₹${stats.pendingAmount.toLocaleString('en-IN')}`}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            color="amber"
            active={activeTab === 'pending'}
            onClick={() => { setActiveTab('pending'); setSelectedId(null); }}
          />
          <StatCard
            title="Approved"
            value={stats.approvedCount}
            subtitle={`worth ₹${stats.approvedAmount.toLocaleString('en-IN')}`}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
            color="emerald"
            active={activeTab === 'approved'}
            onClick={() => { setActiveTab('approved'); setSelectedId(null); }}
          />
          <StatCard
            title="In Payment"
            value={stats.inPaymentCount}
            subtitle={`worth ₹${stats.inPaymentAmount.toLocaleString('en-IN')}`}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
            color="purple"
            active={activeTab === 'in_payment'}
            onClick={() => { setActiveTab('in_payment'); setSelectedId(null); }}
          />
          <div className="relative">
            <StatCard
              title="Action Needed"
              value={stats.actionNeededCount}
              subtitle={`worth ₹${stats.actionNeededAmount.toLocaleString('en-IN')}`}
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>}
              color="red"
              active={activeTab === 'action_needed'}
              onClick={() => { setActiveTab('action_needed'); setSelectedId(null); }}
            />
            {stats.actionNeededCount > 0 && (
              <span className="absolute top-2 right-2 flex h-3 w-3 z-10 pointer-events-none">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
            )}
          </div>
          {stats.awaitingTaxInvoiceCount > 0 && (
            <StatCard
              title="Awaiting Tax Invoice"
              value={stats.awaitingTaxInvoiceCount}
              subtitle="proforma invoices"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>}
              color="cyan"
              active={activeTab === 'awaiting_tax_invoice'}
              onClick={() => { setActiveTab('awaiting_tax_invoice'); setSelectedId(null); }}
            />
          )}
        </div>

        {/* ── Filter bar ── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="flex items-center gap-3 flex-1">
            <select
              value={selectedVendor}
              onChange={(e) => { setSelectedVendor(e.target.value); setSelectedId(null); }}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] min-h-[36px] max-w-xs"
              aria-label="Filter by vendor"
            >
              <option value="">All Vendors</option>
              {vendorNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            {!loading && (
              <p className="text-sm text-[var(--text-muted)]">
                <strong className="text-[var(--text-secondary)]">{filteredInvoices.length}</strong> invoice{filteredInvoices.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-sm text-[var(--text-secondary)] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] cursor-pointer min-h-[36px]"
            aria-label="Sort invoices"
          >
            <option value="date">Sort by date</option>
            <option value="amount">Sort by amount</option>
            <option value="vendor">Sort by vendor</option>
          </select>
        </div>

        {/* ── Invoice Table / Cards ── */}
        {loading ? (
          <LoadingSkeleton variant="card" count={3} />
        ) : filteredInvoices.length === 0 ? (
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] text-center py-16 px-6">
            {(activeTab === 'rejected' || activeTab === 'action_needed') && !searchQuery ? (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--success-light)] flex items-center justify-center">
                  <svg className="w-8 h-8 text-[var(--success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">No action needed!</h3>
                <p className="text-[var(--text-muted)] text-sm">All your invoices are in good shape.</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--surface-muted)] flex items-center justify-center">
                  <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                  {searchQuery ? `No invoices match "${searchQuery}"` : selectedVendor ? `No invoices for ${selectedVendor}` : 'No invoices yet'}
                </h3>
                <p className="text-[var(--text-muted)] mb-4">
                  {!searchQuery && !selectedVendor && 'Submit your first invoice to get started.'}
                </p>
                {!searchQuery && !selectedVendor && (
                  <Link href="/vendor/submit" className="inline-flex items-center gap-2 bg-[var(--primary)] text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-[var(--primary-hover)] transition-colors min-h-[44px]">
                    Submit Invoice
                  </Link>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            {/* === DESKTOP TABLE === */}
            <div className="hidden lg:block bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Invoice</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Vendor</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Project</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider text-right">Amount</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider text-right">GST</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider text-right">Total</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider text-center">Docs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-muted)]">
                    {filteredInvoices.map((invoice) => {
                      const isSelected = selectedId === invoice.id;
                      const photoUrls = invoice.workPhotos ? invoice.workPhotos.split(',').filter(Boolean) : [];
                      const hasInvoiceFile = !!invoice.invoiceFileUrl;
                      const hasMeasurement = !!invoice.measurementSheetUrl;
                      const docCount = (hasInvoiceFile ? 1 : 0) + (hasMeasurement ? 1 : 0) + photoUrls.length;
                      const isRejected = invoice.status === 'rejected' || invoice.status === 'correction_required';

                      return (
                        <tr
                          key={invoice.id}
                          className={`group cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[var(--primary-light)] border-l-2 border-l-[var(--primary)]'
                              : isRejected
                                ? 'bg-[rgba(239,68,68,0.04)] hover:bg-[rgba(239,68,68,0.08)]'
                                : 'hover:bg-[var(--surface-hover)]'
                          }`}
                          onClick={() => setSelectedId(isSelected ? null : invoice.id)}
                          role="button"
                          aria-expanded={isSelected}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedId(isSelected ? null : invoice.id);
                            }
                          }}
                        >
                          <td className="px-4 py-3">
                            <span className="text-sm font-bold text-[var(--text-primary)]">{invoice.invoiceNumber}</span>
                            {invoice.purpose && (
                              <p className="text-xs text-[var(--text-muted)] truncate max-w-[200px]">{invoice.purpose}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)]">
                                {getInitials(invoice.vendorName)}
                              </div>
                              <span className="text-sm text-[var(--text-secondary)]">{invoice.vendorName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-[var(--text-secondary)] whitespace-nowrap">
                            {invoice.project || <span className="text-[var(--text-muted)]">—</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-[var(--text-secondary)] whitespace-nowrap">
                            {formatDate(invoice.invoiceDate)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1">
                              {invoice.invoiceType && <TypeBadge type={invoice.invoiceType} />}
                              <DocStageBadge stage={invoice.documentStage} />
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(invoice.amount)}</span>
                            {invoice.approvedAmount && parseFloat(invoice.approvedAmount) !== parseFloat(invoice.amount) && (
                              <p className="text-xs text-[var(--success)]">Appr: {formatCurrency(invoice.approvedAmount)}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {invoice.gstAmount && parseFloat(invoice.gstAmount) > 0 ? (
                              <span className="text-[var(--info)] font-medium">{formatCurrency(invoice.gstAmount)}</span>
                            ) : (
                              <span className="text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {(() => {
                              const base = parseFloat(invoice.amount) || 0;
                              const gst = parseFloat(invoice.gstAmount || '') || 0;
                              const total = base + gst;
                              return gst > 0 ? (
                                <span className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(String(total))}</span>
                              ) : (
                                <span className="text-sm text-[var(--text-muted)]">—</span>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={invoice.status} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            {docCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                                </svg>
                                {docCount}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* === MOBILE CARDS === */}
            <div className="lg:hidden space-y-2.5">
              {filteredInvoices.map((invoice) => {
                const isSelected = selectedId === invoice.id;
                const isRejected = invoice.status === 'rejected';

                return (
                  <div
                    key={invoice.id}
                    className={`bg-[var(--surface)] rounded-xl border overflow-hidden transition-all ${
                      isSelected
                        ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]'
                        : isRejected
                          ? 'border-[var(--danger-border)] border-l-4 border-l-[var(--danger)]'
                          : 'border-[var(--border)]'
                    }`}
                  >
                    <div
                      className="p-4 cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
                      onClick={() => setSelectedId(isSelected ? null : invoice.id)}
                      role="button"
                      aria-expanded={isSelected}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedId(isSelected ? null : invoice.id);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="text-sm font-bold text-[var(--text-primary)]">{invoice.invoiceNumber}</span>
                          <span className="text-xs text-[var(--text-muted)]">&middot;</span>
                          <span className="text-sm text-[var(--text-secondary)]">{invoice.vendorName}</span>
                          {invoice.project && (
                            <>
                              <span className="text-xs text-[var(--text-muted)]">&middot;</span>
                              <span className="text-xs text-[var(--accent)] font-medium">{invoice.project}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <StatusBadge status={invoice.status} />
                        </div>
                      </div>
                      <p className="text-sm text-[var(--text-muted)] mb-2 truncate">{invoice.purpose}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                        {(() => {
                          const base = parseFloat(invoice.amount) || 0;
                          const gst = parseFloat(invoice.gstAmount || '') || 0;
                          const total = base + gst;
                          return gst > 0 ? (
                            <>
                              <span className="font-bold text-[var(--text-primary)] text-base">{formatCurrency(String(total))}</span>
                              <span className="text-[10px] text-[var(--text-muted)]">
                                ({formatCurrency(invoice.amount)} + GST {formatCurrency(invoice.gstAmount!)})
                              </span>
                            </>
                          ) : (
                            <span className="font-bold text-[var(--text-primary)] text-base">{formatCurrency(invoice.amount)}</span>
                          );
                        })()}
                        {invoice.invoiceType && <TypeBadge type={invoice.invoiceType} />}
                        <DocStageBadge stage={invoice.documentStage} />
                        <span>{formatDate(invoice.invoiceDate)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* ── Invoice Detail Drawer ── */}
      {selectedInvoice && (
        <InvoiceDrawer
          open={!!selectedInvoice}
          onClose={() => setSelectedId(null)}
          title={`Invoice #${selectedInvoice.invoiceNumber}`}
          subtitle={`${selectedInvoice.vendorName}${selectedInvoice.project ? ` · ${selectedInvoice.project}` : ''}`}
          width="max-w-xl"
        >
          <InvoiceDetailContent
            key={selectedInvoice.id}
            invoice={selectedInvoice}
            onInvoicesRefresh={refreshInvoices}
          />
        </InvoiceDrawer>
      )}
    </div>
  );
}

/* =====================================================================
   INVOICE DETAIL CONTENT (rendered inside drawer)
   ===================================================================== */

function InvoiceDetailContent({
  invoice,
  onInvoicesRefresh,
}: {
  invoice: Invoice;
  onInvoicesRefresh: () => Promise<void>;
}) {
  const [showTaxUpload, setShowTaxUpload] = useState(false);
  const [taxFile, setTaxFile] = useState<File | null>(null);
  const [taxInvoiceNumber, setTaxInvoiceNumber] = useState('');
  const [taxInvoiceDate, setTaxInvoiceDate] = useState('');
  const [revisedGst, setRevisedGst] = useState('');
  const [revisedBase, setRevisedBase] = useState('');
  const [revisionReason, setRevisionReason] = useState('');
  const [taxUploadLoading, setTaxUploadLoading] = useState(false);
  const [taxUploadError, setTaxUploadError] = useState('');
  const [taxUploadSuccess, setTaxUploadSuccess] = useState(false);
  const [physicalCopySent, setPhysicalCopySent] = useState(false);
  const [physicalCopyLoading, setPhysicalCopyLoading] = useState(false);

  const photoUrls = invoice.workPhotos ? invoice.workPhotos.split(',').filter(Boolean) : [];

  const handleTaxInvoiceUpload = async () => {
    if (!taxFile || !taxInvoiceNumber || !taxInvoiceDate) {
      setTaxUploadError('Please fill in all required fields');
      return;
    }
    if (!revisedGst) {
      setTaxUploadError('Please enter the GST amount from the tax invoice');
      return;
    }
    setTaxUploadLoading(true);
    setTaxUploadError('');

    try {
      const formData = new FormData();
      formData.append('file', taxFile);
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'File upload failed');

      const res = await fetch('/api/invoices/tax-invoice', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoice.id,
          taxInvoiceFileUrl: uploadData.url,
          taxInvoiceFileName: uploadData.fileName || taxFile.name,
          taxInvoiceNumber,
          taxInvoiceDate,
          revisedGst,
          revisedAmount: revisedBase || undefined,
          revisionReason: revisionReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload tax invoice');

      setTaxUploadSuccess(true);
      onInvoicesRefresh?.();
    } catch (err) {
      setTaxUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setTaxUploadLoading(false);
    }
  };

  const handlePhysicalCopySend = async () => {
    setPhysicalCopyLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/invoices/physical-copy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id, action: 'sent', date: today }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setPhysicalCopySent(true);
      onInvoicesRefresh?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to mark as sent');
    } finally {
      setPhysicalCopyLoading(false);
    }
  };

  return (
    <div>
      {/* Quick overview header */}
      <div className="px-5 py-4 border-b border-[var(--border-muted)]">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <StatusBadge status={invoice.status} />
          {invoice.invoiceType && <TypeBadge type={invoice.invoiceType} />}
          <DocStageBadge stage={invoice.documentStage} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Base Amount</p>
            <p className="text-xl font-bold text-[var(--text-primary)] tabular-nums">{formatCurrency(invoice.amount)}</p>
          </div>
          {(() => {
            const gst = parseFloat(invoice.gstAmount || '') || 0;
            const total = (parseFloat(invoice.amount) || 0) + gst;
            return gst > 0 ? (
              <div>
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Total (incl. GST)</p>
                <p className="text-xl font-bold text-[var(--text-primary)] tabular-nums">{formatCurrency(String(total))}</p>
              </div>
            ) : null;
          })()}
        </div>
      </div>

      {/* Details */}
      <DrawerSection title="Details">
        <DrawerField label="Purpose" value={invoice.purpose} />
        <DrawerField label="Project" value={invoice.project} />
        <DrawerField label="Invoice Date" value={formatDate(invoice.invoiceDate)} />
        <DrawerField label="Submitted By" value={invoice.submittedBy} />
        <DrawerField label="Submitted On" value={formatDate(invoice.submittedAt)} />
      </DrawerSection>

      {/* Financial */}
      <DrawerSection title="Financial">
        <DrawerField label="Base Amount" value={formatCurrency(invoice.amount)} mono />
        {invoice.gstAmount && parseFloat(invoice.gstAmount) > 0 && (
          <DrawerField label="GST Amount" value={formatCurrency(invoice.gstAmount)} mono />
        )}
        {invoice.approvedAmount && (
          <DrawerField label="Approved Amount" value={
            <span className="text-[var(--success)] font-bold">{formatCurrency(invoice.approvedAmount)}</span>
          } />
        )}
        {invoice.approvedDate && (
          <DrawerField label="Approved On" value={formatDate(invoice.approvedDate)} />
        )}
      </DrawerSection>

      {/* Proforma → Tax Invoice Upload */}
      {invoice.documentStage === 'proforma' && !taxUploadSuccess && !['rejected', 'correction_required', 'accounts_query'].includes(invoice.status) && (
        <DrawerSection title="Tax Invoice Upload" badge={<DocStageBadge stage="proforma" />}>
          <div className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-light)] p-3 mb-3">
            <p className="text-xs" style={{ color: 'var(--warning)' }}>
              {parseFloat(invoice.gstAmount || '0') > 0
                ? `GST payment of ₹${parseFloat(invoice.gstAmount || '0').toLocaleString('en-IN')} is locked until the actual tax invoice is uploaded.`
                : 'This is a proforma invoice. If you have the final tax invoice with GST, upload it here.'}
            </p>
          </div>
          <button
            onClick={() => setShowTaxUpload(!showTaxUpload)}
            className="w-full py-2 text-xs font-semibold rounded-lg transition-colors"
            style={{
              background: showTaxUpload ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.15)',
              color: showTaxUpload ? 'var(--danger)' : 'var(--warning)',
              border: `1px solid ${showTaxUpload ? 'var(--danger-border)' : 'var(--warning-border)'}`,
            }}
          >
            {showTaxUpload ? 'Cancel' : 'Upload Tax Invoice'}
          </button>

          {showTaxUpload && (
            <div className="mt-3 space-y-3 p-3 rounded-lg bg-[var(--surface-muted)] border border-[var(--border)]">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Tax Invoice File *</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.heic"
                  onChange={(e) => setTaxFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-[var(--text-secondary)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[var(--warning-light)] file:text-[var(--warning)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Tax Invoice Number *</label>
                  <input
                    type="text"
                    value={taxInvoiceNumber}
                    onChange={(e) => setTaxInvoiceNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--primary)] focus:outline-none min-h-[40px]"
                    placeholder="e.g., TAX-001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Tax Invoice Date *</label>
                  <input
                    type="date"
                    value={taxInvoiceDate}
                    onChange={(e) => setTaxInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--primary)] focus:outline-none min-h-[40px]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Base Amount
                    <span className="text-[var(--text-muted)] ml-1">(Proforma: ₹{parseFloat(invoice.amount || '0').toLocaleString('en-IN')})</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={revisedBase}
                    onChange={(e) => setRevisedBase(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--primary)] focus:outline-none min-h-[40px]"
                    placeholder="Leave blank if unchanged"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    GST Amount *
                    {parseFloat(invoice.gstAmount || '0') > 0 && (
                      <span className="text-[var(--text-muted)] ml-1">(was ₹{parseFloat(invoice.gstAmount || '0').toLocaleString('en-IN')})</span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={revisedGst}
                    onChange={(e) => setRevisedGst(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--primary)] focus:outline-none min-h-[40px]"
                    placeholder="Enter GST amount"
                  />
                </div>
              </div>
              {(() => {
                const oBase = parseFloat(invoice.amount || '0') || 0;
                const oGst = parseFloat(invoice.gstAmount || '0') || 0;
                const nBase = revisedBase ? parseFloat(revisedBase) || 0 : oBase;
                const nGst = revisedGst ? parseFloat(revisedGst) || 0 : 0;
                const changed = Math.abs(nBase - oBase) > 0.01 || (nGst > 0 && Math.abs(nGst - oGst) > 0.01);
                if (!changed) return null;
                return (
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      Revision Reason *
                      <span className="text-[var(--text-muted)] ml-1">(why amount differs from proforma)</span>
                    </label>
                    <textarea
                      value={revisionReason}
                      onChange={(e) => setRevisionReason(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--primary)] focus:outline-none"
                      placeholder="e.g., Additional scope, rate revision, quantity change"
                    />
                  </div>
                );
              })()}
              {taxUploadError && (
                <p className="text-xs font-medium" style={{ color: 'var(--danger)' }}>{taxUploadError}</p>
              )}
              <button
                onClick={handleTaxInvoiceUpload}
                disabled={taxUploadLoading}
                className="w-full py-2.5 rounded-lg font-semibold text-sm text-white disabled:opacity-50 transition-colors"
                style={{ background: 'var(--warning)' }}
              >
                {taxUploadLoading ? 'Uploading...' : 'Submit Tax Invoice'}
              </button>
            </div>
          )}
        </DrawerSection>
      )}

      {taxUploadSuccess && (
        <div className="mx-5 my-3 rounded-lg border p-3 flex items-center gap-2" style={{ borderColor: 'var(--success-border)', background: 'var(--success-light)' }}>
          <svg className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--success)' }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <span className="text-sm font-semibold" style={{ color: 'var(--success)' }}>Tax invoice uploaded successfully! GST payment is now unlocked.</span>
        </div>
      )}

      {/* Documents */}
      {(invoice.invoiceFileUrl || invoice.taxInvoiceFileUrl || invoice.measurementSheetUrl) && (
        <DrawerSection title="Documents">
          <div className="space-y-3">
            {invoice.invoiceFileUrl && (
              <DocumentViewer
                url={invoice.invoiceFileUrl}
                fileName={invoice.invoiceFileName}
                title={`Invoice — ${invoice.invoiceFileName || 'Uploaded file'}`}
              />
            )}
            {invoice.taxInvoiceFileUrl && (
              <div>
                <DocumentViewer
                  url={invoice.taxInvoiceFileUrl}
                  fileName={invoice.taxInvoiceFileName}
                  title={`Tax Invoice — ${invoice.taxInvoiceFileName || 'Uploaded file'}${invoice.taxInvoiceNumber ? ` #${invoice.taxInvoiceNumber}` : ''}`}
                />
                {invoice.taxInvoiceDate && (
                  <p className="text-[10px] text-[var(--text-muted)] mt-1 px-1">Date: {invoice.taxInvoiceDate}</p>
                )}
              </div>
            )}
            {invoice.measurementSheetUrl && (
              <DocumentViewer
                url={invoice.measurementSheetUrl}
                fileName={invoice.measurementSheetName}
                title={`Measurement Sheet — ${invoice.measurementSheetName || 'Uploaded file'}`}
                compact
              />
            )}
          </div>
        </DrawerSection>
      )}

      {/* Work Photos */}
      {photoUrls.length > 0 && (
        <DrawerSection title="Work Photos">
          <PhotoViewer
            invoiceId={invoice.id}
            quickPhotoUrls={photoUrls}
            showVersionHistory={true}
          />
        </DrawerSection>
      )}

      {/* Remarks */}
      {invoice.remarks && (
        <DrawerSection title="Remarks">
          <p className="text-sm text-[var(--text-secondary)]">{invoice.remarks}</p>
        </DrawerSection>
      )}

      {/* Revision Info */}
      {invoice.revisionReason && (
        <DrawerSection title="Tax Invoice Revision">
          {invoice.originalAmount && (
            <DrawerField
              label="Base Amount"
              value={`₹${Number(invoice.originalAmount).toLocaleString('en-IN')} → ₹${Number(invoice.amount).toLocaleString('en-IN')}`}
            />
          )}
          {invoice.originalGstAmount && (
            <DrawerField
              label="GST Amount"
              value={`₹${Number(invoice.originalGstAmount).toLocaleString('en-IN')} → ₹${Number(invoice.gstAmount || '0').toLocaleString('en-IN')}`}
            />
          )}
          <div className="mt-2 pt-2 border-t border-[var(--border-muted)]">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Reason</p>
            <p className="text-sm text-[var(--text-secondary)]">{invoice.revisionReason}</p>
          </div>
        </DrawerSection>
      )}

      {/* Physical Copy Tracking */}
      {(invoice.status === 'approved' || invoice.status === 'partially_paid' || invoice.status === 'paid') && (
        <DrawerSection title="Physical Copy">
          {physicalCopySent || invoice.physicalCopySentAt ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0" style={{ background: 'var(--info-light)', color: 'var(--info)' }}>↑</span>
                <p className="text-xs text-[var(--text-secondary)]">
                  Sent to HO on {invoice.physicalCopySentAt} by {invoice.physicalCopySentBy}
                </p>
              </div>
              {invoice.physicalCopyReceivedAt ? (
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>&#10003;</span>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Received at HO on {invoice.physicalCopyReceivedAt} by {invoice.physicalCopyReceivedBy}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0" style={{ background: 'var(--warning-light)', color: 'var(--warning)' }}>&#8987;</span>
                  <p className="text-xs" style={{ color: 'var(--warning)' }}>Awaiting receipt at Head Office</p>
                </div>
              )}
            </div>
          ) : (
            <button
              disabled={physicalCopyLoading}
              onClick={handlePhysicalCopySend}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[40px]"
              style={{
                background: 'var(--info-light)',
                color: 'var(--info)',
                border: '1px solid var(--info-border)',
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
              {physicalCopyLoading ? 'Marking...' : 'Mark Physical Copy Sent to HO'}
            </button>
          )}
        </DrawerSection>
      )}

      {/* Approval Info */}
      {invoice.approvedBy && (
        <DrawerSection title="Approval">
          <div className="flex items-start gap-2 mb-2">
            {invoice.status === 'rejected' ? (
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--danger)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : invoice.status === 'correction_required' ? (
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--warning)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--success)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            <div>
              <p className="text-sm text-[var(--text-secondary)]">
                {invoice.status === 'rejected' ? 'Rejected' : invoice.status === 'correction_required' ? 'Correction Required' : 'Approved'} by{' '}
                <strong className="text-[var(--text-primary)]">{invoice.approvedBy}</strong>
              </p>
              {invoice.approvedAmount && (
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Approved {formatCurrency(invoice.approvedAmount)}
                  {parseFloat(invoice.approvedAmount) !== parseFloat(invoice.amount) && (
                    <span> of {formatCurrency(invoice.amount)}</span>
                  )}
                </p>
              )}
            </div>
          </div>
          {invoice.approvalComments && (
            <p className="text-sm text-[var(--text-secondary)] italic pl-6">&ldquo;{invoice.approvalComments}&rdquo;</p>
          )}
        </DrawerSection>
      )}

      {/* Actions */}
      {(invoice.status === 'submitted' || invoice.status === 'rejected' || invoice.status === 'correction_required') && (
        <div className="px-5 py-4">
          {invoice.status === 'submitted' && (
            <Link
              href={`/vendor/submit?amend=${invoice.id}`}
              className="inline-flex items-center gap-2 text-white px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors min-h-[44px] w-full justify-center"
              style={{ background: 'var(--warning)' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Invoice
            </Link>
          )}
          {(invoice.status === 'rejected' || invoice.status === 'correction_required') && (
            <Link
              href={`/vendor/submit?resubmit=${invoice.id}`}
              className="inline-flex items-center gap-2 bg-[var(--primary)] text-white px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-[var(--primary-hover)] transition-colors min-h-[44px] w-full justify-center"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Resubmit with Corrections
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
