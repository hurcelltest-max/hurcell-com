import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { updateExpenseTransaction } from '@/lib/kasa/service';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireKasaAuth();
    const { id: expenseId } = await params;
    const body = await req.json();

    const {
      expense_category_id,
      amount_kurus,
      description,
      recipient_name,
      justification,
      payment_method,
      bank_account_id,
    } = body;

    if (!justification || !String(justification).trim()) {
      return NextResponse.json(
        { error: 'Gider düzeltmesi için gerekçe belirtilmesi zorunludur.' },
        { status: 400 }
      );
    }

    if (!expense_category_id || !Number.isSafeInteger(amount_kurus) || amount_kurus <= 0 || !description || !String(description).trim()) {
      return NextResponse.json(
        { error: 'Geçerli bir kategori, tutar ve açıklama girilmesi zorunludur.' },
        { status: 400 }
      );
    }

    const amountKurus = Number(amount_kurus);
    if (payment_method !== 'cash' && payment_method !== 'bank') {
      return NextResponse.json({ error: 'Ödeme yöntemi zorunludur.' }, { status: 400 });
    }
    if (payment_method === 'bank' && auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'Banka gideri yalnız yöneticiler tarafından düzenlenebilir.' }, { status: 403 });
    }

    const updatedExpense = await updateExpenseTransaction(
      auth.user.id,
      expenseId,
      expense_category_id,
      amountKurus,
      String(description).trim(),
      recipient_name ? String(recipient_name).trim() : undefined,
      String(justification).trim(),
      payment_method,
      bank_account_id ? String(bank_account_id) : undefined
    );

    return NextResponse.json({ success: true, expense: updatedExpense });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Gider düzeltilemedi.' }, { status: 400 });
  }
}
