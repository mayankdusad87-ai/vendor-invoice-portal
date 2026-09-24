'use client';

interface DocStageBadgeProps {
  stage?: 'proforma' | 'tax_invoice' | 'direct' | '';
}

const STAGE_CONFIG = {
  proforma: {
    label: 'Proforma',
    dotColor: '#f59e0b',
    bg: 'rgba(245,158,11,0.1)',
    text: '#fbbf24',
    border: 'rgba(245,158,11,0.2)',
  },
  tax_invoice: {
    label: 'Tax Invoice',
    dotColor: '#10b981',
    bg: 'rgba(16,185,129,0.1)',
    text: '#34d399',
    border: 'rgba(16,185,129,0.2)',
  },
  direct: {
    label: 'Direct',
    dotColor: '#3b82f6',
    bg: 'rgba(59,130,246,0.1)',
    text: '#60a5fa',
    border: 'rgba(59,130,246,0.2)',
  },
};

export default function DocStageBadge({ stage }: DocStageBadgeProps) {
  if (!stage || !STAGE_CONFIG[stage]) return null;
  const config = STAGE_CONFIG[stage];

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: config.bg, color: config.text, border: `1px solid ${config.border}` }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: config.dotColor }}
      />
      {config.label}
    </span>
  );
}
