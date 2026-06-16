"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchProducts, Product } from "@/lib/productService";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

const MOVEMENT_LABELS: Record<string, string> = {
  IN: "Stok Girişi",
  OUT: "Stok Çıkışı",
  SALE: "Satış",
  RETURN: "İade",
  ADJUSTMENT: "Stok Düzeltme",
  DAMAGED: "Hasarlı Ürün",
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [todaySales, setTodaySales] = useState<number>(0);
  const [recentMovements, setRecentMovements] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: productsData, error: pError } = await fetchProducts();
      if (pError) throw new Error("Ürünler yüklenirken hata oluştu.");
      const prods = productsData || [];
      setProducts(prods as Product[]);

      // today's sales
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data: salesData, error: sError } = await (supabase as any)
        .from("sales")
        .select("total_price")
        .gte("created_at", start.toISOString());
      if (sError) throw new Error("Satışlar yüklenirken hata oluştu.");
      const sales = salesData || [];
      const totalToday = sales.reduce((acc: number, row: any) => acc + Number(row.total_price || 0), 0);
      setTodaySales(totalToday);

      // recent movements (last 5)
      const mvRes = await (supabase as any)
        .from("stock_movements")
        .select("*, products(id, name, barcode)")
        .order("created_at", { ascending: false })
        .limit(5);
      if (mvRes.error) throw new Error("Hareketler yüklenirken hata oluştu.");
      setRecentMovements(mvRes.data || []);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const totalProducts = products.length;
  const totalStock = products.reduce((acc, p) => acc + Number(p.stock || 0), 0);
  const lowStockList = products.filter((p) => (p.stock ?? 0) <= (p.min_stock ?? 0)).slice(0, 5);
  const lowStockCount = products.filter((p) => (p.stock ?? 0) <= (p.min_stock ?? 0)).length;

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/95 px-6 py-6 shadow-sm shadow-slate-900/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">Ana Dashboard</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Hoş geldiniz, HurCELL Stok Takip</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-600">Stok yönetimi için temel göstergeler burada yer alır. Mobil uyumlu arayüz ile hızlıca sayfalar arasında geçiş yapabilirsiniz.</p>
          </div>
          <div className="shrink-0 pt-2">
            <Link 
              href="/urunler#tum-urunler"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 hover:bg-slate-800 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-900/20 transition active:scale-95"
            >
              📋 Tüm Ürünleri Gör
            </Link>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Yükleniyor...</div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{error}</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
              <p className="text-sm font-medium text-slate-500">Toplam Ürün</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{totalProducts}</p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
              <p className="text-sm font-medium text-slate-500">Toplam Stok</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{totalStock}</p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
              <p className="text-sm font-medium text-slate-500">Düşük Stok</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{lowStockCount}</p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
              <p className="text-sm font-medium text-slate-500">Bugünkü Satış (₺)</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{todaySales.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
              <h3 className="text-lg font-semibold text-slate-900">Düşük Stok Ürünleri (ilk 5)</h3>
              <ul className="mt-3 space-y-2">
                {lowStockList.length === 0 ? (
                  <li className="text-sm text-slate-500">Düşük stokta ürün yok.</li>
                ) : (
                  lowStockList.map((p) => (
                    <li key={p.id} className="flex justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                        <div className="text-xs text-slate-500">{p.barcode || "-"} • {p.category || "-"}</div>
                      </div>
                      <div className="text-sm text-slate-900">{p.stock} / {p.min_stock}</div>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
              <h3 className="text-lg font-semibold text-slate-900">Bugünkü Son Hareketler</h3>
              <ul className="mt-3 space-y-2">
                {recentMovements.length === 0 ? (
                  <li className="text-sm text-slate-500">Hareket bulunamadı.</li>
                ) : (
                  recentMovements.map((m: any) => (
                    <li key={m.id} className="flex justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{m.products?.name || "-"}</div>
                        <div className="text-xs text-slate-500">{m.products?.barcode || "-"} • {MOVEMENT_LABELS[m.movement_type] || m.movement_type}</div>
                      </div>
                      <div className="text-sm text-slate-900">{m.quantity}</div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
