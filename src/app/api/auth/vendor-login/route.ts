import { NextRequest, NextResponse } from 'next/server';
import { getActiveVendors } from '@/lib/google-sheets';
import { signToken, setAuthCookie } from '@/lib/auth';
import { rateLimit, getRateLimitKey, rateLimitResponse } from '@/lib/security';

export async function POST(request: NextRequest) {
  // Rate limit: 5 login attempts per minute per IP
  const key = getRateLimitKey(request, 'vendor-login');
  const check = rateLimit(key, { maxRequests: 5, windowMs: 60_000 });
  if (!check.allowed) {
    return rateLimitResponse(check.retryAfterMs!);
  }

  try {
    const body = await request.json();
    const { vendorName, pin } = body;

    if (!vendorName || !pin || typeof vendorName !== 'string' || typeof pin !== 'string') {
      return NextResponse.json(
        { error: 'Vendor name and PIN are required' },
        { status: 400 }
      );
    }

    // Length limits
    if (vendorName.length > 100 || pin.length > 20) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const vendors = await getActiveVendors();
    const vendor = vendors.find(
      (v) => v.name === vendorName && v.pin === pin
    );

    if (!vendor) {
      // Generic error — don't reveal whether name or PIN was wrong
      return NextResponse.json(
        { error: 'Invalid vendor name or PIN' },
        { status: 401 }
      );
    }

    const token = signToken({
      type: 'vendor',
      vendorName: vendor.name,
      vendorId: vendor.id,
    });

    // Set HttpOnly cookie — the client never sees the JWT
    const response = NextResponse.json({
      success: true,
      vendor: { id: vendor.id, name: vendor.name },
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
