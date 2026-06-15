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

    // Fetch active campaigns linked to the selected product IDs
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
      console.error('Error querying campaigns during checkout:', campaignError);
      return NextResponse.json(
        { error: 'Kampanya bilgileri doğrulanırken sunucu hatası oluştu.' },
        { status: 500 }
      );
    }

    // Group by campaign_id, and track trigger vs eligible/discounted product sets in the cart
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
                eligibles: new Set<string>()
              });
            }
            const entry = activeCampaigns.get(camp.id)!;
            if (row.product_role === 'trigger') {
              entry.triggers.add(row.product_id);
            } else {
              // eligible or discounted
              entry.eligibles.add(row.product_id);
            }
          }
        }
      });
    }

    // Map DB products by ID for fast lookup
    const productsMap = new Map<string, typeof dbProducts[number]>();
    dbProducts.forEach((p) => productsMap.set(p.id, p));

    // Map cart quantities for trigger calculations
    const cartQuantities = new Map<string, number>();
    items.forEach((item: any) => {
      const reqQty = parseInt(item.quantity, 10);
      if (!isNaN(reqQty) && reqQty > 0) {
        cartQuantities.set(item.product_id, reqQty);
      }
    });

    // Verify all request items exist, are visible, and have sufficient stock
    let orderSubtotal = 0;
    let orderTotalDiscount = 0;
    const validatedItems = [];
    const appliedCampaignsSummary: any[] = [];

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

      const itemOriginalPrice = dbProduct.sell_price;
      const itemSubtotal = itemOriginalPrice * reqQuantity;
      orderSubtotal += itemSubtotal;

      // Find the best campaign for this product
      let bestCampaign: any = null;
      let maxCampaignDiscount = 0;

      activeCampaigns.forEach((entry) => {
        const { campaign: camp, triggers, eligibles } = entry;

        // Product must be eligible/discounted under this campaign
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
            
            if (itemUnitDiscount > itemOriginalPrice) {
              itemUnitDiscount = itemOriginalPrice;
            }
            
            const totalDiscountForCamp = discountedItemsCount * itemUnitDiscount;
            if (totalDiscountForCamp > maxCampaignDiscount) {
              maxCampaignDiscount = totalDiscountForCamp;
              bestCampaign = camp;
            }
          }
        } else if (camp.campaign_type === 'cross_product_discount') {
          // Cross product logic: trigger products must be present in cart
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
            
            if (itemUnitDiscount > itemOriginalPrice) {
              itemUnitDiscount = itemOriginalPrice;
            }
            
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
        barcode_snapshot: dbProduct.barcode,
        unit_price_snapshot: finalUnitPrice,
        original_unit_price_snapshot: originalUnitPrice,
        discount_amount_snapshot: discountAmountSnapshot,
        final_unit_price_snapshot: finalUnitPrice,
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
          saved_amount: rowDiscount
        });
      }
    }

    const orderFinalTotal = Math.max(0, orderSubtotal - orderTotalDiscount);
    
    // Shipping fee calculation:
    // Subtotal <= 999 TL -> Shipping Fee: 125 TL
    // Subtotal >= 1000 TL -> Shipping Fee: 0 TL
    const shippingFee = orderFinalTotal <= 999 ? 125 : 0;
    const orderGrandTotal = orderFinalTotal + shippingFee;

    // 4. Create pending order in database
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
