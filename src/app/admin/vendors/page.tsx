'use client';

import { useState, useEffect } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface Vendor {
  id: string;
  name: string;
  phone: string;
  email: string;
  gstin: string;
  state: string;
  address: string;
  vendorType: string;
  category: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

interface ConfigItem {
  id: string;
  value: string;
  type: 'vendor_type' | 'vendor_category';
  status: 'active' | 'inactive';
}

const EMPTY_FORM = {
  name: '', phone: '', email: '', gstin: '', state: '', address: '', vendorType: '', category: '',
};

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh',
  'Dadra & Nagar Haveli', 'Daman & Diu', 'Lakshadweep', 'Andaman & Nicobar',
];

export default function AdminVendors() {
  const { isReady } = useAdminAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  // Vendor config (types & categories)
  const [vendorTypes, setVendorTypes] = useState<ConfigItem[]>([]);
  const [vendorCategories, setVendorCategories] = useState<ConfigItem[]>([]);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [newConfigValue, setNewConfigValue] = useState('');
  const [configTab, setConfigTab] = useState<'vendor_type' | 'vendor_category'>('vendor_type');
  const [configSaving, setConfigSaving] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    fetchVendors();
    fetchConfig();
  }, [isReady]);

  const fetchVendors = async () => {
    try {
      const res = await fetch('/api/vendors');
      const data = await res.json();
      if (res.ok) setVendors(data.vendors || []);
    } catch {
      console.error('Failed to fetch vendors');
    }
    setLoading(false);
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/vendor-config?active=true');
      const data = await res.json();
      if (res.ok) {
        setVendorTypes(data.types || []);
        setVendorCategories(data.categories || []);
      }
    } catch {
      console.error('Failed to fetch vendor config');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

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

    const submittingForm = { ...form, name: trimmedName };
    setSaving(true);

    try {
      if (editingVendor) {
        const res = await fetch('/api/vendors', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
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
        const res = await fetch('/api/vendors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

      setForm(EMPTY_FORM);
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
      gstin: vendor.gstin,
      state: vendor.state,
      address: vendor.address,
      vendorType: vendor.vendorType,
      category: vendor.category,
    });
    setShowForm(true);
    setError('');
  };

  const handleDeactivate = async (vendor: Vendor) => {
    const newStatus = vendor.status === 'active' ? 'inactive' : 'active';
    if (newStatus === 'inactive') {
      const confirmed = window.confirm(
        `Are you sure you want to deactivate "${vendor.name}"?\n\nThis vendor will no longer appear in invoice dropdowns.`
      );
      if (!confirmed) return;
    }
    try {
      await fetch('/api/vendors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
    setForm(EMPTY_FORM);
    setError('');
  };

  const addConfigItem = async () => {
    if (!newConfigValue.trim() || newConfigValue.trim().length < 2) return;
    setConfigSaving(true);
    try {
      const res = await fetch('/api/vendor-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newConfigValue.trim(), type: configTab }),
      });
      if (res.ok) {
        setNewConfigValue('');
        await fetchConfig();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to add');
        setTimeout(() => setError(''), 3000);
      }
    } catch {
      console.error('Failed to add config item');
    }
    setConfigSaving(false);
  };

  const toggleConfigStatus = async (item: ConfigItem) => {
    const newStatus = item.status === 'active' ? 'inactive' : 'active';
    try {
      await fetch('/api/vendor-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status: newStatus }),
      });
      await fetchConfig();
    } catch {
      console.error('Failed to update config item');
    }
  };

  if (!isReady) return null;

  const activeVendors = vendors.filter((v) => v.status === 'active');
  const inactiveVendors = vendors.filter((v) => v.status === 'inactive');

  // For config panel: show ALL items (active + inactive)
  const allConfigItems = configTab === 'vendor_type'
    ? vendorTypes
    : vendorCategories;

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
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfigPanel(!showConfigPanel)}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configure
            </button>
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
        </div>

        {/* Success Message */}
        {successMsg && (
          <div className="alert alert-success mb-4">{successMsg}</div>
        )}

        {/* Config Panel — Vendor Types & Categories */}
        {showConfigPanel && (
          <div className="card mb-4">
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-3">Vendor Configuration</h3>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setConfigTab('vendor_type')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  configTab === 'vendor_type'
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)]'
                }`}
              >
                Vendor Types
              </button>
              <button
                onClick={() => setConfigTab('vendor_category')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  configTab === 'vendor_category'
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)]'
                }`}
              >
                Categories
              </button>
            </div>

            {/* Add new item */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newConfigValue}
                onChange={(e) => setNewConfigValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addConfigItem()}
                className="input-field flex-1"
                placeholder={configTab === 'vendor_type' ? 'e.g. Material Vendor' : 'e.g. Electrical'}
              />
              <button
                onClick={addConfigItem}
                disabled={configSaving || newConfigValue.trim().length < 2}
                className="btn-primary text-sm whitespace-nowrap"
              >
                {configSaving ? 'Adding...' : 'Add'}
              </button>
            </div>

            {/* Existing items */}
            <div className="flex flex-wrap gap-2">
              {allConfigItems.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No {configTab === 'vendor_type' ? 'vendor types' : 'categories'} added yet
                </p>
              ) : (
                allConfigItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => toggleConfigStatus(item)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      item.status === 'active'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-gray-100 border-gray-200 text-gray-400 line-through'
                    }`}
                    title={item.status === 'active' ? 'Click to deactivate' : 'Click to reactivate'}
                  >
                    {item.value}
                    {item.status === 'active' ? ' ✓' : ' ✗'}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Add/Edit Vendor Form */}
        {showForm && (
          <div className="card mb-4">
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">
              {editingVendor ? 'Edit Vendor' : 'Add New Vendor'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
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
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="input-field"
                    placeholder="Phone number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={form.gstin}
                    onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                    className="input-field font-mono"
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={15}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">State</label>
                  <select
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="input-field"
                  >
                    <option value="">— Select —</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input-field"
                    placeholder="Email address"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="input-field"
                    placeholder="Full address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Vendor Type</label>
                  <select
                    value={form.vendorType}
                    onChange={(e) => setForm({ ...form, vendorType: e.target.value })}
                    className="input-field"
                  >
                    <option value="">— Select —</option>
                    {vendorTypes.map((t) => (
                      <option key={t.id} value={t.value}>{t.value}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="input-field"
                  >
                    <option value="">— Select —</option>
                    {vendorCategories.map((c) => (
                      <option key={c.id} value={c.value}>{c.value}</option>
                    ))}
                  </select>
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
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[var(--text-primary)]">{vendor.name}</span>
                      <span className="badge badge-active">Active</span>
                      {vendor.vendorType && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          {vendor.vendorType}
                        </span>
                      )}
                      {vendor.category && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                          {vendor.category}
                        </span>
                      )}
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
                      {vendor.gstin && (
                        <span className="font-mono">GSTIN: {vendor.gstin}</span>
                      )}
                      {vendor.state && <span>{vendor.state}</span>}
                      <span>Added: {new Date(vendor.createdAt).toLocaleDateString('en-IN')}</span>
                    </div>
                    {vendor.address && (
                      <p className="text-xs text-[var(--text-muted)] mt-1">📍 {vendor.address}</p>
                    )}
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
