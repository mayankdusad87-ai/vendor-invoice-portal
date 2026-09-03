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

/**
 * Get the upload folder ID from environment.
 * This should be a folder in your Google Workspace Shared Drive
 * that the service account has been granted access to.
 */
function getFolderId(): string {
  const folderId = process.env.DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error(
      'DRIVE_FOLDER_ID environment variable is not set. ' +
      'Set it to a Google Drive / Shared Drive folder ID.'
    );
  }
  return folderId;
}

/**
 * Upload a single file to the configured Google Drive folder.
 * Files are NOT made public — they are accessed via the /api/files proxy.
 */
export async function uploadFileToDrive(
  file: File
): Promise<{ url: string; fileName: string; fileId: string }> {
  const drive = getDrive();
  const folderId = getFolderId();

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
