'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/ui/StatusBadge';
import TypeBadge from '@/components/ui/TypeBadge';
import PhotoViewer from '@/components/ui/PhotoViewer';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
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
}

/* =====================================================================
   HELPERS
   ===================================================================== */

function isImageUrl(url: string, fileName?: string): boolean {
  if (!url) return false;
  if (url.startsWith('/api/r2/')) return /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(url);
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
  if (url.startsWith('/api/r2/')) return url;
  const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)\//);
  if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
  return null;
}

function formatCurrency(val: number | string): string {
  const n = typeof val === 'string' ? parseFloat(val) || 0 : val;
  return `₹${n.toLocaleString('en-IN')}`;
}

/** Parse date strings — handles ISO, dd/mm/yyyy, and dd/mm/yyyy HH:mm:ss IST */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  // dd/mm/yyyy format (with optional time)
  const ddMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (ddMatch) {
    const [, dd, mm, yyyy] = ddMatch;
    return new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
  }
  // ISO or other parseable format
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  // If already dd/mm/yyyy, extract just the date part
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
   MAIN PAGE — TABLE LAYOUT
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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

  // Derive unique vendor names
  const vendorNames = useMemo(() => {
    const names = new Set(invoices.map((i) => i.vendorName).filter(Boolean));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [invoices]);

  // Stats
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

  // Filter + search + sort
  const filteredInvoices = useMemo(() => {
    let list = invoices;

    // Tab filter
    if (activeTab === 'pending') list = list.filter((i) => i.status === 'submitted' || i.status === 'under_review');
    else if (activeTab === 'approved') list = list.filter((i) => i.status === 'approved');
    else if (activeTab === 'in_payment') list = list.filter((i) => i.status === 'partially_paid' || i.status === 'paid');
    else if (activeTab === 'rejected') list = list.filter((i) => i.status === 'rejected');
    else if (activeTab === 'action_needed') list = list.filter((i) => i.status === 'rejected' || i.status === 'correction_required');
    else if (activeTab === 'awaiting_tax_invoice') list = list.filter((i) => i.documentStage === 'proforma' && i.status !== 'rejected');

    // Vendor filter
    if (selectedVendor) list = list.filter((i) => i.vendorName === selectedVendor);

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) => i.invoiceNumber.toLowerCase().includes(q) ||
               i.vendorName.toLowerCase().includes(q) ||
               i.purpose.toLowerCase().includes(q)
      );
    }

    // Sort
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

  if (!isReady) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Invoices</h1>
              <p className="text-xs text-gray-500">Welcome, {loggedInName}</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Search — desktop */}
              <div className="relative hidden sm:block">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search invoices..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-52 min-h-[40px]"
                  aria-label="Search invoices"
                />
              </div>
              <Link
                href="/vendor/submit"
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors min-h-[40px]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Submit New</span>
                <span className="sm:hidden">New</span>
              </Link>
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full min-h-[44px]"
                aria-label="Search invoices"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5 fade-in">
        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {/* Total */}
          <button
            onClick={() => { setActiveTab('all'); setExpandedId(null); }}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden hover:shadow-md ${
              activeTab === 'all' ? 'ring-2 ring-blue-500 ring-offset-1' : ''
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
            onClick={() => { setActiveTab('pending'); setExpandedId(null); }}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden hover:shadow-md ${
              activeTab === 'pending' ? 'ring-2 ring-amber-500 ring-offset-1' : ''
            }`}
            aria-label={`Pending review: ${stats.pendingCount}`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-gray-500">Pending Review</p>
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-amber-600 mt-1">{stats.pendingCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">worth ₹{stats.pendingAmount.toLocaleString('en-IN')}</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500" />
          </button>

          {/* Approved */}
          <button
            onClick={() => { setActiveTab('approved'); setExpandedId(null); }}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden hover:shadow-md ${
              activeTab === 'approved' ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
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

          {/* In Payment */}
          <button
            onClick={() => { setActiveTab('in_payment'); setExpandedId(null); }}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden hover:shadow-md ${
              activeTab === 'in_payment' ? 'ring-2 ring-violet-500 ring-offset-1' : ''
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

          {/* Action Needed — rejected + correction_required */}
          <button
            onClick={() => { setActiveTab('action_needed'); setExpandedId(null); }}
            className={`bg-white rounded-xl p-4 text-left transition-all border relative overflow-hidden hover:shadow-md ${
              activeTab === 'action_needed' ? 'ring-2 ring-red-500 ring-offset-1' : ''
            } ${stats.actionNeededCount > 0 ? 'border-red-300 shadow-sm' : 'border-gray-200'}`}
            aria-label={`Action needed: ${stats.actionNeededCount}`}
          >
            <div className="flex items-start justify-between">
              <p className={`text-xs font-medium ${stats.actionNeededCount > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                Action Needed
              </p>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${stats.actionNeededCount > 0 ? 'bg-red-100' : 'bg-red-50'}`}>
                <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-red-600 mt-1">{stats.actionNeededCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">worth ₹{stats.actionNeededAmount.toLocaleString('en-IN')}</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-red-500" />
            {/* Animated pulse indicator when there are items needing action */}
            {stats.actionNeededCount > 0 && (
              <span className="absolute top-2.5 right-2.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
            )}
          </button>

          {/* Awaiting Tax Invoice — proforma invoices needing tax invoice upload */}
          {stats.awaitingTaxInvoiceCount > 0 && (
            <button
              onClick={() => { setActiveTab('awaiting_tax_invoice'); setExpandedId(null); }}
              className={`bg-white rounded-xl p-4 text-left transition-all border relative overflow-hidden hover:shadow-md ${
                activeTab === 'awaiting_tax_invoice' ? 'ring-2 ring-amber-500 ring-offset-1' : ''
              } border-amber-300 shadow-sm`}
              aria-label={`Awaiting tax invoice: ${stats.awaitingTaxInvoiceCount}`}
            >
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium text-amber-600">Awaiting Tax Invoice</p>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-100">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </div>
              </div>
              <p className="text-2xl font-bold text-amber-600 mt-1">{stats.awaitingTaxInvoiceCount}</p>
              <p className="text-xs text-gray-400 mt-0.5">proforma invoices</p>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500" />
            </button>
          )}
        </div>

        {/* ── Filter bar: vendor + sort ── */}
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
            {!loading && (
              <p className="text-sm text-gray-500">
                <strong className="text-gray-700">{filteredInvoices.length}</strong> invoice{filteredInvoices.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-sm text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-h-[36px]"
            aria-label="Sort invoices"
          >
            <option value="date">Sort by date</option>
            <option value="amount">Sort by amount</option>
            <option value="vendor">Sort by vendor</option>
          </select>
        </div>

        {/* ── Invoice Table (desktop) / Cards (mobile) ── */}
        {loading ? (
          <LoadingSkeleton variant="card" count={3} />
        ) : filteredInvoices.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm text-center py-16 px-6">
            {(activeTab === 'rejected' || activeTab === 'action_needed') && !searchQuery ? (
              <>
                <div className="text-4xl mb-3">🎉</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No action needed!</h3>
                <p className="text-gray-500 text-sm">All your invoices are in good shape.</p>
              </>
            ) : (
              <>
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchQuery ? `No invoices match "${searchQuery}"` : selectedVendor ? `No invoices for ${selectedVendor}` : 'No invoices yet'}
                </h3>
                <p className="text-gray-500 mb-4">
                  {!searchQuery && !selectedVendor && 'Submit your first invoice to get started.'}
                </p>
                {!searchQuery && !selectedVendor && (
                  <Link href="/vendor/submit" className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors min-h-[44px]">
                    Submit Invoice
                  </Link>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            {/* === DESKTOP TABLE (hidden on mobile) === */}
            <div className="hidden lg:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vendor</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Project</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Amount</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">GST</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Total</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Docs</th>
                      <th className="px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredInvoices.map((invoice) => {
                      const isExpanded = expandedId === invoice.id;
                      const photoUrls = invoice.workPhotos ? invoice.workPhotos.split(',').filter(Boolean) : [];
                      const hasInvoiceFile = !!invoice.invoiceFileUrl;
                      const hasMeasurement = !!invoice.measurementSheetUrl;
                      const docCount = (hasInvoiceFile ? 1 : 0) + (hasMeasurement ? 1 : 0) + photoUrls.length;
                      const isRejected = invoice.status === 'rejected' || invoice.status === 'correction_required';

                      return (
                        <React.Fragment key={invoice.id}>
                          <tr
                            className={`cursor-pointer transition-colors ${
                              isExpanded ? 'bg-blue-50/50' : isRejected ? 'bg-red-50/30 hover:bg-red-50/60' : 'hover:bg-gray-50'
                            }`}
                            onClick={() => setExpandedId(isExpanded ? null : invoice.id)}
                            role="button"
                            aria-expanded={isExpanded}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setExpandedId(isExpanded ? null : invoice.id);
                              }
                            }}
                          >
                            <td className="px-4 py-3">
                              <span className="text-sm font-bold text-gray-900">{invoice.invoiceNumber}</span>
                              {invoice.purpose && (
                                <p className="text-xs text-gray-500 truncate max-w-[200px]">{invoice.purpose}</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500">
                                  {getInitials(invoice.vendorName)}
                                </div>
                                <span className="text-sm text-gray-700">{invoice.vendorName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                              {invoice.project || <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                              {formatDate(invoice.invoiceDate)}
                            </td>
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-1">
                                {invoice.invoiceType && <TypeBadge type={invoice.invoiceType} />}
                                {invoice.documentStage === 'proforma' && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700 border border-amber-200">Proforma</span>
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-sm font-bold text-gray-900">{formatCurrency(invoice.amount)}</span>
                              {invoice.approvedAmount && parseFloat(invoice.approvedAmount) !== parseFloat(invoice.amount) && (
                                <p className="text-xs text-emerald-600">Appr: {formatCurrency(invoice.approvedAmount)}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-sm">
                              {invoice.gstAmount && parseFloat(invoice.gstAmount) > 0 ? (
                                <span className="text-blue-600 font-medium">{formatCurrency(invoice.gstAmount)}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {(() => {
                                const base = parseFloat(invoice.amount) || 0;
                                const gst = parseFloat(invoice.gstAmount || '') || 0;
                                const total = base + gst;
                                return gst > 0 ? (
                                  <span className="text-sm font-bold text-gray-900">{formatCurrency(String(total))}</span>
                                ) : (
                                  <span className="text-sm text-gray-400">—</span>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={invoice.status} />
                            </td>
                            <td className="px-4 py-3 text-center">
                              {docCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                                  </svg>
                                  {docCount}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-3">
                              <svg
                                className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </td>
                          </tr>

                          {/* Expanded row */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={10} className="px-4 py-4 bg-gray-50/50">
                                <ExpandedInvoiceDetail
                                  invoice={invoice}
                                  photoUrls={photoUrls}
                                  onLightbox={setLightboxUrl}
                                  onInvoicesRefresh={refreshInvoices}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* === MOBILE CARDS (hidden on desktop) === */}
            <div className="lg:hidden space-y-2.5">
              {filteredInvoices.map((invoice) => {
                const isExpanded = expandedId === invoice.id;
                const photoUrls = invoice.workPhotos ? invoice.workPhotos.split(',').filter(Boolean) : [];
                const isRejected = invoice.status === 'rejected';

                return (
                  <div
                    key={invoice.id}
                    className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
                      isRejected ? 'border-red-200 border-l-4 border-l-red-500' : 'border-gray-200'
                    }`}
                  >
                    {/* Card summary */}
                    <div
                      className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : invoice.id)}
                      role="button"
                      aria-expanded={isExpanded}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedId(isExpanded ? null : invoice.id);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="text-sm font-bold text-gray-900">{invoice.invoiceNumber}</span>
                          <span className="text-xs text-gray-400">·</span>
                          <span className="text-sm text-gray-600">{invoice.vendorName}</span>
                          {invoice.project && (
                            <>
                              <span className="text-xs text-gray-400">·</span>
                              <span className="text-xs text-indigo-600 font-medium">{invoice.project}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <StatusBadge status={invoice.status} />
                          <svg
                            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 mb-2 truncate">{invoice.purpose}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        {(() => {
                          const base = parseFloat(invoice.amount) || 0;
                          const gst = parseFloat(invoice.gstAmount || '') || 0;
                          const total = base + gst;
                          return gst > 0 ? (
                            <>
                              <span className="font-bold text-gray-900 text-base">{formatCurrency(String(total))}</span>
                              <span className="text-[10px] text-gray-400">
                                ({formatCurrency(invoice.amount)} + GST {formatCurrency(invoice.gstAmount!)})
                              </span>
                            </>
                          ) : (
                            <span className="font-bold text-gray-900 text-base">{formatCurrency(invoice.amount)}</span>
                          );
                        })()}
                        {invoice.invoiceType && <TypeBadge type={invoice.invoiceType} />}
                        {invoice.documentStage === 'proforma' && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700 border border-amber-200">Proforma</span>
                        )}
                        <span>{formatDate(invoice.invoiceDate)}</span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0">
                        <div className="border-t border-gray-100 pt-4">
                          <ExpandedInvoiceDetail
                            invoice={invoice}
                            photoUrls={photoUrls}
                            onLightbox={setLightboxUrl}
                            onInvoicesRefresh={refreshInvoices}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

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

/* =====================================================================
   EXPANDED INVOICE DETAIL (shared between table & mobile)
   ===================================================================== */

function ExpandedInvoiceDetail({
  invoice,
  photoUrls,
  onLightbox,
  onInvoicesRefresh,
}: {
  invoice: Invoice;
  photoUrls: string[];
  onLightbox: (url: string) => void;
  onInvoicesRefresh?: () => void;
}) {
  const invoiceIsImage = isImageUrl(invoice.invoiceFileUrl, invoice.invoiceFileName);
  const invoicePreview = !invoiceIsImage ? getPreviewUrl(invoice.invoiceFileUrl) : null;
  const measurementIsImage = isImageUrl(invoice.measurementSheetUrl, invoice.measurementSheetName);
  const measurementPreview = !measurementIsImage ? getPreviewUrl(invoice.measurementSheetUrl) : null;

  // Tax invoice upload state (for proforma invoices)
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
  const [physicalCopyLoading, setPhysicalCopyLoading] = useState(false);
  const [physicalCopySent, setPhysicalCopySent] = useState(!!invoice.physicalCopySentAt);

  const handleTaxInvoiceUpload = async () => {
    setTaxUploadError('');
    if (!taxFile) { setTaxUploadError('Please select the tax invoice file'); return; }
    if (!taxInvoiceNumber.trim()) { setTaxUploadError('Tax invoice number is required'); return; }
    if (!taxInvoiceDate) { setTaxUploadError('Tax invoice date is required'); return; }
    if (!revisedGst || parseFloat(revisedGst) <= 0) { setTaxUploadError('GST amount is required for tax invoices'); return; }

    const origBase = parseFloat(invoice.amount) || 0;
    const origGst = parseFloat(invoice.gstAmount || '0') || 0;
    const newBase = revisedBase ? parseFloat(revisedBase) || 0 : origBase;
    const newGst = parseFloat(revisedGst) || 0;
    const baseChanged = Math.abs(newBase - origBase) > 0.01;
    const gstChanged = Math.abs(newGst - origGst) > 0.01;
    if ((baseChanged || gstChanged) && !revisionReason.trim()) {
      setTaxUploadError('Please provide a reason for the amount revision (base or GST differs from proforma)');
      return;
    }

    setTaxUploadLoading(true);
    try {
      // Upload file to R2
      const formData = new FormData();
      formData.append('file', taxFile);
      formData.append('invoiceId', invoice.id);
      formData.append('type', 'tax-invoice');
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'File upload failed');
      const uploaded = uploadData.files?.[0] || uploadData;

      // Submit tax invoice details
      const res = await fetch('/api/invoices/tax-invoice', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoice.id,
          taxInvoiceFileUrl: uploaded.url,
          taxInvoiceFileName: uploaded.fileName || taxFile.name,
          taxInvoiceNumber: taxInvoiceNumber.trim(),
          taxInvoiceDate,
          revisedGstAmount: revisedGst || undefined,
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

  return (
    <div className="space-y-4">
      {/* Proforma → Tax Invoice Upload Section */}
      {invoice.documentStage === 'proforma' && !taxUploadSuccess && !['rejected', 'correction_required', 'accounts_query'].includes(invoice.status) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span className="text-sm font-semibold text-amber-800">
                {parseFloat(invoice.gstAmount || '0') > 0 ? 'Proforma Invoice — GST Locked' : 'Proforma Invoice'}
              </span>
            </div>
            <button
              onClick={() => setShowTaxUpload(!showTaxUpload)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
            >
              {showTaxUpload ? 'Cancel' : 'Upload Tax Invoice'}
            </button>
          </div>
          <p className="text-xs text-amber-700">
            {parseFloat(invoice.gstAmount || '0') > 0
              ? `GST payment of ₹${parseFloat(invoice.gstAmount || '0').toLocaleString('en-IN')} is locked until the actual tax invoice is uploaded.`
              : 'This is a proforma invoice. If you have the final tax invoice with GST, upload it here.'}
          </p>

          {showTaxUpload && (
            <div className="mt-3 space-y-3 p-3 bg-white rounded-lg border border-amber-200">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tax Invoice File *</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.heic"
                  onChange={(e) => setTaxFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-100 file:text-amber-700 hover:file:bg-amber-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tax Invoice Number *</label>
                  <input
                    type="text"
                    value={taxInvoiceNumber}
                    onChange={(e) => setTaxInvoiceNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-amber-500 min-h-[40px]"
                    placeholder="e.g., TAX-001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tax Invoice Date *</label>
                  <input
                    type="date"
                    value={taxInvoiceDate}
                    onChange={(e) => setTaxInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-amber-500 min-h-[40px]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Base Amount
                    <span className="text-gray-400 ml-1">(Proforma: ₹{parseFloat(invoice.amount || '0').toLocaleString('en-IN')})</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={revisedBase}
                    onChange={(e) => setRevisedBase(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-amber-500 min-h-[40px]"
                    placeholder={`₹${parseFloat(invoice.amount || '0').toLocaleString('en-IN')} (leave blank if unchanged)`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    GST Amount *
                    {parseFloat(invoice.gstAmount || '0') > 0 && (
                      <span className="text-gray-400 ml-1">(was ₹{parseFloat(invoice.gstAmount || '0').toLocaleString('en-IN')})</span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={revisedGst}
                    onChange={(e) => setRevisedGst(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-amber-500 min-h-[40px]"
                    placeholder="Enter GST amount from tax invoice"
                  />
                </div>
              </div>
              {/* Revision reason — shown when base or GST has changed */}
              {(() => {
                const oBase = parseFloat(invoice.amount || '0') || 0;
                const oGst = parseFloat(invoice.gstAmount || '0') || 0;
                const nBase = revisedBase ? parseFloat(revisedBase) || 0 : oBase;
                const nGst = revisedGst ? parseFloat(revisedGst) || 0 : 0;
                const changed = Math.abs(nBase - oBase) > 0.01 || (nGst > 0 && Math.abs(nGst - oGst) > 0.01);
                if (!changed) return null;
                return (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Revision Reason *
                      <span className="text-gray-400 ml-1">(why amount differs from proforma)</span>
                    </label>
                    <textarea
                      value={revisionReason}
                      onChange={(e) => setRevisionReason(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:ring-2 focus:ring-amber-500"
                      placeholder="e.g., Additional scope of work, rate revision, quantity change"
                    />
                  </div>
                );
              })()}
              {taxUploadError && (
                <p className="text-xs text-red-600 font-medium">{taxUploadError}</p>
              )}
              <button
                onClick={handleTaxInvoiceUpload}
                disabled={taxUploadLoading}
                className="w-full py-2.5 rounded-lg bg-amber-600 text-white font-semibold text-sm hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {taxUploadLoading ? 'Uploading...' : 'Submit Tax Invoice'}
              </button>
            </div>
          )}
        </div>
      )}

      {taxUploadSuccess && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <span className="text-sm font-semibold text-emerald-800">Tax invoice uploaded successfully! GST payment is now unlocked.</span>
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-gray-400 mb-0.5">Submitted By</p>
          <p className="font-medium text-gray-700">{invoice.submittedBy || '—'}</p>
        </div>
        <div>
          <p className="text-gray-400 mb-0.5">Submitted</p>
          <p className="font-medium text-gray-700">{formatDate(invoice.submittedAt)}</p>
        </div>
        {invoice.approvedAmount && (
          <div>
            <p className="text-gray-400 mb-0.5">Approved Amount</p>
            <p className="font-bold text-emerald-700">{formatCurrency(invoice.approvedAmount)}</p>
          </div>
        )}
        {invoice.approvedDate && (
          <div>
            <p className="text-gray-400 mb-0.5">Approved On</p>
            <p className="font-medium text-gray-700">{formatDate(invoice.approvedDate)}</p>
          </div>
        )}
      </div>

      {/* Remarks */}
      {invoice.remarks && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Remarks</p>
          <p className="text-sm text-gray-700">{invoice.remarks}</p>
        </div>
      )}

      {/* Invoice Document */}
      {invoice.invoiceFileUrl && (
        <div className="rounded-lg p-4 bg-blue-50/50 border border-blue-100">
          <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            Invoice — {invoice.invoiceFileName || 'Uploaded file'}
          </p>
          {invoiceIsImage && (
            <img src={invoice.invoiceFileUrl} alt={`Invoice ${invoice.invoiceNumber}`}
              className="w-full max-h-[500px] object-contain rounded-lg cursor-pointer hover:opacity-90 transition-opacity bg-white border border-gray-200"
              onClick={() => onLightbox(invoice.invoiceFileUrl)} />
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

      {/* Work Photos */}
      {photoUrls.length > 0 && (
        <PhotoViewer
          invoiceId={invoice.id}
          quickPhotoUrls={photoUrls}
          showVersionHistory={true}
        />
      )}

      {/* Measurement Sheet */}
      {invoice.measurementSheetUrl && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">
            Measurement Sheet — {invoice.measurementSheetName || 'Uploaded file'}
          </p>
          {measurementIsImage && (
            <img src={invoice.measurementSheetUrl} alt="Measurement sheet"
              className="w-full max-h-[400px] object-contain rounded-lg cursor-pointer hover:opacity-90 transition-opacity bg-white border border-gray-200"
              onClick={() => onLightbox(invoice.measurementSheetUrl)} />
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

      {/* Tax Invoice Document (after upload) */}
      {invoice.taxInvoiceFileUrl && (
        <div className="rounded-lg p-4 bg-emerald-50/50 border border-emerald-100">
          <p className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
            </svg>
            Tax Invoice — {invoice.taxInvoiceFileName || 'Uploaded file'}
            {invoice.taxInvoiceNumber && <span className="text-xs text-gray-500 font-normal">#{invoice.taxInvoiceNumber}</span>}
          </p>
          {invoice.taxInvoiceDate && (
            <p className="text-xs text-gray-500 mb-3">Date: {invoice.taxInvoiceDate}</p>
          )}
          {(() => {
            const taxIsImage = isImageUrl(invoice.taxInvoiceFileUrl!, invoice.taxInvoiceFileName || '');
            const taxPreview = !taxIsImage ? getPreviewUrl(invoice.taxInvoiceFileUrl!) : null;
            return (
              <>
                {taxIsImage && (
                  <img src={invoice.taxInvoiceFileUrl} alt={`Tax Invoice ${invoice.taxInvoiceNumber || ''}`}
                    className="w-full max-h-[500px] object-contain rounded-lg cursor-pointer hover:opacity-90 transition-opacity bg-white border border-gray-200"
                    onClick={() => onLightbox(invoice.taxInvoiceFileUrl!)} />
                )}
                {taxPreview && (
                  <iframe src={taxPreview} className="w-full rounded-lg border border-gray-200"
                    style={{ height: '500px' }} title={`Tax Invoice preview`} allow="autoplay" />
                )}
                {!taxIsImage && !taxPreview && (
                  <a href={invoice.taxInvoiceFileUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors min-h-[44px]">
                    Open Tax Invoice in New Tab
                  </a>
                )}
                {(taxIsImage || taxPreview) && (
                  <a href={invoice.taxInvoiceFileUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs mt-2 text-emerald-600 hover:underline">
                    Open in new tab ↗
                  </a>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Revision info */}
      {invoice.revisionReason && (
        <div className="rounded-lg p-3 bg-amber-50 border border-amber-200">
          <p className="text-xs font-semibold text-amber-800 mb-1">Tax Invoice Revision</p>
          {invoice.originalAmount && (
            <p className="text-xs text-gray-600">
              Base: ₹{Number(invoice.originalAmount).toLocaleString('en-IN')} → ₹{Number(invoice.amount).toLocaleString('en-IN')}
            </p>
          )}
          {invoice.originalGstAmount && (
            <p className="text-xs text-gray-600">
              GST: ₹{Number(invoice.originalGstAmount).toLocaleString('en-IN')} → ₹{Number(invoice.gstAmount || '0').toLocaleString('en-IN')}
            </p>
          )}
          <p className="text-xs text-gray-700 mt-1"><span className="font-medium">Reason:</span> {invoice.revisionReason}</p>
        </div>
      )}

      {/* Physical Copy Tracking */}
      {(invoice.status === 'approved' || invoice.status === 'partially_paid' || invoice.status === 'paid') && (
        <div className="rounded-lg p-3 bg-gray-50 border border-gray-200">
          <p className="text-xs font-semibold text-gray-700 mb-2">Physical Copy Tracking</p>
          {physicalCopySent || invoice.physicalCopySentAt ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-600 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">↑</span>
                Sent to HO on {invoice.physicalCopySentAt} by {invoice.physicalCopySentBy}
              </p>
              {invoice.physicalCopyReceivedAt ? (
                <p className="text-xs text-gray-600 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px]">✓</span>
                  Received at HO on {invoice.physicalCopyReceivedAt} by {invoice.physicalCopyReceivedBy}
                </p>
              ) : (
                <p className="text-xs text-amber-600 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-[10px]">⏳</span>
                  Awaiting receipt at Head Office
                </p>
              )}
            </div>
          ) : (
            <button
              disabled={physicalCopyLoading}
              onClick={async () => {
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
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200 hover:bg-blue-100 transition-colors min-h-[40px]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
              {physicalCopyLoading ? 'Marking...' : 'Mark Physical Copy Sent to HO'}
            </button>
          )}
        </div>
      )}

      {/* Approval info */}
      {invoice.approvedBy && (
        <div className="rounded-lg p-3 bg-gray-50 border border-gray-100">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            {invoice.status === 'rejected' ? (
              <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : invoice.status === 'correction_required' ? (
              <svg className="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {invoice.status === 'rejected' ? 'Rejected' : invoice.status === 'correction_required' ? 'Correction Required' : 'Approved'} by{' '}
            <strong>{invoice.approvedBy}</strong>
            {invoice.approvedAmount && (
              <span className="ml-2">
                · Approved {formatCurrency(invoice.approvedAmount)}
                {parseFloat(invoice.approvedAmount) !== parseFloat(invoice.amount) && (
                  <span className="text-gray-400"> of {formatCurrency(invoice.amount)}</span>
                )}
              </span>
            )}
          </p>
          {invoice.approvalComments && (
            <p className="text-sm text-gray-600 mt-1 italic">&ldquo;{invoice.approvalComments}&rdquo;</p>
          )}
        </div>
      )}

      {/* Edit button for submitted invoices (recall/amend before approver acts) */}
      {invoice.status === 'submitted' && (
        <div className="pt-2">
          <Link
            href={`/vendor/submit?amend=${invoice.id}`}
            className="inline-flex items-center gap-2 bg-amber-600 text-white px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-amber-700 transition-colors min-h-[44px]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit Invoice
          </Link>
        </div>
      )}

      {/* Resubmit button for rejected / correction_required invoices */}
      {(invoice.status === 'rejected' || invoice.status === 'correction_required') && (
        <div className="pt-2">
          <Link
            href={`/vendor/submit?resubmit=${invoice.id}`}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors min-h-[44px]"
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
}
