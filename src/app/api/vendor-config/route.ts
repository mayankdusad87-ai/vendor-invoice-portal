import { NextRequest, NextResponse } from 'next/server';
import { getVendorConfig, getActiveVendorTypes, getActiveVendorCategories, addVendorConfig, updateVendorConfig } from '@/lib/google-sheets';
import { requireAdmin, requireAuth, isAuthError } from '@/lib/auth';
import { rateLimit, getRateLimitKey, rateLimitResponse, sanitizeString } from '@/lib/security';

// GET /api/vendor-config — get vendor types and categories
export async function GET(request: NextRequest) {
  const key = getRateLimitKey(request, 'vendor-config-get');
  const check = rateLimit(key, { maxRequests: 30, windowMs: 60_000 });
  if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  try {
    const typeParam = request.nextUrl.searchParams.get('type');
    const activeOnly = request.nextUrl.searchParams.get('active') === 'true';

    if (activeOnly) {
      // For dropdowns: return only active items
      if (typeParam === 'vendor_type') {
        const types = await getActiveVendorTypes();
        return NextResponse.json({ items: types });
      }
      if (typeParam === 'vendor_category') {
        const categories = await getActiveVendorCategories();
        return NextResponse.json({ items: categories });
      }
      // Return both
      const types = await getActiveVendorTypes();
      const categories = await getActiveVendorCategories();
      return NextResponse.json({ types, categories });
    }

    // Full list requires admin
    const adminCheck = requireAdmin(request);
    if (isAuthError(adminCheck)) return adminCheck;

    const configType = typeParam === 'vendor_type' || typeParam === 'vendor_category' ? typeParam : undefined;
    const items = await getVendorConfig(configType);
    return NextResponse.json({ items });
  } catch (error) {
    console.error('Get vendor config error:', error);
    return NextResponse.json({ error: 'Failed to fetch vendor config' }, { status: 500 });
  }
}

// POST /api/vendor-config — add a vendor type or category (admin only)
export async function POST(request: NextRequest) {
  const key = getRateLimitKey(request, 'vendor-config-create');
  const check = rateLimit(key, { maxRequests: 10, windowMs: 60_000 });
  if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

  const session = requireAdmin(request);
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();
    const value = sanitizeString(body.value, 100);
    const type = body.type;

    if (!value || value.length < 2) {
      return NextResponse.json({ error: 'Value must be at least 2 characters' }, { status: 400 });
    }
    if (type !== 'vendor_type' && type !== 'vendor_category') {
      return NextResponse.json({ error: 'Type must be vendor_type or vendor_category' }, { status: 400 });
    }

    // Check for duplicates
    const existing = await getVendorConfig(type);
    if (existing.some((i) => i.value.toLowerCase() === value.toLowerCase() && i.status === 'active')) {
      return NextResponse.json({ error: 'This value already exists' }, { status: 400 });
    }

    const item = await addVendorConfig({ value, type });
    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error('Add vendor config error:', error);
    return NextResponse.json({ error: 'Failed to add config item' }, { status: 500 });
  }
}

// PUT /api/vendor-config — update a vendor type or category (admin only)
export async function PUT(request: NextRequest) {
  const session = requireAdmin(request);
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();
    const id = sanitizeString(body.id, 50);

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const updates: Partial<{ value: string; status: 'active' | 'inactive' }> = {};

    if (body.value !== undefined) {
      const value = sanitizeString(body.value, 100);
      if (!value || value.length < 2) {
        return NextResponse.json({ error: 'Value must be at least 2 characters' }, { status: 400 });
      }
      updates.value = value;
    }
    if (body.status !== undefined) {
      if (!['active', 'inactive'].includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updates.status = body.status;
    }

    const success = await updateVendorConfig(id, updates);
    if (!success) {
      return NextResponse.json({ error: 'Config item not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update vendor config error:', error);
    return NextResponse.json({ error: 'Failed to update config item' }, { status: 500 });
  }
}
