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
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">Manage your futuristic inventory.</p>
        </div>
        <div className="flex gap-4">
          <Input 
            type="file" 
            accept=".csv,.json" 
            className="hidden" 
            id="bulk-upload" 
            onChange={handleCSVUpload}
          />
          <Button variant="outline" asChild>
            <label htmlFor="bulk-upload" className="cursor-pointer">
              <Upload className="mr-2 h-4 w-4" /> 
              {isUploading ? 'Uploading...' : 'Bulk Upload'}
            </label>
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-dark border-white/10 max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Product</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Input placeholder="Product Name" className="glass" />
                <textarea 
                  className="w-full h-32 glass rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" 
                  placeholder="Rich Text Description (WYSIWYG)"
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input placeholder="Price ($)" type="number" className="glass" />
                  <Input placeholder="Initial Stock" type="number" className="glass" />
                </div>
                <Input placeholder="Category" className="glass" />
                <Button className="w-full">Create Product</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="glass border-white/5">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search products..." className="pl-10 glass" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase font-mono text-muted-foreground border-b border-white/5">
                <tr>
                  <th className="px-6 py-4">Product</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Price</th>
                  <th className="px-6 py-4">Stock</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-medium flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-white/5" />
                      Neural Link v{i}
                    </td>
                    <td className="px-6 py-4">Cybernetics</td>
                    <td className="px-6 py-4 font-mono">$2,499.00</td>
                    <td className="px-6 py-4">{10 * i} units</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-full bg-green-500/10 text-green-500 text-[10px] font-bold">ACTIVE</span>
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
