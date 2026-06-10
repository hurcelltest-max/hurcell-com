export const WHATSAPP_NUMBER = '905322362242';
export const B2B_LOGIN_URL = 'https://stok.hurcell.com/b2b/login';

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
