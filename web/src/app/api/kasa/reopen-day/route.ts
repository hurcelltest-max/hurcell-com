import { NextResponse } from 'next/server';
import { requireManagerAuth } from '@/lib/kasa/auth';
import { reopenDayTransaction } from '@/lib/kasa/service';

export async function POST(req: Request) {
  try {
    const auth = await requireManagerAuth();
    const body = await req.json();

    const { kasa_day_id, justification } = body;

    if (!kasa_day_id) {
      return NextResponse.json(
        { error: 'Geçerli bir kasa günü kimliği (kasa_day_id) belirtilmelidir.' },
        { status: 400 }
      );
    }

    if (!justification || typeof justification !== 'string' || justification.trim().length < 10) {
      return NextResponse.json(
        { error: 'Yeniden açma gerekçesi zorunludur ve en az 10 anlamlı karakter içermelidir.' },
        { status: 400 }
      );
    }

    const reopenedDay = await reopenDayTransaction(
      auth.user.id,
      kasa_day_id,
      justification.trim()
    );

    return NextResponse.json({ success: true, day: reopenedDay });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN') || error.message?.includes('YETKİSİZ')) {
      return NextResponse.json(
        { error: error.message || 'Kapalı günü yeniden açma yetkisi yalnızca yöneticilere aittir.' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Gün yeniden açılamadı.' },
      { status: 400 }
    );
  }
}
