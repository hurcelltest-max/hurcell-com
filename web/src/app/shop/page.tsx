'use client'

import React, { useEffect, useState } from 'react'
import { ChevronRight, ShoppingBag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

// Product Type
type Product = {
  id: string;
  name: string;
  model: string;
  brand: string;
  category: string;
  price: number;
  sku: string;
  image_url: string;
}

// Format price to Turkish locale
const formatPrice = (price: number) => {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
};

// All Products from PDF
const PRODUCTS: Product[] = [
  // High-Risk Devices (Forces acceptance protocol)
  {
    id: 'APL-IPH15P-256',
    name: 'Apple iPhone 15 Pro 256GB',
    model: 'A3102',
    brand: 'Apple',
    category: 'Telefon',
    price: 64999,
    sku: 'APL-IPH15P-256',
    image_url: '/images/placeholder.png',
  },
  {
    id: 'APL-MBP16-512',
    name: 'Apple MacBook Pro 16 M3 Pro',
    model: 'A2991',
    brand: 'Apple',
    category: 'Bilgisayar',
    price: 94999,
    sku: 'APL-MBP16-512',
    image_url: '/images/placeholder.png',
  },
  {
    id: 'SMC-GALS24U-256',
    name: 'Samsung Galaxy S24 Ultra 256GB',
    model: 'SM-S928B',
    brand: 'Samsung',
    category: 'Telefon',
    price: 59999,
    sku: 'SMC-GALS24U-256',
    image_url: '/images/placeholder.png',
  },
  // Apple Elite Series
  {
    id: '194253337331',
    name: 'Apple 35W Dual Power Adaptör',
    model: 'A2676',
    brand: 'Apple',
    category: 'Şarj Adaptörü',
    price: 2999,
    sku: '194253337331',
    image_url: '/images/placeholder.png',
  },
  {
    id: '195949121272',
    name: 'Apple 20W Adaptör',
    model: 'A2347',
    brand: 'Apple',
    category: 'Şarj Adaptörü',
    price: 869,
    sku: '195949121272',
    image_url: '/images/placeholder.png',
  },
  {
    id: '190199351332',
    name: 'Apple 96W Adaptör',
    model: 'A2166',
    brand: 'Apple',
    category: 'Şarj Adaptörü',
    price: 4499,
    sku: '190199351332',
    image_url: '/images/placeholder.png',
  },
  {
    id: '194252025062',
    name: 'Apple 12W Adaptör',
    model: 'A2167',
    brand: 'Apple',
    category: 'Şarj Adaptörü',
    price: 599,
    sku: '194252025062',
    image_url: '/images/placeholder.png',
  },
  {
    id: '885909627349',
    name: 'Apple 5W Adaptör',
    model: 'A1400',
    brand: 'Apple',
    category: 'Şarj Adaptörü',
    price: 549,
    sku: '885909627349',
    image_url: '/images/placeholder.png',
  },
  {
    id: '195949085611',
    name: 'Apple USB-C Lightning Kablo 1m',
    model: 'a2561',
    brand: 'Apple',
    category: 'Kablo',
    price: 749,
    sku: '195949085611',
    image_url: '/images/placeholder.png',
  },
  {
    id: '194253494850',
    name: 'Apple USB-C to USB-C 1m',
    model: 'A2795',
    brand: 'Apple',
    category: 'Kablo',
    price: 849,
    sku: '194253494850',
    image_url: '/images/placeholder.png',
  },
  {
    id: '195949093432',
    name: 'Apple Type-C Kablo 2m',
    model: 'A2794',
    brand: 'Apple',
    category: 'Kablo',
    price: 1599,
    sku: '195949093432',
    image_url: '/images/placeholder.png',
  },
  {
    id: '190198496201',
    name: 'Apple Lightning Kablo 2m',
    model: 'A2441',
    brand: 'Apple',
    category: 'Kablo',
    price: 1379,
    sku: '190198496201',
    image_url: '/images/placeholder.png',
  },
  {
    id: 'SMX63TWMY06',
    name: 'Apple Type-C Kulaklık',
    model: 'A3046',
    brand: 'Apple',
    category: 'Kulaklık',
    price: 899,
    sku: 'SMX63TWMY06',
    image_url: '/images/placeholder.png',
  },

  // Samsung Power Group
  {
    id: '8801643979379',
    name: 'Samsung 25W Kablolu Şarj',
    model: 'EP-TA 800X',
    brand: 'Samsung',
    category: 'Şarj Adaptörü',
    price: 849,
    sku: '8801643979379',
    image_url: '/images/placeholder.png',
  },
  {
    id: '8806090986185',
    name: 'Samsung 45W Şarj Adaptörü',
    model: 'EP-TA845X',
    brand: 'Samsung',
    category: 'Şarj Adaptörü',
    price: 999,
    sku: '8806090986185',
    image_url: '/images/placeholder.png',
  },
  {
    id: '8806095471761',
    name: 'Samsung 45W Kablolu Adaptör',
    model: 'EP-T4511',
    brand: 'Samsung',
    category: 'Şarj Adaptörü',
    price: 1999,
    sku: '8806095471761',
    image_url: '/images/placeholder.png',
  },
  {
    id: '8806090958960',
    name: 'Samsung 25W Adaptör',
    model: 'EP-TA800',
    brand: 'Samsung',
    category: 'Şarj Adaptörü',
    price: 749,
    sku: '8806090958960',
    image_url: '/images/placeholder.png',
  },
  {
    id: '8806090270031',
    name: 'Samsung AKG Kablolu Kulaklık',
    model: 'E0-IC100',
    brand: 'Samsung',
    category: 'Kulaklık',
    price: 899,
    sku: '8806090270031',
    image_url: '/images/placeholder.png',
  },

  // McDodo & Momax Professional Solutions
  {
    id: '6921002681032',
    name: 'McDodo GaN 100W 3 Port Adaptör',
    model: 'CH-810',
    brand: 'McDodo',
    category: 'Şarj Adaptörü',
    price: 2999,
    sku: '6921002681032',
    image_url: '/images/placeholder.png',
  },
  {
    id: 'TEL-002',
    name: 'McDodo 33W 4 Port Adaptör',
    model: 'CH-2250',
    brand: 'McDodo',
    category: 'Şarj Adaptörü',
    price: 999,
    sku: 'TEL-002',
    image_url: '/images/placeholder.png',
  },
  {
    id: '6921002640206',
    name: 'McDodo 20W Adaptör',
    model: 'CH-402',
    brand: 'McDodo',
    category: 'Şarj Adaptörü',
    price: 499,
    sku: '6921002640206',
    image_url: '/images/placeholder.png',
  },
  {
    id: '6921002641005',
    name: 'McDodo 2in1 Adaptör',
    model: 'CH-410',
    brand: 'McDodo',
    category: 'Şarj Adaptörü',
    price: 1999,
    sku: '6921002641005',
    image_url: '/images/placeholder.png',
  },
  {
    id: '4894222074972',
    name: 'Momax 100W Magnetic Kablo',
    model: 'DC35L',
    brand: 'Momax',
    category: 'Kablo',
    price: 699,
    sku: '4894222074972',
    image_url: '/images/placeholder.png',
  },
  {
    id: '6921002614306',
    name: 'Momax USB-C Hub 5 in 1',
    model: 'HU-143',
    brand: 'Momax',
    category: 'HUB',
    price: 899,
    sku: '6921002614306',
    image_url: '/images/placeholder.png',
  },
];

// Group products by brand
const groupedProducts = {
  apple: PRODUCTS.filter(p => p.brand === 'Apple'),
  samsung: PRODUCTS.filter(p => p.brand === 'Samsung'),
  professional: PRODUCTS.filter(p => p.brand === 'McDodo' || p.brand === 'Momax'),
};

// Product Band Component
function ProductBand({ title, subtitle, products, bgGradient }: { title: string; subtitle: string; products: Product[]; bgGradient: string }) {
  const router = useRouter();

  const handleBuy = (product: Product) => {
    const categoryLower = product.category.toLowerCase();
    const nameLower = product.name.toLowerCase();
    
    const isHighRisk = ['telefon', 'tablet', 'bilgisayar', 'computer', 'phone', 'laptop', 'macbook'].some(
      keyword => categoryLower.includes(keyword) || nameLower.includes(keyword)
    );

    if (isHighRisk) {
      // Map categories to the device type enum values: phone, tablet, computer
      let deviceType = 'phone';
      if (categoryLower.includes('tablet')) {
        deviceType = 'tablet';
      } else if (categoryLower.includes('bilgisayar') || categoryLower.includes('laptop') || nameLower.includes('macbook')) {
        deviceType = 'computer';
      }

      // By default, our catalog products represent brand new products, so we use new_sealed
      const conditionVal = 'new_sealed';

      // Prepopulate and redirect to digital acceptance protocol/sales contract page
      router.push(`/satis-sozlesmesi?productId=${encodeURIComponent(product.id)}&brand=${encodeURIComponent(product.brand)}&model=${encodeURIComponent(product.name)}&price=${product.price}&channel=online&type=${deviceType}&condition=${conditionVal}`);
    } else {
      // Standard checkout flow
      alert(`"${product.name}" sepete eklendi! Satın alma işlemini tamamlayabilirsiniz.`);
    }
  };

  return (
    <section className={cn('py-16 md:py-20', bgGradient)}>
      <div className="max-w-[1600px] mx-auto px-4 md:px-8">
        <div className="mb-12">
          <h2 className="text-4xl md:text-5xl font-light text-slate-900 tracking-tight mb-2">
            {title}
          </h2>
          <p className="text-lg text-slate-600 font-light">{subtitle}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 md:gap-8">
          {products.map((product) => (
            <div key={product.id} className="group flex flex-col h-full">
              {/* Product Card - Completely Transparent */}
              <div className="flex-1 flex flex-col bg-transparent rounded-3xl overflow-hidden transition-all duration-500">
                {/* Image Container */}
                <div className="aspect-[4/5] relative overflow-hidden bg-transparent rounded-3xl mb-6">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-110"
                  />
                  {/* Soft gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/5 via-transparent to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>

                {/* Content - Completely Transparent Background */}
                <div className="flex flex-col flex-1">
                  {/* Category Badge */}
                  <div className="mb-3 text-[10px] uppercase tracking-[0.2em] font-light text-slate-500">
                    {product.category}
                  </div>

                  {/* Product Name */}
                  <h3 className="text-base md:text-lg font-light text-slate-900 mb-1 line-clamp-2 leading-snug">
                    {product.name}
                  </h3>

                  {/* Model */}
                  <p className="text-xs text-slate-500 font-light mb-4">
                    Model: {product.model}
                  </p>

                  {/* Price */}
                  <div className="mt-auto mb-6">
                    <p className="text-2xl md:text-3xl font-light text-slate-900 tracking-tight">
                      {formatPrice(product.price)}
                    </p>
                  </div>

                  {/* Action Buttons - Apple Style */}
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => handleBuy(product)}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-light text-sm transition-all duration-300 flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                    >
                      <ShoppingBag size={16} />
                      Satın Al
                    </button>
                    <button className="w-full py-2 text-blue-600 hover:text-blue-700 font-light text-sm transition-colors duration-300 flex items-center justify-center gap-1 hover:underline">
                      Daha fazla bilgi
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function ShopPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-blue-50 to-slate-100 text-slate-900">
      {/* Hero Section */}
      <section className="py-20 md:py-32 bg-gradient-to-br from-white via-blue-50 to-slate-100">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <span className="text-[12px] uppercase tracking-[0.35em] font-light text-slate-600 mb-4 block">
              Premium Aksesuar Koleksiyonu
            </span>
            <h1 className="text-5xl md:text-7xl font-light text-slate-900 tracking-tight mb-4">
              Seçkin Koleksiyon
            </h1>
            <p className="text-lg md:text-xl text-slate-600 font-light leading-relaxed">
              Apple, Samsung, Xiaomi ve diğer tüm seçkin Android telefonların en kaliteli, profesyonel teknoloji çözümlerini keşfedin.
            </p>
          </div>
        </div>
      </section>

      {/* Apple Elite Series */}
      <ProductBand
        title="Apple Elite Serisi"
        subtitle="Premium adaptörler, kablolar ve kulaklıklar"
        products={groupedProducts.apple}
        bgGradient="bg-gradient-to-b from-slate-50 to-blue-50"
      />

      {/* Samsung Power Group */}
      <ProductBand
        title="Samsung Güç Grubu"
        subtitle="Yüksek verimli şarj çözümleri"
        products={groupedProducts.samsung}
        bgGradient="bg-gradient-to-b from-blue-50 to-slate-100"
      />

      {/* McDodo & Momax Professional Solutions */}
      <ProductBand
        title="McDodo & Momax Profesyonel Çözümler"
        subtitle="Güçlü, esnek ve yenilikçi ürünler"
        products={groupedProducts.professional}
        bgGradient="bg-gradient-to-b from-slate-100 to-slate-50"
      />

      {/* Footer */}
      <footer className="py-12 bg-white border-t border-slate-200">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 text-center">
          <p className="text-sm text-slate-600 font-light">
            © 2026 HurCELL. Tüm hakları saklıdır.
          </p>
        </div>
      </footer>
    </div>
  );
}
