'use client';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  bgColor?: string;
  textColor?: string;
}

const colorMap: Record<string, { bg: string; text: string }> = {
  'bg-blue-100': { bg: 'rgba(59, 130, 246, 0.12)', text: '#60a5fa' },
  'bg-yellow-100': { bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24' },
  'bg-green-100': { bg: 'rgba(34, 197, 94, 0.12)', text: '#4ade80' },
  'bg-purple-100': { bg: 'rgba(168, 85, 247, 0.12)', text: '#c084fc' },
};

export default function StatCard({ title, value, icon, bgColor = 'bg-blue-100', textColor = 'text-blue-600' }: StatCardProps) {
  const mapped = colorMap[bgColor] || colorMap['bg-blue-100'];

  return (
    <div className="stat-card">
      <div className="flex items-center gap-3">
        <div
          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: mapped.bg }}
        >
          <div style={{ color: mapped.text }}>{icon}</div>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--text-muted)]">{title}</p>
          <p className="text-xl font-bold text-[var(--text-primary)] truncate">{value}</p>
        </div>
      </div>
    </div>
  );
}
