'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ShoppingBag, ShieldCheck, Truck, Info, Clock, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { formatPriceTRY, getFallbackImage, getPublicProductTitle } from '@/lib/constants'
import type { Product } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

function CheckoutContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  const productId = searchParams.get('product_id')
  const qtyParam = searchParams.get('qty')
  const quantity = parseInt(qtyParam || '1', 10) || 1

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Customer details form state
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    district: '',
    postalCode: '',
    orderNote: ''
  })

  useEffect(() => {
    if (!productId) {
      setErrorMsg('Sipariş edilecek ürün bulunamadı. Lütfen mağazadan bir ürün seçin.')
      setLoading(false)
      return
    }

    async function fetchProduct() {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('products')
          .select('id, name, brand, model, color, memory, ram, storage, sell_price, image_url, stock, is_web_visible, barcode')
          .eq('id', productId)
          .single()

        if (error || !data) {
          throw new Error('Ürün bilgileri alınamadı.')
        }

        if (!data.is_web_visible || data.stock <= 0) {
          throw new Error('Bu ürün şu an perakende satışa açık değildir.')
        }

        setProduct(data)
      } catch (err: any) {
        console.error('Error fetching product for checkout:', err)
        setErrorMsg(err.message || 'Ürün bilgileri sorgulanırken hata oluştu.')
      } finally {
        setLoading(false)
      }
    }

    fetchProduct()
  }, [productId])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product) return

    // Validate inputs
    if (!formData.fullName.trim()) {
      toast.error('Ad Soyad alanı zorunludur.')
      return
    }
    if (!formData.phone.trim()) {
      toast.error('Telefon numarası zorunludur.')
      return
    }
    if (!formData.email.trim()) {
      toast.error('E-posta adresi zorunludur.')
      return
    }
    if (!formData.address.trim()) {
      toast.error('Teslimat adresi zorunludur.')
      return
    }
    if (!formData.city.trim()) {
      toast.error('İl alanı zorunludur.')
      return
    }
    if (!formData.district.trim()) {
      toast.error('İlçe alanı zorunludur.')
      return
    }

    try {
      setSubmitting(true)

      // Build full shipping address combining Address, District, City, Postal Code
      const fullAddress = `${formData.address.trim()} ${formData.district.trim()} / ${formData.city.trim()}${formData.postalCode.trim() ? ` P.K: ${formData.postalCode.trim()}` : ''}`
      const fullBillingAddress = fullAddress // simple flow uses shipping address for billing too

      const orderPayload = {
        customer_name: formData.fullName.trim(),
        customer_email: formData.email.trim(),
        customer_phone: formData.phone.trim(),
        billing_address: fullBillingAddress,
        shipping_address: fullAddress,
        items: [
          {
            product_id: product.id,
            quantity: quantity
          }
        ]
      }

      const response = await fetch('/api/checkout/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderPayload)
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Sipariş oluşturulamadı.')
      }

      toast.success('Siparişiniz başarıyla alındı!')
      
      // Redirect to the success order tracking page
      router.push(`/siparis/${result.order_number}?token=${result.lookup_token}`)
    } catch (err: any) {
      console.error('Submit order error:', err)
      toast.error(err.message || 'Sipariş oluşturulurken bir hata oluştu.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="text-sm text-slate-500 font-light">Sipariş oturumu hazırlanıyor...</p>
        </div>
      </div>
    )
  }

  if (errorMsg || !product) {
    return (
      <div className="flex flex-col justify-center items-center py-20 px-4 space-y-4">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900">Sipariş Akışı Başlatılamadı</h2>
        <p className="text-slate-500 text-xs sm:text-sm text-center max-w-sm font-light leading-relaxed">
          {errorMsg || 'Geçersiz veya süresi dolmuş sepet oturumu.'}
        </p>
        <Link
          href="/shop"
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold tracking-wider transition-colors shadow-sm"
        >
          Mağazaya Geri Dön
        </Link>
      </div>
    )
  }

  const sellPrice = product.sell_price || 0
  const productSubtotal = sellPrice * quantity
  // Kargo Bedeli Kuralı:
  // Subtotal <= 999 TL -> 125 TL shipping fee
  // Subtotal >= 1000 TL -> Free shipping (0 TL)
  const shippingFee = productSubtotal <= 999 ? 125 : 0
  const grandTotal = productSubtotal + shippingFee
  const publicTitle = getPublicProductTitle(product)

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Back Link */}
      <div className="flex items-center justify-between">
        <Link
          href={`/urun/${product.id}`}
          className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-500 hover:text-slate-850 transition-colors uppercase group"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
          Ürün Detayına Dön
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left: Customer Info Form */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Teslimat Bilgileri</h2>
              <p className="text-xs text-slate-400 font-light mt-0.5">Siparişinizin ulaştırılabilmesi için bilgileri eksik doldurmayın.</p>
            </div>

            <form onSubmit={handleSubmitOrder} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="fullName" className="block text-[11px] font-bold text-slate-550 uppercase tracking-wider mb-1.5 font-mono">Ad Soyad *</label>
                  <Input
                    type="text"
                    id="fullName"
                    name="fullName"
                    required
                    placeholder="Adınız ve Soyadınız"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    className="glass rounded-xl text-sm animate-none"
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-[11px] font-bold text-slate-550 uppercase tracking-wider mb-1.5 font-mono">Telefon *</label>
                  <Input
                    type="tel"
                    id="phone"
                    name="phone"
                    required
                    placeholder="05xx xxx xx xx"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="glass rounded-xl text-sm animate-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-[11px] font-bold text-slate-555 uppercase tracking-wider mb-1.5 font-mono">E-posta Adresi *</label>
                <Input
                  type="email"
                  id="email"
                  name="email"
                  required
                  placeholder="ornek@alanadi.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="glass rounded-xl text-sm animate-none"
                />
              </div>

              <div>
                <label htmlFor="address" className="block text-[11px] font-bold text-slate-555 uppercase tracking-wider mb-1.5 font-mono">Teslimat Adresi *</label>
                <textarea
                  id="address"
                  name="address"
                  required
                  rows={3}
                  placeholder="Mahalle, sokak, daire no, apartman vb."
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="city" className="block text-[11px] font-bold text-slate-555 uppercase tracking-wider mb-1.5 font-mono">İl *</label>
                  <Input
                    type="text"
                    id="city"
                    name="city"
                    required
                    placeholder="İl"
                    value={formData.city}
                    onChange={handleInputChange}
                    className="glass rounded-xl text-sm animate-none"
                  />
                </div>
                <div>
                  <label htmlFor="district" className="block text-[11px] font-bold text-slate-555 uppercase tracking-wider mb-1.5 font-mono">İlçe *</label>
                  <Input
                    type="text"
                    id="district"
                    name="district"
                    required
                    placeholder="İlçe"
                    value={formData.district}
                    onChange={handleInputChange}
                    className="glass rounded-xl text-sm animate-none"
                  />
                </div>
                <div>
                  <label htmlFor="postalCode" className="block text-[11px] font-bold text-slate-555 uppercase tracking-wider mb-1.5 font-mono">Posta Kodu (Opsiyonel)</label>
                  <Input
                    type="text"
                    id="postalCode"
                    name="postalCode"
                    placeholder="Posta Kodu"
                    value={formData.postalCode}
                    onChange={handleInputChange}
                    className="glass rounded-xl text-sm animate-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="orderNote" className="block text-[11px] font-bold text-slate-555 uppercase tracking-wider mb-1.5 font-mono">Sipariş Notu (Opsiyonel)</label>
                <textarea
                  id="orderNote"
                  name="orderNote"
                  rows={2}
                  placeholder="Kuryeye iletmek istediğiniz özel bir not var mı?"
                  value={formData.orderNote}
                  onChange={handleInputChange}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                />
              </div>

              {/* Submit CTA button */}
              <div className="pt-3">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 size={16} />
                  {submitting ? 'Siparişiniz Kaydediliyor...' : 'Kapıda Ödemeli Sipariş Ver'}
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Right: Order Summary & Payment Mode Info */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Product Summary */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider font-mono border-b border-slate-100 pb-3">Sipariş Özeti</h3>
            
            <div className="flex gap-4 items-center">
              <div className="relative w-16 h-16 bg-slate-50 rounded-2xl border border-slate-150 overflow-hidden flex items-center justify-center flex-shrink-0">
                <img
                  src={product.image_url || getFallbackImage(product.category)}
                  alt={publicTitle}
                  className="object-contain max-w-full max-h-full p-1.5"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-800 truncate">{publicTitle}</h4>
                <p className="text-[10px] text-slate-450 font-light mt-0.5">Adet: {quantity} • Barkod: {product.barcode || '-'}</p>
              </div>
              <div className="text-right text-sm font-bold text-slate-900 whitespace-nowrap">
                {formatPriceTRY(productSubtotal)}
              </div>
            </div>

            {/* Price Calculations */}
            <div className="space-y-2 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-650">
              <div className="flex justify-between">
                <span>Ürün Toplamı</span>
                <span className="font-medium text-slate-800">{formatPriceTRY(productSubtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kargo ve Kapıda Ödeme Hizmeti</span>
                <span className={`font-semibold ${shippingFee === 0 ? 'text-emerald-600' : 'text-slate-850'}`}>
                  {shippingFee === 0 ? 'Ücretsiz' : formatPriceTRY(shippingFee)}
                </span>
              </div>
              
              <div className="flex justify-between border-t border-slate-100 pt-3 text-sm font-bold text-slate-900">
                <span>Genel Toplam</span>
                <span className="text-base font-black text-blue-600 tracking-tight">{formatPriceTRY(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Payment Method Details */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-550 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-blue-600" />
              Ödeme Yöntemi: DHL Kapıda Ödeme
            </h3>
            
            <div className="bg-white border border-slate-150 rounded-2xl p-4 flex gap-3 items-start shadow-inner">
              <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-650 leading-relaxed font-light">
                999 TL altı siparişlerde DHL kargo bedeli 125 TL’dir. 1000 TL ve üzeri siparişlerde kargo ücretsizdir. Ödeme DHL teslimatı sırasında kapıda alınacaktır.
              </p>
            </div>

            <div className="flex items-center gap-2.5 text-[10px] text-slate-400 font-light">
              <Truck size={12} className="text-slate-500" />
              <span>Teslimat: DHL kargo süreci başlatıldığında takip bilgisi paylaşılacaktır.</span>
            </div>
            
            <div className="flex items-center gap-2.5 text-[10px] text-slate-400 font-light">
              <Clock size={12} className="text-slate-500" />
              <span>Sipariş Onayı: Siparişiniz alındıktan sonra HurCELL tarafından doğrulanacaktır.</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-850 font-sans pt-28 pb-16 flex flex-col">
      <Suspense fallback={
        <div className="flex justify-center items-center py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
            <p className="text-sm text-slate-500 font-light">Checkout yükleniyor...</p>
          </div>
        </div>
      }>
        <CheckoutContent />
      </Suspense>
    </div>
  )
}
