'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ShoppingBag, ShieldAlert, Clock, CreditCard, XCircle, RefreshCw } from 'lucide-react'
import { formatPriceTRY } from '@/lib/constants'

interface OrderDetails {
  order_number: string
  customer_name: string
  customer_email: string
  customer_phone: string
  billing_address: string
  shipping_address: string
  total_amount: number
  currency: string
  status: string
  created_at: string
}

interface OrderItem {
  id: string
  product_title_snapshot: string
  barcode_snapshot: string | null
  unit_price_snapshot: number
  quantity: number
  line_total: number
}

function OrderTrackingContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const orderNumber = params.orderNumber as string
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [orderDetails, setOrderDetails] = useState<{
    order: OrderDetails
    items: OrderItem[]
  } | null>(null)

  useEffect(() => {
    if (!orderNumber || !token) {
      setErrorMsg('Geçersiz sipariş takip bağlantısı. Doğrulama anahtarı (token) eksik.')
      setLoading(false)
      return
    }

    async function fetchOrder() {
      try {
        setLoading(true)
        const res = await fetch(`/api/checkout/get-order?order_number=${orderNumber}&token=${token}`)
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Sipariş yüklenemedi.')
        }

        setOrderDetails(data)
      } catch (err: any) {
        console.error('Error loading order tracking:', err)
        setErrorMsg(err.message || 'Sipariş detayları yüklenirken hata oluştu.')
      } finally {
        setLoading(false)
      }
    }

    fetchOrder()
  }, [orderNumber, token])

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="text-sm text-slate-500 font-light">Sipariş bilgileri sorgulanıyor...</p>
        </div>
      </div>
    )
  }

  if (errorMsg || !orderDetails) {
    return (
      <div className="flex flex-col justify-center items-center py-12 px-4 space-y-4">
        <ShieldAlert className="w-12 h-12 text-rose-500 animate-pulse" />
        <h2 className="text-lg font-bold tracking-tight text-slate-900">Erişim Engellendi</h2>
        <p className="text-slate-500 text-xs sm:text-sm text-center max-w-sm font-light leading-relaxed">
          {errorMsg || 'Aradığınız sipariş kaydına erişilemedi.'}
        </p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => router.back()}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold tracking-wider transition-colors cursor-pointer"
          >
            Geri Dön
          </button>
          <Link
            href="/shop"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold tracking-wider transition-colors shadow-sm"
          >
            Mağazaya Git
          </Link>
        </div>
      </div>
    )
  }

  const { order, items } = orderDetails

  // Translate and style order status badges
  let statusLabel = 'Bekliyor'
  let statusColor = 'bg-amber-50 text-amber-700 border-amber-200'
  let StatusIcon = Clock

  if (order.status === 'paid') {
    statusLabel = 'Ödendi / Hazırlanıyor'
    statusColor = 'bg-emerald-50 text-emerald-700 border-emerald-200'
    StatusIcon = CreditCard
  } else if (order.status === 'failed') {
    statusLabel = 'Ödeme Başarısız'
    statusColor = 'bg-rose-50 text-rose-700 border-rose-200'
    StatusIcon = XCircle
  } else if (order.status === 'cancelled') {
    statusLabel = 'İptal Edildi'
    statusColor = 'bg-slate-100 text-slate-700 border-slate-300'
    StatusIcon = XCircle
  } else if (order.status === 'refunded') {
    statusLabel = 'İade Edildi'
    statusColor = 'bg-purple-50 text-purple-700 border-purple-200'
    StatusIcon = RefreshCw
  }

  return (
    <div className="space-y-6">
      {/* Navigation header */}
      <div className="flex justify-between items-center">
        <Link
          href="/shop"
          className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-500 hover:text-slate-850 transition-colors uppercase group"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
          Mağazaya Dön
        </Link>
        <div className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
          <StatusIcon size={12} />
          <span>{statusLabel}</span>
        </div>
      </div>

      {/* Order Details container */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="border-b border-slate-100 pb-5 space-y-1">
          <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Sipariş Durumu</span>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{order.order_number}</h1>
          <p className="text-[10px] text-slate-400 font-light">
            Oluşturulma Tarihi: {new Date(order.created_at).toLocaleString('tr-TR')}
          </p>
        </div>

        {/* Customer & Shipping Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-slate-100 pb-6 text-xs leading-relaxed">
          <div className="space-y-2">
            <h3 className="font-semibold text-slate-800 uppercase tracking-wider text-[10px] text-slate-400 font-mono">Müşteri Bilgileri</h3>
            <p className="font-medium text-slate-700">{order.customer_name}</p>
            <p className="font-light text-slate-550">{order.customer_phone}</p>
            <p className="font-light text-slate-550">{order.customer_email}</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-slate-850 uppercase tracking-wider text-[10px] text-slate-400 font-mono">Teslimat Adresi</h3>
            <p className="font-light text-slate-700">{order.shipping_address}</p>
          </div>
        </div>

        {/* Order items snapshots table */}
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-850 uppercase tracking-wider text-[10px] text-slate-400 font-mono">Sipariş Kalemleri</h3>
          <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-slate-50/50">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/60 border-b border-slate-200/40 text-slate-500 font-semibold">
                  <th className="px-4 py-3">Ürün</th>
                  <th className="px-4 py-3 text-center">Adet</th>
                  <th className="px-4 py-3 text-right">Birim Fiyat</th>
                  <th className="px-4 py-3 text-right">Toplam</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-200/30 text-slate-700">
                    <td className="px-4 py-3.5">
                      <div className="font-medium">{item.product_title_snapshot}</div>
                      {item.barcode_snapshot && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">Barkod: {item.barcode_snapshot}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center font-semibold">{item.quantity}</td>
                    <td className="px-4 py-3.5 text-right font-light">{formatPriceTRY(item.unit_price_snapshot)}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-800">{formatPriceTRY(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Grand total */}
        <div className="flex justify-between items-center bg-slate-50 border border-slate-150 rounded-2xl p-4 sm:p-5">
          <span className="text-xs sm:text-sm font-semibold text-slate-650">Ödenen Toplam Tutar</span>
          <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {formatPriceTRY(order.total_amount)}
          </span>
        </div>

      </div>
    </div>
  )
}

export default function OrderTrackingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-850 font-sans pt-28 pb-16 flex flex-col">
      <div className="max-w-[800px] mx-auto px-4 w-full py-6 space-y-6 flex-1">
        <Suspense fallback={
          <div className="flex justify-center items-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
              <p className="text-sm text-slate-500 font-light">Sipariş bilgileri yükleniyor...</p>
            </div>
          </div>
        }>
          <OrderTrackingContent />
        </Suspense>
      </div>
      {/* Static Footer */}
      <footer className="py-8 bg-slate-100 border-t border-slate-200 text-center text-[10px] text-slate-400 font-light mt-auto">
        <p>© 2026 HurCELL Teknoloji Mağazası. Tüm hakları saklıdır.</p>
      </footer>
    </div>
  )
}
