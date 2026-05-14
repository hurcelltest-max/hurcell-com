'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, ShoppingCart, Apple, Smartphone, Edit3, ChevronDown, Plus, Home, Search, User, ChevronRight } from 'lucide-react'
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

const isDeviceCategory = (cat: string | null) => {
  if (!cat) return false;
  const c = cat.toLowerCase();
  return c.includes('telefon') || c.includes('tablet') || c.includes('sıfır') || c.includes('yenilenmiş') || c.includes('teşhir') || c.includes('cihaz') || c.includes('macbook');
}

const getOSIcon = (name: string) => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('iphone') || lowerName.includes('ipad') || lowerName.includes('macbook') || lowerName.includes('apple')) {
    return <Apple className="w-3.5 h-3.5 text-slate-100" />;
  } else if (lowerName.includes('samsung') || lowerName.includes('xiaomi') || lowerName.includes('android') || lowerName.includes('redmi') || lowerName.includes('poco') || lowerName.includes('huawei')) {
    return <Smartphone className="w-3.5 h-3.5 text-slate-100" />;
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
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 md:pb-0 relative overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        .font-inter { font-family: 'Inter', sans-serif; }
      `}</style>

      {/* Set entire app to Inter */}
      <div className="font-inter">
        
        {/* Apple-Style Static Hero Section */}
        <div className="w-full bg-[#0a0a0a] border-b border-slate-900 pt-28 pb-16 flex flex-col items-center justify-center text-center px-4 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-600/10 blur-[100px] pointer-events-none rounded-full"></div>
          
          <h1 className="text-3xl md:text-5xl font-semibold text-white tracking-tight mb-4 z-10">
            Premium Deneyim. <br className="md:hidden" />
            <span className="text-slate-400">Şimdi Sizinle.</span>
          </h1>
          <p className="text-slate-400 text-sm md:text-base font-light max-w-lg mb-8 z-10">
            En yeni akıllı cihazlar ve HurCELL kalitesine sahip orijinal aksesuarları keşfedin.
          </p>
          <div className="flex gap-4 z-10">
            <button className="bg-white text-black px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-slate-200 transition-colors">
              Hemen Al
            </button>
            <button className="text-blue-500 text-sm font-medium hover:underline flex items-center gap-1">
              Daha Fazla Bilgi <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto px-4 md:px-8 pt-8 md:pt-12 flex flex-col gap-8">
          
          {/* Main Division Tabs (Cihazlar / Aksesuarlar) */}
          <div className="flex justify-center border-b border-slate-800 pb-px mb-8">
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
                  <span className="absolute bottom-0 left-0 w-full h-[2px] bg-white"></span>
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
                  <span className="absolute bottom-0 left-0 w-full h-[2px] bg-white"></span>
                )}
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row gap-4 mb-8 items-center justify-between">
            
            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
              <div className="flex gap-2">
                {categories.map(category => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap border",
                      selectedCategory === category
                        ? "bg-white text-black border-white"
                        : "bg-transparent text-slate-300 border-slate-700 hover:border-slate-500"
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
                  className="w-full flex items-center justify-between gap-4 px-4 py-2 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800 transition-colors text-xs font-medium text-slate-300"
               >
                 <span>Marka: <span className="text-white ml-1">{selectedBrand}</span></span>
                 <ChevronDown size={14} className={cn("transition-transform text-slate-500", categoryDropdownOpen ? "rotate-180" : "")} />
               </button>

               {categoryDropdownOpen && (
                 <div className="absolute top-full right-0 mt-2 w-full border border-slate-800 rounded-xl bg-slate-900 shadow-2xl overflow-hidden z-50 max-h-60 overflow-y-auto">
                    {brands.map(brand => (
                      <button
                        key={brand}
                        onClick={() => {
                          setSelectedBrand(brand);
                          setCategoryDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-4 py-3 text-xs font-medium transition-colors border-b border-slate-800 last:border-0",
                          selectedBrand === brand
                            ? "bg-slate-800 text-white"
                            : "text-slate-400 hover:bg-slate-800 hover:text-white"
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
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : filteredProducts.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-20 min-h-[300px]">
               <span className="text-slate-500 text-sm font-light text-center">
                 Bu alanda henüz ürün bulunmuyor.
               </span>
             </div>
          ) : (
            <div className="flex-1 flex flex-col">
              {/* Native App 2-column mobile grid, 4-column desktop */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
                {currentProducts.map((product) => (
                  <Card 
                    key={product.id} 
                    className="group flex flex-col bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden transition-all duration-300 shadow-none hover:shadow-xl"
                  >
                    {/* Visual Area strictly relying on real image or brand-text placeholder */}
                    <div className="aspect-square relative bg-[#0a0a0a] flex items-center justify-center overflow-hidden border-b border-slate-800/50">
                      {/* Edit Button */}
                      <button 
                        onClick={(e) => handleEditPrice(e, product)}
                        className="absolute top-2 left-2 z-30 text-white/40 hover:text-white bg-slate-900/80 p-1.5 rounded-full backdrop-blur-md transition-colors opacity-0 group-hover:opacity-100"
                        title="Fiyatı Düzenle"
                      >
                        <Edit3 size={14} />
                      </button>

                      {/* Top Bar for OS Icon */}
                      <div className="absolute top-3 right-3 z-20">
                        {isDeviceCategory(product.category) && getOSIcon(product.name)}
                      </div>

                      {product.image_url ? (
                        <img 
                          src={product.image_url} 
                          alt={product.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                      ) : (
                        // Sleek Minimalist Placeholder when no real image exists
                        <div className="flex flex-col items-center justify-center p-4 text-center opacity-40">
                          <span className="text-3xl font-light tracking-widest uppercase mb-1">
                            {product.brand ? product.brand.charAt(0) : 'H'}
                          </span>
                          <span className="text-[10px] font-medium tracking-[0.2em] uppercase">
                            {product.brand || 'HURCELL'}
                          </span>
                        </div>
                      )}

                      {/* Dynamic Discount Badge */}
                      {product.discount_rate && product.discount_rate > 0 && (
                        <div className="absolute bottom-2 left-2 z-30 bg-white text-black text-[10px] font-semibold px-2 py-0.5 rounded-md shadow-sm flex items-center gap-1">
                          -%{product.discount_rate}
                        </div>
                      )}
                    </div>

                    {/* Content Area */}
                    <CardContent className="p-3 md:p-4 flex flex-col flex-1">
                      <div className="mb-1 text-[9px] font-semibold text-slate-500 uppercase tracking-widest">
                        {product.brand || 'PREMIUM'}
                      </div>
                      
                      <h3 className="font-medium text-slate-200 text-xs md:text-sm mb-4 line-clamp-2 leading-snug flex-1">
                        {product.name}
                      </h3>
                      
                      <div className="flex items-end justify-between mt-auto">
                        <div className="flex flex-col">
                          {product.old_price && (
                            <span className="text-[10px] text-slate-600 line-through mb-0.5 font-light">
                              {formatRetailPrice(product.old_price)}
                            </span>
                          )}
                          <span className="text-sm md:text-base font-semibold text-white tracking-tight">
                            {formatRetailPrice(product.price)}
                          </span>
                        </div>
                        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-white hover:bg-white hover:text-black transition-colors">
                          <ShoppingCart size={14} />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Load More Button */}
              {visibleCount < filteredProducts.length && (
                <div className="mt-12 mb-8 flex justify-center items-center">
                  <button
                    onClick={() => setVisibleCount(prev => prev + 12)}
                    className="group flex items-center gap-2 px-6 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-full transition-all duration-300"
                  >
                    Daha Fazla
                    <Plus size={14} className="group-hover:rotate-90 transition-transform duration-300" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile App Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 w-full bg-slate-950/80 backdrop-blur-2xl border-t border-slate-900 flex justify-around items-center h-[68px] md:hidden z-50 pb-safe">
         <button className="flex flex-col items-center gap-1 text-white w-full py-2">
            <Home size={22} className="stroke-[1.5px]" /> 
            <span className="text-[10px] font-medium">Mağaza</span>
         </button>
         <button className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 w-full py-2 transition-colors">
            <Search size={22} className="stroke-[1.5px]" /> 
            <span className="text-[10px] font-medium">Keşfet</span>
         </button>
         <button className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 w-full py-2 transition-colors relative">
            <ShoppingCart size={22} className="stroke-[1.5px]" /> 
            <span className="text-[10px] font-medium">Sepet</span>
         </button>
         <button className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 w-full py-2 transition-colors">
            <User size={22} className="stroke-[1.5px]" /> 
            <span className="text-[10px] font-medium">Profil</span>
         </button>
      </div>
    </div>
  )
}
