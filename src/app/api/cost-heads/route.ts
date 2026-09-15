import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { getCostHeads, getCostHeadGroups, addCostHead, toggleCostHead, COST_TYPES } from '@/lib/cost-heads';
import { sanitizeString } from '@/lib/security';

/**
 * GET /api/cost-heads
 *
 * Returns cost heads for dropdown population.
 * ?grouped=true → returns grouped by category (for cascading dropdowns)
 * ?all=true → returns all (including inactive), admin only
 * Default → returns active grouped view
 *
 * Accessible to all authenticated roles (engineers need it for the submission form).
 */
export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  const grouped = request.nextUrl.searchParams.get('grouped') !== 'false';
  const includeAll = request.nextUrl.searchParams.get('all') === 'true';

  // Only admin can see inactive cost heads
  if (includeAll && session.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    if (includeAll) {
      const all = await getCostHeads();
      return NextResponse.json({ costHeads: all, costTypes: COST_TYPES });
    }

    if (grouped) {
      const groups = await getCostHeadGroups();
      return NextResponse.json({ groups, costTypes: COST_TYPES });
    }

    const all = await getCostHeads();
    const active = all.filter((ch) => ch.isActive);
    return NextResponse.json({ costHeads: active, costTypes: COST_TYPES });
  } catch (error) {
    console.error('Failed to fetch cost heads:', error);
    return NextResponse.json({ error: 'Failed to fetch cost heads' }, { status: 500 });
  }
}

/**
 * POST /api/cost-heads
 *
 * Add a new cost head. Admin only.
 * Body: { category: string, subCategory: string }
 */
export async function POST(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  if (session.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const category = sanitizeString(body.category, 50);
    const subCategory = sanitizeString(body.subCategory, 100);

    if (!category || !subCategory) {
      return NextResponse.json({ error: 'Category and sub-category are required' }, { status: 400 });
    }

    // Check for duplicates
    const existing = await getCostHeads();
    const duplicate = existing.find(
      (ch) => ch.category.toUpperCase() === category.toUpperCase() &&
              ch.subCategory.toLowerCase() === subCategory.toLowerCase()
    );
    if (duplicate) {
      return NextResponse.json(
        { error: `"${category} → ${subCategory}" already exists${!duplicate.isActive ? ' (inactive — reactivate it instead)' : ''}` },
        { status: 409 }
      );
    }

    const createdBy = session.type === 'admin' ? session.username : 'admin';
    const costHead = await addCostHead(category, subCategory, createdBy);

    return NextResponse.json({ success: true, costHead });
  } catch (error) {
    console.error('Failed to add cost head:', error);
    return NextResponse.json({ error: 'Failed to add cost head' }, { status: 500 });
  }
}

/**
 * PUT /api/cost-heads
 *
 * Toggle active/inactive status of a cost head. Admin only.
 * Body: { id: string, isActive: boolean }
 */
export async function PUT(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  if (session.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, isActive } = body;

    if (!id || typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'id and isActive are required' }, { status: 400 });
    }

    const updated = await toggleCostHead(id, isActive);
    if (!updated) {
      return NextResponse.json({ error: 'Cost head not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update cost head:', error);
    return NextResponse.json({ error: 'Failed to update cost head' }, { status: 500 });
  }
}
