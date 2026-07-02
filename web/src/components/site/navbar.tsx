'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Search, Menu, FileSignature, ShoppingCart, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { WHATSAPP_NUMBER } from '@/lib/constants'
import { useCart } from '@/components/cart-provider'
import { NAV_ITEMS } from '@/lib/navigation'

export const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { totalQuantity } = useCart();
  return (
    <nav className="top-0 left-0 right-0 z-50 bg-white border-b border-slate-200/80 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center">
            <Link href="/" className="text-2xl font-bold tracking-tighter" onClick={() => setIsMobileMenuOpen(false)}>
              <span className="text-slate-900">HUR</span><span className="text-blue-600">CELL</span>
            </Link>
          </div>

          <div className="hidden md:flex items-center space-x-6">
            {NAV_ITEMS.map((item) => (
              <Link key={item.label} href={item.href} className="text-[13px] font-medium tracking-wide text-slate-600 hover:text-blue-600 transition-colors uppercase">
                {item.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center space-x-4">
            <Link 
              href="/shop" 
              aria-label="Arama yap" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={buttonVariants({ variant: "ghost", size: "icon" }) + " text-slate-600 hover:text-blue-600 hover:bg-slate-100/80 transition-colors"}
            >
              <Search className="w-5 h-5" />
            </Link>
            <Link 
              href="/satis-sozlesmesi" 
              aria-label="Satış Sözleşmesi" 
              className={buttonVariants({ variant: "ghost", size: "icon" }) + " hidden sm:flex text-slate-600 hover:text-blue-600 hover:bg-slate-100/80 transition-colors"} 
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <FileSignature className="w-5 h-5" />
            </Link>
            
            <Link 
              href="/sepet" 
              className={buttonVariants({ variant: "ghost", size: "icon" }) + " relative text-slate-600 hover:text-blue-600 hover:bg-slate-100/80 transition-colors"}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <ShoppingCart className="w-5 h-5" />
              {totalQuantity > 0 && (
                <span className="absolute top-0 right-0 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-blue-600 rounded-full border-2 border-white">
                  {totalQuantity}
                </span>
              )}
            </Link>

            <Button 
              variant="ghost" 
              size="icon" 
              className="md:hidden text-slate-600 hover:text-blue-600 hover:bg-slate-100/80 transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? "Menüyü Kapat" : "Menüyü Aç"}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-20 left-0 right-0 bg-white border-b border-slate-200/80 shadow-lg z-50 flex flex-col px-4 py-6 space-y-4 max-h-[calc(100vh-5rem)] overflow-y-auto">
          <Link href="/" className="text-sm font-semibold text-slate-700 hover:text-blue-600 py-2 border-b border-slate-100" onClick={() => setIsMobileMenuOpen(false)}>Ana Sayfa</Link>
          
          {NAV_ITEMS.map((item) => (
            <Link key={item.label} href={item.href} className="text-sm font-semibold text-slate-700 hover:text-blue-600 py-2 border-b border-slate-100" onClick={() => setIsMobileMenuOpen(false)}>
              {item.label}
            </Link>
          ))}
          
          <div className="flex flex-col space-y-3 pt-4 border-t border-slate-100">
            <Link 
              href="/sepet" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={buttonVariants() + " w-full justify-center bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"}
            >
              <ShoppingCart className="w-4 h-4" />
              Sepetim {totalQuantity > 0 ? `(${totalQuantity})` : ''}
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
