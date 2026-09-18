import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const auth = await requireKasaAuth();
    const supabase = getSupabaseAdmin();

    // 1. Calculate Turkey/Istanbul month date range (canonical date_val bounds)
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

    const startDateStr = `${yearStr}-${monthStr}-01`;
    const endDateStr = todayStr;

    // 2. Ay kapsamındaki tüm kasa günlerini bul (açık ve kapanmış günler)
    const { data: days, error: daysError } = await supabase
      .from('kasa_days')
      .select('id, date_val')
      .gte('date_val', startDateStr)
      .lte('date_val', endDateStr);

    if (daysError) {
      throw new Error(`Ay kasa günleri sorgulanamadı: ${daysError.message}`);
    }

    const dayIds = (days || []).map((d) => d.id);

    let cashSalesMinor = 0;
    let cardSalesMinor = 0;
    let bankTransferSalesMinor = 0;

    let creditCashMinor = 0;
    let creditCardMinor = 0;
    let creditBankMinor = 0;

    let cashExpensesMinor = 0;
    let bankExpensesMinor = 0;

    // PostgREST 1000 satır sınırına karşı kararlı sıralı tam sayfalama fonksiyonu
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
      // 1. Aybaşından bugüne tamamlanan satışlar (kasa gününe bağlı, tam sayfalanmış)
      const sales = await fetchAllRows<{
        cash_paid_kurus: number;
        card_paid_kurus: number;
        bank_transfer_paid_kurus: number;
      }>(async (from, to) => {
        const res = await supabase
          .from('kasa_sales')
          .select('id, cash_paid_kurus, card_paid_kurus, bank_transfer_paid_kurus, status')
          .in('kasa_day_id', dayIds)
          .eq('status', 'completed')
          .order('id', { ascending: true })
          .range(from, to);

        if (res.error) {
          throw new Error(`Ay satışları sorgulanamadı: ${res.error.message}`);
        }
        return res;
      });

      sales.forEach((s) => {
        cashSalesMinor += Number(s.cash_paid_kurus || 0);
        cardSalesMinor += Number(s.card_paid_kurus || 0);
        bankTransferSalesMinor += Number(s.bank_transfer_paid_kurus || 0);
      });

      // 2. Aybaşından bugüne cari tahsilatlar (kasa gününe bağlı, tam sayfalanmış)
      const creditPayments = await fetchAllRows<{
        cash_paid_kurus: number;
        card_paid_kurus: number;
        bank_transfer_paid_kurus: number;
      }>(async (from, to) => {
        const res = await supabase
          .from('kasa_credit_payments')
          .select('id, cash_paid_kurus, card_paid_kurus, bank_transfer_paid_kurus')
          .in('kasa_day_id', dayIds)
          .order('id', { ascending: true })
          .range(from, to);

        if (res.error) {
          throw new Error(`Ay cari tahsilatları sorgulanamadı: ${res.error.message}`);
        }
        return res;
      });

      creditPayments.forEach((cp) => {
        creditCashMinor += Number(cp.cash_paid_kurus || 0);
        creditCardMinor += Number(cp.card_paid_kurus || 0);
        creditBankMinor += Number(cp.bank_transfer_paid_kurus || 0);
      });

      // 3. Aybaşından bugüne geçerli giderler (kasa gününe bağlı, status = active, tam sayfalanmış)
      const expenses = await fetchAllRows<{
        amount_kurus: number;
        payment_method: string;
      }>(async (from, to) => {
        const res = await supabase
          .from('kasa_expenses')
          .select('id, amount_kurus, payment_method, status')
          .in('kasa_day_id', dayIds)
          .eq('status', 'active')
          .order('id', { ascending: true })
          .range(from, to);

        if (res.error) {
          throw new Error(`Ay giderleri sorgulanamadı: ${res.error.message}`);
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

    const netCashMinor = cashSalesMinor + creditCashMinor;
    const netCardMinor = cardSalesMinor + creditCardMinor;
    const netBankTransferMinor = bankTransferSalesMinor + creditBankMinor;
    const netCreditMinor = creditCashMinor + creditCardMinor + creditBankMinor;
    const netCollectionsMinor = netCashMinor + netCardMinor + netBankTransferMinor;
    const netTotalExpensesMinor = cashExpensesMinor + bankExpensesMinor;

    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const periodLabel = `1–${dayNum} ${monthNames[monthIndex]} ${year}`;

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
    };

    return NextResponse.json({ collections });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Aylık tahsilat ve gider verisi alınamadı.' }, { status: 500 });
  }
}
