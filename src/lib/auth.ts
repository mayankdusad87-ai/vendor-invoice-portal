import jwt from 'jsonwebtoken';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set. Authentication will not work.');
  }
  return secret;
}

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

export interface AdminToken {
  type: 'admin';
  username: string;
}

export type TokenPayload = VendorToken | ApproverToken | AdminToken;

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
