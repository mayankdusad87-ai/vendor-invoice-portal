import { NextResponse } from 'next/server';
import { initializeSheetHeaders } from '@/lib/google-sheets';

export async function POST() {
  try {
    await initializeSheetHeaders();
    return NextResponse.json({ success: true, message: 'Sheet initialized successfully' });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to initialize sheet' },
      { status: 500 }
    );
  }
}
