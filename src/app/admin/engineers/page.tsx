'use client';

import { useState, useEffect } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface Engineer {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export default function AdminEngineers() {
  const { isReady } = useAdminAuth();
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEngineer, setEditingEngineer] = useState<Engineer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [form, setForm] = useState({ name: '', email: '', password: '' });

  useEffect(() => {
    if (!isReady) return;
    fetchEngineers();
  }, [isReady]);

  const fetchEngineers = async () => {
    try {
      // Cookie is sent automatically — no Authorization header needed
      const res = await fetch('/api/engineers');
      const data = await res.json();
      if (res.ok) {
        setEngineers(data.engineers || []);
      }
    } catch {
      console.error('Failed to fetch engineers');
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = form.name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Please enter a valid email address');
      return;
    }
    // Password required for new engineers, optional for edits
    if (!editingEngineer && (!form.password || form.password.length < 4)) {
      setError('Password must be at least 4 characters');
      return;
    }
    if (editingEngineer && form.password && form.password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }

    setSaving(true);

    try {
      if (editingEngineer) {
        // Build update body — only send password if changed
        const updateBody: Record<string, string> = {
          id: editingEngineer.id,
          name: trimmedName,
          email: form.email.trim(),
        };
        if (form.password) {
          updateBody.password = form.password;
        }

        const res = await fetch('/api/engineers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateBody),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to update engineer');
          setSaving(false);
          return;
        }
        setSuccessMsg('Engineer updated successfully');
      } else {
        const res = await fetch('/api/engineers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmedName,
            email: form.email.trim(),
            password: form.password,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to add engineer');
          setSaving(false);
          return;
        }
        setSuccessMsg('Engineer added successfully');
      }

      setForm({ name: '', email: '', password: '' });
      setShowForm(false);
      setEditingEngineer(null);
      await fetchEngineers();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setError('Something went wrong');
    }
    setSaving(false);
  };

  const handleEdit = (engineer: Engineer) => {
    setEditingEngineer(engineer);
    setForm({ name: engineer.name, email: engineer.email, password: '' });
    setShowForm(true);
    setError('');
  };

  const handleToggleStatus = async (engineer: Engineer) => {
    const newStatus = engineer.status === 'active' ? 'inactive' : 'active';
    if (newStatus === 'inactive') {
      const confirmed = window.confirm(
        `Are you sure you want to deactivate "${engineer.name}"?\n\nThis engineer will no longer be able to log in.`
      );
      if (!confirmed) return;
    }
    try {
      await fetch('/api/engineers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: engineer.id, status: newStatus }),
      });
      await fetchEngineers();
    } catch {
      console.error('Failed to update engineer status');
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingEngineer(null);
    setForm({ name: '', email: '', password: '' });
    setError('');
  };

  if (!isReady) return null;

  const activeEngineers = engineers.filter((e) => e.status === 'active');
  const inactiveEngineers = engineers.filter((e) => e.status === 'inactive');

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <AdminHeader />

      <main className="max-w-4xl mx-auto p-4 mt-4 fade-in">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Billing Engineers</h2>
            <p className="text-sm text-[var(--text-muted)]">{activeEngineers.length} active engineer(s)</p>
          </div>
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setEditingEngineer(null); setError(''); }}
              className="btn-primary flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Engineer
            </button>
          )}
        </div>

        {successMsg && (
          <div className="alert alert-success mb-4">{successMsg}</div>
        )}

        {showForm && (
          <div className="card mb-4">
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">
              {editingEngineer ? 'Edit Engineer' : 'Add New Engineer'}
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
                    placeholder="Engineer name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Email *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input-field"
                    placeholder="email@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Password {editingEngineer ? '(leave blank to keep)' : '*'}
                  </label>
                  <input
                    type="text"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="input-field"
                    placeholder={editingEngineer ? 'Leave blank to keep current' : 'Set password'}
                    required={!editingEngineer}
                  />
                </div>
              </div>
              {error && <div className="alert alert-error">{error}</div>}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingEngineer ? 'Update' : 'Add Engineer'}
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
        ) : engineers.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-[var(--text-muted)] mb-4">No billing engineers registered yet</p>
            <button onClick={() => setShowForm(true)} className="btn-primary">Add First Engineer</button>
          </div>
        ) : (
          <div className="space-y-3">
            {activeEngineers.map((eng) => (
              <div key={eng.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--text-primary)]">{eng.name}</span>
                      <span className="badge badge-active">Active</span>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-[var(--text-muted)]">
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                        </svg>
                        {eng.email}
                      </span>
                      <span>Added: {new Date(eng.createdAt).toLocaleDateString('en-IN')}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(eng)} className="text-sm font-medium min-h-[44px] px-2" style={{ color: 'var(--primary)' }}>
                      Edit
                    </button>
                    <button onClick={() => handleToggleStatus(eng)} className="text-sm font-medium min-h-[44px] px-2" style={{ color: 'var(--danger)' }}>
                      Deactivate
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {inactiveEngineers.length > 0 && (
              <>
                <h3 className="text-sm font-medium text-[var(--text-muted)] mt-6 mb-2">Inactive Engineers</h3>
                {inactiveEngineers.map((eng) => (
                  <div key={eng.id} className="card" style={{ opacity: 0.6 }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)]">{eng.name}</span>
                        <span className="badge badge-inactive">Inactive</span>
                      </div>
                      <button onClick={() => handleToggleStatus(eng)} className="text-sm font-medium min-h-[44px] px-2" style={{ color: 'var(--success)' }}>
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
