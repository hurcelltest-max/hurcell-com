"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

const getPdfMake = async () => {
  const pdfMakeModule: any = await import("pdfmake/build/pdfmake");
  const pdfFontsModule: any = await import("pdfmake/build/vfs_fonts");

  const pdfMake = pdfMakeModule.default || pdfMakeModule;
  const fonts = pdfFontsModule.default || pdfFontsModule;

  const vfs =
    fonts?.vfs ||
    fonts?.pdfMake?.vfs ||
    pdfFontsModule?.vfs ||
    pdfFontsModule?.pdfMake?.vfs ||
    fonts;

  if (typeof pdfMake.addVirtualFileSystem === "function") {
    pdfMake.addVirtualFileSystem(vfs);
  } else {
    pdfMake.vfs = vfs;
  }

  if (typeof pdfMake.createPdf !== "function") {
    throw new Error("PDF oluşturucu yüklenemedi: createPdf bulunamadı");
  }

  return pdfMake;
};
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
                
                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet("Products");

                worksheet.addTable({
                  name: 'ProductsTable',
                  ref: 'A1',
                  headerRow: true,
                  totalsRow: false,
                  style: {
                    theme: 'TableStyleMedium2',
                    showRowStripes: true,
                  },
                  columns: [
                    { name: 'Barkod', filterButton: true },
                    { name: 'Ürün Adı', filterButton: true },
                    { name: 'Kategori', filterButton: true },
                    { name: 'Marka', filterButton: true },
                    { name: 'Model', filterButton: true },
                    { name: 'Renk', filterButton: true },
                    { name: 'Hafıza', filterButton: true },
                    { name: 'RAM', filterButton: true },
                    { name: 'Depolama', filterButton: true },
                    { name: 'İşlemci', filterButton: true },
                    { name: 'Ekran Boyutu', filterButton: true },
                    { name: 'Stok', filterButton: true },
                    { name: 'Alış Fiyatı', filterButton: true },
                    { name: 'Satış Fiyatı', filterButton: true },
                    { name: 'Minimum Stok', filterButton: true },
                    { name: 'Raf / Konum', filterButton: true },
                    { name: 'Webde Görünür', filterButton: true },
                    { name: 'B2B Görünür', filterButton: true },
                    { name: 'B2B Paket Başlığı', filterButton: true },
                    { name: 'Minimum Toptan Adet', filterButton: true },
                    { name: 'B2B Paket Fiyatı', filterButton: true }
                  ],
                  rows: products.map((p) => [
                    p.barcode || "",
                    p.name || "",
                    p.category || "",
                    p.brand || "",
                    p.model || "",
                    p.color || "",
                    p.memory || "",
                    p.ram || "",
                    p.storage || "",
                    p.processor || "",
                    p.screen_size || "",
                    p.stock ?? 0,
                    p.buy_price ?? 0,
                    p.sell_price ?? 0,
                    p.min_stock ?? 0,
                    p.location || "",
                    p.is_web_visible ? "Evet" : "Hayır",
                    p.is_b2b_visible ? "Evet" : "Hayır",
                    p.b2b_package_title || "",
                    p.b2b_min_quantity ?? "",
                    p.b2b_package_price ?? ""
                  ])
                });

                worksheet.columns.forEach((col, i) => {
                  if (i === 1) col.width = 35;
                  else col.width = 15;
                });

                worksheet.getColumn('M').numFmt = '#,##0.00 "₺"';
                worksheet.getColumn('N').numFmt = '#,##0.00 "₺"';
                worksheet.getColumn('U').numFmt = '#,##0.00 "₺"';

                worksheet.views = [{ state: 'frozen', ySplit: 1 }];

                worksheet.eachRow((row) => {
                  row.eachCell((cell) => {
                    cell.border = {
                      top: { style: 'thin' },
                      left: { style: 'thin' },
                      bottom: { style: 'thin' },
                      right: { style: 'thin' }
                    };
                  });
                });

                const buffer = await workbook.xlsx.writeBuffer();
                const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const d = new Date();
                a.download = `hurcell-stok-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.xlsx`;
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
              console.log("PDF all clicked");
              setErrorsPreview("");
              setBusy(true);
              try {
                const { data, error } = await fetchProducts();
                if (error) {
                  setErrorsPreview(String(error));
                  return;
                }
                const products = data || [];
                
                const docDefinition: any = {
                  pageOrientation: 'landscape',
                  content: [
                    { text: 'HurCELL Stok Raporu', style: 'header' },
                    { text: `Tarih: ${new Date().toLocaleString('tr-TR')} | Rapor: Tüm Ürünler`, style: 'subheader' },
                    products.length === 0 ? {
                      text: "Raporlanacak ürün bulunamadı.", margin: [0, 20, 0, 0], italics: true, color: 'gray'
                    } : {
                      table: {
                        headerRows: 1,
                        widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
                        body: [
                          [
                            {text: 'Barkod', style: 'tableHeader'},
                            {text: 'Ürün Adı', style: 'tableHeader'},
                            {text: 'Kategori', style: 'tableHeader'},
                            {text: 'Marka', style: 'tableHeader'},
                            {text: 'Model', style: 'tableHeader'},
                            {text: 'Stok', style: 'tableHeader'},
                            {text: 'Alış F.', style: 'tableHeader'},
                            {text: 'Satış F.', style: 'tableHeader'},
                            {text: 'Web', style: 'tableHeader'},
                            {text: 'B2B', style: 'tableHeader'}
                          ],
                          ...products.map((p: Product) => [
                            p.barcode || "",
                            p.name || "",
                            p.category || "",
                            p.brand || "",
                            p.model || "",
                            p.stock?.toString() || "0",
                            p.buy_price ? `${p.buy_price} TL` : "0 TL",
                            p.sell_price ? `${p.sell_price} TL` : "0 TL",
                            p.is_web_visible ? "Evet" : "Hayır",
                            p.is_b2b_visible ? "Evet" : "Hayır"
                          ])
                        ]
                      },
                      layout: {
                        fillColor: function (rowIndex: number) {
                          if (rowIndex === 0) return '#334155';
                          return (rowIndex % 2 === 0) ? '#f8fafc' : null;
                        },
                        hLineWidth: function () { return 0.5; },
                        vLineWidth: function () { return 0.5; },
                        hLineColor: function () { return '#e2e8f0'; },
                        vLineColor: function () { return '#e2e8f0'; },
                        paddingLeft: function() { return 5; },
                        paddingRight: function() { return 5; },
                        paddingTop: function() { return 4; },
                        paddingBottom: function() { return 4; },
                      }
                    }
                  ],
                  styles: {
                    header: { fontSize: 18, bold: true, margin: [0, 0, 0, 5] },
                    subheader: { fontSize: 10, color: '#64748b', margin: [0, 0, 0, 15] },
                    tableHeader: { bold: true, fontSize: 10, color: 'white' }
                  },
                  defaultStyle: {
                    fontSize: 9
                  },
                  footer: function(currentPage: number, pageCount: number) {
                    return { text: `Sayfa ${currentPage} / ${pageCount}`, alignment: 'right', margin: [0, 10, 20, 0], fontSize: 8, color: '#94a3b8' };
                  }
                };
                
                const d = new Date();
                const pdfMake = await getPdfMake();
                pdfMake.createPdf(docDefinition).download(`hurcell-stok-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.pdf`);
              } catch (err: any) {
                setErrorsPreview(String(err?.message || err));
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
              console.log("PDF low stock clicked");
              setErrorsPreview("");
              setBusy(true);
              try {
                const { data, error } = await fetchProducts();
                if (error) {
                  setErrorsPreview(String(error));
                  return;
                }
                const products = (data || []).filter((p: Product) => (p.stock ?? 0) <= (p.min_stock ?? 0));
                
                const docDefinition: any = {
                  pageOrientation: 'landscape',
                  content: [
                    { text: 'HurCELL Düşük Stok Raporu', style: 'header' },
                    { text: `Tarih: ${new Date().toLocaleString('tr-TR')} | Rapor: Düşük Stok`, style: 'subheader' },
                    products.length === 0 ? {
                      text: "Raporlanacak ürün bulunamadı.", margin: [0, 20, 0, 0], italics: true, color: 'gray'
                    } : {
                      table: {
                        headerRows: 1,
                        widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto'],
                        body: [
                          [
                            {text: 'Barkod', style: 'tableHeader'},
                            {text: 'Ürün Adı', style: 'tableHeader'},
                            {text: 'Kategori', style: 'tableHeader'},
                            {text: 'Stok', style: 'tableHeader'},
                            {text: 'Min Stok', style: 'tableHeader'},
                            {text: 'Satış F.', style: 'tableHeader'}
                          ],
                          ...products.map((p: Product) => [
                            p.barcode || "",
                            p.name || "",
                            p.category || "",
                            p.stock?.toString() || "0",
                            p.min_stock?.toString() || "0",
                            p.sell_price ? `${p.sell_price} TL` : "0 TL"
                          ])
                        ]
                      },
                      layout: {
                        fillColor: function (rowIndex: number) {
                          if (rowIndex === 0) return '#dc2626'; // rose-600
                          return (rowIndex % 2 === 0) ? '#fef2f2' : null; // rose-50
                        },
                        hLineWidth: function () { return 0.5; },
                        vLineWidth: function () { return 0.5; },
                        hLineColor: function () { return '#fecaca'; },
                        vLineColor: function () { return '#fecaca'; },
                        paddingLeft: function() { return 5; },
                        paddingRight: function() { return 5; },
                        paddingTop: function() { return 4; },
                        paddingBottom: function() { return 4; },
                      }
                    }
                  ],
                  styles: {
                    header: { fontSize: 18, bold: true, margin: [0, 0, 0, 5], color: '#b91c1c' },
                    subheader: { fontSize: 10, color: '#ef4444', margin: [0, 0, 0, 15] },
                    tableHeader: { bold: true, fontSize: 10, color: 'white' }
                  },
                  defaultStyle: {
                    fontSize: 9
                  },
                  footer: function(currentPage: number, pageCount: number) {
                    return { text: `Sayfa ${currentPage} / ${pageCount}`, alignment: 'right', margin: [0, 10, 20, 0], fontSize: 8, color: '#ef4444' };
                  }
                };

                const d = new Date();
                const pdfMake = await getPdfMake();
                pdfMake.createPdf(docDefinition).download(`hurcell-dusuk-stok-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.pdf`);
              } catch (err: any) {
                setErrorsPreview(String(err?.message || err));
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
