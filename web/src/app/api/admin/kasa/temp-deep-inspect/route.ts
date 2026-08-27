import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  getDailyCategorySummary,
  getDashboardMetrics,
  getDashboardCarryoverInfo,
} from '@/lib/kasa/service';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    // 1. Kasa Günleri
    const { data: days, error: daysError } = await supabase
      .from('kasa_days')
      .select('id, date_val, status, opening_balance_kurus, expected_cash_kurus, counted_cash_kurus, opened_by_user_id, closed_at')
      .order('date_val', { ascending: true });

    const openDays = (days || []).filter((d) => d.status === 'open');
    const firstUnclosedDay = openDays.length > 0 ? openDays[0] : null;
    const lastOpenDay = openDays.length > 0 ? openDays[openDays.length - 1] : null;

    // 2. Kasa Satışları (Kategori Adıyla Birlikte)
    const { data: salesRaw, error: salesError } = await supabase
      .from('kasa_sales')
      .select(`
        id, receipt_no, product_name, quantity, total_price_kurus,
        cost_price_kurus, service_cost_kurus, service_cost_payment_status,
        status, created_at, category:kasa_categories(name)
      `)
      .order('created_at', { ascending: true });

    const salesFacts = (salesRaw || []).map((s: any) => {
      const catObj = Array.isArray(s.category) ? s.category[0] : s.category;
      return {
        id: s.id,
        receipt_no: s.receipt_no,
        category_name: catObj?.name || 'Bilinmeyen',
        product_name: s.product_name,
        quantity: s.quantity,
        total_price_tl: (s.total_price_kurus / 100).toFixed(2),
        cost_price_tl: s.cost_price_kurus != null ? (s.cost_price_kurus / 100).toFixed(2) : null,
        service_cost_tl: s.service_cost_kurus != null ? (s.service_cost_kurus / 100).toFixed(2) : null,
        service_cost_payment_status: s.service_cost_payment_status,
        status: s.status,
        created_at: s.created_at,
      };
    });

    // 3. Kategori Bazlı Eksik Maliyet Hesabı
    let tsMissingCostCount = 0;
    let nonTsMissingCostCount = 0;
    const missingCostBreakdown: any[] = [];

    for (const s of salesFacts) {
      if (s.status !== 'completed') continue;
      if (s.category_name === 'Teknik Servis') {
        const st = s.service_cost_payment_status;
        if (st === 'legacy_unspecified' || !st) {
          tsMissingCostCount++;
          missingCostBreakdown.push({
            receipt_no: s.receipt_no,
            category: s.category_name,
            product_name: s.product_name,
            reason: 'Teknik Servis maliyet ödeme durumu legacy_unspecified',
          });
        }
      } else {
        if (s.cost_price_tl == null || Number(s.cost_price_tl) === 0) {
          nonTsMissingCostCount++;
          missingCostBreakdown.push({
            receipt_no: s.receipt_no,
            category: s.category_name,
            product_name: s.product_name,
            reason: 'Ürün alış maliyeti cost_price_kurus 0 veya NULL',
          });
        }
      }
    }

    // 4. Metrikler & Carryover (Eğer açık gün varsa)
    let targetMetrics: any = null;
    let targetCarryover: any = null;
    let categorySummary: any = null;

    if (lastOpenDay) {
      categorySummary = await getDailyCategorySummary(lastOpenDay.id);
      targetMetrics = await getDashboardMetrics(lastOpenDay.id, 'yonetici');
      targetCarryover = await getDashboardCarryoverInfo(lastOpenDay as any);
    }

    return NextResponse.json({
      days,
      openDays,
      firstUnclosedDay,
      lastOpenDay,
      daysError: daysError?.message,
      salesFacts,
      missingCostSummary: {
        tsMissingCostCount,
        nonTsMissingCostCount,
        totalMissingCostCount: tsMissingCostCount + nonTsMissingCostCount,
        missingCostBreakdown,
      },
      salesError: salesError?.message,
      targetMetrics,
      targetCarryover,
      categorySummary,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
