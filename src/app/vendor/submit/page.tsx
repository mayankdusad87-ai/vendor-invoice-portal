'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SubmitInvoice() {
  const router = useRouter();
  const [vendorName, setVendorName] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');

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

  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = localStorage.getItem('vendorToken');
    const name = localStorage.getItem('vendorName');
    if (!t || !name) {
      router.push('/vendor/login');
      return;
    }
    setToken(t);
    setVendorName(name);
  }, [router]);

  const uploadFiles = async (files: File[]): Promise<{ url: string; fileName: string }[]> => {
    if (files.length === 0) return [];

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data.files || [];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Upload invoice file
      let invoiceFileUrl = '';
      let invoiceFileName = '';
      if (invoiceFile) {
        setUploadProgress('Uploading invoice file...');
        const results = await uploadFiles([invoiceFile]);
        if (results[0]) {
          invoiceFileUrl = results[0].url;
          invoiceFileName = results[0].fileName;
        }
      }

      // Upload work photos
      let workPhotosUrls = '';
      if (workPhotos.length > 0) {
        setUploadProgress(`Uploading ${workPhotos.length} work photo(s)...`);
        const results = await uploadFiles(workPhotos);
        workPhotosUrls = results.map((r) => r.url).filter(Boolean).join(',');
      }

      // Upload measurement sheet
      let measurementSheetUrl = '';
      let measurementSheetName = '';
      if (measurementSheet) {
        setUploadProgress('Uploading measurement sheet...');
        const results = await uploadFiles([measurementSheet]);
        if (results[0]) {
          measurementSheetUrl = results[0].url;
          measurementSheetName = results[0].fileName;
        }
      }

      // Submit invoice
      setUploadProgress('Submitting invoice...');
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
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

      setSuccess(true);
      setForm({ invoiceDate: '', invoiceNumber: '', purpose: '', amount: '', remarks: '' });
      setInvoiceFile(null);
      setWorkPhotos([]);
      setMeasurementSheet(null);
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
    // Reset the input so the same file can be selected again
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const removeWorkPhoto = (index: number) => {
    setWorkPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLogout = () => {
    localStorage.removeItem('vendorToken');
    localStorage.removeItem('vendorName');
    router.push('/');
  };

  if (!token) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Site Engineer Portal</h1>
            <p className="text-xs text-gray-500">Welcome, {vendorName}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/vendor/invoices" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              My Invoices
            </Link>
            <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-600">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 mt-4">
        {success ? (
          <div className="card text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Invoice Submitted!</h2>
            <p className="text-gray-500 mb-6">Your invoice with evidence has been submitted for approval.</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <button onClick={() => setSuccess(false)} className="btn-primary">
                Submit Another
              </button>
              <Link href="/vendor/invoices" className="btn-primary" style={{ background: '#6b7280' }}>
                View My Invoices
              </Link>
            </div>
          </div>
        ) : (
          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Submit Invoice</h2>
            <p className="text-sm text-gray-500 mb-6">Fill in details and upload evidence</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="input-field"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
                  📎 Attachments & Evidence
                </h3>
              </div>

              {/* Work Photos - Camera + Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Work Photos / Evidence *
                </label>
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={handleCameraCapture}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Take Photo
                  </button>
                  <label className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
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
                          className="w-full h-20 object-cover rounded-lg border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => removeWorkPhoto(index)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ✕
                        </button>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">{photo.name}</p>
                      </div>
                    ))}
                  </div>
                )}
                {workPhotos.length === 0 && (
                  <p className="text-xs text-gray-400">Take or upload photos of the completed work</p>
                )}
              </div>

              {/* Measurement Sheet */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Measurement Sheet
                </label>
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3 text-center">
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) => setMeasurementSheet(e.target.files?.[0] || null)}
                    className="hidden"
                    id="measurement-upload"
                  />
                  <label htmlFor="measurement-upload" className="cursor-pointer">
                    <svg className="w-6 h-6 text-gray-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm text-gray-500">
                      {measurementSheet ? measurementSheet.name : 'Upload measurement sheet (PDF or image)'}
                    </p>
                  </label>
                  {measurementSheet && (
                    <button type="button" onClick={() => setMeasurementSheet(null)} className="text-xs text-red-500 mt-1 hover:underline">
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Invoice File */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Invoice Document
                </label>
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3 text-center">
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="invoice-upload"
                  />
                  <label htmlFor="invoice-upload" className="cursor-pointer">
                    <svg className="w-6 h-6 text-gray-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-gray-500">
                      {invoiceFile ? invoiceFile.name : 'Upload invoice PDF or image'}
                    </p>
                  </label>
                  {invoiceFile && (
                    <button type="button" onClick={() => setInvoiceFile(null)} className="text-xs text-red-500 mt-1 hover:underline">
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Error & Progress */}
              {error && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>
              )}
              {uploadProgress && (
                <div className="bg-blue-50 text-blue-600 text-sm p-3 rounded-lg">{uploadProgress}</div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? 'Submitting...' : 'Submit Invoice'}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
