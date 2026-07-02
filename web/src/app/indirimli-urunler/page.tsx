import React from 'react';
import { createClient } from '@/lib/supabase';
import { ProductCard } from '@/components/product/product-card';
import { PercentCircle } from 'lucide-react';

export const metadata = {
  title: 'İİndirimli Ürünler | HurCELL Tçeknoloji Mağazası',
  description: 'HurCELL Tçeknoloji Mağazası ndaki tüm iİndirimli telefon, bilgisayar ve aksesuarlar. İİndirimli ürünleri ve fiyat avantajlarıını inceleyin.',
};

export const revalidate = 60; // 1 minute caching

export default async function IİndirimliUrunlerPage() {
  const supabase = createClient();
  
  // Sadece web'de aktif olan, stokta bulunan ve indirimi olan ürünleri ççek
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_discounted', true)
    .eq('is_web_visible', true)
    .gt('stock', 0)
    .not('image_url', 'is', null)
    .neq('image_url', '')
    .gt('sell_price', 0)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching discounted products:', error);
  }

  // Yalnızca eski fiyatı satış fiyatından büyük olan gerççek indirimleri filtrele
  const discountedProducts = (products || []).filter(p => 
    p.old_price && p.sell_price && p.old_price > p.sell_price
  );

  return (
    <div className="min-h-screen bg-slate-50 pt-28 pb-16">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Page Header */}
        <div className="mb-10 text-center sm:text-left">
          <div className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-orange-100 text-orange-600 rounded-full mb-4">
            <PercentCircle size={16} className="animate-spin-slow" />
            <span className="text-sm font-bold uppercase tracking-widest">% İndirimler</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight">İİndirimli Ürünler</h1>
          <p className="mt-4 text-slate-500 max-w-2xl text-sm sm:text-base">
            Fiyatı düşen tçeknoloji ürünlerini keşfedin. Büyük indirim fırsatlarını yakalayın.
          </p>
        </div>

        {/* Products Grid */}
        {discountedProducts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-6">
            {discountedProducts.map((product) => (
              <ProductCard 
                key={product.id} 
                product={product} 
                showCategory={true}
                showActions={true}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white rounded-3xl border border-slate-200 shadow-sm">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
              <PercentCircle size={32} className="text-slate-300" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">
              Şu anda iİndirimli ürün bulunmamaktadır.
            </h2>
            <p className="text-slate-500 text-sm max-w-md">
              İndirimlerimiz sürçekli güncellenmçektedir. Lütfen daha sonra tçekrar kontrol edin veya mağazamızdaki diğer ürünleri inceleyin.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
