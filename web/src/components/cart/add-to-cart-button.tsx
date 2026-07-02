'use client'

import React from 'react'
import { ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCart, CartItem } from '@/components/cart-provider'
import { toast } from 'sonner'
import type { Product } from '@/types'
import { getPublicProductTitle, getFallbackImage } from '@/lib/constants'

interface AddToCartButtonProps {
  product: Product
  className?: string
  fullWidth?: boolean
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export function AddToCartButton({ 
  product, 
  className = '', 
  fullWidth = false,
  size = 'sm'
}: AddToCartButtonProps) {
  const { addItem } = useCart()

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (product.stock <= 0) {
      toast.error('Bu ürün şu anda stokta yok.')
      return
    }

    const cartItem: CartItem = {
      product_id: product.id,
      name: getPublicProductTitle(product),
      image: product.image_url || getFallbackImage(product.category),
      price: product.sell_price,
      quantity: 1,
      stock_quantity: product.stock,
      barcode: product.barcode || undefined
    }

    addItem(cartItem)
    toast.success('Ürün sepete eklendi')
  }

  return (
    <Button 
      onClick={handleAddToCart}
      disabled={product.stock <= 0}
      size={size}
      className={`${fullWidth ? 'w-full' : ''} bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm flex items-center justify-center gap-2 rounded-xl py-2 h-auto text-[13px] ${className}`}
    >
      <ShoppingCart className="w-4 h-4" />
      <span>Sepete Ekle</span>
    </Button>
  )
}
