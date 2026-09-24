'use client';

import React, { useEffect, useRef } from 'react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: string;
}

export default function InvoiceDrawer({ open, onClose, title, subtitle, children, width = 'max-w-lg' }: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className={`absolute right-0 top-0 bottom-0 ${width} w-full bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl overflow-hidden flex flex-col animate-slide-in-right`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border-muted)]">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-[var(--text-primary)] truncate">{title}</h2>}
            {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}

export function DrawerSection({ title, icon, children, badge }: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4 border-b border-[var(--border-muted)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && <span className="text-[var(--text-muted)]">{icon}</span>}
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{title}</h3>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

export function DrawerField({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between items-baseline py-1.5">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span className={`text-sm text-[var(--text-primary)] ${mono ? 'font-mono' : ''} text-right max-w-[60%] truncate`}>{value || '—'}</span>
    </div>
  );
}
