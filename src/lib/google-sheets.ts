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

// ==================== DATE HELPERS (IST) ====================

/**
 * Returns the current date and time in IST (UTC+5:30).
 * Date format: dd/mm/yyyy
 * Time format: HH:mm:ss
 * Combined: dd/mm/yyyy, HH:mm:ss IST
 */
function getISTTimestamp(): { date: string; time: string; combined: string } {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);

  const dd = String(ist.getUTCDate()).padStart(2, '0');
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = ist.getUTCFullYear();
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const min = String(ist.getUTCMinutes()).padStart(2, '0');
  const ss = String(ist.getUTCSeconds()).padStart(2, '0');

  const date = `${dd}/${mm}/${yyyy}`;
  const time = `${hh}:${min}:${ss}`;
  return { date, time, combined: `${date}, ${time} IST` };
}

/** Convert YYYY-MM-DD (from <input type="date">) to dd/mm/yyyy for Google Sheets */
function toIndianDateFormat(dateStr: string): string {
  if (!dateStr) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr; // already dd/mm/yyyy
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return dateStr;
}

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
  const createdAt = getISTTimestamp().combined;

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
  const createdAt = getISTTimestamp().combined;

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
  const createdAt = getISTTimestamp().combined;

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
  const createdAt = getISTTimestamp().combined;

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
  const createdAt = getISTTimestamp().combined;
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
  gstAmount: string;        // Col H  — GST amount (optional)
  totalAmount: string;      // Col I  — Total = Amount + GST (computed on write)
  poNumber: string;         // Col J  — PO number (optional)
  remarks: string;          // Col K
  submittedBy: string;      // Col L  — engineer name who submitted
  submittedAt: string;      // Col M
  invoiceFileUrl: string;   // Col N
  invoiceFileName: string;  // Col O
  workPhotos: string;       // Col P  — comma-separated URLs
  measurementSheetUrl: string;  // Col Q
  measurementSheetName: string; // Col R
  challanUrl: string;       // Col S  — Challan file URL (optional)
  challanName: string;      // Col T  — Challan file name (optional)
  status: 'submitted' | 'under_review' | 'approved' | 'partially_paid' | 'paid' | 'rejected'; // Col U — APPROVER SECTION
  approvedBy: string;       // Col V
  approvedAmount: string;   // Col W  — Amount approved by approver
  approvalComments: string; // Col X
  approvedDate: string;     // Col Y  — set only when approved
  updatedAt: string;        // Col Z  — SYSTEM
}

export async function getInvoices(): Promise<Invoice[]> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:Z',
  });

  const rows = response.data.values || [];
  return rows.map((row) => ({
    id: row[0] || '',              // A
    vendorName: row[1] || '',      // B
    invoiceNumber: row[2] || '',   // C
    invoiceDate: row[3] || '',     // D
    invoiceType: row[4] || '',     // E
    purpose: row[5] || '',         // F
    amount: row[6] || '',          // G
    gstAmount: row[7] || '',       // H
    totalAmount: row[8] || '',     // I
    poNumber: row[9] || '',        // J
    remarks: row[10] || '',        // K
    submittedBy: row[11] || '',    // L
    submittedAt: row[12] || '',    // M
    invoiceFileUrl: row[13] || '', // N
    invoiceFileName: row[14] || '',// O
    workPhotos: row[15] || '',     // P
    measurementSheetUrl: row[16] || '',  // Q
    measurementSheetName: row[17] || '', // R
    challanUrl: row[18] || '',     // S
    challanName: row[19] || '',    // T
    status: (row[20] as Invoice['status']) || 'submitted', // U
    approvedBy: row[21] || '',     // V
    approvedAmount: row[22] || '', // W
    approvalComments: row[23] || '',// X
    approvedDate: row[24] || '',   // Y
    updatedAt: row[25] || '',      // Z
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
  invoice: Omit<Invoice, 'id' | 'submittedAt' | 'updatedAt' | 'approvedDate' | 'approvalComments' | 'approvedBy' | 'approvedAmount' | 'totalAmount'> & { gstAmount?: string }
): Promise<Invoice> {
  const sheets = getSheets();
  const id = `INV${Date.now()}`;
  const now = getISTTimestamp().combined;
  const gst = invoice.gstAmount || '';
  const baseAmount = parseFloat(invoice.amount) || 0;
  const gstNum = parseFloat(gst) || 0;
  const totalAmount = (baseAmount + gstNum).toFixed(2);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A:Z',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        // BILLING SECTION (A–T)
        id,                                   // A: ID
        invoice.vendorName,                   // B: Vendor Name
        invoice.invoiceNumber,                // C: Invoice Number
        toIndianDateFormat(invoice.invoiceDate), // D: Invoice Date (dd/mm/yyyy)
        invoice.invoiceType || '',            // E: Invoice Type
        invoice.purpose,                      // F: Purpose
        invoice.amount,                       // G: Amount
        gst,                                  // H: GST Amount
        totalAmount,                          // I: Total Amount (Amount + GST)
        invoice.poNumber || '',               // J: PO Number
        invoice.remarks,                      // K: Remarks
        invoice.submittedBy || '',            // L: Submitted By
        now,                                  // M: Submitted At
        invoice.invoiceFileUrl,               // N: Invoice File URL
        invoice.invoiceFileName,              // O: Invoice File Name
        invoice.workPhotos,                   // P: Work Photos
        invoice.measurementSheetUrl,          // Q: Measurement Sheet URL
        invoice.measurementSheetName,         // R: Measurement Sheet Name
        invoice.challanUrl || '',             // S: Challan URL
        invoice.challanName || '',            // T: Challan Name
        // APPROVER SECTION (U–Y)
        invoice.status || 'submitted',        // U: Status
        '',                                   // V: Approved By
        '',                                   // W: Approved Amount
        '',                                   // X: Approval Comments
        '',                                   // Y: Approved Date
        // SYSTEM (Z)
        now,                                  // Z: Updated At
      ]],
    },
  });

  return { ...invoice, id, approvalComments: '', approvedBy: '', submittedAt: now, updatedAt: now, approvedDate: '', approvedAmount: '', gstAmount: gst, totalAmount };
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
    range: 'Invoices!A2:Z',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const now = getISTTimestamp().combined;
  const currentRow = rows[rowIndex];

  // Set approvedDate only when transitioning to approved
  const isApprovalAction = status === 'approved';
  const approvedDate = isApprovalAction ? now : (currentRow[24] ?? '');

  // Update APPROVER SECTION columns U–Y: Status, Approved By, Approved Amount, Approval Comments, Approved Date
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!U${rowIndex + 2}:Y${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        status,                                       // U: Status
        approvedBy ?? currentRow[21] ?? '',            // V: Approved By
        approvedAmount !== undefined
          ? approvedAmount
          : (currentRow[22] ?? ''),                   // W: Approved Amount
        approvalComments ?? currentRow[23] ?? '',      // X: Approval Comments
        approvedDate,                                  // Y: Approved Date
      ]],
    },
  });

  // Update SYSTEM column Z: Updated At
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!Z${rowIndex + 2}`,
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
    range: 'Invoices!A2:Z',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const currentRow = rows[rowIndex];
  const now = getISTTimestamp().combined;

  // Recompute total after potential amount change
  const newAmount = updates.amount ?? currentRow[6];
  const gstAmount = currentRow[7] ?? '';  // GST stays the same on resubmit
  const baseAmt = parseFloat(newAmount) || 0;
  const gstNum = parseFloat(gstAmount) || 0;
  const totalAmount = (baseAmt + gstNum).toFixed(2);

  // Update the full row — keep original vendor name & ID, apply edits, reset status to submitted
  // Column order: A–T billing, U–Y approver, Z system
  const updatedRow = [
    // BILLING SECTION (A–T)
    id,                                                    // A: ID
    currentRow[1],                                         // B: Vendor Name (stays same)
    updates.invoiceNumber ?? currentRow[2],                // C: Invoice Number
    updates.invoiceDate ? toIndianDateFormat(updates.invoiceDate) : currentRow[3], // D: Invoice Date
    currentRow[4] ?? '',                                   // E: Invoice Type (keep original)
    updates.purpose ?? currentRow[5],                      // F: Purpose
    updates.amount ?? currentRow[6],                       // G: Amount
    gstAmount,                                             // H: GST Amount (keep original)
    totalAmount,                                           // I: Total Amount (recomputed)
    updates.poNumber ?? currentRow[9] ?? '',               // J: PO Number
    updates.remarks ?? currentRow[10],                     // K: Remarks
    currentRow[11] ?? '',                                  // L: Submitted By (keep original)
    currentRow[12],                                        // M: Submitted At (keep original)
    updates.invoiceFileUrl ?? currentRow[13] ?? '',        // N: Invoice File URL
    updates.invoiceFileName ?? currentRow[14] ?? '',       // O: Invoice File Name
    updates.workPhotos ?? currentRow[15] ?? '',            // P: Work Photos
    updates.measurementSheetUrl ?? currentRow[16] ?? '',   // Q: Measurement Sheet URL
    updates.measurementSheetName ?? currentRow[17] ?? '',  // R: Measurement Sheet Name
    updates.challanUrl ?? currentRow[18] ?? '',            // S: Challan URL
    updates.challanName ?? currentRow[19] ?? '',           // T: Challan Name
    // APPROVER SECTION (U–Y)
    'submitted',                                           // U: Status (reset)
    '',                                                    // V: Approved By (clear)
    '',                                                    // W: Approved Amount (clear)
    '',                                                    // X: Approval Comments (clear)
    '',                                                    // Y: Approved Date (clear)
    // SYSTEM (Z)
    now,                                                   // Z: Updated At
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!A${rowIndex + 2}:Z${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [updatedRow] },
  });

  return true;
}

/**
 * Update only the workPhotos field (column P) for an invoice.
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

  // Column P = workPhotos (index 15)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!P${rowIndex + 2}`,
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
  const createdAt = getISTTimestamp().combined;

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
  const createdAt = getISTTimestamp().combined;

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
        toIndianDateFormat(payment.paymentDate),
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

  // Read the header row to detect which format we're in
  const headerResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A1:Z1',
  });
  const headers = headerResp.data.values?.[0] || [];

  // If header at index 7 is already "GST Amount", the new 26-column order is in place — skip
  if (headers[7] === 'GST Amount' && headers[8] === 'Total Amount') {
    return 0;
  }

  // Detect the OLD 25-column format: col 7 = "PO Number", col 24 = GST data (or header "GST Amount" never set)
  // OR the OLD 24-column format: col 7 = "PO Number", no GST column at all
  if (headers[7] !== 'PO Number' && headers.length >= 8) {
    console.log('Invoice columns: unrecognized header order, skipping migration');
    return 0;
  }

  // Read all data rows (up to Z to capture any GST in col Y)
  const dataResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:Z',
  });
  const rows = dataResp.data.values || [];
  if (rows.length === 0) return 0;

  // Old layout (25 cols, A=0 to Y=24):
  //  0  ID                    →  0  ID
  //  1  Vendor Name           →  1  Vendor Name
  //  2  Invoice Number        →  2  Invoice Number
  //  3  Invoice Date          →  3  Invoice Date
  //  4  Invoice Type          →  4  Invoice Type
  //  5  Purpose               →  5  Purpose
  //  6  Amount                →  6  Amount
  //  24 GST Amount            →  7  GST Amount         (moved from Y)
  //  (computed)               →  8  Total Amount        (new: Amount + GST)
  //  7  PO Number             →  9  PO Number
  //  8  Remarks               → 10  Remarks
  //  9  Submitted By          → 11  Submitted By
  // 10  Submitted At          → 12  Submitted At
  // 11  Invoice File URL      → 13  Invoice File URL
  // 12  Invoice File Name     → 14  Invoice File Name
  // 13  Work Photos           → 15  Work Photos
  // 14  Measurement Sheet URL → 16  Measurement Sheet URL
  // 15  Measurement Sheet Name→ 17  Measurement Sheet Name
  // 16  Challan URL           → 18  Challan URL
  // 17  Challan Name          → 19  Challan Name
  // 18  Status                → 20  Status
  // 19  Approved By           → 21  Approved By
  // 20  Approved Amount       → 22  Approved Amount
  // 21  Approval Comments     → 23  Approval Comments
  // 22  Approved Date         → 24  Approved Date
  // 23  Updated At            → 25  Updated At

  const remappedRows = rows.map((row) => {
    const gst = row[24] ?? '';  // Old col Y
    const amount = parseFloat(row[6]) || 0;
    const gstNum = parseFloat(gst) || 0;
    const total = (amount + gstNum).toFixed(2);

    return [
      row[0] ?? '',   //  0 → A: ID
      row[1] ?? '',   //  1 → B: Vendor Name
      row[2] ?? '',   //  2 → C: Invoice Number
      row[3] ?? '',   //  3 → D: Invoice Date
      row[4] ?? '',   //  4 → E: Invoice Type
      row[5] ?? '',   //  5 → F: Purpose
      row[6] ?? '',   //  6 → G: Amount
      gst,            // 24 → H: GST Amount (moved from Y)
      total,          //      I: Total Amount (computed)
      row[7] ?? '',   //  7 → J: PO Number
      row[8] ?? '',   //  8 → K: Remarks
      row[9] ?? '',   //  9 → L: Submitted By
      row[10] ?? '',  // 10 → M: Submitted At
      row[11] ?? '',  // 11 → N: Invoice File URL
      row[12] ?? '',  // 12 → O: Invoice File Name
      row[13] ?? '',  // 13 → P: Work Photos
      row[14] ?? '',  // 14 → Q: Measurement Sheet URL
      row[15] ?? '',  // 15 → R: Measurement Sheet Name
      row[16] ?? '',  // 16 → S: Challan URL
      row[17] ?? '',  // 17 → T: Challan Name
      row[18] ?? '',  // 18 → U: Status
      row[19] ?? '',  // 19 → V: Approved By
      row[20] ?? '',  // 20 → W: Approved Amount
      row[21] ?? '',  // 21 → X: Approval Comments
      row[22] ?? '',  // 22 → Y: Approved Date
      row[23] ?? '',  // 23 → Z: Updated At
    ];
  });

  // Write all remapped data rows back (26 columns, A–Z)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!A2:Z${rows.length + 1}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: remappedRows,
    },
  });

  console.log(`Migrated ${rows.length} invoice rows: moved GST to col H, added Total in col I`);
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
    // BILLING SECTION (A–T)
    'ID', 'Vendor Name', 'Invoice Number', 'Invoice Date', 'Invoice Type',
    'Purpose', 'Amount', 'GST Amount', 'Total Amount',
    'PO Number', 'Remarks', 'Submitted By', 'Submitted At',
    'Invoice File URL', 'Invoice File Name', 'Work Photos',
    'Measurement Sheet URL', 'Measurement Sheet Name', 'Challan URL', 'Challan Name',
    // APPROVER SECTION (U–Y)
    'Status', 'Approved By', 'Approved Amount', 'Approval Comments', 'Approved Date',
    // SYSTEM (Z)
    'Updated At'
  ];

  const invoiceHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A1:Z1',
  });

  const currentHeaders = invoiceHeaders.data.values?.[0] || [];
  if (currentHeaders.length !== expectedInvoiceHeaders.length ||
      currentHeaders.some((h, i) => h !== expectedInvoiceHeaders[i])) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Invoices!A1:Z1',
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
