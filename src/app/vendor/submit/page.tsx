'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useEngineerAuth } from '@/hooks/useEngineerAuth';

export default function SubmitInvoicePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50">
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
  const { engineerName: loggedInName, isReady: authReady, logout } = useEngineerAuth();

  // Vendors list for selection (billing engineer can submit for any vendor)
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [selectedVendor, setSelectedVendor] = useState('');

  // Projects the engineer has access to
  const [engineerProjects, setEngineerProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [allActiveProjects, setAllActiveProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [isResubmit, setIsResubmit] = useState(false);
  const [rejectionInfo, setRejectionInfo] = useState<{ by: string; comments: string } | null>(null);

  const [form, setForm] = useState({
    invoiceDate: '',
    invoiceNumber: '',
    invoiceType: '',
    purpose: '',
    amount: '',
    gstAmount: '',
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
  const errorRef = useRef<HTMLDivElement>(null);

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

    // Load engineer's project access and all active projects
    const fetchProjectData = async () => {
      try {
        const [meRes, projRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/projects'),
        ]);
        const meData = await meRes.json();
        const projData = await projRes.json();

        const myProjects: string[] = meData.projects || [];
        setEngineerProjects(myProjects);

        const active = (projData.projects || []).filter((p: { status: string }) => p.status === 'active');
        setAllActiveProjects(active);

        // If engineer has project assignments, filter active projects to only theirs
        // If no assignments, they can select any active project
      } catch {
        console.error('Failed to load project data');
      }
    };
    fetchProjectData();

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
          invoiceType: invoice.invoiceType || '',
          purpose: invoice.purpose,
          amount: invoice.amount,
          gstAmount: invoice.gstAmount || '',
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

  /** Upload general files (invoice docs, measurement sheets) to R2 via /api/upload */
  const uploadFiles = async (files: File[]): Promise<{ url: string; fileName: string }[]> => {
    if (files.length === 0) return [];

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    // Cookie is sent automatically — no Authorization header needed
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data.files || [];
  };

  /** Upload work photos to R2 with versioned storage via /api/photos/upload */
  const uploadWorkPhotosToR2 = async (invoiceId: string, photos: File[]): Promise<void> => {
    if (photos.length === 0) return;

    const formData = new FormData();
    formData.append('invoiceId', invoiceId);
    photos.forEach((photo) => formData.append('photos', photo));

    const res = await fetch('/api/photos/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Photo upload failed');
  };

  const ALLOWED_FILE_TYPES = [
    'application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/heic', 'image/heif',
  ];
  const ALLOWED_PHOTO_TYPES = [
    'image/jpeg', 'image/png', 'image/jpg', 'image/heic', 'image/heif',
  ];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB for docs
  const MAX_PHOTO_SIZE = 5 * 1024 * 1024;  // 5MB for photos
  const MAX_PHOTOS = 5;

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return `"${file.name}" — only PDF, JPEG, PNG, WebP, HEIC allowed`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `"${file.name}" is too large (max 10MB per file)`;
    }
    return null;
  };

  const validatePhoto = (file: File): string | null => {
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      return `"${file.name}" — only JPG, PNG, HEIC photos allowed`;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      return `"${file.name}" is too large (max 5MB per photo)`;
    }
    return null;
  };

  /** Set error message and scroll it into view */
  const showError = (msg: string) => {
    setError(msg);
    // Scroll after React re-renders the error banner
    setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // ── Validate all fields ──
    if (!selectedVendor) {
      showError('Please select a vendor name');
      return;
    }

    // Project is required if there are active projects
    if (availableProjects.length > 0 && !selectedProject) {
      showError('Please select a project');
      return;
    }

    const trimmedNumber = form.invoiceNumber.trim();
    const trimmedPurpose = form.purpose.trim();

    if (!form.invoiceDate) {
      showError('Invoice date is required');
      return;
    }

    // Validate date range — not before 2020, not more than 30 days in future
    const invoiceDateObj = new Date(form.invoiceDate);
    const today = new Date();
    const minDate = new Date('2020-01-01');
    const maxDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (isNaN(invoiceDateObj.getTime())) {
      showError('Invalid invoice date');
      return;
    }
    if (invoiceDateObj < minDate) {
      showError('Invoice date cannot be before 01/01/2020');
      return;
    }
    if (invoiceDateObj > maxDate) {
      showError('Invoice date cannot be more than 30 days in the future');
      return;
    }

    if (!trimmedNumber || trimmedNumber.length < 2) {
      showError('Invoice number must be at least 2 characters');
      return;
    }
    if (!form.invoiceType) {
      showError('Please select an invoice type');
      return;
    }
    if (!trimmedPurpose || trimmedPurpose.length < 5) {
      showError('Purpose/description must be at least 5 characters');
      return;
    }

    const numAmount = parseFloat(form.amount);
    if (!form.amount || isNaN(numAmount) || numAmount <= 0) {
      showError('Amount must be greater than ₹0');
      return;
    }
    if (numAmount > 999999999) {
      showError('Amount seems too large (max ₹99,99,99,999). Please verify.');
      return;
    }
    // Block scientific notation like 1e5
    if (/[eE]/.test(form.amount)) {
      showError('Please enter a plain number for the amount (no scientific notation)');
      return;
    }

    // GST validation — optional but must be valid if entered
    if (form.gstAmount) {
      const numGst = parseFloat(form.gstAmount);
      if (isNaN(numGst) || numGst < 0) {
        showError('GST amount cannot be negative');
        return;
      }
      if (numGst > numAmount) {
        showError('GST amount cannot exceed the invoice amount');
        return;
      }
      if (numGst > 999999999) {
        showError('GST amount seems too large. Please verify.');
        return;
      }
      if (/[eE]/.test(form.gstAmount)) {
        showError('Please enter a plain number for GST (no scientific notation)');
        return;
      }
    }

    // Work photos: require at least 1 (new or existing), max 5
    const hasExistingPhotos = isResubmit && existingPhotoCount > 0;
    if (workPhotos.length === 0 && !hasExistingPhotos) {
      showError('At least one work photo is required as evidence');
      return;
    }
    if (workPhotos.length > MAX_PHOTOS) {
      showError(`Maximum ${MAX_PHOTOS} photos per upload`);
      return;
    }

    // Validate photo types and sizes (5MB each, JPG/PNG/HEIC only)
    for (const photo of workPhotos) {
      const photoErr = validatePhoto(photo);
      if (photoErr) { showError(photoErr); return; }
    }
    // Validate other file types
    if (invoiceFile) {
      const invoiceErr = validateFile(invoiceFile);
      if (invoiceErr) { showError(invoiceErr); return; }
    }
    if (measurementSheet) {
      const msErr = validateFile(measurementSheet);
      if (msErr) { showError(msErr); return; }
    }

    setLoading(true);

    try {
      // Upload invoice file to R2 (or keep existing)
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

      // Upload measurement sheet to R2 (or keep existing)
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
        // ── Resubmit flow ──
        // 1. Upload new work photos to R2 (versioned — e.g. v2, v3)
        if (workPhotos.length > 0) {
          setUploadProgress(`Uploading ${workPhotos.length} work photo(s)...`);
          await uploadWorkPhotosToR2(resubmitId, workPhotos);
        }

        // 2. Resubmit the invoice form data (PATCH)
        setUploadProgress('Resubmitting invoice...');
        const res = await fetch('/api/invoices', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: resubmitId,
            vendorName: selectedVendor,
            project: selectedProject,
            ...form,
            invoiceFileUrl,
            invoiceFileName,
            // workPhotos updated by uploadWorkPhotosToR2 — don't overwrite
            measurementSheetUrl,
            measurementSheetName,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          showError(data.error || 'Failed to resubmit invoice');
          setLoading(false);
          setUploadProgress('');
          return;
        }
      } else {
        // ── New submission flow ──
        // 1. Create invoice first (without work photos) to get invoiceId
        setUploadProgress('Submitting invoice...');
        const res = await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendorName: selectedVendor,
            project: selectedProject,
            ...form,
            invoiceFileUrl,
            invoiceFileName,
            workPhotos: '', // photos uploaded separately after getting invoiceId
            measurementSheetUrl,
            measurementSheetName,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          showError(data.error || 'Failed to submit invoice');
          setLoading(false);
          setUploadProgress('');
          return;
        }

        // 2. Upload work photos to R2 with the new invoiceId (versioned as v1)
        if (workPhotos.length > 0 && data.invoice?.id) {
          setUploadProgress(`Uploading ${workPhotos.length} work photo(s)...`);
          await uploadWorkPhotosToR2(data.invoice.id, workPhotos);
        }
      }

      setSuccess(true);
      setForm({ invoiceDate: '', invoiceNumber: '', invoiceType: '', purpose: '', amount: '', gstAmount: '', remarks: '' });
      setSelectedProject('');
      setInvoiceFile(null);
      setWorkPhotos([]);
      setMeasurementSheet(null);
      setExistingFiles({ invoiceFileUrl: '', invoiceFileName: '', workPhotos: '', measurementSheetUrl: '', measurementSheetName: '' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      showError(message + '. Please try again.');
    }
    setLoading(false);
    setUploadProgress('');
  };

  const handleCameraCapture = () => {
    if (workPhotos.length >= MAX_PHOTOS) {
      showError(`Maximum ${MAX_PHOTOS} photos allowed`);
      return;
    }
    cameraInputRef.current?.click();
  };

  const handleCameraPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const remaining = MAX_PHOTOS - workPhotos.length;
      const toAdd = Array.from(files).slice(0, remaining);
      setWorkPhotos((prev) => [...prev, ...toAdd]);
      if (Array.from(files).length > remaining) {
        showError(`Maximum ${MAX_PHOTOS} photos allowed. Only ${remaining} added.`);
      }
    }
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const removeWorkPhoto = (index: number) => {
    setWorkPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const existingPhotoCount = existingFiles.workPhotos
    ? existingFiles.workPhotos.split(',').filter(Boolean).length
    : 0;

  // Compute available projects for the dropdown
  // If engineer has project assignments, show only those; otherwise show all active projects
  const availableProjects = engineerProjects.length > 0
    ? allActiveProjects.filter((p) => engineerProjects.includes(p.name))
    : allActiveProjects;

  if (!authReady) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header — white theme */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Billing Engineer Portal</h1>
            {loggedInName && <p className="text-xs text-gray-500">Welcome, {loggedInName}</p>}
          </div>
          <div className="flex items-center gap-3">
            <Link href="/vendor/invoices" className="text-sm text-blue-600 hover:underline font-medium min-h-[44px] flex items-center">
              View Invoices
            </Link>
            <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700 min-h-[44px] flex items-center">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 mt-4 fade-in">
        {success ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm text-center py-8 px-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {isResubmit ? 'Invoice Resubmitted!' : 'Invoice Submitted!'}
            </h2>
            <p className="text-gray-500 mb-6">
              {isResubmit
                ? 'Your corrected invoice has been resubmitted for approval.'
                : 'Your invoice with evidence has been submitted for approval.'}
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link href="/vendor/submit" className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors min-h-[44px]">
                Submit Another
              </Link>
              <Link href="/vendor/invoices" className="inline-flex items-center justify-center gap-2 bg-white text-gray-700 px-5 py-2.5 rounded-lg font-semibold text-sm border border-gray-300 hover:bg-gray-50 transition-colors min-h-[44px]">
                View Invoices
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-1">
              {isResubmit && (
                <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50">
                  <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
              )}
              <h2 className="text-xl font-bold text-gray-900">
                {isResubmit ? 'Resubmit Invoice' : 'Submit Invoice'}
              </h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {isResubmit
                ? 'Update the details and resubmit for approval'
                : 'Select vendor, fill in details, and upload evidence'}
            </p>

            {/* Rejection reason banner */}
            {isResubmit && rejectionInfo && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5 flex items-start gap-2 text-red-700 text-sm">
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
              <div className="rounded-lg p-4 bg-blue-50 border border-blue-200">
                <label className="block text-sm font-semibold mb-2 text-blue-700">
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
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
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
                  <p className="text-xs mt-1 text-blue-600">Vendor cannot be changed during resubmission</p>
                )}
                {!isResubmit && vendors.length === 0 && (
                  <p className="text-xs mt-1 text-blue-600">No vendors registered yet. Ask admin to add vendors.</p>
                )}
              </div>

              {/* Project Selection */}
              {availableProjects.length > 0 && (
                <div className="rounded-lg p-4 bg-indigo-50 border border-indigo-200">
                  <label className="block text-sm font-semibold mb-2 text-indigo-700">
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                      </svg>
                      Select Project *
                    </span>
                  </label>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
                    required
                    aria-label="Select project"
                  >
                    <option value="">-- Select project --</option>
                    {availableProjects.map((p) => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Invoice Date *
                  </label>
                  <input
                    type="date"
                    value={form.invoiceDate}
                    onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Invoice Number *
                  </label>
                  <input
                    type="text"
                    value={form.invoiceNumber}
                    onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    placeholder="e.g., INV-001"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Invoice Type *
                  </label>
                  <select
                    value={form.invoiceType}
                    onChange={(e) => setForm({ ...form, invoiceType: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    required
                  >
                    <option value="">Select type</option>
                    <option value="advance">Advance</option>
                    <option value="ra">RA (Running Account)</option>
                    <option value="final">Final</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Purpose / Work Description *
                </label>
                <textarea
                  value={form.purpose}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Describe the work done on site"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    placeholder="0.00"
                    min="1"
                    step="0.01"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    GST Amount (₹) <span className="text-xs text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={form.gstAmount}
                    onChange={(e) => setForm({ ...form, gstAmount: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Remarks
                </label>
                <textarea
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                  placeholder="Any additional notes (optional)"
                />
              </div>

              {/* Divider */}
              <div className="h-px bg-gray-200" />
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                </svg>
                Attachments &amp; Evidence
              </h3>

              {/* Work Photos - Camera + Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Work Photos / Evidence *
                </label>

                {/* Show existing photos count during resubmit */}
                {isResubmit && existingPhotoCount > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 mb-2 flex items-center gap-2 text-green-700 text-xs">
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
                    className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors min-h-[44px]"
                    aria-label="Take a photo with camera"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Take Photo
                  </button>
                  <label className="inline-flex items-center gap-2 bg-white text-gray-700 px-4 py-2 rounded-lg font-medium text-sm border border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer min-h-[44px]" aria-label="Upload photos from device">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Upload Photos
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/heic,image/heif"
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                          const remaining = MAX_PHOTOS - workPhotos.length;
                          if (remaining <= 0) {
                            setError(`Maximum ${MAX_PHOTOS} photos allowed`);
                            return;
                          }
                          const toAdd = Array.from(e.target.files).slice(0, remaining);
                          setWorkPhotos((prev) => [...prev, ...toAdd]);
                          if (Array.from(e.target.files).length > remaining) {
                            setError(`Maximum ${MAX_PHOTOS} photos. Only ${remaining} added.`);
                          }
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
                          className="w-full h-20 object-cover rounded-lg border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => removeWorkPhoto(index)}
                          className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full text-xs flex items-center justify-center bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label={`Remove photo ${index + 1}`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">{photo.name}</p>
                      </div>
                    ))}
                  </div>
                )}
                {workPhotos.length === 0 && !isResubmit && (
                  <p className="text-xs text-gray-400">Take or upload photos of the completed work (max {MAX_PHOTOS}, 5 MB each)</p>
                )}
                {workPhotos.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {workPhotos.length} of {MAX_PHOTOS} photo(s) selected
                  </p>
                )}
              </div>

              {/* Measurement Sheet */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Measurement Sheet
                </label>
                {isResubmit && existingFiles.measurementSheetName && !measurementSheet && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-2 mb-1 flex items-center gap-2 text-green-700 text-xs">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Existing: {existingFiles.measurementSheetName} (upload new to replace)
                  </div>
                )}
                <div className="rounded-lg p-3 text-center border-2 border-dashed border-gray-300 bg-white">
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) => setMeasurementSheet(e.target.files?.[0] || null)}
                    className="hidden"
                    id="measurement-upload"
                  />
                  <label htmlFor="measurement-upload" className="cursor-pointer">
                    <svg className="w-6 h-6 mx-auto mb-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm text-gray-500">
                      {measurementSheet ? measurementSheet.name : 'Upload measurement sheet (PDF or image)'}
                    </p>
                  </label>
                  {measurementSheet && (
                    <button type="button" onClick={() => setMeasurementSheet(null)} className="text-xs mt-1 text-red-500 hover:underline">
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Invoice File */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice Document
                </label>
                {isResubmit && existingFiles.invoiceFileName && !invoiceFile && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-2 mb-1 flex items-center gap-2 text-green-700 text-xs">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Existing: {existingFiles.invoiceFileName} (upload new to replace)
                  </div>
                )}
                <div className="rounded-lg p-3 text-center border-2 border-dashed border-gray-300 bg-white">
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="invoice-upload"
                  />
                  <label htmlFor="invoice-upload" className="cursor-pointer">
                    <svg className="w-6 h-6 mx-auto mb-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-gray-500">
                      {invoiceFile ? invoiceFile.name : 'Upload invoice PDF or image'}
                    </p>
                  </label>
                  {invoiceFile && (
                    <button type="button" onClick={() => setInvoiceFile(null)} className="text-xs mt-1 text-red-500 hover:underline">
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Error & Progress */}
              {error && (
                <div ref={errorRef} className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 text-red-700 text-sm" role="alert">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9 .75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  {error}
                </div>
              )}
              {uploadProgress && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2 text-blue-700 text-sm">
                  <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {uploadProgress}
                </div>
              )}

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-3 rounded-lg font-semibold text-base hover:bg-blue-700 transition-colors min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading || !selectedVendor}
              >
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
