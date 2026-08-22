import React from 'react'
import { LayoutDashboard, Package, ShoppingBag, Users, Upload, CreditCard, Layers } from 'lucide-react'
import Link from 'next/link'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-background pt-20">
      <aside className="w-64 border-r border-slate-700/60 hidden md:block p-6 space-y-8">
        <div className="text-xs font-mono text-slate-400 font-semibold uppercase tracking-widest">Navigation</div>
        <nav className="space-y-2">
          <Link href="/admin" className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/60 text-white font-medium">
            <LayoutDashboard size={20} className="text-blue-400" /> Panel
          </Link>
          <Link href="/admin/products" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800/50 transition-colors font-medium">
            <Package size={20} /> Ürünler
          </Link>
          <Link href="/admin/bulk-upload" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800/50 transition-colors font-medium">
            <Upload size={20} /> Toplu Yükleme
          </Link>
          <Link href="/admin/orders" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800/50 transition-colors font-medium">
            <ShoppingBag size={20} /> Siparişler
          </Link>
          <Link href="/admin/cari" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800/50 transition-colors text-blue-400 font-medium">
            <Users size={20} /> Cari / Veresiye
          </Link>
          <Link href="/admin/finans" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800/50 transition-colors text-indigo-400 font-medium">
            <CreditCard size={20} /> Finans
          </Link>
          <Link href="/admin/operations" className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors">
            <Layers size={20} className="text-emerald-600 dark:text-emerald-400" /> HurCELL Operasyon
          </Link>
          <Link href="/admin/kasa" className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 text-blue-400 font-bold border border-blue-500/20 hover:bg-blue-500/20 transition-colors">
            <ShoppingBag size={20} className="text-blue-400" /> Kasa Föyü & Satış
          </Link>
          <Link href="/admin/users" className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors">
            <Users size={20} /> Kullanıcılar
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-8">
        {children}
      </main>
    </div>
  )
}
