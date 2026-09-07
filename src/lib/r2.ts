/**
 * Cloudflare R2 storage client — S3-compatible API.
 *
 * Used for storing invoice work photos with versioned directories:
 *   invoices/{invoiceId}/v{version}/photo-{N}.{ext}
 *
 * Also used for general file uploads (invoice docs, measurement sheets):
 *   files/{invoiceId}/{filename}
 *
 * Required env vars:
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME
 *   R2_ENDPOINT
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

// ── S3 client (lazily initialized) ──────────────────────────────

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;

  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 env vars missing. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.'
    );
  }

  _client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error('R2_BUCKET_NAME is not set');
  return bucket;
}

// ── Upload ──────────────────────────────────────────────────────

/**
 * Upload a file to R2.
 * @param key   Object key (path), e.g. "invoices/INV123/v1/photo-1.jpg"
 * @param body  File content as Buffer or Uint8Array
 * @param contentType  MIME type, e.g. "image/jpeg"
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

// ── Download ────────────────────────────────────────────────────

/**
 * Download an object from R2 by key.
 * Returns { buffer, contentType }.
 */
export async function downloadFromR2(
  key: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const client = getClient();
  const result = await client.send(
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
    })
  );

  const stream = result.Body;
  if (!stream) throw new Error(`Empty response for key: ${key}`);

  // Convert stream to Buffer
  const chunks: Uint8Array[] = [];
  // @ts-expect-error — R2/S3 Body is a Readable stream
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const buffer = Buffer.concat(chunks);

  return {
    buffer,
    contentType: result.ContentType || 'application/octet-stream',
  };
}

// ── List objects ────────────────────────────────────────────────

/**
 * List all object keys under a prefix.
 */
export async function listR2Objects(prefix: string): Promise<string[]> {
  const client = getClient();
  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: getBucket(),
      Prefix: prefix,
    })
  );
  return (result.Contents || [])
    .map((obj) => obj.Key!)
    .filter(Boolean);
}

// ── Photo versioning helpers ────────────────────────────────────

/**
 * Find the highest version number for an invoice's photos.
 * Returns 0 if no photos exist yet.
 */
export async function getLatestPhotoVersion(invoiceId: string): Promise<number> {
  const keys = await listR2Objects(`invoices/${invoiceId}/`);
  let maxVersion = 0;
  for (const key of keys) {
    const match = key.match(/\/v(\d+)\//);
    if (match) {
      const v = parseInt(match[1], 10);
      if (v > maxVersion) maxVersion = v;
    }
  }
  return maxVersion;
}

/**
 * List photos for a specific version of an invoice.
 */
export async function listPhotosInVersion(
  invoiceId: string,
  version: number
): Promise<string[]> {
  return listR2Objects(`invoices/${invoiceId}/v${version}/`);
}

/**
 * Get all versions with their photo keys for an invoice.
 * Returns sorted by version descending (newest first).
 */
export async function getAllPhotoVersions(
  invoiceId: string
): Promise<{ version: number; keys: string[] }[]> {
  const allKeys = await listR2Objects(`invoices/${invoiceId}/`);
  const versionMap = new Map<number, string[]>();

  for (const key of allKeys) {
    const match = key.match(/\/v(\d+)\//);
    if (match) {
      const v = parseInt(match[1], 10);
      if (!versionMap.has(v)) versionMap.set(v, []);
      versionMap.get(v)!.push(key);
    }
  }

  return Array.from(versionMap.entries())
    .sort((a, b) => b[0] - a[0]) // newest first
    .map(([version, keys]) => ({ version, keys: keys.sort() }));
}

// ── MIME helpers ─────────────────────────────────────────────────

const ALLOWED_PHOTO_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
]);

const ALLOWED_FILE_TYPES = new Set([
  ...ALLOWED_PHOTO_TYPES,
  'image/webp',
  'image/jpg',
  'application/pdf',
]);

/**
 * Max photo size: 5 MB.
 */
export const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

/**
 * Max photos per upload: 5.
 */
export const MAX_PHOTOS_PER_UPLOAD = 5;

/**
 * Max general file size: 10 MB.
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Check if a MIME type is an allowed photo type.
 */
export function isAllowedPhotoType(mimeType: string): boolean {
  return ALLOWED_PHOTO_TYPES.has(mimeType);
}

/**
 * Check if a MIME type is an allowed file type (photos + PDF).
 */
export function isAllowedFileType(mimeType: string): boolean {
  return ALLOWED_FILE_TYPES.has(mimeType);
}

/**
 * Get a file extension from a MIME type.
 */
export function extFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  return map[mimeType] || 'bin';
}
