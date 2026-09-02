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

// ==================== INVOICES ====================

export interface Invoice {
  id: string;
  vendorName: string;
  invoiceDate: string;
  invoiceNumber: string;
  purpose: string;
  amount: string;
  remarks: string;
  fileUrl: string;
  fileName: string;
  status: 'submitted' | 'under_review' | 'approved' | 'paid' | 'rejected';
  submittedAt: string;
  updatedAt: string;
}

export async function getInvoices(): Promise<Invoice[]> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:L',
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
    fileUrl: row[7] || '',
    fileName: row[8] || '',
    status: (row[9] as Invoice['status']) || 'submitted',
    submittedAt: row[10] || '',
    updatedAt: row[11] || '',
  }));
}

export async function getVendorInvoices(vendorName: string): Promise<Invoice[]> {
  const invoices = await getInvoices();
  return invoices.filter((inv) => inv.vendorName === vendorName);
}

export async function addInvoice(invoice: Omit<Invoice, 'id' | 'submittedAt' | 'updatedAt'>): Promise<Invoice> {
  const sheets = getSheets();
  const id = `INV${Date.now()}`;
  const now = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A:L',
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
        invoice.fileUrl,
        invoice.fileName,
        invoice.status || 'submitted',
        now,
        now,
      ]],
    },
  });

  return { ...invoice, id, submittedAt: now, updatedAt: now };
}

export async function updateInvoiceStatus(id: string, status: Invoice['status']): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:L',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  const now = new Date().toISOString();

  // Update status (column J = index 9) and updatedAt (column L = index 11)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!J${rowIndex + 2}:L${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[status, rows[rowIndex][10], now]] },
  });

  return true;
}

// ==================== SHEET SETUP ====================

export async function initializeSheetHeaders(): Promise<void> {
  const sheets = getSheets();

  // Check if Vendors tab exists
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

  // Set headers for Invoices tab
  const invoiceHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A1:L1',
  });

  if (!invoiceHeaders.data.values || invoiceHeaders.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'Invoices!A1:L1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['ID', 'Vendor Name', 'Invoice Date', 'Invoice Number', 'Purpose', 'Amount', 'Remarks', 'File URL', 'File Name', 'Status', 'Submitted At', 'Updated At']],
      },
    });
  }
}
