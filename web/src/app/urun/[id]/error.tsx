'use client'

import React, { useEffect } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, ShoppingBag } from 'lucide-react'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ProductDetailError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Product Detail Route Error Boundary Captured:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pt-32 pb-16 flex flex-col justify-center items-center px-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center space-y-6">
        <div className="flex justify-center">
          <div className="p-4 bg-rose-50 text-rose-600 rounded-full animate-pulse">
            <AlertCircle className="w-12 h-12" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900">Ürün Yüklenemedi</h2>
          <p className="text-slate-500 text-xs leading-relaxed">
            Aradığınız ürün detayları yüklenirken teknik bir aksaklık oluştu. Lütfen sayfayı yenilemeyi deneyin veya doğrudan WhatsApp destek hattımızla iletişime geçin.
          </p>
        </div>

        <div className="pt-2 flex flex-col gap-3">
          <button
            onClick={() => reset()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-semibold transition-colors shadow-sm cursor-pointer"
          >
            Yeniden Dene
          </button>
          
          <a
            href="https://wa.me/905322269362?text=Merhaba,%20HurCELL%20web%20sitesinde%20bir%20ürün%20detayını%20incelerken%20hata%20aldım.%20Bilgi%20alabilir%20miyim?"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <ShoppingBag size={14} />
            WhatsApp'tan Bilgi Al
          </a>

          <Link
            href="/shop"
            className="inline-flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors uppercase pt-2"
          >
            <ArrowLeft size={12} />
            Mağazaya Geri Dön
          </Link>
        </div>

        {error.digest && (
          <p className="text-[10px] text-slate-350 font-mono pt-4 border-t border-slate-100">
            Hata Kodu: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
