import { NextRequest, NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { repairDayCarryover } from '@/lib/kasa/service';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'YETKİSİZ: Devir onarımı yalnızca yöneticilere aittir.' }, { status: 403 });
    }

    const body = await request.json();
    const { target_day_id, source_day_id, justification } = body;

    if (!target_day_id || !source_day_id || !justification) {
      return NextResponse.json({ error: 'Eksik parametre. Target day, source day ve gerekçe zorunludur.' }, { status: 400 });
    }

    const updatedDay = await repairDayCarryover(
      auth.user.id,
      target_day_id,
      source_day_id,
      justification
    );

    return NextResponse.json({ success: true, day: updatedDay });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Devir onarımı sırasında hata oluştu.' }, { status: 500 });
  }
}
