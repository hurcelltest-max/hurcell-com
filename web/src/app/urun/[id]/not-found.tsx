import React from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowLeft } from 'lucide-react'

export default function ProductDetailNotFound() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pt-32 flex flex-col justify-center items-center px-4 space-y-4">
      <AlertCircle className="w-12 h-12 text-rose-500 animate-bounce" />
      <h2 className="text-lg font-bold text-slate-900">Ürün Bulunamadı</h2>
      <p className="text-slate-500 text-xs text-center max-w-sm leading-relaxed">
        Aradığınız ürün perakende satışta aktif olmayabilir, yayından kaldırılmış veya stokta kalmamış olabilir.
      </p>
      <Link
        href="/shop"
        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-semibold transition-colors shadow-sm inline-flex items-center gap-2"
      >
        <ArrowLeft size={14} />
        Mağazaya Geri Dön
      </Link>
    </div>
  )
}
