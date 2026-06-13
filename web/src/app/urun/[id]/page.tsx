'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { getWhatsAppLink, getFallbackImage, formatPriceTRY, getPublicProductTitle, formatCategoryName, getCategoryGroup } from '@/lib/constants'
import type { Product } from '@/types'
import { ArrowLeft, ShoppingBag, CheckCircle, AlertCircle } from 'lucide-react'

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [product, setProduct] = useState<Product | null>(null)
  const [campaign, setCampaign] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  
  const supabase = createClient()

  useEffect(() => {
    if (!id) return

    async function fetchProductDetails() {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('products')
          .select('id, name, barcode, category, brand, model, color, memory, ram, storage, processor, screen_size, description, image_url, image_url_2, image_url_3, stock, sell_price, is_web_visible, device_condition_type, location, created_at')
          .eq('id', id)
          .single()

        if (error) throw error
        
        // Security check: Only allow showing web visible products
        if (data && (!data.is_web_visible || data.stock <= 0)) {
          setErrorMsg('Bu ürün perakende satışta aktif değildir.')
          return
        }

        setProduct(data)

        // Check if there are active campaigns for this product
        const { data: campaignProdData, error: campError } = await supabase
          .from('campaign_products')
          .select(`
            campaigns:campaign_id (
              id,
              name,
              description,
              discount_type,
              discount_value,
              is_active,
              starts_at,
              ends_at
            )
          `)
          .eq('product_id', id);

        if (!campError && campaignProdData) {
          const now = new Date()
          let bestCamp: any = null
          campaignProdData.forEach((row: any) => {
            const camp: any = row.campaigns;
            if (camp && camp.is_active) {
              const startsAt = new Date(camp.starts_at)
              const endsAt = camp.ends_at ? new Date(camp.ends_at) : null
              if (startsAt <= now && (!endsAt || endsAt >= now)) {
                if (!bestCamp || camp.discount_value > bestCamp.discount_value) {
                  bestCamp = camp
                }
              }
            }
          })
          setCampaign(bestCamp)
        }
      } catch (err: any) {
        console.error('Error fetching product details:', err)
        setErrorMsg('Ürün bulunamadı veya bir hata oluştu.')
      } finally {
        setLoading(false)
      }
    }

    fetchProductDetails()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 pt-32 flex justify-center items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="text-sm text-slate-500">Ürün detayları yükleniyor...</p>
        </div>
      </div>
    )
  }

  if (errorMsg || !product) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 pt-32 flex flex-col justify-center items-center px-4 space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500 animate-bounce" />
        <h2 className="text-lg font-bold">{errorMsg || 'Ürün bulunamadı'}</h2>
        <p className="text-slate-500 text-xs">Aradığınız ürün yayından kaldırılmış veya stokta kalmamış olabilir.</p>
        <Link
          href="/shop"
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-semibold transition-colors shadow-sm"
        >
          Mağazaya Geri Dön
        </Link>
      </div>
    )
  }

  const isSingleLeft = product.stock === 1;
  const publicTitle   = getPublicProductTitle(product);
  const displayCat    = formatCategoryName(product);

  useEffect(() => {
    if (publicTitle) {
      document.title = `${publicTitle} | HurCELL Teknoloji Mağazası`
    }
  }, [publicTitle])

  // Technical specifications to display
  const getConditionLabel = () => {
    const catGroup = getCategoryGroup(product)
    const isAksesuar = catGroup === 'aksesuar' || catGroup === 'sarj_kablo'
    
    if (isAksesuar) {
      if (product.device_condition_type === 'new_sealed' || product.device_condition_type === 'new_open_box') {
        return 'Sıfır Kapalı Kutu'
      }
      return 'Sıfır Ürün'
    }
    
    if (product.device_condition_type === 'new_sealed') return 'Sıfır Kapalı Kutu'
    if (product.device_condition_type === 'new_open_box') return 'Sıfır Açık Kutu'
    if (product.device_condition_type === 'display') return 'Teşhir Ürünü'
    if (product.device_condition_type === 'used') return 'İkinci El'
    if (product.device_condition_type === 'refurbished') return 'Yenilenmiş'
    if (product.device_condition_type === 'authorized_refurbished') return 'Yetkili Onarıcı Raporlu'
    
    return 'İkinci El / Diğer'
  }

  const catGroup = getCategoryGroup(product)
  const isAksesuar = catGroup === 'aksesuar' || catGroup === 'sarj_kablo'

  const specs = [
    { label: 'Kategori', value: product.category },
    { label: 'Marka', value: product.brand },
    { label: 'Model', value: product.model },
    { label: 'Renk', value: product.color },
    { label: 'Hafıza', value: product.memory },
    { label: 'RAM', value: product.ram },
    { label: 'Depolama', value: product.storage },
    { label: 'İşlemci', value: product.processor },
    { label: 'Ekran Boyutu', value: product.screen_size },
    ...(!isAksesuar ? [{ label: 'Cihaz Durumu', value: getConditionLabel() }] : []),
    { label: 'Barkod', value: product.barcode },
  ].filter(spec => spec.value && spec.value.trim() !== '')

  // Stock badge styling for detail page
  let stockLabel = ''
  let stockBadgeClass = ''
  if (product.stock > 5) {
    stockLabel = `Stokta · ${product.stock} adet`
    stockBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200'
  } else if (product.stock <= 5 && product.stock > 1) {
    stockLabel = `Az kaldı · ${product.stock} adet`
    stockBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200'
  } else if (product.stock === 1) {
    stockLabel = 'Son 1 adet'
    stockBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: publicTitle,
    image: product.image_url || getFallbackImage(product.category),
    description: product.description || `${publicTitle} teknoloji ürünü.`,
    sku: product.barcode || undefined,
    mpn: product.barcode || undefined,
    brand: {
      '@type': 'Brand',
      name: product.brand || 'HurCELL',
    },
    offers: {
      '@type': 'Offer',
      price: product.sell_price,
      priceCurrency: 'TRY',
      availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `https://www.hurcell.com/urun/${product.id}`,
    },
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-850 font-sans pt-28 pb-16 flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full py-6 space-y-6 flex-1">
        
        {/* Back navigation */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-550 hover:text-slate-800 transition-colors uppercase group cursor-pointer"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
          Geri Dön
        </button>

        {/* Product view container */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
          
          {/* Column Left: Image Preview & Gallery */}
          <div className="md:col-span-5 flex flex-col items-center gap-4">
            <div className="w-full aspect-square relative overflow-hidden bg-slate-50/50 rounded-2xl border border-slate-200/60 shadow-inner flex items-center justify-center p-6">
              <img
                src={selectedImage || product.image_url || getFallbackImage(product.category)}
                alt={publicTitle}
                className="max-w-full max-h-full object-contain transition-all duration-300"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = getFallbackImage(product.category)
                }}
              />
              
              {/* Son 1 adet badge overlay */}
              {isSingleLeft && (
                <span className="absolute right-4 top-4 px-3 py-1 rounded-xl bg-rose-500 text-white text-xs font-bold uppercase tracking-wider animate-pulse z-10">
                  Son 1 Adet
                </span>
              )}
            </div>

            {/* Thumbnail Gallery */}
            {(() => {
              const images = [product.image_url, product.image_url_2, product.image_url_3].filter(Boolean) as string[];
              if (images.length <= 1) return null;
              return (
                <div className="flex gap-2.5 justify-center w-full overflow-x-auto py-1">
                  {images.map((imgUrl, index) => {
                    const isSelected = (selectedImage || product.image_url) === imgUrl;
                    return (
                      <button
                        key={index}
                        onClick={() => setSelectedImage(imgUrl)}
                        className={`w-20 h-20 rounded-xl overflow-hidden border-2 bg-white flex items-center justify-center p-2 transition-all cursor-pointer ${
                          isSelected 
                            ? 'border-blue-600 shadow-sm scale-105' 
                            : 'border-slate-200 hover:border-slate-350 opacity-80 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={imgUrl}
                          alt={`${publicTitle} - Görsel ${index + 1}`}
                          className="max-w-full max-h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = getFallbackImage(product.category)
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Column Right: Details & specs */}
          <div className="md:col-span-7 flex flex-col space-y-6">
            
            {/* Main title & category */}
            <div className="space-y-1.5">
              <span className="text-xs uppercase tracking-wider font-semibold text-blue-600">
                {displayCat}
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 leading-tight">
                {publicTitle}
              </h1>
            </div>

            {/* Price & Stock info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-b border-slate-100 py-5 gap-4">
              <div>
                <p className="text-[10px] text-slate-450 uppercase font-mono tracking-wider">Satış Fiyatı</p>
                <p className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
                  {formatPriceTRY(product.sell_price)}
                </p>
              </div>
              
              {stockLabel && (
                <div className={`flex items-center gap-2 border px-4 py-2.5 rounded-2xl self-start sm:self-auto shadow-sm text-xs font-bold ${stockBadgeClass}`}>
                  <CheckCircle size={15} />
                  <span>{stockLabel}</span>
                </div>
              )}
            </div>

            {/* Campaign details */}
            {campaign && (
              <div className="bg-rose-50/70 border border-rose-100/80 rounded-2xl p-4 space-y-1.5 shadow-sm">
                <div className="flex items-center gap-2 text-rose-700 font-bold text-xs">
                  <span className="px-2 py-0.5 rounded bg-rose-500 text-white text-[10px] uppercase tracking-wider">Kampanya</span>
                  <span>{campaign.name}</span>
                </div>
                {campaign.description && (
                  <p className="text-slate-650 text-xs font-light">
                    {campaign.description}
                  </p>
                )}
                <div className="text-[11px] text-rose-600 font-semibold pt-1">
                  * Sepette otomatik uygulanır
                </div>
              </div>
            )}

            {/* Product Description */}
            {product.description && (
              <div className="space-y-2">
                <h3 className="text-xs font-mono tracking-wider uppercase text-slate-450">Ürün Açıklaması</h3>
                <p className="text-sm text-slate-650 leading-relaxed font-light">
                  {product.description}
                </p>
              </div>
            )}

            {/* Specifications Table */}
            <div className="space-y-3">
              <h3 className="text-xs font-mono tracking-wider uppercase text-slate-450">Teknik Özellikler</h3>
              <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-slate-50/50 shadow-inner">
                <table className="w-full text-xs text-left border-collapse">
                  <tbody>
                    {specs.map((spec, i) => (
                      <tr
                        key={spec.label}
                        className={`border-b border-slate-200/40 ${
                          i % 2 === 0 ? 'bg-slate-100/30' : 'bg-transparent'
                        }`}
                      >
                        <td className="px-4 py-3 font-semibold text-slate-500 w-1/3 border-r border-slate-200/40">
                          {spec.label}
                        </td>
                        <td className="px-4 py-3 text-slate-700 font-medium">
                          {spec.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* WhatsApp Purchase CTA */}
            <div className="pt-3">
              <a
                href={getWhatsAppLink(publicTitle, product.barcode, product.sell_price)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-sm hover:shadow cursor-pointer"
              >
                <ShoppingBag size={16} />
                WhatsApp'tan Bilgi Al & Rezerve Et
              </a>
              <p className="text-[10px] text-slate-450 font-light mt-2.5 text-center">
                Bu aşamada online ödeme alınmamaktadır. WhatsApp butonuna basarak ürünü sorgulayabilir ve rezerve edebilirsiniz.
              </p>
            </div>

          </div>

        </div>

      </div>
    </div>
  )
}
