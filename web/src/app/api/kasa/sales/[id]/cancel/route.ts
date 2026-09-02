import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { cancelSaleTransaction, hasUserPermission } from '@/lib/kasa/service';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireKasaAuth();
    const { id: saleId } = await params;
    const body = await req.json();
    const { justification, cost_refunded, idempotency_key } = body;

    const trimmedJustification = String(justification || '').trim();
    if (!trimmedJustification || trimmedJustification.length < 3) {
      return NextResponse.json(
        { error: 'Satış iptali için en az 3 karakter gerekçe belirtilmesi zorunludur.' },
        { status: 400 }
      );
    }

    // Yetki kontrolü: Yönetici VEYA 'kasa.sale.cancel' iznine sahip personel
    const isManager = auth.user.role === 'yonetici';
    const hasCancelPerm = isManager ? true : await hasUserPermission(auth.user.id, 'kasa.sale.cancel');

    if (!isManager && !hasCancelPerm) {
      return NextResponse.json(
        { error: 'Satış iptal yetkisi bulunmamaktadır. Yalnızca yöneticiler veya yetkilendirilmiş personel satış iptali yapabilir.' },
        { status: 403 }
      );
    }

    const cancelledSale = await cancelSaleTransaction(
      auth.user.id,
      saleId,
      trimmedJustification,
      idempotency_key
    );

    return NextResponse.json({ success: true, sale: cancelledSale });
  } catch (error: any) {
    console.error('[Kasa Cancel Sale Error]:', error);
    const msg = String(error?.message || '');
    if (msg.includes('YETKİSİZ') || msg.includes('FORBIDDEN')) {
      return NextResponse.json({ error: 'Satış iptal yetkisi bulunmamaktadır.' }, { status: 403 });
    }
    if (msg.includes('GEREKÇE_ZORUNLU')) {
      return NextResponse.json({ error: 'Satış iptali için geçerli bir gerekçe belirtilmelidir.' }, { status: 400 });
    }
    if (msg.includes('GEÇERSİZ_SATIŞ')) {
      return NextResponse.json({ error: 'İptal edilecek tamamlanmış satış bulunamadı veya satış zaten iptal edilmiş.' }, { status: 400 });
    }
    if (msg.includes('KASA_GÜNÜ_KAPALI') || msg.includes('PREVIOUS_DAY_UNCLOSED') || msg.includes('GÜN_KİLİTLİ')) {
      return NextResponse.json({ error: 'Kasa günü kapalı veya kilitli olduğundan satış iptal edilemez.' }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Satış iptali tamamlanamadı. Herhangi bir kayıt değiştirilmedi.' },
      { status: 400 }
    );
  }
}
