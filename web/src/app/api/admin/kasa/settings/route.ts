import { NextResponse } from 'next/server';
import { requireKasaAuth, requireManagerAuth } from '@/lib/kasa/auth';
import { getKasaSettings, updateTargetReserve } from '@/lib/kasa/service';

export async function GET() {
  try {
    await requireKasaAuth();
    const settings = await getKasaSettings();
    return NextResponse.json({ settings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireManagerAuth();
    const body = await req.json();
    const { target_reserve_tl } = body;

    if (target_reserve_tl === undefined || Number(target_reserve_tl) < 0) {
      return NextResponse.json({ error: 'Hedef kasa bakiyesi 0 veya daha büyük olmalıdır.' }, { status: 400 });
    }

    const targetKurus = Math.round(Number(target_reserve_tl) * 100);
    const updatedSettings = await updateTargetReserve(auth.user.id, targetKurus);

    return NextResponse.json({ success: true, settings: updatedSettings });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN')) {
      return NextResponse.json(
        { error: 'Hedef kasa bakiyesini yalnızca yönetici değiştirebilir.' },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: error.message || 'Hedef kasa bakiyesi güncellenemedi.' }, { status: 400 });
  }
}
