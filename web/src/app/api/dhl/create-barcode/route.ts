import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/require-admin-api';
import { loadOrder } from '@/lib/dhl/load-order';
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
      console.error('[DHL BARCODE DB ERROR] Order not found:', orderId);
      const response = NextResponse.json({ error: 'Sipariş bilgisi alınamadı.' }, { status: 404 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    // Eksik zorunlu alan kontrolü (keep original business validation)
    if (
      !order.customer_name ||
      !order.customer_phone ||
      !order.shipping_city ||
      !order.shipping_district ||
      !order.shipping_address
    ) {
      const response = NextResponse.json({ error: 'Siparişin müşteri adres veya iletişim bilgileri eksik.' }, { status: 400 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const payloadPreview = buildBarcodePreview(order);

    const response = NextResponse.json({
      ok: false,
      message: 'Dry-run modunda çalışıyor. DHL/MNG tarafında gerçek CreateBarcode kaydı oluşturulmadı.',
      payloadPreview
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[DHL BARCODE EXCEPTION] code: BARCODE_ERR_500', message);
    const response = NextResponse.json({ error: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
