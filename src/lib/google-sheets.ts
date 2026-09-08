import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getAuth() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: SCOPES,
  });
  return auth;
}

function getSheets() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

// ==================== VENDORS ====================

export interface Vendor {
  id: string;
  name: string;
  phone: string;
  email: string;
  gstin: string;        // Col E — GST number
  state: string;        // Col F
  address: string;      // Col G
  vendorType: string;   // Col H — e.g. Material Vendor, Labour Vendor
  category: string;     // Col I — configurable from admin
  status: 'active' | 'inactive'; // Col J
  createdAt: string;    // Col K
}

export async function getVendors(): Promise<Vendor[]> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Vendors!A2:K',
  });

  const rows = response.data.values || [];
  return rows.map((row) => ({
    id: row[0] || '',
    name: row[1] || '',
    phone: row[2] || '',
    email: row[3] || '',
    gstin: row[4] || '',
    state: row[5] || '',
    address: row[6] || '',
    vendorType: row[7] || '',
    category: row[8] || '',
    status: (row[9] as 'active' | 'inactive') || 'active',
    createdAt: row[10] || '',
  }));
}

export async function getActiveVendors(): Promise<Vendor[]> {
  const vendors = await getVendors();
  return vendors.filter((v) => v.status === 'active');
}

export async function addVendor(vendor: Omit<Vendor, 'id' | 'createdAt'>): Promise<Vendor> {
  const sheets = getSheets();
  const id = `V${Date.now()}`;
  const createdAt = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Vendors!A:K',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        id, vendor.name, vendor.phone, vendor.email,
        vendor.gstin || '', vendor.state || '', vendor.address || '',
        vendor.vendorType || '', vendor.category || '',
        vendor.status, createdAt,
      ]],
    },
  });

  return { ...vendor, id, createdAt };
}

export async function updateVendor(id: string, updates: Partial<Vendor>): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Vendors!A2:K',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const currentRow = rows[rowIndex];
  const updatedRow = [
    id,
    updates.name ?? currentRow[1],
    updates.phone ?? currentRow[2],
    updates.email ?? currentRow[3],
    updates.gstin ?? currentRow[4] ?? '',
    updates.state ?? currentRow[5] ?? '',
    updates.address ?? currentRow[6] ?? '',
    updates.vendorType ?? currentRow[7] ?? '',
    updates.category ?? currentRow[8] ?? '',
    updates.status ?? currentRow[9],
    currentRow[10],
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Vendors!A${rowIndex + 2}:K${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [updatedRow] },
  });

  return true;
}

// ==================== VENDOR CONFIG (Types & Categories) ====================

export interface VendorConfigItem {
  id: string;
  value: string;
  type: 'vendor_type' | 'vendor_category';
  status: 'active' | 'inactive';
  createdAt: string;
}

async function ensureVendorConfigSheet(): Promise<void> {
  const sheets = getSheets();
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'VendorConfig!A1:A1',
    });
  } catch {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: 'VendorConfig' } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: 'VendorConfig!A1:E1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['ID', 'Value', 'Type', 'Status', 'Created At']],
        },
      });
    } catch {
      // Sheet may already exist from a concurrent request
    }
  }
}

export async function getVendorConfig(configType?: 'vendor_type' | 'vendor_category'): Promise<VendorConfigItem[]> {
  await ensureVendorConfigSheet();
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'VendorConfig!A2:E',
  });

  const rows = response.data.values || [];
  const items = rows.map((row) => ({
    id: row[0] || '',
    value: row[1] || '',
    type: (row[2] as VendorConfigItem['type']) || 'vendor_type',
    status: (row[3] as 'active' | 'inactive') || 'active',
    createdAt: row[4] || '',
  }));

  if (configType) return items.filter((i) => i.type === configType);
  return items;
}

export async function getActiveVendorTypes(): Promise<VendorConfigItem[]> {
  const items = await getVendorConfig('vendor_type');
  return items.filter((i) => i.status === 'active');
}

export async function getActiveVendorCategories(): Promise<VendorConfigItem[]> {
  const items = await getVendorConfig('vendor_category');
  return items.filter((i) => i.status === 'active');
}

export async function addVendorConfig(item: { value: string; type: 'vendor_type' | 'vendor_category' }): Promise<VendorConfigItem> {
  await ensureVendorConfigSheet();
  const sheets = getSheets();
  const id = `VC${Date.now()}`;
  const createdAt = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'VendorConfig!A:E',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[id, item.value, item.type, 'active', createdAt]],
    },
  });

  return { id, value: item.value, type: item.type, status: 'active', createdAt };
}

export async function updateVendorConfig(id: string, updates: Partial<VendorConfigItem>): Promise<boolean> {
  await ensureVendorConfigSheet();
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'VendorConfig!A2:E',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const currentRow = rows[rowIndex];
  const updatedRow = [
    id,
    updates.value ?? currentRow[1],
    currentRow[2], // type doesn't change
    updates.status ?? currentRow[3],
    currentRow[4],
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `VendorConfig!A${rowIndex + 2}:E${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [updatedRow] },
  });

  return true;
}

export async function deleteVendor(id: string): Promise<boolean> {
  return updateVendor(id, { status: 'inactive' });
}

// ==================== BILLING ENGINEERS ====================

export interface Engineer {
  id: string;
  name: string;
  email: string;
  password: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

/**
 * Ensure the Engineers sheet exists with proper headers.
 * Called automatically before any engineer read/write.
 */
async function ensureEngineersSheet(): Promise<void> {
  const sheets = getSheets();
  try {
    // Try to read headers — if the sheet doesn't exist this throws
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Engineers!A1:A1',
    });
  } catch {
    // Sheet doesn't exist — create it and set headers
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: 'Engineers' } } }],
        },
      });
    } catch {
      // Sheet might already exist from a race condition — ignore
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Engineers!A1:F1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['ID', 'Name', 'Email', 'Password', 'Status', 'Created At']],
      },
    });
  }
}

export async function getEngineers(): Promise<Engineer[]> {
  await ensureEngineersSheet();
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Engineers!A2:F',
  });

  const rows = response.data.values || [];
  return rows.map((row) => ({
    id: row[0] || '',
    name: row[1] || '',
    email: row[2] || '',
    password: row[3] || '',
    status: (row[4] as 'active' | 'inactive') || 'active',
    createdAt: row[5] || '',
  }));
}

export async function getActiveEngineers(): Promise<Engineer[]> {
  const engineers = await getEngineers();
  return engineers.filter((e) => e.status === 'active');
}

export async function addEngineer(engineer: Omit<Engineer, 'id' | 'createdAt'>): Promise<Engineer> {
  const sheets = getSheets();
  const id = `ENG${Date.now()}`;
  const createdAt = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Engineers!A:F',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[id, engineer.name, engineer.email, engineer.password, engineer.status, createdAt]],
    },
  });

  return { ...engineer, id, createdAt };
}

export async function updateEngineer(id: string, updates: Partial<Engineer>): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Engineers!A2:F',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const currentRow = rows[rowIndex];
  const updatedRow = [
    id,
    updates.name ?? currentRow[1],
    updates.email ?? currentRow[2],
    updates.password ?? currentRow[3],
    updates.status ?? currentRow[4],
    currentRow[5],
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Engineers!A${rowIndex + 2}:F${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [updatedRow] },
  });

  return true;
}

// ==================== APPROVERS ====================

export interface Approver {
  id: string;
  name: string;
  pin: string;
  email: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export async function getApprovers(): Promise<Approver[]> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Approvers!A2:F',
  });

  const rows = response.data.values || [];
  return rows.map((row) => ({
    id: row[0] || '',
    name: row[1] || '',
    pin: row[2] || '',
    email: row[3] || '',
    status: (row[4] as 'active' | 'inactive') || 'active',
    createdAt: row[5] || '',
  }));
}

export async function getActiveApprovers(): Promise<Approver[]> {
  const approvers = await getApprovers();
  return approvers.filter((a) => a.status === 'active');
}

export async function addApprover(approver: Omit<Approver, 'id' | 'createdAt'>): Promise<Approver> {
  const sheets = getSheets();
  const id = `A${Date.now()}`;
  const createdAt = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Approvers!A:F',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[id, approver.name, approver.pin, approver.email, approver.status, createdAt]],
    },
  });

  return { ...approver, id, createdAt };
}

export async function updateApprover(id: string, updates: Partial<Approver>): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Approvers!A2:F',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const currentRow = rows[rowIndex];
  const updatedRow = [
    id,
    updates.name ?? currentRow[1],
    updates.pin ?? currentRow[2],
    updates.email ?? currentRow[3],
    updates.status ?? currentRow[4],
    currentRow[5],
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Approvers!A${rowIndex + 2}:F${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [updatedRow] },
  });

  return true;
}

// ==================== REJECTION REASONS ====================

export interface RejectionReason {
  id: string;
  reason: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export async function getRejectionReasons(): Promise<RejectionReason[]> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'RejectionReasons!A2:D',
  });
  const rows = response.data.values || [];
  return rows.map((row) => ({
    id: row[0] || '',
    reason: row[1] || '',
    status: (row[2] as 'active' | 'inactive') || 'active',
    createdAt: row[3] || '',
  }));
}

export async function getActiveRejectionReasons(): Promise<RejectionReason[]> {
  const reasons = await getRejectionReasons();
  return reasons.filter((r) => r.status === 'active');
}

export async function addRejectionReason(reason: Omit<RejectionReason, 'id' | 'createdAt'>): Promise<RejectionReason> {
  const sheets = getSheets();
  const id = `RR${Date.now()}`;
  const createdAt = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'RejectionReasons!A:D',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[id, reason.reason, reason.status, createdAt]],
    },
  });
  return { ...reason, id, createdAt };
}

export async function updateRejectionReason(id: string, updates: Partial<RejectionReason>): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'RejectionReasons!A2:D',
  });
  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;
  const currentRow = rows[rowIndex];
  const updatedRow = [
    id,
    updates.reason ?? currentRow[1],
    updates.status ?? currentRow[2],
    currentRow[3],
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `RejectionReasons!A${rowIndex + 2}:D${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [updatedRow] },
  });
  return true;
}

// ==================== INVOICES ====================

export interface Invoice {
  id: string;               // Col A  — BILLING SECTION
  vendorName: string;       // Col B
  invoiceNumber: string;    // Col C
  invoiceDate: string;      // Col D
  invoiceType: string;      // Col E  — Advance, RA, Final
  purpose: string;          // Col F
  amount: string;           // Col G
  poNumber: string;         // Col H  — PO number (optional)
  remarks: string;          // Col I
  submittedBy: string;      // Col J  — engineer name who submitted
  submittedAt: string;      // Col K
  invoiceFileUrl: string;   // Col L
  invoiceFileName: string;  // Col M
  workPhotos: string;       // Col N  — comma-separated URLs
  measurementSheetUrl: string;  // Col O
  measurementSheetName: string; // Col P
  challanUrl: string;       // Col Q  — Challan file URL (optional)
  challanName: string;      // Col R  — Challan file name (optional)
  status: 'submitted' | 'under_review' | 'approved' | 'partially_paid' | 'paid' | 'rejected'; // Col S — APPROVER SECTION
  approvedBy: string;       // Col T
  approvedAmount: string;   // Col U  — Amount approved by approver
  approvalComments: string; // Col V
  approvedDate: string;     // Col W  — set only when approved
  updatedAt: string;        // Col X  — SYSTEM
}

export async function getInvoices(): Promise<Invoice[]> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:X',
  });

  const rows = response.data.values || [];
  return rows.map((row) => ({
    id: row[0] || '',
    vendorName: row[1] || '',
    invoiceNumber: row[2] || '',
    invoiceDate: row[3] || '',
    invoiceType: row[4] || '',
    purpose: row[5] || '',
    amount: row[6] || '',
    poNumber: row[7] || '',
    remarks: row[8] || '',
    submittedBy: row[9] || '',
    submittedAt: row[10] || '',
    invoiceFileUrl: row[11] || '',
    invoiceFileName: row[12] || '',
    workPhotos: row[13] || '',
    measurementSheetUrl: row[14] || '',
    measurementSheetName: row[15] || '',
    challanUrl: row[16] || '',
    challanName: row[17] || '',
    status: (row[18] as Invoice['status']) || 'submitted',
    approvedBy: row[19] || '',
    approvedAmount: row[20] || '',
    approvalComments: row[21] || '',
    approvedDate: row[22] || '',
    updatedAt: row[23] || '',
  }));
}

export async function getVendorInvoices(vendorName: string): Promise<Invoice[]> {
  const invoices = await getInvoices();
  return invoices.filter((inv) => inv.vendorName === vendorName);
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  const invoices = await getInvoices();
  return invoices.find((inv) => inv.id === id) || null;
}

export async function addInvoice(
  invoice: Omit<Invoice, 'id' | 'submittedAt' | 'updatedAt' | 'approvedDate' | 'approvalComments' | 'approvedBy' | 'approvedAmount'>
): Promise<Invoice> {
  const sheets = getSheets();
  const id = `INV${Date.now()}`;
  const now = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A:X',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        // BILLING SECTION (A–R)
        id,                                   // A: ID
        invoice.vendorName,                   // B: Vendor Name
        invoice.invoiceNumber,                // C: Invoice Number
        invoice.invoiceDate,                  // D: Invoice Date
        invoice.invoiceType || '',            // E: Invoice Type
        invoice.purpose,                      // F: Purpose
        invoice.amount,                       // G: Amount
        invoice.poNumber || '',               // H: PO Number
        invoice.remarks,                      // I: Remarks
        invoice.submittedBy || '',            // J: Submitted By
        now,                                  // K: Submitted At
        invoice.invoiceFileUrl,               // L: Invoice File URL
        invoice.invoiceFileName,              // M: Invoice File Name
        invoice.workPhotos,                   // N: Work Photos
        invoice.measurementSheetUrl,          // O: Measurement Sheet URL
        invoice.measurementSheetName,         // P: Measurement Sheet Name
        invoice.challanUrl || '',             // Q: Challan URL
        invoice.challanName || '',            // R: Challan Name
        // APPROVER SECTION (S–W)
        invoice.status || 'submitted',        // S: Status
        '',                                   // T: Approved By
        '',                                   // U: Approved Amount
        '',                                   // V: Approval Comments
        '',                                   // W: Approved Date
        // SYSTEM (X)
        now,                                  // X: Updated At
      ]],
    },
  });

  return { ...invoice, id, approvalComments: '', approvedBy: '', submittedAt: now, updatedAt: now, approvedDate: '', approvedAmount: '' };
}

export async function updateInvoiceStatus(
  id: string,
  status: Invoice['status'],
  approvalComments?: string,
  approvedBy?: string,
  approvedAmount?: string
): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:X',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const now = new Date().toISOString();
  const currentRow = rows[rowIndex];

  // Set approvedDate only when transitioning to approved
  const isApprovalAction = status === 'approved';
  const approvedDate = isApprovalAction ? now : (currentRow[22] ?? '');

  // Update APPROVER SECTION columns S–W: Status, Approved By, Approved Amount, Approval Comments, Approved Date
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!S${rowIndex + 2}:W${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        status,                                       // S: Status
        approvedBy ?? currentRow[19] ?? '',            // T: Approved By
        approvedAmount !== undefined
          ? approvedAmount
          : (currentRow[20] ?? ''),                   // U: Approved Amount
        approvalComments ?? currentRow[21] ?? '',      // V: Approval Comments
        approvedDate,                                  // W: Approved Date
      ]],
    },
  });

  // Update SYSTEM column X: Updated At
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!X${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[now]],
    },
  });

  return true;
}

export async function resubmitInvoice(
  id: string,
  updates: {
    invoiceDate?: string;
    invoiceNumber?: string;
    purpose?: string;
    amount?: string;
    remarks?: string;
    invoiceFileUrl?: string;
    invoiceFileName?: string;
    workPhotos?: string;
    measurementSheetUrl?: string;
    measurementSheetName?: string;
    poNumber?: string;
    challanUrl?: string;
    challanName?: string;
  }
): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:X',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const currentRow = rows[rowIndex];
  const now = new Date().toISOString();

  // Update the full row — keep original vendor name & ID, apply edits, reset status to submitted
  // NEW column order: A–R billing, S–W approver, X system
  const updatedRow = [
    // BILLING SECTION (A–R)
    id,                                                    // A: ID
    currentRow[1],                                         // B: Vendor Name (stays same)
    updates.invoiceNumber ?? currentRow[2],                // C: Invoice Number
    updates.invoiceDate ?? currentRow[3],                  // D: Invoice Date
    currentRow[4] ?? '',                                   // E: Invoice Type (keep original)
    updates.purpose ?? currentRow[5],                      // F: Purpose
    updates.amount ?? currentRow[6],                       // G: Amount
    updates.poNumber ?? currentRow[7] ?? '',               // H: PO Number
    updates.remarks ?? currentRow[8],                      // I: Remarks
    currentRow[9] ?? '',                                   // J: Submitted By (keep original)
    currentRow[10],                                        // K: Submitted At (keep original)
    updates.invoiceFileUrl ?? currentRow[11] ?? '',        // L: Invoice File URL
    updates.invoiceFileName ?? currentRow[12] ?? '',       // M: Invoice File Name
    updates.workPhotos ?? currentRow[13] ?? '',            // N: Work Photos
    updates.measurementSheetUrl ?? currentRow[14] ?? '',   // O: Measurement Sheet URL
    updates.measurementSheetName ?? currentRow[15] ?? '',  // P: Measurement Sheet Name
    updates.challanUrl ?? currentRow[16] ?? '',            // Q: Challan URL
    updates.challanName ?? currentRow[17] ?? '',           // R: Challan Name
    // APPROVER SECTION (S–W)
    'submitted',                                           // S: Status (reset)
    '',                                                    // T: Approved By (clear)
    '',                                                    // U: Approved Amount (clear)
    '',                                                    // V: Approval Comments (clear)
    '',                                                    // W: Approved Date (clear)
    // SYSTEM (X)
    now,                                                   // X: Updated At
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!A${rowIndex + 2}:X${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [updatedRow] },
  });

  return true;
}

/**
 * Update only the workPhotos field (column J) for an invoice.
 * Used by the photo upload API to store R2 proxy URLs after upload.
 */
export async function updateInvoicePhotos(
  id: string,
  workPhotosUrls: string
): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:A',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  // Column N = workPhotos (index 13)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!N${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[workPhotosUrls]] },
  });

  return true;
}

// ==================== ACCOUNTS TEAM ====================

export interface AccountsMember {
  id: string;
  name: string;
  email: string;
  password: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

async function ensureAccountsSheet(): Promise<void> {
  const sheets = getSheets();
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'AccountsTeam!A1:A1',
    });
  } catch {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: 'AccountsTeam' } } }],
        },
      });
    } catch {
      // Sheet might already exist — ignore
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'AccountsTeam!A1:F1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['ID', 'Name', 'Email', 'Password', 'Status', 'Created At']],
      },
    });
  }
}

export async function getAccountsMembers(): Promise<AccountsMember[]> {
  await ensureAccountsSheet();
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'AccountsTeam!A2:F',
  });

  const rows = response.data.values || [];
  return rows.map((row) => ({
    id: row[0] || '',
    name: row[1] || '',
    email: row[2] || '',
    password: row[3] || '',
    status: (row[4] as 'active' | 'inactive') || 'active',
    createdAt: row[5] || '',
  }));
}

export async function getActiveAccountsMembers(): Promise<AccountsMember[]> {
  const members = await getAccountsMembers();
  return members.filter((m) => m.status === 'active');
}

export async function addAccountsMember(member: Omit<AccountsMember, 'id' | 'createdAt'>): Promise<AccountsMember> {
  await ensureAccountsSheet();
  const sheets = getSheets();
  const id = `ACC${Date.now()}`;
  const createdAt = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'AccountsTeam!A:F',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[id, member.name, member.email, member.password, member.status, createdAt]],
    },
  });

  return { ...member, id, createdAt };
}

export async function updateAccountsMember(id: string, updates: Partial<AccountsMember>): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'AccountsTeam!A2:F',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const currentRow = rows[rowIndex];
  const updatedRow = [
    id,
    updates.name ?? currentRow[1],
    updates.email ?? currentRow[2],
    updates.password ?? currentRow[3],
    updates.status ?? currentRow[4],
    currentRow[5],
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `AccountsTeam!A${rowIndex + 2}:F${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [updatedRow] },
  });

  return true;
}

// ==================== PAYMENTS ====================

export interface Payment {
  id: string;
  invoiceId: string;
  vendorName: string;
  invoiceNumber: string;
  amount: string;
  utrReference: string;
  paymentDate: string;
  paidBy: string;
  notes: string;
  paymentStatus: string; // 'partially_paid' or 'paid' at time of recording
  createdAt: string;
}

async function ensurePaymentsSheet(): Promise<void> {
  const sheets = getSheets();
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Payments!A1:A1',
    });
  } catch {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: 'Payments' } } }],
        },
      });
    } catch {
      // Sheet might already exist — ignore
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Payments!A1:K1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['ID', 'Invoice ID', 'Vendor Name', 'Invoice Number', 'Amount', 'UTR/Reference', 'Payment Date', 'Paid By', 'Notes', 'Payment Status', 'Created At']],
      },
    });
  }
}

export async function getPayments(): Promise<Payment[]> {
  await ensurePaymentsSheet();
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Payments!A2:K',
  });

  const rows = response.data.values || [];
  return rows.map((row) => ({
    id: row[0] || '',
    invoiceId: row[1] || '',
    vendorName: row[2] || '',
    invoiceNumber: row[3] || '',
    amount: row[4] || '',
    utrReference: row[5] || '',
    paymentDate: row[6] || '',
    paidBy: row[7] || '',
    notes: row[8] || '',
    paymentStatus: row[9] || '',
    createdAt: row[10] || '',
  }));
}

export async function getPaymentsByInvoiceId(invoiceId: string): Promise<Payment[]> {
  const payments = await getPayments();
  return payments.filter((p) => p.invoiceId === invoiceId);
}

export async function addPayment(payment: Omit<Payment, 'id' | 'createdAt'>): Promise<Payment> {
  await ensurePaymentsSheet();
  const sheets = getSheets();
  const id = `PAY${Date.now()}`;
  const createdAt = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Payments!A:K',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        id,
        payment.invoiceId,
        payment.vendorName,
        payment.invoiceNumber,
        payment.amount,
        payment.utrReference,
        payment.paymentDate,
        payment.paidBy,
        payment.notes,
        payment.paymentStatus,
        createdAt,
      ]],
    },
  });

  return { ...payment, id, createdAt };
}

// ==================== VENDOR DATA MIGRATION ====================

/**
 * Migrates vendor rows to the current 11-column format.
 *
 * Handles two old formats:
 * 1) 7-col with PIN: [ID, Name, PIN, Phone, Email, Status, CreatedAt]
 * 2) 6-col without PIN: [ID, Name, Phone, Email, Status, CreatedAt]
 *
 * New 11-col: [ID, Name, Phone, Email, GSTIN, State, Address, VendorType, Category, Status, CreatedAt]
 *
 * Detection: if a row has fewer than 11 cells, it needs expansion.
 * If cell[2] looks like a PIN (all digits, 4-10), it's format 1.
 * Returns count of migrated rows.
 */
export async function migrateVendorRows(): Promise<number> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Vendors!A2:K',
  });

  const rows = response.data.values || [];
  if (rows.length === 0) return 0;

  let migratedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2;

    // Already 11-col format — skip
    if (row.length >= 11) continue;

    let id: string, name: string, phone: string, email: string, status: string, createdAt: string;

    // Detect old 7-col format with PIN: cell[2] is all digits
    if (row.length >= 7 && row[2] && /^\d{4,10}$/.test(row[2])) {
      id = row[0]; name = row[1]; phone = row[3]; email = row[4];
      status = row[5]; createdAt = row[6];
    } else {
      // 6-col format (no PIN): [ID, Name, Phone, Email, Status, CreatedAt]
      id = row[0] || ''; name = row[1] || ''; phone = row[2] || ''; email = row[3] || '';
      status = row[4] || 'active'; createdAt = row[5] || '';
    }

    // Expand to 11-col with empty new fields
    const newRow = [
      id, name, phone, email,
      '', '', '', '', '', // GSTIN, State, Address, VendorType, Category — empty
      status, createdAt,
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `Vendors!A${rowNumber}:K${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [newRow] },
    });

    migratedCount++;
    console.log(`Migrated vendor row ${id} (row ${rowNumber}) to 11-col format`);
  }

  return migratedCount;
}

// ==================== PAYMENT ROW MIGRATION ====================

/**
 * Migrates old 8-column payment rows to the new 11-column format.
 *
 * Old format (8 cols): [ID, InvoiceID, Amount, UTR, Date, PaidBy, Notes, CreatedAt]
 * New format (11 cols): [ID, InvoiceID, VendorName, InvoiceNumber, Amount, UTR, Date, PaidBy, Notes, PaymentStatus, CreatedAt]
 *
 * Detection: a row is old-format if it has ≤ 8 cells AND cell[2] looks numeric (amount was in position 2).
 * Returns the count of migrated rows.
 */
export async function migrateOldPaymentRows(): Promise<number> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Payments!A2:K',
  });

  const rows = response.data.values || [];
  if (rows.length === 0) return 0;

  let migratedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Detect old format: ≤ 8 cells and cell[2] is numeric (was the amount column)
    if (row.length <= 8 && row[2] && !isNaN(parseFloat(row[2]))) {
      // Old format: [ID, InvoiceID, Amount, UTR, Date, PaidBy, Notes, CreatedAt]
      const oldId = row[0] || '';
      const oldInvoiceId = row[1] || '';
      const oldAmount = row[2] || '';
      const oldUtr = row[3] || '';
      const oldDate = row[4] || '';
      const oldPaidBy = row[5] || '';
      const oldNotes = row[6] || '';
      const oldCreatedAt = row[7] || '';

      // Look up the invoice to get vendor name and invoice number
      let vendorName = '';
      let invoiceNumber = '';
      try {
        const invoice = await getInvoiceById(oldInvoiceId);
        if (invoice) {
          vendorName = invoice.vendorName || '';
          invoiceNumber = invoice.invoiceNumber || '';
        }
      } catch {
        // If invoice lookup fails, leave vendor/invoice fields empty
      }

      // Build new 11-column row
      const newRow = [
        oldId,           // A: ID
        oldInvoiceId,    // B: Invoice ID
        vendorName,      // C: Vendor Name (new)
        invoiceNumber,   // D: Invoice Number (new)
        oldAmount,       // E: Amount
        oldUtr,          // F: UTR/Reference
        oldDate,         // G: Payment Date
        oldPaidBy,       // H: Paid By
        oldNotes,        // I: Notes
        'paid',          // J: Payment Status (new — default to "paid" for legacy rows)
        oldCreatedAt,    // K: Created At
      ];

      // Write the corrected row back (row index i + 2 because row 1 is header, data starts at row 2)
      const rowNumber = i + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Payments!A${rowNumber}:K${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [newRow],
        },
      });

      migratedCount++;
      console.log(`Migrated payment row ${oldId} (row ${rowNumber}) from 8-col to 11-col format`);
    }
  }

  return migratedCount;
}

/**
 * Fixes invoices that are marked 'partially_paid' or 'paid' but have no corresponding
 * payment rows. Resets them to 'approved' so the accounts team can re-record payments.
 * Returns the count of fixed invoices.
 */
export async function fixOrphanedPaymentStatuses(): Promise<number> {
  const invoices = await getInvoices();
  const payments = await getPayments();

  let fixedCount = 0;

  for (const inv of invoices) {
    if (inv.status === 'partially_paid' || inv.status === 'paid') {
      const invoicePayments = payments.filter((p) => p.invoiceId === inv.id);
      const totalPaid = invoicePayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

      if (totalPaid === 0) {
        // Invoice says paid/partially_paid but has no payment rows — reset to approved
        await updateInvoiceStatus(inv.id, 'approved', undefined, undefined);
        fixedCount++;
        console.log(`Fixed orphaned status for ${inv.id}: "${inv.status}" → "approved" (0 payments found)`);
      }
    }
  }

  return fixedCount;
}

/**
 * Migrates invoice rows from the OLD column order to the NEW grouped-by-workflow order.
 *
 * OLD order (24 cols):
 *   0:ID, 1:VendorName, 2:InvoiceDate, 3:InvoiceNumber, 4:Purpose, 5:Amount,
 *   6:Remarks, 7:InvoiceFileURL, 8:InvoiceFileName, 9:WorkPhotos,
 *   10:MeasurementSheetURL, 11:MeasurementSheetName, 12:Status,
 *   13:ApprovalComments, 14:ApprovedBy, 15:SubmittedAt, 16:UpdatedAt,
 *   17:ApprovedDate, 18:InvoiceType, 19:SubmittedBy, 20:PONumber,
 *   21:ChallanURL, 22:ChallanName, 23:ApprovedAmount
 *
 * NEW order (24 cols):
 *   0:ID, 1:VendorName, 2:InvoiceNumber, 3:InvoiceDate, 4:InvoiceType,
 *   5:Purpose, 6:Amount, 7:PONumber, 8:Remarks, 9:SubmittedBy, 10:SubmittedAt,
 *   11:InvoiceFileURL, 12:InvoiceFileName, 13:WorkPhotos,
 *   14:MeasurementSheetURL, 15:MeasurementSheetName, 16:ChallanURL, 17:ChallanName,
 *   18:Status, 19:ApprovedBy, 20:ApprovedAmount, 21:ApprovalComments, 22:ApprovedDate,
 *   23:UpdatedAt
 *
 * Detection: if the header row's 3rd column (index 2) is "Invoice Date" (old) vs "Invoice Number" (new),
 * the sheet needs migration. If headers already match new order, skip.
 */
export async function migrateInvoiceColumns(): Promise<number> {
  const sheets = getSheets();

  // Read the header row first to detect whether migration is needed
  const headerResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A1:X1',
  });
  const headers = headerResp.data.values?.[0] || [];

  // If header at index 2 is already "Invoice Number", the new order is in place — skip
  if (headers[2] === 'Invoice Number') {
    return 0;
  }

  // If header at index 2 is not "Invoice Date" either, the sheet may be empty or
  // in an unknown state — only migrate if we clearly see the old format
  if (headers[2] !== 'Invoice Date' && headers.length >= 3) {
    console.log('Invoice columns: unrecognized header order, skipping migration');
    return 0;
  }

  // Read all data rows
  const dataResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:X',
  });
  const rows = dataResp.data.values || [];
  if (rows.length === 0) return 0;

  // Mapping: newIndex → oldIndex
  // New idx  Field              Old idx
  //  0       ID                  0
  //  1       Vendor Name         1
  //  2       Invoice Number      3
  //  3       Invoice Date        2
  //  4       Invoice Type       18
  //  5       Purpose             4
  //  6       Amount              5
  //  7       PO Number          20
  //  8       Remarks             6
  //  9       Submitted By       19
  // 10       Submitted At       15
  // 11       Invoice File URL    7
  // 12       Invoice File Name   8
  // 13       Work Photos         9
  // 14       Measurement URL    10
  // 15       Measurement Name   11
  // 16       Challan URL        21
  // 17       Challan Name       22
  // 18       Status             12
  // 19       Approved By        14
  // 20       Approved Amount    23
  // 21       Approval Comments  13
  // 22       Approved Date      17
  // 23       Updated At         16
  const oldToNewMap = [0, 1, 3, 2, 18, 4, 5, 20, 6, 19, 15, 7, 8, 9, 10, 11, 21, 22, 12, 14, 23, 13, 17, 16];

  const remappedRows = rows.map((row) => {
    const newRow: string[] = [];
    for (let newIdx = 0; newIdx < 24; newIdx++) {
      const oldIdx = oldToNewMap[newIdx];
      newRow[newIdx] = row[oldIdx] ?? '';
    }
    return newRow;
  });

  // Write all remapped data rows back in one batch
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!A2:X${rows.length + 1}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: remappedRows,
    },
  });

  console.log(`Migrated ${rows.length} invoice rows to new column order`);
  return rows.length;
}

// ==================== SHEET SETUP ====================

export async function initializeSheetHeaders(): Promise<void> {
  const sheets = getSheets();

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
  });

  const existingSheets = spreadsheet.data.sheets?.map((s) => s.properties?.title) || [];

  const requests: Array<{ addSheet: { properties: { title: string } } }> = [];

  if (!existingSheets.includes('Vendors')) {
    requests.push({ addSheet: { properties: { title: 'Vendors' } } });
  }
  if (!existingSheets.includes('Invoices')) {
    requests.push({ addSheet: { properties: { title: 'Invoices' } } });
  }
  if (!existingSheets.includes('Approvers')) {
    requests.push({ addSheet: { properties: { title: 'Approvers' } } });
  }
  if (!existingSheets.includes('RejectionReasons')) {
    requests.push({ addSheet: { properties: { title: 'RejectionReasons' } } });
  }
  if (!existingSheets.includes('Engineers')) {
    requests.push({ addSheet: { properties: { title: 'Engineers' } } });
  }
  if (!existingSheets.includes('AccountsTeam')) {
    requests.push({ addSheet: { properties: { title: 'AccountsTeam' } } });
  }
  if (!existingSheets.includes('Payments')) {
    requests.push({ addSheet: { properties: { title: 'Payments' } } });
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests },
    });
  }

  // Always set correct headers for Vendors tab (expanded with GSTIN, State, Address, Type, Category)
  const expectedVendorHeaders = [
    'ID', 'Vendor Name', 'Phone', 'Email', 'GSTIN', 'State', 'Address',
    'Vendor Type', 'Category', 'Status', 'Created At'
  ];
  const vendorHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Vendors!A1:K1',
  });

  const currentVendorHeaders = vendorHeaders.data.values?.[0] || [];
  if (currentVendorHeaders.length !== expectedVendorHeaders.length ||
      currentVendorHeaders.some((h, i) => h !== expectedVendorHeaders[i])) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Vendors!A1:K1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [expectedVendorHeaders],
      },
    });
  }

  // Always set correct headers for Invoices tab — grouped by workflow stage
  const expectedInvoiceHeaders = [
    // BILLING SECTION (A–R)
    'ID', 'Vendor Name', 'Invoice Number', 'Invoice Date', 'Invoice Type',
    'Purpose', 'Amount', 'PO Number', 'Remarks', 'Submitted By', 'Submitted At',
    'Invoice File URL', 'Invoice File Name', 'Work Photos',
    'Measurement Sheet URL', 'Measurement Sheet Name', 'Challan URL', 'Challan Name',
    // APPROVER SECTION (S–W)
    'Status', 'Approved By', 'Approved Amount', 'Approval Comments', 'Approved Date',
    // SYSTEM (X)
    'Updated At'
  ];

  const invoiceHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A1:X1',
  });

  const currentHeaders = invoiceHeaders.data.values?.[0] || [];
  if (currentHeaders.length !== expectedInvoiceHeaders.length ||
      currentHeaders.some((h, i) => h !== expectedInvoiceHeaders[i])) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Invoices!A1:X1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [expectedInvoiceHeaders],
      },
    });
  }

  // Set headers for Approvers tab
  const approverHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Approvers!A1:F1',
  });

  if (!approverHeaders.data.values || approverHeaders.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Approvers!A1:F1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['ID', 'Approver Name', 'PIN', 'Email', 'Status', 'Created At']],
      },
    });
  }

  // Set headers for RejectionReasons tab
  const rejectionReasonHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'RejectionReasons!A1:D1',
  });

  if (!rejectionReasonHeaders.data.values || rejectionReasonHeaders.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'RejectionReasons!A1:D1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['ID', 'Reason', 'Status', 'Created At']],
      },
    });
  }

  // Set headers for Engineers tab
  const engineerHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Engineers!A1:F1',
  });

  if (!engineerHeaders.data.values || engineerHeaders.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Engineers!A1:F1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['ID', 'Name', 'Email', 'Password', 'Status', 'Created At']],
      },
    });
  }

  // Set headers for AccountsTeam tab
  const accountsHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'AccountsTeam!A1:F1',
  });

  if (!accountsHeaders.data.values || accountsHeaders.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'AccountsTeam!A1:F1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['ID', 'Name', 'Email', 'Password', 'Status', 'Created At']],
      },
    });
  }

  // Always set correct headers for Payments tab (fixes stale/mismatched headers)
  const expectedPaymentHeaders = [
    'ID', 'Invoice ID', 'Vendor Name', 'Invoice Number', 'Amount',
    'UTR/Reference', 'Payment Date', 'Paid By', 'Notes', 'Payment Status', 'Created At',
  ];

  const paymentHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Payments!A1:K1',
  });

  const currentPaymentHeaders = paymentHeaders.data.values?.[0] || [];
  if (currentPaymentHeaders.length !== expectedPaymentHeaders.length ||
      currentPaymentHeaders.some((h, i) => h !== expectedPaymentHeaders[i])) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Payments!A1:K1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [expectedPaymentHeaders],
      },
    });
  }
}
