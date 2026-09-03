import { NextRequest, NextResponse } from 'next/server';
import { getActiveApprovers } from '@/lib/google-sheets';
import { signToken, setAuthCookie } from '@/lib/auth';
import { rateLimit, getRateLimitKey, rateLimitResponse } from '@/lib/security';

export async function POST(request: NextRequest) {
  // Rate limit: 5 login attempts per minute per IP
  const key = getRateLimitKey(request, 'approver-login');
  const check = rateLimit(key, { maxRequests: 5, windowMs: 60_000 });
  if (!check.allowed) {
    return rateLimitResponse(check.retryAfterMs!);
  }

  try {
    const body = await request.json();
    const { approverName, pin } = body;

    if (!approverName || !pin || typeof approverName !== 'string' || typeof pin !== 'string') {
      return NextResponse.json(
        { error: 'Approver name and PIN are required' },
        { status: 400 }
      );
    }

    // Length limits
    if (approverName.length > 100 || pin.length > 20) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const approvers = await getActiveApprovers();
    const approver = approvers.find(
      (a) => a.name === approverName && a.pin === pin
    );

    if (!approver) {
      // Generic error — don't reveal whether name or PIN was wrong
      return NextResponse.json(
        { error: 'Invalid approver name or PIN' },
        { status: 401 }
      );
    }

    const token = signToken({
      type: 'approver',
      approverName: approver.name,
      approverId: approver.id,
    });

    // Set HttpOnly cookie — the client never sees the JWT
    const response = NextResponse.json({
      success: true,
      approver: { id: approver.id, name: approver.name },
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
