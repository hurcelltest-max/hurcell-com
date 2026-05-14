'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, ShoppingCart, Apple, Smartphone, Edit3, Plus, Home, Search, User, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// Types
type Product = {
  id: string;
  name: string;
  brand: string | null;
  sku: string | null;
  price: number;
  old_price?: number | null;
  discount_rate?: number | null;
  stock: number;
  category: string | null;
  image_url: string | null;
}

// Helpers
const formatRetailPrice = (price: number) => {
  if (!price || isNaN(price) || price === 0) return "0,00 TL";
  const ceilPrice = Math.ceil(price);
  const retailBase = Math.floor(ceilPrice / 10) * 10 + 9;
  const retailPrice = retailBase + 0.99; // Explicitly ensure ,99
  
  const formatter = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  return `${formatter.format(retailPrice)} TL`;
};

const isDeviceCategory = (cat: string | null) => {
  if (!cat) return false;
  const c = cat.toLowerCase();
  return c.includes('telefon') || c.includes('tablet') || c.includes('sıfır') || c.includes('yenilenmiş') || c.includes('teşhir') || c.includes('cihaz') || c.includes('macbook');
}

const getOSIcon = (name: string) => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('iphone') || lowerName.includes('ipad') || lowerName.includes('macbook') || lowerName.includes('apple')) {
    return <Apple className="w-3 h-3 text-slate-100" />;
  } else if (lowerName.includes('samsung') || lowerName.includes('xiaomi') || lowerName.includes('android') || lowerName.includes('redmi') || lowerName.includes('poco') || lowerName.includes('huawei')) {
    return <Smartphone className="w-3 h-3 text-slate-100" />;
  }
  return null;
}

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  
  // App Architecture State
  const [mainTab, setMainTab] = useState<'CİHAZLAR' | 'AKSESUARLAR'>('CİHAZLAR')
  
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü')

  // Load More Pagination State
  const [visibleCount, setVisibleCount] = useState(18); // 6-col grid, start with 3 rows

  const supabase = createClient()

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error("Error fetching products:", error)
      } else if (data) {
        setProducts(data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  // 1. Filter by Main Tab
  const tabProducts = useMemo(() => {
    return products.filter(p => mainTab === 'CİHAZLAR' ? isDeviceCategory(p.category) : !isDeviceCategory(p.category));
  }, [products, mainTab]);

  // Derived Categories for Horizontal Pill Nav
  const categories = useMemo(() => {
    const cats = new Set(tabProducts.map(p => p.category).filter(Boolean) as string[]);
    return ['Tümü', ...Array.from(cats)];
  }, [tabProducts]);

  // 2. Filter by Sub-category
  const filteredProducts = useMemo(() => {
    return tabProducts.filter(p => {
      return selectedCategory === 'Tümü' || p.category === selectedCategory;
    });
  }, [tabProducts, selectedCategory]);

  // Reset page and sub-filters on main tab change
  useEffect(() => {
    setVisibleCount(18);
    setSelectedCategory('Tümü');
  }, [mainTab]);

  const currentProducts = filteredProducts.slice(0, visibleCount);

  const handleEditPrice = async (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    e.preventDefault();
    const newPriceStr = prompt(`${product.name} için yeni fiyat girin (eski fiyat: ${product.price}):`, product.price.toString());
    if (newPriceStr) {
      const newPrice = parseFloat(newPriceStr);
      if (!isNaN(newPrice)) {
        const { error } = await supabase
          .from('products')
          .update({ price: newPrice })
          .eq('id', product.id);
        
        if (error) {
          toast.error("Fiyat güncellenemedi.");
        } else {
          toast.success("Fiyat başarıyla güncellendi.");
          fetchProducts();
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 md:pb-8 relative overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        .font-inter { font-family: 'Inter', sans-serif; }
        
        /* Hide scrollbar for category pills */
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}</style>

      <div className="font-inter">
        
        {/* Premium Business Blue Hero Section */}
        <div className="w-full bg-[#050B14] border-b border-blue-900/30 pt-28 pb-12 flex flex-col items-center justify-center text-center px-4 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/10 blur-[120px] pointer-events-none rounded-full"></div>
          
          <h1 className="text-3xl md:text-5xl font-semibold text-white tracking-tight mb-3 z-10">
            Premium Deneyim.
          </h1>
          <p className="text-blue-200/60 text-sm md:text-base font-light max-w-lg mb-6 z-10">
            HurCELL vizyonuyla en yeni akıllı cihazlar ve orijinal aksesuarları keşfedin.
          </p>
          <button className="z-10 text-blue-500 text-sm font-medium hover:underline flex items-center gap-1">
            Kampanyaları İncele <ChevronRight size={16} />
          </button>
        </div>

        <div className="max-w-[1600px] mx-auto px-4 md:px-8 pt-8 flex flex-col gap-6">
          
          {/* Main Division Tabs (Cihazlar / Aksesuarlar) */}
          <div className="flex justify-center border-b border-slate-800/80 mb-2">
            <div className="flex gap-12">
              <button
                onClick={() => setMainTab('CİHAZLAR')}
                className={cn(
                  "pb-4 text-sm md:text-base font-semibold tracking-wide transition-all relative",
                  mainTab === 'CİHAZLAR' ? "text-white" : "text-slate-500 hover:text-slate-300"
                )}
              >
                CİHAZLAR
                {mainTab === 'CİHAZLAR' && (
                  <span className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></span>
                )}
              </button>
              <button
                onClick={() => setMainTab('AKSESUARLAR')}
                className={cn(
                  "pb-4 text-sm md:text-base font-semibold tracking-wide transition-all relative",
                  mainTab === 'AKSESUARLAR' ? "text-white" : "text-slate-500 hover:text-slate-300"
                )}
              >
                AKSESUARLAR
                {mainTab === 'AKSESUARLAR' && (
                  <span className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></span>
                )}
              </button>
            </div>
          </div>

          {/* Horizontal Pill Categories */}
          <div className="flex items-center w-full overflow-x-auto pb-4 scrollbar-hide">
            <div className="flex gap-3">
              {categories.map(category => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={cn(
                    "px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all border",
                    selectedCategory === category
                      ? "bg-blue-900/40 text-blue-400 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-600 hover:text-slate-200"
                  )}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : filteredProducts.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-20 min-h-[300px]">
               <span className="text-slate-500 text-sm font-light text-center">
                 Bu alanda henüz ürün bulunmuyor.
               </span>
             </div>
          ) : (
            <div className="flex-1 flex flex-col">
              {/* Native App 2-column mobile grid, 6-column desktop grid for compactness */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-5">
                {currentProducts.map((product) => (
                  <Card 
                    key={product.id} 
                    className="group flex flex-col bg-slate-900/60 border border-slate-800/80 hover:bg-slate-900 rounded-2xl overflow-hidden transition-all duration-500 hover:border-blue-500/30 hover:shadow-[0_0_25px_rgba(37,99,235,0.15)]"
                  >
                    {/* Visual Area strictly relying on real image or brand-text placeholder */}
                    <div className="aspect-square relative bg-[#0B101A] flex items-center justify-center overflow-hidden border-b border-slate-800/50 p-4">
                      {/* Edit Button */}
                      <button 
                        onClick={(e) => handleEditPrice(e, product)}
                        className="absolute top-2 left-2 z-30 text-white/40 hover:text-white bg-slate-900/80 p-1.5 rounded-full backdrop-blur-md transition-colors opacity-0 group-hover:opacity-100"
                        title="Fiyatı Düzenle"
                      >
                        <Edit3 size={14} />
                      </button>

                      {/* Top Bar for OS Icon */}
                      <div className="absolute top-2 right-2 z-20">
                        {isDeviceCategory(product.category) && getOSIcon(product.name)}
                      </div>

                      {product.image_url ? (
                        <img 
                          src={product.image_url} 
                          alt={product.name}
                          className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105"
                        />
                      ) : (
                        // Sleek Minimalist Placeholder when no real image exists
                        <div className="flex flex-col items-center justify-center p-4 text-center opacity-30 group-hover:opacity-60 transition-opacity duration-500">
                          <span className="text-4xl font-light tracking-widest uppercase mb-1">
                            {product.brand ? product.brand.charAt(0) : 'H'}
                          </span>
                          <span className="text-[9px] font-medium tracking-[0.2em] uppercase">
                            {product.brand || 'HURCELL'}
                          </span>
                        </div>
                      )}

                      {/* Dynamic Discount Badge */}
                      {product.discount_rate && product.discount_rate > 0 && (
                        <div className="absolute bottom-2 left-2 z-30 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-sm flex items-center gap-1">
                          -%{product.discount_rate}
                        </div>
                      )}
                    </div>

                    {/* Content Area */}
                    <CardContent className="p-3 md:p-4 flex flex-col flex-1">
                      <div className="mb-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                        {product.brand || 'PREMIUM'}
                      </div>
                      
                      <h3 className="font-medium text-slate-200 text-xs mb-3 line-clamp-2 leading-snug flex-1">
                        {product.name}
                      </h3>
                      
                      <div className="flex flex-col mt-auto mb-3">
                        {product.old_price && (
                          <span className="text-[10px] text-slate-600 line-through mb-0.5 font-light">
                            {formatRetailPrice(product.old_price)}
                          </span>
                        )}
                        <span className="text-sm font-bold text-blue-400 tracking-tight">
                          {formatRetailPrice(product.price)}
                        </span>
                      </div>

                      {/* Prominent Add to Cart Button */}
                      <button className="w-full bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white border border-blue-600/30 hover:border-transparent py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-300">
                        <ShoppingCart size={14} /> Sepete Ekle
                      </button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Load More Button */}
              {visibleCount < filteredProducts.length && (
                <div className="mt-12 mb-8 flex justify-center items-center">
                  <button
                    onClick={() => setVisibleCount(prev => prev + 18)}
                    className="group flex items-center gap-2 px-6 py-2.5 bg-slate-900 border border-slate-800 hover:border-slate-600 text-slate-300 text-xs font-semibold rounded-full transition-all duration-300 shadow-sm hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                  >
                    Daha Fazla Yükle
                    <Plus size={14} className="group-hover:rotate-90 transition-transform duration-300" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile App Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 w-full bg-[#050B14]/90 backdrop-blur-xl border-t border-slate-800/80 flex justify-around items-center h-[68px] md:hidden z-50 pb-safe">
         <button className="flex flex-col items-center gap-1 text-blue-500 w-full py-2">
            <Home size={20} className="stroke-[2px]" /> 
            <span className="text-[9px] font-semibold uppercase tracking-wider">Mağaza</span>
         </button>
         <button className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 w-full py-2 transition-colors">
            <Search size={20} className="stroke-[2px]" /> 
            <span className="text-[9px] font-semibold uppercase tracking-wider">Keşfet</span>
         </button>
         <button className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 w-full py-2 transition-colors relative">
            <ShoppingCart size={20} className="stroke-[2px]" /> 
            <span className="text-[9px] font-semibold uppercase tracking-wider">Sepet</span>
         </button>
         <button className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 w-full py-2 transition-colors">
            <User size={20} className="stroke-[2px]" /> 
            <span className="text-[9px] font-semibold uppercase tracking-wider">Profil</span>
         </button>
      </div>
    </div>
  )
}
