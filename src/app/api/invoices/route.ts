import { NextRequest, NextResponse } from 'next/server';
import {
  getInvoices, getVendorInvoices, getInvoiceById, getActiveVendors,
  addInvoice, updateInvoiceStatus, resubmitInvoice,
} from '@/lib/google-sheets';
import {
  requireAuth, requireVendor, requireAdminOrApprover,
  isAuthError,
} from '@/lib/auth';
import type { VendorToken, AdminToken, ApproverToken } from '@/lib/auth';
import {
  rateLimit, getRateLimitKey, rateLimitResponse,
  sanitizeString, sanitizeAmount, sanitizeDate,
} from '@/lib/security';

// GET /api/invoices — get invoices (authenticated)
export async function GET(request: NextRequest) {
  try {
    const session = requireAuth(request);
    if (isAuthError(session)) return session;

    // Vendor/billing engineer: can view invoices for a selected vendor name
    // but must be authenticated first
    if (session.type === 'vendor') {
      const vendorNameParam = request.nextUrl.searchParams.get('vendorName');

      // Rate limit vendor queries: 30 per minute per IP
      const key = getRateLimitKey(request, 'vendor-invoices');
      const check = rateLimit(key, { maxRequests: 30, windowMs: 60_000 });
      if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

      if (!vendorNameParam) {
        return NextResponse.json({ invoices: [] });
      }

      const sanitizedName = sanitizeString(vendorNameParam, 100);
      if (!sanitizedName) {
        return NextResponse.json({ error: 'Invalid vendor name' }, { status: 400 });
      }

      // Verify this vendor actually exists
      const activeVendors = await getActiveVendors();
      const matchedVendor = activeVendors.find(
        (v) => v.name.toLowerCase() === sanitizedName.toLowerCase()
      );
      if (!matchedVendor) {
        return NextResponse.json({ invoices: [] }); // Return empty, don't reveal if vendor exists
      }

      const invoices = await getVendorInvoices(matchedVendor.name);
      invoices.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      return NextResponse.json({ invoices });
    }

    // Admin/Approver: can view all invoices
    if (session.type === 'admin' || session.type === 'approver') {
      const invoices = await getInvoices();
      invoices.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      return NextResponse.json({ invoices });
    }

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } catch (error) {
    console.error('Get invoices error:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

// POST /api/invoices — submit new invoice (vendor/billing engineer only)
export async function POST(request: NextRequest) {
  // Authenticate: must be a vendor/billing engineer
  const session = requireVendor(request);
  if (isAuthError(session)) return session;
  const vendorSession = session as VendorToken;

  // Rate limit submissions: 10 per minute per IP
  const key = getRateLimitKey(request, 'submit-invoice');
  const check = rateLimit(key, { maxRequests: 10, windowMs: 60_000 });
  if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

  try {
    const body = await request.json();

    // The billing engineer selects which vendor to submit for from a dropdown,
    // but they must be authenticated first. The vendorName comes from the body
    // (selected vendor), NOT from the session (the billing engineer's own identity).
    const vendorName = sanitizeString(body.vendorName, 100);
    const invoiceDate = sanitizeDate(body.invoiceDate);
    const invoiceNumber = sanitizeString(body.invoiceNumber, 50);
    const purpose = sanitizeString(body.purpose, 500);
    const amount = sanitizeAmount(body.amount);
    const remarks = sanitizeString(body.remarks, 500);
    const invoiceFileUrl = sanitizeString(body.invoiceFileUrl, 2000);
    const invoiceFileName = sanitizeString(body.invoiceFileName, 200);
    const workPhotos = sanitizeString(body.workPhotos, 5000);
    const measurementSheetUrl = sanitizeString(body.measurementSheetUrl, 2000);
    const measurementSheetName = sanitizeString(body.measurementSheetName, 200);

    // Validate required fields
    if (!vendorName) {
      return NextResponse.json({ error: 'Vendor name is required' }, { status: 400 });
    }
    if (!invoiceDate || !invoiceNumber || !purpose || amount === '0.00') {
      return NextResponse.json(
        { error: 'Invoice date, number, purpose, and a valid amount are required' },
        { status: 400 }
      );
    }

    // Verify vendor exists in the system
    const activeVendors = await getActiveVendors();
    const matchedVendor = activeVendors.find(
      (v) => v.name.toLowerCase() === vendorName.toLowerCase()
    );
    if (!matchedVendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 400 });
    }

    const invoice = await addInvoice({
      vendorName: matchedVendor.name, // Use exact DB name
      invoiceDate,
      invoiceNumber,
      purpose,
      amount,
      remarks,
      invoiceFileUrl,
      invoiceFileName,
      workPhotos,
      measurementSheetUrl,
      measurementSheetName,
      status: 'submitted',
    });

    return NextResponse.json({ success: true, invoice });
  } catch (error) {
    console.error('Submit invoice error:', error);
    return NextResponse.json({ error: 'Failed to submit invoice' }, { status: 500 });
  }
}

// PUT /api/invoices — update invoice status (admin or approver only)
export async function PUT(request: NextRequest) {
  // Authenticate: must be admin or approver
  const session = requireAdminOrApprover(request);
  if (isAuthError(session)) return session;

  const isAdmin = session.type === 'admin';
  const approverPayload = session.type === 'approver' ? session as ApproverToken : null;
  const adminPayload = session.type === 'admin' ? session as AdminToken : null;

  try {
    const body = await request.json();
    const id = sanitizeString(body.id, 50);
    const status = sanitizeString(body.status, 20);
    const approvalComments = sanitizeString(body.approvalComments, 500);

    if (!id || !status) {
      return NextResponse.json({ error: 'Invoice ID and status are required' }, { status: 400 });
    }

    const validStatuses = ['submitted', 'under_review', 'approved', 'paid', 'rejected'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Only admins can set status to 'paid'
    if (status === 'paid' && !isAdmin) {
      return NextResponse.json({ error: 'Only admins can mark invoices as paid' }, { status: 403 });
    }

    // Require comments/reason for approve and reject
    if ((status === 'approved' || status === 'rejected') && !approvalComments) {
      return NextResponse.json(
        { error: status === 'approved'
            ? 'Approval remarks are required'
            : 'Rejection reason is required' },
        { status: 400 }
      );
    }

    // Verify the invoice exists before updating
    const invoice = await getInvoiceById(id);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Prevent re-approving or re-rejecting an invoice already in that status
    if (invoice.status === status && (status === 'approved' || status === 'rejected' || status === 'paid')) {
      return NextResponse.json({ error: `Invoice is already ${status}` }, { status: 400 });
    }

    // Identity from session — never from client
    const approvedBy = approverPayload?.approverName || adminPayload?.username || '';

    const success = await updateInvoiceStatus(id, status as typeof invoice.status, approvalComments, approvedBy);
    if (!success) {
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update invoice error:', error);
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
  }
}

// PATCH /api/invoices — resubmit a rejected invoice (vendor/billing engineer only)
export async function PATCH(request: NextRequest) {
  // Authenticate: must be a vendor/billing engineer
  const session = requireVendor(request);
  if (isAuthError(session)) return session;

  // Rate limit resubmissions: 5 per minute per IP
  const key = getRateLimitKey(request, 'resubmit-invoice');
  const check = rateLimit(key, { maxRequests: 5, windowMs: 60_000 });
  if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

  try {
    const body = await request.json();

    const id = sanitizeString(body.id, 50);
    const vendorName = sanitizeString(body.vendorName, 100);

    if (!id || !vendorName) {
      return NextResponse.json({ error: 'Invoice ID and vendor name are required' }, { status: 400 });
    }

    // Verify the invoice exists, belongs to this vendor, and is rejected
    const invoice = await getInvoiceById(id);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    if (invoice.vendorName.toLowerCase() !== vendorName.toLowerCase()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (invoice.status !== 'rejected') {
      return NextResponse.json({ error: 'Only rejected invoices can be resubmitted' }, { status: 400 });
    }

    // Sanitize update fields
    const success = await resubmitInvoice(id, {
      invoiceDate: sanitizeDate(body.invoiceDate) || undefined,
      invoiceNumber: sanitizeString(body.invoiceNumber, 50) || undefined,
      purpose: sanitizeString(body.purpose, 500) || undefined,
      amount: sanitizeAmount(body.amount) || undefined,
      remarks: sanitizeString(body.remarks, 500),
      invoiceFileUrl: sanitizeString(body.invoiceFileUrl, 2000),
      invoiceFileName: sanitizeString(body.invoiceFileName, 200),
      workPhotos: sanitizeString(body.workPhotos, 5000),
      measurementSheetUrl: sanitizeString(body.measurementSheetUrl, 2000),
      measurementSheetName: sanitizeString(body.measurementSheetName, 200),
    });

    if (!success) {
      return NextResponse.json({ error: 'Failed to resubmit' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Resubmit invoice error:', error);
    return NextResponse.json({ error: 'Failed to resubmit invoice' }, { status: 500 });
  }
}
