import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';

// ==================== JWT SECRET ====================

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set. Authentication will not work.');
  }
  return secret;
}

// ==================== TOKEN TYPES ====================

export interface VendorToken {
  type: 'vendor';
  vendorName: string;
  vendorId: string;
}

export interface ApproverToken {
  type: 'approver';
  approverName: string;
  approverId: string;
}

export interface EngineerToken {
  type: 'engineer';
  engineerName: string;
  engineerId: string;
  engineerEmail: string;
}

export interface AdminToken {
  type: 'admin';
  username: string;
}

export type TokenPayload = VendorToken | ApproverToken | EngineerToken | AdminToken;

// ==================== TOKEN SIGN / VERIFY ====================

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '24h' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

export function verifyAdminToken(token: string): AdminToken | null {
  const payload = verifyToken(token);
  if (payload && payload.type === 'admin') {
    return payload as AdminToken;
  }
  return null;
}

export function verifyVendorToken(token: string): VendorToken | null {
  const payload = verifyToken(token);
  if (payload && payload.type === 'vendor') {
    return payload as VendorToken;
  }
  return null;
}

export function verifyApproverToken(token: string): ApproverToken | null {
  const payload = verifyToken(token);
  if (payload && payload.type === 'approver') {
    return payload as ApproverToken;
  }
  return null;
}

// ==================== COOKIE HELPERS ====================

const AUTH_COOKIE_NAME = 'auth_token';

/**
 * Cookie options for secure HttpOnly auth.
 * - HttpOnly: JS cannot read the token (prevents XSS theft)
 * - Secure: only sent over HTTPS (true in production)
 * - SameSite=Lax: prevents CSRF from cross-origin form submissions
 * - Path=/: available to all routes
 */
function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 24 * 60 * 60, // 24 hours in seconds
  };
}

/**
 * Set the auth cookie on a NextResponse.
 */
export function setAuthCookie(response: NextResponse, token: string): NextResponse {
  const opts = getCookieOptions();
  response.cookies.set(AUTH_COOKIE_NAME, token, opts);
  return response;
}

/**
 * Clear the auth cookie (for logout).
 */
export function clearAuthCookie(response: NextResponse): NextResponse {
  response.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

/**
 * Read and verify the auth token from the HttpOnly cookie.
 * Returns the token payload or null if missing/invalid/expired.
 */
export function getSessionFromCookie(request: NextRequest): TokenPayload | null {
  const cookieToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!cookieToken) return null;
  return verifyToken(cookieToken);
}

// ==================== ROUTE AUTH HELPERS ====================
// These extract the authenticated identity from the cookie.
// The server is the source of truth — never trust client-supplied identity.

/**
 * Require any authenticated user. Returns payload or 401 response.
 */
export function requireAuth(request: NextRequest): TokenPayload | NextResponse {
  const session = getSessionFromCookie(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return session;
}

/**
 * Require an authenticated vendor/billing-engineer. Returns VendorToken or 401/403 response.
 */
export function requireVendor(request: NextRequest): VendorToken | NextResponse {
  const session = getSessionFromCookie(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.type !== 'vendor') {
    return NextResponse.json({ error: 'Forbidden: vendor role required' }, { status: 403 });
  }
  return session as VendorToken;
}

/**
 * Require an authenticated billing engineer. Returns EngineerToken or 401/403 response.
 */
export function requireEngineer(request: NextRequest): EngineerToken | NextResponse {
  const session = getSessionFromCookie(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.type !== 'engineer') {
    return NextResponse.json({ error: 'Forbidden: engineer role required' }, { status: 403 });
  }
  return session as EngineerToken;
}

/**
 * Require an authenticated engineer or vendor. Returns the payload or error response.
 * Used by routes where billing engineers submit invoices.
 */
export function requireEngineerOrVendor(request: NextRequest): (EngineerToken | VendorToken) | NextResponse {
  const session = getSessionFromCookie(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.type !== 'engineer' && session.type !== 'vendor') {
    return NextResponse.json({ error: 'Forbidden: engineer or vendor role required' }, { status: 403 });
  }
  return session as EngineerToken | VendorToken;
}

/**
 * Require an authenticated approver. Returns ApproverToken or 401/403 response.
 */
export function requireApprover(request: NextRequest): ApproverToken | NextResponse {
  const session = getSessionFromCookie(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.type !== 'approver') {
    return NextResponse.json({ error: 'Forbidden: approver role required' }, { status: 403 });
  }
  return session as ApproverToken;
}

/**
 * Require an authenticated admin. Returns AdminToken or 401/403 response.
 */
export function requireAdmin(request: NextRequest): AdminToken | NextResponse {
  const session = getSessionFromCookie(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 });
  }
  return session as AdminToken;
}

/**
 * Require admin or approver. Returns the payload or error response.
 */
export function requireAdminOrApprover(request: NextRequest): (AdminToken | ApproverToken) | NextResponse {
  const session = getSessionFromCookie(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.type !== 'admin' && session.type !== 'approver') {
    return NextResponse.json({ error: 'Forbidden: admin or approver role required' }, { status: 403 });
  }
  return session as AdminToken | ApproverToken;
}

/**
 * Type guard: checks if the return is a NextResponse (i.e., an error).
 */
export function isAuthError(result: TokenPayload | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
