"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";
import { normalizeForSearch } from "@/lib/stringUtils";

const MOVEMENT_LABELS: Record<string, string> = {
  IN: "Stok Girişi",
  OUT: "Stok Çıkışı",
  SALE: "Satış",
  RETURN: "İade",
  ADJUSTMENT: "Stok Düzeltme",
  DAMAGED: "Hasarlı Ürün",
};

export default function HareketlerPage() {
  const [loading, setLoading] = useState(false);
  const [movements, setMovements] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  useEffect(() => {
    loadMovements();
  }, []);

  const loadMovements = async () => {
    setLoading(true);
    try {
      // select movements with related product info
      const res = await (supabase as any)
        .from("stock_movements")
        .select("*, products(id, name, barcode, category)")
        .order("created_at", { ascending: false });

      if (res.error) {
        console.error(res.error);
        setMovements([]);
      } else {
        // normalize rows: product may be in 'products' field or null
        const rows = (res.data || []).map((r: any) => ({
          id: r.id,
          created_at: r.created_at,
          movement_type: r.movement_type,
          quantity: r.quantity,
          note: r.note,
          product: r.products || null,
        }));
        setMovements(rows);
      }
    } catch (err) {
      console.error(err);
      setMovements([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      if (filterType !== "ALL" && m.movement_type !== filterType) return false;
      if (!search) return true;
      const q = normalizeForSearch(search);
      const prod = m.product || {};
      return (
        normalizeForSearch((prod.name || "").toString()).includes(q) ||
        normalizeForSearch((prod.barcode || "").toString()).includes(q)
      );
    });
  }, [movements, filterType, search]);

  const exportExcel = () => {
    const rows = filtered.map((m) => ({
      Tarih: new Date(m.created_at).toLocaleString(),
      "Ürün Adı": m.product?.name || "",
      Barkod: m.product?.barcode || "",
      Kategori: m.product?.category || "",
      "Hareket Tipi": MOVEMENT_LABELS[m.movement_type] || m.movement_type,
      Miktar: m.quantity,
      Not: m.note || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Hareketler");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hurcell-hareketler-${new Date().toISOString()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">Hareketler</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Stok hareketleri</h2>
        <p className="text-sm leading-6 text-slate-600">Sistemdeki stok hareketlerini buradan inceleyebilirsiniz.</p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-lg border px-3 py-2">
              <option value="ALL">Tümü</option>
              {Object.keys(MOVEMENT_LABELS).map((k) => (
                <option key={k} value={k}>{MOVEMENT_LABELS[k]}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Ürün adı veya barkod ile ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 pl-9 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder-slate-400 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={loadMovements} className="rounded-2xl border px-4 py-2">Yenile</button>
            <button onClick={exportExcel} className="rounded-2xl bg-slate-900 px-4 py-2 text-white">Excel Olarak Dışa Aktar</button>
          </div>
        </div>

        <div className="mt-4 overflow-auto">
          {loading ? (
            <div className="p-6 text-sm text-slate-500">Yükleniyor...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Kayıt bulunamadı.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Tarih</th>
                  <th className="px-3 py-2 text-left">Ürün Adı</th>
                  <th className="px-3 py-2 text-left">Barkod</th>
                  <th className="px-3 py-2 text-left">Kategori</th>
                  <th className="px-3 py-2 text-left">Hareket Tipi</th>
                  <th className="px-3 py-2 text-right">Miktar</th>
                  <th className="px-3 py-2 text-left">Not</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className="border-b">
                    <td className="px-3 py-2">{new Date(m.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">{m.product?.name || "-"}</td>
                    <td className="px-3 py-2">{m.product?.barcode || "-"}</td>
                    <td className="px-3 py-2">{m.product?.category || "-"}</td>
                    <td className="px-3 py-2">{MOVEMENT_LABELS[m.movement_type] || m.movement_type}</td>
                    <td className="px-3 py-2 text-right">{m.quantity}</td>
                    <td className="px-3 py-2">{m.note || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
