import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { createExpense, getOrCreateTodayDay, updateExpenseTransaction } from '@/lib/kasa/service';

export async function POST(req: Request) {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'Banka gideri oluşturma yalnızca yöneticilere açıktır.' }, { status: 403 });
    }

    const body = await req.json();
    const { bank_account_id, expense_category_id, amount_minor, description, recipient_name, idempotency_key } = body;

    if (!bank_account_id || !expense_category_id || !amount_minor || Number(amount_minor) <= 0 || !description) {
      return NextResponse.json({ error: 'Banka hesabı, gider kategorisi, tutar ve açıklama zorunludur.' }, { status: 400 });
    }

    if (!Number.isSafeInteger(Number(amount_minor)) || !idempotency_key) {
      return NextResponse.json({ error: 'Tutar tam sayı kuruş ve idempotency anahtarı zorunludur.' }, { status: 400 });
    }
    const day = await getOrCreateTodayDay(auth.user.id);
    const data = await createExpense(auth.user.id, day.id, expense_category_id, Number(amount_minor), String(description).trim(),
      recipient_name ? String(recipient_name).trim() : undefined, undefined, 'bank', bank_account_id, String(idempotency_key));

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

    const data = await updateExpenseTransaction(auth.user.id, expense_id, new_expense_category_id, Number(new_amount_minor),
      String(new_description).trim(), new_recipient_name ? String(new_recipient_name).trim() : undefined,
      String(justification).trim(), 'bank', new_bank_account_id);

    return NextResponse.json({ success: true, result: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Banka gideri düzeltilemedi.' }, { status: 400 });
  }
}
