import { NextRequest, NextResponse } from 'next/server';
import { getActiveVendors } from '@/lib/google-sheets';
import { signToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { vendorName, pin } = await request.json();

    if (!vendorName || !pin) {
      return NextResponse.json(
        { error: 'Vendor name and PIN are required' },
        { status: 400 }
      );
    }

    const vendors = await getActiveVendors();
    const vendor = vendors.find(
      (v) => v.name === vendorName && v.pin === pin
    );

    if (!vendor) {
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

    return NextResponse.json({
      success: true,
      token,
      vendor: { id: vendor.id, name: vendor.name },
    });
  } catch (error) {
    console.error('Vendor login error:', error);
    return NextResponse.json(
      { error: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}
