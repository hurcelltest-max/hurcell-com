import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { KasaBankMovementDetailItem } from '@/lib/kasa/types';

export async function GET(req: Request) {
  try {
    const auth = await requireKasaAuth();
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);

    // 1. Calculate Turkey/Istanbul date bounds or use query params
    const istanbulFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayStr = istanbulFormatter.format(new Date()); // YYYY-MM-DD
    const [yearStr, monthStr, dayStr] = todayStr.split('-');
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    const dayNum = Number(dayStr);

    let startDateStr = searchParams.get('start_date');
    let endDateStr = searchParams.get('end_date');
    const dayIdParam = searchParams.get('day_id');

    if (dayIdParam) {
      const { data: dayRec } = await supabase
        .from('kasa_days')
        .select('date_val')
        .eq('id', dayIdParam)
        .single();
      if (dayRec?.date_val) {
        startDateStr = dayRec.date_val;
        endDateStr = dayRec.date_val;
      }
    }

    if (!startDateStr) {
      startDateStr = `${yearStr}-${monthStr}-01`;
    }
    if (!endDateStr) {
      endDateStr = todayStr;
    }

    // 2. Kasa günlerini bul (aralıktaki açık ve kapalı günler)
    const { data: days, error: daysError } = await supabase
      .from('kasa_days')
      .select('id, date_val')
      .gte('date_val', startDateStr)
      .lte('date_val', endDateStr)
      .order('date_val', { ascending: true });

    if (daysError) {
      throw new Error(`Kasa günleri sorgulanamadı: ${daysError.message}`);
    }

    const dayMap = new Map<string, string>();
    (days || []).forEach((d) => {
      dayMap.set(d.id, d.date_val);
    });
    const dayIds = Array.from(dayMap.keys());

    let cashSalesMinor = 0;
    let cardSalesMinor = 0;
    let bankTransferSalesMinor = 0;

    let creditCashMinor = 0;
    let creditCardMinor = 0;
    let creditBankMinor = 0;

    let cashExpensesMinor = 0;
    let bankExpensesMinor = 0;

    let totalBankInflowMinor = 0;
    let totalBankOutflowMinor = 0;
    let totalBalanceAdjustmentsMinor = 0;
    let totalInterbankTransfersMinor = 0;

    const detailItems: KasaBankMovementDetailItem[] = [];

    // Sayfalama yardımcı fonksiyonu
    async function fetchAllRows<T>(
      queryBuilder: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>
    ): Promise<T[]> {
      const PAGE_SIZE = 1000;
      let page = 0;
      const allRows: T[] = [];

      while (true) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await queryBuilder(from, to);

        if (error) {
          throw error;
        }

        if (!data || data.length === 0) {
          break;
        }

        allRows.push(...data);

        if (data.length < PAGE_SIZE) {
          break;
        }

        page++;
      }

      return allRows;
    }

    if (dayIds.length > 0) {
      // 1. Satışlar (Havale/EFT, Kart, Nakit)
      const sales = await fetchAllRows<any>(async (from, to) => {
        const res = await supabase
          .from('kasa_sales')
          .select(`
            id,
            kasa_day_id,
            receipt_no,
            product_name,
            cash_paid_kurus,
            card_paid_kurus,
            bank_transfer_paid_kurus,
            bank_transfer_reference,
            pos_bank_account_id,
            status,
            created_at,
            created_by_user:kasa_users!kasa_sales_created_by_user_id_fkey(full_name, username)
          `)
          .in('kasa_day_id', dayIds)
          .eq('status', 'completed')
          .order('id', { ascending: true })
          .range(from, to);

        if (res.error) {
          throw new Error(`Satışlar sorgulanamadı: ${res.error.message}`);
        }
        return res;
      });

      sales.forEach((s) => {
        cashSalesMinor += Number(s.cash_paid_kurus || 0);
        cardSalesMinor += Number(s.card_paid_kurus || 0);
        const transferAmt = Number(s.bank_transfer_paid_kurus || 0);
        bankTransferSalesMinor += transferAmt;

        if (transferAmt > 0) {
          const dayDate = dayMap.get(s.kasa_day_id) || s.created_at?.split('T')[0] || '';
          const timeStr = s.created_at ? new Date(s.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }) : '';
          const creator = s.created_by_user?.full_name || s.created_by_user?.username || 'Sistem';
          const bankRef = s.bank_transfer_reference ? String(s.bank_transfer_reference).trim() : 'Banka / Havale';

          detailItems.push({
            id: `sale_transfer_${s.id}`,
            source_type: 'sale_transfer',
            type_label: 'Havale / EFT Satış Tahsilatı',
            date: dayDate,
            time: timeStr,
            direction: 'in',
            amount_kurus: transferAmt,
            bank_name: bankRef,
            account_name: bankRef,
            description: `Satış: ${s.product_name || 'Ürün/Hizmet'} (${s.receipt_no || ''})${s.bank_transfer_reference ? ` - Ref: ${s.bank_transfer_reference}` : ''}`,
            reference_no: s.bank_transfer_reference,
            receipt_no: s.receipt_no,
            created_by_name: creator,
            is_operating_revenue: true,
            is_operating_expense: false,
            is_adjustment: false,
            is_transfer: false,
            created_at: s.created_at,
          });
        }
      });

      // 2. Cari Tahsilatları (Havale/EFT, Kart, Nakit)
      const creditPayments = await fetchAllRows<any>(async (from, to) => {
        const res = await supabase
          .from('kasa_credit_payments')
          .select(`
            id,
            kasa_day_id,
            cash_paid_kurus,
            card_paid_kurus,
            bank_transfer_paid_kurus,
            bank_transfer_reference,
            description,
            created_at,
            customer:credit_customers!kasa_credit_payments_credit_customer_id_fkey(full_name),
            created_by_user:kasa_users!kasa_credit_payments_created_by_user_id_fkey(full_name, username)
          `)
          .in('kasa_day_id', dayIds)
          .order('id', { ascending: true })
          .range(from, to);

        if (res.error) {
          throw new Error(`Cari tahsilatları sorgulanamadı: ${res.error.message}`);
        }
        return res;
      });

      creditPayments.forEach((cp) => {
        creditCashMinor += Number(cp.cash_paid_kurus || 0);
        creditCardMinor += Number(cp.card_paid_kurus || 0);
        const transferAmt = Number(cp.bank_transfer_paid_kurus || 0);
        creditBankMinor += transferAmt;

        if (transferAmt > 0) {
          const dayDate = dayMap.get(cp.kasa_day_id) || cp.created_at?.split('T')[0] || '';
          const timeStr = cp.created_at ? new Date(cp.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }) : '';
          const creator = cp.created_by_user?.full_name || cp.created_by_user?.username || 'Sistem';
          const custName = cp.customer?.full_name || 'Müşteri';
          const bankRef = cp.bank_transfer_reference ? String(cp.bank_transfer_reference).trim() : 'Banka / Havale';

          detailItems.push({
            id: `credit_transfer_${cp.id}`,
            source_type: 'credit_transfer',
            type_label: 'Havale / EFT Cari Tahsilat',
            date: dayDate,
            time: timeStr,
            direction: 'in',
            amount_kurus: transferAmt,
            bank_name: bankRef,
            account_name: bankRef,
            description: `Cari Tahsilat: ${custName}${cp.bank_transfer_reference ? ` - Ref: ${cp.bank_transfer_reference}` : ''}`,
            reference_no: cp.bank_transfer_reference,
            receipt_no: null,
            created_by_name: creator,
            is_operating_revenue: true,
            is_operating_expense: false,
            is_adjustment: false,
            is_transfer: false,
            created_at: cp.created_at,
          });
        }
      });

      // 3. Giderler (kasa_expenses)
      const expenses = await fetchAllRows<any>(async (from, to) => {
        const res = await supabase
          .from('kasa_expenses')
          .select(`
            id,
            kasa_day_id,
            amount_kurus,
            payment_method,
            description,
            recipient_name,
            bank_account_id,
            status,
            created_at,
            account:kasa_bank_accounts!kasa_expenses_bank_account_id_fkey(bank_name, account_name),
            created_by_user:kasa_users!kasa_expenses_created_by_user_id_fkey(full_name, username)
          `)
          .in('kasa_day_id', dayIds)
          .eq('status', 'active')
          .order('id', { ascending: true })
          .range(from, to);

        if (res.error) {
          throw new Error(`Giderler sorgulanamadı: ${res.error.message}`);
        }
        return res;
      });

      expenses.forEach((e) => {
        const amt = Number(e.amount_kurus || 0);
        if (e.payment_method === 'cash') {
          cashExpensesMinor += amt;
        } else if (e.payment_method === 'bank') {
          bankExpensesMinor += amt;
        }
      });
    }

    // 4. Doğrudan Banka Hareketleri (kasa_bank_transactions)
    const bankTxs = await fetchAllRows<any>(async (from, to) => {
      const res = await supabase
        .from('kasa_bank_transactions')
        .select(`
          id,
          bank_account_id,
          transaction_type,
          direction,
          amount_kurus,
          transaction_date,
          description,
          reference_no,
          related_sale_id,
          related_expense_id,
          status,
          created_at,
          account:kasa_bank_accounts!kasa_bank_transactions_bank_account_id_fkey(bank_name, account_name),
          created_by_user:kasa_users!kasa_bank_transactions_created_by_user_id_fkey(full_name, username)
        `)
        .gte('transaction_date', startDateStr)
        .lte('transaction_date', endDateStr)
        .eq('status', 'active')
        .order('transaction_date', { ascending: true })
        .range(from, to);

      if (res.error) {
        throw new Error(`Banka hareketleri sorgulanamadı: ${res.error.message}`);
      }
      return res;
    });

    bankTxs.forEach((bt) => {
      const amt = Number(bt.amount_kurus || 0);
      const bankName = bt.account?.bank_name || 'Banka';
      const accountName = bt.account?.account_name || '';
      const creator = bt.created_by_user?.full_name || bt.created_by_user?.username || 'Sistem';
      const timeStr = bt.created_at ? new Date(bt.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }) : '';
      const dateVal = bt.transaction_date || bt.created_at?.split('T')[0] || '';

      if (bt.direction === 'in') {
        totalBankInflowMinor += amt;
      } else {
        totalBankOutflowMinor += amt;
      }

      if (bt.transaction_type === 'balance_adjustment') {
        totalBalanceAdjustmentsMinor += (bt.direction === 'in' ? amt : -amt);
      } else if (bt.transaction_type === 'transfer' || bt.transaction_type === 'transfer_in' || bt.transaction_type === 'transfer_out') {
        totalInterbankTransfersMinor += amt;
      }

      let typeLabel = 'Banka Hareketi';
      let isOperatingRevenue = false;
      let isOperatingExpense = false;
      let isAdjustment = false;
      let isTransfer = false;
      let srcType: KasaBankMovementDetailItem['source_type'] = 'interbank_transfer';

      switch (bt.transaction_type) {
        case 'pos_collection':
          typeLabel = 'POS / Kart Tahsilatı';
          isOperatingRevenue = true;
          srcType = 'pos_collection';
          break;
        case 'bank_expense':
          typeLabel = 'Banka Gideri';
          isOperatingExpense = true;
          srcType = 'bank_expense';
          break;
        case 'balance_adjustment':
          typeLabel = 'Banka Bakiye Düzeltmesi';
          isAdjustment = true;
          srcType = 'balance_adjustment';
          break;
        case 'transfer':
        case 'transfer_in':
        case 'transfer_out':
          typeLabel = 'Bankalar Arası Transfer';
          isTransfer = true;
          srcType = 'interbank_transfer';
          break;
        case 'bank_deposit':
        case 'deposit':
          typeLabel = 'Kasadan Bankaya Yatırma';
          isTransfer = true;
          srcType = 'bank_deposit';
          break;
        case 'owner_withdrawal':
          typeLabel = 'Şahsi Çekim (Banka)';
          isTransfer = true;
          srcType = 'owner_withdrawal';
          break;
        case 'capital_injection':
          typeLabel = 'Sermaye Girişi (Banka)';
          isTransfer = true;
          srcType = 'capital_injection';
          break;
        case 'ts_cost_payment':
          typeLabel = 'Teknik Servis Maliyet Ödemesi (Banka)';
          isOperatingExpense = true;
          srcType = 'ts_cost_payment';
          break;
        default:
          typeLabel = bt.transaction_type;
          srcType = 'interbank_transfer';
          break;
      }

      detailItems.push({
        id: `bank_tx_${bt.id}`,
        source_type: srcType,
        type_label: typeLabel,
        date: dateVal,
        time: timeStr,
        direction: bt.direction === 'in' ? 'in' : 'out',
        amount_kurus: amt,
        bank_name: bankName,
        account_name: accountName,
        description: bt.description || typeLabel,
        reference_no: bt.reference_no || null,
        receipt_no: null,
        created_by_name: creator,
        is_operating_revenue: isOperatingRevenue,
        is_operating_expense: isOperatingExpense,
        is_adjustment: isAdjustment,
        is_transfer: isTransfer,
        created_at: bt.created_at,
      });
    });

    // Tarihe ve oluşturulma anına göre azalan sırala
    detailItems.sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const netCashMinor = cashSalesMinor + creditCashMinor;
    const netCardMinor = cardSalesMinor + creditCardMinor;
    const netBankTransferMinor = bankTransferSalesMinor + creditBankMinor;
    const netCreditMinor = creditCashMinor + creditCardMinor + creditBankMinor;
    const netCollectionsMinor = netCashMinor + netCardMinor + netBankTransferMinor;
    const netTotalExpensesMinor = cashExpensesMinor + bankExpensesMinor;

    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    let periodLabel = `1–${dayNum} ${monthNames[monthIndex]} ${year}`;
    if (startDateStr !== `${yearStr}-${monthStr}-01` || endDateStr !== todayStr) {
      periodLabel = `${startDateStr} – ${endDateStr}`;
    }

    const collections = {
      period_label: periodLabel,
      start_date: startDateStr,
      end_date: endDateStr,
      cash_sales_collections_minor: cashSalesMinor,
      card_sales_collections_minor: cardSalesMinor,
      bank_transfer_sales_collections_minor: bankTransferSalesMinor,
      credit_collections_by_cash_minor: creditCashMinor,
      credit_collections_by_card_minor: creditCardMinor,
      credit_collections_by_bank_minor: creditBankMinor,
      refunds_by_channel_minor: 0,
      net_cash_collections_minor: netCashMinor,
      net_card_collections_minor: netCardMinor,
      net_bank_transfer_collections_minor: netBankTransferMinor,
      net_credit_collections_minor: netCreditMinor,
      net_collections_minor: netCollectionsMinor,
      net_cash_expenses_minor: cashExpensesMinor,
      net_bank_expenses_minor: bankExpensesMinor,
      net_total_expenses_minor: netTotalExpensesMinor,
      total_bank_inflow_minor: totalBankInflowMinor,
      total_bank_outflow_minor: totalBankOutflowMinor,
      total_balance_adjustments_minor: totalBalanceAdjustmentsMinor,
      total_interbank_transfers_minor: totalInterbankTransfersMinor,
      items: detailItems,
    };

    return NextResponse.json({ collections, items: detailItems });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Tahsilat, gider ve banka hareketleri verisi alınamadı.' }, { status: 500 });
  }
}
