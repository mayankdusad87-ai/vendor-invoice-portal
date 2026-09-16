'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import AdminSidebar from '@/components/layout/AdminSidebar';
import { useAdminAuth } from '@/hooks/useAdminAuth';

const BREADCRUMB_MAP: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/invoices': 'Invoices',
  '/admin/vendors': 'Vendors',
  '/admin/access': 'Access',
  '/admin/engineers': 'Engineers',
  '/admin/approvers': 'Approvers',
  '/admin/accounts-team': 'Accounts Team',
  '/admin/setup': 'Setup',
  '/admin/projects': 'Projects',
  '/admin/cost-heads': 'Cost Heads',
  '/admin/rejection-reasons': 'Rejection Reasons',
  '/admin/access-logs': 'Access Logs',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Skip shell for login page
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  return <AdminShell
    sidebarCollapsed={sidebarCollapsed}
    setSidebarCollapsed={setSidebarCollapsed}
    mobileOpen={mobileOpen}
    setMobileOpen={setMobileOpen}
    pathname={pathname}
  >
    {children}
  </AdminShell>;
}

function AdminShell({
  children,
  sidebarCollapsed,
  setSidebarCollapsed,
  mobileOpen,
  setMobileOpen,
  pathname,
}: {
  children: React.ReactNode;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  pathname: string;
}) {
  const { username, isReady, logout } = useAdminAuth();

  const currentPage = BREADCRUMB_MAP[pathname] || pathname.split('/').pop()?.replace(/-/g, ' ') || '';

  if (!isReady) {
    return (
      <div className="admin-theme" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-[var(--text-muted)] text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="admin-theme" style={{ display: 'flex', minHeight: '100vh' }}>
      <AdminSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        username={username}
        onLogout={logout}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="admin-content">
        {/* Topbar */}
        <div className="admin-topbar">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1.5 rounded-lg hover:bg-[var(--background-subtle)] text-[var(--text-muted)]"
              aria-label="Open menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            {/* Breadcrumb */}
            <div className="admin-topbar-breadcrumb">
              <span>Admin</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
              <span className="current" style={{ textTransform: 'capitalize' }}>{currentPage}</span>
            </div>
          </div>

          <div className="admin-topbar-actions">
            <div
              className="flex items-center justify-center w-7 h-7 rounded-lg text-[0.6875rem] font-semibold text-white cursor-default"
              style={{ background: 'var(--primary)' }}
              title={username || 'Admin'}
            >
              {username ? username.charAt(0).toUpperCase() : 'A'}
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="admin-page fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
