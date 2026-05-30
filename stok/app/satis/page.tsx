"use client";

import { useState } from "react";
import Scanner from "@/components/Scanner";
import { changeProductStock, findProductByBarcode } from "@/lib/productService";

export default function SatisPage() {
  const [status, setStatus] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  const showStatus = (
    type: "success" | "error" | "warning",
    text: string
  ) => {
    setStatus({ type, text });
    window.setTimeout(() => setStatus(null), 5000);
  };

  const handleScan = async (decodedText: string) => {
    const barcode = decodedText.trim();
    if (!barcode) {
      return;
    }

    const product = await findProductByBarcode(barcode);
    if (product.error) {
      showStatus("error", "Ürün sorgulanırken hata oluştu.");
      return;
    }

    if (!product.data) {
      showStatus("warning", "Bu barkoda ait ürün bulunamadı.");
      return;
    }

    if (product.data.stock <= 0) {
      showStatus("warning", "Stok 0. Satışa izin verilmiyor.");
      return;
    }

    const newStock = product.data.stock - 1;
    const result = await changeProductStock(
      product.data.id,
      newStock,
      1,
      "OUT",
      "Satış"
    );

    if (result.error) {
      showStatus("error", "Satış kaydedilirken hata oluştu.");
      return;
    }

    showStatus(
      "success",
      `Satış tamamlandı. ${barcode} ürünü için stok -1 oldu. Yeni stok: ${
        result.data?.stock ?? newStock
      }.`
    );
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">Satış</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Satış yönetimi</h2>
        <p className="text-sm leading-6 text-slate-600">
          Kamerayla barkod veya QR okutun. Stok 0 ise satış gerçekleşmez.
        </p>
      </div>

      <Scanner onDecode={handleScan} onError={(message) => showStatus("error", message)} />

      {status ? (
        <div
          className={`rounded-3xl border p-4 text-sm shadow-sm shadow-slate-900/5 ${
            status.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : status.type === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {status.text}
        </div>
      ) : null}
    </section>
  );
}
