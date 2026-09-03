'use client';

import { useState, useEffect } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface Vendor {
  id: string;
  name: string;
  pin: string;
  phone: string;
  email: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export default function AdminVendors() {
  const { token, isReady } = useAdminAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    if (!token) return;
    fetchVendors();
  }, [token]);

  const fetchVendors = async () => {
    try {
      const res = await fetch('/api/vendors', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setVendors(data.vendors || []);
      }
    } catch {
      console.error('Failed to fetch vendors');
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Frontend validation
    const trimmedName = form.name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setError('Vendor name must be at least 2 characters');
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Please enter a valid email address');
      return;
    }
    if (form.phone && !/^[\d\s+\-()]{5,20}$/.test(form.phone)) {
      setError('Please enter a valid phone number (5-20 digits)');
      return;
    }

    // Update form with trimmed values
    const submittingForm = { ...form, name: trimmedName };

    setSaving(true);

    try {
      if (editingVendor) {
        // Update vendor
        const res = await fetch('/api/vendors', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id: editingVendor.id, ...submittingForm }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to update vendor');
          setSaving(false);
          return;
        }
        setSuccessMsg('Vendor updated successfully');
      } else {
        // Add new vendor
        const res = await fetch('/api/vendors', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(submittingForm),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to add vendor');
          setSaving(false);
          return;
        }
        setSuccessMsg('Vendor added successfully');
      }

      // Reset and refresh
      setForm({ name: '', phone: '', email: '' });
      setShowForm(false);
      setEditingVendor(null);
      await fetchVendors();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setError('Something went wrong');
    }
    setSaving(false);
  };

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setForm({
      name: vendor.name,
      phone: vendor.phone,
      email: vendor.email,
    });
    setShowForm(true);
    setError('');
  };

  const handleDeactivate = async (vendor: Vendor) => {
    const newStatus = vendor.status === 'active' ? 'inactive' : 'active';
    if (newStatus === 'inactive') {
      const confirmed = window.confirm(
        `Are you sure you want to deactivate "${vendor.name}"?\n\nThis vendor will no longer be able to submit invoices.`
      );
      if (!confirmed) return;
    }
    try {
      await fetch('/api/vendors', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: vendor.id, status: newStatus }),
      });
      await fetchVendors();
    } catch {
      console.error('Failed to update vendor status');
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingVendor(null);
    setForm({ name: '', phone: '', email: '' });
    setError('');
  };

  if (!isReady) return null;

  const activeVendors = vendors.filter((v) => v.status === 'active');
  const inactiveVendors = vendors.filter((v) => v.status === 'inactive');

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <AdminHeader />

      <main className="max-w-4xl mx-auto p-4 mt-4 fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Vendor Management</h2>
            <p className="text-sm text-[var(--text-muted)]">{activeVendors.length} active vendors</p>
          </div>
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setEditingVendor(null); setError(''); }}
              className="btn-primary flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Vendor
            </button>
          )}
        </div>

        {/* Success Message */}
        {successMsg && (
          <div className="alert alert-success mb-4">{successMsg}</div>
        )}

        {/* Add/Edit Form */}
        {showForm && (
          <div className="card mb-4">
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">
              {editingVendor ? 'Edit Vendor' : 'Add New Vendor'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Vendor Name *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input-field"
                    placeholder="Enter vendor name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="input-field"
                    placeholder="Phone number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input-field"
                    placeholder="Email address"
                  />
                </div>
              </div>

              {error && (
                <div className="alert alert-error">{error}</div>
              )}

              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingVendor ? 'Update Vendor' : 'Add Vendor'}
                </button>
                <button type="button" onClick={cancelForm} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Vendor List */}
        {loading ? (
          <LoadingSkeleton variant="list" count={3} />
        ) : vendors.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-[var(--text-muted)] mb-4">No vendors registered yet</p>
            <button onClick={() => setShowForm(true)} className="btn-primary">
              Add First Vendor
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Active Vendors */}
            {activeVendors.map((vendor) => (
              <div key={vendor.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--text-primary)]">{vendor.name}</span>
                      <span className="badge badge-active">Active</span>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-[var(--text-muted)]">
                      {vendor.phone && (
                        <span className="inline-flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                          </svg>
                          {vendor.phone}
                        </span>
                      )}
                      {vendor.email && (
                        <span className="inline-flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                          {vendor.email}
                        </span>
                      )}
                      <span>Added: {new Date(vendor.createdAt).toLocaleDateString('en-IN')}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(vendor)}
                      className="text-sm font-medium min-h-[44px] px-2"
                      style={{ color: 'var(--primary)' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeactivate(vendor)}
                      className="text-sm font-medium min-h-[44px] px-2"
                      style={{ color: 'var(--danger)' }}
                    >
                      Deactivate
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Inactive Vendors */}
            {inactiveVendors.length > 0 && (
              <>
                <h3 className="text-sm font-medium text-[var(--text-muted)] mt-6 mb-2">Inactive Vendors</h3>
                {inactiveVendors.map((vendor) => (
                  <div key={vendor.id} className="card" style={{ opacity: 0.6 }}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)]">{vendor.name}</span>
                        <span className="badge badge-inactive">Inactive</span>
                      </div>
                      <button
                        onClick={() => handleDeactivate(vendor)}
                        className="text-sm font-medium min-h-[44px] px-2"
                        style={{ color: 'var(--success)' }}
                      >
                        Reactivate
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
