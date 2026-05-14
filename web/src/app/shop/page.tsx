'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, ShoppingCart, Zap, BatteryCharging, Cable, ShieldCheck, Headphones, Battery, Filter, Apple, Smartphone, Edit3, ChevronDown } from 'lucide-react'
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
  return c.includes('telefon') || c.includes('tablet') || c.includes('sıfır cihaz') || c.includes('yenilenmiş') || c.includes('teşhir');
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

  // Derived Data
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean) as string[]);
    return ['Tümü', ...Array.from(cats)];
  }, [products]);

  const brands = useMemo(() => {
    const brs = new Set(products.map(p => p.brand).filter(Boolean) as string[]);
    return ['Tümü', ...Array.from(brs).sort()];
  }, [products]);

  // Filtering
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchCategory = selectedCategory === 'Tümü' || p.category === selectedCategory;
      const matchBrand = selectedBrand === 'Tümü' || p.brand === selectedBrand;
      return matchCategory && matchBrand;
    });
  }, [products, selectedCategory, selectedBrand]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, selectedBrand]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
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
    <div className="min-h-screen bg-slate-950 pt-32 pb-20 px-4 md:px-8 max-w-[1400px] mx-auto flex flex-col md:flex-row gap-8">
      
      {/* Sidebar - Brands */}
      <aside className={cn(
        "w-full md:w-56 flex-shrink-0 flex flex-col space-y-6 transition-all duration-300",
        "md:block", 
        mobileFilterOpen ? "block" : "hidden"
      )}>
        <div className="sticky top-32 p-4 rounded-xl border border-white/5 bg-slate-900/50">
          <h2 className="text-[11px] font-medium text-white/40 uppercase mb-4 flex items-center gap-2">
            <Filter size={14} /> Markalar
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
                  "w-full text-left px-3 py-2 text-sm transition-colors rounded-lg",
                  selectedBrand === brand 
                    ? "bg-white/10 text-white font-medium" 
                    : "text-white/50 hover:text-white hover:bg-white/5"
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
        
        {/* Header & Mobile Filter Toggle */}
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-medium tracking-tight text-white mb-1">
                Koleksiyon
              </h1>
              <p className="text-white/40 text-sm">
                {filteredProducts.length} Donanım
              </p>
            </div>
            <div className="flex gap-2">
              <button 
                className="md:hidden flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
              >
                <Filter size={14} /> Marka
              </button>
            </div>
          </div>

          {/* Compact Category Dropdown */}
          <div className="relative z-20">
             <button 
                onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                className="w-full md:w-auto flex items-center justify-between gap-4 px-4 py-2 rounded-xl border border-white/10 bg-slate-900/50 hover:bg-slate-800/50 transition-colors text-sm text-white/80"
             >
               <span>Kategori: <span className="text-white font-medium">{selectedCategory}</span></span>
               <ChevronDown size={16} className={cn("transition-transform", categoryDropdownOpen ? "rotate-180" : "")} />
             </button>

             {categoryDropdownOpen && (
               <div className="absolute top-full left-0 mt-2 w-full md:w-64 border border-white/10 rounded-xl bg-slate-900 shadow-xl overflow-hidden">
                  {categories.map(category => (
                    <button
                      key={category}
                      onClick={() => {
                        setSelectedCategory(category);
                        setCategoryDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-3 text-sm transition-colors border-b border-white/5 last:border-0",
                        selectedCategory === category
                          ? "bg-white/10 text-white"
                          : "text-white/60 hover:bg-white/5 hover:text-white"
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
            <Loader2 className="h-8 w-8 animate-spin text-white/50" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 min-h-[300px]">
            <Zap className="w-12 h-12 text-white/10 mb-4" />
            <h3 className="text-white/60 text-lg font-medium mb-2 text-center">
              STOKLAR GÜNCELLENİYOR
            </h3>
            <p className="text-white/40 text-sm max-w-md text-center leading-relaxed">
              Cihaz stoklarımız kısa süre içinde en yeni modellerle güncellenecektir. Takipte kalın!
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {currentProducts.map((product) => (
                <Card 
                  key={product.id} 
                  className="group relative border-white/5 hover:border-white/10 transition-colors bg-slate-900/40 rounded-2xl overflow-hidden cursor-pointer flex flex-col h-full shadow-sm"
                >
                  {/* Discount Badge */}
                  {product.discount_rate && product.discount_rate > 0 && (
                    <div className="absolute top-3 right-3 z-30 bg-white text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
                      -%{product.discount_rate}
                    </div>
                  )}

                  {/* Edit Button */}
                  <button 
                    onClick={(e) => handleEditPrice(e, product)}
                    className="absolute top-3 left-3 z-30 bg-black/40 text-white/50 hover:text-white p-1.5 rounded-full backdrop-blur-sm transition-colors opacity-0 group-hover:opacity-100"
                    title="Fiyatı Düzenle"
                  >
                    <Edit3 size={12} />
                  </button>

                  {/* Minimalist Placeholder Area */}
                  <div className="aspect-square relative flex flex-col justify-between p-5 overflow-hidden bg-slate-900/50">
                    <div className="relative z-10 flex justify-between items-start">
                      <span className="text-[10px] font-medium text-white/40 uppercase tracking-widest px-2 py-1 rounded bg-white/5">
                        {product.brand || 'STANDART'}
                      </span>
                      {/* OS Icon Only for Devices */}
                      {isDeviceCategory(product.category) && getOSIcon(product.name)}
                    </div>
                    
                    <div className="relative z-10 flex-1 flex items-center justify-center opacity-30 transition-opacity duration-300">
                      <div className="flex flex-col items-center gap-2">
                        {getCategoryIcon(product.category)}
                        {product.brand && (
                          <span className="text-sm font-medium text-white/30 tracking-wide text-center">
                            {product.brand}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Content Area */}
                  <CardContent className="p-4 border-t border-white/5 flex flex-col flex-1 bg-slate-950/50">
                    <h3 className="font-medium text-white/90 text-sm mb-4 line-clamp-2 leading-relaxed flex-1">
                      {product.name}
                    </h3>
                    
                    <div className="flex items-end justify-between mt-auto">
                      <div>
                        {product.old_price && (
                          <p className="text-[11px] text-white/30 line-through mb-0.5">
                            {formatRetailPrice(product.old_price)}
                          </p>
                        )}
                        <p className="text-base font-medium text-white">
                          {formatRetailPrice(product.price)}
                        </p>
                      </div>
                      <button className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white text-white/70 hover:text-black transition-colors">
                        <ShoppingCart size={14} />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-12 flex justify-center items-center gap-2">
                {Array.from({ length: totalPages }).map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentPage(index + 1)}
                    className={cn(
                      "w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-colors",
                      currentPage === index + 1
                        ? "bg-white text-black"
                        : "text-white/50 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
