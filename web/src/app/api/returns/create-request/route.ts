import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      order_number,
      lookup_token,
      customer_name,
      customer_phone,
      customer_email,
      request_type,
      reason,
      description,
      kvkk_approved
    } = body;

    // 1. Validations
    if (!order_number?.trim() || !lookup_token?.trim()) {
      return NextResponse.json(
        { error: 'Sipariş numarası ve doğrulama anahtarı gereklidir.' },
        { status: 400 }
      );
    }

    if (!customer_name?.trim() || !customer_phone?.trim() || !customer_email?.trim()) {
      return NextResponse.json(
        { error: 'Müşteri ad, telefon ve e-posta bilgileri gereklidir.' },
        { status: 400 }
      );
    }

    if (!request_type || !['cancel', 'return', 'exchange'].includes(request_type)) {
      return NextResponse.json(
        { error: 'Geçersiz talep tipi.' },
        { status: 400 }
      );
    }

    if (!reason?.trim()) {
      return NextResponse.json(
        { error: 'Talep nedeni belirtilmelidir.' },
        { status: 400 }
      );
    }

    if (!kvkk_approved) {
      return NextResponse.json(
        { error: 'KVKK ve İade Koşulları onayı zorunludur.' },
        { status: 400 }
      );
    }

    // 2. Fetch order to verify token and status
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, lookup_token, customer_name, customer_email, customer_phone')
      .eq('order_number', order_number)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Belirtilen sipariş bulunamadı.' },
        { status: 404 }
      );
    }

    // Security Check: token must match lookup_token in database
    if (order.lookup_token !== lookup_token) {
      return NextResponse.json(
        { error: 'Bu sipariş için iade/iptal talebi oluşturmaya yetkiniz yok.' },
        { status: 403 }
      );
    }

    // 3. Create request record using service role
    const { data: requestRecord, error: insertError } = await supabaseAdmin
      .from('return_requests')
      .insert({
        order_id: order.id,
        order_number_snapshot: order_number,
        customer_name: customer_name.trim(),
        customer_phone: customer_phone.trim(),
        customer_email: customer_email.trim(),
        request_type,
        reason: reason.trim(),
        description: description?.trim() || null,
        status: 'pending'
      })
      .select('id, status')
      .single();

    if (insertError || !requestRecord) {
      console.error('Error creating return request in DB:', insertError);
      return NextResponse.json(
        { error: 'Talep kaydedilirken veritabanı hatası oluştu.' },
        { status: 550 }
      );
    }

    return NextResponse.json({
      request_id: requestRecord.id,
      status: requestRecord.status,
      message: 'Talebiniz başarıyla alınmıştır. İnceleme sürecinden sonra sizinle iletişime geçilecektir.'
    });

  } catch (err: any) {
    console.error('Return request API error:', err);
    return NextResponse.json(
      { error: 'Talep işlenirken bir sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}
