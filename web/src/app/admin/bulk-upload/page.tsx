'use client'

import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import Papa from 'papaparse'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function BulkUploadPage() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<{ success: number; errors: string[] } | null>(null)
  const supabase = createClient()

  const processData = async (data: any[]) => {
    const products = data.map((item: any) => {
      // Robust header matching (case-insensitive and trimmed)
      const findValue = (keys: string[]) => {
        const foundKey = Object.keys(item).find(k => 
          keys.some(key => k.trim().toLowerCase() === key.toLowerCase())
        );
        return foundKey ? item[foundKey] : null;
      };

      const name = findValue(["Ürün Adı", "name", "product_name", "productName"]);
      const brand = findValue(["Marka", "brand"]);
      const sku = findValue(["SKU", "barkod", "barcode"]);
      const priceRaw = findValue(["Fiyat", "price"]);
      const stockRaw = findValue(["Stok", "stock", "quantity"]);
      const category = findValue(["Kategori", "category"]);

      // Parse price
      let price = 0;
      if (typeof priceRaw === 'string') {
        const cleanPrice = priceRaw.replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.');
        price = parseFloat(cleanPrice);
      } else {
        price = parseFloat(priceRaw);
      }

      // Parse stock
      const stock = typeof stockRaw === 'string'
        ? parseInt(stockRaw.replace(/[^0-9]/g, '')) || 0
        : parseInt(stockRaw) || 0;

      return {
        id: crypto.randomUUID(),
        name: name || "Adsız Ürün", // Fallback to avoid NOT NULL constraint
        brand,
        sku,
        price: isNaN(price) ? 0 : price,
        stock: isNaN(stock) ? 0 : stock,
        category,
        updated_at: new Date().toISOString(),
      };
    });

    try {
      const { error } = await supabase
        .from('products')
        .upsert(products, { onConflict: 'sku' });

      if (error) throw error;

      setResults({ success: products.length, errors: [] });
      toast.success(`Successfully processed ${products.length} products.`);
    } catch (err: any) {
      console.error(err);
      setResults({ success: 0, errors: [err.message] });
      toast.error('Failed to upload products.');
    } finally {
      setLoading(false);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setLoading(true);
    setResults(null);

    const isJson = file.name.endsWith('.json');

    if (isJson) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content);
          await processData(Array.isArray(data) ? data : [data]);
        } catch (err: any) {
          console.error(err);
          setResults({ success: 0, errors: ["Invalid JSON format"] });
          setLoading(false);
        }
      };
      reader.readAsText(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          await processData(results.data);
        },
        error: (err) => {
          console.error(err);
          setLoading(false);
          toast.error('CSV Parsing failed.');
        }
      });
    }
  }, [supabase])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/json': ['.json']
    },
    multiple: false
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bulk Upload</h1>
        <p className="text-muted-foreground">Sync your product catalog using CSV or JSON files.</p>
      </div>

      <Card className="glass border-white/5">
        <CardHeader>
          <CardTitle>File Upload</CardTitle>
        </CardHeader>
        <CardContent>
          <div 
            {...getRootProps()} 
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer
              ${isDragActive ? 'border-primary bg-primary/5' : 'border-white/10 hover:border-white/20'}
              ${loading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-4">
              {loading ? (
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              ) : (
                <Upload className="h-12 w-12 text-muted-foreground" />
              )}
              <div className="space-y-1">
                <p className="text-lg font-medium">
                  {isDragActive ? 'Drop file here' : 'Click or drag to upload'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Support for CSV and JSON (up to 50MB)
                </p>
              </div>
            </div>
          </div>

          {results && (
            <div className="mt-8 space-y-4">
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">{results.success} products processed successfully.</span>
              </div>
              {results.errors.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    <span className="font-medium">Errors encountered:</span>
                  </div>
                  <ul className="list-disc list-inside text-sm text-muted-foreground pl-7">
                    {results.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button variant="outline" className="glass">Download Sample CSV</Button>
        <Button variant="outline" className="glass">View Documentation</Button>
      </div>
    </div>
  )
}
