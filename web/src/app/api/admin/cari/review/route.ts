import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getVerifiedAdminUsername } from '@/lib/admin/auth';

export async function POST(req: Request) {
  try {
    const adminUsername = getVerifiedAdminUsername(req);
    
    if (!adminUsername) {
      return NextResponse.json({ error: 'Yetkisiz erişim veya kimlik doğrulama hatası.' }, { status: 401 });
    }

    const body = await req.json();
    const { customerId, decision, limit, statementDay, reason } = body;

    if (!customerId) {
      return NextResponse.json({ error: 'Müşteri ID zorunludur.' }, { status: 400 });
    }

    const cleanDecision = typeof decision === 'string' ? decision.trim().toLowerCase() : '';
    if (!['approve', 'reject', 'suspend'].includes(cleanDecision)) {
      return NextResponse.json({ error: 'Geçersiz karar tipi.' }, { status: 400 });
    }

    const cleanReason = typeof reason === 'string' ? reason.trim() : '';
    if (!cleanReason) {
      return NextResponse.json({ error: 'Sebep (reason) zorunludur.' }, { status: 400 });
    }

    let numLimit = 0;
    if (cleanDecision === 'approve' || cleanDecision === 'suspend') {
      numLimit = Number(limit);
      if (!Number.isFinite(numLimit) || numLimit < 0) {
        return NextResponse.json({ error: 'Geçerli bir limit (0 veya daha büyük) girmelisiniz.' }, { status: 400 });
      }
    }

    const numStatementDay = Number(statementDay);
    if (!Number.isInteger(numStatementDay) || ![10, 15, 20, 25].includes(numStatementDay)) {
      return NextResponse.json({ error: 'Hesap kesim günü 10, 15, 20 veya 25 olmalıdır.' }, { status: 400 });
    }

    const { error: rpcError } = await supabaseAdmin.rpc('review_credit_application', {
      p_customer_id: customerId,
      p_decision: cleanDecision,
      p_credit_limit: numLimit,
      p_statement_day: numStatementDay,
      p_reason: cleanReason,
      p_admin_username: adminUsername
    });

    if (rpcError) {
      console.error('[ADMIN CARI REVIEW] RPC Error:', rpcError);
      
      let safeError = 'Veritabanı işlemi sırasında bir hata oluştu.';
      if (rpcError.message.includes('Multiple credit accounts')) safeError = 'Müşteriye ait birden fazla hesap bulundu, otomatik işlem yapılamıyor.';
      else if (rpcError.message.includes('not found')) safeError = 'Müşteri veya hesap bulunamadı.';
      else if (rpcError.message.includes('Reason is required')) safeError = 'İşlem için sebep (reason) zorunludur.';

      return NextResponse.json({ error: safeError }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'İnceleme başarıyla kaydedildi.' });

  } catch (err) {
    console.error('[ADMIN CARI REVIEW] Internal error:', err);
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}

