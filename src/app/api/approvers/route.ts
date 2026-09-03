import { NextRequest, NextResponse } from 'next/server';
import { getApprovers, getActiveApprovers, addApprover, updateApprover } from '@/lib/google-sheets';
import { verifyAdminToken } from '@/lib/auth';
import {
  rateLimit, getRateLimitKey, rateLimitResponse, sanitizeString,
} from '@/lib/security';

// GET /api/approvers - get approver list
export async function GET(request: NextRequest) {
  // Rate limit: 30 reads per minute per IP
  const key = getRateLimitKey(request, 'approvers-get');
  const check = rateLimit(key, { maxRequests: 30, windowMs: 60_000 });
  if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const onlyNames = request.nextUrl.searchParams.get('names') === 'true';

    // For approver login dropdown, return only active approver names (no auth needed)
    if (onlyNames) {
      const approvers = await getActiveApprovers();
      return NextResponse.json({
        approvers: approvers.map((a) => ({ id: a.id, name: a.name })),
      });
    }

    // Full approver list requires admin auth
    if (!token || !verifyAdminToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const approvers = await getApprovers();
    return NextResponse.json({ approvers });
  } catch (error) {
    console.error('Get approvers error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch approvers' },
      { status: 500 }
    );
  }
}

// POST /api/approvers - add new approver (admin only)
export async function POST(request: NextRequest) {
  // Rate limit: 10 creates per minute per IP
  const key = getRateLimitKey(request, 'approvers-create');
  const check = rateLimit(key, { maxRequests: 10, windowMs: 60_000 });
  if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !verifyAdminToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Sanitize inputs
    const name = sanitizeString(body.name, 100);
    const pin = sanitizeString(body.pin, 20);
    const email = sanitizeString(body.email, 100);

    if (!name || !pin) {
      return NextResponse.json(
        { error: 'Approver name and PIN are required' },
        { status: 400 }
      );
    }

    // PIN must be numeric and reasonable length
    if (!/^\d{4,10}$/.test(pin)) {
      return NextResponse.json(
        { error: 'PIN must be 4-10 digits' },
        { status: 400 }
      );
    }

    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check for duplicate
    const existing = await getApprovers();
    if (existing.some((a) => a.name.toLowerCase() === name.toLowerCase() && a.status === 'active')) {
      return NextResponse.json(
        { error: 'An approver with this name already exists' },
        { status: 400 }
      );
    }

    const approver = await addApprover({
      name,
      pin,
      email,
      status: 'active',
    });

    return NextResponse.json({ success: true, approver });
  } catch (error) {
    console.error('Add approver error:', error);
    return NextResponse.json(
      { error: 'Failed to add approver' },
      { status: 500 }
    );
  }
}

// PUT /api/approvers - update approver (admin only)
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
        { error: 'Approver ID is required' },
        { status: 400 }
      );
    }

    // Build sanitized updates — only allow known fields
    const sanitizedUpdates: Record<string, string> = {};

    if (body.name !== undefined) {
      const name = sanitizeString(body.name, 100);
      if (!name) {
        return NextResponse.json({ error: 'Approver name cannot be empty' }, { status: 400 });
      }
      sanitizedUpdates.name = name;
    }
    if (body.pin !== undefined) {
      const pin = sanitizeString(body.pin, 20);
      if (pin && !/^\d{4,10}$/.test(pin)) {
        return NextResponse.json({ error: 'PIN must be 4-10 digits' }, { status: 400 });
      }
      sanitizedUpdates.pin = pin;
    }
    if (body.email !== undefined) {
      const email = sanitizeString(body.email, 100);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
      }
      sanitizedUpdates.email = email;
    }
    if (body.status !== undefined) {
      const status = sanitizeString(body.status, 20);
      if (!['active', 'inactive'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      sanitizedUpdates.status = status;
    }

    const success = await updateApprover(id, sanitizedUpdates);
    if (!success) {
      return NextResponse.json(
        { error: 'Approver not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update approver error:', error);
    return NextResponse.json(
      { error: 'Failed to update approver' },
      { status: 500 }
    );
  }
}
