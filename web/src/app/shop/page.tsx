'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  getWhatsAppLink,
  getFallbackImage,
  formatPriceTRY,
  normalizeBrandKey,
  formatBrandName,
  CATEGORY_CHIP_LABELS,
  matchesCategoryGroup,
  formatCategoryName,
  getPublicProductTitle,
} from '@/lib/constants'

import type { Product } from '@/types'
import Link from 'next/link'
import { Search, ShoppingBag, AlertCircle, X } from 'lucide-react'
import { ProductCard } from '@/components/product/product-card'

// ─────────────────────────────────────────────────────────────────
// URL Parametre Çözümleme
// Farklı formatlardaki URL kategori parametrelerini (Aksesuar,
// aksesuar, Şarj%20%26%20Kablo, sarj_kablo, vb.) iç grup ID'ye çevirir.
// ─────────────────────────────────────────────────────────────────
function resolveGroupFromParam(param: string | null): string {
  if (!param) return 'All'
  // Önce direkt grup ID eşleşmesi (aksesuar, sarj_kablo, telefon, ...)
  const validGroups = Object.keys(CATEGORY_CHIP_LABELS).filter((k) => k !== 'All')
  const lower = param.trim().toLocaleLowerCase('tr-TR')
  if (validGroups.includes(lower)) return lower

  // Chip label eşleşmesi (örn. "Aksesuar" → "aksesuar", "Şarj & Kablo" → "sarj_kablo")
  for (const [id, label] of Object.entries(CATEGORY_CHIP_LABELS)) {
    if (id === 'All') continue
    if (label.toLocaleLowerCase('tr-TR') === lower) return id
  }

  // Kısmi alias eşleşmeleri
  const aliases: Record<string, string> = {
    telefon: 'telefon',
    phone: 'telefon',
    tablet: 'tablet',
    ipad: 'tablet',
    bilgisayar: 'bilgisayar',
    laptop: 'bilgisayar',
    notebook: 'bilgisayar',
    aksesuar: 'aksesuar',
    accessory: 'aksesuar',
    'akıllı saat': 'akilli_saat',
    'akilli saat': 'akilli_saat',
    'akıllısaat': 'akilli_saat',
    akilli_saat: 'akilli_saat',
    saat: 'akilli_saat',
    watch: 'akilli_saat',
    'sarj_kablo': 'sarj_kablo',
    'şarj & kablo': 'sarj_kablo',
    'sarj & kablo': 'sarj_kablo',
    'şarj': 'sarj_kablo',
    'sarj': 'sarj_kablo',
    kablo: 'sarj_kablo',
    charger: 'sarj_kablo',
    cable: 'sarj_kablo',
  }
  const aliasKey = param.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ')
  if (aliases[aliasKey]) return aliases[aliasKey]

  return 'All'
}

// Sabit chip sırası
const CHIP_ORDER = ['All', 'telefon', 'aksesuar', 'tablet', 'bilgisayar', 'akilli_saat', 'sarj_kablo']

// ─────────────────────────────────────────────────────────────────
// Ana Bileşen (useSearchParams içinde olduğu için Suspense içinde)
// ─────────────────────────────────────────────────────────────────
function ShopPageContent() {
  const searchParams = useSearchParams()
  const categoryParam  = searchParams.get('category')
  const searchParam    = searchParams.get('search')
  const brandParam     = searchParams.get('brand')
  const conditionParam = searchParams.get('condition')
  const sortParam      = searchParams.get('sort')

  const [products, setProducts]               = useState<Product[]>([])
  const [campaignsMap, setCampaignsMap]       = useState<Record<string, any>>({})
  const [loading, setLoading]                 = useState(true)
  const [searchQuery, setSearchQuery]         = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All') // iç grup ID
  const [selectedBrand, setSelectedBrand]     = useState('All')
  const [selectedCondition, setSelectedCondition] = useState('All')
  const [sortBy, setSortBy]                   = useState<'default' | 'price-asc' | 'price-desc'>('default')

  const supabase = createClient()

  // URL parametrelerinden filtre durumunu başlat
  useEffect(() => {
    const resolvedGroup = resolveGroupFromParam(categoryParam)
    setSelectedCategory(resolvedGroup)

    if (searchParam) setSearchQuery(searchParam)

    if (brandParam) setSelectedBrand(brandParam.trim())

    if (conditionParam === 'new_sealed' || conditionParam === 'used') {
      setSelectedCondition(conditionParam)
    }

    if (sortParam === 'price-asc' || sortParam === 'price-desc') {
      setSortBy(sortParam)
    }
  }, [categoryParam, searchParam, brandParam, conditionParam, sortParam])

  // Ürünleri ve aktif kampanyaları Supabase'den çek
  useEffect(() => {
    async function fetchCatalogProducts() {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('products')
          .select(
            'id, name, barcode, category, brand, model, color, memory, ram, storage, processor, screen_size, description, image_url, stock, sell_price, is_web_visible, device_condition_type, location, created_at'
          )
          .eq('is_web_visible', true)
          .gt('stock', 0)
          .order('created_at', { ascending: false })

        if (error) throw error
        setProducts(data || [])

        // Aktif kampanyaları çek
        const { data: campaignProdData, error: campError } = await supabase
          .from('campaign_products')
          .select(`
            product_id,
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
        console.error('Ürün kataloğu yüklenirken hata:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchCatalogProducts()
  }, [])


  // Tüm filtreleri sıfırla
  const resetFilters = () => {
    setSearchQuery('')
    setSelectedCategory('All')
    setSelectedBrand('All')
    setSelectedCondition('All')
    setSortBy('default')
  }

  // Marka listesi — case-insensitive tekilleştirme (tr-TR locale), A-Z sıralı
  const brands = [
    'All',
    ...(() => {
      const seen = new Map<string, string>() // normalKey → displayName
      for (const p of products) {
        if (!p.brand) continue
        const key = normalizeBrandKey(p.brand)
        if (!seen.has(key)) seen.set(key, formatBrandName(p.brand))
      }
      return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'tr-TR'))
    })(),
  ]

  // ─── FİLTRELEME MANTIĞI ───────────────────────────────────────
  const filteredProducts = products.filter((p) => {
    // Metin araması (ad, barkod, marka, model, kategori, açıklama)
    const q = searchQuery.toLocaleLowerCase('tr-TR')
    const matchesSearch =
      !q ||
      p.name.toLocaleLowerCase('tr-TR').includes(q) ||
      (p.barcode  || '').toLocaleLowerCase('tr-TR').includes(q) ||
      (p.brand    || '').toLocaleLowerCase('tr-TR').includes(q) ||
      (p.model    || '').toLocaleLowerCase('tr-TR').includes(q) ||
      (p.category || '').toLocaleLowerCase('tr-TR').includes(q) ||
      (p.description || '').toLocaleLowerCase('tr-TR').includes(q)

    // Kategori filtresi — grup tabanlı (category + name/model/description keyword match)
    const matchesCategory =
      selectedCategory === 'All' || matchesCategoryGroup(selectedCategory, p)

    // Marka filtresi — case-insensitive (tr-TR)
    const matchesBrand =
      selectedBrand === 'All' ||
      (p.brand != null && normalizeBrandKey(p.brand) === normalizeBrandKey(selectedBrand))

    // Cihaz durumu filtresi
    const matchesCondition =
      selectedCondition === 'All' ||
      (selectedCondition === 'new_sealed' && p.device_condition_type === 'new_sealed') ||
      (selectedCondition === 'used'       && p.device_condition_type !== 'new_sealed')

    return matchesSearch && matchesCategory && matchesBrand && matchesCondition
  })

  // Sıralama
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === 'price-asc')  return (a.sell_price || 0) - (b.sell_price || 0)
    if (sortBy === 'price-desc') return (b.sell_price || 0) - (a.sell_price || 0)
    return 0
  })

  // Aktif filtre sayısı (Header badge için)
  const activeFilterCount = [
    selectedCategory !== 'All',
    selectedBrand !== 'All',
    selectedCondition !== 'All',
    !!searchQuery,
  ].filter(Boolean).length

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 w-full py-6 space-y-6 flex-1">

      {/* Başlık */}
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Ürün Kataloğu</h1>
        <p className="text-xs text-slate-500 mt-1">
          Geniş teknoloji ürün yelpazemizi ve güncel stoklarımızı inceleyin.
        </p>
      </div>

      {/* Filtre + Arama Paneli */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-5 space-y-5 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* Arama */}
          <div className="lg:col-span-5 relative">
            <input
              id="shop-search"
              type="text"
              placeholder="Ürün adı, marka, model, barkod veya açıklama ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-10 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
            />
            <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-800"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Kategori Select — sabit grup seçenekleri */}
          <div className="lg:col-span-2">
            <select
              id="shop-category-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all cursor-pointer"
            >
              <option value="All">Tüm Kategoriler</option>
              {CHIP_ORDER.filter((id) => id !== 'All').map((id) => (
                <option key={id} value={id}>
                  {CATEGORY_CHIP_LABELS[id]}
                </option>
              ))}
            </select>
          </div>

          {/* Marka Select */}
          <div className="lg:col-span-2">
            <select
              id="shop-brand-select"
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all cursor-pointer"
            >
              <option value="All">Tüm Markalar</option>
              {brands
                .filter((b) => b !== 'All')
                .map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
            </select>
          </div>

          {/* Cihaz Durumu */}
          <div className="lg:col-span-2">
            <select
              id="shop-condition-select"
              value={selectedCondition}
              onChange={(e) => setSelectedCondition(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all cursor-pointer"
            >
              <option value="All">Cihaz Durumu</option>
              <option value="new_sealed">Sıfır Kapalı Kutu</option>
              <option value="used">İkinci El / Diğer</option>
            </select>
          </div>

          {/* Sıralama */}
          <div className="lg:col-span-1">
            <select
              id="shop-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all cursor-pointer"
            >
              <option value="default">Sırala</option>
              <option value="price-asc">Fiyat: Artan</option>
              <option value="price-desc">Fiyat: Azalan</option>
            </select>
          </div>
        </div>

        {/* Sabit Kategori Chip'leri */}
        <div className="flex flex-wrap gap-2 pt-2.5 border-t border-slate-100">
          {CHIP_ORDER.map((groupId) => {
            const label =
              groupId === 'All' ? 'Tüm Ürünler' : CATEGORY_CHIP_LABELS[groupId]
            const isActive = selectedCategory === groupId
            return (
              <button
                key={groupId}
                id={`chip-${groupId}`}
                onClick={() => setSelectedCategory(groupId)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all cursor-pointer border ${
                  isActive
                    ? 'bg-blue-600 text-white border-transparent shadow-sm'
                    : 'bg-white text-slate-600 hover:text-slate-800 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            )
          })}

          {/* Aktif filtre varsa Temizle butonu */}
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="ml-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 hover:text-slate-700 transition-all cursor-pointer flex items-center gap-1"
            >
              <X size={10} />
              Temizle ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      {/* Ürün Listesi */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="animate-pulse flex flex-col space-y-3 bg-white border border-slate-200 rounded-3xl p-4"
            >
              <div className="aspect-square rounded-2xl bg-slate-100" />
              <div className="h-3 w-1/3 bg-slate-100 rounded" />
              <div className="h-5 w-3/4 bg-slate-100 rounded" />
              <div className="h-3.5 w-1/2 bg-slate-100 rounded" />
              <div className="h-9 w-full bg-slate-100 rounded-xl" />
            </div>
          ))}
        </div>
      ) : sortedProducts.length === 0 ? (
        <div className="text-center py-16 rounded-3xl border border-dashed border-slate-200 bg-white/50 space-y-3 shadow-sm">
          <AlertCircle className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-semibold text-slate-700">Uyumlu Ürün Bulunamadı</h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Arama terimlerinizi veya filtrelerinizi sıfırlayarak tekrar aramayı deneyebilirsiniz.
          </p>
          <button
            onClick={resetFilters}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Filtreleri Temizle
          </button>
        </div>
      ) : (
        <div>
          <div className="text-xs text-slate-500 mb-5 font-mono">
            Toplam {sortedProducts.length} ürün listeleniyor
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {sortedProducts.map((product) => (
              <ProductCard key={product.id} product={product} campaign={campaignsMap[product.id]} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sayfa Wrapper (Suspense — useSearchParams gereksinimi)
// ─────────────────────────────────────────────────────────────────
export default function ShopPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pt-28 pb-10 flex flex-col">
      <Suspense
        fallback={
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 w-full py-6 space-y-6 flex-1">
            <div className="animate-pulse h-8 w-1/4 bg-slate-200 rounded" />
            <div className="animate-pulse h-20 w-full bg-slate-200 rounded-3xl" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-10">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse h-80 bg-slate-200 rounded-3xl" />
              ))}
            </div>
          </div>
        }
      >
        <ShopPageContent />
      </Suspense>

      {/* Footer */}
      <footer className="py-10 bg-slate-100 border-t border-slate-200 text-center text-xs text-slate-500 font-light mt-auto">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 space-y-2.5">
          <p>© 2026 HurCELL Teknoloji Mağazası. Tüm hakları saklıdır.</p>
          <div className="flex justify-center gap-5 text-slate-400">
            <Link href="/privacy" className="hover:text-blue-600 transition-colors">
              Gizlilik Politikası
            </Link>
            <Link href="/satis-sozlesmesi" className="hover:text-blue-600 transition-colors">
              Mesafeli Satış Sözleşmesi
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
