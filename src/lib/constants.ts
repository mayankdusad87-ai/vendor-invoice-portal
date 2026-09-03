export const INVOICE_STATUSES = {
  submitted: { label: 'Submitted', badgeClass: 'badge badge-submitted', icon: '●' },
  under_review: { label: 'Under Review', badgeClass: 'badge badge-under-review', icon: '◐' },
  approved: { label: 'Approved', badgeClass: 'badge badge-approved', icon: '✓' },
  paid: { label: 'Paid', badgeClass: 'badge badge-paid', icon: '✓' },
  rejected: { label: 'Rejected', badgeClass: 'badge badge-rejected', icon: '✕' },
} as const;

export type InvoiceStatus = keyof typeof INVOICE_STATUSES;
