'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, ShoppingCart, Zap, BatteryCharging, Cable, ShieldCheck, Headphones, Battery, Filter, Apple, Smartphone, Edit3, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
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

const getCategoryIcon = (category: string | null) => {
  if (!category) return <Zap className="w-8 h-8 text-white/20" />;
  const cat = category.toLowerCase();
  if (cat.includes('şarj')) return <BatteryCharging className="w-8 h-8 text-white/40" />;
  if (cat.includes('bağlantı') || cat.includes('kablo')) return <Cable className="w-8 h-8 text-white/40" />;
  if (cat.includes('koruma') || cat.includes('aksesuar')) return <ShieldCheck className="w-8 h-8 text-white/40" />;
  if (cat.includes('ses') || cat.includes('görüntü')) return <Headphones className="w-8 h-8 text-white/40" />;
  if (cat.includes('enerji') || cat.includes('powerbank')) return <Battery className="w-8 h-8 text-white/40" />;
  return <Zap className="w-8 h-8 text-white/20" />;
}

const isDeviceCategory = (cat: string | null) => {
  if (!cat) return false;
  const c = cat.toLowerCase();
  return c.includes('telefon') || c.includes('tablet') || c.includes('sıfır') || c.includes('yenilenmiş') || c.includes('teşhir') || c.includes('cihaz');
}

const getOSIcon = (name: string) => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('iphone') || lowerName.includes('ipad') || lowerName.includes('macbook') || lowerName.includes('apple')) {
    return <Apple className="w-4 h-4 text-white/40" />;
  } else if (lowerName.includes('samsung') || lowerName.includes('xiaomi') || lowerName.includes('android') || lowerName.includes('redmi') || lowerName.includes('poco') || lowerName.includes('huawei')) {
    return <Smartphone className="w-4 h-4 text-white/40" />;
  }
  return null;
}

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  
  // High-End Boutique State
  const [mainTab, setMainTab] = useState<'CİHAZLAR' | 'AKSESUARLAR'>('AKSESUARLAR')
  
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü')
  const [selectedBrand, setSelectedBrand] = useState<string>('Tümü')
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 16;

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
    setCurrentPage(1);
    setSelectedCategory('Tümü');
    setSelectedBrand('Tümü');
  }, [mainTab]);

  // Reset page on sub-filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, selectedBrand]);

  // Pagination Logic
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const currentProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

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
    <div className="min-h-screen bg-slate-950 pt-28 pb-20 px-4 md:px-8 max-w-[1400px] mx-auto flex flex-col md:flex-row gap-8">
      
      {/* Sidebar - Brands (Cleaned up) */}
      <aside className={cn(
        "w-full md:w-48 flex-shrink-0 flex flex-col space-y-6 transition-all duration-300",
        "md:block", 
        mobileFilterOpen ? "block" : "hidden"
      )}>
        <div className="sticky top-28 mt-2">
          <h2 className="text-[10px] font-medium text-white/30 uppercase mb-4 tracking-widest pl-3">
            MARKALAR
          </h2>
          <div className="space-y-0.5 max-h-[60vh] overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {brands.map(brand => (
              <button
                key={brand}
                onClick={() => {
                  setSelectedBrand(brand);
                  setMobileFilterOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs transition-colors rounded-md",
                  selectedBrand === brand 
                    ? "bg-white/10 text-white font-medium" 
                    : "text-white/40 hover:text-white hover:bg-white/5"
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
        
        {/* Boutique Header: Clean, Subtle, Minimal */}
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex justify-between items-end">
            <div className="flex items-center gap-3">
              <span className="text-white/30 text-xs font-mono uppercase tracking-widest">Vitrin</span>
              <span className="text-white/10 text-xs">/</span>
              <span className="text-white/30 text-xs font-mono uppercase tracking-widest">{filteredProducts.length} Donanım</span>
            </div>
            <div className="flex gap-2">
              <button 
                className="md:hidden flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-white/50 hover:text-white transition-colors"
                onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
              >
                <Filter size={14} /> Filtrele
              </button>
            </div>
          </div>

          {/* Main Division Tabs (Devices / Accessories) */}
          <div className="flex gap-6 border-b border-white/5 pb-1">
            <button
              onClick={() => setMainTab('CİHAZLAR')}
              className={cn(
                "pb-2 text-sm font-medium tracking-wide uppercase transition-colors relative",
                mainTab === 'CİHAZLAR' ? "text-white" : "text-white/40 hover:text-white/70"
              )}
            >
              CİHAZLAR
              {mainTab === 'CİHAZLAR' && (
                <span className="absolute bottom-[-1px] left-0 w-full h-[1px] bg-white"></span>
              )}
            </button>
            <button
              onClick={() => setMainTab('AKSESUARLAR')}
              className={cn(
                "pb-2 text-sm font-medium tracking-wide uppercase transition-colors relative",
                mainTab === 'AKSESUARLAR' ? "text-white" : "text-white/40 hover:text-white/70"
              )}
            >
              AKSESUARLAR
              {mainTab === 'AKSESUARLAR' && (
                <span className="absolute bottom-[-1px] left-0 w-full h-[1px] bg-white"></span>
              )}
            </button>
          </div>

          {/* Sub-Category Dropdown */}
          <div className="relative z-20 w-full md:w-64">
             <button 
                onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                className="w-full flex items-center justify-between gap-4 px-3 py-2 rounded-lg border border-white/5 bg-transparent hover:bg-white/5 transition-colors text-xs text-white/60"
             >
               <span>Kategori: <span className="text-white font-medium">{selectedCategory}</span></span>
               <ChevronDown size={14} className={cn("transition-transform text-white/40", categoryDropdownOpen ? "rotate-180" : "")} />
             </button>

             {categoryDropdownOpen && (
               <div className="absolute top-full left-0 mt-1 w-full border border-white/10 rounded-lg bg-[#0f111a] shadow-2xl overflow-hidden">
                  {categories.map(category => (
                    <button
                      key={category}
                      onClick={() => {
                        setSelectedCategory(category);
                        setCategoryDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-2.5 text-xs transition-colors border-b border-white/5 last:border-0",
                        selectedCategory === category
                          ? "bg-white/10 text-white"
                          : "text-white/50 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {category}
                    </button>
                  ))}
               </div>
             )}
          </div>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-white/30" />
          </div>
        ) : tabProducts.length === 0 && mainTab === 'CİHAZLAR' ? (
          <div className="flex flex-col items-center justify-center py-24 min-h-[300px] border border-white/5 rounded-2xl bg-white/[0.01]">
            <Apple className="w-10 h-10 text-white/10 mb-4" />
            <h3 className="text-white/70 text-sm font-medium mb-1 tracking-widest uppercase text-center">
              STOKLAR GÜNCELLENİYOR
            </h3>
            <p className="text-white/30 text-xs max-w-sm text-center">
              Cihaz stoklarımız çok kısa süre içinde en yeni modellerle güncellenecektir. Takipte kalın!
            </p>
          </div>
        ) : filteredProducts.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-24 min-h-[300px] border border-white/5 rounded-2xl bg-white/[0.01]">
             <p className="text-white/30 text-xs uppercase tracking-widest text-center">
               Kriterlere uygun donanım bulunamadı.
             </p>
           </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {currentProducts.map((product) => (
                <Card 
                  key={product.id} 
                  className="group relative border border-white/5 hover:border-white/10 transition-colors bg-white/[0.02] rounded-xl overflow-hidden cursor-pointer flex flex-col h-full shadow-none"
                >
                  {/* Dynamic Discount Badge */}
                  {product.discount_rate && product.discount_rate > 0 && (
                    <div className="absolute top-2 right-2 z-30 bg-white text-black text-[9px] font-bold px-1.5 py-0.5 rounded-sm">
                      -%{product.discount_rate}
                    </div>
                  )}

                  {/* Minimalist Edit Button */}
                  <button 
                    onClick={(e) => handleEditPrice(e, product)}
                    className="absolute top-2 left-2 z-30 text-white/30 hover:text-white p-1 transition-colors opacity-0 group-hover:opacity-100"
                    title="Fiyatı Düzenle"
                  >
                    <Edit3 size={12} />
                  </button>

                  {/* Compact Placeholder Area */}
                  <div className="h-28 relative flex flex-col justify-between p-3 overflow-hidden bg-white/[0.01]">
                    <div className="relative z-10 flex justify-between items-start">
                      <span className="text-[9px] font-medium text-white/30 uppercase tracking-widest">
                        {product.brand || ''}
                      </span>
                      {/* OS Icon strictly for Devices */}
                      {isDeviceCategory(product.category) && getOSIcon(product.name)}
                    </div>
                    
                    <div className="relative z-10 flex-1 flex items-center justify-center opacity-20">
                      {getCategoryIcon(product.category)}
                    </div>
                  </div>

                  {/* Content Area - Compact */}
                  <CardContent className="p-3 flex flex-col flex-1 bg-transparent">
                    <h3 className="font-medium text-white/80 text-[11px] mb-3 line-clamp-2 leading-snug flex-1">
                      {product.name}
                    </h3>
                    
                    <div className="flex items-end justify-between mt-auto">
                      <div className="flex flex-col">
                        {product.old_price && (
                          <span className="text-[9px] text-white/30 line-through mb-[1px]">
                            {formatRetailPrice(product.old_price)}
                          </span>
                        )}
                        <span className="text-[13px] font-semibold text-white/90">
                          {formatRetailPrice(product.price)}
                        </span>
                      </div>
                      <button className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white text-white/50 hover:text-black transition-colors">
                        <ShoppingCart size={10} />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Compact Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-10 flex justify-center items-center gap-4">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="text-white/40 hover:text-white disabled:opacity-20 transition-colors text-[10px] uppercase tracking-widest flex items-center gap-1"
                >
                  <ChevronLeft size={12} /> Önceki
                </button>
                
                <span className="text-white/30 font-mono text-[11px]">
                  {currentPage} <span className="text-white/10 mx-1">/</span> {totalPages}
                </span>
                
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="text-white/40 hover:text-white disabled:opacity-20 transition-colors text-[10px] uppercase tracking-widest flex items-center gap-1"
                >
                  Sonraki <ChevronRight size={12} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
