'use client';

import { INVOICE_STATUSES } from '@/lib/constants';

interface StatusBadgeProps {
  status: keyof typeof INVOICE_STATUSES;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const statusInfo = INVOICE_STATUSES[status] || INVOICE_STATUSES.submitted;
  return (
    <span className={statusInfo.badgeClass} role="status">
      <span aria-hidden="true">{statusInfo.icon}</span>
      {statusInfo.label}
    </span>
  );
}
