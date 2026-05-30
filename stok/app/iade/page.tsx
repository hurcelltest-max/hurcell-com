"use client";

import { useState } from "react";
import Scanner from "@/components/Scanner";
import { changeProductStock, findProductByBarcode } from "@/lib/productService";

export default function IadePage() {
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

    const existing = await findProductByBarcode(barcode);
    if (existing.error) {
      showStatus("error", "Ürün bilgisi sorgulanırken hata oluştu.");
      return;
    }

    if (!existing.data) {
      showStatus("warning", "Bu barkoda ait ürün bulunamadı.");
      return;
    }

    const updatedStock = existing.data.stock + 1;
    const result = await changeProductStock(
      existing.data.id,
      updatedStock,
      1,
      "RETURN",
      "İade"
    );

    if (result.error) {
      showStatus("error", "Stok iadesi sırasında hata oluştu.");
      return;
    }

    showStatus(
      "success",
      `İade kaydedildi. ${barcode} için stok +1 oldu. Yeni stok: ${
        result.data?.stock ?? updatedStock
      }.`
    );
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">İade</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Ürün iadesi</h2>
        <p className="text-sm leading-6 text-slate-600">
          Kamerayla barkod veya QR okutularak stok iadesi alabilirsiniz. Stok hareketleri RETURN olarak kaydedilir.
        </p>
      </div>

      <Scanner onDecode={handleScan} />

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
