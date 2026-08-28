import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { calculatePhysicalCashForDay } from '@/lib/kasa/service';

export async function GET() {
  try {
    const auth = await requireKasaAuth();
    const supabase = getSupabaseAdmin();

    const { data: days, error } = await supabase
      .from('kasa_days')
      .select('*')
      .order('date_val', { ascending: false });

    if (error) {
      return NextResponse.json({ error: `Veritabanı hatası: ${error.message}` }, { status: 500 });
    }

    if (!days) {
      return NextResponse.json({ items: [], days: [] });
    }

    const sortedAsc = [...days].sort((a, b) => a.date_val.localeCompare(b.date_val));

    const items = await Promise.all(
      days.map(async (day) => {
        const physicalCashKurus = await calculatePhysicalCashForDay(day.id);

        let can_close = false;
        let close_block_reason: string | null = null;

        if (day.status === 'closed') {
          can_close = false;
          close_block_reason = 'Bu kasa günü zaten kapatılmış.';
        } else {
          const olderOpenDay = sortedAsc.find(
            (d) => d.status === 'open' && d.date_val < day.date_val && d.id !== day.id
          );

          if (olderOpenDay) {
            can_close = false;
            close_block_reason = `Daha eski açık kasa günü (${olderOpenDay.date_val}) kapatılmadan bu gün kapatılamaz.`;
          } else {
            can_close = auth.user.role === 'yonetici';
            close_block_reason = auth.user.role === 'yonetici' ? null : 'Gün kapatma yetkisi yöneticilere aittir.';
          }
        }

        return {
          id: day.id,
          date_val: day.date_val,
          status: day.status,
          opening_balance_kurus: Number(day.opening_balance_kurus || 0),
          calculated_physical_cash_kurus: physicalCashKurus,
          expected_cash_kurus: Number(day.expected_cash_kurus || physicalCashKurus),
          counted_cash_kurus: day.counted_cash_kurus !== null && day.counted_cash_kurus !== undefined ? Number(day.counted_cash_kurus) : null,
          cash_difference_kurus: day.cash_difference_kurus !== null && day.cash_difference_kurus !== undefined ? Number(day.cash_difference_kurus) : null,
          opened_at: day.opened_at,
          closed_at: day.closed_at,
          can_close,
          close_block_reason,
        };
      })
    );

    return NextResponse.json({ items, days: items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Kasa günleri alınamadı.' }, { status: 401 });
  }
}
