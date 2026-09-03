import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';

/**
 * GET /api/auth/me — return the current user's identity from the HttpOnly cookie.
 * The client never sees or stores the JWT; it calls this to learn who it is.
 */
export async function GET(request: NextRequest) {
  const session = getSessionFromCookie(request);

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // Return identity info based on role — never expose the raw token
  if (session.type === 'vendor') {
    return NextResponse.json({
      authenticated: true,
      role: 'vendor',
      vendorName: session.vendorName,
      vendorId: session.vendorId,
    });
  }

  if (session.type === 'approver') {
    return NextResponse.json({
      authenticated: true,
      role: 'approver',
      approverName: session.approverName,
      approverId: session.approverId,
    });
  }

  if (session.type === 'admin') {
    return NextResponse.json({
      authenticated: true,
      role: 'admin',
      username: session.username,
    });
  }

  return NextResponse.json({ authenticated: false }, { status: 401 });
}
