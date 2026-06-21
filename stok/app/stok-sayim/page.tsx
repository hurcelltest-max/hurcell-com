"use client";

import { ChangeEvent, FormEvent, useState, useRef, useEffect } from "react";
import Scanner from "@/components/Scanner";
import { changeProductStock, createProduct, findProductByBarcode } from "@/lib/productService";

const initialFormState = {
  name: "",
  category: "",
  buy_price: "0",
  sell_price: "0",
  min_stock: "0",
  location: "",
};

type CreateForm = typeof initialFormState;

export default function StokSayimPage() {
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [form, setForm] = useState<CreateForm>(initialFormState);
  const [status, setStatus] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // Dual Scanning States & Refs
  const [scanMethod, setScanMethod] = useState<"camera" | "manual">("camera");
  const [manualBarcode, setManualBarcode] = useState("");
  const manualInputRef = useRef<HTMLInputElement>(null);

  // Keep focus on barcode reader input when active
  useEffect(() => {
    if (scanMethod === "manual" && !busy && !pendingBarcode) {
      manualInputRef.current?.focus();
    }
  }, [scanMethod, busy, pendingBarcode]);

  // Handler for physical barcode gun / manual entry submit
  const handleManualSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const barcode = manualBarcode.trim();
    if (!barcode) {
      showStatus("error", "Lütfen geçerli bir barkod okutun veya manuel girin.");
      return;
    }
    
    // Clear input field instantly for the next scan
    setManualBarcode("");
    
    // Execute shared scanning logic
    await handleScan(barcode);
    
    // Maintain autofocus
    setTimeout(() => {
      manualInputRef.current?.focus();
    }, 50);
  };

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

    setBusy(true);
    const result = await findProductByBarcode(barcode);
    setBusy(false);

    if (result.error) {
      showStatus("error", "Ürün sorgulanırken hata oluştu.");
      return;
    }

    if (result.data) {
      const newStock = result.data.stock + 1;
      const updateResult = await changeProductStock(
        result.data.id,
        newStock,
        1,
        "IN",
        "Stok sayımı"
      );

      if (updateResult.error) {
        showStatus("error", "Stok güncellenirken hata oluştu.");
        return;
      }

      showStatus(
        "success",
        `Ürün bulundu. Stok +1 yapıldı. Yeni stok: ${
          updateResult.data?.stock ?? newStock
        }.`
      );
      return;
    }

    setPendingBarcode(barcode);
    showStatus(
      "warning",
      `Ürün bulunamadı. ${barcode} için ürün bilgisi girin.`
    );
  };

  const handleFormChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetCreateForm = () => {
    setPendingBarcode(null);
    setForm(initialFormState);
    if (scanMethod === "manual") {
      setTimeout(() => {
        manualInputRef.current?.focus();
      }, 50);
    }
  };

  const handleCreateProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingBarcode) {
      return;
    }

    if (!form.name.trim()) {
      showStatus("error", "Ürün adı zorunludur.");
      return;
    }

    setBusy(true);
    const createResult = await createProduct({
      barcode: pendingBarcode,
      name: form.name.trim(),
      category: form.category.trim() || null,
      stock: 1,
      buy_price: Number(form.buy_price) || 0,
      sell_price: Number(form.sell_price) || 0,
      buy_currency: 'TRY',
      foreign_buy_price: null,
      min_stock: Number(form.min_stock) || 0,
      location: form.location.trim() || null,
      description: null,
      image_url: null,
      is_web_visible: false,
      is_b2b_visible: false,
      brand: null,
      model: null,
      color: null,
      memory: null,
    });
    setBusy(false);

    if (createResult.error) {
      showStatus("error", "Yeni ürün kaydedilirken hata oluştu.");
      return;
    }

    showStatus(
      "success",
      `Yeni ürün oluşturuldu. ${pendingBarcode} için stok 1 olarak kaydedildi.`
    );
    resetCreateForm();
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
          Stok Sayımı
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          Stok girişini kaydedin
        </h2>
        <p className="text-sm leading-6 text-slate-600">
          Kamera ile barkod okutabilir ya da fiziksel barkod okuyucu tabancanızı kullanarak hızlıca giriş yapabilirsiniz.
        </p>
      </div>

      {/* Segmented Toggle Control for Scan Methods */}
      <div className="flex rounded-2xl bg-slate-100 p-1 border border-slate-200/50 max-w-lg mx-auto">
        <button
          type="button"
          onClick={() => setScanMethod("camera")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm transition cursor-pointer active:scale-98 ${
            scanMethod === "camera"
              ? "bg-white text-slate-900 font-semibold shadow-sm"
              : "text-slate-600 hover:text-slate-900 font-medium"
          }`}
        >
          📷 Kamera ile Okut
        </button>
        <button
          type="button"
          onClick={() => setScanMethod("manual")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm transition cursor-pointer active:scale-98 ${
            scanMethod === "manual"
              ? "bg-white text-slate-900 font-semibold shadow-sm"
              : "text-slate-600 hover:text-slate-900 font-medium"
          }`}
        >
          🏷️ Barkod Okuyucu / Manuel
        </button>
      </div>

      {/* 1. Camera Scanning Option */}
      {scanMethod === "camera" && (
        <Scanner onDecode={handleScan} onError={(message) => showStatus("error", message)} />
      )}

      {/* 2. Barcode Reader Gun / Manual Entry Option */}
      {scanMethod === "manual" && (
        <form
          onSubmit={handleManualSubmit}
          className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5 space-y-4"
        >
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
              Fiziksel Cihaz ve Manuel Giriş
            </p>
            <h3 className="text-lg font-semibold text-slate-900">
              Barkod Tabancası ile Okutun
            </h3>
            <p className="text-xs leading-relaxed text-slate-600">
              Barkod okuyucu tabancanızı bilgisayarınıza/cihazınıza bağlayıp aşağıdaki giriş alanını aktif ederek okutun. Okutma yapıldığında sistem otomatik olarak kodu gönderir ve bir sonraki okutma için hazır hale gelir.
            </p>
          </div>

          <div className="relative mt-4">
            <input
              ref={manualInputRef}
              type="text"
              required
              disabled={busy}
              placeholder="Barkod okutun veya manuel yazıp Enter'a basın..."
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-slate-900 placeholder-slate-450 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 text-lg font-medium"
            />
            {busy && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-600 border-t-transparent"></div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy || !manualBarcode.trim()}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 cursor-pointer shadow-md active:scale-95 shadow-slate-900/10"
            >
              Kodu Gönder / Enter
            </button>
          </div>
        </form>
      )}

      {pendingBarcode ? (
        <form
          onSubmit={handleCreateProduct}
          className="space-y-4 rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5"
        >
          <p className="font-semibold text-slate-900">
            Yeni ürün oluştur: {pendingBarcode}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-700">
              Ürün Adı
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleFormChange}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
                required
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              Kategori
              <input
                type="text"
                name="category"
                value={form.category}
                onChange={handleFormChange}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              Alış Fiyatı
              <input
                type="number"
                name="buy_price"
                value={form.buy_price}
                onChange={handleFormChange}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
                min="0"
                step="0.01"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              Satış Fiyatı
              <input
                type="number"
                name="sell_price"
                value={form.sell_price}
                onChange={handleFormChange}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
                min="0"
                step="0.01"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              Minimum Stok
              <input
                type="number"
                name="min_stock"
                value={form.min_stock}
                onChange={handleFormChange}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
                min="0"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              Raf / Konum
              <input
                type="text"
                name="location"
                value={form.location}
                onChange={handleFormChange}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
              />
            </label>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-2 text-sm text-slate-800 transition hover:bg-slate-200"
              onClick={resetCreateForm}
              disabled={busy}
            >
              İptal
            </button>
            <button
              type="submit"
              className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
              disabled={busy}
            >
              Ürünü Kaydet ve Stok +1
            </button>
          </div>
        </form>
      ) : null}

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
