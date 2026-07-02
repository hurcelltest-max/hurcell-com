'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

export interface CartItem {
  product_id: string
  name: string
  image: string
  price: number
  quantity: number
  stock_quantity: number
  barcode?: string
}

interface CartContextType {
  items: CartItem[]
  addItem: (item: CartItem) => void
  removeItem: (product_id: string) => void
  updateQuantity: (product_id: string, quantity: number) => void
  clearCart: () => void
  totalQuantity: number
  totalPrice: number
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isInitialized, setIsInitialized] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('hurcell_cart')
      if (stored) {
        setItems(JSON.parse(stored))
      }
    } catch (err) {
      console.error('Failed to load cart from localStorage', err)
    }
    setIsInitialized(true)
  }, [])

  // Save to localStorage when items change
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('hurcell_cart', JSON.stringify(items))
    }
  }, [items, isInitialized])

  const addItem = (newItem: CartItem) => {
    setItems(current => {
      const existing = current.find(i => i.product_id === newItem.product_id)
      if (existing) {
        return current.map(i => 
          i.product_id === newItem.product_id
            ? { ...i, quantity: Math.min(i.quantity + newItem.quantity, i.stock_quantity) }
            : i
        )
      }
      return [...current, newItem]
    })
  }

  const removeItem = (product_id: string) => {
    setItems(current => current.filter(i => i.product_id !== product_id))
  }

  const updateQuantity = (product_id: string, quantity: number) => {
    setItems(current => 
      current.map(i => {
        if (i.product_id === product_id) {
          return { ...i, quantity: Math.min(Math.max(1, quantity), i.stock_quantity) }
        }
        return i
      })
    )
  }

  const clearCart = () => setItems([])

  const totalQuantity = items.reduce((acc, item) => acc + item.quantity, 0)
  const totalPrice = items.reduce((acc, item) => acc + (item.price * item.quantity), 0)

  return (
    <CartContext.Provider value={{
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      totalQuantity,
      totalPrice
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
