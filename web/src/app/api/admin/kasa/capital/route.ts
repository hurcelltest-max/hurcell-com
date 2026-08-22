import { NextResponse } from 'next/server';
import { requireManagerAuth } from '@/lib/kasa/auth';
import {
  getOrCreateTodayDay,
  injectCapitalTransaction,
  withdrawOwnerTransaction,
} from '@/lib/kasa/service';

export async function POST(req: Request) {
  try {
    const auth = await requireManagerAuth();
    const body = await req.json();
    const { action_type, amount_tl, description, justification } = body;

    if (!action_type || !amount_tl) {
      return NextResponse.json({ error: 'İşlem türü ve tutar zorunludur.' }, { status: 400 });
    }

    const amountKurus = Math.round(Number(amount_tl) * 100);
    if (amountKurus <= 0) {
      return NextResponse.json({ error: 'Tutar 0 veya negatif olamaz.' }, { status: 400 });
    }

    const todayDay = await getOrCreateTodayDay(auth.user.id);

    if (action_type === 'capital_injection') {
      const updatedDay = await injectCapitalTransaction(
        auth.user.id,
        todayDay.id,
        amountKurus,
        description ? String(description).trim() : 'Sermaye Girişi'
      );
      return NextResponse.json({ success: true, day: updatedDay });
    }

    if (action_type === 'owner_withdrawal') {
      if (!justification || !String(justification).trim()) {
        return NextResponse.json(
          { error: 'İşletme sahibi çekimi için açıklama/gerekçe zorunludur.' },
          { status: 400 }
        );
      }
      const updatedDay = await withdrawOwnerTransaction(
        auth.user.id,
        todayDay.id,
        amountKurus,
        String(justification).trim()
      );
      return NextResponse.json({ success: true, day: updatedDay });
    }

    return NextResponse.json({ error: 'Geçersiz işlem türü.' }, { status: 400 });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN')) {
      return NextResponse.json({ error: 'Bu işlem yalnızca yöneticilere aittir.' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'İşlem başarısız.' }, { status: 400 });
  }
}
