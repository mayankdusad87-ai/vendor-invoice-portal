import { NextRequest, NextResponse } from 'next/server';
import { getVendors, getActiveVendors, addVendor, updateVendor } from '@/lib/google-sheets';
import { verifyAdminToken } from '@/lib/auth';

// GET /api/vendors - get vendor list
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const onlyNames = request.nextUrl.searchParams.get('names') === 'true';

    // For vendor login dropdown, return only active vendor names (no auth needed)
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
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !verifyAdminToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, pin, phone, email } = body;

    if (!name || !pin) {
      return NextResponse.json(
        { error: 'Vendor name and PIN are required' },
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
      phone: phone || '',
      email: email || '',
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
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Vendor ID is required' },
        { status: 400 }
      );
    }

    const success = await updateVendor(id, updates);
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
