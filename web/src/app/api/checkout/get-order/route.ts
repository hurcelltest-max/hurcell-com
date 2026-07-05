import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orderNumber = searchParams.get('order_number');
    const emailOrPhone = searchParams.get('emailOrPhone');
    const token = searchParams.get('token');

    if (!orderNumber || (!emailOrPhone && !token)) {
      return NextResponse.json(
        { error: 'Sipariş numarası ve doğrulama bilgisi (e-posta, telefon veya token) gereklidir.' },
        { status: 400 }
      );
    }

    // 1. Fetch order details from database using service role
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, lookup_token, customer_name, customer_email, customer_phone, billing_address, shipping_address, total_amount, currency, status, payment_provider, payment_method, payment_status, shipping_provider, shipping_status, shipping_fee, created_at')
      .eq('order_number', orderNumber)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Sipariş bulunamadı.' },
        { status: 404 }
      );
    }

    // 2. Security Check: Verify token OR email/phone
    if (token) {
      if (order.lookup_token !== token) {
        return NextResponse.json(
          { error: 'Geçersiz sipariş doğrulama anahtarı.' },
          { status: 403 }
        );
      }
    } else if (emailOrPhone) {
      const cleanedInput = emailOrPhone.trim().toLowerCase();
      const orderEmail = (order.customer_email || '').toLowerCase();
      const orderPhone = (order.customer_phone || '').replace(/\D/g, '');
      const inputPhone = cleanedInput.replace(/\D/g, '');

      const isEmailMatch = orderEmail && orderEmail === cleanedInput;
      const isPhoneMatch = orderPhone && inputPhone && orderPhone.includes(inputPhone);

      if (!isEmailMatch && !isPhoneMatch) {
        return NextResponse.json(
          { error: 'Girdiğiniz iletişim bilgisi bu siparişe ait değil.' },
          { status: 403 }
        );
      }
    }

    // 3. Fetch order items snapshot
    const { data: items, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('id, product_id, product_title_snapshot, barcode_snapshot, unit_price_snapshot, quantity, line_total')
      .eq('order_id', order.id);

    if (itemsError) {
      console.error('Error fetching order items details:', itemsError);
      return NextResponse.json(
        { error: 'Sipariş detayları getirilemedi.' },
        { status: 500 }
      );
    }

    // 4. Fetch product campaign info to see if any requires return
    let hasCampaignBenefitWarning = false;
    if (items && items.length > 0) {
      const productIds = items.map((item: any) => item.product_id).filter(Boolean);
      if (productIds.length > 0) {
        // Since campaign benefit columns do not exist, this check is skipped.
        const products: any[] = [];
        
        if (products && products.length > 0) {
          hasCampaignBenefitWarning = true;
        }
      }
    }

    // Omit sensitive database ids and lookup token before returning
    const safeOrder = {
      order_number: order.order_number,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_phone: order.customer_phone,
      billing_address: order.billing_address,
      shipping_address: order.shipping_address,
      total_amount: order.total_amount,
      currency: order.currency,
      status: order.status,
      payment_provider: order.payment_provider,
      payment_method: order.payment_method,
      payment_status: order.payment_status,
      shipping_provider: order.shipping_provider,
      shipping_status: order.shipping_status,
      shipping_fee: order.shipping_fee,
      created_at: order.created_at,
    };

    return NextResponse.json({
      order: safeOrder,
      items: items || [],
      hasCampaignBenefitWarning
    });
  } catch (err: any) {
    console.error('Get order error:', err);
    return NextResponse.json(
      { error: 'Sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}
