'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, ShoppingCart, Zap, BatteryCharging, Cable, ShieldCheck, Headphones, Battery, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'

// Types
type Product = {
  id: string;
  name: string;
  brand: string | null;
  sku: string | null;
  price: number;
  stock: number;
  category: string | null;
  image_url: string | null;
}

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
  if (!category) return <Zap className="w-12 h-12 text-white/20" />;
  const cat = category.toLowerCase();
  if (cat.includes('şarj')) return <BatteryCharging className="w-12 h-12 text-blue-400/40" />;
  if (cat.includes('bağlantı') || cat.includes('kablo')) return <Cable className="w-12 h-12 text-blue-400/40" />;
  if (cat.includes('koruma') || cat.includes('aksesuar')) return <ShieldCheck className="w-12 h-12 text-blue-400/40" />;
  if (cat.includes('ses') || cat.includes('görüntü')) return <Headphones className="w-12 h-12 text-blue-400/40" />;
  if (cat.includes('enerji') || cat.includes('powerbank')) return <Battery className="w-12 h-12 text-blue-400/40" />;
  return <Zap className="w-12 h-12 text-white/20" />;
}

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü')
  const [selectedBrand, setSelectedBrand] = useState<string>('Tümü')
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    async function fetchProducts() {
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

    fetchProducts()
  }, [supabase])

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

  return (
    <div className="min-h-screen pt-32 pb-20 px-4 md:px-8 max-w-[1400px] mx-auto flex flex-col md:flex-row gap-8 lg:gap-12">
      
      {/* Sidebar - Brands */}
      <aside className={cn(
        "w-full md:w-64 flex-shrink-0 flex flex-col space-y-8 transition-all duration-300",
        "md:block", // always block on md
        mobileFilterOpen ? "block" : "hidden" // toggle on mobile
      )}>
        <div className="sticky top-32 glass p-6 rounded-2xl border border-white/5 bg-black/40 backdrop-blur-xl">
          <h2 className="text-xs font-mono tracking-widest text-white/40 uppercase mb-6 flex items-center gap-2">
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
                  "w-full text-left px-3 py-2 text-sm transition-all duration-200 rounded-lg",
                  selectedBrand === brand 
                    ? "bg-blue-500/10 text-blue-400 font-medium border border-blue-500/20" 
                    : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
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
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-white mb-3 uppercase">
              Koleksiyon
            </h1>
            <p className="text-white/40 font-mono text-sm uppercase tracking-wider">
              {filteredProducts.length} Premium Donanım Listeleniyor
            </p>
          </div>
          <button 
            className="md:hidden flex items-center gap-2 glass px-4 py-2 rounded-lg border border-white/10 text-sm font-mono text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
          >
            <Filter size={16} /> Marka Filtrele
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] gap-2 mb-10 pb-2">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={cn(
                "whitespace-nowrap px-6 py-3 rounded-full text-xs font-mono uppercase tracking-widest transition-all duration-300 border",
                selectedCategory === category
                  ? "bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                  : "bg-black/50 text-white/60 border-white/10 hover:border-white/30 hover:text-white"
              )}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-32 border border-white/5 rounded-2xl glass bg-black/20">
            <p className="text-white/40 font-mono text-sm tracking-widest uppercase">
              Bu kriterlere uygun donanım bulunamadı.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-6">
            {filteredProducts.map((product) => (
              <Card 
                key={product.id} 
                className="group relative glass border-white/5 hover:border-white/20 transition-all duration-500 bg-[#07070A] rounded-2xl overflow-hidden cursor-pointer flex flex-col h-full"
              >
                {/* Premium Dark Placeholder Area */}
                <div className="aspect-[4/5] relative flex flex-col justify-between p-6 overflow-hidden bg-gradient-to-b from-white/[0.03] to-transparent">
                  {/* Subtle Background Interaction */}
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  
                  {/* Top Bar inside image area */}
                  <div className="relative z-10 flex justify-between items-start">
                    <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest px-2 py-1 border border-white/10 rounded backdrop-blur-md bg-black/40">
                      {product.brand || 'PREMIUM'}
                    </span>
                    <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center backdrop-blur-md bg-black/40 group-hover:border-blue-500/30 group-hover:bg-blue-500/10 transition-colors duration-500">
                      <Zap size={14} className="text-white/30 group-hover:text-blue-400 transition-colors" />
                    </div>
                  </div>
                  
                  {/* Center Placeholder Icon/Logo */}
                  <div className="relative z-10 flex-1 flex items-center justify-center opacity-30 group-hover:opacity-80 group-hover:scale-110 transition-all duration-700 ease-out">
                    <div className="flex flex-col items-center gap-6">
                      {getCategoryIcon(product.category)}
                      {product.brand && (
                        <span className="text-3xl font-black text-white/20 tracking-tighter uppercase blur-[0.5px] group-hover:blur-0 transition-all duration-500 text-center px-4">
                          {product.brand}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Content Area */}
                <CardContent className="p-6 border-t border-white/5 relative z-20 bg-[#0A0A0F] flex flex-col flex-1">
                  <h3 className="font-medium text-white/80 text-sm mb-6 line-clamp-2 leading-relaxed flex-1 group-hover:text-white transition-colors">
                    {product.name}
                  </h3>
                  
                  <div className="flex items-end justify-between mt-auto">
                    <div>
                      <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-1">FİYAT</p>
                      <p className="text-lg font-mono font-bold text-blue-400 group-hover:text-blue-300 transition-colors">
                        {formatRetailPrice(product.price)}
                      </p>
                    </div>
                    <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all active:scale-95 group-hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                      <ShoppingCart size={16} className="text-white/70 group-hover:text-white transition-colors" />
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
