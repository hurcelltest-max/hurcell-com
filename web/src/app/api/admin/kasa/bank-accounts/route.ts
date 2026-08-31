import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'Banka hesapları yalnızca yöneticilere açıktır.' }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    const { data: accounts, error } = await supabase
      .from('kasa_bank_accounts')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Her hesap için bakiye hesapla
    const items = await Promise.all(
      (accounts || []).map(async (acc) => {
        const { data: balanceData } = await supabase.rpc('fn_kasa_get_bank_account_balance', { p_account_id: acc.id });
        const balanceMinor = Number(balanceData || 0);
        const formattedBalance = `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(balanceMinor / 100)} ${acc.currency_code}`;
        return {
          ...acc,
          balance_minor: balanceMinor,
          formatted_balance: formattedBalance,
        };
      })
    );

    return NextResponse.json({ items });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN') || error.message?.includes('YETKİSİZ')) {
      return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'Banka hesapları alınamadı.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'Banka hesabı oluşturma yalnızca yöneticilere açıktır.' }, { status: 403 });
    }

    const body = await req.json();
    const { account_name, bank_name, currency_code, iban_masked, balance_start_date, opening_balance_minor } = body;

    if (!account_name || !String(account_name).trim()) {
      return NextResponse.json({ error: 'Banka hesap adı zorunludur.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('fn_kasa_create_bank_account', {
      p_actor_user_id: auth.user.id,
      p_account_name: String(account_name).trim(),
      p_bank_name: bank_name ? String(bank_name).trim() : null,
      p_iban_masked: iban_masked ? String(iban_masked).trim() : null,
      p_balance_start_date: balance_start_date || new Date().toISOString().split('T')[0],
      p_opening_balance_kurus: Number(opening_balance_minor || 0),
    });

    if (error) throw new Error(error.message || 'Banka hesabı oluşturulamadı.');

    return NextResponse.json({ success: true, account: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Banka hesabı oluşturulamadı.' }, { status: 400 });
  }
}
