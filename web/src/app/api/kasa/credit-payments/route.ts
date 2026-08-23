import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { collectCreditPaymentTransaction, getOrCreateTodayDay } from '@/lib/kasa/service';

function sanitizeReference(ref: unknown): string | undefined {
  if (!ref) return undefined;
  let str = String(ref).trim().slice(0, 200);
  if (str.length === 0) return undefined;
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return str;
}

export async function POST(req: Request) {
  try {
    const auth = await requireKasaAuth();
    const body = await req.json();

    const {
      credit_customer_id,
      amount_tl,
      payment_method,
      bank_transfer_reference,
      usd_paid,
      usd_rate,
      eur_paid,
      eur_rate,
      description,
      idempotency_key,
    } = body;

    if (!credit_customer_id) {
      return NextResponse.json({ error: 'Cari müşteri seçimi zorunludur.' }, { status: 400 });
    }
    if (!amount_tl || Number(amount_tl) <= 0) {
      return NextResponse.json({ error: 'Geçerli bir tahsilat tutarı giriniz.' }, { status: 400 });
    }
    if (!payment_method || !['cash', 'card', 'bank_transfer', 'usd', 'eur'].includes(payment_method)) {
      return NextResponse.json({ error: 'Geçersiz ödeme yöntemi.' }, { status: 400 });
    }

    const todayDay = await getOrCreateTodayDay(auth.user.id);

    const payment = await collectCreditPaymentTransaction(auth.user.id, {
      day_id: todayDay.id,
      credit_customer_id,
      amount_tl: Number(amount_tl),
      payment_method,
      bank_transfer_reference: sanitizeReference(bank_transfer_reference),
      usd_paid: usd_paid ? Number(usd_paid) : undefined,
      usd_rate: usd_rate ? Number(usd_rate) : undefined,
      eur_paid: eur_paid ? Number(eur_paid) : undefined,
      eur_rate: eur_rate ? Number(eur_rate) : undefined,
      description: description ? String(description).trim() : undefined,
      idempotency_key: idempotency_key ? String(idempotency_key) : undefined,
    });

    return NextResponse.json({ success: true, payment });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Tahsilat kaydı oluşturulamadı.' }, { status: 400 });
  }
}
