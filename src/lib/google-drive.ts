import { google } from 'googleapis';
import { Readable } from 'stream';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

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
 * Share a file/folder with the owner email so they can see it in their Drive.
 * Silently skips if DRIVE_OWNER_EMAIL is not set or sharing fails.
 */
async function shareWithOwner(fileId: string) {
  const ownerEmail = process.env.DRIVE_OWNER_EMAIL;
  if (!ownerEmail) return;

  const drive = getDrive();
  try {
    // Check if already shared to avoid duplicate permission errors
    const perms = await drive.permissions.list({
      fileId,
      fields: 'permissions(emailAddress,role)',
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
        sendNotificationEmail: true,
      });
      console.log(`Shared Drive folder with ${ownerEmail}`);
    }
  } catch (err) {
    // Don't fail uploads if sharing fails — log and continue
    console.warn('Could not share with owner:', err);
  }
}

/**
 * Get or create the "Vendor Invoice Portal" folder in Google Drive.
 * The folder is publicly readable so file links work without auth,
 * and shared with DRIVE_OWNER_EMAIL so the admin can browse files.
 */
export async function getOrCreateFolder(): Promise<string> {
  if (cachedFolderId) return cachedFolderId;

  const drive = getDrive();
  const folderName = 'Vendor Invoice Portal';

  // Check if folder already exists
  const existing = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  if (existing.data.files && existing.data.files.length > 0) {
    cachedFolderId = existing.data.files[0].id!;

    // Ensure owner has access (may have been created before this feature)
    await shareWithOwner(cachedFolderId);

    return cachedFolderId;
  }

  // Create the folder
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  const folderId = folder.data.id!;

  // Make folder publicly viewable (so file links work for approvers)
  await drive.permissions.create({
    fileId: folderId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  // Share folder with owner so they can browse files in their Drive
  await shareWithOwner(folderId);

  cachedFolderId = folderId;
  return folderId;
}

/**
 * Upload a single file to Google Drive.
 * Returns a publicly viewable URL:
 * - Images → direct image URL (works in <img> tags)
 * - PDFs/others → Google Drive view link
 */
export async function uploadFileToDrive(
  file: File
): Promise<{ url: string; fileName: string; fileId: string }> {
  const drive = getDrive();
  const folderId = await getOrCreateFolder();

  // Convert Web API File to Node.js Readable stream
  const buffer = Buffer.from(await file.arrayBuffer());
  const stream = Readable.from(buffer);

  const uniqueName = `${Date.now()}-${file.name}`;

  // Upload file to Google Drive
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
  });

  const fileId = uploaded.data.id!;

  // Make file publicly viewable (inherits from folder, but explicit is safer)
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  // Generate the appropriate viewable URL
  let url: string;
  if (file.type.startsWith('image/')) {
    // Direct image URL — works in <img src="..."> tags
    url = `https://lh3.googleusercontent.com/d/${fileId}`;
  } else {
    // Google Drive preview link — opens in browser
    url = `https://drive.google.com/file/d/${fileId}/view`;
  }

  return { url, fileName: file.name, fileId };
}
