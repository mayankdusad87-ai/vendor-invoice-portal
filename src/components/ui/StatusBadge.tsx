'use client';

import { INVOICE_STATUSES } from '@/lib/constants';

interface StatusBadgeProps {
  status: keyof typeof INVOICE_STATUSES;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const statusInfo = INVOICE_STATUSES[status] || INVOICE_STATUSES.submitted;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
      {statusInfo.label}
    </span>
  );
}
