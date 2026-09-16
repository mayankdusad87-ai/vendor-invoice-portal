'use client';

import { useState } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import AdminProjects from '@/app/admin/projects/page';
import CostHeadsPage from '@/app/admin/cost-heads/page';
import RejectionReasonsPage from '@/app/admin/rejection-reasons/page';

const SETUP_TABS = [
  {
    key: 'projects',
    label: 'Projects',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
      </svg>
    ),
  },
  {
    key: 'cost-heads',
    label: 'Cost Heads',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
      </svg>
    ),
  },
  {
    key: 'reasons',
    label: 'Rejection Reasons',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
      </svg>
    ),
  },
];

export default function SetupPage() {
  const { isReady } = useAdminAuth();
  const [activeTab, setActiveTab] = useState('projects');

  if (!isReady) return null;

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h2>Setup</h2>
          <p>Manage projects, cost heads, and rejection reasons</p>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="admin-status-tabs" style={{ marginBottom: '1.25rem' }}>
        {SETUP_TABS.map((tab) => (
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
        {activeTab === 'projects' && <AdminProjects />}
        {activeTab === 'cost-heads' && <CostHeadsPage />}
        {activeTab === 'reasons' && <RejectionReasonsPage />}
      </div>
    </div>
  );
}
