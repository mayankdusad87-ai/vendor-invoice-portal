import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requireAuth, isAuthError } from '@/lib/auth';
import { getProjects, getActiveProjects, addProject, updateProject } from '@/lib/google-sheets';
import { sanitizeString } from '@/lib/security';

/**
 * GET /api/projects — get all projects (admin gets all, others get active only)
 */
export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  if (session.type === 'admin') {
    const projects = await getProjects();
    return NextResponse.json({ projects });
  }

  // Non-admin: return only active projects
  const projects = await getActiveProjects();
  return NextResponse.json({ projects });
}

/**
 * POST /api/projects — create a new project (admin only)
 */
export async function POST(request: NextRequest) {
  const session = requireAdmin(request);
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();
    const name = sanitizeString(body.name, 100);

    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Project name must be at least 2 characters' }, { status: 400 });
    }

    // Check for duplicate name
    const existing = await getProjects();
    if (existing.find((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: 'A project with this name already exists' }, { status: 400 });
    }

    const project = await addProject({ name, status: 'active' });
    return NextResponse.json({ success: true, project });
  } catch (error) {
    console.error('Create project error:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}

/**
 * PUT /api/projects — update a project (admin only)
 */
export async function PUT(request: NextRequest) {
  const session = requireAdmin(request);
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();
    const id = sanitizeString(body.id, 50);
    const name = body.name !== undefined ? sanitizeString(body.name, 100) : undefined;
    const status = body.status as 'active' | 'inactive' | undefined;

    if (!id) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    if (name !== undefined && (!name || name.length < 2)) {
      return NextResponse.json({ error: 'Project name must be at least 2 characters' }, { status: 400 });
    }

    if (status !== undefined && !['active', 'inactive'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const success = await updateProject(id, { name, status });
    if (!success) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update project error:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}
