import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { getInvoiceById } from '@/lib/google-sheets';
import { updateInvoiceCostTag, COST_TYPES } from '@/lib/cost-heads';
import { sanitizeString } from '@/lib/security';

/**
 * PATCH /api/invoices/cost-tag
 *
 * Tag or retag an invoice's cost categorization (columns AF–AH).
 * Accessible to engineers (at submission) and accounts/admin (retroactive tagging).
 *
 * Body: { invoiceId, costCategory, costSubCategory, costType }
 */
export async function PATCH(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  // Engineers, accounts, and admin can tag invoices
  const allowedRoles = ['engineer', 'accounts', 'admin'];
  if (!allowedRoles.includes(session.type)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const invoiceId = sanitizeString(body.invoiceId, 50);
    const costCategory = sanitizeString(body.costCategory, 50) || '';
    const costSubCategory = sanitizeString(body.costSubCategory, 100) || '';
    const costType = sanitizeString(body.costType, 20) || '';

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
    }

    // Validate cost type if provided
    if (costType && !(COST_TYPES as readonly string[]).includes(costType)) {
      return NextResponse.json(
        { error: `Invalid cost type. Must be one of: ${COST_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify invoice exists
    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Engineers can only tag invoices they submitted
    if (session.type === 'engineer') {
      const engineerName = (session as import('@/lib/auth').EngineerToken).engineerName;
      if (invoice.submittedBy !== engineerName) {
        return NextResponse.json({ error: 'You can only tag your own invoices' }, { status: 403 });
      }
    }

    const updated = await updateInvoiceCostTag(invoiceId, costCategory, costSubCategory, costType);
    if (!updated) {
      return NextResponse.json({ error: 'Failed to update cost tag' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      costTag: { costCategory: costCategory.toUpperCase().trim(), costSubCategory: costSubCategory.trim(), costType: costType.trim() },
    });
  } catch (error) {
    console.error('Failed to update invoice cost tag:', error);
    return NextResponse.json({ error: 'Failed to update cost tag' }, { status: 500 });
  }
}
