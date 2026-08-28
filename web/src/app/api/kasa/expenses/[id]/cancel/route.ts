import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { cancelExpenseTransaction } from '@/lib/kasa/service';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireKasaAuth();
    const { id: expenseId } = await params;
    const body = await req.json();

    const { justification } = body;

    if (!justification || !String(justification).trim()) {
      return NextResponse.json(
        { error: 'Gider iptali için gerekçe belirtilmesi zorunludur.' },
        { status: 400 }
      );
    }

    const cancelledExpense = await cancelExpenseTransaction(
      auth.user.id,
      expenseId,
      String(justification).trim()
    );

    return NextResponse.json({ success: true, expense: cancelledExpense });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Gider iptal edilemedi.' }, { status: 400 });
  }
}
