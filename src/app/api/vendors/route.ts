import { NextRequest, NextResponse } from 'next/server';
import { getVendors, getActiveVendors, addVendor, updateVendor } from '@/lib/google-sheets';
import { verifyAdminToken } from '@/lib/auth';
import {
  rateLimit, getRateLimitKey, rateLimitResponse, sanitizeString,
} from '@/lib/security';

// GET /api/vendors - get vendor list
export async function GET(request: NextRequest) {
  // Rate limit: 30 reads per minute per IP
  const key = getRateLimitKey(request, 'vendors-get');
  const check = rateLimit(key, { maxRequests: 30, windowMs: 60_000 });
  if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const onlyNames = request.nextUrl.searchParams.get('names') === 'true';

    // For vendor dropdown, return only active vendor names (no auth needed)
    if (onlyNames) {
      const vendors = await getActiveVendors();
      return NextResponse.json({
        vendors: vendors.map((v) => ({ id: v.id, name: v.name })),
      });
    }

    // Full vendor list requires admin auth
    if (!token || !verifyAdminToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const vendors = await getVendors();
    return NextResponse.json({ vendors });
  } catch (error) {
    console.error('Get vendors error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vendors' },
      { status: 500 }
    );
  }
}

// POST /api/vendors - add new vendor (admin only)
export async function POST(request: NextRequest) {
  // Rate limit: 10 creates per minute per IP
  const key = getRateLimitKey(request, 'vendors-create');
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
    const phone = sanitizeString(body.phone, 20);
    const email = sanitizeString(body.email, 100);

    if (!name) {
      return NextResponse.json(
        { error: 'Vendor name is required' },
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

    // Validate phone format if provided (digits, spaces, +, -)
    if (phone && !/^[\d\s+\-()]{5,20}$/.test(phone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // Validate PIN — required, 4-10 digits
    const pin = sanitizeString(body.pin, 20);
    if (!pin || !/^\d{4,10}$/.test(pin)) {
      return NextResponse.json(
        { error: 'PIN is required and must be 4 to 10 digits' },
        { status: 400 }
      );
    }

    // Check for duplicate vendor name
    const existingVendors = await getVendors();
    if (existingVendors.some((v) => v.name.toLowerCase() === name.toLowerCase() && v.status === 'active')) {
      return NextResponse.json(
        { error: 'A vendor with this name already exists' },
        { status: 400 }
      );
    }

    const vendor = await addVendor({
      name,
      pin,
      phone,
      email,
      status: 'active',
    });

    return NextResponse.json({ success: true, vendor });
  } catch (error) {
    console.error('Add vendor error:', error);
    return NextResponse.json(
      { error: 'Failed to add vendor' },
      { status: 500 }
    );
  }
}

// PUT /api/vendors - update vendor (admin only)
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
        { error: 'Vendor ID is required' },
        { status: 400 }
      );
    }

    // Build sanitized updates — only allow known fields
    const sanitizedUpdates: Record<string, string> = {};

    if (body.name !== undefined) {
      const name = sanitizeString(body.name, 100);
      if (!name) {
        return NextResponse.json({ error: 'Vendor name cannot be empty' }, { status: 400 });
      }
      sanitizedUpdates.name = name;
    }
    if (body.pin !== undefined) {
      const pin = sanitizeString(body.pin, 20);
      if (pin && !/^\d{4,10}$/.test(pin)) {
        return NextResponse.json({ error: 'PIN must be 4 to 10 digits' }, { status: 400 });
      }
      sanitizedUpdates.pin = pin;
    }
    if (body.phone !== undefined) {
      sanitizedUpdates.phone = sanitizeString(body.phone, 20);
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

    const success = await updateVendor(id, sanitizedUpdates);
    if (!success) {
      return NextResponse.json(
        { error: 'Vendor not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update vendor error:', error);
    return NextResponse.json(
      { error: 'Failed to update vendor' },
      { status: 500 }
    );
  }
}
