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
  status: 'active' | 'inactive';
  createdAt: string;
}

export async function getVendors(): Promise<Vendor[]> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Vendors!A2:F',
  });

  const rows = response.data.values || [];
  return rows.map((row) => ({
    id: row[0] || '',
    name: row[1] || '',
    phone: row[2] || '',
    email: row[3] || '',
    status: (row[4] as 'active' | 'inactive') || 'active',
    createdAt: row[5] || '',
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
    range: 'Vendors!A:F',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[id, vendor.name, vendor.phone, vendor.email, vendor.status, createdAt]],
    },
  });

  return { ...vendor, id, createdAt };
}

export async function updateVendor(id: string, updates: Partial<Vendor>): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Vendors!A2:F',
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
    updates.status ?? currentRow[4],
    currentRow[5],
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Vendors!A${rowIndex + 2}:F${rowIndex + 2}`,
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
  status: 'submitted' | 'under_review' | 'approved' | 'partially_paid' | 'paid' | 'rejected';
  approvalComments: string;
  approvedBy: string;
  submittedAt: string;
  updatedAt: string;
  approvedDate: string; // Column R — set only when approved
  invoiceType: string;  // Column S — Advance, RA, Final
  submittedBy: string;  // Column T — engineer/vendor name who submitted
  poNumber: string;       // Column U — PO number (optional)
  challanUrl: string;     // Column V — Challan file URL (optional)
  challanName: string;    // Column W — Challan file name (optional)
  approvedAmount: string; // Column X — Amount approved by approver (may differ from invoice amount)
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
    invoiceType: row[18] || '',
    submittedBy: row[19] || '',
    poNumber: row[20] || '',
    challanUrl: row[21] || '',
    challanName: row[22] || '',
    approvedAmount: row[23] || '',
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
        invoice.invoiceType || '', // invoiceType
        invoice.submittedBy || '', // submittedBy
        invoice.poNumber || '', // PO number
        invoice.challanUrl || '', // Challan file URL
        invoice.challanName || '', // Challan file name
        '', // approvedAmount — empty until approved
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

  // Update column X (approvedAmount) when approving
  if (isApprovalAction && approvedAmount !== undefined) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `Invoices!X${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[approvedAmount]],
      },
    });
  }

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
    currentRow[18] ?? '', // keep invoiceType
    currentRow[19] ?? '', // keep submittedBy
    updates.poNumber ?? currentRow[20] ?? '', // PO number
    updates.challanUrl ?? currentRow[21] ?? '', // Challan URL
    updates.challanName ?? currentRow[22] ?? '', // Challan name
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!A${rowIndex + 2}:W${rowIndex + 2}`,
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

  // Column J = workPhotos (index 9)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!J${rowIndex + 2}`,
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
 * Migrates vendor rows from old 7-column format (with PIN) to new 6-column format (without PIN).
 * Old: [ID, Name, PIN, Phone, Email, Status, Created At]
 * New: [ID, Name, Phone, Email, Status, Created At]
 * Detection: row has 7 cells AND cell[2] looks like a PIN (numeric, 4-10 digits).
 * Returns count of migrated rows.
 */
export async function migrateVendorRows(): Promise<number> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Vendors!A2:G',
  });

  const rows = response.data.values || [];
  if (rows.length === 0) return 0;

  let migratedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Detect old 7-column format: has 7 cells and cell[2] looks like a PIN (all digits)
    if (row.length >= 7 && row[2] && /^\d{4,10}$/.test(row[2])) {
      // Old format: [ID, Name, PIN, Phone, Email, Status, CreatedAt]
      const newRow = [
        row[0],  // ID
        row[1],  // Name
        row[3],  // Phone (was column D, skip PIN at C)
        row[4],  // Email
        row[5],  // Status
        row[6],  // Created At
      ];

      const rowNumber = i + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Vendors!A${rowNumber}:F${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [newRow] },
      });

      // Clear the old column G (now empty after migration)
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Vendors!G${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [['']] },
      });

      migratedCount++;
      console.log(`Migrated vendor row ${row[0]} (row ${rowNumber}): removed PIN column`);
    }
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

  // Always set correct headers for Vendors tab (PIN column removed)
  const expectedVendorHeaders = ['ID', 'Vendor Name', 'Phone', 'Email', 'Status', 'Created At'];
  const vendorHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Vendors!A1:F1',
  });

  const currentVendorHeaders = vendorHeaders.data.values?.[0] || [];
  if (currentVendorHeaders.length !== expectedVendorHeaders.length ||
      currentVendorHeaders.some((h, i) => h !== expectedVendorHeaders[i])) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Vendors!A1:F1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [expectedVendorHeaders],
      },
    });
  }

  // Always set correct headers for Invoices tab (fixes stale/mismatched headers)
  const expectedInvoiceHeaders = [
    'ID', 'Vendor Name', 'Invoice Date', 'Invoice Number', 'Purpose', 'Amount',
    'Remarks', 'Invoice File URL', 'Invoice File Name', 'Work Photos',
    'Measurement Sheet URL', 'Measurement Sheet Name', 'Status',
    'Approval Comments', 'Approved By', 'Submitted At', 'Updated At', 'Approved Date',
    'Invoice Type', 'Submitted By', 'PO Number', 'Challan URL', 'Challan Name', 'Approved Amount'
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
