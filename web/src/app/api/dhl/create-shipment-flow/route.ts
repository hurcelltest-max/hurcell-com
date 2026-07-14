import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/require-admin-api';

export async function POST(req: Request) {
  try {
    const auth = requireAdminApi(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { orderId } = await req.json();

    if (!orderId) {
      const response = NextResponse.json({ error: 'Sipariş bilgisi alınamadı.' }, { status: 400 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const host = req.headers.get('host');
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    // Forward Basic Auth Header
    const authHeader = req.headers.get('authorization');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    // 1. Create Recipient Preview
    const recipientRes = await fetch(`${baseUrl}/api/dhl/create-recipient`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId }),
    });

    if (!recipientRes.ok) {
      console.error('[DHL FLOW] create-recipient status:', recipientRes.status);
      const response = NextResponse.json({ error: 'Kargo önizlemesi oluşturulamadı.' }, { status: recipientRes.status });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const recipientData = await recipientRes.json();

    // 2. Create Order Preview
    const orderRes = await fetch(`${baseUrl}/api/dhl/create-order`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId }),
    });

    if (!orderRes.ok) {
      console.error('[DHL FLOW] create-order status:', orderRes.status);
      const response = NextResponse.json({ error: 'Kargo önizlemesi oluşturulamadı.' }, { status: orderRes.status });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const orderData = await orderRes.json();

    // 3. Create Barcode Preview
    const barcodeRes = await fetch(`${baseUrl}/api/dhl/create-barcode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId }),
    });

    if (!barcodeRes.ok) {
      console.error('[DHL FLOW] create-barcode status:', barcodeRes.status);
      const response = NextResponse.json({ error: 'Kargo önizlemesi oluşturulamadı.' }, { status: barcodeRes.status });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const barcodeData = await barcodeRes.json();

    const response = NextResponse.json({
      ok: false,
      message: 'DHL/MNG entegrasyonu dry-run modunda. Gerçek gönderi oluşturulmadı.',
      payloadPreview: {
        step1_createRecipient: recipientData.payloadPreview,
        step2_createOrder: orderData.payloadPreview,
        step3_createBarcode: barcodeData.payloadPreview
      }
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[DHL FLOW EXCEPTION]', message);
    const response = NextResponse.json({ error: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
