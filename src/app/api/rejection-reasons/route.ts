import { NextRequest, NextResponse } from 'next/server';
import {
  getRejectionReasons,
  getActiveRejectionReasons,
  addRejectionReason,
  updateRejectionReason,
} from '@/lib/google-sheets';
import { verifyAdminToken } from '@/lib/auth';
import {
  rateLimit, getRateLimitKey, rateLimitResponse, sanitizeString,
} from '@/lib/security';

// GET /api/rejection-reasons - get rejection reasons list
export async function GET(request: NextRequest) {
  // Rate limit: 30 reads per minute per IP
  const key = getRateLimitKey(request, 'rejection-reasons-get');
  const check = rateLimit(key, { maxRequests: 30, windowMs: 60_000 });
  if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

  try {
    const activeOnly = request.nextUrl.searchParams.get('active') === 'true';

    // For approver dropdown, return only active reasons (no auth needed)
    if (activeOnly) {
      const reasons = await getActiveRejectionReasons();
      return NextResponse.json({
        reasons: reasons.map((r) => ({ id: r.id, reason: r.reason })),
      });
    }

    // Full list requires admin auth
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !verifyAdminToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const reasons = await getRejectionReasons();
    return NextResponse.json({ reasons });
  } catch (error) {
    console.error('Get rejection reasons error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rejection reasons' },
      { status: 500 }
    );
  }
}

// POST /api/rejection-reasons - add new rejection reason (admin only)
export async function POST(request: NextRequest) {
  // Rate limit: 10 creates per minute per IP
  const key = getRateLimitKey(request, 'rejection-reasons-create');
  const check = rateLimit(key, { maxRequests: 10, windowMs: 60_000 });
  if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !verifyAdminToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Sanitize input
    const reason = sanitizeString(body.reason, 200);

    if (!reason) {
      return NextResponse.json(
        { error: 'Rejection reason text is required' },
        { status: 400 }
      );
    }

    // Check for duplicate
    const existing = await getRejectionReasons();
    if (existing.some((r) => r.reason.toLowerCase() === reason.toLowerCase() && r.status === 'active')) {
      return NextResponse.json(
        { error: 'A rejection reason with this text already exists' },
        { status: 400 }
      );
    }

    const newReason = await addRejectionReason({
      reason,
      status: 'active',
    });

    return NextResponse.json({ success: true, reason: newReason });
  } catch (error) {
    console.error('Add rejection reason error:', error);
    return NextResponse.json(
      { error: 'Failed to add rejection reason' },
      { status: 500 }
    );
  }
}

// PUT /api/rejection-reasons - update rejection reason (admin only)
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !verifyAdminToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const id = sanitizeString(body.id, 50);

    if (!id) {
      return NextResponse.json(
        { error: 'Rejection reason ID is required' },
        { status: 400 }
      );
    }

    // Build sanitized updates — only allow known fields
    const sanitizedUpdates: Record<string, string> = {};

    if (body.reason !== undefined) {
      const reason = sanitizeString(body.reason, 200);
      if (!reason) {
        return NextResponse.json({ error: 'Rejection reason text cannot be empty' }, { status: 400 });
      }
      sanitizedUpdates.reason = reason;
    }
    if (body.status !== undefined) {
      const status = sanitizeString(body.status, 20);
      if (!['active', 'inactive'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      sanitizedUpdates.status = status;
    }

    const success = await updateRejectionReason(id, sanitizedUpdates);
    if (!success) {
      return NextResponse.json(
        { error: 'Rejection reason not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update rejection reason error:', error);
    return NextResponse.json(
      { error: 'Failed to update rejection reason' },
      { status: 500 }
    );
  }
}
