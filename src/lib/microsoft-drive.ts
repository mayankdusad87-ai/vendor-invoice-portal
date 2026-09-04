/**
 * Microsoft SharePoint file storage via Microsoft Graph API.
 *
 * Uses client credentials (app-only) auth flow — no user login needed.
 * Files are uploaded to a SharePoint site's default document library
 * and served through the /api/files/[fileId] proxy.
 *
 * Required env vars:
 *   MS_TENANT_ID        — Azure AD tenant ID
 *   MS_CLIENT_ID        — App registration client ID
 *   MS_CLIENT_SECRET    — App registration client secret
 *   MS_SHAREPOINT_SITE  — SharePoint site hostname + path
 *                         e.g. "raghavgroup.sharepoint.com:/sites/VendorInvoicePortal"
 */

// ── Token cache ──────────────────────────────────────────────
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5-minute buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60 * 1000) {
    return cachedToken.accessToken;
  }

  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Missing Microsoft credentials. Set MS_TENANT_ID, MS_CLIENT_ID, and MS_CLIENT_SECRET.'
    );
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: clientId,
    scope: 'https://graph.microsoft.com/.default',
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get Microsoft access token: ${res.status} — ${err}`);
  }

  const data = await res.json();

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.accessToken;
}

// ── Site ID cache ────────────────────────────────────────────
let cachedSiteId: string | null = null;

function getSiteHost(): { hostname: string; sitePath: string } {
  const site = process.env.MS_SHAREPOINT_SITE;
  if (!site) {
    throw new Error(
      'MS_SHAREPOINT_SITE is not set. ' +
        'Set it to your SharePoint site path, e.g. "raghavgroup.sharepoint.com:/sites/VendorInvoicePortal"'
    );
  }
  // Expected format: "hostname:/sites/SiteName" or "hostname:/sites/SiteName:"
  const cleaned = site.replace(/:$/, '');
  const colonIdx = cleaned.indexOf(':');
  if (colonIdx === -1) {
    throw new Error(
      'MS_SHAREPOINT_SITE must include ":" separator, e.g. "raghavgroup.sharepoint.com:/sites/VendorInvoicePortal"'
    );
  }
  return {
    hostname: cleaned.substring(0, colonIdx),
    sitePath: cleaned.substring(colonIdx + 1),
  };
}

async function getSiteId(): Promise<string> {
  if (cachedSiteId) return cachedSiteId;

  const token = await getAccessToken();
  const { hostname, sitePath } = getSiteHost();

  // Microsoft Graph API: get site by hostname and path
  const url = `https://graph.microsoft.com/v1.0/sites/${hostname}:${sitePath}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get SharePoint site info: ${res.status} — ${err}`);
  }

  const site = await res.json();
  cachedSiteId = site.id;
  return cachedSiteId!;
}

// ── Upload folder name in the document library ───────────────
const UPLOAD_FOLDER = 'Invoices';

/**
 * Upload a single file to the SharePoint document library.
 * Files are NOT publicly accessible — they are served via /api/files proxy.
 *
 * For files ≤ 4MB: uses simple PUT upload.
 * For files > 4MB: uses upload session (chunked).
 */
export async function uploadFileToSharePoint(
  file: File
): Promise<{ url: string; fileName: string; fileId: string }> {
  const token = await getAccessToken();
  const siteId = await getSiteId();
  const buffer = Buffer.from(await file.arrayBuffer());
  const uniqueName = `${Date.now()}-${file.name}`;

  let itemId: string;

  if (buffer.length <= 4 * 1024 * 1024) {
    // Simple upload for files ≤ 4MB
    itemId = await simpleUpload(token, siteId, uniqueName, buffer, file.type);
  } else {
    // Chunked upload session for files > 4MB
    itemId = await sessionUpload(token, siteId, uniqueName, buffer);
  }

  // Proxy URL — files are served through /api/files/[fileId]
  const url = `/api/files/${itemId}`;

  return { url, fileName: file.name, fileId: itemId };
}

async function simpleUpload(
  token: string,
  siteId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${UPLOAD_FOLDER}/${fileName}:/content`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType || 'application/octet-stream',
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SharePoint upload failed: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return data.id;
}

async function sessionUpload(
  token: string,
  siteId: string,
  fileName: string,
  buffer: Buffer
): Promise<string> {
  // 1. Create upload session
  const sessionUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${UPLOAD_FOLDER}/${fileName}:/createUploadSession`;

  const sessionRes = await fetch(sessionUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      item: {
        '@microsoft.graph.conflictBehavior': 'rename',
        name: fileName,
      },
    }),
  });

  if (!sessionRes.ok) {
    const err = await sessionRes.text();
    throw new Error(`Failed to create upload session: ${sessionRes.status} — ${err}`);
  }

  const session = await sessionRes.json();
  const uploadUrl = session.uploadUrl;

  // 2. Upload in chunks (3.75MB each — must be multiple of 320KB)
  const chunkSize = 3_932_160; // 3.75MB = 3840 × 1024
  const totalSize = buffer.length;
  let offset = 0;
  let lastResponse: { id: string } | null = null;

  while (offset < totalSize) {
    const end = Math.min(offset + chunkSize, totalSize);
    const chunk = buffer.subarray(offset, end);

    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${offset}-${end - 1}/${totalSize}`,
      },
      body: new Uint8Array(chunk),
    });

    if (!chunkRes.ok && chunkRes.status !== 202) {
      const err = await chunkRes.text();
      throw new Error(`Chunk upload failed: ${chunkRes.status} — ${err}`);
    }

    const chunkData = await chunkRes.json();
    if (chunkData.id) {
      lastResponse = chunkData;
    }
    offset = end;
  }

  if (!lastResponse?.id) {
    throw new Error('Upload session completed but no item ID returned');
  }

  return lastResponse.id;
}

/**
 * Download a file from SharePoint by its drive item ID.
 * Returns the file content as a Buffer along with metadata.
 * Used by the /api/files/[fileId] proxy endpoint.
 */
export async function downloadFileFromSharePoint(
  fileId: string
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const token = await getAccessToken();
  const siteId = await getSiteId();

  // 1. Get file metadata
  const metaUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${fileId}`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!metaRes.ok) {
    const status = metaRes.status;
    if (status === 404) {
      const err = new Error('File not found') as Error & { code: number };
      err.code = 404;
      throw err;
    }
    const err = await metaRes.text();
    throw new Error(`Failed to get file metadata: ${status} — ${err}`);
  }

  const meta = await metaRes.json();
  const mimeType = meta.file?.mimeType || 'application/octet-stream';
  const fileName = meta.name || 'download';

  // 2. Download file content
  const downloadUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${fileId}/content`;
  const downloadRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'follow',
  });

  if (!downloadRes.ok) {
    throw new Error(`Failed to download file: ${downloadRes.status}`);
  }

  const arrayBuffer = await downloadRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return { buffer, mimeType, fileName };
}
