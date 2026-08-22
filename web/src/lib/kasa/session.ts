import { cookies } from 'next/headers';
import { createSessionToken, verifySessionToken } from './crypto';
import { KasaSessionPayload, KasaUser } from './types';

export const KASA_SESSION_COOKIE_NAME = 'kasa_session';
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60; // 12 Saat

/**
 * Kullanıcı için yeni kasa oturumu oluşturur ve çerezi yazar
 */
export async function createKasaSessionCookie(user: KasaUser): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload: KasaSessionPayload = {
    userId: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    exp,
  };

  const token = createSessionToken(payload);
  const cookieStore = await cookies();

  cookieStore.set(KASA_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });

  return token;
}

/**
 * Mevcut oturum çerezini okur ve doğrular
 */
export async function getKasaSessionFromCookies(): Promise<KasaSessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(KASA_SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    return verifySessionToken(token);
  } catch {
    return null;
  }
}

/**
 * Oturum çerezini siler (Çıkış Yap)
 */
export async function clearKasaSessionCookie(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(KASA_SESSION_COOKIE_NAME);
  } catch {
    // Ignore cookie deletion errors on edge
  }
}
