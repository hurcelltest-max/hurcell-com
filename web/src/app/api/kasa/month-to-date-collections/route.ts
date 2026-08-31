import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const auth = await requireKasaAuth();
    const supabase = getSupabaseAdmin();

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    const startDateStr = `${year}-${month}-01`;
    const endDateStr = `${year}-${month}-${day}`;
    const startISO = `${startDateStr}T00:00:00.000Z`;
    const endISO = `${endDateStr}T23:59:59.999Z`;

    // 1. Aybaşından bugüne tamamlanan satışlar
    const { data: sales } = await supabase
      .from('kasa_sales')
      .select('cash_paid_kurus, card_paid_kurus, bank_transfer_paid_kurus, status')
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .eq('status', 'completed');

    let cashSalesMinor = 0;
    let cardSalesMinor = 0;
    let bankTransferSalesMinor = 0;

    (sales || []).forEach((s) => {
      cashSalesMinor += Number(s.cash_paid_kurus || 0);
      cardSalesMinor += Number(s.card_paid_kurus || 0);
      bankTransferSalesMinor += Number(s.bank_transfer_paid_kurus || 0);
    });

    // 2. Aybaşından bugüne cari tahsilatlar
    const { data: creditPayments } = await supabase
      .from('kasa_credit_payments')
      .select('cash_paid_kurus, card_paid_kurus, bank_transfer_paid_kurus')
      .gte('created_at', startISO)
      .lte('created_at', endISO);

    let creditCashMinor = 0;
    let creditCardMinor = 0;
    let creditBankMinor = 0;

    (creditPayments || []).forEach((cp) => {
      creditCashMinor += Number(cp.cash_paid_kurus || 0);
      creditCardMinor += Number(cp.card_paid_kurus || 0);
      creditBankMinor += Number(cp.bank_transfer_paid_kurus || 0);
    });

    const netCashMinor = cashSalesMinor + creditCashMinor;
    const netCardMinor = cardSalesMinor + creditCardMinor;
    const netBankTransferMinor = bankTransferSalesMinor + creditBankMinor;
    const netCreditMinor = creditCashMinor + creditCardMinor + creditBankMinor;
    const netCollectionsMinor = netCashMinor + netCardMinor + netBankTransferMinor;

    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const periodLabel = `1–${today.getDate()} ${monthNames[today.getMonth()]} ${year}`;

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
    };

    return NextResponse.json({ collections });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Aylık tahsilat verisi alınamadı.' }, { status: 500 });
  }
}
