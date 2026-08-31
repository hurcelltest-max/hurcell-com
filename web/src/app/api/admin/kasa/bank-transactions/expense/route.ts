import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'Banka gideri oluşturma yalnızca yöneticilere açıktır.' }, { status: 403 });
    }

    const body = await req.json();
    const { bank_account_id, expense_category_id, amount_minor, description, recipient_name, transaction_date, reference_no } = body;

    if (!bank_account_id || !expense_category_id || !amount_minor || Number(amount_minor) <= 0 || !description) {
      return NextResponse.json({ error: 'Banka hesabı, gider kategorisi, tutar ve açıklama zorunludur.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('fn_kasa_create_bank_expense', {
      p_actor_user_id: auth.user.id,
      p_bank_account_id: bank_account_id,
      p_expense_category_id: expense_category_id,
      p_amount_kurus: Number(amount_minor),
      p_description: String(description).trim(),
      p_recipient_name: recipient_name ? String(recipient_name).trim() : null,
      p_transaction_date: transaction_date || new Date().toISOString().split('T')[0],
      p_reference_no: reference_no ? String(reference_no).trim() : null,
    });

    if (error) throw new Error(error.message || 'Banka gideri kaydedilemedi.');

    return NextResponse.json({ success: true, bank_expense: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Banka gideri kaydedilemedi.' }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'Banka gideri düzeltme yalnızca yöneticilere açıktır.' }, { status: 403 });
    }

    const body = await req.json();
    const {
      expense_id,
      new_bank_account_id,
      new_expense_category_id,
      new_amount_minor,
      new_transaction_date,
      new_description,
      new_recipient_name,
      new_reference_no,
      justification,
    } = body;

    if (!expense_id || !new_bank_account_id || !new_expense_category_id || !new_amount_minor || !new_description || !justification) {
      return NextResponse.json({ error: 'Lütfen tüm zorunlu alanları ve düzeltme gerekçesini doldurunuz.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('fn_kasa_update_bank_expense', {
      p_actor_user_id: auth.user.id,
      p_expense_id: expense_id,
      p_new_bank_account_id: new_bank_account_id,
      p_new_expense_category_id: new_expense_category_id,
      p_new_amount_kurus: Number(new_amount_minor),
      p_new_transaction_date: new_transaction_date || new Date().toISOString().split('T')[0],
      p_new_description: String(new_description).trim(),
      p_new_recipient_name: new_recipient_name ? String(new_recipient_name).trim() : null,
      p_new_reference_no: new_reference_no ? String(new_reference_no).trim() : null,
      p_justification: String(justification).trim(),
    });

    if (error) throw new Error(error.message || 'Banka gideri düzeltilemedi.');

    return NextResponse.json({ success: true, result: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Banka gideri düzeltilemedi.' }, { status: 400 });
  }
}
