import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json(
        { error: 'BANKA_ÖDEMESİ_YETKİSİZ: Banka hesap seçenekleri yalnızca yöneticilere açıktır.' },
        { status: 403 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: accounts, error } = await supabase
      .from('kasa_bank_accounts')
      .select('id, account_name, bank_name, currency_code, status, is_active')
      .order('account_name', { ascending: true });

    if (error) {
      throw new Error(error.message || 'Banka hesapları yüklenemedi.');
    }

    const activeAccounts = (accounts || []).filter(
      (a: any) => a.is_active === true || a.status === 'active'
    );

    const items = activeAccounts.map((a: any) => ({
      id: a.id,
      display_name: `${a.bank_name || 'Banka'} - ${a.account_name} (${a.currency_code || 'TRY'})`,
    }));

    return NextResponse.json({ items });
  } catch (error: any) {
    const status = error.message?.includes('BANKA_ÖDEMESİ_YETKİSİZ') ? 403 : 400;
    return NextResponse.json({ error: error.message || 'Banka seçenekleri alınamadı.' }, { status });
  }
}
