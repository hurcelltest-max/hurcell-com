'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, ShoppingCart, Zap, BatteryCharging, Cable, ShieldCheck, Headphones, Battery, Filter, Apple, Smartphone, Edit3, ChevronDown, PackageOpen, Plus } from 'lucide-react'
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

const getCategoryLargeIcon = (category: string | null) => {
  if (!category) return <Zap className="w-16 h-16 text-white/5" strokeWidth={1} />;
  const cat = category.toLowerCase();
  if (cat.includes('şarj')) return <BatteryCharging className="w-16 h-16 text-white/5" strokeWidth={1} />;
  if (cat.includes('bağlantı') || cat.includes('kablo')) return <Cable className="w-16 h-16 text-white/5" strokeWidth={1} />;
  if (cat.includes('koruma') || cat.includes('aksesuar')) return <ShieldCheck className="w-16 h-16 text-white/5" strokeWidth={1} />;
  if (cat.includes('ses') || cat.includes('görüntü')) return <Headphones className="w-16 h-16 text-white/5" strokeWidth={1} />;
  if (cat.includes('enerji') || cat.includes('powerbank')) return <Battery className="w-16 h-16 text-white/5" strokeWidth={1} />;
  return <Zap className="w-16 h-16 text-white/5" strokeWidth={1} />;
}

const isDeviceCategory = (cat: string | null) => {
  if (!cat) return false;
  const c = cat.toLowerCase();
  return c.includes('telefon') || c.includes('tablet') || c.includes('sıfır') || c.includes('yenilenmiş') || c.includes('teşhir') || c.includes('cihaz');
}

const getOSIcon = (name: string) => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('iphone') || lowerName.includes('ipad') || lowerName.includes('macbook') || lowerName.includes('apple')) {
    return <Apple className="w-3.5 h-3.5 text-white/30" />;
  } else if (lowerName.includes('samsung') || lowerName.includes('xiaomi') || lowerName.includes('android') || lowerName.includes('redmi') || lowerName.includes('poco') || lowerName.includes('huawei')) {
    return <Smartphone className="w-3.5 h-3.5 text-white/30" />;
  }
  return null;
}

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  
  // High-End Void Theme State
  const [mainTab, setMainTab] = useState<'CİHAZLAR' | 'AKSESUARLAR'>('AKSESUARLAR')
  
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü')
  const [selectedBrand, setSelectedBrand] = useState<string>('Tümü')
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)

  // Load More Pagination State
  const [visibleCount, setVisibleCount] = useState(18); // 3 rows of 6

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

  // 1. Filter by Main Tab (Devices vs Accessories)
  const tabProducts = useMemo(() => {
    return products.filter(p => mainTab === 'CİHAZLAR' ? isDeviceCategory(p.category) : !isDeviceCategory(p.category));
  }, [products, mainTab]);

  // Derived Data strictly for the active Main Tab
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
    setVisibleCount(18);
    setSelectedCategory('Tümü');
    setSelectedBrand('Tümü');
  }, [mainTab]);

  // Reset page on sub-filter change
  useEffect(() => {
    setVisibleCount(18);
  }, [selectedCategory, selectedBrand]);

  const currentProducts = filteredProducts.slice(0, visibleCount);

  const handleEditPrice = async (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
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
    <div className="min-h-screen bg-[#050505] text-white relative font-sans">
      {/* The Void Gradient Background */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none z-0"></div>

      <div className="relative z-10 pt-28 pb-20 px-4 md:px-8 max-w-[1600px] mx-auto flex flex-col md:flex-row gap-10">
        
        {/* Sidebar - Brands (Golden Concept Style) */}
        <aside className={cn(
          "w-full md:w-56 flex-shrink-0 flex flex-col space-y-6 transition-all duration-300",
          "md:block", 
          mobileFilterOpen ? "block" : "hidden"
        )}>
          <div className="sticky top-32 mt-2">
            <h2 className="text-[10px] font-medium text-white/30 uppercase mb-6 tracking-[0.2em] pl-2 border-b border-white/5 pb-2">
              KOLLEKSİYON
            </h2>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {brands.map(brand => (
                <button
                  key={brand}
                  onClick={() => {
                    setSelectedBrand(brand);
                    setMobileFilterOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-2 py-2 text-[11px] font-light tracking-wide transition-all duration-500 rounded",
                    selectedBrand === brand 
                      ? "text-blue-400 translate-x-2" 
                      : "text-white/40 hover:text-white/80 hover:translate-x-1"
                  )}
                >
                  {brand}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0 flex flex-col">
          
          {/* Gallery Header */}
          <div className="flex flex-col gap-8 mb-10">
            <div className="flex justify-between items-end">
              <div className="flex items-center gap-3">
                <span className="text-white/30 text-[10px] uppercase tracking-[0.2em]">Galeri</span>
                <span className="text-white/10 text-xs">/</span>
                <span className="text-white/30 text-[10px] uppercase tracking-[0.2em]">{filteredProducts.length} Donanım</span>
              </div>
              <div className="flex gap-2">
                <button 
                  className="md:hidden flex items-center gap-2 px-4 py-2 rounded border border-white/10 text-xs text-white/50 hover:text-white transition-colors bg-white/5"
                  onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
                >
                  <Filter size={14} /> Keşfet
                </button>
              </div>
            </div>

            {/* Main Division Tabs (Devices / Accessories) */}
            <div className="flex gap-10 border-b border-white/5 pb-2">
              <button
                onClick={() => setMainTab('CİHAZLAR')}
                className={cn(
                  "pb-3 text-xs md:text-sm font-light tracking-[0.15em] uppercase transition-all duration-500 relative",
                  mainTab === 'CİHAZLAR' ? "text-white" : "text-white/30 hover:text-white/60"
                )}
              >
                CİHAZLAR
                {mainTab === 'CİHAZLAR' && (
                  <span className="absolute bottom-[-2px] left-0 w-full h-[1px] bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></span>
                )}
              </button>
              <button
                onClick={() => setMainTab('AKSESUARLAR')}
                className={cn(
                  "pb-3 text-xs md:text-sm font-light tracking-[0.15em] uppercase transition-all duration-500 relative",
                  mainTab === 'AKSESUARLAR' ? "text-white" : "text-white/30 hover:text-white/60"
                )}
              >
                AKSESUARLAR
                {mainTab === 'AKSESUARLAR' && (
                  <span className="absolute bottom-[-2px] left-0 w-full h-[1px] bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></span>
                )}
              </button>
            </div>

            {/* Category Dropdown Filter */}
            <div className="relative z-20 w-full md:w-64">
               <button 
                  onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3 border-b border-white/10 bg-transparent hover:bg-white/[0.02] transition-colors text-[11px] font-light tracking-widest text-white/50"
               >
                 <span>SERİ: <span className="text-white font-normal ml-2">{selectedCategory}</span></span>
                 <ChevronDown size={14} className={cn("transition-transform text-white/30", categoryDropdownOpen ? "rotate-180" : "")} />
               </button>

               {categoryDropdownOpen && (
                 <div className="absolute top-full left-0 mt-2 w-full border border-white/5 bg-[#0a0a0a] shadow-2xl backdrop-blur-xl overflow-hidden z-50">
                    {categories.map(category => (
                      <button
                        key={category}
                        onClick={() => {
                          setSelectedCategory(category);
                          setCategoryDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-5 py-3 text-[11px] tracking-widest transition-colors border-b border-white/5 last:border-0",
                          selectedCategory === category
                            ? "bg-white/5 text-blue-400"
                            : "text-white/40 hover:bg-white/[0.02] hover:text-white"
                        )}
                      >
                        {category}
                      </button>
                    ))}
                 </div>
               )}
            </div>
          </div>

          {/* Product Gallery Grid */}
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-6 w-6 animate-spin text-white/20" />
            </div>
          ) : tabProducts.length === 0 && mainTab === 'CİHAZLAR' ? (
            <div className="flex flex-col items-center justify-center py-32 min-h-[400px] border border-white/5 bg-white/[0.01]">
              <PackageOpen className="w-12 h-12 text-white/10 mb-6" strokeWidth={1} />
              <h3 className="text-white/60 text-xs font-light mb-2 tracking-[0.2em] uppercase text-center">
                YAKINDA SİZLERLE
              </h3>
              <p className="text-white/20 text-[11px] max-w-sm text-center px-4 tracking-widest leading-relaxed">
                Bu koleksiyon çok yakında özel cihazlarla güncellenecektir.
              </p>
            </div>
          ) : filteredProducts.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-32 min-h-[400px] border border-white/5 bg-white/[0.01]">
               <p className="text-white/20 text-[10px] font-light uppercase tracking-[0.2em] text-center">
                 Bu filtrede ürün bulunamadı.
               </p>
             </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-y-10 gap-x-6">
                {currentProducts.map((product) => (
                  <div 
                    key={product.id} 
                    className="group relative bg-transparent border-0 flex flex-col h-full cursor-pointer"
                  >
                    {/* Floating Neon Ring Hover Effect */}
                    <div className="absolute -inset-3 rounded-lg border border-transparent group-hover:border-blue-500/20 group-hover:bg-white/[0.02] group-hover:shadow-[0_0_20px_rgba(59,130,246,0.05)] transition-all duration-700 z-0 pointer-events-none"></div>

                    {/* Dynamic Discount Badge */}
                    {product.discount_rate && product.discount_rate > 0 && (
                      <div className="absolute top-0 right-0 z-30 text-blue-400 text-[9px] font-light px-2 py-1 tracking-widest border border-blue-400/20 rounded-bl bg-[#050505]">
                        -%{product.discount_rate}
                      </div>
                    )}

                    {/* Minimalist Edit Button */}
                    <button 
                      onClick={(e) => handleEditPrice(e, product)}
                      className="absolute top-0 left-0 z-30 text-white/20 hover:text-white p-1.5 transition-colors opacity-0 group-hover:opacity-100"
                      title="Fiyatı Düzenle"
                    >
                      <Edit3 size={10} />
                    </button>

                    {/* The Void Visual Area (Aspect Square) */}
                    <div className="aspect-square relative flex flex-col justify-center items-center bg-white/[0.02] rounded-sm overflow-hidden mb-4 z-10">
                      {/* Elegant Fade-in Effect Container */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-40 group-hover:opacity-100 transition-opacity duration-1000 mix-blend-overlay"></div>
                      
                      {/* Top Bar for Brand & OS */}
                      <div className="absolute top-2 left-2 right-2 flex justify-between items-start z-20">
                        <span className="text-[8px] font-light text-white/30 uppercase tracking-[0.2em]">
                          {product.brand || ''}
                        </span>
                        {isDeviceCategory(product.category) && getOSIcon(product.name)}
                      </div>
                      
                      {/* Subtle Placeholder Icon */}
                      <div className="relative z-10 flex items-center justify-center transition-transform duration-1000 group-hover:scale-110 opacity-50 group-hover:opacity-100">
                        {getCategoryLargeIcon(product.category)}
                      </div>
                    </div>

                    {/* Typography Area - Golden Concept Vibe */}
                    <div className="flex flex-col flex-1 z-10 px-1">
                      <h3 className="font-light text-white/70 text-[11px] mb-4 line-clamp-2 leading-relaxed tracking-wide group-hover:text-white transition-colors">
                        {product.name}
                      </h3>
                      
                      <div className="flex items-end justify-between mt-auto">
                        <div className="flex flex-col">
                          {product.old_price && (
                            <span className="text-[9px] text-white/20 line-through mb-[2px] font-light">
                              {formatRetailPrice(product.old_price)}
                            </span>
                          )}
                          <span className="text-[12px] font-light tracking-widest text-blue-400">
                            {formatRetailPrice(product.price)}
                          </span>
                        </div>
                        <button className="w-6 h-6 flex items-center justify-center text-white/20 hover:text-blue-400 transition-colors">
                          <ShoppingCart size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Luxury 'Load More' Button */}
              {visibleCount < filteredProducts.length && (
                <div className="mt-20 flex justify-center items-center">
                  <button
                    onClick={() => setVisibleCount(prev => prev + 18)}
                    className="group flex items-center gap-3 px-8 py-3 bg-transparent border border-white/10 hover:border-blue-500/50 text-white/40 hover:text-white text-[10px] uppercase tracking-[0.2em] font-light transition-all duration-500"
                  >
                    Daha Fazla Keşfet
                    <Plus size={12} className="group-hover:rotate-90 transition-transform duration-500" />
                  </button>
                </div>
              )}
              
              {/* End of Gallery */}
              {visibleCount >= filteredProducts.length && filteredProducts.length > 0 && (
                <div className="mt-20 flex justify-center items-center">
                  <span className="text-white/10 text-[9px] uppercase tracking-[0.3em] font-light">
                    Koleksiyonun Sonu
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
