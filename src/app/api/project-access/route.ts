import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/auth';
import { getProjectAccess, setUserProjectAccess, getProjectMembers } from '@/lib/google-sheets';
import { sanitizeString } from '@/lib/security';

/**
 * GET /api/project-access — get all project access mappings (admin only)
 * Optional query: ?projectId=XXX or ?userId=XXX&userType=engineer|accounts
 */
export async function GET(request: NextRequest) {
  const session = requireAdmin(request);
  if (isAuthError(session)) return session;

  try {
    const projectId = request.nextUrl.searchParams.get('projectId');
    const userId = request.nextUrl.searchParams.get('userId');

    if (projectId) {
      const members = await getProjectMembers(projectId);
      return NextResponse.json({ access: members });
    }

    const allAccess = await getProjectAccess();

    if (userId) {
      const userAccess = allAccess.filter((a) => a.userId === userId);
      return NextResponse.json({ access: userAccess });
    }

    return NextResponse.json({ access: allAccess });
  } catch (error) {
    console.error('Get project access error:', error);
    return NextResponse.json({ error: 'Failed to fetch project access' }, { status: 500 });
  }
}

/**
 * PUT /api/project-access — set project assignments for a user (admin only)
 * Body: { userId, userName, userType, projects: [{ projectId, projectName }] }
 */
export async function PUT(request: NextRequest) {
  const session = requireAdmin(request);
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();
    const userId = sanitizeString(body.userId, 50);
    const userName = sanitizeString(body.userName, 100);
    const userType = body.userType as 'engineer' | 'accounts';
    const projects = body.projects as { projectId: string; projectName: string }[];

    if (!userId || !userName || !userType) {
      return NextResponse.json({ error: 'userId, userName, and userType are required' }, { status: 400 });
    }

    if (!['engineer', 'accounts'].includes(userType)) {
      return NextResponse.json({ error: 'userType must be "engineer" or "accounts"' }, { status: 400 });
    }

    if (!Array.isArray(projects)) {
      return NextResponse.json({ error: 'projects must be an array' }, { status: 400 });
    }

    await setUserProjectAccess(userId, userName, userType, projects);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Set project access error:', error);
    return NextResponse.json({ error: 'Failed to update project access' }, { status: 500 });
  }
}
