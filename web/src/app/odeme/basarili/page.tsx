'use client'

import React, { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, ArrowRight, ShoppingBag } from 'lucide-react'

function PaymentSuccessContent() {
  const searchParams = useSearchParams()
  const orderNumber = searchParams.get('order_number')
  const lookupToken = searchParams.get('token')

  useEffect(() => {
    // Clear cart storage upon successful checkout
    localStorage.removeItem('cart')
  }, [])

  return (
    <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm text-center space-y-6">
      <div className="flex justify-center">
        <div className="h-16 w-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center border border-emerald-100 shadow-sm animate-bounce">
          <CheckCircle size={36} />
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          Siparişiniz Alındı!
        </h1>
        <p className="text-slate-500 text-xs sm:text-sm font-light leading-relaxed">
          Ödemeniz başarıyla doğrulandı ve siparişiniz hazırlık aşamasına alındı.
        </p>
      </div>

      {orderNumber && (
        <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 space-y-1">
          <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">
            Sipariş Numarası
          </span>
          <span className="text-base font-extrabold text-slate-800 tracking-tight block">
            {orderNumber}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2 pt-2">
        {orderNumber && lookupToken && (
          <Link
            href={`/siparis/${orderNumber}?token=${lookupToken}`}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold tracking-wider transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            Sipariş Durumunu Takip Et
            <ArrowRight size={14} />
          </Link>
        )}
        
        <Link
          href="/shop"
          className="w-full py-3 border border-slate-200 hover:bg-slate-50 text-slate-650 rounded-xl text-xs font-semibold tracking-wider transition-colors flex items-center justify-center gap-2"
        >
          <ShoppingBag size={14} />
          Mağazaya Geri Dön
        </Link>
      </div>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pt-32 pb-16 flex justify-center items-center px-4">
      <Suspense fallback={
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
          <p className="text-xs text-slate-500">Yükleniyor...</p>
        </div>
      }>
        <PaymentSuccessContent />
      </Suspense>
    </div>
  )
}
