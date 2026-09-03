export const INVOICE_STATUSES = {
  submitted: { label: 'Submitted', badgeClass: 'badge badge-submitted', icon: '●' },
  under_review: { label: 'Under Review', badgeClass: 'badge badge-under-review', icon: '◐' },
  approved: { label: 'Approved', badgeClass: 'badge badge-approved', icon: '✓' },
  rejected: { label: 'Rejected', badgeClass: 'badge badge-rejected', icon: '✕' },
} as const;

export type InvoiceStatus = keyof typeof INVOICE_STATUSES;

export const INVOICE_TYPES = {
  advance: { label: 'Advance', badgeClass: 'badge-type-advance' },
  ra: { label: 'RA', badgeClass: 'badge-type-ra' },
  final: { label: 'Final', badgeClass: 'badge-type-final' },
} as const;

export type InvoiceType = keyof typeof INVOICE_TYPES;
