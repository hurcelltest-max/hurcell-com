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
      <aside className="w-64 border-r border-white/5 hidden md:block p-6 space-y-8">
        <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Navigation</div>
        <nav className="space-y-2">
          <Link href="/admin" className="flex items-center gap-3 p-3 rounded-lg bg-white/5 text-primary">
            <LayoutDashboard size={20} /> Panel
          </Link>
          <Link href="/admin/products" className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors">
            <Package size={20} /> Ürünler
          </Link>
          <Link href="/admin/bulk-upload" className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors">
            <Upload size={20} /> Toplu Yükleme
          </Link>
          <Link href="/admin/orders" className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors">
            <ShoppingBag size={20} /> Siparişler
          </Link>
          <Link href="/admin/cari" className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors text-blue-400">
            <Users size={20} /> Cari / Veresiye
          </Link>
          <Link href="/admin/finans" className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors text-indigo-400">
            <CreditCard size={20} /> Finans
          </Link>
          <Link href="/admin/operations" className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors text-emerald-400 font-semibold">
            <Layers size={20} /> HurCELL Operasyon
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
