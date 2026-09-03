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
  pin: string;
  phone: string;
  email: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export async function getVendors(): Promise<Vendor[]> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Vendors!A2:G',
  });

  const rows = response.data.values || [];
  return rows.map((row) => ({
    id: row[0] || '',
    name: row[1] || '',
    pin: row[2] || '',
    phone: row[3] || '',
    email: row[4] || '',
    status: (row[5] as 'active' | 'inactive') || 'active',
    createdAt: row[6] || '',
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
    range: 'Vendors!A:G',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[id, vendor.name, vendor.pin, vendor.phone, vendor.email, vendor.status, createdAt]],
    },
  });

  return { ...vendor, id, createdAt };
}

export async function updateVendor(id: string, updates: Partial<Vendor>): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Vendors!A2:G',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const currentRow = rows[rowIndex];
  const updatedRow = [
    id,
    updates.name ?? currentRow[1],
    updates.pin ?? currentRow[2],
    updates.phone ?? currentRow[3],
    updates.email ?? currentRow[4],
    updates.status ?? currentRow[5],
    currentRow[6],
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Vendors!A${rowIndex + 2}:G${rowIndex + 2}`,
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

export async function getEngineers(): Promise<Engineer[]> {
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
  id: string;
  vendorName: string;
  invoiceDate: string;
  invoiceNumber: string;
  purpose: string;
  amount: string;
  remarks: string;
  invoiceFileUrl: string;
  invoiceFileName: string;
  workPhotos: string; // comma-separated URLs
  measurementSheetUrl: string;
  measurementSheetName: string;
  status: 'submitted' | 'under_review' | 'approved' | 'paid' | 'rejected';
  approvalComments: string;
  approvedBy: string;
  submittedAt: string;
  updatedAt: string;
  approvedDate: string; // Column R — set only when approved/paid
}

export async function getInvoices(): Promise<Invoice[]> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:R',
  });

  const rows = response.data.values || [];
  return rows.map((row) => ({
    id: row[0] || '',
    vendorName: row[1] || '',
    invoiceDate: row[2] || '',
    invoiceNumber: row[3] || '',
    purpose: row[4] || '',
    amount: row[5] || '',
    remarks: row[6] || '',
    invoiceFileUrl: row[7] || '',
    invoiceFileName: row[8] || '',
    workPhotos: row[9] || '',
    measurementSheetUrl: row[10] || '',
    measurementSheetName: row[11] || '',
    status: (row[12] as Invoice['status']) || 'submitted',
    approvalComments: row[13] || '',
    approvedBy: row[14] || '',
    submittedAt: row[15] || '',
    updatedAt: row[16] || '',
    approvedDate: row[17] || '',
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
  invoice: Omit<Invoice, 'id' | 'submittedAt' | 'updatedAt' | 'approvedDate' | 'approvalComments' | 'approvedBy'>
): Promise<Invoice> {
  const sheets = getSheets();
  const id = `INV${Date.now()}`;
  const now = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A:R',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        id,
        invoice.vendorName,
        invoice.invoiceDate,
        invoice.invoiceNumber,
        invoice.purpose,
        invoice.amount,
        invoice.remarks,
        invoice.invoiceFileUrl,
        invoice.invoiceFileName,
        invoice.workPhotos,
        invoice.measurementSheetUrl,
        invoice.measurementSheetName,
        invoice.status || 'submitted',
        '', // approvalComments
        '', // approvedBy
        now, // submittedAt
        now, // updatedAt
        '', // approvedDate — empty until approved
      ]],
    },
  });

  return { ...invoice, id, approvalComments: '', approvedBy: '', submittedAt: now, updatedAt: now, approvedDate: '' };
}

export async function updateInvoiceStatus(
  id: string,
  status: Invoice['status'],
  approvalComments?: string,
  approvedBy?: string
): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:R',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const now = new Date().toISOString();
  const currentRow = rows[rowIndex];

  // Set approvedDate only when transitioning to approved or paid
  const isApprovalAction = status === 'approved' || status === 'paid';
  const approvedDate = isApprovalAction ? now : (currentRow[17] ?? '');

  // Update columns M–R: status, approval comments, approved by, submitted at, updated at, approved date
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!M${rowIndex + 2}:R${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        status,
        approvalComments ?? currentRow[13] ?? '',
        approvedBy ?? currentRow[14] ?? '',
        currentRow[15] ?? now, // keep original submitted at
        now, // updated at
        approvedDate, // approved date — only set on approve/paid
      ]],
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
  }
): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:R',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const currentRow = rows[rowIndex];
  const now = new Date().toISOString();

  // Update the full row — keep original vendor name & ID, apply edits, reset status to submitted
  const updatedRow = [
    id,
    currentRow[1], // vendorName stays same
    updates.invoiceDate ?? currentRow[2],
    updates.invoiceNumber ?? currentRow[3],
    updates.purpose ?? currentRow[4],
    updates.amount ?? currentRow[5],
    updates.remarks ?? currentRow[6],
    updates.invoiceFileUrl ?? currentRow[7] ?? '',
    updates.invoiceFileName ?? currentRow[8] ?? '',
    updates.workPhotos ?? currentRow[9] ?? '',
    updates.measurementSheetUrl ?? currentRow[10] ?? '',
    updates.measurementSheetName ?? currentRow[11] ?? '',
    'submitted', // reset status
    '', // clear approval comments
    '', // clear approved by
    currentRow[15], // keep original submitted at
    now, // update updated at
    '', // clear approved date on resubmit
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!A${rowIndex + 2}:R${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [updatedRow] },
  });

  return true;
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

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests },
    });
  }

  // Set headers for Vendors tab
  const vendorHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Vendors!A1:G1',
  });

  if (!vendorHeaders.data.values || vendorHeaders.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Vendors!A1:G1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['ID', 'Vendor Name', 'PIN', 'Phone', 'Email', 'Status', 'Created At']],
      },
    });
  }

  // Always set correct headers for Invoices tab (fixes stale/mismatched headers)
  const expectedInvoiceHeaders = [
    'ID', 'Vendor Name', 'Invoice Date', 'Invoice Number', 'Purpose', 'Amount',
    'Remarks', 'Invoice File URL', 'Invoice File Name', 'Work Photos',
    'Measurement Sheet URL', 'Measurement Sheet Name', 'Status',
    'Approval Comments', 'Approved By', 'Submitted At', 'Updated At', 'Approved Date'
  ];

  const invoiceHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A1:R1',
  });

  const currentHeaders = invoiceHeaders.data.values?.[0] || [];
  if (currentHeaders.length !== expectedInvoiceHeaders.length ||
      currentHeaders.some((h, i) => h !== expectedInvoiceHeaders[i])) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Invoices!A1:R1',
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
}
