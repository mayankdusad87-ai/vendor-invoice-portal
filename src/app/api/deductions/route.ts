import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { getDeductions, addDeduction, updateDeduction, getInvoiceById, addApprovalHistory, getISTTimestamp } from '@/lib/google-sheets';
import { sanitizeString } from '@/lib/security';

/**
 * GET /api/deductions?invoiceId=XXX
 * Returns all deductions for an invoice (one per tranche).
 */
export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  const invoiceId = request.nextUrl.searchParams.get('invoiceId');
  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
  }

  try {
    const deductions = await getDeductions(invoiceId);
    return NextResponse.json({ deductions });
  } catch (error) {
    console.error('Failed to fetch deductions:', error);
    return NextResponse.json({ error: 'Failed to fetch deductions' }, { status: 500 });
  }
}

/**
 * POST /api/deductions — Save or update deductions for a tranche
 * Body: { invoiceId, approvalHistoryId, trancheNumber, tdsAmount, retentionAmount }
 *
 * If a deduction already exists for the given approvalHistoryId, it is updated.
 * Otherwise a new deduction row is created.
 */
export async function POST(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  // Only accounts team and admin can manage deductions
  if (session.type !== 'accounts' && session.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: accounts role required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const invoiceId = sanitizeString(body.invoiceId, 50);
    const approvalHistoryId = sanitizeString(body.approvalHistoryId, 50);
    const trancheNumber = String(body.trancheNumber || '1');

    if (!invoiceId || !approvalHistoryId) {
      return NextResponse.json({ error: 'invoiceId and approvalHistoryId are required' }, { status: 400 });
    }

    const tdsAmount = parseFloat(body.tdsAmount);
    const retentionAmount = parseFloat(body.retentionAmount);

    if (isNaN(tdsAmount) || tdsAmount < 0) {
      return NextResponse.json({ error: 'TDS amount must be a non-negative number' }, { status: 400 });
    }
    if (isNaN(retentionAmount) || retentionAmount < 0) {
      return NextResponse.json({ error: 'Retention amount must be a non-negative number' }, { status: 400 });
    }

    // Validate invoice exists
    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const updatedBy = session.type === 'accounts' ? session.accountsName : 'Admin';

    // Check if deduction already exists for this tranche
    const existing = await getDeductions(invoiceId);
    const existingForTranche = existing.find(d => d.approvalHistoryId === approvalHistoryId);

    if (existingForTranche) {
      // Update existing deduction
      const success = await updateDeduction(existingForTranche.id, {
        tdsAmount: String(tdsAmount),
        retentionAmount: String(retentionAmount),
        updatedBy,
      });
      if (!success) {
        return NextResponse.json({ error: 'Failed to update deduction' }, { status: 500 });
      }

      // Log to audit trail
      await addApprovalHistory({
        invoiceId,
        amount: '0',
        cumulativeTotal: invoice.approvedAmount || '0',
        approvedBy: `Accounts: ${updatedBy}`,
        comments: `[DEDUCTION_UPDATED] Tranche ${trancheNumber}: TDS ₹${tdsAmount.toLocaleString('en-IN')}, Retention ₹${retentionAmount.toLocaleString('en-IN')}`,
      });

      return NextResponse.json({
        success: true,
        deduction: { ...existingForTranche, tdsAmount: String(tdsAmount), retentionAmount: String(retentionAmount), updatedBy },
        updated: true,
      });
    }

    // Create new deduction
    const deduction = await addDeduction({
      invoiceId,
      approvalHistoryId,
      trancheNumber,
      tdsAmount: String(tdsAmount),
      retentionAmount: String(retentionAmount),
      retentionStatus: retentionAmount > 0 ? 'held' : 'held',
      releasedAt: '',
      releasedBy: '',
      updatedBy,
    });

    // Log to audit trail
    await addApprovalHistory({
      invoiceId,
      amount: '0',
      cumulativeTotal: invoice.approvedAmount || '0',
      approvedBy: `Accounts: ${updatedBy}`,
      comments: `[DEDUCTION] Tranche ${trancheNumber}: TDS ₹${tdsAmount.toLocaleString('en-IN')}, Retention ₹${retentionAmount.toLocaleString('en-IN')}, Net payable reduced`,
    });

    return NextResponse.json({
      success: true,
      deduction,
      created: true,
    });
  } catch (error) {
    console.error('Failed to save deduction:', error);
    return NextResponse.json({ error: 'Failed to save deduction' }, { status: 500 });
  }
}

/**
 * PATCH /api/deductions — Release retention for a tranche
 * Body: { deductionId, action: 'release_retention', reason? }
 */
export async function PATCH(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  if (session.type !== 'accounts' && session.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: accounts role required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const deductionId = sanitizeString(body.deductionId, 50);
    const action = sanitizeString(body.action, 30);

    if (!deductionId || action !== 'release_retention') {
      return NextResponse.json({ error: 'deductionId and action "release_retention" required' }, { status: 400 });
    }

    const releasedBy = session.type === 'accounts' ? session.accountsName : 'Admin';

    const now = getISTTimestamp().combined;

    const success = await updateDeduction(deductionId, {
      retentionStatus: 'released',
      releasedAt: now,
      releasedBy,
      updatedBy: releasedBy,
    });

    if (!success) {
      return NextResponse.json({ error: 'Deduction not found or update failed' }, { status: 404 });
    }

    // Log to audit trail — we need the invoiceId from the deduction
    // Since updateDeduction succeeded, we know it exists. Get it from the body.
    const invoiceId = sanitizeString(body.invoiceId, 50);
    const trancheNumber = body.trancheNumber || '?';
    const retentionAmount = body.retentionAmount || '0';
    const reason = sanitizeString(body.reason, 500) || 'Defect liability period complete';

    if (invoiceId) {
      const invoice = await getInvoiceById(invoiceId);
      await addApprovalHistory({
        invoiceId,
        amount: '0',
        cumulativeTotal: invoice?.approvedAmount || '0',
        approvedBy: `Accounts: ${releasedBy}`,
        comments: `[RETENTION_RELEASED] Tranche ${trancheNumber}: ₹${parseFloat(retentionAmount).toLocaleString('en-IN')} retention released. Reason: ${reason}`,
      });
    }

    return NextResponse.json({
      success: true,
      released: true,
      releasedAt: now,
      releasedBy,
    });
  } catch (error) {
    console.error('Failed to release retention:', error);
    return NextResponse.json({ error: 'Failed to release retention' }, { status: 500 });
  }
}
