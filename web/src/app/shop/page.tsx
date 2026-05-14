'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, ShoppingCart, Zap, Apple, Smartphone, Edit3, ChevronDown, Plus, Home, Search, User, Sparkles, Headphones, Laptop } from 'lucide-react'
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
  const retailPrice = Math.floor(ceilPrice / 10) * 10 + 9;
  
  const formatter = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  return `${formatter.format(retailPrice)} TL`;
};

const getStockImage = (category: string | null) => {
  if (!category) return "https://images.unsplash.com/photo-1531297172868-9f140ec02882?w=400&q=80";
  const cat = category.toLowerCase();
  if (cat.includes('telefon')) return "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&q=80";
  if (cat.includes('tablet')) return "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400&q=80";
  if (cat.includes('mac') || cat.includes('laptop') || cat.includes('bilgisayar')) return "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&q=80";
  if (cat.includes('kulaklık') || cat.includes('ses')) return "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80";
  if (cat.includes('şarj') || cat.includes('powerbank')) return "https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?w=400&q=80";
  if (cat.includes('kablo') || cat.includes('bağlantı')) return "https://images.unsplash.com/photo-1616423640778-28d1b53229bd?w=400&q=80";
  return "https://images.unsplash.com/photo-1531297172868-9f140ec02882?w=400&q=80"; // Tech placeholder
}

const isDeviceCategory = (cat: string | null) => {
  if (!cat) return false;
  const c = cat.toLowerCase();
  return c.includes('telefon') || c.includes('tablet') || c.includes('sıfır') || c.includes('yenilenmiş') || c.includes('teşhir') || c.includes('cihaz') || c.includes('macbook');
}

const getOSIcon = (name: string) => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('iphone') || lowerName.includes('ipad') || lowerName.includes('macbook') || lowerName.includes('apple')) {
    return <Apple className="w-3.5 h-3.5 text-slate-100 drop-shadow-md" />;
  } else if (lowerName.includes('samsung') || lowerName.includes('xiaomi') || lowerName.includes('android') || lowerName.includes('redmi') || lowerName.includes('poco') || lowerName.includes('huawei')) {
    return <Smartphone className="w-3.5 h-3.5 text-slate-100 drop-shadow-md" />;
  }
  return null;
}

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  
  // App Architecture State
  const [mainTab, setMainTab] = useState<'CİHAZLAR' | 'AKSESUARLAR'>('CİHAZLAR')
  
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü')
  const [selectedBrand, setSelectedBrand] = useState<string>('Tümü')
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)

  // Load More Pagination State
  const [visibleCount, setVisibleCount] = useState(12);

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

  // Derived Data
  const categories = useMemo(() => {
    const cats = new Set(tabProducts.map(p => p.category).filter(Boolean) as string[]);
    return ['Tümü', ...Array.from(cats)];
  }, [tabProducts]);

  const brands = useMemo(() => {
    const brs = new Set(tabProducts.map(p => p.brand).filter(Boolean) as string[]);
    return ['Tümü', ...Array.from(brs).sort()];
  }, [tabProducts]);

  // 2. Filter by Sub-category and Brand
  const filteredProducts = useMemo(() => {
    return tabProducts.filter(p => {
      const matchCategory = selectedCategory === 'Tümü' || p.category === selectedCategory;
      const matchBrand = selectedBrand === 'Tümü' || p.brand === selectedBrand;
      return matchCategory && matchBrand;
    });
  }, [tabProducts, selectedCategory, selectedBrand]);

  // Reset page and sub-filters on main tab change
  useEffect(() => {
    setVisibleCount(12);
    setSelectedCategory('Tümü');
    setSelectedBrand('Tümü');
  }, [mainTab]);

  // Reset page on sub-filter change
  useEffect(() => {
    setVisibleCount(12);
  }, [selectedCategory, selectedBrand]);

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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-20 md:pb-0 relative overflow-hidden">
      <style>{`
        @keyframes custom-marquee {
          0% { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
        .animate-custom-marquee {
          display: inline-block;
          white-space: nowrap;
          animation: custom-marquee 25s linear infinite;
        }
      `}</style>

      {/* Radiant Glow Background Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[300px] bg-blue-600/20 blur-[150px] rounded-full pointer-events-none z-0"></div>

      {/* Hero Campaign Slider (Işıltılı) */}
      <div className="w-full bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-700 text-white overflow-hidden py-2 relative flex items-center z-50">
        <div className="animate-custom-marquee flex gap-12 items-center w-full">
          <span className="text-xs md:text-sm font-semibold tracking-wide flex items-center gap-2">
            <Sparkles size={14} className="text-yellow-300" /> CİHAZLARDA DEV İNDİRİMLER BAŞLADI
          </span>
          <span className="text-xs md:text-sm font-semibold tracking-wide flex items-center gap-2">
            <Zap size={14} className="text-yellow-300" /> MCDODO ŞARJ KABLOLARINDA 2 AL 1 ÖDE
          </span>
          <span className="text-xs md:text-sm font-semibold tracking-wide flex items-center gap-2">
            <Headphones size={14} className="text-yellow-300" /> PREMIUM SES DENEYİMİ İÇİN TIKLAYIN
          </span>
          <span className="text-xs md:text-sm font-semibold tracking-wide flex items-center gap-2">
            <Sparkles size={14} className="text-yellow-300" /> CİHAZLARDA DEV İNDİRİMLER BAŞLADI
          </span>
        </div>
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-4 md:px-8 pt-8 md:pt-12 flex flex-col md:flex-row gap-8">
        
        {/* Main Content Area */}
        <div className="flex-1 min-w-0 flex flex-col w-full">
          
          {/* Main Hero Group Buttons */}
          <div className="grid grid-cols-2 gap-4 mb-10 max-w-2xl mx-auto w-full">
            <button 
              onClick={() => setMainTab('CİHAZLAR')}
              className={cn(
                "relative overflow-hidden flex flex-col items-center justify-center p-6 md:p-8 rounded-2xl transition-all duration-300 border",
                mainTab === 'CİHAZLAR' 
                  ? "bg-gradient-to-br from-blue-600 to-indigo-800 border-blue-400 shadow-[0_0_30px_rgba(37,99,235,0.3)] text-white scale-[1.02]" 
                  : "bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800 hover:border-slate-700 hover:text-white"
              )}
            >
              <Smartphone size={32} className="mb-3" />
              <span className="font-bold tracking-widest text-sm md:text-base">CİHAZLAR</span>
              {mainTab === 'CİHAZLAR' && <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity"></div>}
            </button>
            <button 
              onClick={() => setMainTab('AKSESUARLAR')}
              className={cn(
                "relative overflow-hidden flex flex-col items-center justify-center p-6 md:p-8 rounded-2xl transition-all duration-300 border",
                mainTab === 'AKSESUARLAR' 
                  ? "bg-gradient-to-br from-indigo-600 to-purple-800 border-purple-400 shadow-[0_0_30px_rgba(79,70,229,0.3)] text-white scale-[1.02]" 
                  : "bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800 hover:border-slate-700 hover:text-white"
              )}
            >
              <Headphones size={32} className="mb-3" />
              <span className="font-bold tracking-widest text-sm md:text-base">AKSESUARLAR</span>
              {mainTab === 'AKSESUARLAR' && <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity"></div>}
            </button>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row gap-4 mb-8 items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-slate-800 backdrop-blur-md">
            
            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-widest mr-2 flex-shrink-0">KATEGORİ:</span>
              <div className="flex gap-2">
                {categories.map(category => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap",
                      selectedCategory === category
                        ? "bg-blue-500 text-white shadow-[0_4px_12px_rgba(59,130,246,0.3)]"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    )}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative z-20 w-full md:w-48 mt-2 md:mt-0">
               <button 
                  onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 transition-colors text-xs font-bold text-slate-200"
               >
                 <span>MARKA: <span className="text-blue-400 ml-1">{selectedBrand}</span></span>
                 <ChevronDown size={14} className={cn("transition-transform text-slate-400", categoryDropdownOpen ? "rotate-180" : "")} />
               </button>

               {categoryDropdownOpen && (
                 <div className="absolute top-full right-0 mt-2 w-full border border-slate-700 rounded-lg bg-slate-800 shadow-2xl overflow-hidden z-50 max-h-60 overflow-y-auto">
                    {brands.map(brand => (
                      <button
                        key={brand}
                        onClick={() => {
                          setSelectedBrand(brand);
                          setCategoryDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-4 py-3 text-xs font-semibold transition-colors border-b border-slate-700/50 last:border-0",
                          selectedBrand === brand
                            ? "bg-slate-700 text-blue-400"
                            : "text-slate-300 hover:bg-slate-700 hover:text-white"
                        )}
                      >
                        {brand}
                      </button>
                    ))}
                 </div>
               )}
            </div>
          </div>

          {/* Product Grid */}
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : filteredProducts.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-20 min-h-[300px] border border-slate-800 rounded-2xl bg-slate-900/50">
               <span className="text-slate-400 text-sm font-semibold uppercase tracking-widest text-center">
                 Bu filtrede ürün bulunamadı.
               </span>
             </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {currentProducts.map((product) => (
                  <Card 
                    key={product.id} 
                    className="group flex flex-col bg-slate-900 border-slate-800 hover:border-slate-600 rounded-2xl overflow-hidden transition-all duration-300 shadow-lg hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
                  >
                    {/* Visual Area with Real Image or Stock */}
                    <div className="aspect-[4/5] relative bg-slate-800 overflow-hidden">
                      {/* Edit Button */}
                      <button 
                        onClick={(e) => handleEditPrice(e, product)}
                        className="absolute top-2 left-2 z-30 text-white/50 hover:text-white bg-black/40 p-1.5 rounded-full backdrop-blur-md transition-colors opacity-0 group-hover:opacity-100"
                        title="Fiyatı Düzenle"
                      >
                        <Edit3 size={14} />
                      </button>

                      {/* Top Bar for OS Icon */}
                      <div className="absolute top-3 right-3 z-20">
                        {isDeviceCategory(product.category) && getOSIcon(product.name)}
                      </div>

                      {/* Image */}
                      <img 
                        src={product.image_url || getStockImage(product.category)} 
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                      
                      {/* Gradient Overlay for better text readability if we put text, or just aesthetic */}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-80"></div>

                      {/* Dynamic Discount Badge */}
                      {product.discount_rate && product.discount_rate > 0 && (
                        <div className="absolute bottom-3 left-3 z-30 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-lg flex items-center gap-1">
                          <Zap size={12} fill="currentColor" /> -%{product.discount_rate}
                        </div>
                      )}
                    </div>

                    {/* Content Area */}
                    <CardContent className="p-4 flex flex-col flex-1">
                      <div className="mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {product.brand || 'PREMIUM'}
                      </div>
                      
                      <h3 className="font-semibold text-slate-100 text-sm mb-4 line-clamp-2 leading-snug flex-1">
                        {product.name}
                      </h3>
                      
                      <div className="flex flex-col mb-4">
                        {product.old_price && (
                          <span className="text-xs text-slate-500 line-through mb-0.5 font-medium">
                            {formatRetailPrice(product.old_price)}
                          </span>
                        )}
                        <span className="text-lg font-bold text-blue-400 tracking-tight">
                          {formatRetailPrice(product.price)}
                        </span>
                      </div>

                      {/* Big App-Like Add to Cart Button */}
                      <button className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors active:scale-[0.98] shadow-[0_4px_14px_rgba(37,99,235,0.4)]">
                        <ShoppingCart size={18} /> SEPETE EKLE
                      </button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Load More Button */}
              {visibleCount < filteredProducts.length && (
                <div className="mt-12 mb-8 flex justify-center items-center">
                  <button
                    onClick={() => setVisibleCount(prev => prev + 12)}
                    className="group flex items-center gap-2 px-8 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 text-white text-sm font-bold rounded-xl transition-all duration-300 shadow-md"
                  >
                    Daha Fazla Göster
                    <Plus size={16} className="group-hover:rotate-90 transition-transform duration-300" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile App Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 w-full bg-slate-950/90 backdrop-blur-xl border-t border-slate-800 flex justify-around items-center h-16 md:hidden z-50 pb-safe">
         <button className="flex flex-col items-center gap-1 text-blue-500 w-full py-2">
            <Home size={22} className="stroke-[2.5px]" /> 
            <span className="text-[10px] font-bold">Mağaza</span>
         </button>
         <button className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 w-full py-2 transition-colors">
            <Search size={22} /> 
            <span className="text-[10px] font-semibold">Keşfet</span>
         </button>
         <button className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 w-full py-2 transition-colors relative">
            <ShoppingCart size={22} /> 
            <span className="text-[10px] font-semibold">Sepet</span>
            <span className="absolute top-1 right-[25%] bg-blue-600 text-white rounded-full w-4 h-4 text-[9px] font-bold flex items-center justify-center border-2 border-slate-950">0</span>
         </button>
         <button className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 w-full py-2 transition-colors">
            <User size={22} /> 
            <span className="text-[10px] font-semibold">Profil</span>
         </button>
      </div>
    </div>
  )
}
