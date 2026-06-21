import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const selectionType = searchParams.get('selectionType');
    const brandName = searchParams.get('brandName');
    const q = searchParams.get('q');

    if (!selectionType) {
      return NextResponse.json({ error: 'Seçim türü belirtilmelidir.' }, { status: 400 });
    }

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

    let query = supabaseAdmin.from('products').select('*');

    switch (selectionType) {
      case 'all':
        // No extra filters, query all
        break;
      case 'search':
        if (!q || q.trim().length < 3) {
          return NextResponse.json({ error: 'Arama terimi en az 3 karakter olmalıdır.' }, { status: 400 });
        }
        const term = q.trim();
        query = query.or(`barcode.eq.${term},name.ilike.%${term}%,brand.ilike.%${term}%,model.ilike.%${term}%`);
        break;
      case 'brand':
        if (!brandName || brandName.trim().length === 0) {
          return NextResponse.json({ error: 'Marka bilgisi girilmelidir.' }, { status: 400 });
        }
        query = query.ilike('brand', `%${brandName.trim()}%`);
        break;
      case 'web_visible':
        query = query.eq('is_web_visible', true);
        break;
      case 'web_invisible':
        query = query.eq('is_web_visible', false);
        break;
      case 'foreign_currency':
        query = query.in('buy_currency', ['USD', 'EUR']).gt('foreign_buy_price', 0);
        break;
      case 'try_currency':
        query = query.eq('buy_currency', 'TRY');
        break;
      default:
        return NextResponse.json({ error: 'Geçersiz seçim türü.' }, { status: 400 });
    }

    // Limit to 1001 to detect if it exceeds 1000 limit
    query = query.limit(1001);
    const { data: products, error: queryErr } = await query;

    if (queryErr) {
      console.error('Bulk Select Preview query error:', queryErr);
      return NextResponse.json({ error: 'Ürün sorgulama hatası.' }, { status: 500 });
    }

    if (products.length > 1000) {
      return NextResponse.json({
        error: `Seçilen filtrelere uyan ürün sayısı 1000 limitini aşmaktadır (Mevcut: ${products.length} ürün). Lütfen daha dar bir filtre uygulayın.`
      }, { status: 400 });
    }

    const formatted = products.map(p => ({
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      brand: p.brand,
      model: p.model,
      buy_price: p.buy_price,
      sell_price: p.sell_price,
      buy_currency: p.buy_currency,
      foreign_buy_price: p.foreign_buy_price,
      // Concurrency snapshot fields
      expected_old_buy_currency: p.buy_currency,
      expected_old_foreign_buy_price: p.foreign_buy_price,
      expected_old_buy_price: p.buy_price,
      expected_old_sell_price: p.sell_price
    }));

    return NextResponse.json(formatted);
  } catch (err: unknown) {
    console.error('Unexpected bulk select preview error:', err);
    return NextResponse.json({ error: 'Beklenmeyen bir hata oluştu.' }, { status: 500 });
  }
}
