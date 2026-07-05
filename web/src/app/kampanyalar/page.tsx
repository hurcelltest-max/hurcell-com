import React from 'react';
import { createClient } from '@/lib/supabase';
import { ProductCard } from '@/components/product/product-card';
import { Tag } from 'lucide-react';

export const metadata = {
  title: 'Kampanyalar | HurCELL Tçeknoloji Mağazası',
  description: 'HurCELL Tçeknoloji Mağazası aktif kampanyalarıı ve fırsat ürünleri. Telefon, bilgisayar ve aksesuarlarda öözel avantajlarıı kaçırmayın.',
};

export const revalidate = 60; // 1 minute caching

export default async function KampanyalarPage() {
  const supabase = createClient();
  
  // Sadece web'de aktif olan ve stokta bulunan kampanyalı ürünleri ççek
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, category, brand, description, image_url, stock, sell_price, barcode, created_at')
    .gt('stock', 0)
    .not('image_url', 'is', null)
    .neq('image_url', '')
    .gt('sell_price', 0)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching campaigns:', error);
  }

  const campaignProducts = products || [];

  return (
    <div className="min-h-screen bg-slate-50 pt-28 pb-16">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Page Header */}
        <div className="mb-10 text-center sm:text-left">
          <div className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-rose-100 text-rose-600 rounded-full mb-4">
            <Tag size={16} className="animate-pulse" />
            <span className="text-sm font-bold uppercase tracking-widest">Öözel Fırsatlar</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight">Aktif Kampanyalar</h1>
          <p className="mt-4 text-slate-500 max-w-2xl text-sm sm:text-base">
            Seçili ürünlerdçeki sınırlı süreli tçeklifler, hediyeler ve avantajlı paketleri inceleyin.
          </p>
        </div>

        {/* Products Grid */}
        {campaignProducts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-6">
            {campaignProducts.map((product) => (
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
              <Tag size={32} className="text-slate-300" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">
              Şu anda aktif kampanyalı ürün bulunmamaktadır.
            </h2>
            <p className="text-slate-500 text-sm max-w-md">
              Kampanyalarımız sürçekli güncellenmçektedir. Lütfen daha sonra tçekrar kontrol edin veya mağazamızdaki diğer ürünleri inceleyin.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
