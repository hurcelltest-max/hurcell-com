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
    const payload = {
      order: {
        referenceId: order.order_number || order.id.substring(0, 8).toUpperCase(),
        barcode: order.order_number || order.id.substring(0, 8).toUpperCase(),
        isCOD,
        codAmount,
        shipmentServiceType: 1,
        packagingType: 3,
        paymentType: 1,
        deliveryType: 1,
        description: `HurCELL Sipariş - ${order.order_number || order.id}`,
      },
      orderPieceList: [
        {
          barcode: `${order.order_number || order.id}-P1`,
          desi: 2,
          kg: 2,
        },
      ],
      recipient: {
        cityName: order.shipping_city,
        districtName: order.shipping_district,
        address: order.shipping_address_line,
        email: order.customer_email || 'info@hurcell.com',
        fullName: order.customer_name,
        mobilePhoneNumber: normalizedPhone,
      },
    };

    // Token ve Auth kontrolü (Mock/Dry-run)
    const tokenUrl = process.env.DHL_MNG_TOKEN_URL;
    if (!tokenUrl) {
      return NextResponse.json({
        ok: false,
        message: 'DHL/MNG token bilgisi eksik olduğu için gerçek barkod oluşturulamadı (Preview Modu)',
        payloadPreview: payload
      });
    }

    // Gerçek API çağrısı ileride buraya gelecek. Şimdilik başarılı dry-run.
    return NextResponse.json({
      ok: true,
      message: 'Dry-run başarılı. Token url mevcut ancak henüz canlı istek atılmıyor.',
      payloadPreview: payload
    });

  } catch (err: any) {
    return NextResponse.json({ error: 'Sunucu hatası: ' + err.message }, { status: 500 });
  }
}
