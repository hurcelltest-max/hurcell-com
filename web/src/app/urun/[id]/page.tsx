'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { getWhatsAppLink, getFallbackImage, formatPriceTRY } from '@/lib/constants'
import type { Product } from '@/types'
import { ArrowLeft, ShoppingBag, CheckCircle, AlertCircle, FileText } from 'lucide-react'

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  const supabase = createClient()

  useEffect(() => {
    if (!id) return

    async function fetchProductDetails() {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('products')
          .select('id, name, barcode, category, brand, model, color, memory, ram, storage, processor, screen_size, description, image_url, stock, sell_price, is_web_visible, device_condition_type, location')
          .eq('id', id)
          .single()

        if (error) throw error
        
        // Security check: Only allow showing web visible products
        if (data && (!data.is_web_visible || data.stock <= 0)) {
          setErrorMsg('Bu ürün perakende satışta aktif değildir.')
          return
        }

        setProduct(data)
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
      <div className="min-h-screen bg-slate-950 text-slate-100 pt-32 flex justify-center items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          <p className="text-sm text-slate-500">Ürün detayları yükleniyor...</p>
        </div>
      </div>
    )
  }

  if (errorMsg || !product) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 pt-32 flex flex-col justify-center items-center px-4 space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500" />
        <h2 className="text-xl font-bold">{errorMsg || 'Ürün bulunamadı'}</h2>
        <p className="text-slate-500 text-sm">Aradığınız ürün yayından kaldırılmış veya stokta kalmamış olabilir.</p>
        <Link
          href="/shop"
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors"
        >
          Mağazaya Geri Dön
        </Link>
      </div>
    )
  }

  const isSingleLeft = product.stock === 1;

  // Technical specifications to display
  const specs = [
    { label: 'Marka', value: product.brand },
    { label: 'Model', value: product.model },
    { label: 'Kategori', value: product.category },
    { label: 'Renk', value: product.color },
    { label: 'Hafıza', value: product.memory },
    { label: 'RAM', value: product.ram },
    { label: 'Depolama', value: product.storage },
    { label: 'İşlemci', value: product.processor },
    { label: 'Ekran Boyutu', value: product.screen_size },
    { label: 'Cihaz Durumu', value: product.device_condition_type === 'new_sealed' ? 'Sıfır Kapalı Kutu' : 'İkinci El / Diğer' },
    { label: 'Konum', value: product.location },
    { label: 'Barkod', value: product.barcode },
  ].filter(spec => spec.value && spec.value.trim() !== '')

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pt-28 pb-16 flex flex-col">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full py-8 space-y-8 flex-1">
        
        {/* Back navigation */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-xs font-mono tracking-widest text-slate-400 hover:text-white transition-colors uppercase group cursor-pointer"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
          GERİ DÖN
        </button>

        {/* Product view container */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 bg-slate-900/10 border border-slate-900 rounded-3xl p-6 sm:p-8">
          
          {/* Column Left: Image Preview */}
          <div className="md:col-span-5 flex flex-col items-center">
            <div className="w-full aspect-[4/5] relative overflow-hidden bg-slate-950 rounded-2xl border border-slate-900">
              <img
                src={product.image_url || getFallbackImage(product.category)}
                alt={product.name}
                className="w-full h-full object-cover object-center"
              />
              
              {/* Son 1 adet badge */}
              {isSingleLeft && (
                <span className="absolute right-4 top-4 px-3 py-1 rounded bg-rose-500 text-white text-xs font-bold uppercase tracking-widest animate-pulse">
                  Son 1 Adet
                </span>
              )}
            </div>
          </div>

          {/* Column Right: Details & specs */}
          <div className="md:col-span-7 flex flex-col space-y-6">
            
            {/* Main title & category */}
            <div className="space-y-1.5">
              <span className="text-xs uppercase tracking-widest font-mono text-slate-500">
                {product.category || 'Kategori belirtilmemiş'}
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
                {product.name}
              </h1>
            </div>

            {/* Price & Stock info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-b border-slate-900 py-4 gap-4">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-mono tracking-widest">Satış Fiyatı</p>
                <p className="text-3xl font-extrabold text-white tracking-tight mt-1">
                  {formatPriceTRY(product.sell_price)}
                </p>
              </div>
              
              <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-950 px-4 py-2 rounded-2xl self-start sm:self-auto">
                <CheckCircle size={16} />
                <span className="text-xs font-semibold">Stokta Var ({product.stock} adet)</span>
              </div>
            </div>

            {/* Product Description */}
            {product.description && (
              <div className="space-y-2">
                <h3 className="text-xs font-mono tracking-widest uppercase text-slate-400">Ürün Açıklaması</h3>
                <p className="text-sm text-slate-300 leading-relaxed font-light">
                  {product.description}
                </p>
              </div>
            )}

            {/* Specifications Table */}
            <div className="space-y-3">
              <h3 className="text-xs font-mono tracking-widest uppercase text-slate-400">Teknik Özellikler</h3>
              <div className="border border-slate-900 rounded-2xl overflow-hidden bg-slate-950/40">
                <table className="w-full text-xs text-left border-collapse">
                  <tbody>
                    {specs.map((spec, i) => (
                      <tr
                        key={spec.label}
                        className={`border-b border-slate-900/80 ${
                          i % 2 === 0 ? 'bg-slate-900/10' : 'bg-transparent'
                        }`}
                      >
                        <td className="px-4 py-3 font-semibold text-slate-500 w-1/3 border-r border-slate-900/50">
                          {spec.label}
                        </td>
                        <td className="px-4 py-3 text-slate-200 font-medium">
                          {spec.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* WhatsApp Purchase CTA */}
            <div className="pt-4">
              <a
                href={getWhatsAppLink(product.name, product.barcode, product.sell_price)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-950/20 hover:shadow-xl cursor-pointer"
              >
                <ShoppingBag size={18} />
                WhatsApp'tan Bilgi Al & Rezerve Et
              </a>
              <p className="text-[10px] text-slate-500 font-light mt-2 text-center">
                Bu aşamada online ödeme alınmamaktadır. WhatsApp butonuna basarak ürünü sorgulayabilir ve rezerve edebilirsiniz.
              </p>
            </div>

          </div>

        </div>

      </div>

      {/* Footer */}
      <footer className="py-12 bg-slate-950 border-t border-slate-900 text-center text-xs text-slate-600 font-light mt-auto">
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
