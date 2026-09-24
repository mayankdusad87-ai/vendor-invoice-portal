import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import type { EngineerToken, ApproverToken } from '@/lib/auth';
import { getInvoiceById, updateInvoiceStatus, addApprovalHistory, amendInvoiceFields, ConflictError } from '@/lib/google-sheets';
import { sanitizeString, sanitizeDate, sanitizeAmount, getRateLimitKey, rateLimit, rateLimitResponse } from '@/lib/security';

/**
 * POST /api/invoices/recall
 *
 * Recall & amend an invoice before the next person in the chain acts.
 * - Engineer can recall a "submitted" invoice (approver hasn't acted)
 * - Approver can recall an "approved" invoice (accounts hasn't acted)
 *
 * Body: { invoiceId, action: 'recall', updates?: { ...fields } }
 *
 * If updates are provided, the invoice is amended in-place and stays at its current stage.
 * If no updates, the invoice is pulled back one stage (approved → submitted, submitted → submitted).
 */
export async function POST(request: NextRequest) {
  const session = requireAuth(request);
  if (isAuthError(session)) return session;

  const key = getRateLimitKey(request, 'recall-invoice');
  const check = rateLimit(key, { maxRequests: 10, windowMs: 60_000 });
  if (!check.allowed) return rateLimitResponse(check.retryAfterMs!);

  try {
    const body = await request.json();
    const invoiceId = sanitizeString(body.invoiceId, 50);
    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
    }

    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // ─── ENGINEER RECALL: status must be "submitted" ───
    if (session.type === 'engineer') {
      if (invoice.status !== 'submitted') {
        return NextResponse.json(
          { error: 'Can only recall invoices that are still pending review (status: submitted)' },
          { status: 400 }
        );
      }

      const engineerSession = session as EngineerToken;
      const engineerName = engineerSession.engineerName;

      // Ownership check — only the submitter can amend their own invoice
      if (invoice.submittedBy !== engineerName) {
        return NextResponse.json({ error: 'You can only edit invoices you submitted' }, { status: 403 });
      }

      // Project access check
      if (engineerSession.projects.length > 0 && invoice.project && !engineerSession.projects.includes(invoice.project)) {
        return NextResponse.json({ error: 'You do not have access to this project' }, { status: 403 });
      }

      // If updates provided, amend in-place
      const updates = body.updates;
      if (updates && typeof updates === 'object') {
        const changes: string[] = [];
        if (updates.amount && updates.amount !== invoice.amount) changes.push(`Amount: ${invoice.amount} → ${updates.amount}`);
        if (updates.gstAmount && updates.gstAmount !== (invoice.gstAmount || '')) changes.push(`GST: ${invoice.gstAmount || '0'} → ${updates.gstAmount}`);
        if (updates.purpose && updates.purpose !== invoice.purpose) changes.push(`Purpose updated`);
        if (updates.invoiceNumber && updates.invoiceNumber !== invoice.invoiceNumber) changes.push(`Invoice# updated`);
        if (updates.invoiceDate && updates.invoiceDate !== invoice.invoiceDate) changes.push(`Date updated`);
        if (updates.remarks !== undefined && updates.remarks !== invoice.remarks) changes.push(`Remarks updated`);

        const sanitizedUpdates = {
          invoiceDate: sanitizeDate(updates.invoiceDate) || undefined,
          invoiceNumber: sanitizeString(updates.invoiceNumber, 50) || undefined,
          purpose: sanitizeString(updates.purpose, 500) || undefined,
          amount: sanitizeAmount(updates.amount) || undefined,
          gstAmount: sanitizeAmount(updates.gstAmount) || undefined,
          remarks: sanitizeString(updates.remarks, 500),
          invoiceFileUrl: updates.invoiceFileUrl ? sanitizeString(updates.invoiceFileUrl, 2000) : undefined,
          invoiceFileName: updates.invoiceFileName ? sanitizeString(updates.invoiceFileName, 200) : undefined,
          measurementSheetUrl: updates.measurementSheetUrl ? sanitizeString(updates.measurementSheetUrl, 2000) : undefined,
          measurementSheetName: updates.measurementSheetName ? sanitizeString(updates.measurementSheetName, 200) : undefined,
          dueDate: sanitizeDate(updates.dueDate) || undefined,
        };

        // Check if file URLs changed (not tracked in the text-based changes list)
        const fileChanged = (sanitizedUpdates.invoiceFileUrl && sanitizedUpdates.invoiceFileUrl !== (invoice.invoiceFileUrl || ''))
          || (sanitizedUpdates.measurementSheetUrl && sanitizedUpdates.measurementSheetUrl !== (invoice.measurementSheetUrl || ''));
        if (fileChanged) changes.push('Attachments updated');

        if (changes.length === 0) {
          return NextResponse.json({ success: true, amended: false, message: 'No changes detected' });
        }

        const success = await amendInvoiceFields(invoiceId, sanitizedUpdates, invoice.updatedAt);

        if (!success) {
          return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
        }

        await addApprovalHistory({
          invoiceId,
          amount: '0',
          cumulativeTotal: invoice.approvedAmount || '0',
          approvedBy: `Engineer: ${engineerName}`,
          comments: `[AMENDED] ${changes.join(', ')} (while status: submitted)`,
        });

        return NextResponse.json({ success: true, amended: true });
      }

      // No updates — just log the recall attempt (invoice stays submitted for re-editing via resubmit page)
      await addApprovalHistory({
        invoiceId,
        amount: '0',
        cumulativeTotal: invoice.approvedAmount || '0',
        approvedBy: `Engineer: ${engineerName}`,
        comments: `[RECALLED] Invoice recalled for corrections (status remains submitted)`,
      });

      return NextResponse.json({ success: true, recalled: true });
    }

    // ─── APPROVER RECALL: status must be "approved" ───
    if (session.type === 'approver') {
      if (invoice.status !== 'approved') {
        return NextResponse.json(
          { error: 'Can only recall invoices that are approved and not yet acted on by accounts' },
          { status: 400 }
        );
      }

      const approverSession = session as ApproverToken;
      const approverName = approverSession.approverName;
      const updates = body.updates;

      if (updates && typeof updates === 'object') {
        const changes: string[] = [];
        if (updates.approvedAmount && updates.approvedAmount !== (invoice.approvedAmount || '')) {
          changes.push(`Approved Amount: ${invoice.approvedAmount || invoice.amount} → ${updates.approvedAmount}`);
        }
        if (updates.approvalComments && updates.approvalComments !== (invoice.approvalComments || '')) {
          changes.push(`Comments updated`);
        }

        // Update the approval fields
        const newApprovedAmount = sanitizeAmount(updates.approvedAmount) || invoice.approvedAmount || invoice.amount;
        const newComments = sanitizeString(updates.approvalComments, 500) || invoice.approvalComments || '';

        if (changes.length === 0) {
          return NextResponse.json({ success: true, amended: false, message: 'No changes detected' });
        }

        const success = await updateInvoiceStatus(
          invoiceId,
          'approved',
          newComments,
          approverName,
          newApprovedAmount,
          invoice.updatedAt,
        );

        if (!success) {
          return NextResponse.json({ error: 'Failed to update approval' }, { status: 500 });
        }

        await addApprovalHistory({
          invoiceId,
          amount: newApprovedAmount,
          cumulativeTotal: newApprovedAmount,
          approvedBy: approverName,
          comments: `[AMENDED] ${changes.join(', ')} (while status: approved)`,
        });

        return NextResponse.json({ success: true, amended: true });
      }

      // No updates — recall back to submitted so engineer can see it again
      const success = await updateInvoiceStatus(
        invoiceId,
        'submitted',
        `Recalled by approver: ${approverName}`,
        approverName,
        undefined,
        invoice.updatedAt,
      );

      if (!success) {
        return NextResponse.json({ error: 'Failed to recall invoice' }, { status: 500 });
      }

      await addApprovalHistory({
        invoiceId,
        amount: '0',
        cumulativeTotal: invoice.approvedAmount || '0',
        approvedBy: approverName,
        comments: `[RECALLED] Approval recalled — invoice returned to submitted for re-review`,
      });

      return NextResponse.json({ success: true, recalled: true });
    }

    return NextResponse.json({ error: 'Only engineers and approvers can recall invoices' }, { status: 403 });
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json({ error: 'Invoice was modified by someone else. Please refresh and try again.' }, { status: 409 });
    }
    console.error('Recall error:', error);
    return NextResponse.json({ error: 'Failed to process recall' }, { status: 500 });
  }
}
