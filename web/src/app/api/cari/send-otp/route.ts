import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateOtpCode, hashOtpCode } from '@/lib/sms/otp';
import { normalizeTurkishPhoneNumber } from '@/lib/sms/phone';
import { getSmsProvider } from '@/lib/sms/mock-provider';
import { maskPhone } from '@/lib/sms/netgsm-provider';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { phone } = await req.json();
    if (!phone) {
      return NextResponse.json({ error: 'Telefon numarası eksik.' }, { status: 400 });
    }

    const normalizedPhone = normalizeTurkishPhoneNumber(phone);
    const ip = req.headers.get('x-forwarded-for') || 'unknown';

    // Rate Limit (IP)
    const { data: ipLimitValid, error: ipError } = await supabaseAdmin.rpc('check_rate_limit_atomic', {
      p_identifier: ip,
      p_action: 'send_otp_cari',
      p_max_requests: 5,
      p_window_minutes: 10
    });

    if (ipError || ipLimitValid === false) {
      return NextResponse.json({ error: 'Çok fazla istek gönderdiniz. Lütfen daha sonra tekrar deneyin.' }, { status: 429 });
    }

    // Rate Limit (Phone)
    const { data: phoneLimitValid, error: phoneError } = await supabaseAdmin.rpc('check_rate_limit_atomic', {
      p_identifier: normalizedPhone,
      p_action: 'send_otp_cari',
      p_max_requests: 3,
      p_window_minutes: 10
    });

    if (phoneError || phoneLimitValid === false) {
      return NextResponse.json({ error: 'Bu numara için çok fazla istek gönderildi.' }, { status: 429 });
    }

    // Generate and Store OTP
    const code = generateOtpCode();
    const otpHash = hashOtpCode(normalizedPhone, code, 'cari_agreement');
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString(); // 3 mins

    const userAgent = req.headers.get('user-agent') || '';
    const userAgentHash = crypto.createHash('sha256').update(userAgent).digest('hex');

    const { error: insertError } = await supabaseAdmin
      .from('phone_verifications')
      .insert({
        phone: normalizedPhone,
        otp_hash: otpHash,
        expires_at: expiresAt,
        ip_address: ip,
        user_agent_hash: userAgentHash
      });

    if (insertError) {
      console.error('[CARI OTP DB ERROR]', insertError);
      return NextResponse.json({ error: 'Sistem hatası oluştu.' }, { status: 500 });
    }

    // Send SMS
    const provider = getSmsProvider();
    const message = `HurCELL Limitli Alisveris Sozlesmesi onay kodunuz: ${code}. Bu kodu kimseyle paylasmayiniz.`;
    const smsResult = await provider.sendSms(normalizedPhone, message);

    if (!smsResult.success) {
      console.error('[CARI OTP SMS ERROR]', smsResult.error);
      return NextResponse.json({ error: 'SMS gönderilemedi.' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `${maskPhone(normalizedPhone)} numarasına doğrulama kodu gönderildi.` 
    });

  } catch (error) {
    console.error('[CARI OTP ERROR]', error);
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}
