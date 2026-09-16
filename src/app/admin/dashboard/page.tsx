'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '@/hooks/useAdminAuth';

export default function AdminDashboard() {
  const { isReady } = useAdminAuth();
  const [setupRunning, setSetupRunning] = useState(false);
  const [setupResult, setSetupResult] = useState<string | null>(null);

  const runSetup = async () => {
    setSetupRunning(true);
    setSetupResult(null);
    try {
      const res = await fetch('/api/setup', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const parts: string[] = ['Setup complete'];
        if (data.migratedInvoiceColumns > 0) parts.push(`Migrated ${data.migratedInvoiceColumns} invoice rows`);
        if (data.migratedVendorRows > 0) parts.push(`Migrated ${data.migratedVendorRows} vendor rows`);
        if (data.migratedPaymentRows > 0) parts.push(`Migrated ${data.migratedPaymentRows} payment rows`);
        if (data.fixedOrphanedStatuses > 0) parts.push(`Fixed ${data.fixedOrphanedStatuses} orphaned statuses`);
        if (parts.length === 1) parts.push('No migrations needed — everything is up to date');
        setSetupResult(parts.join('. '));
      } else {
        setSetupResult(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch {
      setSetupResult('Failed: Network error');
    }
    setSetupRunning(false);
    setTimeout(() => setSetupResult(null), 8000);
  };

  if (!isReady) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center py-16">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
          style={{ background: 'var(--primary-light)' }}
        >
          <svg className="w-8 h-8" style={{ color: 'var(--primary)' }} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2" style={{ letterSpacing: '-0.02em' }}>Dashboard</h2>
        <p className="text-sm text-[var(--text-muted)] mb-8">
          Dashboard analytics coming soon. Use the sidebar to navigate.
        </p>

        <div className="flex flex-wrap justify-center gap-3 mb-8">
          <Link href="/admin/invoices" className="btn-primary text-sm">
            View Invoices
          </Link>
          <Link href="/admin/vendors" className="btn-secondary text-sm">
            Manage Vendors
          </Link>
        </div>

        {/* Keep setup button accessible */}
        <div className="card inline-block text-left">
          <div className="flex items-center gap-3">
            <button
              onClick={runSetup}
              disabled={setupRunning}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <svg className={`w-4 h-4 ${setupRunning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {setupRunning ? 'Running Setup...' : 'Run Setup / Migrations'}
            </button>
            {setupResult && (
              <span className={`text-sm ${setupResult.startsWith('Failed') ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                {setupResult}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
