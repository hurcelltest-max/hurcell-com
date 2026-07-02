'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCart } from '@/components/cart-provider'
import { Trash2, Plus, Minus, ArrowRight } from 'lucide-react'
import { formatPriceTRY, getFallbackImage } from '@/lib/constants'
import { Button } from '@/components/ui/button'

export default function CartPage() {
  const { items, updateQuantity, removeItem, totalPrice } = useCart()
  const router = useRouter()

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-center">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">Sepetiniz Boş</h1>
        <p className="text-slate-500 mb-8 max-w-md mx-auto">
          Sepetinizde henüz ürün bulunmuyor. Alışverişe başlamak için ürünlerimize göz atabilirsiniz.
        </p>
        <Link href="/shop">
          <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
            Alışverişe Başla
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-8">Sepetim</h1>

      <div className="lg:grid lg:grid-cols-12 lg:gap-x-12 lg:items-start">
        <div className="lg:col-span-7 xl:col-span-8">
          <ul className="divide-y divide-slate-200 border-t border-b border-slate-200">
            {items.map((item) => (
              <li key={item.product_id} className="flex py-6 sm:py-8">
                <div className="flex-shrink-0">
                  <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-lg border border-slate-200 bg-white overflow-hidden">
                    <Image
                      src={item.image || getFallbackImage()}
                      alt={item.name}
                      fill
                      className="object-contain p-2"
                    />
                  </div>
                </div>

                <div className="ml-4 flex-1 flex flex-col justify-between sm:ml-6">
                  <div className="relative pr-9 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:pr-0">
                    <div>
                      <div className="flex justify-between">
                        <h3 className="text-sm sm:text-base font-medium text-slate-900">
                          <Link href={`/urun/${item.product_id}`} className="hover:text-blue-600">
                            {item.name}
                          </Link>
                        </h3>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-900">{formatPriceTRY(item.price)}</p>
                    </div>

                    <div className="mt-4 sm:mt-0 sm:pr-9 flex items-center gap-4">
                      <div className="flex items-center border border-slate-300 rounded-md">
                        <button
                          type="button"
                          className="p-2 text-slate-600 hover:bg-slate-50 transition-colors"
                          onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-10 text-center text-sm font-medium">{item.quantity}</span>
                        <button
                          type="button"
                          className="p-2 text-slate-600 hover:bg-slate-50 transition-colors"
                          onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                          disabled={item.quantity >= item.stock_quantity}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-500 transition-colors"
                        onClick={() => removeItem(item.product_id)}
                      >
                        <span className="sr-only">Sil</span>
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Order summary */}
        <section className="mt-16 bg-slate-50 rounded-2xl p-6 sm:p-8 lg:p-8 lg:mt-0 lg:col-span-5 xl:col-span-4 border border-slate-100">
          <h2 className="text-lg font-medium text-slate-900">Sipariş Özeti</h2>

          <dl className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <dt className="text-sm text-slate-600">Ara Toplam</dt>
              <dd className="text-sm font-medium text-slate-900">{formatPriceTRY(totalPrice)}</dd>
            </div>
            
            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <dt className="text-base font-bold text-slate-900">Toplam Tutarı</dt>
              <dd className="text-xl font-bold text-slate-900">{formatPriceTRY(totalPrice)}</dd>
            </div>
          </dl>

          <div className="mt-8 space-y-4">
            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700 h-14 text-base font-bold rounded-xl"
              onClick={() => router.push('/checkout')}
            >
              Siparişi Tamamla <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button 
              variant="outline"
              className="w-full bg-white h-12 text-sm font-semibold rounded-xl"
              onClick={() => router.push('/shop')}
            >
              Alışverişe Devam Et
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
