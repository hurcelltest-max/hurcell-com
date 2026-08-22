import crypto from 'crypto';
import { KasaSessionPayload } from './types';

// Process bazlı dinamik dev fallback key (kaynak koda gömülü sabit secret OLMAMALIDIR)
const DYNAMIC_DEV_KEY = crypto.randomBytes(32).toString('hex');

function getSecretKey(): string {
  const envSecret = process.env.KASA_SESSION_SECRET?.trim();
  if (envSecret && envSecret.length > 0) {
    return envSecret;
  }

  // Production ortamında secret yoksa FAIL-CLOSED (Sert Hata Ver)
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'GÜVENLİK_HATASI: Production ortamında KASA_SESSION_SECRET environment değişkeni tanımlanmamıştır. Sistem durduruldu.'
    );
  }

  return DYNAMIC_DEV_KEY;
}

/**
 * Parolayı pbkdf2 + salt ile güvenli şekilde hash'ler (100.000 iterasyon)
 * Minimum 10 karakter zorunluluğu uygulanır.
 */
export function hashPassword(password: string): string {
  if (!password || password.length < 10) {
    throw new Error('Güvenlik kuralı: Parola en az 10 karakter olmalıdır.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${hash}:${salt}`;
}

/**
 * Girilen parolayı kayıtlı hash ile karşılaştırır (Timing-Safe)
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const [hash, salt] = parts;
    const testHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    const hashBuffer = Buffer.from(hash, 'hex');
    const testBuffer = Buffer.from(testHash, 'hex');
    if (hashBuffer.length !== testBuffer.length) return false;
    return crypto.timingSafeEqual(hashBuffer, testBuffer);
  } catch {
    return false;
  }
}

/**
 * Kasa kullanıcısı için HMAC imzalı oturum token'ı üretir
 */
export function createSessionToken(payload: KasaSessionPayload): string {
  const jsonStr = JSON.stringify(payload);
  const base64Data = Buffer.from(jsonStr).toString('base64url');
  const secret = getSecretKey();
  const signature = crypto.createHmac('sha256', secret).update(base64Data).digest('base64url');
  return `${base64Data}.${signature}`;
}

/**
 * Oturum token'ını doğrular ve payload döner
 */
export function verifySessionToken(token: string): KasaSessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [base64Data, signature] = parts;
    const secret = getSecretKey();
    const expectedSignature = crypto.createHmac('sha256', secret).update(base64Data).digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const jsonStr = Buffer.from(base64Data, 'base64url').toString('utf8');
    const payload = JSON.parse(jsonStr) as KasaSessionPayload;

    // Sunucu tarafı epoch saniye süre kontrolü
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp < nowSeconds) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
