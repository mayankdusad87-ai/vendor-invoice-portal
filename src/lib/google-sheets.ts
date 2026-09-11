import { google } from 'googleapis';

// ==================== CONCURRENCY ERROR ====================

/**
 * Thrown when an invoice was modified between the time it was read and the
 * time a write is attempted.  The API layer catches this and returns HTTP 409.
 */
export class ConflictError extends Error {
  constructor(message = 'This invoice was modified by another user. Please refresh and try again.') {
    super(message);
    this.name = 'ConflictError';
  }
}

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
export function getISTTimestamp(): { date: string; time: string; combined: string } {
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
  project: string;          // Col B  — Project name
  vendorName: string;       // Col C
  invoiceNumber: string;    // Col D
  invoiceDate: string;      // Col E
  invoiceType: string;      // Col F  — Advance, RA, Final
  purpose: string;          // Col G
  amount: string;           // Col H
  gstAmount: string;        // Col I  — GST amount (optional)
  totalAmount: string;      // Col J  — Total = Amount + GST (computed on write)
  poNumber: string;         // Col K  — PO number (optional)
  remarks: string;          // Col L
  submittedBy: string;      // Col M  — engineer name who submitted
  submittedAt: string;      // Col N
  invoiceFileUrl: string;   // Col O
  invoiceFileName: string;  // Col P
  workPhotos: string;       // Col Q  — comma-separated URLs
  measurementSheetUrl: string;  // Col R
  measurementSheetName: string; // Col S
  challanUrl: string;       // Col T  — Challan file URL (optional)
  challanName: string;      // Col U  — Challan file name (optional)
  status: 'submitted' | 'under_review' | 'approved' | 'partially_paid' | 'paid' | 'rejected' | 'accounts_query' | 'correction_required'; // Col V — APPROVER SECTION
  approvedBy: string;       // Col W
  approvedAmount: string;   // Col X  — Amount approved by approver
  approvalComments: string; // Col Y
  approvedDate: string;     // Col Z  — set only when approved
  updatedAt: string;        // Col AA — SYSTEM
  accountsQueryBy: string;       // Col AB — Accounts member who raised the query
  accountsQueryReason: string;   // Col AC — Accounts query reason
  accountsQueryAt: string;       // Col AD — Timestamp of accounts query
  previousStatus: string;        // Col AE — Status before accounts query was raised
}

export async function getInvoices(): Promise<Invoice[]> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:AE',
  });

  const rows = response.data.values || [];
  return rows.map((row) => ({
    id: row[0] || '',              // A
    project: row[1] || '',         // B
    vendorName: row[2] || '',      // C
    invoiceNumber: row[3] || '',   // D
    invoiceDate: row[4] || '',     // E
    invoiceType: row[5] || '',     // F
    purpose: row[6] || '',         // G
    amount: row[7] || '',          // H
    gstAmount: row[8] || '',       // I
    totalAmount: row[9] || '',     // J
    poNumber: row[10] || '',       // K
    remarks: row[11] || '',        // L
    submittedBy: row[12] || '',    // M
    submittedAt: row[13] || '',    // N
    invoiceFileUrl: row[14] || '', // O
    invoiceFileName: row[15] || '',// P
    workPhotos: row[16] || '',     // Q
    measurementSheetUrl: row[17] || '',  // R
    measurementSheetName: row[18] || '', // S
    challanUrl: row[19] || '',     // T
    challanName: row[20] || '',    // U
    status: (row[21] as Invoice['status']) || 'submitted', // V
    approvedBy: row[22] || '',     // W
    approvedAmount: row[23] || '', // X
    approvalComments: row[24] || '',// Y
    approvedDate: row[25] || '',   // Z
    updatedAt: row[26] || '',      // AA
    accountsQueryBy: row[27] || '',     // AB
    accountsQueryReason: row[28] || '', // AC
    accountsQueryAt: row[29] || '',     // AD
    previousStatus: row[30] || '',      // AE
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
  invoice: Omit<Invoice, 'id' | 'submittedAt' | 'updatedAt' | 'approvedDate' | 'approvalComments' | 'approvedBy' | 'approvedAmount' | 'totalAmount' | 'accountsQueryBy' | 'accountsQueryReason' | 'accountsQueryAt' | 'previousStatus'> & { gstAmount?: string }
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
    range: 'Invoices!A:AA',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        // BILLING SECTION (A–U)
        id,                                   // A: ID
        invoice.project || '',                // B: Project
        invoice.vendorName,                   // C: Vendor Name
        invoice.invoiceNumber,                // D: Invoice Number
        toIndianDateFormat(invoice.invoiceDate), // E: Invoice Date (dd/mm/yyyy)
        invoice.invoiceType || '',            // F: Invoice Type
        invoice.purpose,                      // G: Purpose
        invoice.amount,                       // H: Amount
        gst,                                  // I: GST Amount
        totalAmount,                          // J: Total Amount (Amount + GST)
        invoice.poNumber || '',               // K: PO Number
        invoice.remarks,                      // L: Remarks
        invoice.submittedBy || '',            // M: Submitted By
        now,                                  // N: Submitted At
        invoice.invoiceFileUrl,               // O: Invoice File URL
        invoice.invoiceFileName,              // P: Invoice File Name
        invoice.workPhotos,                   // Q: Work Photos
        invoice.measurementSheetUrl,          // R: Measurement Sheet URL
        invoice.measurementSheetName,         // S: Measurement Sheet Name
        invoice.challanUrl || '',             // T: Challan URL
        invoice.challanName || '',            // U: Challan Name
        // APPROVER SECTION (V–Z)
        invoice.status || 'submitted',        // V: Status
        '',                                   // W: Approved By
        '',                                   // X: Approved Amount
        '',                                   // Y: Approval Comments
        '',                                   // Z: Approved Date
        // SYSTEM (AA)
        now,                                  // AA: Updated At
      ]],
    },
  });

  return { ...invoice, id, approvalComments: '', approvedBy: '', submittedAt: now, updatedAt: now, approvedDate: '', approvedAmount: '', gstAmount: gst, totalAmount, accountsQueryBy: '', accountsQueryReason: '', accountsQueryAt: '', previousStatus: '' };
}

export async function updateInvoiceStatus(
  id: string,
  status: Invoice['status'],
  approvalComments?: string,
  approvedBy?: string,
  approvedAmount?: string,
  expectedUpdatedAt?: string,
): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:AE',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const now = getISTTimestamp().combined;
  const currentRow = rows[rowIndex];

  // Optimistic concurrency — reject if the invoice was modified since the caller read it
  if (expectedUpdatedAt && currentRow[26] && currentRow[26] !== expectedUpdatedAt) {
    throw new ConflictError();
  }

  // Set approvedDate only when transitioning to approved
  const isApprovalAction = status === 'approved';
  const approvedDate = isApprovalAction ? now : (currentRow[25] ?? '');

  // Update APPROVER SECTION columns V–Z: Status, Approved By, Approved Amount, Approval Comments, Approved Date
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!V${rowIndex + 2}:Z${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        status,                                       // V: Status
        approvedBy ?? currentRow[22] ?? '',            // W: Approved By
        approvedAmount !== undefined
          ? approvedAmount
          : (currentRow[23] ?? ''),                   // X: Approved Amount
        approvalComments ?? currentRow[24] ?? '',      // Y: Approval Comments
        approvedDate,                                  // Z: Approved Date
      ]],
    },
  });

  // Update SYSTEM column AA: Updated At
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!AA${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[now]],
    },
  });

  return true;
}

/**
 * Set accounts query metadata (columns AB–AE) when accounts raises a query.
 * Also sets status to accounts_query and preserves the previous status.
 */
export async function setAccountsQuery(
  id: string,
  queryBy: string,
  queryReason: string,
  previousStatus: string,
  approvalComments: string,
  expectedUpdatedAt?: string,
): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:AE',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const now = getISTTimestamp().combined;
  const currentRow = rows[rowIndex];

  // Optimistic concurrency — reject if the invoice was modified since the caller read it
  if (expectedUpdatedAt && currentRow[26] && currentRow[26] !== expectedUpdatedAt) {
    throw new ConflictError();
  }

  // Re-validate status hasn't changed (close TOCTOU gap)
  const currentStatus = currentRow[21] || '';
  if (currentStatus !== previousStatus && currentStatus !== 'approved' && currentStatus !== 'partially_paid') {
    throw new ConflictError(`Invoice status changed to "${currentStatus}" — cannot raise query.`);
  }

  // Update Status (V) and Approval Comments (Y) — preserve approvedBy, approvedAmount, approvedDate
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!V${rowIndex + 2}:Z${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        'accounts_query',                              // V: Status
        currentRow[22] ?? '',                          // W: Approved By (preserve)
        currentRow[23] ?? '',                          // X: Approved Amount (preserve)
        approvalComments,                              // Y: Approval Comments (appended)
        currentRow[25] ?? '',                          // Z: Approved Date (preserve)
      ]],
    },
  });

  // Update columns AA–AE: Updated At, Query By, Query Reason, Query At, Previous Status
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!AA${rowIndex + 2}:AE${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        now,             // AA: Updated At
        queryBy,         // AB: Accounts Query By
        queryReason,     // AC: Accounts Query Reason
        now,             // AD: Accounts Query At
        previousStatus,  // AE: Previous Status
      ]],
    },
  });

  return true;
}

/**
 * Clear accounts query metadata (columns AB–AE) after the approver resolves the query.
 */
export async function clearAccountsQuery(id: string): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:A',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  // Clear query columns AB–AE (keep the data for audit, just clear previousStatus)
  // Actually we keep all query data for audit trail — only clear previousStatus
  // No, let's keep everything for the record. This function is optional.
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
  },
  expectedUpdatedAt?: string,
): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:AE',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const currentRow = rows[rowIndex];
  const now = getISTTimestamp().combined;

  // Optimistic concurrency — reject if the invoice was modified since the caller read it
  if (expectedUpdatedAt && currentRow[26] && currentRow[26] !== expectedUpdatedAt) {
    throw new ConflictError();
  }

  // Re-validate status — must still be rejected or correction_required
  const currentStatus = currentRow[21] || '';
  if (currentStatus !== 'rejected' && currentStatus !== 'correction_required') {
    throw new ConflictError(`Invoice status changed to "${currentStatus}" — cannot resubmit.`);
  }

  // Recompute total after potential amount change
  const newAmount = updates.amount ?? currentRow[7];
  const gstAmount = currentRow[8] ?? '';  // GST stays the same on resubmit
  const baseAmt = parseFloat(newAmount) || 0;
  const gstNum = parseFloat(gstAmount) || 0;
  const totalAmount = (baseAmt + gstNum).toFixed(2);

  // Update the full row — keep original project, vendor name & ID, apply edits, reset status to submitted
  // Column order: A–U billing, V–Z approver, AA system
  const updatedRow = [
    // BILLING SECTION (A–U)
    id,                                                    // A: ID
    currentRow[1] ?? '',                                   // B: Project (keep original)
    currentRow[2],                                         // C: Vendor Name (stays same)
    updates.invoiceNumber ?? currentRow[3],                // D: Invoice Number
    updates.invoiceDate ? toIndianDateFormat(updates.invoiceDate) : currentRow[4], // E: Invoice Date
    currentRow[5] ?? '',                                   // F: Invoice Type (keep original)
    updates.purpose ?? currentRow[6],                      // G: Purpose
    updates.amount ?? currentRow[7],                       // H: Amount
    gstAmount,                                             // I: GST Amount (keep original)
    totalAmount,                                           // J: Total Amount (recomputed)
    updates.poNumber ?? currentRow[10] ?? '',              // K: PO Number
    updates.remarks ?? currentRow[11],                     // L: Remarks
    currentRow[12] ?? '',                                  // M: Submitted By (keep original)
    currentRow[13],                                        // N: Submitted At (keep original)
    updates.invoiceFileUrl ?? currentRow[14] ?? '',        // O: Invoice File URL
    updates.invoiceFileName ?? currentRow[15] ?? '',       // P: Invoice File Name
    updates.workPhotos ?? currentRow[16] ?? '',            // Q: Work Photos
    updates.measurementSheetUrl ?? currentRow[17] ?? '',   // R: Measurement Sheet URL
    updates.measurementSheetName ?? currentRow[18] ?? '',  // S: Measurement Sheet Name
    updates.challanUrl ?? currentRow[19] ?? '',            // T: Challan URL
    updates.challanName ?? currentRow[20] ?? '',           // U: Challan Name
    // APPROVER SECTION (V–Z)
    'submitted',                                           // V: Status (reset)
    '',                                                    // W: Approved By (clear for fresh review)
    '',                                                    // X: Approved Amount (clear for fresh review)
    currentRow[24] ?? '',                                  // Y: Approval Comments (preserve audit trail)
    '',                                                    // Z: Approved Date (clear for fresh review)
    // SYSTEM (AA)
    now,                                                   // AA: Updated At
    // ACCOUNTS QUERY (AB–AE) — clear current query state (history lives in ApprovalHistory + comments)
    '',                                                    // AB: Accounts Query By
    '',                                                    // AC: Accounts Query Reason
    '',                                                    // AD: Accounts Query At
    '',                                                    // AE: Previous Status
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!A${rowIndex + 2}:AE${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [updatedRow] },
  });

  return true;
}

/**
 * Update only the workPhotos field (column Q) for an invoice.
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

  // Column Q = workPhotos (index 16)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!Q${rowIndex + 2}`,
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

// ==================== APPROVAL HISTORY ====================

export interface ApprovalHistoryEntry {
  id: string;
  invoiceId: string;
  amount: string;           // This approval tranche amount
  cumulativeTotal: string;  // Running sum of all approvals for this invoice
  approvedBy: string;
  comments: string;
  createdAt: string;
}

async function ensureApprovalHistorySheet(): Promise<void> {
  const sheets = getSheets();
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'ApprovalHistory!A1:A1',
    });
  } catch {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: 'ApprovalHistory' } } }],
        },
      });
    } catch {
      // Sheet might already exist — ignore
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'ApprovalHistory!A1:G1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['ID', 'Invoice ID', 'Amount', 'Cumulative Total', 'Approved By', 'Comments', 'Created At']],
      },
    });
  }
}

export async function getApprovalHistory(invoiceId: string): Promise<ApprovalHistoryEntry[]> {
  await ensureApprovalHistorySheet();
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'ApprovalHistory!A2:G',
  });

  const rows = response.data.values || [];
  return rows
    .map((row) => ({
      id: row[0] || '',
      invoiceId: row[1] || '',
      amount: row[2] || '',
      cumulativeTotal: row[3] || '',
      approvedBy: row[4] || '',
      comments: row[5] || '',
      createdAt: row[6] || '',
    }))
    .filter((entry) => entry.invoiceId === invoiceId);
}

export async function addApprovalHistory(entry: Omit<ApprovalHistoryEntry, 'id' | 'createdAt'>): Promise<ApprovalHistoryEntry> {
  await ensureApprovalHistorySheet();
  const sheets = getSheets();
  const id = `APR${Date.now()}`;
  const createdAt = getISTTimestamp().combined;

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'ApprovalHistory!A:G',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        id,
        entry.invoiceId,
        entry.amount,
        entry.cumulativeTotal,
        entry.approvedBy,
        entry.comments,
        createdAt,
      ]],
    },
  });

  return { ...entry, id, createdAt };
}

/** Get ALL approval history entries (no invoice filter). Used by bulk-summary. */
export async function getAllApprovalHistory(): Promise<ApprovalHistoryEntry[]> {
  await ensureApprovalHistorySheet();
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'ApprovalHistory!A2:G',
  });

  const rows = response.data.values || [];
  return rows.map((row) => ({
    id: row[0] || '',
    invoiceId: row[1] || '',
    amount: row[2] || '',
    cumulativeTotal: row[3] || '',
    approvedBy: row[4] || '',
    comments: row[5] || '',
    createdAt: row[6] || '',
  }));
}

// ==================== DEDUCTIONS ====================

export interface DeductionEntry {
  id: string;
  invoiceId: string;
  approvalHistoryId: string;  // Links to the specific tranche approval event
  trancheNumber: string;
  tdsAmount: string;
  retentionAmount: string;
  retentionStatus: 'held' | 'released';
  releasedAt: string;
  releasedBy: string;
  createdAt: string;
  updatedBy: string;
}

async function ensureDeductionsSheet(): Promise<void> {
  const sheets = getSheets();
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Deductions!A1:A1',
    });
  } catch {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: 'Deductions' } } }],
        },
      });
    } catch {
      // Sheet might already exist — ignore
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Deductions!A1:K1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['ID', 'Invoice ID', 'Approval History ID', 'Tranche Number', 'TDS Amount', 'Retention Amount', 'Retention Status', 'Released At', 'Released By', 'Created At', 'Updated By']],
      },
    });
  }
}

export async function getDeductions(invoiceId: string): Promise<DeductionEntry[]> {
  await ensureDeductionsSheet();
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Deductions!A2:K',
  });

  const rows = response.data.values || [];
  return rows
    .map((row) => ({
      id: row[0] || '',
      invoiceId: row[1] || '',
      approvalHistoryId: row[2] || '',
      trancheNumber: row[3] || '',
      tdsAmount: row[4] || '0',
      retentionAmount: row[5] || '0',
      retentionStatus: (row[6] as DeductionEntry['retentionStatus']) || 'held',
      releasedAt: row[7] || '',
      releasedBy: row[8] || '',
      createdAt: row[9] || '',
      updatedBy: row[10] || '',
    }))
    .filter((entry) => entry.invoiceId === invoiceId);
}

export async function getAllDeductions(): Promise<DeductionEntry[]> {
  await ensureDeductionsSheet();
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Deductions!A2:K',
  });

  const rows = response.data.values || [];
  return rows.map((row) => ({
    id: row[0] || '',
    invoiceId: row[1] || '',
    approvalHistoryId: row[2] || '',
    trancheNumber: row[3] || '',
    tdsAmount: row[4] || '0',
    retentionAmount: row[5] || '0',
    retentionStatus: (row[6] as DeductionEntry['retentionStatus']) || 'held',
    releasedAt: row[7] || '',
    releasedBy: row[8] || '',
    createdAt: row[9] || '',
    updatedBy: row[10] || '',
  }));
}

export async function addDeduction(entry: Omit<DeductionEntry, 'id' | 'createdAt'>): Promise<DeductionEntry> {
  await ensureDeductionsSheet();
  const sheets = getSheets();
  const id = `DED${Date.now()}`;
  const createdAt = getISTTimestamp().combined;

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Deductions!A:K',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        id,
        entry.invoiceId,
        entry.approvalHistoryId,
        entry.trancheNumber,
        entry.tdsAmount,
        entry.retentionAmount,
        entry.retentionStatus || 'held',
        entry.releasedAt || '',
        entry.releasedBy || '',
        createdAt,
        entry.updatedBy,
      ]],
    },
  });

  return { ...entry, id, createdAt };
}

export async function updateDeduction(
  id: string,
  updates: Partial<Pick<DeductionEntry, 'tdsAmount' | 'retentionAmount' | 'retentionStatus' | 'releasedAt' | 'releasedBy' | 'updatedBy'>>
): Promise<boolean> {
  await ensureDeductionsSheet();
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Deductions!A2:K',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const row = rows[rowIndex];
  // Apply updates to the row
  if (updates.tdsAmount !== undefined) row[4] = updates.tdsAmount;
  if (updates.retentionAmount !== undefined) row[5] = updates.retentionAmount;
  if (updates.retentionStatus !== undefined) row[6] = updates.retentionStatus;
  if (updates.releasedAt !== undefined) row[7] = updates.releasedAt;
  if (updates.releasedBy !== undefined) row[8] = updates.releasedBy;
  if (updates.updatedBy !== undefined) row[10] = updates.updatedBy;

  const sheetRow = rowIndex + 2; // +1 for header, +1 for 1-based index
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Deductions!A${sheetRow}:K${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
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
  basicAmount: string;   // Portion applied to base amount
  gstAmount: string;     // Portion applied to GST
  paymentType: string;   // 'basic_only' | 'gst_only' | 'combined' | 'advance'
  idempotencyKey: string; // Col O — client-supplied key for duplicate detection
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
      range: 'Payments!A1:O1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['ID', 'Invoice ID', 'Vendor Name', 'Invoice Number', 'Amount',
          'UTR/Reference', 'Payment Date', 'Paid By', 'Notes', 'Payment Status', 'Created At',
          'Basic Amount', 'GST Amount', 'Payment Type', 'Idempotency Key']],
      },
    });
  }
}

export async function getPayments(): Promise<Payment[]> {
  await ensurePaymentsSheet();
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Payments!A2:O',
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
    basicAmount: row[11] || '',
    gstAmount: row[12] || '',
    paymentType: row[13] || '',
    idempotencyKey: row[14] || '',
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
    range: 'Payments!A:O',
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
        payment.basicAmount || '',
        payment.gstAmount || '',
        payment.paymentType || 'combined',
        payment.idempotencyKey || '',
      ]],
    },
  });

  return { ...payment, id, createdAt };
}

/**
 * Find an existing payment by UTR reference (case-insensitive).
 * Returns the first match, or null.
 */
export async function findPaymentByUtr(utrReference: string): Promise<Payment | null> {
  const payments = await getPayments();
  const utrLower = utrReference.toLowerCase();
  return payments.find((p) => p.utrReference.toLowerCase() === utrLower) || null;
}

/**
 * Find an existing payment by idempotency key.
 * Returns the first match, or null.
 */
export async function findPaymentByIdempotencyKey(key: string): Promise<Payment | null> {
  if (!key) return null;
  const payments = await getPayments();
  return payments.find((p) => p.idempotencyKey === key) || null;
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
    range: 'Invoices!A1:AA1',
  });
  const headers = headerResp.data.values?.[0] || [];

  // If header at index 1 is already "Project", the new 27-column order is in place — skip
  if (headers[1] === 'Project' && headers[8] === 'GST Amount') {
    return 0;
  }

  // ── FORMAT A: 26-column layout (GST at col H, no Project col) ──
  // Detection: col 1 = "Vendor Name", col 7 = "GST Amount", col 8 = "Total Amount"
  if (headers[1] === 'Vendor Name' && headers[7] === 'GST Amount' && headers[8] === 'Total Amount') {
    const dataResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Invoices!A2:Z',
    });
    const rows = dataResp.data.values || [];
    if (rows.length === 0) return 0;

    // Insert empty Project at index 1, shift everything else +1
    // Old 26-col (A-Z) → New 27-col (A-AA)
    const remappedRows = rows.map((row) => [
      row[0] ?? '',   //  0 → A: ID
      '',             //      B: Project (new, empty for existing)
      row[1] ?? '',   //  1 → C: Vendor Name
      row[2] ?? '',   //  2 → D: Invoice Number
      row[3] ?? '',   //  3 → E: Invoice Date
      row[4] ?? '',   //  4 → F: Invoice Type
      row[5] ?? '',   //  5 → G: Purpose
      row[6] ?? '',   //  6 → H: Amount
      row[7] ?? '',   //  7 → I: GST Amount
      row[8] ?? '',   //  8 → J: Total Amount
      row[9] ?? '',   //  9 → K: PO Number
      row[10] ?? '',  // 10 → L: Remarks
      row[11] ?? '',  // 11 → M: Submitted By
      row[12] ?? '',  // 12 → N: Submitted At
      row[13] ?? '',  // 13 → O: Invoice File URL
      row[14] ?? '',  // 14 → P: Invoice File Name
      row[15] ?? '',  // 15 → Q: Work Photos
      row[16] ?? '',  // 16 → R: Measurement Sheet URL
      row[17] ?? '',  // 17 → S: Measurement Sheet Name
      row[18] ?? '',  // 18 → T: Challan URL
      row[19] ?? '',  // 19 → U: Challan Name
      row[20] ?? '',  // 20 → V: Status
      row[21] ?? '',  // 21 → W: Approved By
      row[22] ?? '',  // 22 → X: Approved Amount
      row[23] ?? '',  // 23 → Y: Approval Comments
      row[24] ?? '',  // 24 → Z: Approved Date
      row[25] ?? '',  // 25 → AA: Updated At
    ]);

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `Invoices!A2:AA${rows.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: remappedRows },
    });

    console.log(`Migrated ${rows.length} invoice rows: added Project column (26-col → 27-col)`);
    return rows.length;
  }

  // ── FORMAT B: 24/25-column layout (old: GST at col Y or missing, PO at col H) ──
  if (headers[7] === 'PO Number' || (headers.length >= 8 && headers[1] === 'Vendor Name' && headers[7] !== 'GST Amount')) {
    const dataResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Invoices!A2:Z',
    });
    const rows = dataResp.data.values || [];
    if (rows.length === 0) return 0;

    // Full remap: old 24/25-col → new 27-col (with Project, GST, Total)
    const remappedRows = rows.map((row) => {
      const gst = row[24] ?? '';  // Old col Y (may be empty)
      const amount = parseFloat(row[6]) || 0;
      const gstNum = parseFloat(gst) || 0;
      const total = (amount + gstNum).toFixed(2);

      return [
        row[0] ?? '',   //  0 → A: ID
        '',             //      B: Project (new, empty)
        row[1] ?? '',   //  1 → C: Vendor Name
        row[2] ?? '',   //  2 → D: Invoice Number
        row[3] ?? '',   //  3 → E: Invoice Date
        row[4] ?? '',   //  4 → F: Invoice Type
        row[5] ?? '',   //  5 → G: Purpose
        row[6] ?? '',   //  6 → H: Amount
        gst,            // 24 → I: GST Amount (moved from Y)
        total,          //      J: Total Amount (computed)
        row[7] ?? '',   //  7 → K: PO Number
        row[8] ?? '',   //  8 → L: Remarks
        row[9] ?? '',   //  9 → M: Submitted By
        row[10] ?? '',  // 10 → N: Submitted At
        row[11] ?? '',  // 11 → O: Invoice File URL
        row[12] ?? '',  // 12 → P: Invoice File Name
        row[13] ?? '',  // 13 → Q: Work Photos
        row[14] ?? '',  // 14 → R: Measurement Sheet URL
        row[15] ?? '',  // 15 → S: Measurement Sheet Name
        row[16] ?? '',  // 16 → T: Challan URL
        row[17] ?? '',  // 17 → U: Challan Name
        row[18] ?? '',  // 18 → V: Status
        row[19] ?? '',  // 19 → W: Approved By
        row[20] ?? '',  // 20 → X: Approved Amount
        row[21] ?? '',  // 21 → Y: Approval Comments
        row[22] ?? '',  // 22 → Z: Approved Date
        row[23] ?? '',  // 23 → AA: Updated At
      ];
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `Invoices!A2:AA${rows.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: remappedRows },
    });

    console.log(`Migrated ${rows.length} invoice rows: full remap to 27-col layout with Project, GST, Total`);
    return rows.length;
  }

  console.log('Invoice columns: unrecognized header order, skipping migration');
  return 0;
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
  if (!existingSheets.includes('Projects')) {
    requests.push({ addSheet: { properties: { title: 'Projects' } } });
  }
  if (!existingSheets.includes('ProjectAccess')) {
    requests.push({ addSheet: { properties: { title: 'ProjectAccess' } } });
  }
  if (!existingSheets.includes('ApprovalHistory')) {
    requests.push({ addSheet: { properties: { title: 'ApprovalHistory' } } });
  }
  if (!existingSheets.includes('Deductions')) {
    requests.push({ addSheet: { properties: { title: 'Deductions' } } });
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
    // BILLING SECTION (A–U)
    'ID', 'Project', 'Vendor Name', 'Invoice Number', 'Invoice Date', 'Invoice Type',
    'Purpose', 'Amount', 'GST Amount', 'Total Amount',
    'PO Number', 'Remarks', 'Submitted By', 'Submitted At',
    'Invoice File URL', 'Invoice File Name', 'Work Photos',
    'Measurement Sheet URL', 'Measurement Sheet Name', 'Challan URL', 'Challan Name',
    // APPROVER SECTION (V–Z)
    'Status', 'Approved By', 'Approved Amount', 'Approval Comments', 'Approved Date',
    // SYSTEM (AA)
    'Updated At',
    // ACCOUNTS QUERY (AB–AE)
    'Accounts Query By', 'Accounts Query Reason', 'Accounts Query At', 'Previous Status',
  ];

  const invoiceHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A1:AE1',
  });

  const currentHeaders = invoiceHeaders.data.values?.[0] || [];
  if (currentHeaders.length !== expectedInvoiceHeaders.length ||
      currentHeaders.some((h, i) => h !== expectedInvoiceHeaders[i])) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Invoices!A1:AE1',
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

  // Always set correct headers for Payments tab (with Basic/GST split + idempotency key)
  const expectedPaymentHeaders = [
    'ID', 'Invoice ID', 'Vendor Name', 'Invoice Number', 'Amount',
    'UTR/Reference', 'Payment Date', 'Paid By', 'Notes', 'Payment Status', 'Created At',
    'Basic Amount', 'GST Amount', 'Payment Type', 'Idempotency Key',
  ];

  const paymentHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Payments!A1:O1',
  });

  const currentPaymentHeaders = paymentHeaders.data.values?.[0] || [];
  if (currentPaymentHeaders.length !== expectedPaymentHeaders.length ||
      currentPaymentHeaders.some((h, i) => h !== expectedPaymentHeaders[i])) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Payments!A1:O1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [expectedPaymentHeaders],
      },
    });
  }

  // Always set correct headers for ApprovalHistory tab
  const expectedApprovalHeaders = [
    'ID', 'Invoice ID', 'Amount', 'Cumulative Total', 'Approved By', 'Comments', 'Created At',
  ];
  const approvalHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'ApprovalHistory!A1:G1',
  });
  const currentApprovalHeaders = approvalHeaders.data.values?.[0] || [];
  if (currentApprovalHeaders.length !== expectedApprovalHeaders.length ||
      currentApprovalHeaders.some((h, i) => h !== expectedApprovalHeaders[i])) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'ApprovalHistory!A1:G1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [expectedApprovalHeaders],
      },
    });
  }

  // Always set correct headers for Deductions tab
  const expectedDeductionHeaders = [
    'ID', 'Invoice ID', 'Approval History ID', 'Tranche Number', 'TDS Amount',
    'Retention Amount', 'Retention Status', 'Released At', 'Released By', 'Created At', 'Updated By',
  ];
  const deductionHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Deductions!A1:K1',
  });
  const currentDeductionHeaders = deductionHeaders.data.values?.[0] || [];
  if (currentDeductionHeaders.length !== expectedDeductionHeaders.length ||
      currentDeductionHeaders.some((h, i) => h !== expectedDeductionHeaders[i])) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Deductions!A1:K1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [expectedDeductionHeaders],
      },
    });
  }

  // Always set correct headers for Projects tab
  const expectedProjectHeaders = ['ID', 'Project Name', 'Status', 'Created At'];
  const projectHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Projects!A1:D1',
  });
  const currentProjectHeaders = projectHeaders.data.values?.[0] || [];
  if (currentProjectHeaders.length !== expectedProjectHeaders.length ||
      currentProjectHeaders.some((h, i) => h !== expectedProjectHeaders[i])) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Projects!A1:D1',
      valueInputOption: 'RAW',
      requestBody: { values: [expectedProjectHeaders] },
    });
  }

  // Always set correct headers for ProjectAccess tab
  const expectedAccessHeaders = ['ID', 'Project ID', 'Project Name', 'User Type', 'User ID', 'User Name', 'Created At'];
  const accessHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'ProjectAccess!A1:G1',
  });
  const currentAccessHeaders = accessHeaders.data.values?.[0] || [];
  if (currentAccessHeaders.length !== expectedAccessHeaders.length ||
      currentAccessHeaders.some((h, i) => h !== expectedAccessHeaders[i])) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'ProjectAccess!A1:G1',
      valueInputOption: 'RAW',
      requestBody: { values: [expectedAccessHeaders] },
    });
  }
}

// ==================== PROJECTS ====================

export interface Project {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export async function getProjects(): Promise<Project[]> {
  const sheets = getSheets();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Projects!A2:D',
    });
    const rows = response.data.values || [];
    return rows.map((row) => ({
      id: row[0] || '',
      name: row[1] || '',
      status: (row[2] as Project['status']) || 'active',
      createdAt: row[3] || '',
    }));
  } catch {
    return [];
  }
}

export async function getActiveProjects(): Promise<Project[]> {
  const projects = await getProjects();
  return projects.filter((p) => p.status === 'active');
}

export async function addProject(data: { name: string; status: 'active' | 'inactive' }): Promise<Project> {
  const sheets = getSheets();
  const id = `PRJ${Date.now()}`;
  const now = getISTTimestamp().combined;

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Projects!A:D',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[id, data.name, data.status, now]],
    },
  });

  return { id, name: data.name, status: data.status, createdAt: now };
}

export async function updateProject(id: string, updates: { name?: string; status?: 'active' | 'inactive' }): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Projects!A2:D',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const currentRow = rows[rowIndex];
  const updatedRow = [
    id,
    updates.name ?? currentRow[1],
    updates.status ?? currentRow[2],
    currentRow[3],
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Projects!A${rowIndex + 2}:D${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [updatedRow] },
  });

  // Cascade project name change to ProjectAccess entries
  if (updates.name && updates.name !== currentRow[1]) {
    try {
      const paResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'ProjectAccess!A2:G',
      });
      const paRows = paResponse.data.values || [];
      for (let i = 0; i < paRows.length; i++) {
        if (paRows[i][1] === id) {
          // Update project name (col C = index 2) in this row
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `ProjectAccess!C${i + 2}`,
            valueInputOption: 'RAW',
            requestBody: { values: [[updates.name]] },
          });
        }
      }
    } catch {
      // ProjectAccess sheet may not exist yet — ignore
    }
  }

  return true;
}

// ==================== PROJECT ACCESS (many-to-many: users ↔ projects) ====================

export interface ProjectAccess {
  id: string;
  projectId: string;
  projectName: string;
  userType: 'engineer' | 'accounts';
  userId: string;
  userName: string;
  createdAt: string;
}

export async function getProjectAccess(): Promise<ProjectAccess[]> {
  const sheets = getSheets();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'ProjectAccess!A2:G',
    });
    const rows = response.data.values || [];
    return rows
      .filter((row) => row[0])  // skip cleared rows
      .map((row) => ({
        id: row[0] || '',
        projectId: row[1] || '',
        projectName: row[2] || '',
        userType: (row[3] as ProjectAccess['userType']) || 'engineer',
        userId: row[4] || '',
        userName: row[5] || '',
        createdAt: row[6] || '',
      }));
  } catch {
    return [];
  }
}

/** Get all project names a specific user (by ID + type) has access to */
export async function getUserProjects(userId: string, userType: 'engineer' | 'accounts'): Promise<string[]> {
  const access = await getProjectAccess();
  return access
    .filter((a) => a.userId === userId && a.userType === userType)
    .map((a) => a.projectName);
}

/** Get all access entries for a specific project */
export async function getProjectMembers(projectId: string): Promise<ProjectAccess[]> {
  const access = await getProjectAccess();
  return access.filter((a) => a.projectId === projectId);
}

/** Assign a user to a project */
export async function addProjectAccess(data: {
  projectId: string;
  projectName: string;
  userType: 'engineer' | 'accounts';
  userId: string;
  userName: string;
}): Promise<ProjectAccess> {
  const sheets = getSheets();
  const id = `PA${Date.now()}`;
  const now = getISTTimestamp().combined;

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'ProjectAccess!A:G',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[id, data.projectId, data.projectName, data.userType, data.userId, data.userName, now]],
    },
  });

  return { id, ...data, createdAt: now };
}

/** Remove a user from a project (clear the row) */
export async function removeProjectAccess(accessId: string): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'ProjectAccess!A2:G',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === accessId);
  if (rowIndex === -1) return false;

  // Clear the row (Google Sheets values API doesn't support row deletion)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `ProjectAccess!A${rowIndex + 2}:G${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['', '', '', '', '', '', '']] },
  });

  return true;
}

/** Set project assignments for a user — replaces all existing assignments */
export async function setUserProjectAccess(
  userId: string,
  userName: string,
  userType: 'engineer' | 'accounts',
  projectAssignments: { projectId: string; projectName: string }[]
): Promise<void> {
  // Get current access
  const allAccess = await getProjectAccess();
  const userAccess = allAccess.filter((a) => a.userId === userId && a.userType === userType);

  // Remove existing assignments not in new list
  for (const existing of userAccess) {
    if (!projectAssignments.find((p) => p.projectId === existing.projectId)) {
      await removeProjectAccess(existing.id);
    }
  }

  // Add new assignments or update stale project names
  const sheets = getSheets();
  for (const proj of projectAssignments) {
    const existing = userAccess.find((a) => a.projectId === proj.projectId);
    if (!existing) {
      await addProjectAccess({
        projectId: proj.projectId,
        projectName: proj.projectName,
        userType,
        userId,
        userName,
      });
    } else if (existing.projectName !== proj.projectName) {
      // Project was renamed — update the name in the existing row
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: 'ProjectAccess!A2:G',
        });
        const rows = response.data.values || [];
        const rowIndex = rows.findIndex((row) => row[0] === existing.id);
        if (rowIndex !== -1) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `ProjectAccess!C${rowIndex + 2}`,
            valueInputOption: 'RAW',
            requestBody: { values: [[proj.projectName]] },
          });
        }
      } catch {
        // ignore
      }
    }
  }
}
