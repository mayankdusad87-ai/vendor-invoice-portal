/**
 * Cost Heads — modular data layer for construction cost categorization.
 *
 * Manages the CostHeads sheet (admin-defined master list of cost categories)
 * and provides helpers for reading/writing cost tags on invoices.
 *
 * Sheet: CostHeads
 * Columns: A=ID, B=Category, C=SubCategory, D=IsActive, E=CreatedAt, F=CreatedBy
 *
 * Invoice columns (AF–AH) are handled by the main google-sheets.ts module;
 * this file owns only the CostHeads master list and tag-update logic.
 */

import { google } from 'googleapis';
import { getISTTimestamp } from './google-sheets';

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CostHead {
  id: string;
  category: string;     // e.g., "CIVIL", "MEP", "FINISHING", "CONSULTANT"
  subCategory: string;  // e.g., "Sub-Structure", "Electrical", "Painting"
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}

/** Grouped view for UI dropdowns */
export interface CostHeadGroup {
  category: string;
  subCategories: { id: string; name: string; isActive: boolean }[];
}

// ─── Default seed data (used on first setup) ────────────────────────────────

const DEFAULT_COST_HEADS: Array<{ category: string; subCategory: string }> = [
  // Civil
  { category: 'CIVIL', subCategory: 'Sub-Structure' },
  { category: 'CIVIL', subCategory: 'Super-Structure' },
  { category: 'CIVIL', subCategory: 'General' },
  // MEP
  { category: 'MEP', subCategory: 'Electrical' },
  { category: 'MEP', subCategory: 'Plumbing' },
  { category: 'MEP', subCategory: 'HVAC' },
  { category: 'MEP', subCategory: 'Fire Fighting' },
  // Finishing
  { category: 'FINISHING', subCategory: 'Painting' },
  { category: 'FINISHING', subCategory: 'Flooring & Tiling' },
  { category: 'FINISHING', subCategory: 'Carpentry & Joinery' },
  { category: 'FINISHING', subCategory: 'False Ceiling' },
  { category: 'FINISHING', subCategory: 'Waterproofing' },
  // Consultant
  { category: 'CONSULTANT', subCategory: 'Architect' },
  { category: 'CONSULTANT', subCategory: 'Structural' },
  { category: 'CONSULTANT', subCategory: 'MEP Consultant' },
  { category: 'CONSULTANT', subCategory: 'PMC' },
  // Other
  { category: 'OTHER', subCategory: 'Miscellaneous' },
  { category: 'OTHER', subCategory: 'Site Establishment' },
];

// Cost type options (separate dimension — not stored in CostHeads sheet)
export const COST_TYPES = ['Material', 'Labor', 'Consultant', 'Equipment', 'Mixed'] as const;
export type CostType = typeof COST_TYPES[number];

// ─── Sheet initialization ────────────────────────────────────────────────────

/**
 * Ensure the CostHeads sheet exists with proper headers.
 * Called from /api/setup. Safe to call multiple times.
 */
export async function ensureCostHeadsSheet(): Promise<{ created: boolean; seeded: number }> {
  const sheets = getSheets();

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existingSheets = spreadsheet.data.sheets?.map((s) => s.properties?.title) || [];

  let created = false;
  if (!existingSheets.includes('CostHeads')) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: 'CostHeads' } } }],
      },
    });
    created = true;
  }

  // Ensure headers
  const expectedHeaders = ['ID', 'Category', 'Sub-Category', 'Is Active', 'Created At', 'Created By'];
  const headerResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'CostHeads!A1:F1',
  });

  const currentHeaders = headerResp.data.values?.[0] || [];
  if (currentHeaders.length !== expectedHeaders.length ||
      currentHeaders.some((h, i) => h !== expectedHeaders[i])) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'CostHeads!A1:F1',
      valueInputOption: 'RAW',
      requestBody: { values: [expectedHeaders] },
    });
  }

  // Seed with defaults if empty
  let seeded = 0;
  if (created) {
    const now = getISTTimestamp().combined;
    const seedRows = DEFAULT_COST_HEADS.map((ch, i) => [
      `CH${Date.now() + i}`,   // A: ID
      ch.category,              // B: Category
      ch.subCategory,           // C: Sub-Category
      'TRUE',                   // D: Is Active
      now,                      // E: Created At
      'system',                 // F: Created By
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'CostHeads!A:F',
      valueInputOption: 'RAW',
      requestBody: { values: seedRows },
    });
    seeded = seedRows.length;
  }

  return { created, seeded };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

/** Get all cost heads */
export async function getCostHeads(): Promise<CostHead[]> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'CostHeads!A2:F',
  });

  const rows = response.data.values || [];
  return rows.map((row) => ({
    id: row[0] || '',
    category: row[1] || '',
    subCategory: row[2] || '',
    isActive: row[3] !== 'FALSE',
    createdAt: row[4] || '',
    createdBy: row[5] || '',
  }));
}

/** Get active cost heads grouped by category (for dropdowns) */
export async function getCostHeadGroups(): Promise<CostHeadGroup[]> {
  const all = await getCostHeads();
  const active = all.filter((ch) => ch.isActive);

  const groups = new Map<string, CostHeadGroup>();
  for (const ch of active) {
    if (!groups.has(ch.category)) {
      groups.set(ch.category, { category: ch.category, subCategories: [] });
    }
    groups.get(ch.category)!.subCategories.push({
      id: ch.id,
      name: ch.subCategory,
      isActive: ch.isActive,
    });
  }

  // Sort categories alphabetically, with "OTHER" last
  return Array.from(groups.values()).sort((a, b) => {
    if (a.category === 'OTHER') return 1;
    if (b.category === 'OTHER') return -1;
    return a.category.localeCompare(b.category);
  });
}

/** Add a new cost head (admin only) */
export async function addCostHead(
  category: string,
  subCategory: string,
  createdBy: string,
): Promise<CostHead> {
  const sheets = getSheets();
  const id = `CH${Date.now()}`;
  const now = getISTTimestamp().combined;

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'CostHeads!A:F',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[id, category.toUpperCase().trim(), subCategory.trim(), 'TRUE', now, createdBy]],
    },
  });

  return { id, category: category.toUpperCase().trim(), subCategory: subCategory.trim(), isActive: true, createdAt: now, createdBy };
}

/** Toggle active status of a cost head (admin only) */
export async function toggleCostHead(id: string, isActive: boolean): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'CostHeads!A2:F',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === id);
  if (rowIndex === -1) return false;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `CostHeads!D${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[isActive ? 'TRUE' : 'FALSE']] },
  });

  return true;
}

// ─── Invoice cost tagging ────────────────────────────────────────────────────

/**
 * Update cost tags on an invoice (columns AF–AH).
 * Can be called by engineer at submission or accounts for retroactive tagging.
 */
export async function updateInvoiceCostTag(
  invoiceId: string,
  costCategory: string,
  costSubCategory: string,
  costType: string,
): Promise<boolean> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Invoices!A2:A',
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === invoiceId);
  if (rowIndex === -1) return false;

  // Columns AF=32(0-indexed), AG=33, AH=34 → AF=col 32 → row offset +2
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Invoices!AF${rowIndex + 2}:AH${rowIndex + 2}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[costCategory.toUpperCase().trim(), costSubCategory.trim(), costType.trim()]],
    },
  });

  return true;
}
