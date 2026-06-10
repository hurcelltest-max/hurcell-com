export const WHATSAPP_NUMBER = '905322362242';
export const B2B_LOGIN_URL = 'https://stok.hurcell.com/b2b/login';

// ─────────────────────────────────────────────────────────────────
// Brand Normalization Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Canonical display names for known brands.
 * Key: lower-case variant(s) | Value: preferred display form.
 */
export const BRAND_DISPLAY_OVERRIDES: Record<string, string> = {
  samsung: 'Samsung',
  apple: 'Apple',
  ttec: 'TTEC',
  esr: 'ESR',
  xiaomi: 'Xiaomi',
  huawei: 'Huawei',
  oppo: 'OPPO',
  vivo: 'vivo',
  realme: 'realme',
  oneplus: 'OnePlus',
  'one plus': 'OnePlus',
  motorola: 'Motorola',
  nokia: 'Nokia',
  sony: 'Sony',
  lg: 'LG',
  asus: 'ASUS',
  lenovo: 'Lenovo',
  hp: 'HP',
  dell: 'Dell',
  acer: 'Acer',
  msi: 'MSI',
  jbl: 'JBL',
  anker: 'Anker',
  baseus: 'Baseus',
  ugreen: 'UGREEN',
  reeder: 'Reeder',
  casper: 'Casper',
  turkcell: 'Turkcell',
  vestel: 'Vestel',
  philips: 'Philips',
  belkin: 'Belkin',
  spigen: 'Spigen',
  benq: 'BenQ',
  logitech: 'Logitech',
  microsoft: 'Microsoft',
  google: 'Google',
  amazon: 'Amazon',
};

/**
 * Returns a normalised key for a brand name (Turkish lowercase, trimmed).
 * Used for case-insensitive comparisons.
 */
export function normalizeBrandKey(brand: string | null | undefined): string {
  if (!brand) return '';
  return brand.trim().toLocaleLowerCase('tr-TR');
}

/**
 * Returns the correctly-capitalised display name for a brand.
 * Checks BRAND_DISPLAY_OVERRIDES first; otherwise Title-cases the input.
 */
export function formatBrandName(brand: string | null | undefined): string {
  if (!brand) return '';
  const trimmed = brand.trim();
  const key = normalizeBrandKey(trimmed);
  if (BRAND_DISPLAY_OVERRIDES[key]) return BRAND_DISPLAY_OVERRIDES[key];
  // Title-case fallback
  return trimmed.charAt(0).toLocaleUpperCase('tr-TR') + trimmed.slice(1);
}

/**
 * Given an input brand string and the list of brands already in the system,
 * resolves it to the existing canonical form (case-insensitive match)
 * or formats it via formatBrandName if it's truly new.
 *
 * Returns { resolved, wasNormalized } so callers can show a toast when needed.
 */
export function resolveExistingBrand(
  inputBrand: string | null | undefined,
  existingBrands: (string | null | undefined)[]
): { resolved: string; wasNormalized: boolean } {
  if (!inputBrand?.trim()) return { resolved: '', wasNormalized: false };
  const inputKey = normalizeBrandKey(inputBrand);
  const existing = existingBrands.find(
    (b) => b && normalizeBrandKey(b) === inputKey
  );
  if (existing) {
    const resolved = existing;
    const wasNormalized = resolved.trim() !== inputBrand.trim();
    return { resolved, wasNormalized };
  }
  const resolved = formatBrandName(inputBrand);
  const wasNormalized = resolved !== inputBrand.trim();
  return { resolved, wasNormalized };
}

export const formatPriceTRY = (price: number | string | null | undefined): string => {
  if (price === null || price === undefined || price === '') return 'Teklif Alın';
  const num = Number(price);
  if (isNaN(num)) return 'Teklif Alın';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export const getWhatsAppLink = (productName: string, barcode: string | null | undefined, price: number | string | null | undefined): string => {
  const formattedPrice = formatPriceTRY(price);
  const cleanBarcode = barcode || '—';
  
  const text = `Merhaba, HurCELL web sitesinde gördüğüm şu ürün hakkında bilgi almak istiyorum:
Ürün: ${productName}
Barkod: ${cleanBarcode}
Fiyat: ${formattedPrice}`;

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
};

export const getFallbackImage = (category: string | null | undefined): string => {
  const cat = (category || '').toLowerCase();
  let icon = '📦';
  let bg = '#f1f5f9'; // slate-100
  
  if (cat.includes('telefon') || cat.includes('phone')) {
    icon = '📱';
    bg = '#f0f9ff'; // sky-50
  } else if (cat.includes('tablet')) {
    icon = '📟';
    bg = '#ecfeff'; // cyan-50
  } else if (cat.includes('bilgisayar') || cat.includes('computer') || cat.includes('laptop') || cat.includes('macbook')) {
    icon = '💻';
    bg = '#e0e7ff'; // indigo-50
  } else if (cat.includes('kulaklık') || cat.includes('headphone') || cat.includes('earphone')) {
    icon = '🎧';
    bg = '#fdf2f8'; // pink-50
  } else if (cat.includes('şarj') || cat.includes('adaptör') || cat.includes('kablo') || cat.includes('charger') || cat.includes('cable')) {
    icon = '🔌';
    bg = '#fffbeb'; // amber-50
  } else if (cat.includes('saat') || cat.includes('watch')) {
    icon = '⌚';
    bg = '#ecfdf5'; // emerald-50
  } else if (cat.includes('kılıf') || cat.includes('case')) {
    icon = '🛡️';
    bg = '#f5f3ff'; // violet-50
  }

  // High-quality SVG base64 or inline data URL
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 200 200">
    <rect width="100%" height="100%" fill="${bg.replace('#', '%23')}"/>
    <circle cx="100" cy="100" r="45" fill="white" shadow="0 2px 4px rgba(0,0,0,0.05)"/>
    <text x="50%" y="54%" font-family="system-ui, -apple-system, sans-serif" font-size="42" text-anchor="middle" dominant-baseline="middle">${icon}</text>
  </svg>`;
  
  return `data:image/svg+xml;utf8,${svg}`;
};

// ─────────────────────────────────────────────────────────────────
// Category Normalization Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Display labels shown in chip buttons and the category select dropdown.
 * Key = internal group ID used in state / URL params.
 */
export const CATEGORY_CHIP_LABELS: Record<string, string> = {
  All:         'Tüm Ürünler',
  telefon:     'Telefon',
  tablet:      'Tablet',
  bilgisayar:  'Bilgisayar',
  aksesuar:    'Aksesuar',
  akilli_saat: 'Akıllı Saat',
  sarj_kablo:  'Şarj & Kablo',
};

/**
 * Keywords matched against product.category (Turkish lowercase, trimmed).
 * ORDER IS IMPORTANT: sarj_kablo is checked before aksesuar to correctly
 * assign şarj/kablo/adaptör categories to the more specific group first.
 */
const CATEGORY_GROUP_KEYS: Record<string, string[]> = {
  telefon:     ['telefon', 'phone', 'iphone', 'android telefon', 'cep telefonu'],
  tablet:      ['tablet', 'ipad'],
  bilgisayar:  ['bilgisayar', 'laptop', 'notebook', 'macbook', 'computer'],
  akilli_saat: ['akıllı saat', 'akilli saat', 'smartwatch'],
  // sarj_kablo BEFORE aksesuar — its keywords are a subset of potential aksesuar keywords
  sarj_kablo:  ['şarj aleti', 'sarj aleti', 'şarj & kablo', 'sarj & kablo', 'kablo', 'adaptör', 'adaptor', 'charger', 'power adapter'],
  aksesuar:    ['aksesuar', 'genel aksesuar', 'kulaklık', 'kulaklik', 'kılıf', 'kilif', 'powerbank', 'stand', 'ekran koruyucu', 'koruyucu', 'magsafe'],
};

/**
 * Keywords for fallback name/model/description matching.
 * Used when the product.category doesn't match any known group (e.g. "Teknoloji").
 * sarj_kablo keywords are checked FIRST to keep charging products in the right group.
 */
const SARJ_KABLO_NAME_KEYS = [
  'şarj', 'sarj', 'charger', 'adaptör', 'adaptor', 'adapter',
  'kablo', 'cable', 'usb-c', 'type-c', 'lightning', 'power adapter',
  'watt', 'magsafe charger', 'usb c kablo', 'c kablo',
];

const AKSESUAR_NAME_KEYS = [
  'kılıf', 'kilif', 'kulaklık', 'kulaklik', 'stand', 'ekran koruyucu',
  'magsafe', 'case', 'cover', 'holder', 'kalem', 'pencil',
  'airpods', 'earpods', 'band', 'kordon', 'dock', 'hub',
  'mouse', 'klavye', 'keyboard', 'powerbank', 'cam koruyucu',
];

/**
 * Returns a normalized lowercase key for a category string (tr-TR locale).
 */
export function normalizeCategoryKey(category: string | null | undefined): string {
  if (!category) return '';
  return category.trim().toLocaleLowerCase('tr-TR');
}

/**
 * Determines the primary category group for a product.
 *
 * Resolution order:
 * 1. Match product.category against CATEGORY_GROUP_KEYS (sarj_kablo before aksesuar)
 * 2. If category is unrecognized (e.g. "Teknoloji"), scan name + model + description
 *    for SARJ_KABLO_NAME_KEYS first, then AKSESUAR_NAME_KEYS
 * 3. Returns null if no group can be determined (only shows under "Tüm Ürünler")
 */
export function getCategoryGroup(product: {
  category?: string | null;
  name?: string | null;
  model?: string | null;
  description?: string | null;
}): string | null {
  const catKey = normalizeCategoryKey(product.category);

  // Step 1 — category field keyword match (checked in priority order)
  const groupOrder = ['telefon', 'tablet', 'bilgisayar', 'akilli_saat', 'sarj_kablo', 'aksesuar'];
  for (const groupId of groupOrder) {
    if (CATEGORY_GROUP_KEYS[groupId].some((k) => catKey.includes(k))) {
      return groupId;
    }
  }

  // Step 2 — category didn't match; try name / model / description keywords
  const contentKey = [
    product.name || '',
    product.model || '',
    product.description || '',
  ]
    .join(' ')
    .toLocaleLowerCase('tr-TR');

  if (SARJ_KABLO_NAME_KEYS.some((k) => contentKey.includes(k))) return 'sarj_kablo';
  if (AKSESUAR_NAME_KEYS.some((k) => contentKey.includes(k))) return 'aksesuar';

  return null; // Unknown — only visible under "Tüm Ürünler"
}

/**
 * Returns true if a product belongs to the selected category group.
 *
 * Special rule: selecting "aksesuar" also includes "sarj_kablo" products
 * (şarj/kablo/adaptör ürünleri are accessories by nature).
 */
export function matchesCategoryGroup(
  selectedGroupId: string,
  product: {
    category?: string | null;
    name?: string | null;
    model?: string | null;
    description?: string | null;
  }
): boolean {
  if (selectedGroupId === 'All') return true;
  const group = getCategoryGroup(product);
  if (!group) return false;
  // "aksesuar" chip is a superset — it includes sarj_kablo products too
  if (selectedGroupId === 'aksesuar') return group === 'aksesuar' || group === 'sarj_kablo';
  return group === selectedGroupId;
}

/**
 * Returns a user-friendly category display string for a product card.
 * Uses getCategoryGroup + CATEGORY_CHIP_LABELS; falls back to the raw category value.
 */
export function formatCategoryName(product: {
  category?: string | null;
  name?: string | null;
  model?: string | null;
  description?: string | null;
}): string {
  const group = getCategoryGroup(product);
  if (group && CATEGORY_CHIP_LABELS[group]) return CATEGORY_CHIP_LABELS[group];
  return product.category || 'Teknoloji';
}
