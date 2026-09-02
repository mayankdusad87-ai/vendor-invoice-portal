'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SubmitInvoice() {
  const router = useRouter();
  const [vendorName, setVendorName] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    invoiceDate: '',
    invoiceNumber: '',
    purpose: '',
    amount: '',
    remarks: '',
  });
  const [file, setFile] = useState<File | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let fileUrl = '';
      let fileName = '';

      // Upload file if provided
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (uploadRes.ok) {
          fileUrl = uploadData.url || '';
          fileName = uploadData.fileName || file.name;
        }
      }

      // Submit invoice
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          fileUrl,
          fileName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to submit invoice');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setForm({ invoiceDate: '', invoiceNumber: '', purpose: '', amount: '', remarks: '' });
      setFile(null);
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setLoading(false);
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
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Vendor Portal</h1>
            <p className="text-xs text-gray-500">Welcome, {vendorName}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/vendor/invoices"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              My Invoices
            </Link>
            <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-600">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 mt-6">
        {success ? (
          <div className="card text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Invoice Submitted!</h2>
            <p className="text-gray-500 mb-6">Your invoice has been submitted successfully and is under review.</p>
            <div className="flex gap-3 justify-center">
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
            <p className="text-sm text-gray-500 mb-6">Fill in the invoice details below</p>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                  placeholder="Describe the work or purpose of this invoice"
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

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Upload Invoice (PDF/Image)
                </label>
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-gray-500">
                      {file ? file.name : 'Click to upload PDF, JPEG, or PNG (max 10MB)'}
                    </p>
                  </label>
                  {file && (
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="text-xs text-red-500 mt-2 hover:underline"
                    >
                      Remove file
                    </button>
                  )}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">
                  {error}
                </div>
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
