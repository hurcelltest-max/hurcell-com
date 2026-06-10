'use client'

import React from 'react'
import Link from 'next/link'
import { Search, Menu, FileSignature, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { B2B_LOGIN_URL, WHATSAPP_NUMBER } from '@/lib/constants'

export const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-slate-200/60 dark:border-slate-800/60 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center">
            <Link href="/" className="text-2xl font-bold tracking-tighter">
              <span className="text-foreground">HUR</span><span className="text-blue-500">CELL</span>
            </Link>
          </div>

          <div className="hidden md:flex items-center space-x-8">
            <Link href="/" className="text-xs font-mono tracking-widest text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">ANA SAYFA</Link>
            <Link href="/shop" className="text-xs font-mono tracking-widest text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">MAĞAZA / ÜRÜNLER</Link>
            <Link href="/satis-sozlesmesi" className="text-xs font-mono tracking-widest text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">SATIŞ SÖZLEŞMESİ</Link>
            <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Merhaba, HurCELL ile iletişime geçmek istiyorum.')}`} target="_blank" rel="noopener noreferrer" className="text-xs font-mono tracking-widest text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">İLETİŞİM</a>
          </div>

          <div className="flex items-center space-x-4">
            <Link href="/shop" aria-label="Arama yap">
              <Button variant="ghost" size="icon" className="text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors">
                <Search className="w-5 h-5" />
              </Button>
            </Link>
            <Link href="/satis-sozlesmesi" aria-label="Satış sözleşmesi">
              <Button variant="ghost" size="icon" className="text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors">
                <FileSignature className="w-5 h-5" />
              </Button>
            </Link>
            
            <a href={B2B_LOGIN_URL} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-mono tracking-widest text-[10px] uppercase transition-colors px-4 py-2">
                <LogIn className="w-3.5 h-3.5" />
                B2B Girişi
              </Button>
            </a>

            <Button variant="ghost" size="icon" className="md:hidden text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors">
              <Menu className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}
