import { NextRequest, NextResponse } from 'next/server';
import {
  getInvoices, getVendorInvoices, getInvoiceById, getActiveVendors,
  addInvoice, updateInvoiceStatus, resubmitInvoice,
  addApprovalHistory, getApprovalHistory,
  ConflictError,
} from '@/lib/google-sheets';
import {
  requireAuth, requireEngineerOrVendor, requireAdminOrApprover,
  isAuthError,
} from '@/lib/auth';
import type { ApproverToken, EngineerToken } from '@/lib/auth';
import {
  rateLimit, getRateLimitKey, rateLimitResponse,
  sanitizeString, sanitizeAmount, sanitizeDate,
} from '@/lib/security';

// ── State-transition rules (standard approval flow only) ──
// Other flows (resolve_accounts_query, increase_approved_amount) have their own guards.
const ALLOWED_STANDARD_TRANSITIONS: Record<string, string[]> = {
  submitted:    ['under_review', 'approved', 'rejected'],
  under_review: ['approved', 'rejected'],
};

// GET /api/invoices — get invoices (authenticated)
export async function GET(request: NextRequest) {
  try {
    const session = requireAuth(request);
    if (isAuthError(session)) return session;

    // Engineer or vendor: can view invoices for a selected vendor name
    // Filtered by project access — engineers only see invoices for their assigned projects
    if (session.type === 'engineer' || session.type === 'vendor') {
      const vendorNameParam = request.nextUrl.searchParams.get('vendorName');

      // Rate limit vendor queries: 30 per minute per IP
      const key = getRateLimitKey(request, 'vendor-invoices');
      const check = rateLimit(key, { maxRequests: 30, windowMs: 60_000 });
      if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

      // Get engineer's project access for filtering
      const engineerProjects = session.type === 'engineer'
        ? (session as import('@/lib/auth').EngineerToken).projects
        : [];

      // No vendor filter → return all invoices for the billing manager (filtered by project)
      if (!vendorNameParam) {
        let invoices = await getInvoices();
        // Filter by project access if the engineer has assigned projects
        if (engineerProjects.length > 0) {
          invoices = invoices.filter((inv) => engineerProjects.includes(inv.project));
        }
        invoices.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
        return NextResponse.json({ invoices });
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

      let invoices = await getVendorInvoices(matchedVendor.name);
      // Filter by project access
      if (engineerProjects.length > 0) {
        invoices = invoices.filter((inv) => engineerProjects.includes(inv.project));
      }
      invoices.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      return NextResponse.json({ invoices });
    }

    // Admin/Approver: can view all invoices (approver is common across projects)
    if (session.type === 'admin' || session.type === 'approver') {
      const invoices = await getInvoices();
      invoices.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      return NextResponse.json({ invoices });
    }

    // Accounts team: can view approved/partially_paid/paid/rejected/accounts_query/correction_required invoices
    // Filtered by project access — accounts only see invoices for their assigned projects
    if (session.type === 'accounts') {
      const accountsProjects = (session as import('@/lib/auth').AccountsToken).projects;
      const invoices = await getInvoices();
      let accountsVisible = invoices.filter(
        (inv) => ['approved', 'partially_paid', 'paid', 'rejected', 'accounts_query', 'correction_required'].includes(inv.status)
      );
      // Filter by project access if the accounts member has assigned projects
      if (accountsProjects.length > 0) {
        accountsVisible = accountsVisible.filter((inv) => accountsProjects.includes(inv.project));
      }
      accountsVisible.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      return NextResponse.json({ invoices: accountsVisible });
    }

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } catch (error) {
    console.error('Get invoices error:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

// POST /api/invoices — submit new invoice (engineer or vendor only)
export async function POST(request: NextRequest) {
  // Authenticate: must be an engineer or vendor
  const session = requireEngineerOrVendor(request);
  if (isAuthError(session)) return session;

  // Rate limit submissions: 10 per minute per IP
  const key = getRateLimitKey(request, 'submit-invoice');
  const check = rateLimit(key, { maxRequests: 10, windowMs: 60_000 });
  if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

  try {
    const body = await request.json();

    // The billing engineer selects which vendor to submit for from a dropdown,
    // but they must be authenticated first. The vendorName comes from the body
    // (selected vendor), NOT from the session (the billing engineer's own identity).
    const project = sanitizeString(body.project, 100);
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
    const invoiceType = sanitizeString(body.invoiceType, 20);
    const poNumber = sanitizeString(body.poNumber, 50);
    const challanUrl = sanitizeString(body.challanUrl, 2000);
    const challanName = sanitizeString(body.challanName, 200);
    // GST: sanitize as amount (reject non-numeric/negative), but allow empty (optional field)
    const rawGst = body.gstAmount;
    const gstAmount = rawGst ? sanitizeAmount(rawGst) : '';

    // Derive submittedBy from authenticated session — never from client
    const submittedBy = session.type === 'engineer'
      ? (session as import('@/lib/auth').EngineerToken).engineerName
      : session.type === 'vendor'
        ? (session as import('@/lib/auth').VendorToken).vendorName
        : '';

    // Validate required fields
    if (!project) {
      return NextResponse.json({ error: 'Project is required' }, { status: 400 });
    }

    // Verify engineer has access to this project
    if (session.type === 'engineer') {
      const engineerSession = session as import('@/lib/auth').EngineerToken;
      if (engineerSession.projects.length > 0 && !engineerSession.projects.includes(project)) {
        return NextResponse.json({ error: 'You do not have access to this project' }, { status: 403 });
      }
    }

    if (!vendorName) {
      return NextResponse.json({ error: 'Vendor name is required' }, { status: 400 });
    }
    if (!invoiceDate || !invoiceNumber || !purpose || amount === '0.00') {
      return NextResponse.json(
        { error: 'Invoice date, number, purpose, and a valid amount are required' },
        { status: 400 }
      );
    }

    // Validate invoice type
    const validTypes = ['advance', 'ra', 'final'];
    if (!invoiceType || !validTypes.includes(invoiceType)) {
      return NextResponse.json(
        { error: 'Invoice type is required (Advance, RA, or Final)' },
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
      project,
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
      invoiceType,
      submittedBy,
      poNumber,
      challanUrl,
      challanName,
      gstAmount: gstAmount || '',
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

  const approverPayload = session.type === 'approver' ? session as ApproverToken : null;

  try {
    const body = await request.json();
    const id = sanitizeString(body.id, 50);
    const status = sanitizeString(body.status, 20);
    const approvalComments = sanitizeString(body.approvalComments, 500);

    if (!id) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    // Verify the invoice exists before any action
    const invoice = await getInvoiceById(id);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Identity from session — never from client
    const approvedBy = approverPayload?.approverName || (session.type === 'admin' ? 'Admin' : '');

    // ── Special action: increase approved amount on a partially_paid invoice ──
    // ADDITIVE MODEL: the entered amount is ADDED to the current approved total
    if (body.action === 'increase_approved_amount') {
      if (invoice.status !== 'partially_paid' && invoice.status !== 'paid') {
        return NextResponse.json(
          { error: 'Can only increase approved amount on partially paid or paid invoices' },
          { status: 400 }
        );
      }
      const rawAmount = body.approvedAmount;
      if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
        return NextResponse.json({ error: 'Additional approved amount is required' }, { status: 400 });
      }
      const additionalAmount = parseFloat(rawAmount);
      if (isNaN(additionalAmount) || additionalAmount <= 0) {
        return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
      }
      const invoiceAmount = parseFloat(invoice.amount) || 0;
      const gstAmount = parseFloat(invoice.gstAmount) || 0;
      const totalInvoiceAmount = invoiceAmount + gstAmount;
      const currentApproved = parseFloat(invoice.approvedAmount) || 0;

      // New cumulative total = current approved + additional amount entered
      const newCumulativeApproved = currentApproved + additionalAmount;

      if (newCumulativeApproved > totalInvoiceAmount + 0.01) {
        const maxAdditional = totalInvoiceAmount - currentApproved;
        return NextResponse.json(
          { error: `Additional ₹${additionalAmount.toLocaleString('en-IN')} would exceed invoice total (₹${totalInvoiceAmount.toLocaleString('en-IN')}). Maximum additional: ₹${Math.max(0, maxAdditional).toLocaleString('en-IN')}` },
          { status: 400 }
        );
      }

      // Build tranche detail note (used in both ApprovalHistory and Invoices sheet)
      const trancheNote = `+₹${additionalAmount.toLocaleString('en-IN')} authorized (total: ₹${newCumulativeApproved.toLocaleString('en-IN')})`;

      // Log to ApprovalHistory with full tranche detail and status transition marker
      await addApprovalHistory({
        invoiceId: id,
        amount: String(additionalAmount),
        cumulativeTotal: String(newCumulativeApproved),
        approvedBy: approvedBy || invoice.approvedBy,
        comments: `${approvalComments ? approvalComments + ' | ' : ''}${trancheNote} (${invoice.status} → partially_paid)`,
      });
      const userComment = approvalComments ? `${approvalComments} | ${trancheNote}` : trancheNote;
      const existingComments = invoice.approvalComments || '';
      const updatedComments = existingComments
        ? `${existingComments}\n${userComment}`
        : userComment;

      // Update invoice with new cumulative approved amount and appended comments
      // Pass expectedUpdatedAt for optimistic concurrency
      const success = await updateInvoiceStatus(
        id, 'partially_paid',
        updatedComments,
        approvedBy || invoice.approvedBy,
        String(newCumulativeApproved),
        invoice.updatedAt,
      );
      if (!success) {
        return NextResponse.json({ error: 'Failed to update approved amount' }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        approvedAmount: String(newCumulativeApproved),
        additionalAmount: String(additionalAmount),
      });
    }

    // ── Resolve accounts query — approver accepts or disagrees ──
    if (body.action === 'resolve_accounts_query') {
      if (invoice.status !== 'accounts_query') {
        return NextResponse.json(
          { error: 'Invoice is not in accounts_query status' },
          { status: 400 }
        );
      }

      const resolution = sanitizeString(body.resolution, 30); // 'accept' or 'disagree'
      const responseComment = sanitizeString(body.approvalComments, 500);

      if (!resolution || !['accept', 'disagree'].includes(resolution)) {
        return NextResponse.json({ error: 'Resolution must be "accept" or "disagree"' }, { status: 400 });
      }
      if (!responseComment || responseComment.length < 3) {
        return NextResponse.json({ error: 'A comment/reason is required (min 3 characters)' }, { status: 400 });
      }

      if (resolution === 'accept') {
        // Approver accepts the accounts query → send for correction
        const trailNote = `[Query Accepted by ${approvedBy}] ${responseComment}`;
        const existingComments = invoice.approvalComments || '';
        const updatedComments = existingComments
          ? `${existingComments}\n${trailNote}`
          : trailNote;

        const success = await updateInvoiceStatus(
          id,
          'correction_required',
          updatedComments,
          approvedBy,
          undefined,
          invoice.updatedAt, // optimistic concurrency
        );
        if (!success) {
          return NextResponse.json({ error: 'Failed to accept query' }, { status: 500 });
        }

        // Log to ApprovalHistory
        await addApprovalHistory({
          invoiceId: id,
          amount: '0',
          cumulativeTotal: invoice.approvedAmount || '0',
          approvedBy,
          comments: `[QUERY_ACCEPTED] ${responseComment} (accounts_query → correction_required)`,
        });

        return NextResponse.json({ success: true, newStatus: 'correction_required' });
      } else {
        // Approver disagrees with accounts query → restore previous status
        const previousStatus = (invoice.previousStatus || 'approved') as typeof invoice.status;
        const trailNote = `[Query Disagreed by ${approvedBy}] ${responseComment}`;
        const existingComments = invoice.approvalComments || '';
        const updatedComments = existingComments
          ? `${existingComments}\n${trailNote}`
          : trailNote;

        const success = await updateInvoiceStatus(
          id,
          previousStatus,
          updatedComments,
          approvedBy,
          undefined,
          invoice.updatedAt, // optimistic concurrency
        );
        if (!success) {
          return NextResponse.json({ error: 'Failed to restore status' }, { status: 500 });
        }

        // Log to ApprovalHistory
        await addApprovalHistory({
          invoiceId: id,
          amount: '0',
          cumulativeTotal: invoice.approvedAmount || '0',
          approvedBy,
          comments: `[QUERY_DISAGREED] ${responseComment} (accounts_query → ${previousStatus})`,
        });

        return NextResponse.json({ success: true, newStatus: previousStatus });
      }
    }

    // ── Standard status change flow ──
    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    const validStatuses = ['submitted', 'under_review', 'approved', 'rejected'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // ── STATE TRANSITION VALIDATION ──
    // Only allow transitions defined in the state machine.
    // The backend determines what's valid — the frontend cannot dictate arbitrary status.
    const allowedNext = ALLOWED_STANDARD_TRANSITIONS[invoice.status];
    if (!allowedNext || !allowedNext.includes(status)) {
      return NextResponse.json(
        { error: `Cannot change status from "${invoice.status}" to "${status}"` },
        { status: 400 }
      );
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

    // Validate approved amount when approving (max = amount + GST)
    let approvedAmount: string | undefined;
    if (status === 'approved') {
      const rawAmount = body.approvedAmount;
      if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
        return NextResponse.json({ error: 'Approved amount is required when approving' }, { status: 400 });
      }
      const parsedAmount = parseFloat(rawAmount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return NextResponse.json({ error: 'Approved amount must be a positive number' }, { status: 400 });
      }
      const invoiceAmount = parseFloat(invoice.amount) || 0;
      const gstAmount = parseFloat(invoice.gstAmount) || 0;
      const totalInvoiceAmount = invoiceAmount + gstAmount;
      if (parsedAmount > totalInvoiceAmount + 0.01) {
        return NextResponse.json(
          { error: `Approved amount (₹${parsedAmount.toLocaleString('en-IN')}) cannot exceed total invoice amount (₹${totalInvoiceAmount.toLocaleString('en-IN')})` },
          { status: 400 }
        );
      }
      approvedAmount = String(parsedAmount);
    }

    const success = await updateInvoiceStatus(
      id,
      status as typeof invoice.status,
      approvalComments,
      approvedBy,
      approvedAmount,
      invoice.updatedAt, // optimistic concurrency
    );
    if (!success) {
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
    }

    // Log to ApprovalHistory for audit trail
    if (status === 'approved' && approvedAmount) {
      await addApprovalHistory({
        invoiceId: id,
        amount: approvedAmount,
        cumulativeTotal: approvedAmount,
        approvedBy,
        comments: `${approvalComments || ''} (${invoice.status} → approved)`,
      });
    }
    if (status === 'rejected') {
      await addApprovalHistory({
        invoiceId: id,
        amount: '0',
        cumulativeTotal: invoice.approvedAmount || '0',
        approvedBy,
        comments: `[REJECTED] ${approvalComments || ''} (${invoice.status} → rejected)`,
      });
    }

    return NextResponse.json({ success: true, approvedAmount });
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Update invoice error:', error);
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
  }
}

// PATCH /api/invoices — resubmit a rejected invoice (engineer or vendor only)
export async function PATCH(request: NextRequest) {
  // Authenticate: must be an engineer or vendor
  const session = requireEngineerOrVendor(request);
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

    // Verify the invoice exists
    const invoice = await getInvoiceById(id);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Data-integrity check: supplied vendorName must match the invoice's vendor
    if (invoice.vendorName.toLowerCase() !== vendorName.toLowerCase()) {
      return NextResponse.json({ error: 'Vendor name does not match this invoice' }, { status: 400 });
    }

    // Project access check for engineers
    if (session.type === 'engineer') {
      const engineerSession = session as EngineerToken;
      if (engineerSession.projects.length > 0 && invoice.project && !engineerSession.projects.includes(invoice.project)) {
        return NextResponse.json({ error: 'You do not have access to this project' }, { status: 403 });
      }
    }

    // State validation: only rejected or correction_required invoices can be resubmitted
    if (invoice.status !== 'rejected' && invoice.status !== 'correction_required') {
      return NextResponse.json({ error: 'Only rejected or correction-required invoices can be resubmitted' }, { status: 400 });
    }

    // Derive submitter identity from session — never from client
    const resubmittedBy = session.type === 'engineer'
      ? (session as EngineerToken).engineerName
      : (session as import('@/lib/auth').VendorToken).vendorName;

    // Sanitize update fields and resubmit with concurrency check
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
    }, invoice.updatedAt); // optimistic concurrency

    if (!success) {
      return NextResponse.json({ error: 'Failed to resubmit' }, { status: 500 });
    }

    // Log resubmission to ApprovalHistory for audit trail
    await addApprovalHistory({
      invoiceId: id,
      amount: '0',
      cumulativeTotal: invoice.approvedAmount || '0',
      approvedBy: `Engineer: ${resubmittedBy}`,
      comments: `[RESUBMITTED] Invoice corrected and resubmitted (${invoice.status} → submitted)`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Resubmit invoice error:', error);
    return NextResponse.json({ error: 'Failed to resubmit invoice' }, { status: 500 });
  }
}
