import { NextResponse } from 'next/server';
import { requireManagerAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { calculatePhysicalCashForDay } from '@/lib/kasa/service';

export async function GET(req: Request) {
  try {
    await requireManagerAuth();
    const { searchParams } = new URL(req.url);
    const dayId = searchParams.get('day_id') || searchParams.get('kasa_day_id');

    if (!dayId) {
      return NextResponse.json({ error: 'day_id veya kasa_day_id parametresi zorunludur.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // 1. Kasa Günü Bilgisi
    const { data: day, error: dayError } = await supabase
      .from('kasa_days')
      .select('*')
      .eq('id', dayId)
      .single();

    if (dayError || !day) {
      console.error('day-detail: Kasa günü sorgu hatası:', dayError);
      return NextResponse.json(
        { error: dayError ? `Veritabanı hatası: ${dayError.message}` : 'Kasa günü bulunamadı.' },
        { status: dayError ? 500 : 404 }
      );
    }

    const isDayOpen = day.status === 'open';
    const physicalCashKurus = await calculatePhysicalCashForDay(dayId);

    // 2. Güvenli Ayrı Lookup Sorguları (Foreign Key Join bağımlılığını tamamen kaldırıyoruz)
    const [usersRes, salesCatsRes, expCatsRes] = await Promise.all([
      supabase.from('kasa_users').select('id, full_name'),
      supabase.from('kasa_categories').select('id, name'),
      supabase.from('kasa_expense_categories').select('id, name, is_salary_category'),
    ]);

    const userMap = new Map<string, string>();
    (usersRes.data || []).forEach((u: any) => userMap.set(u.id, u.full_name));

    const salesCatMap = new Map<string, string>();
    (salesCatsRes.data || []).forEach((c: any) => salesCatMap.set(c.id, c.name));

    const expCatMap = new Map<string, { name: string; is_salary_category: boolean }>();
    (expCatsRes.data || []).forEach((c: any) =>
      expCatMap.set(c.id, { name: c.name, is_salary_category: !!c.is_salary_category })
    );

    // 3. Satışlar (kasa_sales) Sorgusu
    const { data: salesData, error: salesError } = await supabase
      .from('kasa_sales')
      .select('*')
      .eq('kasa_day_id', dayId)
      .order('created_at', { ascending: true });

    if (salesError) {
      console.error('day-detail: Satışlar sorgu hatası:', salesError);
      return NextResponse.json({ error: `Satış verileri okunamadı: ${salesError.message}` }, { status: 500 });
    }

    const saleReceiptMap = new Map<string, string>();

    const sales = (salesData || []).map((s: any) => {
      if (s.id && s.receipt_no) {
        saleReceiptMap.set(s.id, s.receipt_no);
      }

      const isCompleted = s.status === 'completed';
      const canAct = isDayOpen && isCompleted;
      let blockReason: string | null = null;

      if (!isDayOpen) {
        blockReason = 'Kapanmış kasa gününe ait mali kayıtlar değiştirilemez.';
      } else if (!isCompleted) {
        blockReason = `İptal veya iade edilmiş satış düzenlenemez (${s.status}).`;
      }

      return {
        entity_type: 'sale',
        entity_id: s.id,
        receipt_no: s.receipt_no,
        kasa_day_id: s.kasa_day_id,
        category_id: s.category_id,
        category_name: salesCatMap.get(s.category_id) || 'Genel',
        product_name: s.product_name,
        quantity: Number(s.quantity || 1),
        unit_price_kurus: Number(s.unit_price_kurus || 0),
        total_price_kurus: Number(s.total_price_kurus || 0),
        cash_paid_kurus: Number(s.cash_paid_kurus || 0),
        card_paid_kurus: Number(s.card_paid_kurus || 0),
        bank_transfer_paid_kurus: Number(s.bank_transfer_paid_kurus || 0),
        credit_paid_kurus: Number(s.credit_paid_kurus || 0),
        usd_paid_cents: Number(s.usd_paid_cents || 0),
        eur_paid_cents: Number(s.eur_paid_cents || 0),
        cost_price_kurus: s.cost_price_kurus ? Number(s.cost_price_kurus) : undefined,
        service_cost_kurus: s.service_cost_kurus ? Number(s.service_cost_kurus) : undefined,
        status: s.status,
        created_at: s.created_at,
        created_by_name: userMap.get(s.created_by_user_id) || 'Sistem',
        can_update: canAct,
        can_cancel: canAct,
        action_block_reason: blockReason,
      };
    });

    // 4. Giderler (kasa_expenses) Sorgusu
    const { data: expensesData, error: expensesError } = await supabase
      .from('kasa_expenses')
      .select('*')
      .eq('kasa_day_id', dayId)
      .order('created_at', { ascending: true });

    if (expensesError) {
      console.error('day-detail: Giderler sorgu hatası:', expensesError);
      return NextResponse.json({ error: `Gider verileri okunamadı: ${expensesError.message}` }, { status: 500 });
    }

    const expenses = (expensesData || []).map((e: any) => {
      const isActive = e.status !== 'cancelled';
      const canAct = isDayOpen && isActive;
      let blockReason: string | null = null;

      if (!isDayOpen) {
        blockReason = 'Kapanmış kasa gününe ait mali kayıtlar değiştirilemez.';
      } else if (!isActive) {
        blockReason = 'İptal edilmiş gider düzenlenemez.';
      }

      const expCatInfo = expCatMap.get(e.expense_category_id);

      return {
        entity_type: 'expense',
        entity_id: e.id,
        kasa_day_id: e.kasa_day_id,
        expense_category_id: e.expense_category_id,
        category_name: expCatInfo?.name || 'Gider',
        is_salary_category: expCatInfo?.is_salary_category || false,
        amount_kurus: Number(e.amount_kurus || 0),
        description: e.description,
        recipient_name: e.recipient_name || '',
        status: e.status,
        created_at: e.created_at,
        created_by_name: userMap.get(e.created_by_user_id) || 'Sistem',
        can_update: canAct,
        can_cancel: canAct,
        action_block_reason: blockReason,
      };
    });

    // 5. Hareket Defteri (kasa_movements) Sorgusu
    const { data: movementsData, error: movementsError } = await supabase
      .from('kasa_movements')
      .select('*')
      .eq('kasa_day_id', dayId)
      .order('created_at', { ascending: true });

    if (movementsError) {
      console.error('day-detail: Hareket defteri sorgu hatası:', movementsError);
      return NextResponse.json({ error: `Hareket defteri okunamadı: ${movementsError.message}` }, { status: 500 });
    }

    const labelMap: Record<string, string> = {
      satis: 'Satış',
      nakit_tahsilat: 'Nakit Tahsilat',
      kredi_karti_tahsilat: 'Kredi Kartı Tahsilat',
      bank_transfer_tahsilat: 'Havale / EFT Tahsilat',
      nakit_gider: 'Gider Ödemesi',
      salary_payment: 'Personel Maaş Ödemesi',
      iade: 'Satış İadesi',
      iptal: 'Satış İptali',
      acilis_bakiyesi: 'Önceki Gün Devri / Açılış',
      gun_sonu_kapanis: 'Gün Sonu Kapanış Sayımı',
      capital_injection: 'Sermaye Girişi',
      owner_withdrawal: 'İşletme Sahibi Çekimi',
      bank_deposit: 'Bankaya Yatırılan Nakit',
      fx_sale_payment: 'Dövizli Satış Tahsilatı',
      fx_conversion_to_try: 'Döviz Bozdurma (TL Kasa Girişi)',
      credit_tahsilat: 'Cari Tahsilat',
      satis_duzeltme_iptal: 'Satış Düzeltme İptal Kaydı',
      satis_duzeltme_yeni: 'Satış Düzeltme Yeni Kayıt',
      gider_duzeltme_iptal: 'Gider Düzeltme İptal Kaydı',
      gider_duzeltme_yeni: 'Gider Düzeltme Yeni Kayıt',
      gider_iptal: 'Gider İptali',
      ts_cost_cash_payment: 'Teknik Servis Nakit Maliyet Ödemesi',
      ts_cost_cash_refund: 'Teknik Servis Maliyet İadesi Kasaya Giriş',
      carryover_repair: 'Devir Onarımı Kaydı',
    };

    const movements = (movementsData || []).map((m: any) => {
      const cashPortion = Number(m.cash_portion_kurus || 0);
      const cardPortion = Number(m.card_portion_kurus || 0);
      const bankTransferPortion = Number(m.bank_transfer_portion_kurus || 0);

      let cash_in_kurus = 0;
      let cash_out_kurus = 0;

      if (cashPortion > 0) {
        cash_in_kurus = cashPortion;
      } else if (cashPortion < 0) {
        cash_out_kurus = Math.abs(cashPortion);
      }

      return {
        entity_type: 'ledger',
        entity_id: m.id,
        kasa_day_id: m.kasa_day_id,
        movement_type: m.movement_type,
        movement_label: labelMap[m.movement_type] || m.movement_type,
        description: m.description,
        cash_in_kurus,
        cash_out_kurus,
        card_portion_kurus: cardPortion,
        bank_transfer_portion_kurus: bankTransferPortion,
        created_at: m.created_at,
        created_by_name: userMap.get(m.created_by_user_id) || 'Sistem',
        receipt_no: m.sale_id ? saleReceiptMap.get(m.sale_id) : undefined,
        can_update: false,
        can_cancel: false,
        action_block_reason: 'Muhasebe defter satırları doğrudan değiştirilemez.',
      };
    });

    return NextResponse.json({
      day: {
        id: day.id,
        date_val: day.date_val,
        status: day.status,
        opening_balance_kurus: Number(day.opening_balance_kurus || 0),
        capital_injected_kurus: Number(day.capital_injected_kurus || 0),
        owner_withdrawn_kurus: Number(day.owner_withdrawn_kurus || 0),
        calculated_physical_cash_kurus: physicalCashKurus,
        counted_cash_kurus: day.counted_cash_kurus !== null && day.counted_cash_kurus !== undefined ? Number(day.counted_cash_kurus) : null,
      },
      sales,
      expenses,
      movements,
      counts: {
        sales: sales.length,
        expenses: expenses.length,
        movements: movements.length,
      },
    });
  } catch (error: any) {
    console.error('day-detail: Beklenmeyen hata:', error);
    if (error.message?.startsWith('FORBIDDEN') || error.message?.includes('YETKİSİZ')) {
      return NextResponse.json({ error: 'Bu işlem yalnızca yöneticilere aittir.' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'Gün detayları okunamadı.' }, { status: 500 });
  }
}
