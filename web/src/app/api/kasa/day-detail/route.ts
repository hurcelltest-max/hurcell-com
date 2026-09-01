import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { calculatePhysicalCashForDay } from '@/lib/kasa/service';
import { canEditSale, canCancelSale, canEditExpense, canCancelExpense } from '@/lib/kasa/pure_utils';

export async function GET(req: Request) {
  try {
    const auth = await requireKasaAuth();
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
      console.error('[day-detail] Kasa günü sorgu hatası:', dayError);
      return NextResponse.json(
        { error: dayError ? `Veritabanı hatası: ${dayError.message}` : 'Kasa günü bulunamadı.' },
        { status: dayError ? 500 : 404 }
      );
    }

    const dayStatus = day.status as 'open' | 'closed';
    const physicalCashKurus = await calculatePhysicalCashForDay(dayId);

    // 2. Ayrı Lookup Sorguları (FK Join bağımlılığı olmadan güvenli iki aşamalı birleştirme)
    const [usersRes, salesCatsRes, expCatsRes, bankAccountsRes] = await Promise.all([
      supabase.from('kasa_users').select('id, full_name'),
      supabase.from('kasa_categories').select('id, name'),
      supabase.from('kasa_expense_categories').select('id, name, is_salary_category'),
      supabase.from('kasa_bank_accounts').select('id, account_name, currency_code'),
    ]);

    const userMap = new Map<string, string>();
    (usersRes.data || []).forEach((u: any) => userMap.set(u.id, u.full_name));

    const salesCatMap = new Map<string, string>();
    (salesCatsRes.data || []).forEach((c: any) => salesCatMap.set(c.id, c.name));

    const expCatMap = new Map<string, { name: string; is_salary_category: boolean }>();
    (expCatsRes.data || []).forEach((c: any) =>
      expCatMap.set(c.id, { name: c.name, is_salary_category: !!c.is_salary_category })
    );

    const bankMap = new Map<string, string>();
    (bankAccountsRes.data || []).forEach((b: any) => bankMap.set(b.id, b.account_name));

    // 3. Satışlar Sorgusu
    const { data: salesData, error: salesError } = await supabase
      .from('kasa_sales')
      .select('*')
      .eq('kasa_day_id', dayId)
      .order('created_at', { ascending: true });

    if (salesError) {
      return NextResponse.json({ error: `Satış verileri okunamadı: ${salesError.message}` }, { status: 500 });
    }

    const saleReceiptMap = new Map<string, string>();

    const sales = (salesData || []).map((s: any) => {
      if (s.id && s.receipt_no) {
        saleReceiptMap.set(s.id, s.receipt_no);
      }

      const createdByUserId = s.created_by_user_id;
      const isOwnRecord = auth.user.id === createdByUserId;

      const canUpdate = canEditSale({
        role: auth.user.role,
        currentUserId: auth.user.id,
        saleCreatedByUserId: createdByUserId,
        saleStatus: s.status,
        dayStatus,
        movementType: 'satis',
      });

      const canCancel = canCancelSale({
        role: auth.user.role,
        saleStatus: s.status,
        dayStatus,
        movementType: 'satis',
      });

      let blockReason: string | null = null;
      if (dayStatus === 'closed') {
        blockReason = 'Kapanmış kasa gününe ait satışlar değiştirilemez.';
      } else if (s.status !== 'completed') {
        blockReason = `İptal veya iade edilmiş satış düzenlenemez (${s.status}).`;
      } else if (auth.user.role === 'personel') {
        if (!isOwnRecord) {
          blockReason = 'Personel yalnızca kendi oluşturduğu satışları düzeltebilir.';
        } else if (!canCancel) {
          blockReason = 'Satış iptal yetkisi yalnızca yöneticilere aittir.';
        }
      }

      return {
        entity_type: 'sale',
        entity_id: s.id,
        receipt_no: s.receipt_no,
        kasa_day_id: s.kasa_day_id,
        category_id: s.category_id,
        category_name: salesCatMap.get(s.category_id) || 'Genel',
        product_name: s.product_name,
        customer_name: s.customer_name || null,
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
        service_cost_payment_status: s.service_cost_payment_status || null,
        status: s.status,
        created_at: s.created_at,
        created_by_user_id: createdByUserId,
        created_by_name: userMap.get(createdByUserId) || 'Sistem',
        is_own_record: isOwnRecord,
        day_status: dayStatus,
        can_update: canUpdate,
        can_cancel: canCancel,
        action_block_reason: blockReason,
      };
    });

    // 4. Giderler Sorgusu
    const { data: expensesData, error: expensesError } = await supabase
      .from('kasa_expenses')
      .select('*')
      .eq('kasa_day_id', dayId)
      .order('created_at', { ascending: true });

    if (expensesError) {
      return NextResponse.json({ error: `Gider verileri okunamadı: ${expensesError.message}` }, { status: 500 });
    }

    const rawExpenses = expensesData || [];
    const expenses: any[] = [];

    for (const e of rawExpenses) {
      const expCatInfo = expCatMap.get(e.expense_category_id);
      const isSalary = expCatInfo?.is_salary_category || false;

      // Personel maaş kayıtlarını görmesin
      if (auth.user.role === 'personel' && isSalary) {
        continue;
      }

      const createdByUserId = e.created_by_user_id;
      const isOwnRecord = auth.user.id === createdByUserId;

      const canUpdate = canEditExpense({
        role: auth.user.role,
        currentUserId: auth.user.id,
        expenseCreatedByUserId: createdByUserId,
        expenseStatus: e.status,
        dayStatus,
        isSalaryCategory: isSalary,
      });

      const canCancel = canCancelExpense({
        role: auth.user.role,
        currentUserId: auth.user.id,
        expenseCreatedByUserId: createdByUserId,
        expenseStatus: e.status,
        dayStatus,
        isSalaryCategory: isSalary,
      });

      let blockReason: string | null = null;
      if (dayStatus === 'closed') {
        blockReason = 'Kapanmış kasa gününe ait giderler değiştirilemez.';
      } else if (e.status === 'cancelled') {
        blockReason = 'İptal edilmiş gider düzenlenemez.';
      } else if (isSalary && auth.user.role === 'personel') {
        blockReason = 'Personel maaşı kayıtları yalnızca yöneticiler tarafından düzenlenebilir.';
      } else if (auth.user.role === 'personel' && !isOwnRecord) {
        blockReason = 'Personel yalnızca kendi oluşturduğu günlük giderleri düzeltebilir veya iptal edebilir.';
      }

      expenses.push({
        entity_type: 'expense',
        entity_id: e.id,
        kasa_day_id: e.kasa_day_id,
        expense_category_id: e.expense_category_id,
        category_name: expCatInfo?.name || 'Gider',
        is_salary_category: isSalary,
        amount_kurus: Number(e.amount_kurus || 0),
        description: e.description,
        recipient_name: e.recipient_name || '',
        payment_method: e.payment_method || 'cash',
        bank_account_id: e.bank_account_id || null,
        bank_account_name: e.bank_account_id ? bankMap.get(e.bank_account_id) || 'Banka' : null,
        status: e.status,
        created_at: e.created_at,
        created_by_user_id: createdByUserId,
        created_by_name: userMap.get(createdByUserId) || 'Sistem',
        is_own_record: isOwnRecord,
        day_status: dayStatus,
        can_update: canUpdate,
        can_cancel: canCancel,
        action_block_reason: blockReason,
      });
    }

    // 5. Hareket Defteri (kasa_movements) Sorgusu
    const { data: movementsData, error: movementsError } = await supabase
      .from('kasa_movements')
      .select('*')
      .eq('kasa_day_id', dayId)
      .order('created_at', { ascending: true });

    if (movementsError) {
      return NextResponse.json({ error: `Hareket defteri okunamadı: ${movementsError.message}` }, { status: 500 });
    }

    const labelMap: Record<string, string> = {
      satis: 'Satış',
      nakit_tahsilat: 'Nakit Tahsilat',
      kredi_karti_tahsilat: 'Kredi Kartı Tahsilat',
      bank_transfer_tahsilat: 'Havale / EFT Tahsilat',
      nakit_gider: 'Nakit Gider',
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
    return NextResponse.json({ error: error.message || 'Gün detayları okunamadı.' }, { status: 401 });
  }
}
