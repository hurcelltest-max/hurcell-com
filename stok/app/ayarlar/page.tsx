"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { createProduct, findProductByBarcode, updateProduct, fetchProducts, Product } from "@/lib/productService";
import { supabase } from "@/lib/supabaseClient";

type ImportReport = {
  added: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
};

const headerMap: Record<string, string> = {
  barcode: "barcode",
  barkod: "barcode",
  name: "name",
  "ürün adı": "name",
  "urun adi": "name",
  "ürünadi": "name",
  kategori: "category",
  category: "category",
  stock: "stock",
  stok: "stock",
  buy_price: "buy_price",
  "alış fiyatı": "buy_price",
  "alis fiyati": "buy_price",
  sell_price: "sell_price",
  "satış fiyatı": "sell_price",
  "satis fiyati": "sell_price",
  min_stock: "min_stock",
  "minimum stok": "min_stock",
  location: "location",
  konum: "location",
  raf: "location",
  description: "description",
  "açıklama": "description",
  aciklama: "description",
  image_url: "image_url",
  "fotoğraf url": "image_url",
  "fotograf url": "image_url",
  görsel: "image_url",
  gorsel: "image_url",
  is_web_visible: "is_web_visible",
  "webde göster": "is_web_visible",
  "webde goster": "is_web_visible",
  "webde görünür": "is_web_visible",
  "webde gorunur": "is_web_visible",
  is_b2b_visible: "is_b2b_visible",
  "b2b görünür": "is_b2b_visible",
  "b2b gorunur": "is_b2b_visible",
  "toptanda göster": "is_b2b_visible",
  "toptanda goster": "is_b2b_visible",
  b2b_package_title: "b2b_package_title",
  "b2b paket başlığı": "b2b_package_title",
  "b2b paket basligi": "b2b_package_title",
  "toptan paket başlığı": "b2b_package_title",
  "toptan paket basligi": "b2b_package_title",
  b2b_package_description: "b2b_package_description",
  "b2b paket açıklaması": "b2b_package_description",
  "b2b paket aciklamasi": "b2b_package_description",
  "toptan paket açıklaması": "b2b_package_description",
  "toptan paket aciklamasi": "b2b_package_description",
  b2b_min_quantity: "b2b_min_quantity",
  "minimum toptan adet": "b2b_min_quantity",
  "toptan minimum adet": "b2b_min_quantity",
  "minimum sipariş adedi": "b2b_min_quantity",
  "minimum siparis adedi": "b2b_min_quantity",
  b2b_package_price: "b2b_package_price",
  "b2b paket fiyatı": "b2b_package_price",
  "b2b paket fiyati": "b2b_package_price",
  "toptan paket fiyatı": "b2b_package_price",
  "toptan paket fiyati": "b2b_package_price",
  brand: "brand",
  marka: "brand",
  model: "model",
  color: "color",
  renk: "color",
  memory: "memory",
  hafıza: "memory",
  hafiza: "memory",
  ram: "ram",
  storage: "storage",
  depolama: "storage",
  processor: "processor",
  "işlemci": "processor",
  islemci: "processor",
  screen_size: "screen_size",
  "ekran boyutu": "screen_size",
  ekranboyutu: "screen_size",
};

const buildProductName = (
  brand: string,
  model: string,
  color?: string | null,
  memory?: string | null,
  ram?: string | null,
  storage?: string | null,
  processor?: string | null,
  screen_size?: string | null
) => {
  const parts = [];
  if (brand && brand.trim()) parts.push(brand.trim());
  if (model && model.trim()) parts.push(model.trim());
  
  if (ram && ram.trim()) {
    const r = ram.trim();
    parts.push(r.toLowerCase().includes("ram") ? r : `${r} RAM`);
  }
  if (storage && storage.trim()) parts.push(storage.trim());
  if (processor && processor.trim()) parts.push(processor.trim());
  if (screen_size && screen_size.trim()) {
    const s = screen_size.trim();
    parts.push(s.toLowerCase().includes("inç") || s.includes("\"") || s.toLowerCase().includes("inch") ? s : `${s} inç`);
  }
  
  if (!ram && memory && memory.trim()) parts.push(memory.trim());
  if (color && color.trim()) parts.push(`(${color.trim()})`);
  return parts.join(" ");
};

function normalizeHeader(h: string) {
  return h
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9ğüşöıçİĞÜŞÖÇ ]/gi, "")
    .replace(/\s/g, " ");
}

function buildPrintableHtml(products: Product[], title: string) {
  const now = new Date();
  const rows = products
    .map((p) => {
      return `<tr>
        <td>${(p.barcode || "").toString()}</td>
        <td>${(p.name || "").toString()}</td>
        <td>${(p.category || "").toString()}</td>
        <td style="text-align:right">${(p.stock ?? 0).toString()}</td>
        <td style="text-align:right">${Number(p.buy_price ?? 0).toFixed(2)}</td>
        <td style="text-align:right">${Number(p.sell_price ?? 0).toFixed(2)}</td>
        <td style="text-align:right">${(p.min_stock ?? 0).toString()}</td>
        <td>${(p.location || "").toString()}</td>
      </tr>`;
    })
    .join("\n");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; padding: 20px; color: #0f172a }
        h1 { margin: 0 0 8px 0 }
        .meta { color: #475569; margin-bottom: 12px }
        table { width: 100%; border-collapse: collapse; font-size: 12px }
        th, td { border: 1px solid #e2e8f0; padding: 6px 8px }
        th { background: #f8fafc; text-align: left }
        @media print { th { background: #fff } }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <div class="meta">Oluşturulma: ${now.toLocaleString()}</div>
      <table>
        <thead>
          <tr>
            <th>Barkod</th>
            <th>Ürün Adı</th>
            <th>Kategori</th>
            <th>Stok</th>
            <th>Alış Fiyatı</th>
            <th>Satış Fiyatı</th>
            <th>Minimum Stok</th>
            <th>Raf / Konum</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div style="margin-top:16px; color:#64748b; font-size:12px">HurCELL</div>
    </body>
  </html>`;
}

export default function AyarlarPage() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [errorsPreview, setErrorsPreview] = useState<string | null>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setReport(null);
    setErrorsPreview(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });

      let added = 0;
      let updated = 0;
      let skipped = 0;
      const errors: Array<{ row: number; reason: string }> = [];

      // normalize headers from first row keys map
      const rows = raw;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // considering header is row 1

        // map columns to canonical keys
        const mapped: Record<string, any> = {};
        for (const key of Object.keys(row)) {
          const norm = normalizeHeader(key);
          const canonical = headerMap[norm] || null;
          if (canonical) mapped[canonical] = row[key];
        }

        const barcode = mapped["barcode"] ? String(mapped["barcode"]).trim() : "";
        let name = mapped["name"] ? String(mapped["name"]).trim() : "";
        const brand = mapped["brand"] ? String(mapped["brand"]).trim() : "";
        const model = mapped["model"] ? String(mapped["model"]).trim() : "";
        const color = mapped["color"] ? String(mapped["color"]).trim() : "";
        const memory = mapped["memory"] ? String(mapped["memory"]).trim() : "";
        const ram = mapped["ram"] ? String(mapped["ram"]).trim() : "";
        const storage = mapped["storage"] ? String(mapped["storage"]).trim() : "";
        const processor = mapped["processor"] ? String(mapped["processor"]).trim() : "";
        const screen_size = mapped["screen_size"] ? String(mapped["screen_size"]).trim() : "";

        if (!barcode && !name && !brand && !model) {
          skipped++;
          continue;
        }

        const categoryVal = mapped["category"] ? String(mapped["category"]).trim() : "";
        const isLaptop = categoryVal.toLowerCase() === "bilgisayar";

        if (!name) {
          name = buildProductName(
            brand,
            model,
            color,
            isLaptop ? null : memory,
            isLaptop ? ram : null,
            isLaptop ? storage : null,
            isLaptop ? processor : null,
            isLaptop ? screen_size : null
          ) || "İsimsiz Ürün";
        }

        const parsed = {
          barcode: barcode || null,
          name: name || "İsimsiz Ürün",
          category: categoryVal || null,
          stock: mapped["stock"] !== null && mapped["stock"] !== undefined ? Number(mapped["stock"]) : 0,
          buy_price: mapped["buy_price"] !== null && mapped["buy_price"] !== undefined ? Number(mapped["buy_price"]) : 0,
          sell_price: mapped["sell_price"] !== null && mapped["sell_price"] !== undefined ? Number(mapped["sell_price"]) : 0,
          min_stock: mapped["min_stock"] !== null && mapped["min_stock"] !== undefined ? Number(mapped["min_stock"]) : 0,
          location: mapped["location"] ? String(mapped["location"]).trim() : null,
          description: mapped["description"] ? String(mapped["description"]).trim() : null,
          image_url: mapped["image_url"] ? String(mapped["image_url"]).trim() : null,
          is_web_visible: mapped["is_web_visible"] !== null && mapped["is_web_visible"] !== undefined
            ? (String(mapped["is_web_visible"]).toLowerCase().trim() === "evet" ||
               String(mapped["is_web_visible"]).toLowerCase().trim() === "true" ||
               mapped["is_web_visible"] === 1 ||
               mapped["is_web_visible"] === true)
            : false,
          is_b2b_visible: mapped["is_b2b_visible"] !== null && mapped["is_b2b_visible"] !== undefined
            ? (String(mapped["is_b2b_visible"]).toLowerCase().trim() === "evet" ||
               String(mapped["is_b2b_visible"]).toLowerCase().trim() === "true" ||
               mapped["is_b2b_visible"] === 1 ||
               mapped["is_b2b_visible"] === true)
            : false,
          b2b_package_title: mapped["b2b_package_title"] ? String(mapped["b2b_package_title"]).trim() : null,
          b2b_package_description: mapped["b2b_package_description"] ? String(mapped["b2b_package_description"]).trim() : null,
          b2b_min_quantity: mapped["b2b_min_quantity"] !== null && mapped["b2b_min_quantity"] !== undefined
            ? (Number(mapped["b2b_min_quantity"]) || 1)
            : null,
          b2b_package_price: mapped["b2b_package_price"] !== null && mapped["b2b_package_price"] !== undefined && String(mapped["b2b_package_price"]).trim() !== ""
            ? Number(mapped["b2b_package_price"])
            : null,
          brand: brand || null,
          model: model || null,
          color: color || null,
          memory: isLaptop ? null : (memory || null),
          ram: isLaptop ? (ram || null) : null,
          storage: isLaptop ? (storage || null) : null,
          processor: isLaptop ? (processor || null) : null,
          screen_size: isLaptop ? (screen_size || null) : null,
        };

        try {
          if (parsed.barcode) {
            const existing = await findProductByBarcode(parsed.barcode);
            if (existing.error) {
              errors.push({ row: rowNum, reason: "Barkod sorgulama hatası" });
              continue;
            }

            if (existing.data) {
              // update existing
              const productId = existing.data.id;
              const oldStock = existing.data.stock ?? 0;

              const { data, error } = await updateProduct(productId, {
                barcode: parsed.barcode,
                name: parsed.name,
                category: parsed.category,
                stock: parsed.stock || 0,
                buy_price: parsed.buy_price || 0,
                sell_price: parsed.sell_price || 0,
                min_stock: parsed.min_stock || 0,
                location: parsed.location,
                description: parsed.description,
                image_url: parsed.image_url,
                is_web_visible: parsed.is_web_visible,
                is_b2b_visible: parsed.is_b2b_visible,
                b2b_package_title: parsed.b2b_package_title,
                b2b_package_description: parsed.b2b_package_description,
                b2b_min_quantity: parsed.b2b_min_quantity,
                b2b_package_price: parsed.b2b_package_price,
                brand: parsed.brand,
                model: parsed.model,
                color: parsed.color,
                memory: parsed.memory,
                ram: parsed.ram,
                storage: parsed.storage,
                processor: parsed.processor,
                screen_size: parsed.screen_size,
              });

              if (error) {
                errors.push({ row: rowNum, reason: "Güncelleme hatası" });
                continue;
              }

              // insert ADJUSTMENT movement
              const diff = (parsed.stock || 0) - (oldStock || 0);
              const mv = await supabase?.from("stock_movements").insert([
                ({
                  product_id: productId,
                  movement_type: "ADJUSTMENT",
                  quantity: diff,
                  note: "Excel import",
                } as unknown as never),
              ]).select();

              if (mv && mv.error) {
                // log but continue
                errors.push({ row: rowNum, reason: "Hareket kaydı hatası" });
              }

              updated++;
            } else {
              // create new
              const { data, error } = await createProduct({
                barcode: parsed.barcode,
                name: parsed.name,
                category: parsed.category,
                stock: parsed.stock || 0,
                buy_price: parsed.buy_price || 0,
                sell_price: parsed.sell_price || 0,
                min_stock: parsed.min_stock || 0,
                location: parsed.location,
                description: parsed.description,
                image_url: parsed.image_url,
                is_web_visible: parsed.is_web_visible,
                is_b2b_visible: parsed.is_b2b_visible,
                b2b_package_title: parsed.b2b_package_title,
                b2b_package_description: parsed.b2b_package_description,
                b2b_min_quantity: parsed.b2b_min_quantity,
                b2b_package_price: parsed.b2b_package_price,
                brand: parsed.brand,
                model: parsed.model,
                color: parsed.color,
                memory: parsed.memory,
                ram: parsed.ram,
                storage: parsed.storage,
                processor: parsed.processor,
                screen_size: parsed.screen_size,
              } as any);

              if (error || !data) {
                errors.push({ row: rowNum, reason: "Oluşturma hatası" });
                continue;
              }

              // log ADJUSTMENT for initial stock
              const mv = await supabase?.from("stock_movements").insert([
                ({
                  product_id: data.id,
                  movement_type: "ADJUSTMENT",
                  quantity: parsed.stock || 0,
                  note: "Excel import (new)",
                } as unknown as never),
              ]).select();

              if (mv && mv.error) {
                errors.push({ row: rowNum, reason: "Hareket kaydı hatası" });
              }

              added++;
            }
          } else {
            // no barcode but has name -> create new
            const { data, error } = await createProduct({
              barcode: null,
              name: parsed.name,
              category: parsed.category,
              stock: parsed.stock || 0,
              buy_price: parsed.buy_price || 0,
              sell_price: parsed.sell_price || 0,
              min_stock: parsed.min_stock || 0,
              location: parsed.location,
              description: parsed.description,
              image_url: parsed.image_url,
              is_web_visible: parsed.is_web_visible,
              is_b2b_visible: parsed.is_b2b_visible,
              b2b_package_title: parsed.b2b_package_title,
              b2b_package_description: parsed.b2b_package_description,
              b2b_min_quantity: parsed.b2b_min_quantity,
              b2b_package_price: parsed.b2b_package_price,
              brand: parsed.brand,
              model: parsed.model,
              color: parsed.color,
              memory: parsed.memory,
            } as any);

            if (error || !data) {
              errors.push({ row: rowNum, reason: "Oluşturma hatası" });
              continue;
            }

            const mv = await supabase?.from("stock_movements").insert([
              ({
                product_id: data.id,
                movement_type: "ADJUSTMENT",
                quantity: parsed.stock || 0,
                note: "Excel import (new)",
              } as unknown as never),
            ]).select();

            if (mv && mv.error) {
              errors.push({ row: rowNum, reason: "Hareket kaydı hatası" });
            }

            added++;
          }
        } catch (err: any) {
          errors.push({ row: rowNum, reason: String(err?.message || err) });
        }
      }

      setReport({ added, updated, skipped, errors });
      if (errors.length > 0) setErrorsPreview(JSON.stringify(errors.slice(0, 10), null, 2));
    } catch (err: any) {
      setErrorsPreview(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">Ayarlar</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Uygulama ayarları</h2>
        <p className="text-sm leading-6 text-slate-600">
          Buradan uygulama ayarlarını ve veri importlarını yönetebilirsiniz.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">Excel'den Stok Aktar</p>
        <p className="mt-2 text-sm text-slate-600">Desteklenen format: .xlsx, .xls — ilk sheet okunur.</p>

        <div className="mt-4 grid gap-3">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => handleFile(e.target.files ? e.target.files[0] : null)}
            disabled={busy}
          />

          {busy ? <div className="text-sm text-slate-500">İşleniyor...</div> : null}

          {report ? (
            <div className="mt-4 rounded-lg border p-4 text-sm">
              <div>Eklenen: {report.added}</div>
              <div>Güncellenen: {report.updated}</div>
              <div>Atlanan: {report.skipped}</div>
              <div>Hatalı satırlar: {report.errors.length}</div>
              {errorsPreview ? (
                <pre className="mt-2 overflow-auto text-xs bg-slate-100 p-2">{errorsPreview}</pre>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">Rapor Dışa Aktar</p>
        <p className="mt-2 text-sm text-slate-600">Ürün listesini Excel veya PDF olarak dışa aktarabilirsiniz.</p>

        <div className="mt-4 grid gap-3">
          <button
            onClick={async () => {
              setBusy(true);
              try {
                const { data, error } = await fetchProducts();
                if (error) {
                  setErrorsPreview(String(error));
                  return;
                }
                const products = data || [];
                // map to export rows
                const rows = products.map((p: Product) => ({
                  Barkod: p.barcode || "",
                  "Ürün Adı": p.name,
                  Kategori: p.category || "",
                  Marka: p.brand || "",
                  Model: p.model || "",
                  Renk: p.color || "",
                  Hafıza: p.memory || "",
                  RAM: p.ram || "",
                  Depolama: p.storage || "",
                  İşlemci: p.processor || "",
                  "Ekran Boyutu": p.screen_size || "",
                  Stok: p.stock,
                  "Alış Fiyatı": Number(p.buy_price || 0),
                  "Satış Fiyatı": Number(p.sell_price || 0),
                  "Minimum Stok": p.min_stock,
                  "Raf / Konum": p.location || "",
                  Açıklama: p.description || "",
                  "Fotoğraf URL": p.image_url || "",
                  "Webde Görünür": p.is_web_visible ? "Evet" : "Hayır",
                  "B2B Görünür": p.is_b2b_visible ? "Evet" : "Hayır",
                  "B2B Paket Başlığı": p.b2b_package_title || "",
                  "B2B Paket Açıklaması": p.b2b_package_description || "",
                  "Minimum Toptan Adet": p.b2b_min_quantity !== null && p.b2b_min_quantity !== undefined ? p.b2b_min_quantity : "",
                  "B2B Paket Fiyatı": p.b2b_package_price !== null && p.b2b_package_price !== undefined ? Number(p.b2b_package_price) : "",
                }));

                const ws = XLSX.utils.json_to_sheet(rows);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Products");
                const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
                const blob = new Blob([wbout], { type: "application/octet-stream" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `hurcell-stok-${new Date().toISOString()}.xlsx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
          >
            Excel Olarak Dışa Aktar
          </button>

          <button
            onClick={async () => {
              setBusy(true);
              try {
                const { data, error } = await fetchProducts();
                if (error) {
                  setErrorsPreview(String(error));
                  return;
                }
                const products = data || [];
                const html = buildPrintableHtml(products, "HurCELL Stok Raporu");
                const w = window.open("", "hurcell-stok-report", "noopener,noreferrer");
                if (!w) return;
                w.document.write(html);
                w.document.close();
                // try to auto-open print dialog
                w.focus();
                setTimeout(() => { try { w.print(); } catch (e) {} }, 500);
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
          >
            PDF Olarak Dışa Aktar (Tüm Ürünler)
          </button>

          <button
            onClick={async () => {
              setBusy(true);
              try {
                const { data, error } = await fetchProducts();
                if (error) {
                  setErrorsPreview(String(error));
                  return;
                }
                const products = (data || []).filter((p: Product) => (p.stock ?? 0) <= (p.min_stock ?? 0));
                const html = buildPrintableHtml(products, "HurCELL Düşük Stok Raporu");
                const w = window.open("", "hurcell-lowstock-report", "noopener,noreferrer");
                if (!w) return;
                w.document.write(html);
                w.document.close();
                w.focus();
                setTimeout(() => { try { w.print(); } catch (e) {} }, 500);
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex items-center justify-center rounded-2xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
          >
            PDF Olarak Dışa Aktar (Düşük Stok)
          </button>
        </div>
      </div>
    </section>
  );
}
