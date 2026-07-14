import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/require-admin-api';
import { loadOrder } from '@/lib/dhl/load-order';
import { buildOrderPreview } from '@/lib/dhl/build-order-preview';

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
      console.error('[DHL_ORDER_NOT_FOUND]');
      const response = NextResponse.json({ error: 'Sipariş bilgisi alınamadı.' }, { status: 404 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const payloadPreview = buildOrderPreview(order);

    const response = NextResponse.json({
      ok: false,
      message: 'Dry-run modunda çalışıyor. DHL/MNG tarafında gerçek CreateOrder kaydı oluşturulmadı.',
      payloadPreview
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;

  } catch {
    console.error('[DHL_CREATE_ORDER_EXCEPTION]');
    const response = NextResponse.json({ error: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
