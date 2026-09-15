'use client';

import { useState, useEffect, useMemo } from 'react';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface AuditEntry {
  id: string;
  invoiceId: string;
  amount: string;
  cumulativeTotal: string;
  approvedBy: string;
  comments: string;
  createdAt: string;
}

type ActionType = 'all' | 'submitted' | 'approved' | 'rejected' | 'payment' | 'tax_invoice' | 'accounts_query' | 'resubmitted' | 'deduction' | 'retention' | 'other';

const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  submitted:      { label: 'Submitted',       color: 'text-blue-700',    bg: 'bg-blue-100' },
  approved:       { label: 'Approved',         color: 'text-green-700',   bg: 'bg-green-100' },
  rejected:       { label: 'Rejected',         color: 'text-red-700',     bg: 'bg-red-100' },
  payment:        { label: 'Payment',          color: 'text-purple-700',  bg: 'bg-purple-100' },
  tax_invoice:    { label: 'Tax Invoice',      color: 'text-indigo-700',  bg: 'bg-indigo-100' },
  accounts_query: { label: 'Accounts Query',   color: 'text-amber-700',   bg: 'bg-amber-100' },
  query_accepted: { label: 'Query Accepted',   color: 'text-orange-700',  bg: 'bg-orange-100' },
  query_disagreed:{ label: 'Query Disagreed',  color: 'text-teal-700',    bg: 'bg-teal-100' },
  resubmitted:    { label: 'Resubmitted',      color: 'text-cyan-700',    bg: 'bg-cyan-100' },
  deduction:      { label: 'Deduction',        color: 'text-slate-700',   bg: 'bg-slate-100' },
  retention:      { label: 'Retention Release', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  increase:       { label: 'Amount Increased', color: 'text-lime-700',    bg: 'bg-lime-100' },
  other:          { label: 'Other',            color: 'text-gray-700',    bg: 'bg-gray-100' },
};

function classifyAction(comments: string): string {
  const c = comments.toUpperCase();
  if (c.includes('[SUBMITTED]'))        return 'submitted';
  if (c.includes('[REJECTED]'))         return 'rejected';
  if (c.includes('[PAYMENT]'))          return 'payment';
  if (c.includes('[TAX_INVOICE]'))      return 'tax_invoice';
  if (c.includes('[ACCOUNTS_QUERY]'))   return 'accounts_query';
  if (c.includes('[QUERY_ACCEPTED]'))   return 'query_accepted';
  if (c.includes('[QUERY_DISAGREED]'))  return 'query_disagreed';
  if (c.includes('[RESUBMITTED]'))      return 'resubmitted';
  if (c.includes('[DEDUCTION'))         return 'deduction';
  if (c.includes('[RETENTION_RELEASED]')) return 'retention';
  if (c.includes('→ APPROVED'))         return 'approved';
  if (c.includes('+₹') && c.includes('AUTHORIZED')) return 'increase';
  return 'other';
}

function extractUser(entry: AuditEntry): string {
  return entry.approvedBy || 'System';
}

function extractStatusTransition(comments: string): string | null {
  const match = comments.match(/\((\w[\w_]*)\s*→\s*(\w[\w_]*)\)/);
  if (match) return `${match[1]} → ${match[2]}`;
  return null;
}

const PAGE_SIZE = 50;

export default function AccessLogsPage() {
  const { isReady } = useAdminAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<ActionType>('all');
  const [userFilter, setUserFilter] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!isReady) return;
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/approval-history?all=true');
        const data = await res.json();
        if (res.ok) {
          setEntries((data.history || []).reverse());
        } else {
          setError(data.error || 'Failed to load');
        }
      } catch {
        setError('Failed to fetch access logs');
      }
      setLoading(false);
    };
    fetchLogs();
  }, [isReady]);

  const uniqueUsers = useMemo(() => {
    const users = new Set<string>();
    entries.forEach((e) => {
      const user = extractUser(e);
      if (user && user !== 'System') users.add(user);
    });
    return Array.from(users).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((e) => {
      if (actionFilter !== 'all') {
        const action = classifyAction(e.comments);
        if (actionFilter === 'other') {
          if (action !== 'other') return false;
        } else if (actionFilter === 'accounts_query') {
          if (!['accounts_query', 'query_accepted', 'query_disagreed'].includes(action)) return false;
        } else if (actionFilter === 'deduction') {
          if (!['deduction', 'retention'].includes(action)) return false;
        } else {
          if (action !== actionFilter) return false;
        }
      }
      if (userFilter && extractUser(e) !== userFilter) return false;
      if (q) {
        const searchable = `${e.invoiceId} ${e.approvedBy} ${e.comments} ${e.createdAt}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [entries, search, actionFilter, userFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageEntries = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search, actionFilter, userFilter]);

  if (!isReady) return null;

  return (
    <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Access Logs</h2>
          <span className="text-sm text-[var(--text-muted)]">
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
            {filtered.length !== entries.length && ` of ${entries.length} total`}
          </span>
        </div>

        {/* Filters */}
        <div className="card mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Invoice ID, user, comment..."
                className="form-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Action Type</label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value as ActionType)}
                className="form-input w-full"
              >
                <option value="all">All Actions</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="payment">Payment</option>
                <option value="tax_invoice">Tax Invoice Upload</option>
                <option value="accounts_query">Accounts Query</option>
                <option value="resubmitted">Resubmitted</option>
                <option value="deduction">Deductions / Retention</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">User</label>
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="form-input w-full"
              >
                <option value="">All Users</option>
                {uniqueUsers.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <LoadingSkeleton variant="list" count={10} />
        ) : error ? (
          <div className="card text-center py-8">
            <p className="text-[var(--danger)]">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-[var(--text-muted)]">No log entries found</p>
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th className="text-left py-3 px-3 text-[var(--text-muted)] font-medium whitespace-nowrap">Time</th>
                      <th className="text-left py-3 px-3 text-[var(--text-muted)] font-medium whitespace-nowrap">Action</th>
                      <th className="text-left py-3 px-3 text-[var(--text-muted)] font-medium whitespace-nowrap">User</th>
                      <th className="text-left py-3 px-3 text-[var(--text-muted)] font-medium whitespace-nowrap">Invoice</th>
                      <th className="text-right py-3 px-3 text-[var(--text-muted)] font-medium whitespace-nowrap hidden sm:table-cell">Amount</th>
                      <th className="text-left py-3 px-3 text-[var(--text-muted)] font-medium hidden md:table-cell">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageEntries.map((entry) => {
                      const action = classifyAction(entry.comments);
                      const config = ACTION_CONFIG[action] || ACTION_CONFIG.other;
                      const transition = extractStatusTransition(entry.comments);
                      const cleanComment = entry.comments
                        .replace(/\[[\w_]+\]\s*/g, '')
                        .replace(/\([\w_]+\s*→\s*[\w_]+\)/g, '')
                        .trim();

                      return (
                        <tr key={entry.id} className="hover:bg-[var(--surface-hover)] transition-colors" style={{ borderBottom: '1px solid var(--border-muted)' }}>
                          <td className="py-2.5 px-3 text-[var(--text-muted)] whitespace-nowrap text-xs">
                            {entry.createdAt}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                              {config.label}
                            </span>
                            {transition && (
                              <span className="block text-[10px] text-[var(--text-muted)] mt-0.5">{transition}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-[var(--text-primary)] font-medium whitespace-nowrap text-xs">
                            {extractUser(entry)}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-xs text-[var(--text-secondary)]">
                            {entry.invoiceId}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-[var(--text-primary)] whitespace-nowrap hidden sm:table-cell">
                            {parseFloat(entry.amount) > 0 ? `₹${parseFloat(entry.amount).toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-[var(--text-secondary)] text-xs max-w-[300px] truncate hidden md:table-cell" title={entry.comments}>
                            {cleanComment || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="btn-secondary text-sm disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-[var(--text-muted)]">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="btn-secondary text-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
    </div>
  );
}
