/**
 * Phone Number Normalization Utility
 * Specifically targets Turkish phone numbers (+90 or 05XX).
 */

export function normalizeTurkishPhoneNumber(rawPhone: string): string {
  if (!rawPhone || typeof rawPhone !== 'string') {
    throw new Error('Geçersiz telefon numarası formatı.');
  }

  // Remove all non-numeric characters
  const cleaned = rawPhone.replace(/[^\d]/g, '');

  // 1. Starts with 905 (e.g. 905551234567) -> length 12
  if (cleaned.startsWith('905') && cleaned.length === 12) {
    return cleaned;
  }

  // 2. Starts with 05 (e.g. 05551234567) -> length 11
  if (cleaned.startsWith('05') && cleaned.length === 11) {
    return '9' + cleaned;
  }

  // 3. Starts with 5 (e.g. 5551234567) -> length 10
  if (cleaned.startsWith('5') && cleaned.length === 10) {
    return '90' + cleaned;
  }

  // Any other length or starting digit is invalid for this TR-only scope
  throw new Error('Geçersiz Türkiye mobil numara uzunluğu veya formatı. Numara 5 ile başlamalıdır.');
}

export function formatPhoneForDisplay(normalized: string): string {
  if (!normalized || normalized.length !== 13) return normalized;
  // +905551234567 -> +90 555 123 45 67
  return `${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6, 9)} ${normalized.slice(9, 11)} ${normalized.slice(11, 13)}`;
}
