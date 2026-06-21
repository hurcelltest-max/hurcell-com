import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { createClient } from '@supabase/supabase-js';
import { 
  calculateNewPrice, 
  RoundingType, 
  validateExchangeRate, 
  validateForeignBuyPrice, 
  calculateKeepRatioPrice 
} from '@/lib/priceMath';
import { BatchActionType } from '@/lib/types';

interface BulkPricePayload {
  actionType: BatchActionType;
  rounding: RoundingType;
  value: number;
  exchangeRate?: number;
  currency?: 'USD' | 'EUR';
  sellCalculationMethod?: 'markup' | 'margin' | 'keep_ratio' | 'buy_only';
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
    const { 
      actionType, 
      rounding, 
      value, 
      exchangeRate = 1, 
      currency, 
      sellCalculationMethod = 'keep_ratio', 
      items 
    } = body;

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

    // Query DB products to recalculate values on server-side
    const ids = items.map(i => i.id);
    const { data: dbProducts, error: dbErr } = await supabaseAdmin
      .from('products')
      .select('id, name, buy_price, sell_price, buy_currency, foreign_buy_price')
      .in('id', ids);

    if (dbErr || !dbProducts) {
      console.error('Database fetch error in bulk price:', dbErr);
      return NextResponse.json({ error: 'Ürün bilgileri veritabanından çekilemedi.' }, { status: 500 });
    }

    // Process each item using safe JS price calculation
    const processedItems = items.map(item => {
      const dbProd = dbProducts.find(p => p.id === item.id);
      if (!dbProd) {
        throw new Error(`Ürün bulunamadı: ID ${item.id}`);
      }

      // Input Validation
      if (!['TRY', 'USD', 'EUR'].includes(item.expected_old_buy_currency)) {
        throw new Error(`Geçersiz para birimi: ${item.expected_old_buy_currency}`);
      }

      let new_buy_price = dbProd.buy_price;
      let new_sell_price = dbProd.sell_price;
      const new_buy_currency = dbProd.buy_currency;
      const new_foreign_buy_price = dbProd.foreign_buy_price;

      if (actionType === 'currency_update') {
        if (!currency || !['USD', 'EUR'].includes(currency)) {
          throw new Error('Geçersiz döviz birimi seçildi.');
        }
        if (dbProd.buy_currency !== currency) {
          throw new Error(`Ürün para birimi eşleşmiyor: ${dbProd.buy_currency} (Beklenen: ${currency})`);
        }
        
        const validForeignPrice = validateForeignBuyPrice(dbProd.foreign_buy_price);
        const validRate = validateExchangeRate(exchangeRate);

        // Update TL buy price using exchangeRate
        new_buy_price = calculateNewPrice(validForeignPrice, 'currency_update', 0, 'none', validRate);

        if (sellCalculationMethod === 'markup') {
          new_sell_price = calculateNewPrice(new_buy_price, 'markup', value, rounding);
        } else if (sellCalculationMethod === 'margin') {
          new_sell_price = calculateNewPrice(new_buy_price, 'margin', value, rounding);
        } else if (sellCalculationMethod === 'keep_ratio') {
          new_sell_price = calculateKeepRatioPrice(dbProd.buy_price, dbProd.sell_price, new_buy_price, rounding);
        } else if (sellCalculationMethod === 'buy_only') {
          new_sell_price = dbProd.sell_price;
        } else {
          throw new Error('Geçersiz satış fiyatı hesaplama yöntemi.');
        }
      } else {
        // Normal price action applies to sell_price
        new_sell_price = calculateNewPrice(dbProd.sell_price, actionType, value, rounding);
        
        // If it's margin/markup, it's based on buy_price!
        if (actionType === 'margin' || actionType === 'markup') {
          new_sell_price = calculateNewPrice(dbProd.buy_price, actionType, value, rounding);
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

    const parameters = { actionType, rounding, value, exchangeRate, currency, sellCalculationMethod };

    const { data: batchId, error: rpcError } = await supabaseAdmin.rpc('execute_bulk_price_update', {
      p_admin_user_id: user.id,
      p_action_type: actionType,
      p_parameters: parameters,
      p_items: processedItems
    });

    if (rpcError) {
      console.error('RPC Error:', rpcError);
      if (rpcError.message.includes('Fiyatlar eşleşmiyor') || rpcError.message.includes('beklenen eski değerler uyuşmuyor')) {
        return NextResponse.json({ error: 'Bazı ürün fiyatları önizlemeden sonra değişmiş. Lütfen önizlemeyi yenileyin.' }, { status: 409 });
      }
      return NextResponse.json({ error: rpcError.message || 'Güncelleme sırasında hata oluştu.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, batchId });

  } catch (err: unknown) {
    console.error('Bulk Update error:', err);
    const errMsg = err instanceof Error ? err.message : String(err);
    const isValidationError = 
      errMsg.includes('Geçersiz') || 
      errMsg.includes('yabancı para') || 
      errMsg.includes('fiyatı') || 
      errMsg.includes('para birimi') ||
      errMsg.includes('kuru') ||
      errMsg.includes('required') ||
      errMsg.includes('positive') ||
      errMsg.includes('missing');
    return NextResponse.json({ error: errMsg || 'Beklenmeyen bir hata oluştu.' }, { status: isValidationError ? 400 : 500 });
  }
}
