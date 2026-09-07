import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/auth';
import { getAccountsMembers, addAccountsMember, updateAccountsMember } from '@/lib/google-sheets';
import { sanitizeString } from '@/lib/security';

/**
 * GET /api/accounts-members — list all accounts team members (admin only)
 */
export async function GET(request: NextRequest) {
  const session = requireAdmin(request);
  if (isAuthError(session)) return session;

  try {
    const members = await getAccountsMembers();
    // Never expose passwords to the client
    const sanitized = members.map(({ password, ...rest }) => rest);
    return NextResponse.json({ members: sanitized });
  } catch (error) {
    console.error('Failed to fetch accounts members:', error);
    return NextResponse.json({ error: 'Failed to fetch accounts members' }, { status: 500 });
  }
}

/**
 * POST /api/accounts-members — create a new accounts team member (admin only)
 * Body: { name, email, password }
 */
export async function POST(request: NextRequest) {
  const session = requireAdmin(request);
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'name, email, and password are required' }, { status: 400 });
    }

    // Sanitize and validate name
    const trimmedName = sanitizeString(String(name), 100)?.trim();
    if (!trimmedName || trimmedName.length < 2) {
      return NextResponse.json({ error: 'Name must be at least 2 characters' }, { status: 400 });
    }

    // Validate email format
    const trimmedEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }

    // Validate password length
    if (String(password).length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }
    if (String(password).length > 100) {
      return NextResponse.json({ error: 'Password is too long' }, { status: 400 });
    }

    // Check for duplicate email
    const existing = await getAccountsMembers();
    if (existing.some(m => m.email.toLowerCase() === trimmedEmail)) {
      return NextResponse.json({ error: 'An accounts member with this email already exists' }, { status: 409 });
    }

    const member = await addAccountsMember({
      name: trimmedName,
      email: trimmedEmail,
      password: String(password),
      status: 'active',
    });

    // Don't return the password
    const { password: _, ...sanitized } = member;
    return NextResponse.json({ member: sanitized }, { status: 201 });
  } catch (error) {
    console.error('Failed to create accounts member:', error);
    return NextResponse.json({ error: 'Failed to create accounts member' }, { status: 500 });
  }
}

/**
 * PUT /api/accounts-members — update an accounts team member (admin only)
 * Body: { id, name?, email?, password?, status? }
 */
export async function PUT(request: NextRequest) {
  const session = requireAdmin(request);
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();
    const { id, name, email, password, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: Record<string, string> = {};

    if (name) {
      const trimmedName = sanitizeString(String(name), 100)?.trim();
      if (!trimmedName || trimmedName.length < 2) {
        return NextResponse.json({ error: 'Name must be at least 2 characters' }, { status: 400 });
      }
      updates.name = trimmedName;
    }

    if (email) {
      const trimmedEmail = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
      }
      updates.email = trimmedEmail;
    }

    if (status) {
      if (!['active', 'inactive'].includes(String(status))) {
        return NextResponse.json({ error: 'Status must be active or inactive' }, { status: 400 });
      }
      updates.status = String(status);
    }

    if (password) {
      if (String(password).length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
      }
      if (String(password).length > 100) {
        return NextResponse.json({ error: 'Password is too long' }, { status: 400 });
      }
      updates.password = String(password);
    }

    // Check for duplicate email (if changing email)
    if (email) {
      const existing = await getAccountsMembers();
      const trimmedEmail = String(email).trim().toLowerCase();
      if (existing.some(m => m.email.toLowerCase() === trimmedEmail && m.id !== id)) {
        return NextResponse.json({ error: 'Another accounts member already uses this email' }, { status: 409 });
      }
    }

    const success = await updateAccountsMember(id, updates);
    if (!success) {
      return NextResponse.json({ error: 'Accounts member not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update accounts member:', error);
    return NextResponse.json({ error: 'Failed to update accounts member' }, { status: 500 });
  }
}
