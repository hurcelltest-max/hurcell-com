import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

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

    // 4. Kampanyaları oku (non-blocking — tablo yoksa boş devam et)
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
      // Non-blocking: campaign_products tablosu yoksa veya hata varsa boş devam et
      console.warn('[Checkout Warning] campaigns query failed (non-blocking):', {
        message: campaignError.message,
        code: campaignError.code,
      });
    }

    // Aktif kampanyaları gruplandır
    const activeCampaigns = new Map<string, {
      campaign: any;
      triggers: Set<string>;
      eligibles: Set<string>;
    }>();

    if (dbCampaignProducts) {
      dbCampaignProducts.forEach((row: any) => {
        const camp: any = row.campaigns;
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

    // Ürün ve miktar map'leri
    const productsMap = new Map<string, typeof dbProducts[number]>();
    dbProducts.forEach((p) => productsMap.set(p.id, p));

    const cartQuantities = new Map<string, number>();
    items.forEach((item: any) => {
      const reqQty = parseInt(item.quantity, 10);
      if (!isNaN(reqQty) && reqQty > 0) {
        cartQuantities.set(item.product_id, reqQty);
      }
    });

    // 5. Ön kontrol: tüm ürünler mevcut mu ve stok yeterli mi?
    //    Bu aşama race condition'a karşı kesin güvence değil (atomik RPC bunu sağlar),
    //    ama gereksiz RPC çağrısını önlemek için hızlı ön filtredir.
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

      // Ön stok kontrolü (hızlı ret — asıl güvence atomik RPC'de)
      if (dbProduct.stock < reqQuantity) {
        return NextResponse.json(
          { error: `"${dbProduct.name}" için stok yetersiz. Mevcut stok: ${dbProduct.stock}` },
          { status: 400 }
        );
      }

      const itemOriginalPrice = dbProduct.price;
      const itemSubtotal = itemOriginalPrice * reqQuantity;
      orderSubtotal += itemSubtotal;

      // Kampanya indirimi hesapla
      let bestCampaign: any = null;
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
      const finalUnitPrice = parseFloat((finalRowTotal / reqQuantity).toFixed(2));

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

    // ----------------------------------------------------------------
    // 6. ATOMIK STOK DÜŞME
    //    Her ürün için decrement_product_stock_safe RPC çağrılır.
    //    Başarısız olan ilk üründe:
    //      - Daha önce düşülen stoklar geri alınır.
    //      - Sipariş oluşturulmaz.
    //    Bu aşama race condition'a karşı kesin güvence sağlar.
    // ----------------------------------------------------------------
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
        // RPC çağrısı başarısız — sistem hatası
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

      // rpcResult bir dizi döner: [{ success, new_stock, product_name }]
      const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;

      if (!result || !result.success) {
        // Stok yetersiz — önceki rezervasyonları geri al
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

      // Bu ürün için stok başarıyla düşüldü — rollback listesine ekle
      reservedStocks.push({ product_id: item.product_id, qty: item.quantity });
    }

    // ----------------------------------------------------------------
    // 7. Sipariş oluştur (stok düşmeler başarılıysa)
    // ----------------------------------------------------------------
    const now = new Date().toISOString();

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        customer_name: customer_name.trim(),
        customer_email: customer_email.trim(),
        customer_phone: customer_phone.trim(),
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
        // order_note: order_note || null, // Kolon DB'de mevcut değil
        // Stok rezervasyon takip alanı (migration sonrası aktif)
        stock_reserved_at: now,
      })
      .select('id, order_number, lookup_token, total_amount, currency')
      .single();

    if (orderError || !order) {
      // orders insert başarısız — tüm stokları geri ekle
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

    // ----------------------------------------------------------------
    // 8. Sipariş öğelerini ekle
    // ----------------------------------------------------------------
    const orderItemsPayload = validatedItems.map((item) => ({
      order_id: order.id,
      ...item,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(orderItemsPayload);

    if (itemsError) {
      // order_items insert başarısız — siparişi sil ve stokları geri ekle
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

    // ----------------------------------------------------------------
    // 9. Başarı — sipariş pending, stok düşmüş
    // ----------------------------------------------------------------
    return NextResponse.json({
      order_id: order.id,
      order_number: order.order_number,
      lookup_token: order.lookup_token,
      total_amount: order.total_amount,
      currency: order.currency,
    });

  } catch (err: any) {
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
