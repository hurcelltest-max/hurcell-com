import 'server-only';
import { headers } from 'next/headers';
import { getKasaSessionFromCookies } from './session';
import { getUserByUsername, getUserById } from './service';
import { KasaSessionPayload, KasaUser } from './types';
import { getVerifiedAdminUsername } from '@/lib/admin/auth';

export interface VerifiedKasaAuth {
  payload: KasaSessionPayload;
  user: KasaUser;
}

/**
 * Sunucu tarafında aktif kasa oturumunu veya Admin Basic Auth oturumunu doğrular
 */
export async function getVerifiedKasaSession(): Promise<VerifiedKasaAuth | null> {
  // 1. Kasa çerez oturumunu kontrol et
  const payload = await getKasaSessionFromCookies();
  if (payload) {
    const user = await getUserById(payload.userId);
    if (user && user.is_active) {
      return { payload, user };
    }
  }

  // 2. Eğer çerez oturumu yoksa, Admin Basic Auth başlığını kontrol et (Köprü Doğrulama)
  try {
    const headerStore = await headers();
    const authHeader = headerStore.get('authorization');
    const validUsername = process.env.ADMIN_USERNAME;
    const validPassword = process.env.ADMIN_PASSWORD;

    if (authHeader && validUsername && validPassword) {
      const basicUsername = getVerifiedAdminUsername(new Request('http://localhost', { headers: { authorization: authHeader } }));
      if (basicUsername) {
        // Sistemdeki yönetici kullanıcısını bul veya sanal yetkili yönetici nesnesi üret
        let dbUser = await getUserByUsername(basicUsername);
        if (!dbUser) {
          // Eğer veritabanında henüz username kaydı yoksa sanal yönetici nesnesi sağla
          return {
            payload: {
              userId: '00000000-0000-0000-0000-000000000001',
              username: basicUsername,
              fullName: 'Sistem Yöneticisi',
              role: 'yonetici',
              exp: Math.floor(Date.now() / 1000) + 3600,
            },
            user: {
              id: '00000000-0000-0000-0000-000000000001',
              username: basicUsername,
              full_name: 'Sistem Yöneticisi',
              role: 'yonetici',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          };
        }

        return {
          payload: {
            userId: dbUser.id,
            username: dbUser.username,
            fullName: dbUser.full_name,
            role: dbUser.role,
            exp: Math.floor(Date.now() / 1000) + 3600,
          },
          user: dbUser,
        };
      }
    }
  } catch {
    // Headers parsing failover
  }

  return null;
}

/**
 * Oturum açmış kullanıcı gerektirir (Personel veya Yönetici)
 */
export async function requireKasaAuth(): Promise<VerifiedKasaAuth> {
  const auth = await getVerifiedKasaSession();
  if (!auth) {
    throw new Error('UNAUTHORIZED: Geçerli kasa oturumu bulunamadı.');
  }
  return auth;
}

/**
 * Yalnızca YÖNETİCİ rolüne izin verir
 */
export async function requireManagerAuth(): Promise<VerifiedKasaAuth> {
  const auth = await requireKasaAuth();
  if (auth.user.role !== 'yonetici') {
    throw new Error('FORBIDDEN: Bu işlem yalnızca yetkili yöneticiler tarafından gerçekleştirilebilir.');
  }
  return auth;
}
