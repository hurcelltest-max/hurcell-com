import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

function maskIban(iban?: string | null): string | null {
  if (!iban) return null;
  const clean = iban.replace(/\s+/g, '').toUpperCase();
  if (clean.length < 8) return clean;
  const start = clean.slice(0, 4);
  const end = clean.slice(-4);
  return `${start} •••• •••• •••• ${end}`;
}

function maskAccountNo(accountNo?: string | null): string | null {
  if (!accountNo) return null;
  const clean = accountNo.trim();
  if (clean.length <= 4) return clean;
  return `••••${clean.slice(-4)}`;
}

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
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message || 'Banka hesapları alınamadı.');

    const items = (accounts || []).map((acc: any) => {
      const balanceKurus = Number(acc.current_balance_kurus ?? acc.opening_balance_kurus ?? 0);
      const formattedBalance = `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(balanceKurus / 100)} ${acc.currency_code || 'TRY'}`;
      return {
        ...acc,
        current_balance_kurus: balanceKurus,
        formatted_balance: formattedBalance,
        iban_masked: maskIban(acc.iban),
        account_no_masked: maskAccountNo(acc.account_no),
      };
    });

    return NextResponse.json({ items });
  } catch (error: any) {
    const status = error.message?.includes('YETKİSİZ') || error.message?.includes('yöneticilere') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Banka hesapları alınamadı.' }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'Banka hesabı oluşturma yalnızca yöneticilere açıktır.' }, { status: 403 });
    }

    const body = await req.json();
    const {
      account_name,
      bank_name,
      currency_code = 'TRY',
      iban,
      account_no,
      opening_balance_tl = 0,
      opening_balance_kurus: explicitKurus,
      is_active = true,
      notes,
    } = body;

    if (!account_name || !String(account_name).trim()) {
      return NextResponse.json({ error: 'Banka hesap adı (görünen ad) zorunludur.' }, { status: 400 });
    }
    if (!bank_name || !String(bank_name).trim()) {
      return NextResponse.json({ error: 'Banka adı zorunludur.' }, { status: 400 });
    }

    const validCurrencies = ['TRY', 'USD', 'EUR'];
    const finalCurrency = String(currency_code).trim().toUpperCase();
    if (!validCurrencies.includes(finalCurrency)) {
      return NextResponse.json({ error: 'Geçersiz para birimi. (Seçenekler: TRY, USD, EUR)' }, { status: 400 });
    }

    let finalOpeningKurus = 0;
    if (explicitKurus !== undefined && explicitKurus !== null) {
      finalOpeningKurus = Math.round(Number(explicitKurus));
    } else {
      finalOpeningKurus = Math.round(Number(opening_balance_tl || 0) * 100);
    }

    if (isNaN(finalOpeningKurus) || finalOpeningKurus < 0) {
      return NextResponse.json({ error: 'Açılış bakiyesi negatif olamaz.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Check duplicate active account name
    const { data: existing } = await supabase
      .from('kasa_bank_accounts')
      .select('id')
      .eq('account_name', String(account_name).trim())
      .eq('bank_name', String(bank_name).trim())
      .eq('is_active', true)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Aynı banka ve hesap adına sahip aktif bir hesap zaten mevcut.' }, { status: 400 });
    }

    const { data: newAccount, error: insertError } = await supabase
      .from('kasa_bank_accounts')
      .insert({
        account_name: String(account_name).trim(),
        bank_name: String(bank_name).trim(),
        currency_code: finalCurrency,
        iban: iban ? String(iban).trim() : null,
        account_no: account_no ? String(account_no).trim() : null,
        opening_balance_kurus: finalOpeningKurus,
        current_balance_kurus: finalOpeningKurus,
        is_active: Boolean(is_active),
        notes: notes ? String(notes).trim() : null,
      })
      .select()
      .single();

    if (insertError || !newAccount) {
      throw new Error(insertError?.message || 'Banka hesabı kaydedilemedi.');
    }

    return NextResponse.json({ success: true, account: newAccount });
  } catch (error: any) {
    const status = error.message?.includes('yöneticilere') ? 403 : 400;
    return NextResponse.json({ error: error.message || 'Banka hesabı oluşturulamadı.' }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'Banka hesabı düzenleme yalnızca yöneticilere açıktır.' }, { status: 403 });
    }

    const body = await req.json();
    const { id, account_name, bank_name, currency_code, iban, account_no, is_active, notes } = body;

    if (!id) {
      return NextResponse.json({ error: 'Hesap ID belirtilmelidir.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const updatePayload: any = { updated_at: new Date().toISOString() };

    if (account_name !== undefined) updatePayload.account_name = String(account_name).trim();
    if (bank_name !== undefined) updatePayload.bank_name = String(bank_name).trim();
    if (currency_code !== undefined) updatePayload.currency_code = String(currency_code).trim().toUpperCase();
    if (iban !== undefined) updatePayload.iban = iban ? String(iban).trim() : null;
    if (account_no !== undefined) updatePayload.account_no = account_no ? String(account_no).trim() : null;
    if (is_active !== undefined) updatePayload.is_active = Boolean(is_active);
    if (notes !== undefined) updatePayload.notes = notes ? String(notes).trim() : null;

    const { data: updated, error } = await supabase
      .from('kasa_bank_accounts')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error || !updated) {
      throw new Error(error?.message || 'Hesap güncellenemedi.');
    }

    return NextResponse.json({ success: true, account: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Banka hesabı güncellenemedi.' }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'Banka hesabı silme/pasife alma yalnızca yöneticilere açıktır.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Hesap ID belirtilmelidir.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Check if transactions exist
    const { count: txCount } = await supabase
      .from('kasa_bank_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('bank_account_id', id);

    if (txCount && txCount > 0) {
      // Soft-delete / deactivate
      await supabase
        .from('kasa_bank_accounts')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      return NextResponse.json({
        success: true,
        deactivated: true,
        message: 'Bu hesaba bağlı banka hareketleri bulunduğu için hesap fiziksel olarak silinmedi, güvenli şekilde pasife alındı.',
      });
    }

    // No transactions -> safe physical delete
    const { error: delError } = await supabase
      .from('kasa_bank_accounts')
      .delete()
      .eq('id', id);

    if (delError) throw new Error(delError.message);

    return NextResponse.json({ success: true, deleted: true, message: 'Banka hesabı başarıyla silindi.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Banka hesabı silinemedi.' }, { status: 400 });
  }
}
