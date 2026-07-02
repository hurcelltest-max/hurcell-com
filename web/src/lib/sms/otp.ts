import crypto from 'crypto';

/**
 * OTP Generation & Hashing Utilities
 */

// Generate a random 6-digit numeric code
export function generateOtpCode(): string {
  // Returns a string between "100000" and "999999"
  const code = Math.floor(100000 + Math.random() * 900000);
  return code.toString();
}

// Create a SHA-256 hash of the OTP code for database storage
export function hashOtpCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// Compare a user-provided raw code with the stored hash
export function verifyOtpCode(rawCode: string, storedHash: string): boolean {
  const incomingHash = hashOtpCode(rawCode);
  return incomingHash === storedHash;
}
