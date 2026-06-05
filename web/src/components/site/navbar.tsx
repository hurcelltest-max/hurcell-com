'use client'

import React from 'react'
import Link from 'next/link'
import { ShoppingCart, User, Search, Menu, FileSignature } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-slate-200/60 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center">
            <Link href="/" className="text-2xl font-bold tracking-tighter">
              <span className="text-[#0F172A]">HUR</span><span className="text-blue-500">CELL</span>
            </Link>
          </div>

          <div className="hidden md:flex items-center space-x-8">
            <Link href="/shop" className="text-xs font-mono tracking-widest text-slate-600 hover:text-blue-600 transition-colors">MAĞAZA</Link>
            <Link href="/shop" className="text-xs font-mono tracking-widest text-slate-600 hover:text-blue-600 transition-colors">KOLEKSİYONLAR</Link>
            <Link href="/satis-sozlesmesi" className="text-xs font-mono tracking-widest text-slate-600 hover:text-blue-600 transition-colors">SATIŞ SÖZLEŞMESİ</Link>
            <Link href="/about" className="text-xs font-mono tracking-widest text-slate-600 hover:text-blue-600 transition-colors">HAKKIMIZDA</Link>
          </div>

          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" className="text-slate-600 hover:text-blue-600 hover:bg-slate-100/80 transition-colors">
              <Search className="w-5 h-5" />
            </Button>
            <Link href="/satis-sozlesmesi" aria-label="Satış sözleşmesi">
              <Button variant="ghost" size="icon" className="text-slate-600 hover:text-blue-600 hover:bg-slate-100/80 transition-colors">
                <FileSignature className="w-5 h-5" />
              </Button>
            </Link>
            <Button variant="ghost" size="icon" className="text-slate-600 hover:text-blue-600 hover:bg-slate-100/80 transition-colors">
              <ShoppingCart className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-slate-600 hover:text-blue-600 hover:bg-slate-100/80 transition-colors">
              <User className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="md:hidden text-slate-600 hover:text-blue-600 hover:bg-slate-100/80 transition-colors">
              <Menu className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}
