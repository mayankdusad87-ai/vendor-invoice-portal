'use client';

import { INVOICE_TYPES } from '@/lib/constants';

interface TypeBadgeProps {
  type: keyof typeof INVOICE_TYPES | string;
}

export default function TypeBadge({ type }: TypeBadgeProps) {
  const key = type as keyof typeof INVOICE_TYPES;
  const typeInfo = INVOICE_TYPES[key];
  if (!typeInfo) return <span className="badge">{type || '—'}</span>;
  return (
    <span className={`badge ${typeInfo.badgeClass}`}>
      {typeInfo.label}
    </span>
  );
}
