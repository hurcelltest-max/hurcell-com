'use client'

import React, { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, RotateCcw, ShoppingBag } from 'lucide-react'

function PaymentFailContent() {
  const searchParams = useSearchParams()
  const errorMsg = searchParams.get('message') || 'Ödeme işlemi bankanız tarafından onaylanmadı veya iptal edildi.'

  return (
    <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm text-center space-y-6">
      <div className="flex justify-center">
        <div className="h-16 w-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center border border-rose-100 shadow-sm animate-pulse">
          <AlertTriangle size={36} />
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          Ödeme Başarısız
        </h1>
        <p className="text-slate-500 text-xs sm:text-sm font-light leading-relaxed">
          {errorMsg}
        </p>
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <button
          onClick={() => window.history.back()}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold tracking-wider transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <RotateCcw size={14} />
          Tekrar Denemeyi Dene
        </button>
        
        <Link
          href="/shop"
          className="w-full py-3 border border-slate-200 hover:bg-slate-50 text-slate-650 rounded-xl text-xs font-semibold tracking-wider transition-colors flex items-center justify-center gap-2"
        >
          <ShoppingBag size={14} />
          Alışverişe Devam Et
        </Link>
      </div>
    </div>
  )
}

export default function PaymentFailPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pt-32 pb-16 flex justify-center items-center px-4">
      <Suspense fallback={
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
          <p className="text-xs text-slate-500">Yükleniyor...</p>
        </div>
      }>
        <PaymentFailContent />
      </Suspense>
    </div>
  )
}
