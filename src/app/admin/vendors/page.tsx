'use client';

import { useState, useEffect } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
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
          body: JSON.stringify({ id: editingVendor.id, ...form }),
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
          body: JSON.stringify(form),
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader />

      <main className="max-w-4xl mx-auto p-4 mt-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Vendor Management</h2>
            <p className="text-sm text-gray-500">{activeVendors.length} active vendors</p>
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
          <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg mb-4">
            {successMsg}
          </div>
        )}

        {/* Add/Edit Form */}
        {showForm && (
          <div className="card mb-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {editingVendor ? 'Edit Vendor' : 'Add New Vendor'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingVendor ? 'Update Vendor' : 'Add Vendor'}
                </button>
                <button type="button" onClick={cancelForm} className="btn-primary" style={{ background: '#6b7280' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Vendor List */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading vendors...</div>
        ) : vendors.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500 mb-4">No vendors registered yet</p>
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
                      <span className="font-bold text-gray-900 dark:text-white">{vendor.name}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                      {vendor.phone && <span>📱 {vendor.phone}</span>}
                      {vendor.email && <span>✉️ {vendor.email}</span>}
                      <span>Added: {new Date(vendor.createdAt).toLocaleDateString('en-IN')}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(vendor)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeactivate(vendor)}
                      className="text-sm text-red-500 hover:text-red-700 font-medium"
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
                <h3 className="text-sm font-medium text-gray-400 mt-6 mb-2">Inactive Vendors</h3>
                {inactiveVendors.map((vendor) => (
                  <div key={vendor.id} className="card opacity-60">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 dark:text-white">{vendor.name}</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Inactive
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeactivate(vendor)}
                        className="text-sm text-green-600 hover:text-green-800 font-medium"
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
