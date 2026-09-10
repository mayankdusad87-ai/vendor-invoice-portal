import { NextRequest, NextResponse } from 'next/server';
import { getActiveAccountsMembers, getUserProjects } from '@/lib/google-sheets';
import { signToken, setAuthCookie } from '@/lib/auth';
import { rateLimit, getRateLimitKey, rateLimitResponse } from '@/lib/security';

export async function POST(request: NextRequest) {
  // Rate limit: 5 login attempts per minute per IP
  const key = getRateLimitKey(request, 'accounts-login');
  const check = rateLimit(key, { maxRequests: 5, windowMs: 60_000 });
  if (!check.allowed) {
    return rateLimitResponse(check.retryAfterMs!);
  }

  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (email.length > 200 || password.length > 100) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const members = await getActiveAccountsMembers();
    const member = members.find(
      (m) => m.email.toLowerCase() === email.toLowerCase() && m.password === password
    );

    if (!member) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Fetch project access for this accounts member
    const projects = await getUserProjects(member.id, 'accounts');

    const token = signToken({
      type: 'accounts',
      accountsName: member.name,
      accountsId: member.id,
      accountsEmail: member.email,
      projects,
    });

    const response = NextResponse.json({
      success: true,
      member: { id: member.id, name: member.name, projects },
    });
    setAuthCookie(response, token);
    return response;
  } catch {
    return NextResponse.json(
      { error: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}
