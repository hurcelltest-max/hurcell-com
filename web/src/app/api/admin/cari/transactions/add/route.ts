import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getVerifiedAdminUsername } from '@/lib/admin/auth';
import { addTransactionSchema } from '@/lib/validations/transaction';

export async function POST(req: Request) {
  try {
    const admin_username = getVerifiedAdminUsername(req);
    if (!admin_username) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
    }

    const body = await req.json();
    
    // Validation
    const parseResult = addTransactionSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ 
        error: parseResult.error.errors[0]?.message || 'Geçersiz veri'
      }, { status: 400 });
    }

    const data = parseResult.data;

    // Resolve customer & account from cardToken
    const { data: customerData, error: custError } = await supabaseAdmin
      .from('credit_customers')
      .select('id, credit_accounts(id)')
      .eq('card_token', data.cardToken)
      .maybeSingle();

    if (custError || !customerData || !customerData.credit_accounts || customerData.credit_accounts.length === 0) {
      return NextResponse.json({ error: 'Müşteri veya hesabı bulunamadı' }, { status: 404 });
    }

    const customer_id = customerData.id;
    const account_id = customerData.credit_accounts[0].id;

    let transaction_type: string;
    let direction: string;
    let source_type: string;
    let amount = data.amount;
    let reversed_transaction_id = data.reversed_transaction_id;

    switch (data.category) {
      case 'store_sale':
        transaction_type = 'purchase';
        direction = 'debit';
        source_type = 'store_sale';
        break;
      case 'service_fee':
        transaction_type = 'fee';
        direction = 'debit';
        source_type = 'service_fee';
        break;
      case 'print_fee':
        transaction_type = 'fee';
        direction = 'debit';
        source_type = 'print_fee';
        break;
      case 'technical_service_fee':
        transaction_type = 'fee';
        direction = 'debit';
        source_type = 'technical_service_fee';
        break;
      case 'payment':
        transaction_type = 'payment';
        direction = 'credit';
        source_type = 'payment';
        break;
      case 'adjustment_debit':
        transaction_type = 'adjustment';
        direction = 'debit';
        source_type = 'adjustment';
        break;
      case 'adjustment_credit':
        transaction_type = 'adjustment';
        direction = 'credit';
        source_type = 'adjustment';
        break;
      case 'reversal':
        // Fetch original transaction
        const { data: origTx, error: origErr } = await supabaseAdmin
          .from('credit_transactions')
          .select('amount, direction, credit_customer_id, credit_account_id, transaction_type')
          .eq('id', reversed_transaction_id)
          .single();
        
        if (origErr || !origTx) {
          return NextResponse.json({ error: 'Orijinal işlem bulunamadı' }, { status: 404 });
        }
        if (origTx.credit_customer_id !== customer_id || origTx.credit_account_id !== account_id) {
          return NextResponse.json({ error: 'İşlem bu hesaba ait değil' }, { status: 400 });
        }
        if (origTx.transaction_type === 'reversal') {
          return NextResponse.json({ error: 'İptal işlemi tekrar iptal edilemez' }, { status: 400 });
        }
        
        transaction_type = 'reversal';
        source_type = 'reversal';
        amount = origTx.amount;
        direction = origTx.direction === 'debit' ? 'credit' : 'debit';
        break;
      default:
        return NextResponse.json({ error: 'Geçersiz kategori' }, { status: 400 });
    }

    // Call RPC
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('add_credit_transaction', {
      p_customer_id: customer_id,
      p_account_id: account_id,
      p_transaction_type: transaction_type,
      p_direction: direction,
      p_amount: amount,
      p_description: data.description,
      p_source_type: source_type,
      p_source_reference: data.source_reference || null,
      p_external_url: data.external_url || null,
      p_payment_method: transaction_type === 'payment' ? (data.payment_method || null) : null,
      p_admin_username: admin_username,
      p_reversed_transaction_id: transaction_type === 'reversal' ? (reversed_transaction_id || null) : null,
      p_metadata: null
    });

    if (rpcError) {
      console.error('[ADD TRANSACTION RPC ERROR]', rpcError);
      
      let errMsg = 'İşlem kaydedilemedi. Lütfen tekrar deneyin.';
      const rawError = rpcError.message || '';
      
      if (rawError.includes('Insufficient credit limit')) errMsg = 'Bu işlem müşterinin kredi limitini aşıyor.';
      else if (rawError.includes('Overpayment is not allowed')) errMsg = 'Fazla tahsilat yapılamaz. Güncel bakiye 0\'ın altına düşemez.';
      else if (rawError.includes('Customer and Account must be active')) errMsg = 'Bu işlem yapılamaz. Müşteri veya hesap aktif durumda değil.';
      else if (rawError.includes('Transaction is already reversed')) errMsg = 'Bu işlem zaten iptal edilmiş.';
      else if (rawError.includes('Amount must be greater than zero')) errMsg = 'Tutar 0\'dan büyük olmalıdır.';
      
      return NextResponse.json({ error: errMsg }, { status: 400 });
    }

    return NextResponse.json({ success: true, transaction: rpcData });
  } catch (err) {
    console.error('[ADD TRANSACTION ERROR]', err);
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}
