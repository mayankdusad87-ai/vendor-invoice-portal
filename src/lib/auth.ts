import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

export interface VendorToken {
  type: 'vendor';
  vendorName: string;
  vendorId: string;
}

export interface AdminToken {
  type: 'admin';
  username: string;
}

export type TokenPayload = VendorToken | AdminToken;

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
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
