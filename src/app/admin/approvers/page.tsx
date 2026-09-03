'use client';

import { useState, useEffect } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface Approver {
  id: string;
  name: string;
  pin: string;
  email: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export default function AdminApprovers() {
  const { isReady } = useAdminAuth();
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingApprover, setEditingApprover] = useState<Approver | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [form, setForm] = useState({ name: '', pin: '', email: '' });

  useEffect(() => {
    if (!isReady) return;
    fetchApprovers();
  }, [isReady]);

  const fetchApprovers = async () => {
    try {
      // Cookie is sent automatically — no Authorization header needed
      const res = await fetch('/api/approvers');
      const data = await res.json();
      if (res.ok) {
        setApprovers(data.approvers || []);
      }
    } catch {
      console.error('Failed to fetch approvers');
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Frontend validation
    const trimmedName = form.name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setError('Approver name must be at least 2 characters');
      return;
    }
    if (!form.pin || !/^\d{4,10}$/.test(form.pin)) {
      setError('PIN must be 4 to 10 digits (numbers only)');
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Please enter a valid email address');
      return;
    }

    const submittingForm = { ...form, name: trimmedName };

    setSaving(true);

    try {
      const method = editingApprover ? 'PUT' : 'POST';
      const body = editingApprover
        ? JSON.stringify({ id: editingApprover.id, ...submittingForm })
        : JSON.stringify(submittingForm);

      const res = await fetch('/api/approvers', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save approver');
        setSaving(false);
        return;
      }

      setSuccessMsg(editingApprover ? 'Approver updated' : 'Approver added');
      setForm({ name: '', pin: '', email: '' });
      setShowForm(false);
      setEditingApprover(null);
      await fetchApprovers();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setError('Something went wrong');
    }
    setSaving(false);
  };

  const handleEdit = (approver: Approver) => {
    setEditingApprover(approver);
    setForm({ name: approver.name, pin: approver.pin, email: approver.email });
    setShowForm(true);
    setError('');
  };

  const handleToggleStatus = async (approver: Approver) => {
    const newStatus = approver.status === 'active' ? 'inactive' : 'active';
    if (newStatus === 'inactive') {
      const confirmed = window.confirm(
        `Are you sure you want to deactivate "${approver.name}"?\n\nThis approver will no longer be able to log in or approve invoices.`
      );
      if (!confirmed) return;
    }
    try {
      await fetch('/api/approvers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: approver.id, status: newStatus }),
      });
      await fetchApprovers();
    } catch {
      console.error('Failed to update approver status');
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingApprover(null);
    setForm({ name: '', pin: '', email: '' });
    setError('');
  };

  if (!isReady) return null;

  const activeApprovers = approvers.filter((a) => a.status === 'active');
  const inactiveApprovers = approvers.filter((a) => a.status === 'inactive');

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <AdminHeader />

      <main className="max-w-4xl mx-auto p-4 mt-4 fade-in">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Approver Management</h2>
            <p className="text-sm text-[var(--text-muted)]">{activeApprovers.length} active approvers</p>
          </div>
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setEditingApprover(null); setError(''); }}
              className="btn-primary flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Approver
            </button>
          )}
        </div>

        {successMsg && (
          <div className="alert alert-success mb-4">{successMsg}</div>
        )}

        {showForm && (
          <div className="card mb-4">
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">
              {editingApprover ? 'Edit Approver' : 'Add New Approver'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input-field"
                    placeholder="Approver name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">PIN * (4-10 digits)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{4,10}"
                    value={form.pin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setForm({ ...form, pin: val });
                    }}
                    className="input-field"
                    placeholder="Enter 4-10 digit PIN"
                    required
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input-field"
                    placeholder="Email"
                  />
                </div>
              </div>
              {error && <div className="alert alert-error">{error}</div>}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingApprover ? 'Update' : 'Add Approver'}
                </button>
                <button type="button" onClick={cancelForm} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <LoadingSkeleton variant="list" count={3} />
        ) : approvers.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-[var(--text-muted)] mb-4">No approvers registered yet</p>
            <button onClick={() => setShowForm(true)} className="btn-primary">Add First Approver</button>
          </div>
        ) : (
          <div className="space-y-3">
            {activeApprovers.map((approver) => (
              <div key={approver.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--text-primary)]">{approver.name}</span>
                      <span className="badge badge-active">Active</span>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-[var(--text-muted)]">
                      {approver.email && (
                        <span className="inline-flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                          {approver.email}
                        </span>
                      )}
                      <span>PIN: {approver.pin}</span>
                      <span>Added: {new Date(approver.createdAt).toLocaleDateString('en-IN')}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(approver)} className="text-sm font-medium min-h-[44px] px-2" style={{ color: 'var(--primary)' }}>
                      Edit
                    </button>
                    <button onClick={() => handleToggleStatus(approver)} className="text-sm font-medium min-h-[44px] px-2" style={{ color: 'var(--danger)' }}>
                      Deactivate
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {inactiveApprovers.length > 0 && (
              <>
                <h3 className="text-sm font-medium text-[var(--text-muted)] mt-6 mb-2">Inactive Approvers</h3>
                {inactiveApprovers.map((approver) => (
                  <div key={approver.id} className="card" style={{ opacity: 0.6 }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)]">{approver.name}</span>
                        <span className="badge badge-inactive">Inactive</span>
                      </div>
                      <button onClick={() => handleToggleStatus(approver)} className="text-sm font-medium min-h-[44px] px-2" style={{ color: 'var(--success)' }}>
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
