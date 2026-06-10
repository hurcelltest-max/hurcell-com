import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      customer_name,
      customer_email,
      customer_phone,
      billing_address,
      shipping_address,
      items,
    } = body;

    // 1. Validate customer inputs
    if (
      !customer_name?.trim() ||
      !customer_email?.trim() ||
      !customer_phone?.trim() ||
      !billing_address?.trim() ||
      !shipping_address?.trim()
    ) {
      return NextResponse.json(
        { error: 'Müşteri bilgileri ve adresler eksik veya geçersiz.' },
        { status: 400 }
      );
    }

    // 2. Validate cart items
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Sepetiniz boş veya geçersiz ürün listesi.' },
        { status: 400 }
      );
    }

    // Prepare product IDs to query
    const productIds = items.map((i: any) => i.product_id).filter(Boolean);
    if (productIds.length !== items.length) {
      return NextResponse.json(
        { error: 'Geçersiz ürün referansı tespit edildi.' },
        { status: 400 }
      );
    }

    // 3. Query products directly from DB using admin client (Server-Side Price & Stock Verification)
    const { data: dbProducts, error: dbError } = await supabaseAdmin
      .from('products')
      .select('id, name, sell_price, stock, is_web_visible, barcode, category')
      .in('id', productIds);

    if (dbError || !dbProducts) {
      console.error('Database query error during checkout:', dbError);
      return NextResponse.json(
        { error: 'Ürün bilgileri doğrulanırken sunucu hatası oluştu.' },
        { status: 500 }
      );
    }

    // Map DB products by ID for fast lookup
    const productsMap = new Map<string, typeof dbProducts[number]>();
    dbProducts.forEach((p) => productsMap.set(p.id, p));

    // Verify all request items exist, are visible, and have sufficient stock
    let totalAmount = 0;
    const validatedItems = [];

    for (const item of items) {
      const dbProduct = productsMap.get(item.product_id);
      
      if (!dbProduct) {
        return NextResponse.json(
          { error: 'Sepetteki bazı ürünler sistemde bulunamadı.' },
          { status: 400 }
        );
      }

      if (!dbProduct.is_web_visible) {
        return NextResponse.json(
          { error: `"${dbProduct.name}" perakende satışa açık değildir.` },
          { status: 400 }
        );
      }

      const reqQuantity = parseInt(item.quantity, 10);
      if (isNaN(reqQuantity) || reqQuantity <= 0) {
        return NextResponse.json(
          { error: 'Geçersiz sipariş adedi.' },
          { status: 400 }
        );
      }

      if (dbProduct.stock < reqQuantity) {
        return NextResponse.json(
          { error: `"${dbProduct.name}" için stok yetersiz. Mevcut stok: ${dbProduct.stock}` },
          { status: 400 }
        );
      }

      const itemTotal = dbProduct.sell_price * reqQuantity;
      totalAmount += itemTotal;

      validatedItems.push({
        product_id: dbProduct.id,
        product_title_snapshot: dbProduct.name,
        barcode_snapshot: dbProduct.barcode,
        unit_price_snapshot: dbProduct.sell_price,
        quantity: reqQuantity,
        line_total: itemTotal,
      });
    }

    // 4. Create pending order in database
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        customer_name: customer_name.trim(),
        customer_email: customer_email.trim(),
        customer_phone: customer_phone.trim(),
        billing_address: billing_address.trim(),
        shipping_address: shipping_address.trim(),
        total_amount: totalAmount,
        currency: 'TRY',
        status: 'pending',
      })
      .select('id, order_number, lookup_token, total_amount, currency')
      .single();

    if (orderError || !order) {
      console.error('Error creating pending order:', orderError);
      return NextResponse.json(
        { error: 'Sipariş oluşturulurken bir hata oluştu.' },
        { status: 500 }
      );
    }

    // 5. Insert order items snapshots
    const orderItemsPayload = validatedItems.map((item) => ({
      order_id: order.id,
      ...item,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(orderItemsPayload);

    if (itemsError) {
      console.error('Error inserting order items:', itemsError);
      // Clean up order to keep DB clean
      await supabaseAdmin.from('orders').delete().eq('id', order.id);
      return NextResponse.json(
        { error: 'Sipariş detayları kaydedilemedi.' },
        { status: 500 }
      );
    }

    // 6. Return response to front-end client
    return NextResponse.json({
      order_id: order.id,
      order_number: order.order_number,
      lookup_token: order.lookup_token,
      total_amount: order.total_amount,
      currency: order.currency,
    });
  } catch (err: any) {
    console.error('Checkout error:', err);
    return NextResponse.json(
      { error: 'Sipariş işleme hatası oluştu.' },
      { status: 500 }
    );
  }
}
