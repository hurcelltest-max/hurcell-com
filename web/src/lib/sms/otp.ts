import crypto from 'crypto';

/**
 * OTP Generation & Secure Hashing Utilities
 * Note: This file should ONLY be used in server-side contexts.
 */

// Generate a cryptographically secure random 6-digit numeric code
export function generateOtpCode(): string {
  // Returns a string between "100000" and "999999"
  // crypto.randomInt is secure against bias
  const code = crypto.randomInt(100000, 1000000);
  return code.toString();
}

/**
 * Create a HMAC-SHA256 hash of the OTP code for database storage.
 * @param phone_normalized The normalized phone number of the user.
 * @param code The 6-digit raw code.
 * @param purpose The context/purpose of the OTP (default: 'login').
 */
export function hashOtpCode(phone_normalized: string, code: string, purpose: string = 'login'): string {
  const secret = process.env.SMS_OTP_HASH_SECRET;
  
  // In production, we MUST have a secret to prevent rainbow table attacks.
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: SMS_OTP_HASH_SECRET is not defined in production environment.');
    }
    console.warn('WARNING: SMS_OTP_HASH_SECRET is missing. Using a fallback secret for development ONLY.');
  }

  const actualSecret = secret || 'dev_fallback_secret_do_not_use';

  // Bind the code to the specific phone and purpose to prevent replay/substitution attacks
  const payload = `${phone_normalized}:${purpose}:${code}`;

  return crypto
    .createHmac('sha256', actualSecret)
    .update(payload)
    .digest('hex');
}

/**
 * Compare a user-provided raw code with the stored HMAC hash securely.
 */
export function verifyOtpCode(
  phone_normalized: string, 
  rawCode: string, 
  storedHash: string, 
  purpose: string = 'login'
): boolean {
  const incomingHash = hashOtpCode(phone_normalized, rawCode, purpose);
  
  // timingSafeEqual prevents timing attacks during string comparison
  const incomingBuffer = Buffer.from(incomingHash);
  const storedBuffer = Buffer.from(storedHash);
  
  if (incomingBuffer.length !== storedBuffer.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(incomingBuffer, storedBuffer);
}
