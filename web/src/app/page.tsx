'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, ShoppingBag, MessageSquare, ArrowRight, ShieldCheck, Cpu, Zap, Search, Phone, Smartphone, Tablet, Laptop, Watch, Cable } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { getWhatsAppLink, getFallbackImage, formatPriceTRY, B2B_LOGIN_URL, WHATSAPP_NUMBER, getPublicProductTitle, formatCategoryName } from '@/lib/constants'
import type { Product } from '@/types'
import { ProductCard } from '@/components/product/product-card'

export default function Home() {
  const [products, setProducts] = useState<Product[]>([])
  const [campaignsMap, setCampaignsMap] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function fetchShowcaseProducts() {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, barcode, category, brand, model, color, memory, ram, storage, processor, screen_size, description, image_url, stock, sell_price, is_web_visible, device_condition_type, created_at')
          .eq('is_web_visible', true)
          .gt('stock', 0)
          .order('created_at', { ascending: false })
          .limit(8)

        if (error) throw error
        setProducts(data || [])

        // Aktif kampanyaları çek
        const { data: campaignProdData, error: campError } = await supabase
          .from('campaign_products')
          .select(`
            product_id,
            product_role,
            campaigns:campaign_id (
              id,
              name,
              discount_type,
              discount_value,
              is_active,
              starts_at,
              ends_at
            )
          `);

        if (!campError && campaignProdData) {
          const mapping: Record<string, any> = {}
          const now = new Date()
          campaignProdData.forEach((row: any) => {
            if (row.product_role === 'trigger') return;
            const camp: any = row.campaigns;
            if (camp && camp.is_active) {
              const startsAt = new Date(camp.starts_at)
              const endsAt = camp.ends_at ? new Date(camp.ends_at) : null
              if (startsAt <= now && (!endsAt || endsAt >= now)) {
                const existing = mapping[row.product_id]
                if (!existing || camp.discount_value > existing.discount_value) {
                  mapping[row.product_id] = camp
                }
              }
            }
          })
          setCampaignsMap(mapping)
        }
      } catch (err) {
        console.error('Error loading showcase products:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchShowcaseProducts()
  }, [])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/shop?search=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  const categoryCards = [
    { name: 'Telefon', icon: Phone, color: 'text-blue-600 bg-blue-50 border-blue-100 hover:bg-blue-100/50' },
    { name: 'Aksesuar', icon: Smartphone, color: 'text-purple-600 bg-purple-50 border-purple-100 hover:bg-purple-100/50' },
    { name: 'Tablet', icon: Tablet, color: 'text-cyan-600 bg-cyan-50 border-cyan-100 hover:bg-cyan-100/50' },
    { name: 'Bilgisayar', icon: Laptop, color: 'text-indigo-600 bg-indigo-50 border-indigo-100 hover:bg-indigo-100/50' },
    { name: 'Akıllı Saat', icon: Watch, color: 'text-emerald-600 bg-emerald-50 border-emerald-100 hover:bg-emerald-100/50' },
    { name: 'Şarj & Kablo', icon: Cable, color: 'text-amber-600 bg-amber-50 border-amber-100 hover:bg-amber-100/50' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans pt-20">
      
      {/* Hero Section */}
      <section className="relative pt-16 pb-14 md:py-20 bg-gradient-to-b from-blue-50/50 via-slate-100/40 to-slate-50 border-b border-slate-200/60 overflow-hidden">
        <div className="absolute inset-0 opacity-40 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-[120px]" />
          <div className="absolute bottom-10 right-1/4 w-[400px] h-[400px] bg-indigo-100/40 rounded-full blur-[100px]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000003_1px,transparent_1px),linear-gradient(to_bottom,#00000003_1px,transparent_1px)] bg-[size:30px_30px]" />
        </div>

        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto space-y-5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-blue-100 bg-blue-50/60 text-blue-700 text-xs font-mono uppercase tracking-wider backdrop-blur-xl">
              <Zap size={11} className="animate-pulse" /> Stoklar Anlık Güncellenir
            </div>

            <h1 className="text-4xl md:text-5.5xl font-bold tracking-tight text-slate-900 leading-tight">
              HurCELL Teknoloji Mağazası
            </h1>
            
            <p className="text-base md:text-lg text-slate-600 font-light max-w-xl mx-auto leading-relaxed">
              Telefon, tablet, bilgisayar ve aksesuar ürünlerinde güncel stoklarımızı inceleyin.
            </p>

            {/* Compact Search Bar */}
            <form onSubmit={handleSearchSubmit} className="max-w-md mx-auto pt-3 relative">
              <input
                type="text"
                placeholder="Ürün, marka, model veya barkod ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-24 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 shadow-sm transition-all"
              />
              <Search className="absolute left-4 top-[25px] w-4 h-4 text-slate-400" />
              <button
                type="submit"
                className="absolute right-2 top-[17px] bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all"
              >
                Ara
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
              <Link
                href="/shop"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5"
              >
                Ürünleri İncele
                <ArrowRight size={14} />
              </Link>
              
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Merhaba, HurCELL perakende ürünleri hakkında bilgi almak istiyorum.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-2xl font-semibold text-xs transition-all flex items-center gap-1.5 shadow-sm"
              >
                <MessageSquare size={14} className="text-emerald-600" />
                WhatsApp'tan Sor
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Category Cards */}
      <section className="py-10 bg-white border-b border-slate-200/50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {categoryCards.map((cat) => {
              const IconComponent = cat.icon
              return (
                <Link
                  key={cat.name}
                  href={`/shop?category=${encodeURIComponent(cat.name)}`}
                  className={`flex flex-col items-center justify-center p-5 rounded-2xl border transition-all hover:scale-102 hover:shadow-sm ${cat.color}`}
                >
                  <IconComponent size={24} className="mb-2" />
                  <span className="text-xs font-semibold tracking-wide">{cat.name}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* Dynamic Products Showcase Section */}
      <section className="py-14 flex-1">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Yeni Gelen Ürünler</h2>
              <p className="text-xs text-slate-500 mt-1">Stoklarımıza en son eklenen perakende teknoloji ürünleri.</p>
            </div>
            <Link 
              href="/shop" 
              className="text-xs font-mono tracking-widest text-blue-600 hover:text-blue-500 transition-colors flex items-center gap-1 mt-3 sm:mt-0 uppercase font-semibold"
            >
              TÜM MAĞAZAYI GÖR
              <ChevronRight size={14} />
            </Link>
          </div>

          {loading ? (
            /* Loading Skeleton */
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="animate-pulse flex flex-col space-y-3 bg-white border border-slate-200 rounded-3xl p-4">
                  <div className="aspect-square rounded-2xl bg-slate-100" />
                  <div className="h-3 w-1/3 bg-slate-100 rounded" />
                  <div className="h-5 w-3/4 bg-slate-100 rounded" />
                  <div className="h-3.5 w-1/2 bg-slate-100 rounded" />
                  <div className="h-9 w-full bg-slate-100 rounded-xl" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-16 rounded-3xl border border-dashed border-slate-200 bg-white/50">
              <span className="text-3xl">📦</span>
              <h3 className="text-base font-semibold text-slate-700 mt-3">Stokta Web Ürünü Bulunmamaktadır</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Webde gösterilecek ürün bulunamadı. Lütfen daha sonra tekrar kontrol edin.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} campaign={campaignsMap[product.id]} />
              ))}
            </div>
          )}

        </div>
      </section>



    </div>
  )
}
