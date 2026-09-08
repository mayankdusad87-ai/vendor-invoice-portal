'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/ui/StatusBadge';
import TypeBadge from '@/components/ui/TypeBadge';
import PhotoViewer from '@/components/ui/PhotoViewer';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useEngineerAuth } from '@/hooks/useEngineerAuth';
import type { InvoiceStatus } from '@/lib/constants';

function isImageUrl(url: string, fileName?: string): boolean {
  if (!url) return false;
  if (url.startsWith('/api/r2/')) {
    return /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(url);
  }
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
  invoiceType: string;
  submittedBy: string;
  approvedAmount?: string;
}

export default function VendorInvoices() {
  const { engineerName: loggedInName, isReady, logout } = useEngineerAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Load ALL invoices on mount (no vendor filter required)
  useEffect(() => {
    if (!isReady) return;

    const fetchInvoices = async () => {
      setLoading(true);
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
    fetchInvoices();
  }, [isReady]);

  // Derive unique vendor names from loaded invoices
  const vendorNames = useMemo(() => {
    const names = new Set(invoices.map((i) => i.vendorName).filter(Boolean));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [invoices]);

  // Filter invoices by selected vendor (or show all)
  const filteredInvoices = useMemo(() => {
    if (!selectedVendor) return invoices;
    return invoices.filter((i) => i.vendorName === selectedVendor);
  }, [invoices, selectedVendor]);

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
        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-600 mb-1.5" htmlFor="vendor-filter">
              Filter by Vendor
            </label>
            <select
              id="vendor-filter"
              value={selectedVendor}
              onChange={(e) => { setSelectedVendor(e.target.value); setExpandedId(null); }}
              className="w-full max-w-xs px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              aria-label="Filter invoices by vendor"
            >
              <option value="">All Vendors</option>
              {vendorNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          {!loading && (
            <p className="text-sm text-gray-500 sm:pt-6">
              {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}
              {selectedVendor && <> for <strong className="text-gray-900">{selectedVendor}</strong></>}
            </p>
          )}
        </div>

        {loading ? (
          <LoadingSkeleton variant="card" count={3} />
        ) : filteredInvoices.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm text-center py-12 px-6">
            <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {selectedVendor ? `No invoices for ${selectedVendor}` : 'No invoices yet'}
            </h3>
            <p className="text-gray-500 mb-4">
              {selectedVendor ? 'No invoices have been submitted for this vendor' : 'No invoices have been submitted yet'}
            </p>
            <Link href="/vendor/submit" className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors min-h-[44px]">
              Submit Invoice
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredInvoices.map((invoice) => {
              const photoUrls = invoice.workPhotos ? invoice.workPhotos.split(',').filter(Boolean) : [];
              const photoCount = photoUrls.length;
              const isExpanded = expandedId === invoice.id;
              const invoiceIsImage = isImageUrl(invoice.invoiceFileUrl, invoice.invoiceFileName);
              const invoicePreview = !invoiceIsImage ? getPreviewUrl(invoice.invoiceFileUrl) : null;
              const measurementIsImage = isImageUrl(invoice.measurementSheetUrl, invoice.measurementSheetName);
              const measurementPreview = !measurementIsImage ? getPreviewUrl(invoice.measurementSheetUrl) : null;

              return (
                <div key={invoice.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Clickable summary row */}
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">{invoice.invoiceNumber}</span>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-sm text-gray-600 font-medium">{invoice.vendorName}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {invoice.invoiceType && <TypeBadge type={invoice.invoiceType} />}
                        <StatusBadge status={invoice.status} />
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{invoice.purpose}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                      <span className="font-semibold text-gray-900 text-base">
                        {formatCurrency(invoice.amount)}
                      </span>
                      {invoice.approvedAmount && parseFloat(invoice.approvedAmount) !== parseFloat(invoice.amount) && (
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                          Approved: {formatCurrency(invoice.approvedAmount)}
                        </span>
                      )}
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
                        <span className="inline-flex items-center gap-1 text-blue-600">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                          </svg>
                          Invoice file
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ===== Expanded Detail Section ===== */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0">
                      <div className="border-t border-gray-100 pt-4">

                        {/* Remarks */}
                        {invoice.remarks && (
                          <div className="mb-4">
                            <p className="text-xs font-medium text-gray-500 mb-1">Remarks</p>
                            <p className="text-sm text-gray-700">{invoice.remarks}</p>
                          </div>
                        )}

                        {/* Invoice Document */}
                        {invoice.invoiceFileUrl && (
                          <div className="mb-4 rounded-lg p-4 bg-blue-50/50 border border-blue-100">
                            <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                              </svg>
                              Invoice — {invoice.invoiceFileName || 'Uploaded file'}
                            </p>
                            {invoiceIsImage && (
                              <img src={invoice.invoiceFileUrl} alt={`Invoice ${invoice.invoiceNumber}`}
                                className="w-full max-h-[500px] object-contain rounded-lg cursor-pointer hover:opacity-90 transition-opacity bg-white border border-gray-200"
                                onClick={() => setLightboxUrl(invoice.invoiceFileUrl)} />
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
                          <div className="mb-4">
                            <p className="text-xs font-medium text-gray-500 mb-2">
                              Measurement Sheet — {invoice.measurementSheetName || 'Uploaded file'}
                            </p>
                            {measurementIsImage && (
                              <img src={invoice.measurementSheetUrl} alt="Measurement sheet"
                                className="w-full max-h-[400px] object-contain rounded-lg cursor-pointer hover:opacity-90 transition-opacity bg-white border border-gray-200"
                                onClick={() => setLightboxUrl(invoice.measurementSheetUrl)} />
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

                        {/* Approval info */}
                        {invoice.approvedBy && (
                          <div className="mb-4 rounded-lg p-3 bg-gray-50 border border-gray-100">
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
                              <p className="text-sm text-gray-600 mt-1 italic">
                                &ldquo;{invoice.approvalComments}&rdquo;
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Resubmit button for rejected invoices */}
                  {invoice.status === 'rejected' && (
                    <div className="px-4 pb-4 pt-0 border-t border-gray-100 mt-0">
                      <div className="pt-3">
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Lightbox for full-size image ── */}
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
