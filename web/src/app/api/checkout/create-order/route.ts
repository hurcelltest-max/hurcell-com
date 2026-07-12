import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import crypto from 'crypto';
import { normalizeTurkishPhoneNumber } from '@/lib/sms/phone';
import { sendTransactionalSms } from '@/lib/sms/transactional';

/**
 * HurCELL Checkout — Create Order
 *
 * Stok rezervasyon mantığı:
 *  1. Müşteri & sepet doğrulanır.
 *  2. Ürünler DB'den okunur; ön stok/fiyat kontrolü yapılır.
 *  3. Her ürün için decrement_product_stock_safe RPC çağrılır (atomik).
 *     - Aynı anda iki istek gelirse Postgres row-lock ile yalnızca biri kazanır.
 *  4. Herhangi bir ürün stok düşemezse: daha önce düşülen stoklar geri alınır,
 *     sipariş oluşturulmaz, kullanıcıya stok yetersiz hatası dönülür.
 *  5. Stok düşmeler başarılıysa: orders → order_items insert edilir.
 *  6. orders/order_items insert hatasında: tüm stoklar geri eklenir, 500 dönülür.
 *  7. Başarıda: sipariş "pending" statüde oluşur, stok düşmüş olur.
 *
 * İptal/iade/teslim edilemedi durumunda stok geri ekleme:
 *  - increment_product_stock_safe RPC çağrılır (ayrı handler'da).
 *  - orders.stock_released_at IS NULL kontrolü yapılır; iki kez eklenmez.
 */

// Stok geri ekleme yardımcısı — insert hatası veya oversell rollback'te kullanılır
async function releaseStocks(
  reservedStocks: Array<{ product_id: string; qty: number }>
): Promise<void> {
  for (const { product_id, qty } of reservedStocks) {
    const { error } = await supabaseAdmin.rpc('increment_product_stock_safe', {
      p_product_id: product_id,
      p_qty: qty,
    });
    if (error) {
      // Kritik: stok geri eklenemedi — logluyoruz, alarm kanalına gönderilebilir
      console.error('[Checkout Rollback] increment_product_stock_safe FAILED:', {
        product_id,
        qty,
        message: error.message,
      });
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      customer_name,
      customer_email,
      customer_phone,
      billing_address,
      shipping_address,
      shipping_address_line,
      shipping_city,
      shipping_district,
      shipping_postal_code,
      order_note,
      items,
      verification_token // OTP verification token
    } = body;

    // 1. Müşteri bilgilerini doğrula
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

    if (!verification_token) {
      return NextResponse.json({ error: 'Telefon doğrulaması eksik (OTP Token bulunamadı).' }, { status: 400 });
    }

    // OTP Token Validation
    const normalizedPhone = normalizeTurkishPhoneNumber(customer_phone);
    const tokenHash = crypto.createHash('sha256').update(verification_token).digest('hex');



    // 2. Sepet öğelerini doğrula
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Sepetiniz boş veya geçersiz ürün listesi.' },
        { status: 400 }
      );
    }

    const productIds = items.map((i: any) => i.product_id).filter(Boolean);
    if (productIds.length !== items.length) {
      return NextResponse.json(
        { error: 'Geçersiz ürün referansı tespit edildi.' },
        { status: 400 }
      );
    }

    // 3. Ürünleri DB'den oku — fiyat/stok server-side doğrulanır
    const { data: dbProducts, error: dbError } = await supabaseAdmin
      .from('products')
      .select('id, name, price, stock, sku, category')
      .in('id', productIds);

    if (dbError || !dbProducts) {
      console.error('[Checkout Error] Stage: products select query failed.', dbError ? { message: dbError.message, code: dbError.code } : 'No data');
      return NextResponse.json(
        { error: 'Ürün bilgileri doğrulanırken sunucu hatası oluştu.' },
        { status: 500 }
      );
    }

    // 4. Kampanyaları oku (non-blocking)
    const { data: dbCampaignProducts, error: campaignError } = await supabaseAdmin
      .from('campaign_products')
      .select(`
        product_id,
        product_role,
        campaigns:campaign_id (
          id,
          name,
          description,
          campaign_type,
          discount_type,
          discount_value,
          buy_quantity,
          discounted_quantity,
          is_active,
          starts_at,
          ends_at
        )
      `)
      .in('product_id', productIds);

    if (campaignError) {
      console.warn('[Checkout Warning] campaigns query failed (non-blocking):', {
        message: campaignError.message,
        code: campaignError.code,
      });
    }

    const activeCampaigns = new Map<string, {
      campaign: any;
      triggers: Set<string>;
      eligibles: Set<string>;
    }>();

    if (dbCampaignProducts) {
      dbCampaignProducts.forEach((row: any) => {
        const camp: any /* eslint-disable-line */ = row.campaigns;
        if (camp && camp.is_active) {
          const startsAt = new Date(camp.starts_at);
          const endsAt = camp.ends_at ? new Date(camp.ends_at) : null;
          const currentDate = new Date();
          if (startsAt <= currentDate && (!endsAt || endsAt >= currentDate)) {
            if (!activeCampaigns.has(camp.id)) {
              activeCampaigns.set(camp.id, {
                campaign: camp,
                triggers: new Set<string>(),
                eligibles: new Set<string>(),
              });
            }
            const entry = activeCampaigns.get(camp.id)!;
            if (row.product_role === 'trigger') {
              entry.triggers.add(row.product_id);
            } else {
              entry.eligibles.add(row.product_id);
            }
          }
        }
      });
    }

    const productsMap = new Map<string, typeof dbProducts[number]>();
    dbProducts.forEach((p) => productsMap.set(p.id, p));

    const cartQuantities = new Map<string, number>();
    items.forEach((item: any) => {
      const reqQty = parseInt(item.quantity, 10);
      if (!isNaN(reqQty) && reqQty > 0) {
        cartQuantities.set(item.product_id, reqQty);
      }
    });

    let orderSubtotal = 0;
    let orderTotalDiscount = 0;
    const validatedItems: any[] = [];
    const appliedCampaignsSummary: any[] = [];

    for (const item of items) {
      const dbProduct = productsMap.get(item.product_id);

      if (!dbProduct) {
        return NextResponse.json(
          { error: 'Sepetteki bazı ürünler sistemde bulunamadı.' },
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

      const itemOriginalPrice = dbProduct.price;
      const itemSubtotal = itemOriginalPrice * reqQuantity;
      orderSubtotal += itemSubtotal;

      let bestCampaign: any /* eslint-disable-line */ = null;
      let maxCampaignDiscount = 0;

      activeCampaigns.forEach((entry) => {
        const { campaign: camp, triggers, eligibles } = entry;

        if (!eligibles.has(dbProduct.id)) return;

        if (camp.campaign_type === 'same_product_quantity_discount') {
          const buyQty = camp.buy_quantity || 1;
          const discQty = camp.discounted_quantity || 1;

          if (reqQuantity >= buyQty) {
            const discountedSets = Math.floor(reqQuantity / buyQty);
            const discountedItemsCount = discountedSets * discQty;

            let itemUnitDiscount = 0;
            if (camp.discount_type === 'percent') {
              itemUnitDiscount = itemOriginalPrice * (camp.discount_value / 100);
            } else if (camp.discount_type === 'fixed_amount') {
              itemUnitDiscount = camp.discount_value;
            }
            if (itemUnitDiscount > itemOriginalPrice) itemUnitDiscount = itemOriginalPrice;

            const totalDiscountForCamp = discountedItemsCount * itemUnitDiscount;
            if (totalDiscountForCamp > maxCampaignDiscount) {
              maxCampaignDiscount = totalDiscountForCamp;
              bestCampaign = camp;
            }
          }
        } else if (camp.campaign_type === 'cross_product_discount') {
          let totalTriggerQty = 0;
          triggers.forEach((triggerProdId) => {
            totalTriggerQty += cartQuantities.get(triggerProdId) || 0;
          });

          if (totalTriggerQty > 0) {
            const applicableQty = Math.min(reqQuantity, totalTriggerQty);

            let itemUnitDiscount = 0;
            if (camp.discount_type === 'percent') {
              itemUnitDiscount = itemOriginalPrice * (camp.discount_value / 100);
            } else if (camp.discount_type === 'fixed_amount') {
              itemUnitDiscount = camp.discount_value;
            }
            if (itemUnitDiscount > itemOriginalPrice) itemUnitDiscount = itemOriginalPrice;

            const totalDiscountForCamp = applicableQty * itemUnitDiscount;
            if (totalDiscountForCamp > maxCampaignDiscount) {
              maxCampaignDiscount = totalDiscountForCamp;
              bestCampaign = camp;
            }
          }
        }
      });

      const rowDiscount = maxCampaignDiscount;
      const finalRowTotal = Math.max(0, itemSubtotal - rowDiscount);
      orderTotalDiscount += rowDiscount;

      const originalUnitPrice = itemOriginalPrice;
      const discountAmountSnapshot = rowDiscount;

      validatedItems.push({
        product_id: dbProduct.id,
        product_title_snapshot: dbProduct.name,
        barcode_snapshot: dbProduct.sku || null,
        unit_price_snapshot: originalUnitPrice,
        original_unit_price_snapshot: originalUnitPrice,
        discount_amount_snapshot: discountAmountSnapshot,
        final_unit_price_snapshot: originalUnitPrice,
        applied_campaign_id: bestCampaign ? bestCampaign.id : null,
        applied_campaign_name_snapshot: bestCampaign ? bestCampaign.name : null,
        quantity: reqQuantity,
        line_total: finalRowTotal,
      });

      if (bestCampaign) {
        appliedCampaignsSummary.push({
          campaign_id: bestCampaign.id,
          campaign_name: bestCampaign.name,
          discount_type: bestCampaign.discount_type,
          discount_value: bestCampaign.discount_value,
          saved_amount: rowDiscount,
        });
      }
    }

    const orderFinalTotal = Math.max(0, orderSubtotal - orderTotalDiscount);
    const shippingFee = orderFinalTotal <= 999 ? 125 : 0;
    const orderGrandTotal = orderFinalTotal + shippingFee;

    // 5.5 OTP Token Tüketimi (Validasyonlardan sonra, Stok düşümünden hemen önce)
    // Atomic consumption via RPC
    const { data: verificationId, error: verificationError } = await supabaseAdmin.rpc(
      'consume_phone_verification_token',
      {
        p_phone: normalizedPhone,
        p_token_hash: tokenHash
      }
    );

    if (verificationError || !verificationId) {
      return NextResponse.json({ error: 'Geçersiz, süresi dolmuş veya zaten kullanılmış doğrulama kodu. Lütfen tekrar SMS doğrulayın.' }, { status: 400 });
    }

    // 6. ATOMIK STOK DÜŞME
    const reservedStocks: Array<{ product_id: string; qty: number }> = [];

    for (const item of validatedItems) {
      const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
        'decrement_product_stock_safe',
        {
          p_product_id: item.product_id,
          p_qty: item.quantity,
        }
      );

      if (rpcError) {
        console.error('[Checkout Error] Stage: decrement_product_stock_safe RPC error:', {
          product_id: item.product_id,
          qty: item.quantity,
          message: rpcError.message,
          code: rpcError.code,
        });
        await releaseStocks(reservedStocks);
        return NextResponse.json(
          { error: 'Stok rezervasyonu sırasında sunucu hatası oluştu.' },
          { status: 500 }
        );
      }

      const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;

      if (!result || !result.success) {
        const name = result?.product_name || item.product_title_snapshot;
        console.warn('[Checkout Warning] decrement_product_stock_safe returned success=false:', {
          product_id: item.product_id,
          product_name: name,
        });
        await releaseStocks(reservedStocks);
        return NextResponse.json(
          { error: `"${name}" için stok tükendi. Lütfen tekrar deneyin.` },
          { status: 400 }
        );
      }

      reservedStocks.push({ product_id: item.product_id, qty: item.quantity });
    }

    // 7. Sipariş oluştur (stok düşmeler başarılıysa)
    const now = new Date().toISOString();

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        customer_name: customer_name.trim(),
        customer_email: customer_email.trim(),
        customer_phone: normalizedPhone,
        billing_address: billing_address.trim(),
        shipping_address: shipping_address.trim(),
        subtotal_amount: orderSubtotal,
        discount_amount: orderTotalDiscount,
        shipping_fee: shippingFee,
        total_amount: orderGrandTotal,
        campaign_summary: appliedCampaignsSummary,
        currency: 'TRY',
        status: 'pending',
        payment_method: 'cash_on_delivery',
        payment_provider: 'dhl',
        payment_status: 'pending_on_delivery',
        shipping_provider: 'dhl',
        shipping_status: 'pending',
        dhl_status: 'dhl_pending',
        shipping_address_line: shipping_address_line || null,
        shipping_city: shipping_city || null,
        shipping_district: shipping_district || null,
        shipping_postal_code: shipping_postal_code || null,
        stock_reserved_at: now,
      })
      .select('id, order_number, lookup_token, total_amount, currency')
      .single();

    if (orderError || !order) {
      console.error('[Checkout Error] Stage: orders insert failed. Rolling back stock.', orderError ? {
        message: orderError.message,
        code: orderError.code,
      } : 'No order data returned');
      await releaseStocks(reservedStocks);
      return NextResponse.json(
        { error: 'Sipariş oluşturulurken bir hata oluştu.' },
        { status: 500 }
      );
    }

    // 8. Sipariş öğelerini ekle
    const orderItemsPayload = validatedItems.map((item) => ({
      order_id: order.id,
      ...item,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(orderItemsPayload);

    if (itemsError) {
      console.error('[Checkout Error] Stage: order_items insert failed. Rolling back.', {
        message: itemsError.message,
        code: itemsError.code,
      });
      await supabaseAdmin.from('orders').delete().eq('id', order.id);
      await releaseStocks(reservedStocks);
      return NextResponse.json(
        { error: 'Sipariş detayları kaydedilemedi.' },
        { status: 500 }
      );
    }

    // 9. Send Transactional SMS Notifications
    const smsData = {
      order_number: order.order_number,
      amount: order.total_amount.toString(),
      city: shipping_city || '',
      district: shipping_district || ''
    };

    // Customer and Internal Alerts
    const internalPhones = (process.env.SMS_INTERNAL_ALERT_PHONES || '').split(',').map(p => p.trim()).filter(Boolean);

    const notificationJobs = [
      sendTransactionalSms(order.id, 'order_created', 'customer', normalizedPhone, smsData),
      ...internalPhones.map(phone => 
        sendTransactionalSms(order.id, 'order_created', 'internal', phone, smsData)
      )
    ];

    try {
      const notificationResults = await Promise.all(notificationJobs);
      const failedCount = notificationResults.filter(r => !r.success && !r.skipped).length;
      if (failedCount > 0) {
        console.error(`[Checkout Warning] ${failedCount} SMS notification(s) failed for order ${order.order_number}`);
      }
    } catch (e) {
      console.error('[SMS FATAL ERROR during checkout]', e);
    }

    return NextResponse.json({
      order_id: order.id,
      order_number: order.order_number,
      lookup_token: order.lookup_token,
      total_amount: order.total_amount,
      currency: order.currency,
    });

  } catch (err: unknown) {
    console.error('[Checkout Error] Stage: unexpected catch.', err ? {
      message: err.message,
      name: err.name,
    } : 'Unknown error');
    return NextResponse.json(
      { error: 'Sipariş işleme hatası oluştu.' },
      { status: 500 }
    );
  }
}
