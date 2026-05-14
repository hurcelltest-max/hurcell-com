'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, ShoppingCart, Zap, BatteryCharging, Cable, ShieldCheck, Headphones, Battery, Filter, Apple, Smartphone, Edit3, ChevronDown, ChevronLeft, ChevronRight, PackageOpen } from 'lucide-react'
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
  if (!category) return <Zap className="w-24 h-24 text-slate-200" strokeWidth={1} />;
  const cat = category.toLowerCase();
  if (cat.includes('şarj')) return <BatteryCharging className="w-24 h-24 text-slate-200" strokeWidth={1} />;
  if (cat.includes('bağlantı') || cat.includes('kablo')) return <Cable className="w-24 h-24 text-slate-200" strokeWidth={1} />;
  if (cat.includes('koruma') || cat.includes('aksesuar')) return <ShieldCheck className="w-24 h-24 text-slate-200" strokeWidth={1} />;
  if (cat.includes('ses') || cat.includes('görüntü')) return <Headphones className="w-24 h-24 text-slate-200" strokeWidth={1} />;
  if (cat.includes('enerji') || cat.includes('powerbank')) return <Battery className="w-24 h-24 text-slate-200" strokeWidth={1} />;
  return <Zap className="w-24 h-24 text-slate-200" strokeWidth={1} />;
}

const isDeviceCategory = (cat: string | null) => {
  if (!cat) return false;
  const c = cat.toLowerCase();
  return c.includes('telefon') || c.includes('tablet') || c.includes('sıfır') || c.includes('yenilenmiş') || c.includes('teşhir') || c.includes('cihaz');
}

const getOSIcon = (name: string) => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('iphone') || lowerName.includes('ipad') || lowerName.includes('macbook') || lowerName.includes('apple')) {
    return <Apple className="w-3.5 h-3.5 text-slate-400" />;
  } else if (lowerName.includes('samsung') || lowerName.includes('xiaomi') || lowerName.includes('android') || lowerName.includes('redmi') || lowerName.includes('poco') || lowerName.includes('huawei')) {
    return <Smartphone className="w-3.5 h-3.5 text-slate-400" />;
  }
  return null;
}

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  
  // High-End Light Theme State
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
    <div className="min-h-screen bg-slate-50 pt-28 pb-20 px-4 md:px-8 max-w-[1400px] mx-auto flex flex-col md:flex-row gap-8">
      
      {/* Sidebar - Brands (Clean Light Theme) */}
      <aside className={cn(
        "w-full md:w-48 flex-shrink-0 flex flex-col space-y-6 transition-all duration-300",
        "md:block", 
        mobileFilterOpen ? "block" : "hidden"
      )}>
        <div className="sticky top-28 mt-2">
          <h2 className="text-[10px] font-semibold text-slate-400 uppercase mb-4 tracking-widest pl-3 flex items-center gap-2">
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
                    ? "bg-slate-200 text-slate-900 font-semibold" 
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
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
        
        {/* Boutique Header: Clean, Bright, Premium */}
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex justify-between items-end">
            <div className="flex items-center gap-3">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-widest">Vitrin</span>
              <span className="text-slate-300 text-xs">/</span>
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-widest">{filteredProducts.length} Ürün</span>
            </div>
            <div className="flex gap-2">
              <button 
                className="md:hidden flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-500 hover:text-slate-900 transition-colors bg-white shadow-sm"
                onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
              >
                <Filter size={14} /> Filtrele
              </button>
            </div>
          </div>

          {/* Main Division Tabs (Devices / Accessories) */}
          <div className="flex gap-8 border-b border-slate-200 pb-1">
            <button
              onClick={() => setMainTab('CİHAZLAR')}
              className={cn(
                "pb-2 text-base font-bold tracking-tight transition-colors relative",
                mainTab === 'CİHAZLAR' ? "text-blue-950" : "text-slate-400 hover:text-slate-600"
              )}
            >
              CİHAZLAR
              {mainTab === 'CİHAZLAR' && (
                <span className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-blue-950"></span>
              )}
            </button>
            <button
              onClick={() => setMainTab('AKSESUARLAR')}
              className={cn(
                "pb-2 text-base font-bold tracking-tight transition-colors relative",
                mainTab === 'AKSESUARLAR' ? "text-blue-950" : "text-slate-400 hover:text-slate-600"
              )}
            >
              AKSESUARLAR
              {mainTab === 'AKSESUARLAR' && (
                <span className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-blue-950"></span>
              )}
            </button>
          </div>

          {/* Sub-Category Dropdown */}
          <div className="relative z-20 w-full md:w-64">
             <button 
                onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                className="w-full flex items-center justify-between gap-4 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-xs text-slate-600 shadow-sm"
             >
               <span>Kategori: <span className="text-slate-900 font-semibold">{selectedCategory}</span></span>
               <ChevronDown size={14} className={cn("transition-transform text-slate-400", categoryDropdownOpen ? "rotate-180" : "")} />
             </button>

             {categoryDropdownOpen && (
               <div className="absolute top-full left-0 mt-1 w-full border border-slate-200 rounded-lg bg-white shadow-xl overflow-hidden">
                  {categories.map(category => (
                    <button
                      key={category}
                      onClick={() => {
                        setSelectedCategory(category);
                        setCategoryDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-2.5 text-xs transition-colors border-b border-slate-100 last:border-0",
                        selectedCategory === category
                          ? "bg-slate-50 text-blue-950 font-semibold"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
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
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : tabProducts.length === 0 && mainTab === 'CİHAZLAR' ? (
          <div className="flex flex-col items-center justify-center py-24 min-h-[300px] border border-slate-200 rounded-2xl bg-white shadow-sm">
            <PackageOpen className="w-12 h-12 text-slate-300 mb-4" strokeWidth={1} />
            <h3 className="text-slate-800 text-sm font-bold mb-2 tracking-widest uppercase text-center">
              STOKLAR GÜNCELLENİYOR
            </h3>
            <p className="text-slate-500 text-sm max-w-sm text-center px-4">
              Cihaz stoklarımız çok kısa süre içinde en yeni modellerle güncellenecektir. Lütfen takipte kalın.
            </p>
          </div>
        ) : filteredProducts.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-24 min-h-[300px] border border-slate-200 rounded-2xl bg-white shadow-sm">
             <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest text-center">
               Kriterlere uygun ürün bulunamadı.
             </p>
           </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {currentProducts.map((product) => (
                <Card 
                  key={product.id} 
                  className="group relative border border-slate-200 hover:border-slate-300 transition-all duration-300 bg-white rounded-xl overflow-hidden cursor-pointer flex flex-col h-full shadow-sm hover:shadow-md"
                >
                  {/* Dynamic Discount Badge */}
                  {product.discount_rate && product.discount_rate > 0 && (
                    <div className="absolute top-2 right-2 z-30 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm shadow-sm">
                      -%{product.discount_rate}
                    </div>
                  )}

                  {/* Minimalist Edit Button */}
                  <button 
                    onClick={(e) => handleEditPrice(e, product)}
                    className="absolute top-2 left-2 z-30 text-slate-400 hover:text-blue-600 p-1 transition-colors opacity-0 group-hover:opacity-100 bg-white/80 rounded shadow-sm"
                    title="Fiyatı Düzenle"
                  >
                    <Edit3 size={12} />
                  </button>

                  {/* Light Theme Placeholder Area */}
                  <div className="aspect-square relative flex flex-col justify-center items-center p-4 bg-slate-100 group-hover:bg-slate-50 transition-colors">
                    {/* Top Bar for Brand & OS */}
                    <div className="absolute top-2 left-2 right-2 flex justify-between items-start z-10">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                        {product.brand || ''}
                      </span>
                      {isDeviceCategory(product.category) && getOSIcon(product.name)}
                    </div>
                    
                    {/* Big Professional Icon */}
                    <div className="relative z-10 flex items-center justify-center transition-transform duration-500 group-hover:scale-105">
                      {getCategoryLargeIcon(product.category)}
                    </div>
                  </div>

                  {/* Content Area - Bright & Premium */}
                  <CardContent className="p-4 flex flex-col flex-1 bg-white">
                    <h3 className="font-semibold text-slate-800 text-xs mb-3 line-clamp-2 leading-relaxed flex-1 group-hover:text-blue-900 transition-colors">
                      {product.name}
                    </h3>
                    
                    <div className="flex items-end justify-between mt-auto pt-2 border-t border-slate-100">
                      <div className="flex flex-col">
                        {product.old_price && (
                          <span className="text-[10px] text-slate-400 line-through mb-0.5 font-medium">
                            {formatRetailPrice(product.old_price)}
                          </span>
                        )}
                        <span className="text-[14px] font-black text-blue-950">
                          {formatRetailPrice(product.price)}
                        </span>
                      </div>
                      <button className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 hover:bg-blue-600 text-slate-600 hover:text-white transition-colors shadow-sm">
                        <ShoppingCart size={12} />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Compact Minimal Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-12 flex justify-center items-center gap-6">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="text-slate-500 hover:text-slate-900 disabled:opacity-30 transition-colors text-xs font-semibold uppercase tracking-widest flex items-center gap-1"
                >
                  <ChevronLeft size={14} /> Önceki
                </button>
                
                <span className="text-slate-400 font-semibold text-xs bg-white px-3 py-1 rounded-md border border-slate-200 shadow-sm">
                  <span className="text-blue-950 font-bold">{currentPage}</span> / {totalPages}
                </span>
                
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="text-slate-500 hover:text-slate-900 disabled:opacity-30 transition-colors text-xs font-semibold uppercase tracking-widest flex items-center gap-1"
                >
                  Sonraki <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
