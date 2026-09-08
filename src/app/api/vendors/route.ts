import { NextRequest, NextResponse } from 'next/server';
import { getVendors, getActiveVendors, addVendor, updateVendor } from '@/lib/google-sheets';
import { requireAdmin, isAuthError } from '@/lib/auth';
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
    const onlyNames = request.nextUrl.searchParams.get('names') === 'true';

    // For dropdowns: return only active vendor names (id + name only)
    if (onlyNames) {
      const vendors = await getActiveVendors();
      return NextResponse.json({
        vendors: vendors.map((v) => ({ id: v.id, name: v.name })),
      });
    }

    // Full vendor list requires admin auth
    const session = requireAdmin(request);
    if (isAuthError(session)) return session;

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

  // Admin only
  const session = requireAdmin(request);
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();

    // Sanitize inputs
    const name = sanitizeString(body.name, 100);
    const phone = sanitizeString(body.phone, 20);
    const email = sanitizeString(body.email, 100);
    const gstin = sanitizeString(body.gstin, 20);
    const state = sanitizeString(body.state, 50);
    const address = sanitizeString(body.address, 300);
    const vendorType = sanitizeString(body.vendorType, 50);
    const category = sanitizeString(body.category, 50);

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

    // Validate GSTIN format if provided (15-char alphanumeric)
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.toUpperCase())) {
      return NextResponse.json(
        { error: 'Invalid GSTIN format (expected 15-character GST number)' },
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
      phone,
      email,
      gstin: gstin ? gstin.toUpperCase() : '',
      state,
      address,
      vendorType,
      category,
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
  // Admin only
  const session = requireAdmin(request);
  if (isAuthError(session)) return session;

  try {
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
    if (body.gstin !== undefined) {
      const gstin = sanitizeString(body.gstin, 20);
      if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.toUpperCase())) {
        return NextResponse.json({ error: 'Invalid GSTIN format' }, { status: 400 });
      }
      sanitizedUpdates.gstin = gstin ? gstin.toUpperCase() : '';
    }
    if (body.state !== undefined) {
      sanitizedUpdates.state = sanitizeString(body.state, 50);
    }
    if (body.address !== undefined) {
      sanitizedUpdates.address = sanitizeString(body.address, 300);
    }
    if (body.vendorType !== undefined) {
      sanitizedUpdates.vendorType = sanitizeString(body.vendorType, 50);
    }
    if (body.category !== undefined) {
      sanitizedUpdates.category = sanitizeString(body.category, 50);
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
