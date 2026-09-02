import { NextRequest, NextResponse } from 'next/server';
import { getApprovers, getActiveApprovers, addApprover, updateApprover } from '@/lib/google-sheets';
import { verifyAdminToken } from '@/lib/auth';

// GET /api/approvers - get approver list
export async function GET(request: NextRequest) {
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
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !verifyAdminToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, pin, email } = body;

    if (!name || !pin) {
      return NextResponse.json(
        { error: 'Approver name and PIN are required' },
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
      email: email || '',
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
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Approver ID is required' },
        { status: 400 }
      );
    }

    const success = await updateApprover(id, updates);
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
