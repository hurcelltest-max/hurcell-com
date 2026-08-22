import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/kasa/crypto';
import { getUserByUsername } from '@/lib/kasa/service';
import { createKasaSessionCookie } from '@/lib/kasa/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Kullanıcı adı ve şifre zorunludur.' },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim().toLowerCase();

    // IP Bilgisini al ve SHA-256 ile Hash'le (IP Gizliliği)
    const forwardedFor = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    const rawIp = forwardedFor.split(',')[0].trim();
    const ipHash = crypto.createHash('sha256').update(rawIp).digest('hex');

    const supabase = getSupabaseAdmin();

    // 1. Kalıcı Veritabanı Tabanlı Rate-Limit Kontrolü
    try {
      const { error: limitError } = await supabase.rpc('fn_kasa_check_and_record_login_attempt', {
        p_ip_hash: ipHash,
        p_username: cleanUsername,
        p_is_success: false,
      });

      if (limitError && limitError.message?.includes('ÇOK_FAZLA_DENEME')) {
        return NextResponse.json(
          { error: limitError.message },
          { status: 429 }
        );
      }
    } catch {
      // Failover
    }

    // 2. Kullanıcıyı getir
    const user = await getUserByUsername(cleanUsername);

    // 3. Kullanıcı yoksa veya aktif değilse (Kullanıcı Varlık Saptamasını Önleme)
    if (!user || !user.is_active) {
      return NextResponse.json(
        { error: 'Geçersiz kullanıcı adı veya şifre.' },
        { status: 401 }
      );
    }

    // 4. Parolayı doğrula (Timing-Safe)
    const isValid = verifyPassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Geçersiz kullanıcı adı veya şifre.' },
        { status: 401 }
      );
    }

    // 5. Başarılı girişte rate-limit sayacını sıfırla
    try {
      await supabase.rpc('fn_kasa_check_and_record_login_attempt', {
        p_ip_hash: ipHash,
        p_username: cleanUsername,
        p_is_success: true,
      });
    } catch {
      // Failover
    }

    // 6. HttpOnly Cookie set et
    await createKasaSessionCookie(user);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Giriş işlemi sırasında sistem hatası oluştu.' },
      { status: 500 }
    );
  }
}
