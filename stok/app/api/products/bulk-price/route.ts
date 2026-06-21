import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { createClient } from '@supabase/supabase-js';
import { calculateNewPrice, RoundingType } from '@/lib/priceMath';
import { BatchActionType } from '@/lib/types';

interface BulkPricePayload {
  actionType: BatchActionType;
  rounding: RoundingType;
  value: number;
  exchangeRate?: number;
  items: Array<{
    id: string;
    expected_old_buy_currency: string;
    expected_old_foreign_buy_price: number | null;
    expected_old_buy_price: number;
    expected_old_sell_price: number;
  }>;
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createSupabaseServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify admin role
    const { data: adminUser, error: adminErr } = await supabaseAdmin
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (adminErr || !adminUser || adminUser.role !== 'admin') {
      return NextResponse.json({ error: 'Bu işlem için admin yetkisine sahip olmalısınız.' }, { status: 403 });
    }

    const body = await request.json() as BulkPricePayload;
    const { actionType, rounding, value, exchangeRate = 1, items } = body;

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Geçersiz ürün listesi.' }, { status: 400 });
    }

    if (items.length === 0 || items.length > 1000) {
      return NextResponse.json({ error: 'Ürün sayısı 1 ile 1000 arasında olmalıdır.' }, { status: 400 });
    }

    const uniqueIds = new Set(items.map(i => i.id));
    if (uniqueIds.size !== items.length) {
      return NextResponse.json({ error: 'Listede tekrar eden ürünler var.' }, { status: 400 });
    }

    // Process each item using safe JS price calculation
    const processedItems = items.map(item => {
      // Input Validation
      if (!['TRY', 'USD', 'EUR'].includes(item.expected_old_buy_currency)) {
        throw new Error(`Geçersiz para birimi: ${item.expected_old_buy_currency}`);
      }
      if (item.expected_old_buy_currency === 'TRY' && item.expected_old_foreign_buy_price !== null && item.expected_old_foreign_buy_price !== 0) {
        // Allow exactly 0 or null for TRY in database if needed, but constraint usually wants NULL
        throw new Error('TRY para birimi için yabancı para fiyatı girilemez.');
      }
      if ((item.expected_old_buy_currency === 'USD' || item.expected_old_buy_currency === 'EUR') && 
          (!item.expected_old_foreign_buy_price || item.expected_old_foreign_buy_price <= 0)) {
        throw new Error(`${item.expected_old_buy_currency} para birimi için yabancı para fiyatı sıfırdan büyük olmalıdır.`);
      }

      let new_buy_price = item.expected_old_buy_price;
      let new_sell_price = item.expected_old_sell_price;
      const new_buy_currency = item.expected_old_buy_currency;
      const new_foreign_buy_price = item.expected_old_foreign_buy_price;

      if (actionType === 'currency_update') {
        if (new_buy_currency !== 'TRY' && new_foreign_buy_price && new_foreign_buy_price > 0) {
          // Update TL costs based on foreign price and new exchange rate
          new_buy_price = calculateNewPrice(new_foreign_buy_price, 'currency_update', 0, 'none', exchangeRate);
          // Keep margin same or apply rounding logic? Usually currency update re-calculates sell price based on new buy price?
          // The business logic: just update buy_price and sell_price? 
          // If only currency update: we need the markup/margin? For simplicity, we just adjust the buy_price and let the user do margin later, OR we assume currency_update also scales the sell price proportionally.
          // Wait, the action type is explicit. If it's currency_update, we just scale everything by exchangeRate?
          // For now, let's just scale sell_price proportionally.
          const marginRatio = item.expected_old_buy_price > 0 
              ? item.expected_old_sell_price / item.expected_old_buy_price 
              : 1;
          new_sell_price = calculateNewPrice(new_buy_price * marginRatio, 'flat_increase', 0, rounding);
        }
      } else {
        // Normal price action applies to sell_price
        new_sell_price = calculateNewPrice(item.expected_old_sell_price, actionType, value, rounding);
        
        // Wait, if it's margin/markup, it's based on buy_price!
        if (actionType === 'margin' || actionType === 'markup') {
           new_sell_price = calculateNewPrice(item.expected_old_buy_price, actionType, value, rounding);
        }
      }

      return {
        product_id: item.id,
        expected_old_buy_currency: item.expected_old_buy_currency,
        expected_old_foreign_buy_price: item.expected_old_foreign_buy_price,
        expected_old_buy_price: item.expected_old_buy_price,
        expected_old_sell_price: item.expected_old_sell_price,
        new_buy_currency,
        new_foreign_buy_price,
        new_buy_price,
        new_sell_price
      };
    });

    const parameters = { actionType, rounding, value, exchangeRate };

    const { data: batchId, error: rpcError } = await supabaseAdmin.rpc('execute_bulk_price_update', {
      p_admin_user_id: user.id,
      p_action_type: actionType,
      p_parameters: parameters,
      p_items: processedItems
    });

    if (rpcError) {
      console.error('RPC Error:', rpcError);
      if (rpcError.message.includes('Fiyatlar eşleşmiyor')) {
        return NextResponse.json({ error: 'Bazı fiyatlar arka planda değişmiş. Lütfen önizlemeyi yenileyin.' }, { status: 409 });
      }
      return NextResponse.json({ error: rpcError.message || 'Güncelleme sırasında hata oluştu.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, batchId });

  } catch (err: unknown) {
    console.error('Bulk Update error:', err);
    const errMsg = err instanceof Error ? err.message : String(err);
    const isValidationError = errMsg.includes('Geçersiz') || errMsg.includes('yabancı para') || errMsg.includes('fiyatı') || errMsg.includes('para birimi');
    return NextResponse.json({ error: errMsg || 'Beklenmeyen bir hata oluştu.' }, { status: isValidationError ? 400 : 500 });
  }
}
