import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import {
  getAvailableAdvancesForSettlement,
  getSettlementsByTaxInvoiceId,
  getSettlementsByAdvanceId,
  addSettlement,
  getInvoiceById,
  getPaymentsByInvoiceId,
} from '@/lib/google-sheets';
import { sanitizeString } from '@/lib/security';

/**
 * GET /api/settlements
 *
 * Query modes:
 * 1. ?vendorName=X&project=Y → available advances for settlement
 * 2. ?taxInvoiceId=X → settlements for a specific tax invoice
 * 3. ?advanceInvoiceId=X → settlements consuming a specific advance
 */
export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  try {
    const vendorName = request.nextUrl.searchParams.get('vendorName');
    const project = request.nextUrl.searchParams.get('project');
    const taxInvoiceId = request.nextUrl.searchParams.get('taxInvoiceId');
    const advanceInvoiceId = request.nextUrl.searchParams.get('advanceInvoiceId');

    if (taxInvoiceId) {
      const sanitizedId = sanitizeString(taxInvoiceId, 50);
      const settlements = await getSettlementsByTaxInvoiceId(sanitizedId);

      const enriched = await Promise.all(settlements.map(async (s) => {
        const advInvoice = await getInvoiceById(s.advanceInvoiceId);
        const advPayments = await getPaymentsByInvoiceId(s.advanceInvoiceId);
        const totalDisbursed = advPayments.reduce((sum, p) =>
          sum + (parseFloat(p.amount) || 0) + (parseFloat(p.tdsAmount) || 0) + (parseFloat(p.retentionAmount) || 0), 0);
        return {
          ...s,
          advanceInvoice: advInvoice ? {
            id: advInvoice.id,
            invoiceNumber: advInvoice.invoiceNumber,
            invoiceDate: advInvoice.invoiceDate,
            amount: advInvoice.amount,
            gstAmount: advInvoice.gstAmount,
            totalAmount: advInvoice.totalAmount,
            approvedAmount: advInvoice.approvedAmount,
            status: advInvoice.status,
          } : null,
          totalDisbursed,
        };
      }));

      return NextResponse.json({ settlements: enriched });
    }

    if (advanceInvoiceId) {
      const sanitizedId = sanitizeString(advanceInvoiceId, 50);
      const settlements = await getSettlementsByAdvanceId(sanitizedId);
      return NextResponse.json({ settlements });
    }

    if (vendorName && project) {
      const sanitizedVendor = sanitizeString(vendorName, 100);
      const sanitizedProject = sanitizeString(project, 100);

      if (!sanitizedVendor || !sanitizedProject) {
        return NextResponse.json({ error: 'Invalid vendor or project' }, { status: 400 });
      }

      const advances = await getAvailableAdvancesForSettlement(sanitizedVendor, sanitizedProject);

      const available = advances.map((adv) => ({
        id: adv.id,
        invoiceNumber: adv.invoiceNumber,
        invoiceDate: adv.invoiceDate,
        invoiceType: adv.invoiceType,
        amount: adv.amount,
        gstAmount: adv.gstAmount,
        totalAmount: adv.totalAmount,
        approvedAmount: adv.approvedAmount,
        status: adv.status,
        totalDisbursed: adv.totalDisbursed,
        totalConsumed: adv.totalConsumed,
        availableForSettlement: adv.availableForSettlement,
      }));

      return NextResponse.json({ advances: available });
    }

    return NextResponse.json({ error: 'Provide vendorName+project, taxInvoiceId, or advanceInvoiceId' }, { status: 400 });
  } catch (error) {
    console.error('Settlement GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch settlement data' }, { status: 500 });
  }
}

/**
 * POST /api/settlements
 *
 * Create settlement records linking a tax invoice to advance invoices.
 * Called after the tax invoice is created.
 *
 * Body: { taxInvoiceId, settlements: [{ advanceInvoiceId, consumedAmount }] }
 */
export async function POST(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  if (session.type !== 'engineer' && session.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: engineer role required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const taxInvoiceId = sanitizeString(body.taxInvoiceId, 50);
    const settlements = body.settlements as Array<{ advanceInvoiceId: string; consumedAmount: number }>;

    if (!taxInvoiceId) {
      return NextResponse.json({ error: 'Tax invoice ID is required' }, { status: 400 });
    }

    if (!Array.isArray(settlements) || settlements.length === 0) {
      return NextResponse.json({ error: 'At least one settlement entry is required' }, { status: 400 });
    }

    const taxInvoice = await getInvoiceById(taxInvoiceId);
    if (!taxInvoice) {
      return NextResponse.json({ error: 'Tax invoice not found' }, { status: 404 });
    }

    if (taxInvoice.settlementType !== 'settlement') {
      return NextResponse.json({ error: 'Invoice is not marked as a settlement invoice' }, { status: 400 });
    }

    const createdBy = session.type === 'engineer'
      ? (session as import('@/lib/auth').EngineerToken).engineerName
      : 'Admin';

    const created: Awaited<ReturnType<typeof addSettlement>>[] = [];

    for (const entry of settlements) {
      const advId = sanitizeString(entry.advanceInvoiceId, 50);
      const consumed = parseFloat(String(entry.consumedAmount));

      if (!advId || isNaN(consumed) || consumed <= 0) {
        return NextResponse.json({ error: `Invalid settlement entry for advance ${advId}` }, { status: 400 });
      }

      const advInvoice = await getInvoiceById(advId);
      if (!advInvoice) {
        return NextResponse.json({ error: `Advance invoice ${advId} not found` }, { status: 404 });
      }

      if (advInvoice.vendorName !== taxInvoice.vendorName) {
        return NextResponse.json({ error: 'Settlement: vendor mismatch between tax invoice and advance' }, { status: 400 });
      }

      if (advInvoice.project !== taxInvoice.project) {
        return NextResponse.json({ error: 'Settlement: project mismatch between tax invoice and advance' }, { status: 400 });
      }

      const result = await addSettlement({
        taxInvoiceId,
        advanceInvoiceId: advId,
        advanceInvoiceNumber: advInvoice.invoiceNumber,
        consumedAmount: consumed.toFixed(2),
        vendorName: taxInvoice.vendorName,
        project: taxInvoice.project,
        createdBy,
      });

      created.push(result);
    }

    return NextResponse.json({ success: true, settlements: created });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    console.error('Settlement POST error:', error);
    return NextResponse.json({ error: 'Failed to create settlements' }, { status: 500 });
  }
}
