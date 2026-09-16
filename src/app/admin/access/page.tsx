'use client';

import { useState } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import AdminEngineers from '@/app/admin/engineers/page';
import AdminApprovers from '@/app/admin/approvers/page';
import AdminAccountsTeam from '@/app/admin/accounts-team/page';

const ACCESS_TABS = [
  {
    key: 'engineers',
    label: 'Engineers',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.049.58.025 1.194-.14 1.743" />
      </svg>
    ),
  },
  {
    key: 'approvers',
    label: 'Approvers',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
  {
    key: 'accounts',
    label: 'Accounts',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
      </svg>
    ),
  },
];

export default function AccessPage() {
  const { isReady } = useAdminAuth();
  const [activeTab, setActiveTab] = useState('engineers');

  if (!isReady) return null;

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h2>Access Management</h2>
          <p>Manage engineers, approvers, and accounts team access</p>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="admin-status-tabs" style={{ marginBottom: '1.25rem' }}>
        {ACCESS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`admin-status-tab ${activeTab === tab.key ? 'active' : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'engineers' && <AdminEngineers />}
        {activeTab === 'approvers' && <AdminApprovers />}
        {activeTab === 'accounts' && <AdminAccountsTeam />}
      </div>
    </div>
  );
}
