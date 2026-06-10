'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getWhatsAppLink, getFallbackImage, formatPriceTRY, B2B_LOGIN_URL } from '@/lib/constants'
import type { Product } from '@/types'
import Link from 'next/link'
import { Search, ShoppingBag, ArrowUpDown, Tag, Info, AlertCircle, X } from 'lucide-react'

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedBrand, setSelectedBrand] = useState('All')
  const [selectedCondition, setSelectedCondition] = useState('All')
  const [sortBy, setSortBy] = useState<'default' | 'price-asc' | 'price-desc'>('default')
  
  const supabase = createClient()

  useEffect(() => {
    async function fetchProducts() {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('products')
          .select('id, name, barcode, category, brand, model, color, memory, ram, storage, processor, screen_size, description, image_url, stock, sell_price, is_web_visible, device_condition_type, location')
          .eq('is_web_visible', true)
          .gt('stock', 0)
          .order('created_at', { ascending: false })

        if (error) throw error
        setProducts(data || [])
      } catch (err) {
        console.error('Error fetching catalog products:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchProducts()
  }, [])

  // Clear all filters
  const resetFilters = () => {
    setSearchQuery('')
    setSelectedCategory('All')
    setSelectedBrand('All')
    setSelectedCondition('All')
    setSortBy('default')
  }

  // Get unique categories and brands for filter dropdowns
  const categories = ['All', ...Array.from(new Set(products.map(p => p.category).filter((c): c is string => !!c)))]
  const brands = ['All', ...Array.from(new Set(products.map(p => p.brand).filter((b): b is string => !!b)))]

  // Filter & Sort Logic
  const filteredProducts = products.filter((p) => {
    // Search query match (Name, Barcode, Brand, Model, Category, Description)
    const matchesSearch = 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.barcode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.brand || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.model || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.category || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(searchQuery.toLowerCase())

    // Category filter match
    const matchesCategory = 
      selectedCategory === 'All' || 
      (p.category && p.category.toLowerCase() === selectedCategory.toLowerCase())

    // Brand filter match
    const matchesBrand = 
      selectedBrand === 'All' || 
      (p.brand && p.brand.toLowerCase() === selectedBrand.toLowerCase())

    // Condition filter match
    const matchesCondition = 
      selectedCondition === 'All' || 
      (selectedCondition === 'new_sealed' && p.device_condition_type === 'new_sealed') ||
      (selectedCondition === 'used' && p.device_condition_type !== 'new_sealed')

    return matchesSearch && matchesCategory && matchesBrand && matchesCondition
  })

  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === 'price-asc') {
      return (a.sell_price || 0) - (b.sell_price || 0)
    }
    if (sortBy === 'price-desc') {
      return (b.sell_price || 0) - (a.sell_price || 0)
    }
    return 0 // default sorting (date descending from Supabase order)
  })

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pt-28 flex flex-col">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 w-full py-8 space-y-8 flex-1">
        
        {/* Header Block */}
        <div className="border-b border-slate-900 pb-6">
          <h1 className="text-3xl font-bold tracking-tight text-white">Ürün Kataloğu</h1>
          <p className="text-sm text-slate-500 mt-1">Geniş teknoloji ürün yelpazemizi ve güncel stoklarımızı inceleyin.</p>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-slate-900/30 border border-slate-900 rounded-3xl p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* Search Input */}
            <div className="lg:col-span-5 relative">
              <input
                type="text"
                placeholder="Ürün adı, marka, model, barkod veya açıklama ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-500" />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-4 top-3.5 text-slate-400 hover:text-white">
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Category Select */}
            <div className="lg:col-span-2">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
              >
                <option value="All">Tüm Kategoriler</option>
                {categories.filter(c => c !== 'All').map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Brand Select */}
            <div className="lg:col-span-2">
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
              >
                <option value="All">Tüm Markalar</option>
                {brands.filter(b => b !== 'All').map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* Condition Select */}
            <div className="lg:col-span-2">
              <select
                value={selectedCondition}
                onChange={(e) => setSelectedCondition(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
              >
                <option value="All">Cihaz Durumu</option>
                <option value="new_sealed">Sıfır Kapalı Kutu</option>
                <option value="used">İkinci El / Diğer</option>
              </select>
            </div>

            {/* Sort Select */}
            <div className="lg:col-span-1">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
              >
                <option value="default">Sırala</option>
                <option value="price-asc">Fiyat: Artan</option>
                <option value="price-desc">Fiyat: Azalan</option>
              </select>
            </div>

          </div>

          {/* Dynamic Category Chips */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-900">
            <button
              onClick={() => setSelectedCategory('All')}
              className={`px-4 py-1.5 rounded-full text-xs font-mono tracking-wider transition-all cursor-pointer ${
                selectedCategory === 'All'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              TÜM ÜRÜNLER
            </button>
            {categories.filter(c => c !== 'All').map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-mono tracking-wider transition-all cursor-pointer ${
                  selectedCategory.toLowerCase() === cat.toLowerCase()
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {cat.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Catalog List */}
        {loading ? (
          /* Skeleton List */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="animate-pulse flex flex-col space-y-4">
                <div className="aspect-[4/5] rounded-3xl bg-slate-900" />
                <div className="h-4 w-1/3 bg-slate-900 rounded" />
                <div className="h-6 w-3/4 bg-slate-900 rounded" />
                <div className="h-4 w-1/2 bg-slate-900 rounded" />
                <div className="h-8 w-full bg-slate-900 rounded-full" />
              </div>
            ))}
          </div>
        ) : sortedProducts.length === 0 ? (
          <div className="text-center py-20 rounded-3xl border border-dashed border-slate-800 bg-slate-900/10 space-y-4">
            <AlertCircle className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-lg font-semibold text-slate-350">Uyumlu Ürün Bulunamadı</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">Arama terimlerinizi veya filtrelerinizi sıfırlayarak tekrar aramayı deneyebilirsiniz.</p>
            <button
              onClick={resetFilters}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Filtreleri Temizle
            </button>
          </div>
        ) : (
          <div>
            {/* Products Count Indicator */}
            <div className="text-xs text-slate-500 mb-6 font-mono">
              Toplam {sortedProducts.length} ürün listeleniyor
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {sortedProducts.map((product) => {
                const isSingleLeft = product.stock === 1;

                return (
                  <div key={product.id} className="group flex flex-col h-full bg-slate-900/20 hover:bg-slate-900/40 rounded-3xl border border-slate-900 hover:border-slate-850 p-4 transition-all duration-350 hover:-translate-y-1">
                    
                    {/* Image Container */}
                    <div className="aspect-[4/5] relative overflow-hidden bg-slate-950 rounded-2xl mb-4 border border-slate-900/50">
                      <img
                        src={product.image_url || getFallbackImage(product.category)}
                        alt={product.name}
                        className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                      />
                      
                      {/* Condition Badge */}
                      {product.device_condition_type && (
                        <span className="absolute left-3 top-3 px-2 py-0.5 rounded bg-slate-900/95 border border-slate-850 text-[8px] font-bold uppercase tracking-wider text-slate-300">
                          {product.device_condition_type === 'new_sealed' ? 'Sıfır Kapalı Kutu' : 'İkinci El / Diğer'}
                        </span>
                      )}
                      
                      {isSingleLeft && (
                        <span className="absolute right-3 top-3 px-2 py-0.5 rounded bg-rose-500 text-white text-[8px] font-bold uppercase tracking-widest animate-pulse">
                          Son 1 Adet
                        </span>
                      )}
                    </div>

                    {/* Meta info */}
                    <div className="flex flex-col flex-1">
                      
                      {/* Category Label */}
                      <span className="text-[9px] uppercase tracking-widest font-mono text-slate-500 mb-1">
                        {product.category || 'Teknoloji'}
                      </span>

                      {/* Product Name */}
                      <h3 className="text-sm font-semibold text-white mb-1.5 leading-snug line-clamp-2" title={product.name}>
                        {product.name}
                      </h3>

                      {/* Technical specifications */}
                      <p className="text-[11px] text-slate-400 font-light mb-3 line-clamp-1">
                        {(() => {
                          const parts = []
                          if (product.brand) parts.push(product.brand)
                          if (product.model) parts.push(product.model)
                          if (product.memory) parts.push(product.memory)
                          if (product.color) parts.push(product.color)
                          return parts.join(' • ') || 'Özellik belirtilmemiş'
                        })()}
                      </p>

                      {/* Pricing block */}
                      <div className="mt-auto mb-4 flex flex-col gap-1">
                        <span className="text-lg font-bold text-white tracking-tight">
                          {formatPriceTRY(product.sell_price)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span className="text-[9px] text-slate-400 font-mono">
                            Stok: {product.stock} adet
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 mt-auto">
                        <Link
                          href={`/urun/${product.id}`}
                          className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl text-center transition-colors border border-slate-700/50"
                        >
                          Detayları Gör
                        </Link>
                        
                        <a
                          href={getWhatsAppLink(product.name, product.barcode, product.sell_price)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl text-center transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm hover:shadow"
                        >
                          <ShoppingBag size={12} />
                          WhatsApp'tan Sor
                        </a>
                      </div>

                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <footer className="py-12 bg-slate-950 border-t border-slate-900 text-center text-xs text-slate-600 font-light">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
          <p>© 2026 HurCELL Teknoloji Mağazası. Tüm hakları saklıdır.</p>
          <div className="flex justify-center gap-6 text-slate-500">
            <Link href="/privacy" className="hover:underline">Gizlilik Politikası</Link>
            <Link href="/satis-sozlesmesi" className="hover:underline">Mesafeli Satış Sözleşmesi</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
