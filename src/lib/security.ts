/**
 * Security utilities — rate limiting, input sanitization, validation
 */

// ==================== RATE LIMITER ====================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory rate limit store (resets on cold start — fine for Vercel serverless)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
function cleanupExpired() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 60 seconds
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpired, 60_000);
}

/**
 * Check if a request should be rate-limited.
 * Returns { allowed: true } or { allowed: false, retryAfterMs }.
 */
export function rateLimit(
  key: string,
  options: { maxRequests: number; windowMs: number }
): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    // First request or window expired — reset
    rateLimitStore.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true };
  }

  if (entry.count >= options.maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * Get a rate-limit key from a request (IP-based).
 */
export function getRateLimitKey(request: Request, prefix: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return `${prefix}:${ip}`;
}


// ==================== INPUT SANITIZATION ====================

/**
 * Strip HTML tags and limit string length to prevent XSS and abuse.
 */
export function sanitizeString(input: unknown, maxLength = 500): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '')           // Strip HTML tags
    .replace(/[<>"'`;(){}]/g, '')      // Remove dangerous chars
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitize a numeric string (amount).
 */
export function sanitizeAmount(input: unknown): string {
  if (typeof input !== 'string' && typeof input !== 'number') return '0.00';
  const num = parseFloat(String(input));
  if (isNaN(num) || num <= 0 || num > 999_999_999) return '0.00';
  return num.toFixed(2);
}

/**
 * Validate and sanitize an ISO date string.
 */
export function sanitizeDate(input: unknown): string {
  if (typeof input !== 'string') return '';
  // Must match YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return '';
  const date = new Date(input);
  if (isNaN(date.getTime())) return '';
  return input;
}

/**
 * Validate that a vendor name exists in the system.
 * Call this before trusting user-supplied vendor names.
 */
export function isValidVendorName(name: string, activeVendorNames: string[]): boolean {
  return activeVendorNames.some(
    (v) => v.toLowerCase() === name.toLowerCase()
  );
}


// ==================== RESPONSE HELPERS ====================

/**
 * Return a 429 Too Many Requests response.
 */
export function rateLimitResponse(retryAfterMs: number) {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    }
  );
}

/**
 * Validate that the request body is JSON and within size limits.
 * Returns parsed body or null.
 */
export async function parseJsonBody(
  request: Request,
  maxSizeBytes = 50_000 // 50KB max for JSON bodies
): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) return null;

  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > maxSizeBytes) return null;

  try {
    const body = await request.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}
