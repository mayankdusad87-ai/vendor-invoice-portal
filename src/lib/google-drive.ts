import { google } from 'googleapis';
import { Readable } from 'stream';

const SCOPES = ['https://www.googleapis.com/auth/drive'];

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: SCOPES,
  });
}

function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

// Cache the folder ID in memory (resets on cold start, but that's fine)
let cachedFolderId: string | null = null;

/**
 * Get or find the upload folder.
 * - If DRIVE_FOLDER_ID is set → use it directly (preferred for Shared Drives)
 * - Otherwise → search for existing "Vendor Invoice Portal" folder owned by
 *   the service account and create one if missing
 *
 * No public permissions are set — files are served via the /api/files proxy.
 */
async function getUploadFolderId(): Promise<string> {
  // 1. Explicit env var takes priority
  if (process.env.DRIVE_FOLDER_ID) {
    return process.env.DRIVE_FOLDER_ID;
  }

  // 2. Cached from a previous call this cold start
  if (cachedFolderId) return cachedFolderId;

  const drive = getDrive();
  const folderName = 'Vendor Invoice Portal';

  // 3. Search for existing folder
  const existing = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (existing.data.files && existing.data.files.length > 0) {
    cachedFolderId = existing.data.files[0].id!;

    // Share with owner if configured
    await shareWithOwner(cachedFolderId);

    return cachedFolderId;
  }

  // 4. Create the folder (in the service account's Drive)
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  const folderId = folder.data.id!;

  // Share folder with owner so they can browse files in their Drive
  await shareWithOwner(folderId);

  cachedFolderId = folderId;
  return folderId;
}

/**
 * Share a file/folder with the owner email so they can see it in their Drive.
 * Silently skips if DRIVE_OWNER_EMAIL is not set or sharing fails.
 */
async function shareWithOwner(fileId: string) {
  const ownerEmail = process.env.DRIVE_OWNER_EMAIL;
  if (!ownerEmail) return;

  const drive = getDrive();
  try {
    const perms = await drive.permissions.list({
      fileId,
      fields: 'permissions(emailAddress,role)',
      supportsAllDrives: true,
    });

    const alreadyShared = perms.data.permissions?.some(
      (p) => p.emailAddress?.toLowerCase() === ownerEmail.toLowerCase()
    );

    if (!alreadyShared) {
      await drive.permissions.create({
        fileId,
        requestBody: {
          role: 'writer',
          type: 'user',
          emailAddress: ownerEmail,
        },
        sendNotificationEmail: false,
        supportsAllDrives: true,
      });
    }
  } catch (err) {
    // Don't fail uploads if sharing fails
    console.warn('Could not share with owner:', err);
  }
}

/**
 * Upload a single file to Google Drive.
 * Files are NOT made public — they are accessed via the /api/files proxy.
 */
export async function uploadFileToDrive(
  file: File
): Promise<{ url: string; fileName: string; fileId: string }> {
  const drive = getDrive();
  const folderId = await getUploadFolderId();

  // Convert Web API File to Node.js Readable stream
  const buffer = Buffer.from(await file.arrayBuffer());
  const stream = Readable.from(buffer);

  const uniqueName = `${Date.now()}-${file.name}`;

  // Upload file to Google Drive (supportsAllDrives for Shared Drive support)
  const uploaded = await drive.files.create({
    requestBody: {
      name: uniqueName,
      parents: [folderId],
    },
    media: {
      mimeType: file.type,
      body: stream,
    },
    fields: 'id',
    supportsAllDrives: true,
  });

  const fileId = uploaded.data.id!;

  // Return a proxy URL — files are served through /api/files/[fileId]
  // No public permissions are created; the proxy handles auth
  const url = `/api/files/${fileId}`;

  return { url, fileName: file.name, fileId };
}

/**
 * Download a file from Google Drive by its file ID.
 * Returns the file content as a Buffer along with metadata.
 * Used by the /api/files/[fileId] proxy endpoint.
 */
export async function downloadFileFromDrive(
  fileId: string
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const drive = getDrive();

  // Get file metadata
  const meta = await drive.files.get({
    fileId,
    fields: 'name,mimeType',
    supportsAllDrives: true,
  });

  const mimeType = meta.data.mimeType || 'application/octet-stream';
  const fileName = meta.data.name || 'download';

  // Download file content
  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );

  const buffer = Buffer.from(response.data as ArrayBuffer);

  return { buffer, mimeType, fileName };
}
