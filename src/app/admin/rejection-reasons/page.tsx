'use client';

import { useState, useEffect } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface RejectionReason {
  id: string;
  reason: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export default function RejectionReasonsPage() {
  const { isReady } = useAdminAuth();
  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [newReason, setNewReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isReady) return;
    fetchReasons();
  }, [isReady]);

  const fetchReasons = async () => {
    try {
      // Cookie is sent automatically — no Authorization header needed
      const res = await fetch('/api/rejection-reasons');
      const data = await res.json();
      if (res.ok) setReasons(data.reasons || []);
    } catch {
      console.error('Failed to fetch reasons');
    }
    setLoading(false);
  };

  const addReason = async () => {
    if (!newReason.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/rejection-reasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: newReason.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setReasons((prev) => [...prev, data.reason]);
        setNewReason('');
        setMessage({ type: 'success', text: 'Rejection reason added' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to add' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to add reason' });
    }
    setSaving(false);
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch('/api/rejection-reasons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (res.ok) {
        setReasons((prev) => prev.map((r) => r.id === id ? { ...r, status: newStatus as 'active' | 'inactive' } : r));
      }
    } catch {
      console.error('Failed to update');
    }
  };

  if (!isReady) return null;

  return (
    <div className="page-container">
      <AdminHeader />
      <main className="page-content fade-in" style={{ maxWidth: '48rem' }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Rejection Reasons</h2>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">Configure reasons shown to approvers when rejecting invoices</p>
          </div>
        </div>

        {/* Add New Reason */}
        <div className="card mb-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Add New Reason</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              className="input-field flex-1"
              placeholder="e.g., Budget Exceeded"
              onKeyDown={(e) => { if (e.key === 'Enter') addReason(); }}
              maxLength={200}
            />
            <button
              onClick={addReason}
              disabled={saving || !newReason.trim()}
              className="btn-primary whitespace-nowrap"
            >
              {saving ? 'Adding...' : 'Add Reason'}
            </button>
          </div>
          {message && (
            <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'} mt-3`}>
              {message.text}
            </div>
          )}
        </div>

        {/* Reasons List */}
        {loading ? (
          <LoadingSkeleton variant="list" count={6} />
        ) : reasons.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-[var(--text-muted)]">No rejection reasons configured yet</p>
          </div>
        ) : (
          <div className="card">
            <div className="space-y-0">
              {reasons.map((reason, index) => (
                <div
                  key={reason.id}
                  className="flex items-center justify-between py-3 gap-3"
                  style={index < reasons.length - 1 ? { borderBottom: '1px solid var(--border-muted)' } : {}}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      reason.status === 'active' ? 'bg-green-500' : 'bg-gray-500'
                    }`} />
                    <span className={`text-sm ${
                      reason.status === 'active' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] line-through'
                    }`}>
                      {reason.reason}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleStatus(reason.id, reason.status)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors min-h-[36px] ${
                      reason.status === 'active'
                        ? 'text-[var(--danger)] hover:bg-[var(--danger-light)]'
                        : 'text-[var(--success)] hover:bg-[var(--success-light)]'
                    }`}
                  >
                    {reason.status === 'active' ? 'Disable' : 'Enable'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
