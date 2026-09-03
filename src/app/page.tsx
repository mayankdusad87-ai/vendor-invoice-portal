'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Role = 'billing' | 'approver' | 'admin';

export default function LoginPage() {
  const router = useRouter();
  const [activeRole, setActiveRole] = useState<Role>('billing');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Billing Engineer state
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [selectedVendor, setSelectedVendor] = useState('');

  // Approver state
  const [approvers, setApprovers] = useState<{ id: string; name: string }[]>([]);
  const [selectedApprover, setSelectedApprover] = useState('');
  const [approverPin, setApproverPin] = useState('');

  // Admin state
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  useEffect(() => {
    // Initialize sheets on first load
    const init = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        if (token) {
          await fetch('/api/setup', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: '{}',
          });
        }
      } catch { /* continue */ }
      setInitialized(true);
    };
    init();

    // Load vendor & approver lists
    const loadData = async () => {
      try {
        const [vendorRes, approverRes] = await Promise.all([
          fetch('/api/vendors?names=true'),
          fetch('/api/approvers?names=true'),
        ]);
        const vendorData = await vendorRes.json();
        const approverData = await approverRes.json();
        setVendors(vendorData.vendors || []);
        setApprovers(approverData.approvers || []);
      } catch { /* silent */ }
    };
    loadData();

    // Restore saved vendor name
    const savedVendor = localStorage.getItem('vendorName');
    if (savedVendor) setSelectedVendor(savedVendor);
  }, []);

  const handleBillingEnter = () => {
    if (!selectedVendor) {
      setError('Please select your name');
      return;
    }
    localStorage.setItem('vendorName', selectedVendor);
    router.push('/vendor/submit');
  };

  const handleApproverLogin = async () => {
    if (!selectedApprover || !approverPin) {
      setError('Please select your name and enter PIN');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/approver-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approverName: selectedApprover, pin: approverPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid credentials');
        setLoading(false);
        return;
      }
      localStorage.setItem('approverToken', data.token);
      localStorage.setItem('approverName', data.approver.name);
      router.push('/approver/dashboard');
    } catch {
      setError('Login failed. Please try again.');
    }
    setLoading(false);
  };

  const handleAdminLogin = async () => {
    if (!adminUsername.trim() || !adminPassword) {
      setError('Please enter username and password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername, password: adminPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid credentials');
        setLoading(false);
        return;
      }
      localStorage.setItem('adminToken', data.token);
      router.push('/admin/dashboard');
    } catch {
      setError('Login failed. Please try again.');
    }
    setLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeRole === 'billing') handleBillingEnter();
    else if (activeRole === 'approver') handleApproverLogin();
    else handleAdminLogin();
  };

  return (
    <div className="auth-background flex items-center justify-center p-4">
      <div className="w-full max-w-md relative z-10 fade-in">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 border border-[var(--border-glass)]"
            style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
            <svg className="w-7 h-7 text-[var(--primary)]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Raghav Group</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Vendor Invoice Portal</p>
        </div>

        {/* Glass Login Card */}
        <div className="glass-card p-6">
          {/* Role Tabs */}
          <div className="role-tabs mb-6">
            <button
              type="button"
              className={`role-tab ${activeRole === 'billing' ? 'active' : ''}`}
              onClick={() => { setActiveRole('billing'); setError(''); }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
              <span className="hidden sm:inline">Billing</span> Engineer
            </button>
            <button
              type="button"
              className={`role-tab ${activeRole === 'approver' ? 'active' : ''}`}
              onClick={() => { setActiveRole('approver'); setError(''); }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              Approver
            </button>
            <button
              type="button"
              className={`role-tab ${activeRole === 'admin' ? 'active' : ''}`}
              onClick={() => { setActiveRole('admin'); setError(''); }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              Admin
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Billing Engineer Form */}
            {activeRole === 'billing' && (
              <div className="space-y-4 fade-in">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                    Select Your Name
                  </label>
                  <select
                    value={selectedVendor}
                    onChange={(e) => setSelectedVendor(e.target.value)}
                    className="input-field"
                    aria-label="Select your vendor name"
                  >
                    <option value="">-- Select your name --</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.name}>{v.name}</option>
                    ))}
                  </select>
                  {vendors.length === 0 && initialized && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">No vendors registered. Contact admin.</p>
                  )}
                </div>

                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  Enter Portal
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>
            )}

            {/* Approver Form */}
            {activeRole === 'approver' && (
              <div className="space-y-4 fade-in">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                    Select Your Name
                  </label>
                  <select
                    value={selectedApprover}
                    onChange={(e) => setSelectedApprover(e.target.value)}
                    className="input-field"
                    aria-label="Select your approver name"
                  >
                    <option value="">-- Select your name --</option>
                    {approvers.map((a) => (
                      <option key={a.id} value={a.name}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                    PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={approverPin}
                    onChange={(e) => setApproverPin(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="input-field"
                    placeholder="Enter your PIN"
                    autoComplete="current-password"
                    maxLength={10}
                  />
                </div>

                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </div>
            )}

            {/* Admin Form */}
            {activeRole === 'admin' && (
              <div className="space-y-4 fade-in">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                    Username
                  </label>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    className="input-field"
                    placeholder="Enter username"
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="input-field"
                    placeholder="Enter password"
                    autoComplete="current-password"
                  />
                </div>

                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="alert alert-error mt-4">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                {error}
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[var(--text-muted)] mt-6 opacity-60">
          Raghav Group &bull; Vendor Invoice Management System
        </p>
      </div>
    </div>
  );
}
