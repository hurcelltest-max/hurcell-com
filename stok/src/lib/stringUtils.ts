/**
 * Normalizes a string for search, ignoring case and Turkish character accents
 * so that "link", "LİNK", "LINK", "lınk" all match.
 */
export function normalizeForSearch(str: string): string {
  if (!str) return '';
  return str
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .trim();
}

/**
 * Checks if a search term exists within a source string, ignoring case and accents.
 */
export function turkishIncludes(source: string, search: string): boolean {
  if (!source || !search) return false;
  return normalizeForSearch(source).includes(normalizeForSearch(search));
}
