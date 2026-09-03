import { NextRequest, NextResponse } from 'next/server';
import { getEngineers, addEngineer, updateEngineer } from '@/lib/google-sheets';
import { requireAdmin, isAuthError } from '@/lib/auth';
import { rateLimit, getRateLimitKey, rateLimitResponse } from '@/lib/security';

// GET /api/engineers — list billing engineers (admin only)
export async function GET(request: NextRequest) {
  // Admin only
  const session = requireAdmin(request);
  if (isAuthError(session)) return session;

  try {
    const engineers = await getEngineers();
    // Never send passwords to the client
    const safeEngineers = engineers.map(({ password: _, ...rest }) => rest);
    return NextResponse.json({ engineers: safeEngineers });
  } catch (error) {
    console.error('Get engineers error:', error);
    return NextResponse.json({ error: 'Failed to fetch engineers' }, { status: 500 });
  }
}

// POST /api/engineers — add a new billing engineer (admin only)
export async function POST(request: NextRequest) {
  const session = requireAdmin(request);
  if (isAuthError(session)) return session;

  // Rate limit: 10 per minute per IP
  const key = getRateLimitKey(request, 'add-engineer');
  const check = rateLimit(key, { maxRequests: 10, windowMs: 60_000 });
  if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

  try {
    const body = await request.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
    }
    if (typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Name must be at least 2 characters' }, { status: 400 });
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 4) {
      return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
    }

    // Check for duplicate email
    const existing = await getEngineers();
    const duplicate = existing.find((e) => e.email.toLowerCase() === email.toLowerCase() && e.status === 'active');
    if (duplicate) {
      return NextResponse.json({ error: 'An engineer with this email already exists' }, { status: 409 });
    }

    const engineer = await addEngineer({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      status: 'active',
    });

    // Return without password
    const { password: _, ...safe } = engineer;
    return NextResponse.json({ success: true, engineer: safe });
  } catch (error) {
    console.error('Add engineer error:', error);
    return NextResponse.json({ error: 'Failed to add engineer' }, { status: 500 });
  }
}

// PUT /api/engineers — update a billing engineer (admin only)
export async function PUT(request: NextRequest) {
  const session = requireAdmin(request);
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Engineer ID is required' }, { status: 400 });
    }

    // Validate email if being updated
    if (updates.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
        return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
      }
      // Check for duplicate email (excluding this engineer)
      const existing = await getEngineers();
      const duplicate = existing.find(
        (e) => e.email.toLowerCase() === updates.email.toLowerCase() && e.id !== id && e.status === 'active'
      );
      if (duplicate) {
        return NextResponse.json({ error: 'An engineer with this email already exists' }, { status: 409 });
      }
      updates.email = updates.email.trim().toLowerCase();
    }

    if (updates.name) {
      updates.name = updates.name.trim();
    }

    const success = await updateEngineer(id, updates);
    if (!success) {
      return NextResponse.json({ error: 'Engineer not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update engineer error:', error);
    return NextResponse.json({ error: 'Failed to update engineer' }, { status: 500 });
  }
}
