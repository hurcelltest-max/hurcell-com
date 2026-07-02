import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: 'Sipariş ID gerekli.' }, { status: 400 });
    }

    // Siparişi veritabanından oku
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: 'Sipariş bulunamadı.' }, { status: 404 });
    }

    // Eksik zorunlu alan kontrolü
    if (
      !order.customer_name ||
      !order.customer_phone ||
      !order.shipping_city ||
      !order.shipping_district ||
      !order.shipping_address_line
    ) {
      return NextResponse.json({ error: 'Siparişin müşteri adres veya iletişim bilgileri eksik.' }, { status: 400 });
    }

    // Kapıda ödeme mantığı
    const isCOD = order.payment_method === 'cash_on_delivery' ? 1 : 0;
    const codAmount = isCOD === 1 ? order.total_amount : 0;

    // Telefon normalize (sadece rakam, basit kural)
    const normalizedPhone = order.customer_phone.replace(/[^0-9]/g, '');

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
    // ASSUMED TOKEN ENDPOINT: MNG Barcode Command ZIP dosyasında auth/login endpoint'i açıkça belirtilmediğinden
    // token'ın 'https://testapi.mngkargo.com.tr/mngapi/api/token' adresinden alınacağı varsayılmıştır.
    // DHL_MNG_TOKEN_URL ortam değişkeninden gelmesi beklenmektedir.
    // Gerçek API çağrısı, token endpoint'i kesinleşmeden aktif edilmemiştir.
    const tokenUrl = process.env.DHL_MNG_TOKEN_URL || process.env.DHL_MNG_TOKEN_TEST_URL;
    if (!tokenUrl) {
      return NextResponse.json({
        ok: false,
        message: 'Token URL eksik. Sistem dry-run / payload preview modunda çalışıyor.',
        payloadPreview
      });
    }

    // Gerçek API çağrısı ileride buraya gelecek. Şimdilik başarılı dry-run.
    return NextResponse.json({
      ok: false,
      message: 'Dry-run modunda çalışıyor. DHL/MNG tarafında gerçek CreateBarcode kaydı oluşturulmadı.',
      payloadPreview
    });

  } catch (err: any) {
    return NextResponse.json({ error: 'Sunucu hatası: ' + err.message }, { status: 500 });
  }
}
