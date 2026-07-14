import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/require-admin-api';
import { loadOrder } from '@/lib/dhl/load-order';
import { buildRecipientPreview } from '@/lib/dhl/build-recipient-preview';
import { buildOrderPreview } from '@/lib/dhl/build-order-preview';
import { buildBarcodePreview } from '@/lib/dhl/build-barcode-preview';

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

    const order = await loadOrder(orderId);

    if (!order) {
      console.error('[DHL_FLOW_ORDER_NOT_FOUND]');
      const response = NextResponse.json({ error: 'Sipariş bilgisi alınamadı.' }, { status: 404 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    // Business check for barcode creation
    if (
      !order.customer_name ||
      !order.customer_phone ||
      !order.shipping_city ||
      !order.shipping_district ||
      !order.shipping_address
    ) {
      const response = NextResponse.json({ error: 'Kargo önizlemesi oluşturulamadı.' }, { status: 400 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const recipientPreview = buildRecipientPreview(order);
    const orderPreview = buildOrderPreview(order);
    const barcodePreview = buildBarcodePreview(order);

    const response = NextResponse.json({
      ok: false,
      message: 'DHL/MNG entegrasyonu dry-run modunda. Gerçek gönderi oluşturulmadı.',
      payloadPreview: {
        step1_createRecipient: recipientPreview.recipient,
        step2_createOrder: orderPreview,
        step3_createBarcode: barcodePreview
      }
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;

  } catch {
    console.error('[DHL_FLOW_EXCEPTION]');
    const response = NextResponse.json({ error: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
