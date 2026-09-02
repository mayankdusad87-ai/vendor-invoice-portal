import { NextRequest, NextResponse } from 'next/server';
import { getInvoices, getVendorInvoices, addInvoice, updateInvoiceStatus } from '@/lib/google-sheets';
import { verifyToken, verifyAdminToken, verifyApproverToken } from '@/lib/auth';

// GET /api/invoices - get invoices
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const vendorNameParam = request.nextUrl.searchParams.get('vendorName');

    // Site engineer: filter by vendor name (no auth needed)
    if (vendorNameParam) {
      const invoices = await getVendorInvoices(vendorNameParam);
      invoices.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      return NextResponse.json({ invoices });
    }

    // Admin/Approver: requires auth token
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    let invoices;
    if (payload.type === 'admin' || payload.type === 'approver') {
      invoices = await getInvoices();
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Sort by submitted date (newest first)
    invoices.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    return NextResponse.json({ invoices });
  } catch (error) {
    console.error('Get invoices error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}

// POST /api/invoices - submit new invoice (site engineer, no auth needed)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      vendorName, invoiceDate, invoiceNumber, purpose, amount, remarks,
      invoiceFileUrl, invoiceFileName,
      workPhotos, measurementSheetUrl, measurementSheetName
    } = body;

    if (!vendorName) {
      return NextResponse.json(
        { error: 'Vendor name is required' },
        { status: 400 }
      );
    }

    if (!invoiceDate || !invoiceNumber || !purpose || !amount) {
      return NextResponse.json(
        { error: 'Invoice date, number, purpose, and amount are required' },
        { status: 400 }
      );
    }

    const invoice = await addInvoice({
      vendorName,
      invoiceDate,
      invoiceNumber,
      purpose,
      amount,
      remarks: remarks || '',
      invoiceFileUrl: invoiceFileUrl || '',
      invoiceFileName: invoiceFileName || '',
      workPhotos: workPhotos || '',
      measurementSheetUrl: measurementSheetUrl || '',
      measurementSheetName: measurementSheetName || '',
      status: 'submitted',
    });

    return NextResponse.json({ success: true, invoice });
  } catch (error) {
    console.error('Submit invoice error:', error);
    return NextResponse.json(
      { error: 'Failed to submit invoice' },
      { status: 500 }
    );
  }
}

// PUT /api/invoices - update invoice status (admin or approver)
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminPayload = verifyAdminToken(token);
    const approverPayload = verifyApproverToken(token);

    if (!adminPayload && !approverPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, status, approvalComments } = await request.json();

    if (!id || !status) {
      return NextResponse.json(
        { error: 'Invoice ID and status are required' },
        { status: 400 }
      );
    }

    const validStatuses = ['submitted', 'under_review', 'approved', 'paid', 'rejected'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    const approvedBy = approverPayload?.approverName || adminPayload?.username || '';

    const success = await updateInvoiceStatus(id, status, approvalComments || '', approvedBy);
    if (!success) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update invoice error:', error);
    return NextResponse.json(
      { error: 'Failed to update invoice' },
      { status: 500 }
    );
  }
}
