import React from 'react'

export default function ProductDetailLoading() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pt-32 flex justify-center items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
        <p className="text-sm text-slate-500 font-medium animate-pulse">Ürün detayları yükleniyor...</p>
      </div>
    </div>
  )
}
