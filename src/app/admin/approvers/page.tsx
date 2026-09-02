'use client';

import { useState, useEffect } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
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
  const { token, isReady } = useAdminAuth();
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingApprover, setEditingApprover] = useState<Approver | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [form, setForm] = useState({ name: '', pin: '', email: '' });

  useEffect(() => {
    if (!token) return;
    fetchApprovers();
  }, [token]);

  const fetchApprovers = async () => {
    try {
      const res = await fetch('/api/approvers', {
        headers: { Authorization: `Bearer ${token}` },
      });
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
    setSaving(true);

    try {
      const method = editingApprover ? 'PUT' : 'POST';
      const body = editingApprover
        ? JSON.stringify({ id: editingApprover.id, ...form })
        : JSON.stringify(form);

      const res = await fetch('/api/approvers', {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
    try {
      await fetch('/api/approvers', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader />

      <main className="max-w-4xl mx-auto p-4 mt-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Approver Management</h2>
            <p className="text-sm text-gray-500">{activeApprovers.length} active approvers</p>
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
          <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg mb-4">{successMsg}</div>
        )}

        {showForm && (
          <div className="card mb-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {editingApprover ? 'Edit Approver' : 'Add New Approver'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PIN *</label>
                  <input
                    type="text"
                    value={form.pin}
                    onChange={(e) => setForm({ ...form, pin: e.target.value })}
                    className="input-field"
                    placeholder="Login PIN"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input-field"
                    placeholder="Email"
                  />
                </div>
              </div>
              {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingApprover ? 'Update' : 'Add Approver'}
                </button>
                <button type="button" onClick={cancelForm} className="btn-primary" style={{ background: '#6b7280' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : approvers.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500 mb-4">No approvers registered yet</p>
            <button onClick={() => setShowForm(true)} className="btn-primary">Add First Approver</button>
          </div>
        ) : (
          <div className="space-y-3">
            {activeApprovers.map((approver) => (
              <div key={approver.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 dark:text-white">{approver.name}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                      {approver.email && <span>✉️ {approver.email}</span>}
                      <span>PIN: {approver.pin}</span>
                      <span>Added: {new Date(approver.createdAt).toLocaleDateString('en-IN')}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(approver)} className="text-sm text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                    <button onClick={() => handleToggleStatus(approver)} className="text-sm text-red-500 hover:text-red-700 font-medium">Deactivate</button>
                  </div>
                </div>
              </div>
            ))}

            {inactiveApprovers.length > 0 && (
              <>
                <h3 className="text-sm font-medium text-gray-400 mt-6 mb-2">Inactive Approvers</h3>
                {inactiveApprovers.map((approver) => (
                  <div key={approver.id} className="card opacity-60">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900 dark:text-white">{approver.name}</span>
                      <button onClick={() => handleToggleStatus(approver)} className="text-sm text-green-600 font-medium">Reactivate</button>
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
