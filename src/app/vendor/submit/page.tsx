'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useVendorAuth } from '@/hooks/useVendorAuth';

export default function SubmitInvoicePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen" style={{ background: 'var(--background)' }}>
        <div className="max-w-2xl mx-auto p-4 mt-8">
          <LoadingSkeleton variant="form" count={1} />
        </div>
      </div>
    }>
      <SubmitInvoice />
    </Suspense>
  );
}

function SubmitInvoice() {
  const searchParams = useSearchParams();
  const resubmitId = searchParams.get('resubmit');
  const { vendorName: loggedInName, isReady: authReady, logout } = useVendorAuth();

  // Vendors list for selection (billing engineer can submit for any vendor)
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [isResubmit, setIsResubmit] = useState(false);
  const [rejectionInfo, setRejectionInfo] = useState<{ by: string; comments: string } | null>(null);

  const [form, setForm] = useState({
    invoiceDate: '',
    invoiceNumber: '',
    purpose: '',
    amount: '',
    remarks: '',
  });

  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [workPhotos, setWorkPhotos] = useState<File[]>([]);
  const [measurementSheet, setMeasurementSheet] = useState<File | null>(null);

  // Keep existing file URLs when resubmitting (user may not re-upload)
  const [existingFiles, setExistingFiles] = useState({
    invoiceFileUrl: '',
    invoiceFileName: '',
    workPhotos: '',
    measurementSheetUrl: '',
    measurementSheetName: '',
  });

  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authReady) return;

    // Load vendor list for dropdown
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

    // If resubmitting, load existing invoice data
    if (resubmitId && selectedVendor) {
      loadInvoiceForResubmit(resubmitId, selectedVendor);
    }
  }, [authReady, resubmitId, selectedVendor]);

  const loadInvoiceForResubmit = async (invoiceId: string, vName: string) => {
    try {
      const res = await fetch(`/api/invoices?vendorName=${encodeURIComponent(vName)}`);
      const data = await res.json();
      const invoice = (data.invoices || []).find((inv: { id: string }) => inv.id === invoiceId);

      if (invoice && invoice.status === 'rejected') {
        setIsResubmit(true);
        setForm({
          invoiceDate: invoice.invoiceDate,
          invoiceNumber: invoice.invoiceNumber,
          purpose: invoice.purpose,
          amount: invoice.amount,
          remarks: invoice.remarks,
        });
        setExistingFiles({
          invoiceFileUrl: invoice.invoiceFileUrl || '',
          invoiceFileName: invoice.invoiceFileName || '',
          workPhotos: invoice.workPhotos || '',
          measurementSheetUrl: invoice.measurementSheetUrl || '',
          measurementSheetName: invoice.measurementSheetName || '',
        });
        if (invoice.approvedBy) {
          setRejectionInfo({
            by: invoice.approvedBy,
            comments: invoice.approvalComments || '',
          });
        }
      }
    } catch {
      console.error('Failed to load invoice for resubmit');
    }
  };

  const uploadFiles = async (files: File[]): Promise<{ url: string; fileName: string }[]> => {
    if (files.length === 0) return [];

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data.files || [];
  };

  const ALLOWED_FILE_TYPES = [
    'application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/heic', 'image/heif',
  ];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return `"${file.name}" — only PDF, JPEG, PNG, WebP, HEIC allowed`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `"${file.name}" is too large (max 10MB per file)`;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // ── Validate all fields ──
    if (!selectedVendor) {
      setError('Please select a vendor name');
      return;
    }

    const trimmedNumber = form.invoiceNumber.trim();
    const trimmedPurpose = form.purpose.trim();

    if (!form.invoiceDate) {
      setError('Invoice date is required');
      return;
    }
    if (!trimmedNumber || trimmedNumber.length < 2) {
      setError('Invoice number must be at least 2 characters');
      return;
    }
    if (!trimmedPurpose || trimmedPurpose.length < 5) {
      setError('Purpose/description must be at least 5 characters');
      return;
    }

    const numAmount = parseFloat(form.amount);
    if (!form.amount || isNaN(numAmount) || numAmount <= 0) {
      setError('Amount must be greater than ₹0');
      return;
    }
    if (numAmount > 999999999) {
      setError('Amount seems too large. Please verify.');
      return;
    }

    // Work photos: require at least 1 (new or existing)
    const hasExistingPhotos = isResubmit && existingPhotoCount > 0;
    if (workPhotos.length === 0 && !hasExistingPhotos) {
      setError('At least one work photo is required as evidence');
      return;
    }

    // Validate file types before uploading
    for (const photo of workPhotos) {
      const photoErr = validateFile(photo);
      if (photoErr) { setError(photoErr); return; }
    }
    if (invoiceFile) {
      const invoiceErr = validateFile(invoiceFile);
      if (invoiceErr) { setError(invoiceErr); return; }
    }
    if (measurementSheet) {
      const msErr = validateFile(measurementSheet);
      if (msErr) { setError(msErr); return; }
    }

    setLoading(true);

    try {
      // Upload invoice file (or keep existing)
      let invoiceFileUrl = existingFiles.invoiceFileUrl;
      let invoiceFileName = existingFiles.invoiceFileName;
      if (invoiceFile) {
        setUploadProgress('Uploading invoice file...');
        const results = await uploadFiles([invoiceFile]);
        if (results[0]) {
          invoiceFileUrl = results[0].url;
          invoiceFileName = results[0].fileName;
        }
      }

      // Upload work photos (or keep existing)
      let workPhotosUrls = existingFiles.workPhotos;
      if (workPhotos.length > 0) {
        setUploadProgress(`Uploading ${workPhotos.length} work photo(s)...`);
        const results = await uploadFiles(workPhotos);
        const newUrls = results.map((r) => r.url).filter(Boolean).join(',');
        // Append new photos to existing ones
        workPhotosUrls = workPhotosUrls
          ? `${workPhotosUrls},${newUrls}`
          : newUrls;
      }

      // Upload measurement sheet (or keep existing)
      let measurementSheetUrl = existingFiles.measurementSheetUrl;
      let measurementSheetName = existingFiles.measurementSheetName;
      if (measurementSheet) {
        setUploadProgress('Uploading measurement sheet...');
        const results = await uploadFiles([measurementSheet]);
        if (results[0]) {
          measurementSheetUrl = results[0].url;
          measurementSheetName = results[0].fileName;
        }
      }

      if (isResubmit && resubmitId) {
        // Resubmit: PATCH existing invoice
        setUploadProgress('Resubmitting invoice...');
        const res = await fetch('/api/invoices', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: resubmitId,
            vendorName: selectedVendor,
            ...form,
            invoiceFileUrl,
            invoiceFileName,
            workPhotos: workPhotosUrls,
            measurementSheetUrl,
            measurementSheetName,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Failed to resubmit invoice');
          setLoading(false);
          setUploadProgress('');
          return;
        }
      } else {
        // New submission: POST
        setUploadProgress('Submitting invoice...');
        const res = await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendorName: selectedVendor,
            ...form,
            invoiceFileUrl,
            invoiceFileName,
            workPhotos: workPhotosUrls,
            measurementSheetUrl,
            measurementSheetName,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Failed to submit invoice');
          setLoading(false);
          setUploadProgress('');
          return;
        }
      }

      setSuccess(true);
      setForm({ invoiceDate: '', invoiceNumber: '', purpose: '', amount: '', remarks: '' });
      setInvoiceFile(null);
      setWorkPhotos([]);
      setMeasurementSheet(null);
      setExistingFiles({ invoiceFileUrl: '', invoiceFileName: '', workPhotos: '', measurementSheetUrl: '', measurementSheetName: '' });
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setLoading(false);
    setUploadProgress('');
  };

  const handleCameraCapture = () => {
    cameraInputRef.current?.click();
  };

  const handleCameraPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setWorkPhotos((prev) => [...prev, ...Array.from(files)]);
    }
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const removeWorkPhoto = (index: number) => {
    setWorkPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const existingPhotoCount = existingFiles.workPhotos
    ? existingFiles.workPhotos.split(',').filter(Boolean).length
    : 0;

  if (!authReady) return null;

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header className="app-header">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">Billing Engineer Portal</h1>
            {loggedInName && <p className="text-xs text-[var(--text-muted)]">Welcome, {loggedInName}</p>}
          </div>
          <div className="flex items-center gap-3">
            <Link href="/vendor/invoices" className="text-sm text-[var(--primary)] hover:underline font-medium min-h-[44px] flex items-center">
              My Invoices
            </Link>
            <button onClick={logout} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] min-h-[44px] flex items-center">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 mt-4 fade-in">
        {success ? (
          <div className="card text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ background: 'var(--success-light)' }}>
              <svg className="w-8 h-8" style={{ color: 'var(--success)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
              {isResubmit ? 'Invoice Resubmitted!' : 'Invoice Submitted!'}
            </h2>
            <p className="text-[var(--text-muted)] mb-6">
              {isResubmit
                ? 'Your corrected invoice has been resubmitted for approval.'
                : 'Your invoice with evidence has been submitted for approval.'}
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link href="/vendor/submit" className="btn-primary">
                Submit Another
              </Link>
              <Link href="/vendor/invoices" className="btn-secondary">
                View My Invoices
              </Link>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="flex items-center gap-3 mb-1">
              {isResubmit && (
                <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--warning-light)' }}>
                  <svg className="w-4 h-4" style={{ color: 'var(--warning)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
              )}
              <h2 className="text-xl font-bold text-[var(--text-primary)]">
                {isResubmit ? 'Resubmit Invoice' : 'Submit Invoice'}
              </h2>
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              {isResubmit
                ? 'Update the details and resubmit for approval'
                : 'Select your name, fill in details, and upload evidence'}
            </p>

            {/* Rejection reason banner */}
            {isResubmit && rejectionInfo && (
              <div className="alert alert-error mb-5">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="font-semibold mb-1">
                    Rejection Reason (by {rejectionInfo.by}):
                  </p>
                  <p className="italic">
                    &ldquo;{rejectionInfo.comments || 'No comments provided'}&rdquo;
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Vendor Selection */}
              <div className="rounded-lg p-4" style={{ background: 'var(--info-light)', border: '1px solid var(--info-border)' }}>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--info)' }}>
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                    Select Vendor *
                  </span>
                </label>
                <select
                  value={selectedVendor}
                  onChange={(e) => setSelectedVendor(e.target.value)}
                  className="input-field text-base"
                  required
                  disabled={isResubmit}
                  aria-label="Select vendor name"
                >
                  <option value="">-- Select vendor --</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.name}>{v.name}</option>
                  ))}
                </select>
                {isResubmit && (
                  <p className="text-xs mt-1" style={{ color: 'var(--info)' }}>Vendor cannot be changed during resubmission</p>
                )}
                {!isResubmit && vendors.length === 0 && (
                  <p className="text-xs mt-1" style={{ color: 'var(--info)' }}>No vendors registered yet. Ask admin to add vendors.</p>
                )}
              </div>

              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Invoice Date *
                  </label>
                  <input
                    type="date"
                    value={form.invoiceDate}
                    onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Invoice Number *
                  </label>
                  <input
                    type="text"
                    value={form.invoiceNumber}
                    onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                    className="input-field"
                    placeholder="e.g., INV-001"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Purpose / Work Description *
                </label>
                <textarea
                  value={form.purpose}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  className="input-field"
                  rows={3}
                  placeholder="Describe the work done on site"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="input-field"
                  placeholder="0.00"
                  min="1"
                  step="0.01"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Remarks
                </label>
                <textarea
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  className="input-field"
                  rows={2}
                  placeholder="Any additional notes (optional)"
                />
              </div>

              {/* Divider */}
              <div className="divider" />
              <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                </svg>
                Attachments &amp; Evidence
              </h3>

              {/* Work Photos - Camera + Upload */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Work Photos / Evidence *
                </label>

                {/* Show existing photos count during resubmit */}
                {isResubmit && existingPhotoCount > 0 && (
                  <div className="alert alert-success mb-2 text-xs">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {existingPhotoCount} existing photo(s) will be kept. Add new ones below if needed.
                  </div>
                )}

                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={handleCameraCapture}
                    className="btn-primary text-sm"
                    aria-label="Take a photo with camera"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Take Photo
                  </button>
                  <label className="btn-secondary text-sm cursor-pointer" aria-label="Upload photos from device">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Upload Photos
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                          setWorkPhotos((prev) => [...prev, ...Array.from(e.target.files!)]);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Camera input (hidden, opens camera on mobile) */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCameraPhoto}
                  className="hidden"
                />

                {/* Photo previews */}
                {workPhotos.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
                    {workPhotos.map((photo, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={URL.createObjectURL(photo)}
                          alt={`Work photo ${index + 1}`}
                          className="w-full h-20 object-cover rounded-lg"
                          style={{ border: '1px solid var(--border)' }}
                        />
                        <button
                          type="button"
                          onClick={() => removeWorkPhoto(index)}
                          className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: 'var(--danger)', color: 'white' }}
                          aria-label={`Remove photo ${index + 1}`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        <p className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">{photo.name}</p>
                      </div>
                    ))}
                  </div>
                )}
                {workPhotos.length === 0 && !isResubmit && (
                  <p className="text-xs text-[var(--text-muted)]">Take or upload photos of the completed work</p>
                )}
              </div>

              {/* Measurement Sheet */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Measurement Sheet
                </label>
                {isResubmit && existingFiles.measurementSheetName && !measurementSheet && (
                  <div className="alert alert-success text-xs mb-1">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Existing: {existingFiles.measurementSheetName} (upload new to replace)
                  </div>
                )}
                <div className="rounded-lg p-3 text-center" style={{ border: '2px dashed var(--border)' }}>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) => setMeasurementSheet(e.target.files?.[0] || null)}
                    className="hidden"
                    id="measurement-upload"
                  />
                  <label htmlFor="measurement-upload" className="cursor-pointer">
                    <svg className="w-6 h-6 mx-auto mb-1 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm text-[var(--text-muted)]">
                      {measurementSheet ? measurementSheet.name : 'Upload measurement sheet (PDF or image)'}
                    </p>
                  </label>
                  {measurementSheet && (
                    <button type="button" onClick={() => setMeasurementSheet(null)} className="text-xs mt-1 hover:underline" style={{ color: 'var(--danger)' }}>
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Invoice File */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Invoice Document
                </label>
                {isResubmit && existingFiles.invoiceFileName && !invoiceFile && (
                  <div className="alert alert-success text-xs mb-1">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Existing: {existingFiles.invoiceFileName} (upload new to replace)
                  </div>
                )}
                <div className="rounded-lg p-3 text-center" style={{ border: '2px dashed var(--border)' }}>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="invoice-upload"
                  />
                  <label htmlFor="invoice-upload" className="cursor-pointer">
                    <svg className="w-6 h-6 mx-auto mb-1 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-[var(--text-muted)]">
                      {invoiceFile ? invoiceFile.name : 'Upload invoice PDF or image'}
                    </p>
                  </label>
                  {invoiceFile && (
                    <button type="button" onClick={() => setInvoiceFile(null)} className="text-xs mt-1 hover:underline" style={{ color: 'var(--danger)' }}>
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Error & Progress */}
              {error && (
                <div className="alert alert-error">{error}</div>
              )}
              {uploadProgress && (
                <div className="alert alert-info">
                  <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {uploadProgress}
                </div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={loading || !selectedVendor}>
                {loading
                  ? (isResubmit ? 'Resubmitting...' : 'Submitting...')
                  : (isResubmit ? 'Resubmit Invoice' : 'Submit Invoice')}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
