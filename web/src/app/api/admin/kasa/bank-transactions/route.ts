import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'Banka hareketleri yalnızca yöneticilere açıktır.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const bankAccountId = searchParams.get('bank_account_id');

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('kasa_bank_transactions')
      .select(`
        *,
        account:kasa_bank_accounts(account_name, currency_code),
        created_by_user:kasa_users!kasa_bank_transactions_created_by_user_id_fkey(full_name)
      `)
      .order('created_at', { ascending: false });

    if (bankAccountId) {
      query = query.eq('bank_account_id', bankAccountId);
    }

    const { data: transactions, error } = await query;
    if (error) throw error;

    const items = (transactions || []).map((t) => {
      const currency = t.account?.currency_code || 'TRY';
      const amountKurus = Number(t.amount_kurus ?? t.amount_minor ?? 0);
      const formattedAmount = `${t.direction === 'in' ? '+' : '-'}${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(amountKurus / 100)} ${currency}`;
      return {
        ...t,
        account_name: t.account?.account_name,
        currency_code: currency,
        created_by_name: t.created_by_user?.full_name || 'Sistem',
        formatted_amount: formattedAmount,
      };
    });

    return NextResponse.json({ items });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN') || error.message?.includes('YETKİSİZ')) {
      return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'Banka hareketleri alınamadı.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'Banka işlemi gerçekleştirme yalnızca yöneticilere açıktır.' }, { status: 403 });
    }

    const body = await req.json();
    const {
      bank_account_id,
      transaction_type,
      amount_minor,
      transaction_date,
      category,
      description,
      recipient_name,
      reference_no,
      is_operating_expense,
      related_sale_id,
      related_expense_id,
      idempotency_key,
    } = body;

    if (!bank_account_id || !transaction_type || !amount_minor || Number(amount_minor) <= 0) {
      return NextResponse.json({ error: 'Lütfen zorunlu alanları (hesap, işlem türü, pozitif tutar) doldurunuz.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('fn_kasa_create_bank_transaction', {
      p_actor_user_id: auth.user.id,
      p_bank_account_id: bank_account_id,
      p_transaction_type: transaction_type,
      p_amount_kurus: Number(amount_minor),
      p_transaction_date: transaction_date || new Date().toISOString().split('T')[0],
      p_category: category ? String(category).trim() : null,
      p_description: description ? String(description).trim() : null,
      p_recipient_name: recipient_name ? String(recipient_name).trim() : null,
      p_reference_no: reference_no ? String(reference_no).trim() : null,
      p_is_operating_expense: Boolean(is_operating_expense),
      p_idempotency_key: idempotency_key || null,
    });

    if (error) throw new Error(error.message || 'Banka işlemi oluşturulamadı.');

    return NextResponse.json({ success: true, transaction: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Banka işlemi oluşturulamadı.' }, { status: 400 });
  }
}
