import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminApi } from '@/lib/admin/require-admin-api';

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  shipping_city: string;
  shipping_district: string;
  shipping_address_line: string;
  payment_method: string;
  total_amount: number;
}

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

    // Siparişi veritabanından oku
    const { data: orderData, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    const order = orderData as unknown as Order;

    if (error || !order) {
      console.error('[DHL BARCODE DB ERROR]', error);
      const response = NextResponse.json({ error: 'Sipariş bilgisi alınamadı.' }, { status: 404 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    // Eksik zorunlu alan kontrolü
    if (
      !order.customer_name ||
      !order.customer_phone ||
      !order.shipping_city ||
      !order.shipping_district ||
      !order.shipping_address_line
    ) {
      const response = NextResponse.json({ error: 'Siparişin müşteri adres veya iletişim bilgileri eksik.' }, { status: 400 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    // Kapıda ödeme mantığı
    const isCOD = order.payment_method === 'cash_on_delivery' ? 1 : 0;
    const codAmount = isCOD === 1 ? order.total_amount : 0;

    // Payload hazırlığı
    const payloadPreview = {
      referenceId: order.order_number || order.id.substring(0, 8).toUpperCase(),
      billOfLandingId: order.order_number || order.id.substring(0, 8).toUpperCase(),
      isCOD,
      codAmount,
      packagingType: 3,
      printReferenceBarcodeOnError: 0,
      message: 'HurCELL Sipariş - Dikkatli taşıyınız',
      additionalContent1: '',
      additionalContent2: '',
      additionalContent3: '',
      additionalContent4: '',
      orderPieceList: [
        {
          barcode: `${order.order_number || order.id}-P1`,
          desi: 2,
          kg: 2,
          content: 'HurCELL Ürünleri',
        },
      ]
    };

    // Token ve Auth kontrolü (Mock/Dry-run)
    const tokenUrl = process.env.DHL_MNG_TOKEN_URL || process.env.DHL_MNG_TOKEN_TEST_URL;
    if (!tokenUrl) {
      const response = NextResponse.json({
        ok: false,
        message: 'Token URL eksik. Sistem dry-run / payload preview modunda çalışıyor.',
        payloadPreview
      });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    // Gerçek API çağrısı ileride buraya gelecek. Şimdilik başarılı dry-run.
    const response = NextResponse.json({
      ok: false,
      message: 'Dry-run modunda çalışıyor. DHL/MNG tarafında gerçek CreateBarcode kaydı oluşturulmadı.',
      payloadPreview
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[DHL BARCODE EXCEPTION]', message);
    const response = NextResponse.json({ error: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
