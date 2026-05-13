import React from 'react'
import { LayoutDashboard, Package, ShoppingBag, Users, Upload } from 'lucide-react'
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
            <LayoutDashboard size={20} /> Dashboard
          </Link>
          <Link href="/admin/products" className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors">
            <Package size={20} /> Products
          </Link>
          <Link href="/admin/bulk-upload" className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors">
            <Upload size={20} /> Bulk Upload
          </Link>
          <Link href="/admin/orders" className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors">
            <ShoppingBag size={20} /> Orders
          </Link>
          <Link href="/admin/users" className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors">
            <Users size={20} /> Users
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-8">
        {children}
      </main>
    </div>
  )
}
