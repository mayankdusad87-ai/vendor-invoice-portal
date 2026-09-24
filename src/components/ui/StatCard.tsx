'use client';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color?: 'blue' | 'amber' | 'emerald' | 'purple' | 'red' | 'cyan';
  active?: boolean;
  onClick?: () => void;
}

const COLORS = {
  blue:    { bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.15)',  text: '#60a5fa', glow: 'rgba(59,130,246,0.25)',  accent: '#3b82f6' },
  amber:   { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.15)',  text: '#fbbf24', glow: 'rgba(245,158,11,0.25)',  accent: '#f59e0b' },
  emerald: { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.15)',  text: '#34d399', glow: 'rgba(16,185,129,0.25)',  accent: '#10b981' },
  purple:  { bg: 'rgba(139,92,246,0.08)',  border: 'rgba(139,92,246,0.15)',  text: '#a78bfa', glow: 'rgba(139,92,246,0.25)',  accent: '#8b5cf6' },
  red:     { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.15)',   text: '#f87171', glow: 'rgba(239,68,68,0.25)',   accent: '#ef4444' },
  cyan:    { bg: 'rgba(6,182,212,0.08)',   border: 'rgba(6,182,212,0.15)',   text: '#22d3ee', glow: 'rgba(6,182,212,0.25)',   accent: '#06b6d4' },
};

export default function StatCard({ title, value, subtitle, icon, color = 'blue', active, onClick }: StatCardProps) {
  const c = COLORS[color];

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl border transition-all duration-200 ${
        onClick ? 'cursor-pointer' : ''
      } ${
        active
          ? 'ring-1 shadow-lg'
          : 'hover:border-[var(--border)]'
      }`}
      style={{
        background: active ? c.bg : 'var(--surface)',
        borderColor: active ? c.accent : 'var(--border-glass)',
        ...(active ? { ringColor: c.accent, boxShadow: `0 0 20px ${c.glow}` } : {}),
      }}
    >
      {/* Accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: c.accent }} />

      <div className="px-4 py-3.5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)] mb-1">{title}</p>
            <p className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">{value}</p>
            {subtitle && (
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{subtitle}</p>
            )}
          </div>
          <div
            className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: c.bg, color: c.text }}
          >
            {icon}
          </div>
        </div>
      </div>
    </div>
  );
}
