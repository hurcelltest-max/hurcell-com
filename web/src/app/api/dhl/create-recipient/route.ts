import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminApi } from '@/lib/admin/require-admin-api';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      console.error('[DHL RECIPIENT DB ERROR]', error);
      const response = NextResponse.json({ error: 'Sipariş bilgisi alınamadı.' }, { status: 404 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
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

    const response = NextResponse.json({
      ok: false,
      message: 'Dry-run modunda çalışıyor. DHL/MNG tarafında gerçek CreateRecipient kaydı oluşturulmadı.',
      payloadPreview
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[DHL RECIPIENT EXCEPTION]', message);
    const response = NextResponse.json({ error: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
