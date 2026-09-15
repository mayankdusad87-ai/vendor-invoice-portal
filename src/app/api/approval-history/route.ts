import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { getApprovalHistory, getAllApprovalHistory } from '@/lib/google-sheets';

/**
 * GET /api/approval-history?invoiceId=XXX — get approval history for an invoice
 * GET /api/approval-history?all=true      — get ALL history (admin only)
 */
export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  const invoiceId = request.nextUrl.searchParams.get('invoiceId');
  const fetchAll = request.nextUrl.searchParams.get('all');

  try {
    if (fetchAll === 'true') {
      if (session.type !== 'admin') {
        return NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 });
      }
      const history = await getAllApprovalHistory();
      return NextResponse.json({ history });
    }

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
    }

    const history = await getApprovalHistory(invoiceId);
    return NextResponse.json({ history });
  } catch (error) {
    console.error('Failed to fetch approval history:', error);
    return NextResponse.json({ error: 'Failed to fetch approval history' }, { status: 500 });
  }
}
