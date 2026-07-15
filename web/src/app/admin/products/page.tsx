'use client'

import React, { useState } from 'react'
import { Plus, Upload, Download, Search, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog'

export default function ProductsPage() {
  const [isUploading, setIsUploading] = useState(false)

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setIsUploading(true)
      // Implementation for parsing CSV and uploading to Supabase
      console.log('Uploading file:', file.name)
      setTimeout(() => setIsUploading(false), 2000)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ürünler</h1>
          <p className="text-muted-foreground">Ürün stok ve katalog yönetimi.</p>
        </div>
        <div className="flex gap-4">
          <Input 
            type="file" 
            accept=".csv,.json" 
            className="hidden" 
            id="bulk-upload" 
            onChange={handleCSVUpload}
          />
          <label htmlFor="bulk-upload" className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 cursor-pointer">
            <Upload className="mr-2 h-4 w-4" /> 
            {isUploading ? 'Yükleniyor...' : 'Toplu Yükleme'}
          </label>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Ürün Ekle
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-dark border-white/10 max-w-2xl">
              <DialogHeader>
                <DialogTitle>Yeni Ürün Ekle</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Input placeholder="Ürün Adı" className="glass" />
                <textarea 
                  className="w-full h-32 glass rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" 
                  placeholder="Açıklama (Zengin Metin)"
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input placeholder="Fiyat (₺)" type="number" className="glass" />
                  <Input placeholder="Başlangıç Stoku" type="number" className="glass" />
                </div>
                <Input placeholder="Kategori" className="glass" />
                <Button className="w-full">Ürün Oluştur</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                const res = await fetch('/api/admin/add-test-product', { method: 'POST' })
                const json = await res.json()
                if (json.ok) alert(json.message || 'Inserted')
                else alert('Error: ' + (json.error || 'unknown'))
              } catch (e) {
                alert('Network error')
              }
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Test Ürünü Ekle
          </Button>
        </div>
      </div>

      <Card className="glass border-white/5">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Ürün ara..." className="pl-10 glass" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase font-mono text-muted-foreground border-b border-white/5">
                <tr>
                  <th className="px-6 py-4">ÜRÜN</th>
                  <th className="px-6 py-4">KATEGORİ</th>
                  <th className="px-6 py-4">FİYAT</th>
                  <th className="px-6 py-4">STOK</th>
                  <th className="px-6 py-4">DURUM</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-medium flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-white/5" />
                      HurCELL Test Ürünü v{i}
                    </td>
                    <td className="px-6 py-4">Aksesuar</td>
                    <td className="px-6 py-4 font-mono">₺2,499.00</td>
                    <td className="px-6 py-4">{10 * i} adet</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-full bg-green-500/10 text-green-500 text-[10px] font-bold">AKTİF</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
