import { NextRequest, NextResponse } from 'next/server';
import { getActiveEngineers } from '@/lib/google-sheets';
import { signToken, setAuthCookie } from '@/lib/auth';
import { rateLimit, getRateLimitKey, rateLimitResponse } from '@/lib/security';

export async function POST(request: NextRequest) {
  // Rate limit: 5 login attempts per minute per IP
  const key = getRateLimitKey(request, 'engineer-login');
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

    // Length limits
    if (email.length > 200 || password.length > 100) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const engineers = await getActiveEngineers();
    const engineer = engineers.find(
      (e) => e.email.toLowerCase() === email.toLowerCase() && e.password === password
    );

    if (!engineer) {
      // Generic error — don't reveal whether email or password was wrong
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const token = signToken({
      type: 'engineer',
      engineerName: engineer.name,
      engineerId: engineer.id,
      engineerEmail: engineer.email,
    });

    // Set HttpOnly cookie — the client never sees the JWT
    const response = NextResponse.json({
      success: true,
      engineer: { id: engineer.id, name: engineer.name },
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
