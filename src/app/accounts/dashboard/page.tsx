'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import TypeBadge from '@/components/ui/TypeBadge';
import PhotoViewer from '@/components/ui/PhotoViewer';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import PaymentLifecycle from '@/components/ui/PaymentLifecycle';
import { useAccountsAuth } from '@/hooks/useAccountsAuth';
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
  poNumber?: string;
  challanUrl?: string;
  challanName?: string;
  approvedAmount?: string;
  gstAmount?: string;
}

interface Payment {
  id: string;
  invoiceId: string;
  amount: string;
  utrReference: string;
  paymentDate: string;
  paidBy: string;
  notes: string;
  createdAt: string;
  basicAmount?: string;
  gstAmount?: string;
  paymentType?: string;
}

interface PaymentSummary {
  payments: Payment[];
  totalPaid: number;
  totalTDS?: number;
  totalRetention?: number;
  totalConsumed?: number;
  invoiceAmount: number;
  invoiceBaseAmount?: number;
  invoiceGSTAmount?: number;
  approvedAmount: number;
  remaining: number;
  availableToPay: number;
  isFullyPaid: boolean;
  approvedCapReached?: boolean;
  totalBasicPaid?: number;
  totalGSTPaid?: number;
  basicRemaining?: number;
  gstRemaining?: number;
}

interface BulkSummary {
  totalPaid: number;
  totalTDS: number;
  totalRetention: number;
  totalConsumed: number;
  remaining: number;
  availableToPay: number;
  isFullyPaid: boolean;
  approvedCapReached: boolean;
  paymentCount: number;
  hasNewAuthorization?: boolean;
  newAuthorizationAmount?: string;
  newAuthorizationBy?: string;
}

/* =====================================================================
   HELPERS
   ===================================================================== */

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Accounts-specific status labels (e.g. "approved" → "Pending Payment" from accounts perspective) */
function AccountsStatusBadge({ status }: { status: InvoiceStatus }) {
  const config: Record<string, { label: string; className: string; dotClass: string }> = {
    approved: { label: 'Pending Payment', className: 'bg-amber-50 text-amber-700 border-amber-200', dotClass: 'bg-amber-500' },
    partially_paid: { label: 'Partially Paid', className: 'bg-violet-50 text-violet-700 border-violet-200', dotClass: 'bg-violet-500' },
    paid: { label: 'Paid', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotClass: 'bg-emerald-500' },
    rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200', dotClass: 'bg-red-500' },
    accounts_query: { label: 'Query Raised', className: 'bg-orange-50 text-orange-700 border-orange-200', dotClass: 'bg-orange-500' },
    correction_required: { label: 'Correction Required', className: 'bg-rose-50 text-rose-700 border-rose-200', dotClass: 'bg-rose-500' },
  };
  const c = config[status] || { label: status, className: 'bg-gray-50 text-gray-600 border-gray-200', dotClass: 'bg-gray-500' };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${c.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dotClass}`} />
      {c.label}
    </span>
  );
}

function statusBorderColor(status: InvoiceStatus): string {
  switch (status) {
    case 'approved': return 'border-l-emerald-500';
    case 'partially_paid': return 'border-l-violet-500';
    case 'paid': return 'border-l-emerald-400';
    case 'rejected': return 'border-l-red-500';
    case 'accounts_query': return 'border-l-orange-500';
    case 'correction_required': return 'border-l-rose-500';
    default: return 'border-l-gray-300';
  }
}

function formatCurrency(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '₹0';
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function isImageUrl(url: string, fileName?: string): boolean {
  if (!url) return false;
  if (url.startsWith('/api/r2/')) {
    return /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(url);
  }
  if (url.startsWith('/api/files/')) {
    if (fileName) return /\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(fileName);
    return false;
  }
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

/* =====================================================================
   PAYMENT MODAL
   ===================================================================== */

function PaymentModal({
  invoice,
  paymentSummary,
  onClose,
  onSubmit,
  isSubmitting,
  prefillRetentionRelease = 0,
}: {
  invoice: Invoice;
  paymentSummary: PaymentSummary | null;
  onClose: () => void;
  onSubmit: (data: { amount: string; utrReference: string; paymentDate: string; notes: string; basicAmount?: string; gstAmount?: string; paymentType?: string; tdsAmount?: string; retentionAmount?: string }) => void;
  isSubmitting: boolean;
  /** When > 0, pre-fills the amount with this retention value and marks it as a retention release */
  prefillRetentionRelease?: number;
}) {
  const isRetentionRelease = prefillRetentionRelease > 0;
  const [amount, setAmount] = useState(isRetentionRelease ? prefillRetentionRelease.toString() : '');
  const [utrReference, setUtrReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState(isRetentionRelease ? 'Retention Release' : '');
  const [formError, setFormError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  // GST/Basic split
  const invoiceGST = paymentSummary?.invoiceGSTAmount ?? (parseFloat(invoice.gstAmount || '') || 0);
  const hasGST = invoiceGST > 0;
  const [splitMode, setSplitMode] = useState<'combined' | 'split'>(hasGST ? 'split' : 'combined');
  const [basicAmount, setBasicAmount] = useState('');
  const [gstPayAmount, setGstPayAmount] = useState('');

  // Deductions (TDS / Retention) — optional
  const [showDeductions, setShowDeductions] = useState(false);
  const [tdsInput, setTdsInput] = useState('');
  const [retentionInput, setRetentionInput] = useState('');
  const tdsNum = parseFloat(tdsInput) || 0;
  const retentionNum = parseFloat(retentionInput) || 0;

  const invoiceRemaining = paymentSummary ? paymentSummary.remaining : parseFloat(invoice.amount) || 0;
  // For retention release: the retained amount was already consumed from the cap,
  // so it's available to release without new authorization
  const baseAvailable = paymentSummary ? (paymentSummary.availableToPay ?? paymentSummary.remaining) : parseFloat(invoice.approvedAmount || invoice.amount) || 0;
  const retentionHeld = paymentSummary?.totalRetention ?? 0;
  const availableToPay = isRetentionRelease ? Math.max(baseAvailable, retentionHeld) : baseAvailable;

  // Gross = net to vendor + TDS + retention; must fit within approved cap
  const parsedAmount = parseFloat(amount) || 0;
  const grossAmount = parsedAmount + tdsNum + retentionNum;
  const netToVendor = parsedAmount; // What actually goes to vendor's bank

  /** Validate all fields and show specific error messages */
  const validateAndConfirm = () => {
    setFormError('');
    const parsedAmt = parseFloat(amount);

    if (!amount || isNaN(parsedAmt) || parsedAmt <= 0) {
      setFormError('Please enter a valid payment amount greater than ₹0');
      return;
    }
    // Gross check: net + TDS + retention must fit within available cap
    const gross = parsedAmt + tdsNum + retentionNum;
    if (gross > availableToPay + 0.01) {
      const deductionNote = tdsNum + retentionNum > 0
        ? ` (₹${parsedAmt.toLocaleString('en-IN')} net + ₹${tdsNum.toLocaleString('en-IN')} TDS + ₹${retentionNum.toLocaleString('en-IN')} retention = ₹${gross.toLocaleString('en-IN')} gross)`
        : '';
      setFormError(`Total${deductionNote} exceeds available balance of ₹${availableToPay.toLocaleString('en-IN')}`);
      return;
    }
    // Validate deduction amounts
    if (tdsNum < 0 || retentionNum < 0) {
      setFormError('TDS and retention amounts cannot be negative');
      return;
    }
    // Validate GST/Basic split if enabled
    if (splitMode === 'split') {
      const basic = parseFloat(basicAmount) || 0;
      const gst = parseFloat(gstPayAmount) || 0;
      if (basic < 0 || gst < 0) {
        setFormError('Basic and GST amounts cannot be negative');
        return;
      }
      if (Math.abs((basic + gst) - parsedAmt) > 0.01) {
        setFormError(`Basic (₹${basic.toLocaleString('en-IN')}) + GST (₹${gst.toLocaleString('en-IN')}) must equal total payment (₹${parsedAmt.toLocaleString('en-IN')})`);
        return;
      }
    }
    if (!utrReference.trim()) {
      setFormError('UTR / Reference number is required');
      return;
    }
    if (utrReference.trim().length < 3) {
      setFormError('UTR / Reference number must be at least 3 characters');
      return;
    }
    if (!paymentDate) {
      setFormError('Payment date is required');
      return;
    }
    // Check date not more than 30 days in future
    const dateObj = new Date(paymentDate);
    const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (dateObj > maxDate) {
      setFormError('Payment date cannot be more than 30 days in the future');
      return;
    }

    // Show confirmation dialog
    setShowConfirm(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Record Payment"
      >
        {/* ── Confirmation Step ── */}
        {showConfirm ? (
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 mb-4">
              <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Payment</h3>
            <p className="text-sm text-gray-600 mb-1">
              You are about to record a payment of
            </p>
            <p className="text-2xl font-bold text-emerald-700 mb-1">
              ₹{parseFloat(amount).toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-gray-500 mb-0.5">Net amount to vendor</p>
            {(tdsNum > 0 || retentionNum > 0) && (
              <div className="inline-flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 my-1.5 text-xs">
                {tdsNum > 0 && <span className="text-red-600 font-medium">TDS: ₹{tdsNum.toLocaleString('en-IN')}</span>}
                {retentionNum > 0 && <span className="text-amber-600 font-medium">Retention: ₹{retentionNum.toLocaleString('en-IN')}</span>}
                <span className="text-gray-500">Gross: ₹{grossAmount.toLocaleString('en-IN')}</span>
              </div>
            )}
            {splitMode === 'split' && (parseFloat(basicAmount) || 0) + (parseFloat(gstPayAmount) || 0) > 0 && (
              <p className="text-xs text-gray-500 mb-1">
                Basic: ₹{(parseFloat(basicAmount) || 0).toLocaleString('en-IN')} · GST: ₹{(parseFloat(gstPayAmount) || 0).toLocaleString('en-IN')}
              </p>
            )}
            <p className="text-sm text-gray-500 mb-1">
              for invoice <strong className="text-gray-900">#{invoice.invoiceNumber}</strong>
            </p>
            <p className="text-sm text-gray-500 mb-1">
              Vendor: <strong className="text-gray-700">{invoice.vendorName}</strong>
            </p>
            <p className="text-sm text-gray-500 mb-4">
              UTR: <strong className="text-gray-700">{utrReference}</strong> · Date: {paymentDate}
            </p>
            <p className="text-xs text-amber-600 mb-5 font-medium">
              ⚠ This action cannot be undone. Please verify before confirming.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]"
              >
                Go Back
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  const splitData = splitMode === 'split'
                    ? { basicAmount, gstAmount: gstPayAmount, paymentType: (parseFloat(basicAmount) || 0) > 0 && (parseFloat(gstPayAmount) || 0) > 0 ? 'combined' : (parseFloat(basicAmount) || 0) > 0 ? 'basic_only' : 'gst_only' }
                    : {};
                  const deductionData = {
                    ...(tdsNum > 0 ? { tdsAmount: String(tdsNum) } : {}),
                    ...(retentionNum > 0 ? { retentionAmount: String(retentionNum) } : {}),
                  };
                  // Flag retention release so API doesn't double-count against cap
                  const retentionReleaseData = isRetentionRelease ? { paymentType: 'retention_release' } : {};
                  onSubmit({ amount, utrReference, paymentDate, notes, ...splitData, ...deductionData, ...retentionReleaseData });
                }}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {isSubmitting ? 'Processing…' : 'Yes, Record Payment'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                {isRetentionRelease ? '🔓 Release Retention' : 'Record Payment'}
              </h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="Close">×</button>
            </div>

            {isRetentionRelease && (
              <div className="mb-4 flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Releasing retained amount of <strong>₹{prefillRetentionRelease.toLocaleString('en-IN')}</strong> back to vendor. Adjust amount if partial release is needed.</span>
              </div>
            )}

            {/* Invoice summary */}
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-500">{invoice.vendorName}</span>
                <TypeBadge type={invoice.invoiceType} />
              </div>
              <p className="text-sm font-medium text-gray-900">#{invoice.invoiceNumber} — {invoice.purpose}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-gray-500">Invoice Amount</span>
                <span className="text-sm text-gray-900">{formatCurrency(invoice.amount)}</span>
              </div>
              {paymentSummary && paymentSummary.approvedAmount !== paymentSummary.invoiceAmount && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-medium text-emerald-700">Approved Amount</span>
                  <span className="font-bold text-emerald-700">{formatCurrency(paymentSummary.approvedAmount)}</span>
                </div>
              )}
              {!(paymentSummary && paymentSummary.approvedAmount !== paymentSummary.invoiceAmount) && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm text-gray-500">Approved Amount</span>
                  <span className="font-bold text-gray-900">{formatCurrency(invoice.approvedAmount || invoice.amount)}</span>
                </div>
              )}
              {paymentSummary && paymentSummary.totalPaid > 0 && (
                <>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm text-gray-500">Already Paid</span>
                    <span className="text-sm text-emerald-600">{formatCurrency(paymentSummary.totalPaid)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-100">
                    <span className="text-sm font-medium text-gray-600">Invoice Remaining</span>
                    <span className="font-bold text-violet-600">{formatCurrency(invoiceRemaining)}</span>
                  </div>
                  {availableToPay !== invoiceRemaining && (
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm text-amber-600">Available to Pay Now</span>
                      <span className="font-bold text-amber-600">{formatCurrency(availableToPay)}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Payment form */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Payment Amount <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={availableToPay}
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setFormError(''); }}
                    className={`w-full pl-7 pr-3 py-2.5 rounded-lg border text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 min-h-[44px] ${
                      amount && (parseFloat(amount) > availableToPay + 0.01 || parseFloat(amount) > invoiceRemaining + 0.01)
                        ? 'border-red-400 bg-red-50 focus:ring-red-500 focus:border-red-500'
                        : 'border-gray-200 bg-gray-50 focus:ring-blue-500 focus:border-blue-500'
                    }`}
                    placeholder="Enter payment amount"
                  />
                </div>
                {amount && parseFloat(amount) > availableToPay + 0.01 ? (
                  <p className="text-xs text-red-500 mt-1 font-medium">
                    ⚠ Amount exceeds available balance of {formatCurrency(availableToPay)}
                  </p>
                ) : amount && parseFloat(amount) > invoiceRemaining + 0.01 ? (
                  <p className="text-xs text-red-500 mt-1 font-medium">
                    ⚠ Amount exceeds invoice remaining of {formatCurrency(invoiceRemaining)}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">
                    Max payable: {formatCurrency(Math.min(availableToPay, invoiceRemaining))}
                    {availableToPay !== invoiceRemaining && (
                      <span className="text-amber-500"> · Available now: {formatCurrency(availableToPay)}</span>
                    )}
                  </p>
                )}
              </div>

              {/* ── Deductions (TDS / Retention) — optional ── */}
              <div className="rounded-lg border border-orange-100 bg-orange-50/30 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowDeductions(!showDeductions)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-gray-600 hover:bg-orange-50/50 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                    </svg>
                    Deductions (TDS / Retention)
                    <span className="text-[10px] font-normal text-gray-400">— optional</span>
                  </span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${showDeductions ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showDeductions && (
                  <div className="px-3 pb-3 space-y-3 border-t border-orange-100">
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">TDS Amount</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={tdsInput}
                            onChange={(e) => { setTdsInput(e.target.value); setFormError(''); }}
                            className="w-full pl-6 pr-2 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 min-h-[40px]"
                            placeholder="0.00"
                          />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">Tax deducted at source</p>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Retention Amount</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={retentionInput}
                            onChange={(e) => { setRetentionInput(e.target.value); setFormError(''); }}
                            className="w-full pl-6 pr-2 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 min-h-[40px]"
                            placeholder="0.00"
                          />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">Amount held (defect liability)</p>
                      </div>
                    </div>

                    {/* Live calculation summary */}
                    {(tdsNum > 0 || retentionNum > 0) && parsedAmount > 0 && (
                      <div className="rounded-md bg-white border border-orange-200 p-2.5">
                        <div className="grid grid-cols-3 gap-2 text-[11px] text-center">
                          <div>
                            <p className="text-gray-400">Net to Vendor</p>
                            <p className="font-bold text-emerald-700">{formatCurrency(netToVendor)}</p>
                          </div>
                          <div>
                            <p className="text-gray-400">TDS + Retention</p>
                            <p className="font-bold text-red-600">{formatCurrency(tdsNum + retentionNum)}</p>
                          </div>
                          <div>
                            <p className="text-gray-400">Gross Consumed</p>
                            <p className={`font-bold ${grossAmount > availableToPay + 0.01 ? 'text-red-600' : 'text-gray-800'}`}>
                              {formatCurrency(grossAmount)}
                            </p>
                          </div>
                        </div>
                        {grossAmount > availableToPay + 0.01 && (
                          <p className="text-[10px] text-red-500 mt-1.5 text-center font-medium">
                            ⚠ Gross exceeds available balance of {formatCurrency(availableToPay)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* GST / Basic Split (only shown when invoice has GST) */}
              {hasGST && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">Payment Split</span>
                    <div className="flex rounded-md border border-gray-200 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setSplitMode('split')}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors ${splitMode === 'split' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                      >
                        Basic + GST
                      </button>
                      <button
                        type="button"
                        onClick={() => setSplitMode('combined')}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors ${splitMode === 'combined' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                      >
                        Combined
                      </button>
                    </div>
                  </div>
                  {splitMode === 'split' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Basic Amount</label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={basicAmount}
                              onChange={(e) => {
                                setBasicAmount(e.target.value);
                                setFormError('');
                                // Auto-fill GST if total is set
                                const parsedTotal = parseFloat(amount) || 0;
                                const parsedBasic = parseFloat(e.target.value) || 0;
                                if (parsedTotal > 0 && parsedBasic >= 0) {
                                  setGstPayAmount(String(Math.max(0, +(parsedTotal - parsedBasic).toFixed(2))));
                                }
                              }}
                              className="w-full pl-6 pr-2 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[40px]"
                              placeholder="0.00"
                            />
                          </div>
                          {paymentSummary?.basicRemaining !== undefined && (
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              Remaining: ₹{paymentSummary.basicRemaining.toLocaleString('en-IN')}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">GST Amount</label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={gstPayAmount}
                              onChange={(e) => {
                                setGstPayAmount(e.target.value);
                                setFormError('');
                                // Auto-fill basic if total is set
                                const parsedTotal = parseFloat(amount) || 0;
                                const parsedGst = parseFloat(e.target.value) || 0;
                                if (parsedTotal > 0 && parsedGst >= 0) {
                                  setBasicAmount(String(Math.max(0, +(parsedTotal - parsedGst).toFixed(2))));
                                }
                              }}
                              className="w-full pl-6 pr-2 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[40px]"
                              placeholder="0.00"
                            />
                          </div>
                          {paymentSummary?.gstRemaining !== undefined && (
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              Remaining: ₹{paymentSummary.gstRemaining.toLocaleString('en-IN')}
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Sum check */}
                      {amount && (basicAmount || gstPayAmount) && (
                        <p className={`text-xs ${Math.abs(((parseFloat(basicAmount) || 0) + (parseFloat(gstPayAmount) || 0)) - (parseFloat(amount) || 0)) < 0.02 ? 'text-emerald-600' : 'text-red-500'}`}>
                          Basic + GST = ₹{((parseFloat(basicAmount) || 0) + (parseFloat(gstPayAmount) || 0)).toLocaleString('en-IN')}
                          {Math.abs(((parseFloat(basicAmount) || 0) + (parseFloat(gstPayAmount) || 0)) - (parseFloat(amount) || 0)) < 0.02 ? ' ✓' : ` ≠ ₹${(parseFloat(amount) || 0).toLocaleString('en-IN')}`}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  UTR / Reference Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={utrReference}
                  onChange={(e) => { setUtrReference(e.target.value); setFormError(''); }}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                  placeholder="Enter UTR or payment reference (min 3 chars)"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Payment Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => { setPaymentDate(e.target.value); setFormError(''); }}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                  placeholder="GST payment, advance, etc."
                />
              </div>
            </div>

            {/* Validation error */}
            {formError && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm" role="alert">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                {formError}
              </div>
            )}

            <div className="flex items-center gap-3 mt-6">
              <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]">
                Cancel
              </button>
              <button
                onClick={validateAndConfirm}
                disabled={isSubmitting || !amount || (parseFloat(amount) || 0) > Math.min(availableToPay, invoiceRemaining) + 0.01 || (parseFloat(amount) || 0) <= 0}
                className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing…
                  </span>
                ) : (
                  `Pay ${amount ? formatCurrency(amount) : ''}`
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   REJECT MODAL
   ===================================================================== */

function RejectModal({
  invoice,
  rejectionReasons,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  invoice: Invoice;
  rejectionReasons: { id: string; reason: string }[];
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isSubmitting: boolean;
}) {
  const [reason, setReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  const handleRejectSubmit = () => {
    setRejectError('');
    if (!reason.trim()) {
      setRejectError('Please provide a rejection reason');
      return;
    }
    if (reason.trim().length < 5) {
      setRejectError('Rejection reason must be at least 5 characters');
      return;
    }
    onSubmit(reason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Raise Query on Invoice"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-orange-600">Raise Query</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="Close">×</button>
        </div>

        <p className="text-sm text-gray-600 mb-3">
          This will raise a query on <strong className="text-gray-900">#{invoice.invoiceNumber}</strong> from {invoice.vendorName}. The approver will review your concern and either accept it (sending for correction) or disagree and re-approve.
        </p>

        {rejectionReasons.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {rejectionReasons.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setReason(r.reason); setRejectError(''); }}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                  reason === r.reason
                    ? 'bg-orange-50 border-orange-200 text-orange-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700'
                }`}
              >
                {r.reason}
              </button>
            ))}
          </div>
        )}

        <textarea
          value={reason}
          onChange={(e) => { setReason(e.target.value); setRejectError(''); }}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          rows={3}
          placeholder="Describe the issue with this invoice (min 5 characters)…"
        />

        {rejectError && (
          <div className="mt-2 flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-100 text-red-700 text-xs" role="alert">
            <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            {rejectError}
          </div>
        )}

        <div className="flex items-center gap-3 mt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]">
            Cancel
          </button>
          <button
            onClick={handleRejectSubmit}
            disabled={isSubmitting || !reason.trim()}
            className="flex-1 px-4 py-2.5 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {isSubmitting ? 'Raising Query…' : 'Raise Query'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   PAYMENT HISTORY MODAL
   ===================================================================== */

function PaymentHistory({
  invoice,
  onClose,
  onReleaseRetention,
}: {
  invoice: Invoice;
  payments: PaymentSummary | null; // kept for call-site compatibility
  onClose: () => void;
  onReleaseRetention?: (retentionAmount: number) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Payment History"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Payment Lifecycle</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="Close">×</button>
        </div>

        <div className="mb-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
          <p className="text-sm font-medium text-gray-900">
            #{invoice.invoiceNumber} — {invoice.vendorName}
          </p>
          {invoice.approvedBy && (
            <p className="text-xs text-gray-500 mt-1">
              Approved by <span className="font-medium text-gray-700">{invoice.approvedBy}</span>
            </p>
          )}
        </div>

        {/* Full lifecycle component — shows tranches, payments, timeline */}
        <PaymentLifecycle invoiceId={invoice.id} role="accounts" onReleaseRetention={onReleaseRetention} />
      </div>
    </div>
  );
}

/* =====================================================================
   FILE VIEWER MODAL
   ===================================================================== */

function FileViewerModal({
  title,
  url,
  fileName,
  onClose,
}: {
  title: string;
  url: string;
  fileName?: string;
  onClose: () => void;
}) {
  const isImage = isImageUrl(url, fileName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col p-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="Close">×</button>
        </div>
        <div className="flex-1 overflow-auto bg-gray-50 rounded-lg min-h-[300px]">
          {isImage ? (
            <img src={url} alt={title} className="w-full h-auto object-contain" />
          ) : (
            <iframe
              src={url}
              className="w-full h-[70vh] border-0"
              title={title}
              sandbox="allow-same-origin"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   MAIN DASHBOARD — TABLE LAYOUT
   ===================================================================== */

type FilterTab = 'all' | 'approved' | 'partially_paid' | 'paid' | 'rejected' | 'accounts_query';

export default function AccountsDashboard() {
  const { accountsName, isReady, logout } = useAccountsAuth();

  // Data
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Bulk payment summaries (loaded once for all invoices)
  const [bulkSummaries, setBulkSummaries] = useState<Record<string, BulkSummary>>({});
  const [summariesLoading, setSummariesLoading] = useState(true);

  // Per-invoice detailed payment data (loaded on expand for modals)
  const [paymentCache, setPaymentCache] = useState<Record<string, PaymentSummary>>({});

  // Filters & search
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'vendor'>('date');

  // Vendor outstanding summary
  const [vendorSummary, setVendorSummary] = useState<Array<{
    vendorName: string;
    invoiceCount: number;
    totalApproved: number;
    totalTDS: number;
    totalRetention: number;
    totalPaidToVendor: number;
    totalConsumed: number;
    outstanding: number;
  }>>([]);
  const [vendorSummaryOpen, setVendorSummaryOpen] = useState(false);
  const [vendorSummaryLoading, setVendorSummaryLoading] = useState(false);

  // Modals
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [retentionReleaseAmount, setRetentionReleaseAmount] = useState<number>(0); // pre-fill for retention release
  const [rejectInvoice, setRejectInvoice] = useState<Invoice | null>(null);
  const [historyInvoice, setHistoryInvoice] = useState<Invoice | null>(null);
  const [fileViewer, setFileViewer] = useState<{ title: string; url: string; fileName?: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Rejection reasons from database
  const [rejectionReasons, setRejectionReasons] = useState<{ id: string; reason: string }[]>([]);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch('/api/invoices');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch {
      setError('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch bulk payment summaries (one API call for all invoices)
  const fetchBulkSummaries = useCallback(async () => {
    setSummariesLoading(true);
    try {
      const res = await fetch('/api/payments/bulk-summary');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setBulkSummaries(data.summaries || {});
    } catch {
      console.error('Failed to load bulk payment summaries');
    } finally {
      setSummariesLoading(false);
    }
  }, []);

  // Fetch per-invoice detailed payments (for modals)
  const fetchPaymentSummary = useCallback(async (invoiceId: string): Promise<PaymentSummary | null> => {
    if (paymentCache[invoiceId]) return paymentCache[invoiceId];
    try {
      const res = await fetch(`/api/payments?invoiceId=${invoiceId}`);
      if (!res.ok) return null;
      const data = await res.json();
      setPaymentCache((prev) => ({ ...prev, [invoiceId]: data }));
      return data;
    } catch {
      return null;
    }
  }, [paymentCache]);

  const fetchRejectionReasons = useCallback(async () => {
    try {
      const res = await fetch('/api/rejection-reasons?active=true');
      const data = await res.json();
      if (res.ok) setRejectionReasons(data.reasons || []);
    } catch {
      console.error('Failed to fetch rejection reasons');
    }
  }, []);

  const fetchVendorSummary = useCallback(async () => {
    setVendorSummaryLoading(true);
    try {
      const res = await fetch('/api/deductions/vendor-summary');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setVendorSummary(data.vendors || []);
    } catch {
      console.error('Failed to load vendor summary');
    } finally {
      setVendorSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isReady) {
      fetchInvoices();
      fetchBulkSummaries();
      fetchRejectionReasons();
    }
  }, [isReady, fetchInvoices, fetchBulkSummaries, fetchRejectionReasons]);

  // Filter & sort
  const filteredInvoices = useMemo(() => {
    let filtered = invoices;

    if (activeTab !== 'all') {
      filtered = filtered.filter((inv) => inv.status === activeTab);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (inv) =>
          inv.vendorName.toLowerCase().includes(q) ||
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.purpose.toLowerCase().includes(q) ||
          (inv.poNumber && inv.poNumber.toLowerCase().includes(q))
      );
    }

    const sorted = [...filtered];
    switch (sortBy) {
      case 'amount':
        sorted.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
        break;
      case 'vendor':
        sorted.sort((a, b) => a.vendorName.localeCompare(b.vendorName));
        break;
      default:
        sorted.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    }

    return sorted;
  }, [invoices, activeTab, searchQuery, sortBy]);

  // Stats
  const stats = useMemo(() => {
    const approved = invoices.filter((i) => i.status === 'approved');
    const partiallyPaid = invoices.filter((i) => i.status === 'partially_paid');
    const paid = invoices.filter((i) => i.status === 'paid');
    const outstanding = [...approved, ...partiallyPaid];
    const sumAmount = (arr: Invoice[]) => arr.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    // Total disbursed across all invoices from bulk summaries
    const totalDisbursed = Object.values(bulkSummaries).reduce((sum, s) => sum + s.totalPaid, 0);
    return {
      approvedCount: approved.length,
      approvedAmount: sumAmount(approved),
      partiallyPaidCount: partiallyPaid.length,
      partiallyPaidAmount: sumAmount(partiallyPaid),
      paidCount: paid.length,
      paidAmount: sumAmount(paid),
      outstandingAmount: sumAmount(outstanding),
      totalDisbursed,
    };
  }, [invoices, bulkSummaries]);

  // Payment submission — generates a unique idempotency key per attempt
  // so that double-clicks, retries, and network timeouts are safe.
  const handleRecordPayment = useCallback(
    async (data: { amount: string; utrReference: string; paymentDate: string; notes: string; basicAmount?: string; gstAmount?: string; paymentType?: string; tdsAmount?: string; retentionAmount?: string }) => {
      if (!paymentInvoice) return;
      setIsSubmitting(true);
      try {
        // Generate a unique idempotency key: invoiceId + UTR + timestamp
        // This ensures that even if the user retries, the same key is not
        // reused for a genuinely different payment attempt.
        const idempotencyKey = `${paymentInvoice.id}-${data.utrReference}-${Date.now()}`;

        const payload: Record<string, string> = {
          invoiceId: paymentInvoice.id,
          amount: data.amount,
          utrReference: data.utrReference,
          paymentDate: data.paymentDate,
          notes: data.notes,
          idempotencyKey,
        };
        if (data.basicAmount) payload.basicAmount = data.basicAmount;
        if (data.gstAmount) payload.gstAmount = data.gstAmount;
        if (data.paymentType) payload.paymentType = data.paymentType;
        if (data.tdsAmount) payload.tdsAmount = data.tdsAmount;
        if (data.retentionAmount) payload.retentionAmount = data.retentionAmount;

        const res = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to record payment');

        setToast({
          message: result.idempotent
            ? 'Payment was already recorded (duplicate prevented)'
            : result.newStatus === 'paid'
              ? `Payment recorded — invoice fully paid!`
              : `Payment of ${formatCurrency(data.amount)} recorded`,
          type: 'success',
        });
        setPaymentInvoice(null);
        setPaymentCache((prev) => {
          const next = { ...prev };
          delete next[paymentInvoice.id];
          return next;
        });
        fetchInvoices();
        fetchBulkSummaries();
      } catch (err) {
        setToast({ message: err instanceof Error ? err.message : 'Failed to record payment', type: 'error' });
      } finally {
        setIsSubmitting(false);
      }
    },
    [paymentInvoice, fetchInvoices, fetchBulkSummaries]
  );

  // Rejection submission
  const handleReject = useCallback(
    async (reason: string) => {
      if (!rejectInvoice) return;
      setIsSubmitting(true);
      try {
        const res = await fetch('/api/invoices/accounts-reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId: rejectInvoice.id, reason }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to raise query');

        setToast({ message: 'Query raised — sent to approver for review', type: 'success' });
        setRejectInvoice(null);
        fetchInvoices();
      } catch (err) {
        setToast({ message: err instanceof Error ? err.message : 'Failed to raise query', type: 'error' });
      } finally {
        setIsSubmitting(false);
      }
    },
    [rejectInvoice, fetchInvoices]
  );

  // Open payment modal (pre-fetch payment data)
  const openPaymentModal = useCallback(
    async (inv: Invoice, prefillRetention?: number) => {
      setRetentionReleaseAmount(prefillRetention || 0);
      setPaymentInvoice(inv);
      await fetchPaymentSummary(inv.id);
    },
    [fetchPaymentSummary]
  );

  // Handle retention release — close history modal, open payment modal with retention pre-fill
  const handleReleaseRetention = useCallback(
    (inv: Invoice) => (retentionAmount: number) => {
      setHistoryInvoice(null); // close history if open
      openPaymentModal(inv, retentionAmount);
    },
    [openPaymentModal]
  );

  // Open history modal
  const openHistoryModal = useCallback(
    async (inv: Invoice) => {
      setHistoryInvoice(inv);
      await fetchPaymentSummary(inv.id);
    },
    [fetchPaymentSummary]
  );

  if (!isReady) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] max-w-sm px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all animate-slide-in ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {toast.message}
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Accounts Dashboard</h1>
              <p className="text-xs text-gray-500">Welcome back, {accountsName}</p>
            </div>
            <div className="flex items-center gap-3">
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
        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <button
            onClick={() => setActiveTab('approved')}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden group hover:shadow-md ${
              activeTab === 'approved' ? 'ring-2 ring-amber-500 ring-offset-1' : ''
            }`}
            aria-label={`Pending payment: ${stats.approvedCount}`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-gray-500">Pending payment</p>
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-amber-600 mt-1">{stats.approvedCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">worth {formatCurrency(stats.approvedAmount)}</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500" />
          </button>

          <button
            onClick={() => setActiveTab('partially_paid')}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden group hover:shadow-md ${
              activeTab === 'partially_paid' ? 'ring-2 ring-violet-500 ring-offset-1' : ''
            }`}
            aria-label={`Partially paid: ${stats.partiallyPaidCount}`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-gray-500">Partially paid</p>
              <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-violet-600 mt-1">{stats.partiallyPaidCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">worth {formatCurrency(stats.partiallyPaidAmount)}</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-violet-500" />
          </button>

          <button
            onClick={() => setActiveTab('paid')}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden group hover:shadow-md ${
              activeTab === 'paid' ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
            }`}
            aria-label={`Total disbursed: ${formatCurrency(stats.totalDisbursed)}`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-gray-500">Total Disbursed</p>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {summariesLoading ? '…' : formatCurrency(stats.totalDisbursed)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {stats.paidCount} invoice{stats.paidCount !== 1 ? 's' : ''} fully paid
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={`bg-white rounded-xl p-4 text-left transition-all border border-gray-200 relative overflow-hidden group hover:shadow-md ${
              activeTab === 'all' ? 'ring-2 ring-blue-500 ring-offset-1' : ''
            }`}
            aria-label={`Unpaid invoices: ${stats.approvedCount + stats.partiallyPaidCount}`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-gray-500">Unpaid Invoices</p>
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.approvedCount + stats.partiallyPaidCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">worth {formatCurrency(stats.outstandingAmount)}</p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500" />
          </button>
        </div>

        {/* ── Vendor Outstanding Summary ── */}
        <div className="mb-5">
          <button
            onClick={() => {
              const next = !vendorSummaryOpen;
              setVendorSummaryOpen(next);
              if (next && vendorSummary.length === 0) fetchVendorSummary();
            }}
            className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-blue-700 transition-colors group"
          >
            <svg className={`w-4 h-4 transition-transform ${vendorSummaryOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Vendor Outstanding Summary
            {vendorSummary.length > 0 && (
              <span className="text-xs font-normal text-gray-400">({vendorSummary.length} vendor{vendorSummary.length !== 1 ? 's' : ''})</span>
            )}
          </button>

          {vendorSummaryOpen && (
            <div className="mt-3 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {vendorSummaryLoading ? (
                <div className="p-6 text-center text-sm text-gray-400">
                  <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mr-2" />
                  Loading vendor summary…
                </div>
              ) : vendorSummary.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">
                  No vendors with outstanding amounts or held retention.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Vendor</th>
                        <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Invoices</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Approved</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">TDS</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Retention</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Paid to Vendor</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Consumed</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {vendorSummary.map((v) => (
                        <tr key={v.vendorName} className="hover:bg-gray-50/50">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700 flex-shrink-0">
                                {getInitials(v.vendorName)}
                              </div>
                              <span className="font-medium text-gray-800 text-xs">{v.vendorName}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center text-xs text-gray-600">{v.invoiceCount}</td>
                          <td className="px-3 py-2.5 text-right text-xs font-semibold text-emerald-700">{formatCurrency(v.totalApproved)}</td>
                          <td className="px-3 py-2.5 text-right text-xs text-red-600">{v.totalTDS > 0 ? formatCurrency(v.totalTDS) : '—'}</td>
                          <td className="px-3 py-2.5 text-right text-xs text-amber-600">
                            {v.totalRetention > 0 ? formatCurrency(v.totalRetention) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs font-semibold text-violet-700">{formatCurrency(v.totalPaidToVendor)}</td>
                          <td className="px-3 py-2.5 text-right text-xs text-gray-600">{formatCurrency(v.totalConsumed)}</td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={`text-xs font-bold ${v.outstanding > 0 ? 'text-blue-700' : 'text-emerald-600'}`}>
                              {formatCurrency(Math.max(0, v.outstanding))}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200 font-semibold text-xs">
                        <td className="px-4 py-2.5 text-gray-700">Total</td>
                        <td className="px-3 py-2.5 text-center text-gray-600">{vendorSummary.reduce((s, v) => s + v.invoiceCount, 0)}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-700">{formatCurrency(vendorSummary.reduce((s, v) => s + v.totalApproved, 0))}</td>
                        <td className="px-3 py-2.5 text-right text-red-600">{formatCurrency(vendorSummary.reduce((s, v) => s + v.totalTDS, 0))}</td>
                        <td className="px-3 py-2.5 text-right text-amber-600">{formatCurrency(vendorSummary.reduce((s, v) => s + v.totalRetention, 0))}</td>
                        <td className="px-3 py-2.5 text-right text-violet-700">{formatCurrency(vendorSummary.reduce((s, v) => s + v.totalPaidToVendor, 0))}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{formatCurrency(vendorSummary.reduce((s, v) => s + v.totalConsumed, 0))}</td>
                        <td className="px-3 py-2.5 text-right text-blue-700">{formatCurrency(vendorSummary.reduce((s, v) => s + Math.max(0, v.outstanding), 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── List header: count + sort ── */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-500">
            Showing <strong className="text-gray-700">{filteredInvoices.length}</strong> invoice{filteredInvoices.length !== 1 ? 's' : ''}
            {activeTab !== 'all' && ` · ${activeTab.replace('_', ' ')}`}
          </p>
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
          <LoadingSkeleton variant="card" count={4} />
        ) : filteredInvoices.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm text-center py-16 px-6">
            {activeTab === 'paid' && !searchQuery ? (
              <>
                <div className="text-4xl mb-3">🎉</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">All payments complete!</h3>
                <p className="text-gray-500 text-sm">Every invoice has been fully paid.</p>
              </>
            ) : activeTab === 'approved' && !searchQuery ? (
              <>
                <div className="text-4xl mb-3">✅</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No pending payments</h3>
                <p className="text-gray-500 text-sm">All approved invoices have been processed.</p>
              </>
            ) : (
              <>
                <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <p className="text-gray-500 text-sm">
                  {searchQuery ? `No invoices match "${searchQuery}"` : 'No invoices found'}
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* ===== Desktop Table ===== */}
            <div className="hidden lg:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice #</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vendor</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Project</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice Amt</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Approved</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Paid</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Remaining</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Docs</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredInvoices.map((inv) => {
                      const isExpanded = expandedId === inv.id;
                      const canPay = inv.status === 'approved' || inv.status === 'partially_paid';
                      const canReject = inv.status === 'approved' || inv.status === 'partially_paid';
                      const bulk = bulkSummaries[inv.id];
                      const invoiceAmt = parseFloat(inv.amount) || 0;
                      const approvedAmt = inv.approvedAmount ? parseFloat(inv.approvedAmount) || invoiceAmt : invoiceAmt;
                      const totalPaid = bulk?.totalPaid ?? 0;
                      const remaining = bulk?.remaining ?? invoiceAmt;
                      const invoiceIsImage = isImageUrl(inv.invoiceFileUrl, inv.invoiceFileName);
                      const invoicePreview = !invoiceIsImage ? getPreviewUrl(inv.invoiceFileUrl) : null;
                      const hasAttachments = !!(inv.invoiceFileUrl || inv.workPhotos || inv.measurementSheetUrl || inv.challanUrl);
                      const cachedPayment = paymentCache[inv.id];

                      return (
                        <React.Fragment key={inv.id}>
                          <tr
                            className={`hover:bg-gray-50 cursor-pointer transition-colors border-l-4 ${statusBorderColor(inv.status)} ${isExpanded ? 'bg-blue-50/30' : ''}`}
                            onClick={() => {
                              setExpandedId(isExpanded ? null : inv.id);
                              if (!isExpanded && !paymentCache[inv.id]) {
                                fetchPaymentSummary(inv.id);
                              }
                            }}
                          >
                            <td className="px-4 py-3">
                              <span className="font-bold text-gray-900">{inv.invoiceNumber}</span>
                              {inv.invoiceType && (
                                <span className="ml-1.5"><TypeBadge type={inv.invoiceType} /></span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500">
                                  {getInitials(inv.vendorName)}
                                </div>
                                <span className="text-gray-700 truncate max-w-[140px]">{inv.vendorName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-sm">
                              {inv.project || <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(inv.invoiceDate)}</td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {(() => {
                                const gst = parseFloat(inv.gstAmount || '') || 0;
                                const total = invoiceAmt + gst;
                                return gst > 0 ? (
                                  <>
                                    <span className="font-semibold text-gray-900">{formatCurrency(total)}</span>
                                    <span className="block text-[10px] text-gray-400">
                                      {formatCurrency(invoiceAmt)} + GST {formatCurrency(inv.gstAmount!)}
                                    </span>
                                  </>
                                ) : (
                                  <span className="font-semibold text-gray-900">{formatCurrency(invoiceAmt)}</span>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <span className={approvedAmt !== invoiceAmt ? 'text-emerald-700 font-semibold' : 'text-gray-600'}>
                                {formatCurrency(approvedAmt)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {summariesLoading ? (
                                <span className="text-gray-300">…</span>
                              ) : totalPaid > 0 ? (
                                <span className="text-emerald-600 font-semibold">{formatCurrency(totalPaid)}</span>
                              ) : (
                                <span className="text-gray-300">₹0</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {summariesLoading ? (
                                <span className="text-gray-300">…</span>
                              ) : remaining > 0 ? (
                                <span className="text-violet-600 font-semibold">{formatCurrency(remaining)}</span>
                              ) : (
                                <span className="text-emerald-500 font-medium">₹0</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <AccountsStatusBadge status={inv.status} />
                                {bulk?.hasNewAuthorization && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 animate-pulse">
                                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                    </svg>
                                    New +₹{parseFloat(bulk.newAuthorizationAmount || '0').toLocaleString('en-IN')}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {hasAttachments ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (inv.invoiceFileUrl) {
                                      setFileViewer({ title: `Invoice ${inv.invoiceNumber}`, url: inv.invoiceFileUrl, fileName: inv.invoiceFileName });
                                    } else {
                                      setExpandedId(inv.id);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium"
                                  title="View attachments"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                                  </svg>
                                  View
                                </button>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {canPay && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openPaymentModal(inv); }}
                                    className="px-2 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                                    title="Record payment"
                                  >
                                    ₹ Pay
                                  </button>
                                )}
                                {canReject && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setRejectInvoice(inv); }}
                                    className="px-2 py-1 rounded text-xs font-medium bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 transition-colors"
                                    title="Raise Query"
                                  >
                                    ?
                                  </button>
                                )}
                                {(inv.status === 'partially_paid' || inv.status === 'paid') && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openHistoryModal(inv); }}
                                    className="px-2 py-1 rounded text-xs font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors"
                                    title="Payment history"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Expanded detail row */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={11} className="p-0">
                                <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100">
                                  {/* Detail grid */}
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs mb-4">
                                    <div>
                                      <span className="text-gray-400">Purpose</span>
                                      <p className="text-gray-700 font-medium">{inv.purpose}</p>
                                    </div>
                                    <div>
                                      <span className="text-gray-400">Submitted By</span>
                                      <p className="text-gray-700 font-medium">{inv.submittedBy || '—'}</p>
                                    </div>
                                    <div>
                                      <span className="text-gray-400">Approved By</span>
                                      <p className="text-gray-700 font-medium">{inv.approvedBy || '—'}</p>
                                    </div>
                                    {inv.poNumber && (
                                      <div>
                                        <span className="text-gray-400">PO Number</span>
                                        <p className="text-gray-700 font-medium">{inv.poNumber}</p>
                                      </div>
                                    )}
                                    {inv.remarks && (
                                      <div className="col-span-2">
                                        <span className="text-gray-400">Remarks</span>
                                        <p className="text-gray-700">{inv.remarks}</p>
                                      </div>
                                    )}
                                    {inv.approvalComments && (
                                      <div className="col-span-2">
                                        <span className="text-gray-400">Approval Comments</span>
                                        <p className="text-gray-700 italic">&ldquo;{inv.approvalComments}&rdquo;</p>
                                      </div>
                                    )}
                                  </div>

                                  {/* Payment progress */}
                                  {cachedPayment && cachedPayment.totalPaid > 0 && (
                                    <div className="mb-4 p-3 rounded-lg bg-emerald-50/50 border border-emerald-100">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-emerald-700 font-medium">
                                          {cachedPayment.isFullyPaid ? '✓ Fully Paid' : `◑ ${formatCurrency(cachedPayment.totalPaid)} paid`}
                                        </span>
                                        <span className="text-gray-500">
                                          {cachedPayment.payments.length} payment{cachedPayment.payments.length !== 1 ? 's' : ''}
                                          {!cachedPayment.isFullyPaid && ` · ${formatCurrency(cachedPayment.remaining)} remaining`}
                                        </span>
                                      </div>
                                      <div className="mt-2 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                                        <div
                                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                                          style={{ width: `${Math.min(100, (cachedPayment.totalPaid / cachedPayment.invoiceAmount) * 100)}%` }}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {/* Invoice document */}
                                  {inv.invoiceFileUrl && (
                                    <div className="mb-4 rounded-lg p-4 bg-blue-50/50 border border-blue-100">
                                      <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                        </svg>
                                        Invoice — {inv.invoiceFileName || 'Uploaded file'}
                                      </p>
                                      {invoiceIsImage && (
                                        <img src={inv.invoiceFileUrl} alt={`Invoice ${inv.invoiceNumber}`}
                                          className="w-full max-h-[500px] object-contain rounded-lg cursor-pointer hover:opacity-90 transition-opacity bg-white border border-gray-200"
                                          onClick={() => setFileViewer({ title: 'Invoice Document', url: inv.invoiceFileUrl, fileName: inv.invoiceFileName })} />
                                      )}
                                      {invoicePreview && (
                                        <iframe src={invoicePreview} className="w-full rounded-lg border border-gray-200"
                                          style={{ height: '500px' }} title={`Invoice ${inv.invoiceNumber} preview`} allow="autoplay" />
                                      )}
                                      {!invoiceIsImage && !invoicePreview && inv.invoiceFileUrl && (
                                        <a href={inv.invoiceFileUrl} target="_blank" rel="noopener noreferrer"
                                          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors min-h-[44px]">
                                          Open Invoice in New Tab
                                        </a>
                                      )}
                                    </div>
                                  )}

                                  {/* File links */}
                                  <div className="flex flex-wrap gap-2 mb-4">
                                    {inv.measurementSheetUrl && (
                                      <button
                                        onClick={() => setFileViewer({ title: 'Measurement Sheet', url: inv.measurementSheetUrl, fileName: inv.measurementSheetName })}
                                        className="text-xs px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border border-cyan-200 transition-colors font-medium"
                                      >
                                        📏 Measurement Sheet
                                      </button>
                                    )}
                                    {inv.challanUrl && (
                                      <button
                                        onClick={() => setFileViewer({ title: 'Challan', url: inv.challanUrl!, fileName: inv.challanName })}
                                        className="text-xs px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 transition-colors font-medium"
                                      >
                                        📋 Challan
                                      </button>
                                    )}
                                  </div>

                                  {/* Work Photos */}
                                  {inv.workPhotos && (
                                    <PhotoViewer
                                      invoiceId={inv.id}
                                      quickPhotoUrls={inv.workPhotos.split(',').filter(Boolean)}
                                      showVersionHistory={true}
                                    />
                                  )}

                                  {/* Action buttons */}
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {canPay && (
                                      <button
                                        onClick={() => openPaymentModal(inv)}
                                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors min-h-[44px]"
                                      >
                                        Record Payment
                                      </button>
                                    )}
                                    {canReject && (
                                      <button
                                        onClick={() => setRejectInvoice(inv)}
                                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors min-h-[44px]"
                                      >
                                        Raise Query
                                      </button>
                                    )}
                                    {(inv.status === 'partially_paid' || inv.status === 'paid') && (
                                      <button
                                        onClick={() => openHistoryModal(inv)}
                                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors min-h-[44px]"
                                      >
                                        Payment History
                                      </button>
                                    )}
                                  </div>
                                </div>
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

            {/* ===== Mobile Cards ===== */}
            <div className="lg:hidden space-y-2.5">
              {filteredInvoices.map((inv) => {
                const isExpanded = expandedId === inv.id;
                const canPay = inv.status === 'approved' || inv.status === 'partially_paid';
                const bulk = bulkSummaries[inv.id];
                const invoiceAmt = parseFloat(inv.amount) || 0;
                const approvedAmt = inv.approvedAmount ? parseFloat(inv.approvedAmount) || invoiceAmt : invoiceAmt;
                const totalPaid = bulk?.totalPaid ?? 0;
                const remaining = bulk?.remaining ?? invoiceAmt;
                const cachedPayment = paymentCache[inv.id];
                const invoiceIsImage = isImageUrl(inv.invoiceFileUrl, inv.invoiceFileName);
                const invoicePreview = !invoiceIsImage ? getPreviewUrl(inv.invoiceFileUrl) : null;

                return (
                  <div
                    key={inv.id}
                    className={`bg-white rounded-xl border border-gray-200 shadow-sm transition-all border-l-4 ${statusBorderColor(inv.status)}`}
                  >
                    <div
                      className="p-4 cursor-pointer"
                      onClick={() => {
                        setExpandedId(isExpanded ? null : inv.id);
                        if (!isExpanded && !paymentCache[inv.id]) {
                          fetchPaymentSummary(inv.id);
                        }
                      }}
                      role="button"
                      aria-expanded={isExpanded}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isExpanded ? null : inv.id); } }}
                    >
                      {/* Header row */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {inv.project && (
                            <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">
                              {inv.project}
                            </span>
                          )}
                          <span className="font-bold text-gray-900 text-sm">{inv.invoiceNumber}</span>
                          <span className="text-gray-400 text-xs">·</span>
                          <span className="text-sm text-gray-600">{inv.vendorName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <AccountsStatusBadge status={inv.status} />
                          <svg
                            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>

                      {/* New Authorization badge (mobile) */}
                      {bulk?.hasNewAuthorization && (
                        <div className="mb-2 p-2 rounded-lg bg-blue-50 border border-blue-200 flex items-center gap-2">
                          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          <p className="text-xs text-blue-700 font-medium">
                            New authorization: <strong>+₹{parseFloat(bulk.newAuthorizationAmount || '0').toLocaleString('en-IN')}</strong>
                            {bulk.newAuthorizationBy && <span className="text-blue-500"> by {bulk.newAuthorizationBy}</span>}
                          </p>
                        </div>
                      )}

                      {/* Key amounts — always visible */}
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <span className="text-gray-400">Invoice</span>
                          {(() => {
                            const gst = parseFloat(inv.gstAmount || '') || 0;
                            const total = invoiceAmt + gst;
                            return gst > 0 ? (
                              <>
                                <p className="font-bold text-gray-900">{formatCurrency(total)}</p>
                                <p className="text-[10px] text-gray-400">{formatCurrency(invoiceAmt)} + GST</p>
                              </>
                            ) : (
                              <p className="font-bold text-gray-900">{formatCurrency(invoiceAmt)}</p>
                            );
                          })()}
                        </div>
                        <div>
                          <span className="text-gray-400">Approved</span>
                          <p className={`font-bold ${approvedAmt !== invoiceAmt ? 'text-emerald-700' : 'text-gray-700'}`}>
                            {formatCurrency(approvedAmt)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-400">Paid</span>
                          <p className={`font-bold ${totalPaid > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
                            {summariesLoading ? '…' : formatCurrency(totalPaid)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-400">Remaining</span>
                          <p className={`font-bold ${remaining > 0 ? 'text-violet-600' : 'text-emerald-500'}`}>
                            {summariesLoading ? '…' : formatCurrency(remaining)}
                          </p>
                        </div>
                      </div>

                      <p className="text-xs text-gray-400 mt-2">{formatDate(inv.invoiceDate)} · {inv.purpose}</p>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0">
                        <div className="border-t border-gray-100 pt-4">
                          {/* Payment Lifecycle — tranche-correlated view */}
                          {(inv.status === 'approved' || inv.status === 'partially_paid' || inv.status === 'paid') && (
                            <div className="mb-4">
                              <PaymentLifecycle invoiceId={inv.id} role="accounts" onReleaseRetention={handleReleaseRetention(inv)} />
                            </div>
                          )}

                          {/* Invoice document */}
                          {inv.invoiceFileUrl && (
                            <div className="mb-4 rounded-lg p-4 bg-blue-50/50 border border-blue-100">
                              <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                </svg>
                                Invoice — {inv.invoiceFileName || 'Uploaded file'}
                              </p>
                              {invoiceIsImage && (
                                <img src={inv.invoiceFileUrl} alt={`Invoice ${inv.invoiceNumber}`}
                                  className="w-full max-h-[400px] object-contain rounded-lg bg-white border border-gray-200" />
                              )}
                              {invoicePreview && (
                                <iframe src={invoicePreview} className="w-full rounded-lg border border-gray-200"
                                  style={{ height: '400px' }} title={`Invoice ${inv.invoiceNumber} preview`} allow="autoplay" />
                              )}
                              {!invoiceIsImage && !invoicePreview && inv.invoiceFileUrl && (
                                <a href={inv.invoiceFileUrl} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors min-h-[44px]">
                                  Open Invoice
                                </a>
                              )}
                            </div>
                          )}

                          {/* Work Photos */}
                          {inv.workPhotos && (
                            <PhotoViewer
                              invoiceId={inv.id}
                              quickPhotoUrls={inv.workPhotos.split(',').filter(Boolean)}
                              showVersionHistory={true}
                            />
                          )}

                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {canPay && (
                              <button
                                onClick={() => openPaymentModal(inv)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors min-h-[44px]"
                              >
                                Record Payment
                              </button>
                            )}
                            {(inv.status === 'approved' || inv.status === 'partially_paid') && (
                              <button
                                onClick={() => setRejectInvoice(inv)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors min-h-[44px]"
                              >
                                Reject
                              </button>
                            )}
                            {(inv.status === 'partially_paid' || inv.status === 'paid') && (
                              <button
                                onClick={() => openHistoryModal(inv)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors min-h-[44px]"
                              >
                                Payment History
                              </button>
                            )}
                          </div>
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

      {/* Modals */}
      {paymentInvoice && (
        <PaymentModal
          invoice={paymentInvoice}
          paymentSummary={paymentCache[paymentInvoice.id] || null}
          onClose={() => { setPaymentInvoice(null); setRetentionReleaseAmount(0); }}
          onSubmit={handleRecordPayment}
          isSubmitting={isSubmitting}
          prefillRetentionRelease={retentionReleaseAmount}
        />
      )}
      {rejectInvoice && (
        <RejectModal
          invoice={rejectInvoice}
          rejectionReasons={rejectionReasons}
          onClose={() => setRejectInvoice(null)}
          onSubmit={handleReject}
          isSubmitting={isSubmitting}
        />
      )}
      {historyInvoice && (
        <PaymentHistory
          invoice={historyInvoice}
          payments={paymentCache[historyInvoice.id] || null}
          onClose={() => setHistoryInvoice(null)}
          onReleaseRetention={handleReleaseRetention(historyInvoice)}
        />
      )}
      {fileViewer && (
        <FileViewerModal
          title={fileViewer.title}
          url={fileViewer.url}
          fileName={fileViewer.fileName}
          onClose={() => setFileViewer(null)}
        />
      )}
    </div>
  );
}
