'use client'

import React from 'react'
import Link from 'next/link'
import { ShoppingCart, User, Search, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center">
            <Link href="/" className="text-2xl font-bold tracking-tighter text-white">
              HUR<span className="text-blue-500">CELL</span>
            </Link>
          </div>

          <div className="hidden md:flex items-center space-x-8">
            <Link href="/shop" className="text-xs font-mono tracking-widest hover:text-blue-400 transition-colors">MAĞAZA</Link>
            <Link href="/collections" className="text-xs font-mono tracking-widest hover:text-blue-400 transition-colors">KOLEKSİYONLAR</Link>
            <Link href="/about" className="text-xs font-mono tracking-widest hover:text-blue-400 transition-colors">HAKKIMIZDA</Link>
          </div>

          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" className="text-white/60 hover:text-white">
              <Search className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-white/60 hover:text-white">
              <ShoppingCart className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-white/60 hover:text-white">
              <User className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="md:hidden text-white/60 hover:text-white">
              <Menu className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}
