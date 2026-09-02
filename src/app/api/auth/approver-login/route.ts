import { NextRequest, NextResponse } from 'next/server';
import { getActiveApprovers } from '@/lib/google-sheets';
import { signToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { approverName, pin } = await request.json();

    if (!approverName || !pin) {
      return NextResponse.json(
        { error: 'Approver name and PIN are required' },
        { status: 400 }
      );
    }

    const approvers = await getActiveApprovers();
    const approver = approvers.find(
      (a) => a.name === approverName && a.pin === pin
    );

    if (!approver) {
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

    return NextResponse.json({
      success: true,
      token,
      approver: { id: approver.id, name: approver.name },
    });
  } catch (error) {
    console.error('Approver login error:', error);
    return NextResponse.json(
      { error: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}
