import { NextResponse } from 'next/server';
import { requireManagerAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { calculatePhysicalCashForDay } from '@/lib/kasa/service';

export async function GET(req: Request) {
  try {
    await requireManagerAuth();
    const { searchParams } = new URL(req.url);
    const kasaDayId = searchParams.get('kasa_day_id');

    if (!kasaDayId) {
      return NextResponse.json({ error: 'kasa_day_id parametresi zorunludur.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // 1. Gün bilgisi
    const { data: day, error: dayError } = await supabase
      .from('kasa_days')
      .select('*')
      .eq('id', kasaDayId)
      .single();

    if (dayError || !day) {
      return NextResponse.json({ error: 'Kasa günü bulunamadı.' }, { status: 444 });
    }

    const isDayOpen = day.status === 'open';
    const physicalCashKurus = await calculatePhysicalCashForDay(kasaDayId);

    // 2. Satışlar (kasa_sales)
    const { data: salesData, error: salesError } = await supabase
      .from('kasa_sales')
      .select(`
        *,
        category:kasa_categories(name),
        created_by:kasa_users(full_name)
      `)
      .eq('kasa_day_id', kasaDayId)
      .order('created_at', { ascending: false });

    if (salesError) {
      throw new Error(`Satışlar okunamadı: ${salesError.message}`);
    }

    const sales = (salesData || []).map((s: any) => {
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
        category_name: (s.category as any)?.name || 'Genel',
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
        created_by_name: (s.created_by as any)?.full_name || 'Sistem',
        can_update: canAct,
        can_cancel: canAct,
        action_block_reason: blockReason,
      };
    });

    // 3. Giderler (kasa_expenses)
    const { data: expensesData, error: expensesError } = await supabase
      .from('kasa_expenses')
      .select(`
        *,
        category:kasa_expense_categories(name, is_salary_category),
        created_by:kasa_users(full_name)
      `)
      .eq('kasa_day_id', kasaDayId)
      .order('created_at', { ascending: false });

    if (expensesError) {
      throw new Error(`Giderler okunamadı: ${expensesError.message}`);
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

      return {
        entity_type: 'expense',
        entity_id: e.id,
        kasa_day_id: e.kasa_day_id,
        expense_category_id: e.expense_category_id,
        category_name: (e.category as any)?.name || 'Gider',
        is_salary_category: (e.category as any)?.is_salary_category || false,
        amount_kurus: Number(e.amount_kurus || 0),
        description: e.description,
        recipient_name: e.recipient_name || '',
        status: e.status,
        created_at: e.created_at,
        created_by_name: (e.created_by as any)?.full_name || 'Sistem',
        can_update: canAct,
        can_cancel: canAct,
        action_block_reason: blockReason,
      };
    });

    // 4. Hareket Defteri (kasa_movements)
    const { data: movementsData, error: movementsError } = await supabase
      .from('kasa_movements')
      .select(`
        *,
        created_by:kasa_users(full_name),
        sale:kasa_sales(receipt_no, status, category:kasa_categories(name))
      `)
      .eq('kasa_day_id', kasaDayId)
      .order('created_at', { ascending: false });

    if (movementsError) {
      throw new Error(`Hareket defteri okunamadı: ${movementsError.message}`);
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

    const ledger = (movementsData || []).map((m: any) => {
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
        created_by_name: (m.created_by as any)?.full_name || 'Sistem',
        receipt_no: (m.sale as any)?.receipt_no || undefined,
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
      ledger,
    });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN') || error.message?.includes('YETKİSİZ')) {
      return NextResponse.json({ error: 'Bu işlem yalnızca yöneticilere aittir.' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'Gün detayları okunamadı.' }, { status: 500 });
  }
}
