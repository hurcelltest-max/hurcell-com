'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, ShoppingCart, Zap } from 'lucide-react'

type Product = {
  id: string;
  name: string;
  brand: string | null;
  sku: string | null;
  price: number;
  stock: number;
  category: string | null;
  image_url: string | null;
}

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchProducts() {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) {
          console.error("Error fetching products:", error)
        } else if (data) {
          setProducts(data)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchProducts()
  }, [supabase])

  return (
    <div className="min-h-screen pt-32 pb-20 px-4 md:px-8 max-w-7xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-white mb-4">
          HURCELL MAĞAZA
        </h1>
        <p className="text-white/40 font-mono">EN YENİ TEKNOLOJİ ÜRÜNLERİ VE AKSESUARLAR</p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 border border-white/10 rounded-xl glass">
          <p className="text-white/60">Henüz ürün bulunmamaktadır.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product) => (
            <Card key={product.id} className="group glass border-white/10 hover:border-blue-500/50 transition-all duration-300 overflow-hidden bg-white/5 rounded-xl">
              <div className="aspect-square bg-gradient-to-br from-white/5 to-transparent relative p-6 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-mono text-white/40 uppercase tracking-wider bg-black/50 px-2 py-1 rounded">
                    {product.category || 'Aksesuar'}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                    <Zap size={14} className="text-white/40 group-hover:text-blue-400" />
                  </div>
                </div>
                
                <div className="flex justify-center items-center my-4 opacity-50 group-hover:opacity-100 transition-opacity">
                   <div className="w-24 h-24 border-2 border-white/10 rounded-full flex items-center justify-center">
                     <span className="text-white/20 font-mono text-[10px]">NO IMAGE</span>
                   </div>
                </div>
              </div>

              <CardContent className="p-5">
                {product.brand && (
                  <p className="text-xs font-mono text-blue-400/80 mb-1">{product.brand}</p>
                )}
                <h3 className="font-bold text-white mb-2 line-clamp-2 leading-tight">
                  {product.name}
                </h3>
                
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                  <p className="text-lg font-black text-white">
                    {product.price.toLocaleString('tr-TR')} ₺
                  </p>
                  <button className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-blue-500 transition-colors text-white">
                    <ShoppingCart size={14} />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
