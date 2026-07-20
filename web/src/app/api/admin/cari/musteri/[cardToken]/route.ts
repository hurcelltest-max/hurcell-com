import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: Request, context: { params: Promise<{ cardToken: string }> }) {
  try {
    const { cardToken: token } = await context.params;

    if (!token) {
      return NextResponse.json({ error: 'Token eksik' }, { status: 400 });
    }

    const { data: customer, error: custError } = await getSupabaseAdmin().from('credit_customers')
      .select(`
        id, customer_card_code, card_token, full_name, phone, address, city, district, status,
        credit_accounts ( id, credit_limit, current_balance, statement_day, status ),
        credit_agreement_acceptances ( id, accepted_at ),
        credit_audit_logs ( id, admin_username, action_type, old_value, new_value, reason, created_at )
      `)
      .eq('card_token', token)
      .maybeSingle();

    if (custError || !customer) {
      return NextResponse.json({ error: 'Müşteri bulunamadı.' }, { status: 404 });
    }

    interface CreditAccountWithLimit {
      id: string;
      credit_limit: number;
      current_balance: number;
      statement_day: number;
      status: string;
      available_limit?: number;
    }
    const account = customer.credit_accounts?.[0] as unknown as CreditAccountWithLimit;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let transactions: any[] = [];
    
    if (account) {
      account.available_limit = Math.max(0, Number(account.credit_limit) - Number(account.current_balance));
      
      const { data: txs, error: txsError } = await getSupabaseAdmin().from('credit_transactions')
        .select('*')
        .eq('credit_account_id', account.id)
        .order('ledger_no', { ascending: false })
        .limit(50);
        
      if (txsError) {
        console.error('[CARI TRANSACTIONS ERROR]', txsError);
        return NextResponse.json({ error: 'Cari hareketler yüklenemedi.' }, { status: 500 });
      }
      
      if (txs) {
        transactions = txs;
      }
    }

    return NextResponse.json({
      customer,
      account: account ?? null,
      transactions
    });
  } catch (err) {
    console.error('[CARI GET CUSTOMER ERROR]', err);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
