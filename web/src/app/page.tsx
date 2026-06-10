'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, ShoppingBag, MessageSquare, ArrowRight, ShieldCheck, Cpu, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { getWhatsAppLink, getFallbackImage, formatPriceTRY, B2B_LOGIN_URL, WHATSAPP_NUMBER } from '@/lib/constants'
import type { Product } from '@/types'

export default function Home() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchShowcaseProducts() {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, barcode, category, brand, model, color, memory, ram, storage, processor, screen_size, description, image_url, stock, sell_price, is_web_visible, device_condition_type')
          .eq('is_web_visible', true)
          .gt('stock', 0)
          .order('created_at', { ascending: false })
          .limit(8)

        if (error) throw error
        setProducts(data || [])
      } catch (err) {
        console.error('Error loading showcase products:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchShowcaseProducts()
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Hero Section */}
      <section className="relative pt-36 pb-20 md:py-36 bg-gradient-to-b from-blue-950/20 via-slate-950 to-slate-950 border-b border-slate-900 overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-10 right-1/4 w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-[100px]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:30px_30px]" />
        </div>

        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-4xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-mono uppercase tracking-widest backdrop-blur-xl">
              <Zap size={12} className="animate-pulse" /> Stoklar Anlık Güncellenir
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white leading-tight">
              HurCELL Teknoloji Mağazası
            </h1>
            
            <p className="text-lg md:text-xl text-slate-400 font-light max-w-2xl mx-auto leading-relaxed">
              Telefon, tablet, bilgisayar ve aksesuar ürünlerini güncel stoklarımızdan inceleyin.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <Link
                href="/shop"
                className="px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-semibold text-sm transition-all shadow-[0_0_20px_rgba(37,99,235,0.25)] flex items-center gap-2"
              >
                Ürünleri İncele
                <ArrowRight size={16} />
              </Link>
              
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Merhaba, HurCELL perakende ürünleri hakkında bilgi almak istiyorum.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-full font-semibold text-sm transition-all flex items-center gap-2"
              >
                <MessageSquare size={16} />
                WhatsApp'tan Sor
              </a>

              <a
                href={B2B_LOGIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-3.5 bg-slate-950 hover:bg-slate-900 text-blue-400 border border-blue-900/50 hover:border-blue-700/50 rounded-full font-semibold text-sm transition-all flex items-center gap-2"
              >
                B2B Girişi
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Badges Band */}
      <section className="py-8 bg-slate-900/40 border-b border-slate-900">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 opacity-60">
            <div className="flex items-center justify-center gap-2 font-mono text-xs tracking-widest text-slate-400">
              <Cpu size={16} /> GÜNCEL STOKLAR
            </div>
            <div className="flex items-center justify-center gap-2 font-mono text-xs tracking-widest text-slate-400">
              <ShieldCheck size={16} /> GÜVENLİ PROTOKOL
            </div>
            <div className="flex items-center justify-center gap-2 font-mono text-xs tracking-widest text-slate-400 col-span-2 md:col-span-1">
              <Zap size={16} /> WHATSAPP DESTEĞİ
            </div>
          </div>
        </div>
      </section>

      {/* Dynamic Products Vitrin Section */}
      <section className="py-20 flex-1">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-12">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-white">Yeni Gelen Ürünler</h2>
              <p className="text-sm text-slate-500 mt-1">Stoklarımıza en son eklenen seçkin teknoloji ürünleri.</p>
            </div>
            <Link 
              href="/shop" 
              className="text-xs font-mono tracking-widest text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 mt-4 sm:mt-0 uppercase"
            >
              TÜM MAĞAZAYI GÖR
              <ChevronRight size={14} />
            </Link>
          </div>

          {loading ? (
            /* Loading Skeleton */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="animate-pulse flex flex-col space-y-4">
                  <div className="aspect-[4/5] rounded-3xl bg-slate-900" />
                  <div className="h-4 w-1/3 bg-slate-900 rounded" />
                  <div className="h-6 w-3/4 bg-slate-900 rounded" />
                  <div className="h-4 w-1/2 bg-slate-900 rounded" />
                  <div className="h-8 w-full bg-slate-900 rounded-full" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-20 rounded-3xl border border-dashed border-slate-800 bg-slate-950">
              <span className="text-4xl">📦</span>
              <h3 className="text-lg font-semibold text-slate-300 mt-4">Stokta Web Ürünü Bulunmamaktadır</h3>
              <p className="text-sm text-slate-500 mt-1">Lütfen daha sonra tekrar kontrol edin.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {products.map((product) => {
                const isSingleLeft = product.stock === 1;
                
                return (
                  <div key={product.id} className="group flex flex-col h-full bg-slate-900/20 hover:bg-slate-900/40 rounded-3xl border border-slate-900 hover:border-slate-800/80 p-4 transition-all duration-350 hover:-translate-y-1">
                    
                    {/* Image Box */}
                    <div className="aspect-[4/5] relative overflow-hidden bg-slate-950 rounded-2xl mb-5 border border-slate-900/50">
                      <img
                        src={product.image_url || getFallbackImage(product.category)}
                        alt={product.name}
                        className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                      />
                      
                      {/* Condition / Stock Alert Badge */}
                      {product.device_condition_type && (
                        <span className="absolute left-3 top-3 px-2 py-1 rounded bg-slate-900/90 border border-slate-800 text-[9px] font-bold uppercase tracking-wider text-slate-300">
                          {product.device_condition_type === 'new_sealed' ? 'Sıfır Kapalı Kutu' : 'İkinci El / Diğer'}
                        </span>
                      )}
                      
                      {isSingleLeft && (
                        <span className="absolute right-3 top-3 px-2 py-1 rounded bg-rose-500/90 text-white text-[9px] font-bold uppercase tracking-widest animate-pulse">
                          Son 1 Adet
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex flex-col flex-1">
                      {/* Category */}
                      <span className="text-[10px] uppercase tracking-widest font-mono text-slate-500 mb-1.5 block">
                        {product.category || 'Teknoloji'}
                      </span>

                      {/* Title */}
                      <h3 className="text-base font-semibold text-white mb-1 leading-snug line-clamp-2" title={product.name}>
                        {product.name}
                      </h3>

                      {/* Specs Subtitle */}
                      <p className="text-xs text-slate-400 font-light mb-4 line-clamp-1">
                        {(() => {
                          const parts = []
                          if (product.brand) parts.push(product.brand)
                          if (product.model) parts.push(product.model)
                          if (product.memory) parts.push(product.memory)
                          if (product.color) parts.push(product.color)
                          return parts.join(' • ') || 'Özellik belirtilmemiş'
                        })()}
                      </p>

                      {/* Price */}
                      <div className="mt-auto mb-5">
                        <span className="text-xl font-bold text-white tracking-tight">
                          {formatPriceTRY(product.sell_price)}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-medium ml-2 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          Stokta Var ({product.stock} adet)
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="grid grid-cols-2 gap-2 mt-auto">
                        <Link
                          href={`/urun/${product.id}`}
                          className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl text-center transition-colors border border-slate-700/50"
                        >
                          Detayları Gör
                        </Link>
                        
                        <a
                          href={getWhatsAppLink(product.name, product.barcode, product.sell_price)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl text-center transition-colors flex items-center justify-center gap-1.5"
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
          )}

        </div>
      </section>

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
