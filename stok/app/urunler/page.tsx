"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import {
  changeProductStock,
  createProduct,
  deleteProduct,
  fetchProducts,
  findProductByBarcode,
  Product,
  updateProduct,
} from "@/lib/productService";

const initialFormState = {
  barcode: "",
  name: "",
  category: "",
  stock: "0",
  buy_price: "0",
  sell_price: "0",
  min_stock: "0",
  location: "",
  description: "",
  image_url: "",
  is_web_visible: false as boolean,
};

type FormFieldKey = keyof typeof initialFormState;

const formFields: Array<{ label: string; key: FormFieldKey; type: "text" | "number" }> = [
  { label: "Barkod", key: "barcode", type: "text" },
  { label: "Ürün Adı", key: "name", type: "text" },
  { label: "Kategori", key: "category", type: "text" },
  { label: "Stok Adedi", key: "stock", type: "number" },
  { label: "Alış Fiyatı", key: "buy_price", type: "number" },
  { label: "Satış Fiyatı", key: "sell_price", type: "number" },
  { label: "Minimum Stok", key: "min_stock", type: "number" },
  { label: "Raf / Konum", key: "location", type: "text" },
];

const formatAmount = (value: string) => value.replace(/[^0-9.]/g, "");

export default function UrunlerPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(initialFormState);
  const [status, setStatus] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);
  const barcodeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    const { data, error } = await fetchProducts();
    if (error) {
      setStatus({ type: "error", text: "Ürünler yüklenirken hata oluştu." });
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  const showStatus = (
    type: "success" | "error" | "warning",
    text: string
  ) => {
    setStatus({ type, text });
    window.setTimeout(() => setStatus(null), 5000);
  };

  const handleFormChange = (
    key: keyof typeof initialFormState,
    value: any
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleFormInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = event.target;
    if (!name) return;
    const key = name as FormFieldKey;
    handleFormChange(
      key,
      type === "number" ? formatAmount(value) : value
    );
  };

  const handleEditFormChange = (
    key: keyof typeof initialFormState,
    value: any
  ) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => setForm(initialFormState);

  const handleAddProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.barcode.trim() || !form.name.trim()) {
      showStatus("error", "Barkod ve ürün adı alanları zorunludur.");
      return;
    }

    setSaving(true);
    const existing = await findProductByBarcode(form.barcode.trim());
    if (existing.error) {
      setSaving(false);
      showStatus("error", "Barkod sorgulanırken hata oluştu.");
      return;
    }

    if (existing.data) {
      setSaving(false);
      showStatus("warning", "Aynı barkoda sahip bir ürün zaten mevcut.");
      return;
    }

    const { data, error } = await createProduct({
      barcode: form.barcode.trim(),
      name: form.name.trim(),
      category: form.category.trim() || null,
      stock: Number(form.stock) || 0,
      buy_price: Number(form.buy_price) || 0,
      sell_price: Number(form.sell_price) || 0,
      min_stock: Number(form.min_stock) || 0,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
      image_url: form.image_url.trim() || null,
      is_web_visible: form.is_web_visible === true,
    });

    setSaving(false);
    if (error || !data) {
      showStatus("error", "Ürün ekleme sırasında hata oluştu.");
      return;
    }

    setProducts((prev) => [data, ...prev]);
    resetForm();
    // focus barcode for quick entry
    barcodeRef.current?.focus();
    showStatus("success", "Ürün başarıyla eklendi.");
  };

  const handleStartEdit = (product: Product) => {
    setEditingId(product.id);
    setEditForm({
      barcode: product.barcode || "",
      name: product.name,
      category: product.category || "",
      stock: String(product.stock),
      buy_price: String(product.buy_price),
      sell_price: String(product.sell_price),
      min_stock: String(product.min_stock),
      location: product.location || "",
      description: product.description || "",
      image_url: product.image_url || "",
      is_web_visible: product.is_web_visible || false,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(initialFormState);
  };

  const handleSaveEdit = async (product: Product) => {
    if (!editForm.barcode.trim() || !editForm.name.trim()) {
      showStatus("error", "Barkod ve ürün adı alanları zorunludur.");
      return;
    }

    setSaving(true);
    if (editForm.barcode.trim() !== product.barcode) {
      const existing = await findProductByBarcode(editForm.barcode.trim());
      if (existing.error) {
        setSaving(false);
        showStatus("error", "Barkod kontrolü sırasında hata oluştu.");
        return;
      }
      if (existing.data) {
        setSaving(false);
        showStatus("warning", "Bu barkod başka bir üründe kullanılıyor.");
        return;
      }
    }

    const { data, error } = await updateProduct(product.id, {
      barcode: editForm.barcode.trim(),
      name: editForm.name.trim(),
      category: editForm.category.trim() || null,
      stock: Number(editForm.stock) || 0,
      buy_price: Number(editForm.buy_price) || 0,
      sell_price: Number(editForm.sell_price) || 0,
      min_stock: Number(editForm.min_stock) || 0,
      location: editForm.location.trim() || null,
      description: editForm.description.trim() || null,
      image_url: editForm.image_url.trim() || null,
      is_web_visible: editForm.is_web_visible === true,
    });

    setSaving(false);
    if (error || !data) {
      showStatus("error", "Ürün güncelleme sırasında hata oluştu.");
      return;
    }

    setProducts((prev) => {
      return prev.map((item) => {
        return item.id === product.id ? data : item;
      });
    });
    setEditingId(null);
    showStatus("success", "Ürün başarıyla güncellendi.");
  };

  const handleDelete = async (productId: string) => {
    if (!window.confirm("Bu ürünü silmek istediğinizden emin misiniz?")) {
      return;
    }

    const { error } = await deleteProduct(productId);
    if (error) {
      showStatus("error", "Ürün silme sırasında hata oluştu.");
      return;
    }

    setProducts((prev) => prev.filter((product) => product.id !== productId));
    showStatus("success", "Ürün silindi.");
  };

  const handleStockAdjustment = async (
    product: Product,
    direction: "IN" | "OUT"
  ) => {
    const amount = direction === "IN" ? 1 : 1;
    const newStock = direction === "IN" ? product.stock + amount : product.stock - amount;
    if (newStock < 0) {
      showStatus("warning", "Stok miktarı negatif olamaz.");
      return;
    }

    setSaving(true);
    const { data, error } = await changeProductStock(
      product.id,
      newStock,
      amount,
      direction,
      direction === "IN" ? "Stok artırıldı" : "Stok azaltıldı"
    );
    setSaving(false);

    if (error || !data) {
      showStatus("error", "Stok güncelleme sırasında hata oluştu.");
      return;
    }

    setProducts((prev) =>
      prev.map((item) => (item.id === product.id ? { ...item, stock: newStock } : item))
    );
    showStatus("success", "Stok başarıyla güncellendi.");
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
              Ürünler
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Ürün yönetimi</h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Ürünleri buradan listeleyebilir, stok miktarlarını güncelleyebilir ve yeni ürün ekleyebilirsiniz.
          </p>
        </div>
      </div>

      {status ? (
        <div
          className={`rounded-3xl border px-5 py-4 text-sm shadow-sm shadow-slate-900/5 ${
            status.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : status.type === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {status.text}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form
          onSubmit={handleAddProduct}
          className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
            Yeni Ürün Ekle
          </p>
          <div className="mt-6 grid gap-4">
            {formFields.map(({ label, key, type }) => (
              <label key={key} className="grid gap-2 text-sm text-slate-700">
                <span className="font-medium">{label}</span>
                <input
                  type={type}
                  name={key}
                  id={`product-${key}`}
                  value={form[key] as string}
                  onChange={handleFormInputChange}
                  ref={key === "barcode" ? barcodeRef : undefined}
                  {...(type === "number"
                    ? { inputMode: "decimal", step: "any" }
                    : {})}
                  {...(key === "barcode" || key === "name" ? { required: true } : {})}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
              </label>
            ))}
            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">Ürün Açıklaması</span>
              <textarea
                name="description"
                id="product-description"
                value={form.description}
                onChange={(e) => handleFormChange("description", e.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                rows={3}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">Ürün Fotoğraf URL'si</span>
              <input
                type="text"
                name="image_url"
                id="product-image_url"
                value={form.image_url}
                onChange={(e) => handleFormChange("image_url", e.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </label>
            <label className="flex items-center gap-3 text-sm text-slate-700 select-none cursor-pointer mt-2">
              <input
                type="checkbox"
                name="is_web_visible"
                id="product-is_web_visible"
                checked={form.is_web_visible}
                onChange={(e) => handleFormChange("is_web_visible", e.target.checked)}
                className="h-5 w-5 rounded-lg border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="font-medium">Web sitesinde gösterilsin mi?</span>
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-6 inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Kaydediliyor..." : "Ürün Ekle"}
          </button>
        </form>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Ürün Listesi</h3>
                <p className="text-sm leading-6 text-slate-600">
                  Burada sistemde kayıtlı tüm ürünler yer alır.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {products.length} ürün
              </span>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-sm shadow-slate-900/5">
            <div className="hidden grid-cols-[2.5fr_1fr_1fr_1.5fr] gap-4 border-b border-slate-200 px-6 py-4 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500 sm:grid">
              <div>Ürün</div>
              <div>Stok</div>
              <div>Fiyat</div>
              <div>İşlemler</div>
            </div>
            <div className="divide-y divide-slate-200">
              {loading ? (
                <div className="p-6 text-sm text-slate-500">Yükleniyor...</div>
              ) : products.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">Henüz ürün eklenmemiş.</div>
              ) : (
                products.map((product) => (
                  <div key={product.id} className="px-4 py-4 sm:px-6">
                    {editingId === product.id ? (
                      <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="grid gap-2 text-sm text-slate-700">
                            <span>Barkod</span>
                            <input
                              value={editForm.barcode}
                              onChange={(event) =>
                                handleEditFormChange("barcode", event.target.value)
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-700">
                            <span>Ürün Adı</span>
                            <input
                              value={editForm.name}
                              onChange={(event) =>
                                handleEditFormChange("name", event.target.value)
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-700">
                            <span>Kategori</span>
                            <input
                              value={editForm.category}
                              onChange={(event) =>
                                handleEditFormChange("category", event.target.value)
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-700">
                            <span>Stok</span>
                            <input
                              type="number"
                              value={editForm.stock}
                              onChange={(event) =>
                                handleEditFormChange(
                                  "stock",
                                  formatAmount(event.target.value)
                                )
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-700">
                            <span>Alış Fiyatı</span>
                            <input
                              type="number"
                              value={editForm.buy_price}
                              onChange={(event) =>
                                handleEditFormChange(
                                  "buy_price",
                                  formatAmount(event.target.value)
                                )
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-700">
                            <span>Satış Fiyatı</span>
                            <input
                              type="number"
                              value={editForm.sell_price}
                              onChange={(event) =>
                                handleEditFormChange(
                                  "sell_price",
                                  formatAmount(event.target.value)
                                )
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-700">
                            <span>Minimum Stok</span>
                            <input
                              type="number"
                              value={editForm.min_stock}
                              onChange={(event) =>
                                handleEditFormChange(
                                  "min_stock",
                                  formatAmount(event.target.value)
                                )
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-700">
                            <span>Raf / Konum</span>
                            <input
                              value={editForm.location}
                              onChange={(event) =>
                                handleEditFormChange("location", event.target.value)
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-700 sm:col-span-2">
                            <span>Ürün Açıklaması</span>
                            <textarea
                              value={editForm.description}
                              onChange={(event) =>
                                handleEditFormChange("description", event.target.value)
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none resize-y"
                              rows={2}
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-700 sm:col-span-2">
                            <span>Ürün Fotoğraf URL'si</span>
                            <input
                              value={editForm.image_url}
                              onChange={(event) =>
                                handleEditFormChange("image_url", event.target.value)
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                            />
                          </label>
                          <label className="flex items-center gap-3 text-sm text-slate-700 select-none cursor-pointer sm:col-span-2 py-2">
                            <input
                              type="checkbox"
                              checked={editForm.is_web_visible}
                              onChange={(event) =>
                                handleEditFormChange("is_web_visible", event.target.checked)
                              }
                              className="h-5 w-5 rounded-lg border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <span>Web sitesinde gösterilsin mi?</span>
                          </label>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(product)}
                            disabled={saving}
                            className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Kaydet
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            İptal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-[2.5fr_1fr_1fr_1.5fr] sm:items-center">
                        <div className="flex gap-4 items-center">
                          {/* Image section */}
                          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-center p-1">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="h-full w-full object-cover rounded-xl"
                                onError={(e) => {
                                  // Fallback in case of broken link
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className="text-[10px] leading-tight text-slate-400 font-medium">Fotoğraf yok</span>
                            )}
                          </div>
                          {/* Text section */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {product.name}
                              </p>
                              {product.is_web_visible ? (
                                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                                  Webde Görünür
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200">
                                  Webde Gizli
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-sm leading-6 text-slate-600 truncate">
                              {product.category || "Kategori yok"} • {product.barcode}
                            </p>
                            <p className="mt-1 text-sm text-slate-500 truncate">
                              {product.location || "Konum yok"}
                            </p>
                            {product.description && (
                              <p className="mt-1 text-xs text-slate-400 italic line-clamp-2 max-w-md">
                                {product.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-sm text-slate-900">
                          <span className="block font-semibold">{product.stock}</span>
                          <span className="text-slate-500">Stok</span>
                        </div>
                        <div className="text-sm text-slate-900">
                          <span className="block font-semibold">{product.sell_price.toFixed(2)} ₺</span>
                          <span className="text-slate-500">Satış Fiyatı</span>
                        </div>
                        <div className="grid gap-2 sm:justify-end">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleStockAdjustment(product, "IN")}
                              className="rounded-2xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600"
                            >
                              Stok Artır
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStockAdjustment(product, "OUT")}
                              className="rounded-2xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-600"
                            >
                              Stok Azalt
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(product)}
                              className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Düzenle
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(product.id)}
                              className="rounded-2xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                            >
                              Sil
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
