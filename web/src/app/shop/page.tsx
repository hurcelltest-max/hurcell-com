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
  old_price?: number | null; // Optional
  discount_rate?: number | null; // Optional
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
  if (cat.includes('şarj')) return <BatteryCharging className="w-8 h-8 text-blue-400/40" />;
  if (cat.includes('bağlantı') || cat.includes('kablo')) return <Cable className="w-8 h-8 text-blue-400/40" />;
  if (cat.includes('koruma') || cat.includes('aksesuar')) return <ShieldCheck className="w-8 h-8 text-blue-400/40" />;
  if (cat.includes('ses') || cat.includes('görüntü')) return <Headphones className="w-8 h-8 text-blue-400/40" />;
  if (cat.includes('enerji') || cat.includes('powerbank')) return <Battery className="w-8 h-8 text-blue-400/40" />;
  return <Zap className="w-8 h-8 text-white/20" />;
}

const getOSIcon = (name: string) => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('iphone') || lowerName.includes('ipad') || lowerName.includes('macbook') || lowerName.includes('apple')) {
    return <Apple className="w-3 h-3 text-white/40" />;
  } else if (lowerName.includes('samsung') || lowerName.includes('xiaomi') || lowerName.includes('android') || lowerName.includes('redmi') || lowerName.includes('poco') || lowerName.includes('huawei')) {
    return <Smartphone className="w-3 h-3 text-white/40" />;
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
    <div className="min-h-screen bg-slate-950 pt-32 pb-20 px-2 md:px-6 max-w-[1600px] mx-auto flex flex-col md:flex-row gap-6">
      
      {/* Sidebar - Brands */}
      <aside className={cn(
        "w-full md:w-56 flex-shrink-0 flex flex-col space-y-6 transition-all duration-300",
        "md:block", 
        mobileFilterOpen ? "block" : "hidden"
      )}>
        <div className="sticky top-32 glass p-4 rounded-xl border border-white/5 bg-slate-900/50 backdrop-blur-xl">
          <h2 className="text-[10px] font-mono tracking-widest text-white/40 uppercase mb-4 flex items-center gap-2">
            <Filter size={12} /> Markalar
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
                  "w-full text-left px-3 py-2 text-xs transition-all duration-200 rounded-lg",
                  selectedBrand === brand 
                    ? "bg-blue-500/20 text-blue-400 font-medium border border-blue-500/30" 
                    : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"
                )}
              >
                {brand}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        
        {/* Header & Mobile Filter Toggle */}
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white mb-1 uppercase">
                Vitrin
              </h1>
              <p className="text-white/40 font-mono text-[10px] uppercase tracking-widest">
                {filteredProducts.length} Premium Donanım
              </p>
            </div>
            <div className="flex gap-2">
              <button 
                className="md:hidden flex items-center gap-2 glass px-3 py-1.5 rounded-lg border border-white/10 text-xs font-mono text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
              >
                <Filter size={14} /> Marka
              </button>
            </div>
          </div>

          {/* Compact Category Dropdown / Menu */}
          <div className="relative z-20">
             <button 
                onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                className="w-full md:w-auto flex items-center justify-between gap-4 glass px-4 py-2 rounded-xl border border-white/10 bg-slate-900/50 hover:bg-slate-800/50 transition-colors text-xs font-mono text-white/80"
             >
               <span>Kategori: <span className="text-white font-bold">{selectedCategory}</span></span>
               <ChevronDown size={14} className={cn("transition-transform", categoryDropdownOpen ? "rotate-180" : "")} />
             </button>

             {categoryDropdownOpen && (
               <div className="absolute top-full left-0 mt-2 w-full md:w-64 glass border border-white/10 rounded-xl bg-slate-900/90 backdrop-blur-xl shadow-2xl overflow-hidden">
                  {categories.map(category => (
                    <button
                      key={category}
                      onClick={() => {
                        setSelectedCategory(category);
                        setCategoryDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-3 text-xs font-mono uppercase tracking-widest transition-colors border-b border-white/5 last:border-0",
                        selectedCategory === category
                          ? "bg-blue-500/20 text-blue-400"
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
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20 border border-white/5 rounded-2xl glass bg-slate-900/30 flex flex-col items-center justify-center min-h-[300px]">
            <Zap className="w-12 h-12 text-white/10 mb-4" />
            <h3 className="text-white/60 font-mono text-sm tracking-widest uppercase mb-2">
              STOKLAR GÜNCELLENİYOR
            </h3>
            <p className="text-white/30 text-xs max-w-sm">
              Cihaz stoklarımız şu an güncellenmektedir. Çok kısa süre içinde en yeni modellerle buradayız. Takipte kalın!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-3 md:gap-4">
            {filteredProducts.map((product) => (
              <Card 
                key={product.id} 
                className="group relative glass border-white/5 hover:border-blue-500/30 transition-all duration-300 bg-slate-900/40 rounded-xl overflow-hidden cursor-pointer flex flex-col h-full shadow-lg hover:shadow-blue-500/10"
              >
                {/* Discount Badge */}
                {product.discount_rate && product.discount_rate > 0 && (
                  <div className="absolute top-2 right-2 z-30 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg">
                    -%{product.discount_rate}
                  </div>
                )}

                {/* Edit Button */}
                <button 
                  onClick={(e) => handleEditPrice(e, product)}
                  className="absolute top-2 left-2 z-30 bg-black/40 text-white/50 hover:text-white p-1 rounded backdrop-blur-sm transition-colors"
                  title="Fiyatı Düzenle"
                >
                  <Edit3 size={12} />
                </button>

                {/* Premium Dark Placeholder Area */}
                <div className="aspect-[4/5] relative flex flex-col justify-between p-4 overflow-hidden bg-gradient-to-b from-white/[0.02] to-transparent">
                  {/* Subtle Background Interaction */}
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  {/* Top Bar inside image area */}
                  <div className="relative z-10 flex justify-between items-start mt-4">
                    <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest px-1.5 py-0.5 border border-white/10 rounded bg-black/20">
                      {product.brand || 'PREMIUM'}
                    </span>
                    {getOSIcon(product.name)}
                  </div>
                  
                  {/* Center Placeholder Icon/Logo */}
                  <div className="relative z-10 flex-1 flex items-center justify-center opacity-20 group-hover:opacity-60 transition-all duration-500">
                    <div className="flex flex-col items-center gap-3">
                      {getCategoryIcon(product.category)}
                      {product.brand && (
                        <span className="text-xl font-black text-white/30 tracking-tighter uppercase blur-[0.5px] group-hover:blur-0 transition-all duration-300 text-center px-2">
                          {product.brand}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Content Area */}
                <CardContent className="p-3 border-t border-white/5 relative z-20 bg-slate-950/80 flex flex-col flex-1">
                  <h3 className="font-medium text-white/80 text-[11px] mb-3 line-clamp-2 leading-snug flex-1 group-hover:text-blue-100 transition-colors">
                    {product.name}
                  </h3>
                  
                  <div className="flex items-end justify-between mt-auto">
                    <div>
                      {product.old_price && (
                        <p className="text-[9px] font-mono text-white/30 line-through decoration-red-500/50 mb-0.5">
                          {formatRetailPrice(product.old_price)}
                        </p>
                      )}
                      <p className="text-sm font-mono font-bold text-blue-400 group-hover:text-blue-300 transition-colors">
                        {formatRetailPrice(product.price)}
                      </p>
                    </div>
                    <button className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-blue-600 border border-white/5 hover:border-transparent transition-all active:scale-95 group-hover:shadow-[0_0_10px_rgba(37,99,235,0.3)]">
                      <ShoppingCart size={12} className="text-white/70 group-hover:text-white" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
