import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: 'orderId gerekli.' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: 'Sipariş bulunamadı.' }, { status: 404 });
    }

    const isCOD = order.payment_method === 'kapida-odeme' ? 1 : 0;
    const codAmount = isCOD === 1 ? order.total_amount : 0;

    const payloadPreview = {
      order: {
        referenceId: order.order_number || order.id.substring(0, 8).toUpperCase(),
        barcode: order.order_number || order.id.substring(0, 8).toUpperCase(),
        billOfLandingId: order.order_number || order.id.substring(0, 8).toUpperCase(),
        isCOD,
        codAmount,
        shipmentServiceType: 1,
        packagingType: 3,
        content: 'HurCELL Ürünleri',
        smsPreference1: 0,
        smsPreference2: 0,
        smsPreference3: 0,
        paymentType: 1,
        deliveryType: 1,
        description: `HurCELL Sipariş - ${order.order_number || order.id}`,
        marketPlaceShortCode: '',
        marketPlaceSaleCode: '',
        pudoId: ''
      },
      orderPieceList: [
        {
          barcode: `${order.order_number || order.id}-P1`,
          desi: 2,
          kg: 2,
          content: 'HurCELL Ürünleri',
        }
      ],
      recipient: {
        customerId: '',
        refCustomerId: '',
        cityName: order.shipping_city || 'İSTANBUL',
        districtName: order.shipping_district || 'BAHÇELİEVLER',
        cityCode: 0,
        districtCode: 0,
        address: order.shipping_address || 'Adres detayları eksik',
        bussinessPhoneNumber: '',
        email: order.customer_email || '',
        taxOffice: '',
        taxNumber: '',
        fullName: order.customer_name || 'Alıcı Adı',
        homePhoneNumber: '',
        mobilePhoneNumber: order.customer_phone || ''
      }
    };

    return NextResponse.json({
      ok: false,
      message: 'Dry-run modunda çalışıyor. DHL/MNG tarafında gerçek CreateOrder kaydı oluşturulmadı.',
      payloadPreview
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
