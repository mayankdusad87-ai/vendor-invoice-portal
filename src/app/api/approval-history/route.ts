import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { getApprovalHistory } from '@/lib/google-sheets';

/**
 * GET /api/approval-history?invoiceId=XXX — get approval history for an invoice
 */
export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  const invoiceId = request.nextUrl.searchParams.get('invoiceId');
  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
  }

  try {
    const history = await getApprovalHistory(invoiceId);
    return NextResponse.json({ history });
  } catch (error) {
    console.error('Failed to fetch approval history:', error);
    return NextResponse.json({ error: 'Failed to fetch approval history' }, { status: 500 });
  }
}
