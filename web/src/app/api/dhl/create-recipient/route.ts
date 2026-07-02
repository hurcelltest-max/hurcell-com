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

    // Payload hazırlığı
    const payloadPreview = {
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
      message: 'Dry-run modunda çalışıyor. DHL/MNG tarafında gerçek CreateRecipient kaydı oluşturulmadı.',
      payloadPreview
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
