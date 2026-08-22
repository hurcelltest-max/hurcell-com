import { NextResponse } from 'next/server';
import { requireManagerAuth } from '@/lib/kasa/auth';
import { cancelSaleTransaction } from '@/lib/kasa/service';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireManagerAuth();
    const { id: saleId } = await params;
    const body = await req.json();
    const { justification } = body;

    if (!justification || !String(justification).trim()) {
      return NextResponse.json(
        { error: 'Satış iptali için gerekçe belirtilmesi zorunludur.' },
        { status: 400 }
      );
    }

    const cancelledSale = await cancelSaleTransaction(
      auth.user.id,
      saleId,
      String(justification).trim()
    );

    return NextResponse.json({ success: true, sale: cancelledSale });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN')) {
      return NextResponse.json({ error: 'Satış iptal yetkisi yalnızca yöneticilere aittir.' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'İptal işlemi başarısız.' }, { status: 400 });
  }
}
