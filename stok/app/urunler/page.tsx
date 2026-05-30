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
import { supabase } from "@/lib/supabaseClient";
import {
  phoneCatalog,
  tabletCatalog,
  laptopCatalog,
  smartwatchCatalog,
  accessoryBrands,
  accessoryColors
} from "@/lib/productCatalog";

// İstemci tarafında görsel optimizasyonu yapan yardımcı fonksiyon (Maks 1600px, 0.85 JPEG sıkıştırma)
const optimizeImage = async (file: File): Promise<Blob> => {
  return new Promise((resolve) => {
    if (
      file.size < 400 * 1024 &&
      (file.type === "image/jpeg" ||
        file.type === "image/jpg" ||
        file.type === "image/png" ||
        file.type === "image/webp")
    ) {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        const MAX_WIDTH = 1600;
        const MAX_HEIGHT = 1600;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          0.85
        );
      };
      img.onerror = () => resolve(file);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
};

interface ProductImageUploaderProps {
  imageUrl: string;
  onUploadSuccess: (url: string) => void;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  idPrefix: string;
}

function ProductImageUploader({
  imageUrl,
  onUploadSuccess,
  onUploadStart,
  onUploadEnd,
  idPrefix,
}: ProductImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    // Format doğrulaması
    const allowedFormats = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedFormats.includes(file.type)) {
      setErrorMsg("Yalnızca JPG, JPEG, PNG ve WEBP formatları desteklenir.");
      setSuccessMsg(null);
      return;
    }

    // Dosya boyutu doğrulaması (5 MB limit)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setErrorMsg("Dosya boyutu maksimum 5 MB olabilir.");
      setSuccessMsg(null);
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setUploading(true);
    setProgress(10);
    onUploadStart?.();

    try {
      // 1. İstemci tarafında sıkıştırma/boyutlandırma
      setProgress(30);
      const optimizedBlob = await optimizeImage(file);

      // 2. Benzersiz dosya adı oluşturma
      setProgress(60);
      const ext = file.name.split(".").pop() || "jpg";
      const filename = `products/${Date.now()}-${Math.random().toString(36).substring(2, 11)}.${ext}`;

      if (!supabase) {
        throw new Error("Supabase bağlantısı yapılandırılmamış.");
      }

      // 3. Supabase Storage'a yükleme
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filename, optimizedBlob, {
          contentType: file.type || "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      setProgress(90);
      // 4. Public URL alma
      const { data } = supabase.storage
        .from("product-images")
        .getPublicUrl(filename);

      if (!data || !data.publicUrl) {
        throw new Error("Public URL üretilemedi.");
      }

      setProgress(100);
      setSuccessMsg("Görsel başarıyla yüklendi!");
      onUploadSuccess(data.publicUrl);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Görsel yüklenirken bir hata oluştu.");
    } finally {
      setUploading(false);
      onUploadEnd?.();
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="grid gap-3">
      {/* Gizli file inputlar */}
      <input
        type="file"
        ref={galleryInputRef}
        onChange={handleFileInputChange}
        accept="image/*"
        className="hidden"
        id={`${idPrefix}-gallery-input`}
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileInputChange}
        accept="image/*"
        capture="environment"
        className="hidden"
        id={`${idPrefix}-camera-input`}
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
          dragOver
            ? "border-sky-500 bg-sky-50/50"
            : imageUrl
            ? "border-emerald-200 bg-emerald-50/10"
            : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
        }`}
      >
        {imageUrl ? (
          <div className="w-full space-y-4">
            <div className="relative mx-auto h-32 w-32 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 shadow-sm">
              <img
                src={imageUrl}
                alt="Ürün Önizleme"
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onUploadSuccess("")}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white shadow hover:bg-rose-600 transition"
                title="Görseli Kaldır"
              >
                ✕
              </button>
            </div>
            <div className="text-xs text-slate-500 font-medium break-all">
              Mevcut görsel URL'si: <span className="underline">{imageUrl}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 text-lg">
              🖼️
            </div>
            <div className="text-sm font-medium text-slate-700">
              Görseli buraya sürükleyin veya cihazınızdan seçin
            </div>
            <div className="text-xs text-slate-400 font-normal">
              Desteklenen formatlar: JPG, JPEG, PNG, WEBP (Maks: 5 MB)
            </div>
          </div>
        )}

        {/* Yükleniyor Durumu */}
        {uploading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white/95 p-4 z-10">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-sky-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="mt-2 text-xs font-semibold text-sky-600 animate-pulse">
              Görsel yükleniyor... %{progress}
            </span>
          </div>
        )}
      </div>

      {/* Tetikleyici Butonlar */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
        >
          📂 Galeriden Seç
        </button>
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
        >
          📸 Kamerayı Aç
        </button>
      </div>

      {/* Durum Mesajları */}
      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 flex items-center gap-1.5">
          ✓ {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 flex items-center gap-1.5">
          ⚠️ {errorMsg}
        </div>
      )}
    </div>
  );
}


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
  brand: "",
  model: "",
  color: "",
  memory: "",
  ram: "",
  storage: "",
  processor: "",
  screen_size: "",
};

type FormFieldKey = keyof typeof initialFormState;

const formatAmount = (value: string) => value.replace(/[^0-9.]/g, "");

const formatCurrencyTRY = (value: string | number) => {
  const num = Number(value);
  if (isNaN(num) || value === "" || value === undefined || value === null) return "";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};

const parseCurrencyTRY = (formattedValue: string) => {
  if (!formattedValue) return "";
  let clean = formattedValue
    .replace(/[^0-9,.-]/g, "") // remove ₺, letters, spaces
    .replace(/\./g, "")       // remove dots (thousands separators)
    .replace(/,/g, ".");       // replace comma with dot (decimal separator)
  return clean;
};

const buildProductName = (
  brand: string,
  model: string,
  color?: string | null,
  memory?: string | null,
  ram?: string | null,
  storage?: string | null,
  processor?: string | null,
  screen_size?: string | null,
  isLaptop?: boolean
) => {
  const parts = [];
  const brandTrim = brand ? brand.trim() : "";
  const modelTrim = model ? model.trim() : "";
  
  if (isLaptop) {
    if (brandTrim && modelTrim) {
      if (modelTrim.toLowerCase().startsWith(brandTrim.toLowerCase())) {
        parts.push(modelTrim);
      } else {
        parts.push(brandTrim, modelTrim);
      }
    } else if (modelTrim) {
      parts.push(modelTrim);
    } else if (brandTrim) {
      parts.push(brandTrim);
    }
    return parts.join(" ");
  }
  
  if (brandTrim) parts.push(brandTrim);
  if (modelTrim) parts.push(modelTrim);
  
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

const getCleanedLaptopTitle = (
  name: string,
  brand?: string | null,
  model?: string | null,
  ram?: string | null,
  storage?: string | null,
  processor?: string | null,
  screen_size?: string | null,
  color?: string | null
) => {
  let cleanName = name || "";
  
  if (!cleanName.trim()) {
    const parts = [];
    const brandTrim = brand ? brand.trim() : "";
    const modelTrim = model ? model.trim() : "";
    if (brandTrim && modelTrim) {
      if (modelTrim.toLowerCase().startsWith(brandTrim.toLowerCase())) {
        parts.push(modelTrim);
      } else {
        parts.push(brandTrim, modelTrim);
      }
    } else if (modelTrim) {
      parts.push(modelTrim);
    } else if (brandTrim) {
      parts.push(brandTrim);
    }
    return parts.join(" ") || "İsimsiz Ürün";
  }

  if (color && color.trim()) {
    const c = color.trim();
    cleanName = cleanName.replace(new RegExp(`\\s*\\(?${c}\\)?`, 'gi'), '');
  }
  if (ram && ram.trim()) {
    const r = ram.trim();
    cleanName = cleanName.replace(new RegExp(`\\s*${r}\\s*(RAM)?`, 'gi'), '');
  }
  if (storage && storage.trim()) {
    const s = storage.trim();
    cleanName = cleanName.replace(new RegExp(`\\s*${s}`, 'gi'), '');
  }
  if (processor && processor.trim()) {
    const p = processor.trim();
    cleanName = cleanName.replace(new RegExp(`\\s*${p}`, 'gi'), '');
  }
  if (screen_size && screen_size.trim()) {
    const sc = screen_size.trim();
    cleanName = cleanName.replace(new RegExp(`\\s*${sc}\\s*(inç|inch)?`, 'gi'), '');
  }
  
  cleanName = cleanName.replace(/\s+/g, ' ').trim();
  
  return cleanName || "İsimsiz Ürün";
};

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
  const [buyPriceFocused, setBuyPriceFocused] = useState(false);
  const [sellPriceFocused, setSellPriceFocused] = useState(false);
  const [editBuyPriceFocused, setEditBuyPriceFocused] = useState(false);
  const [editSellPriceFocused, setEditSellPriceFocused] = useState(false);

  // Akıllı açılır liste (dropdown) ve "Diğer" seçeneği için local stateler
  const [selBrand, setSelBrand] = useState("");
  const [customBrand, setCustomBrand] = useState("");

  const [selModel, setSelModel] = useState("");
  const [customModel, setCustomModel] = useState("");

  const [selColor, setSelColor] = useState("");
  const [customColor, setCustomColor] = useState("");

  const [selMemory, setSelMemory] = useState("");
  const [customMemory, setCustomMemory] = useState("");

  // Bilgisayar için RAM ve Depolama
  const [selRam, setSelRam] = useState("");
  const [customRam, setCustomRam] = useState("");
  const [selStorage, setSelStorage] = useState("");
  const [customStorage, setCustomStorage] = useState("");

  const resetCatalogSelections = () => {
    setSelBrand("");
    setCustomBrand("");
    setSelModel("");
    setCustomModel("");
    setSelColor("");
    setCustomColor("");
    setSelMemory("");
    setCustomMemory("");
    setSelRam("");
    setCustomRam("");
    setSelStorage("");
    setCustomStorage("");
  };

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
    if (key === "category") {
      resetCatalogSelections();
    }
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

  const resetForm = () => {
    setForm(initialFormState);
    resetCatalogSelections();
  };

  // Hesaplanan memory değeri (Bilgisayar için RAM+Storage birleşimi)
  const computedMemory = (formData: typeof initialFormState, ram: string, storage: string): string => {
    const cat = formData.category.trim().toLowerCase();
    if (cat === "bilgisayar") {
      const parts = [];
      if (ram.trim()) parts.push(ram.trim());
      if (storage.trim()) parts.push(storage.trim());
      return parts.join(" / ");
    }
    return formData.memory;
  };

  const handleAddProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.barcode.trim()) {
      showStatus("error", "Barkod / Karekod alanı zorunludur.");
      return;
    }

    if (!form.name.trim() && !form.brand.trim() && !form.model.trim()) {
      showStatus("error", "Ürün Adı boş bırakılacaksa Marka veya Model girilmelidir.");
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

    const memoryValue = computedMemory(form, form.ram, form.storage);
    const manualName = form.name.trim();
    const finalName = manualName || buildProductName(form.brand, form.model, form.color, memoryValue, form.ram, form.storage, form.processor, form.screen_size, isLaptop) || "İsimsiz Ürün";

    const { data, error } = await createProduct({
      barcode: form.barcode.trim(),
      name: finalName,
      category: form.category.trim() || null,
      stock: Number(form.stock) || 0,
      buy_price: Number(form.buy_price) || 0,
      sell_price: Number(form.sell_price) || 0,
      min_stock: Number(form.min_stock) || 0,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
      image_url: form.image_url.trim() || null,
      is_web_visible: form.is_web_visible === true,
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      color: form.color.trim() || null,
      memory: isLaptop ? null : (memoryValue.trim() || null),
      ram: isLaptop ? (form.ram.trim() || null) : null,
      storage: isLaptop ? (form.storage.trim() || null) : null,
      processor: isLaptop ? (form.processor.trim() || null) : null,
      screen_size: isLaptop ? (form.screen_size.trim() || null) : null,
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
      brand: product.brand || "",
      model: product.model || "",
      color: product.color || "",
      memory: product.memory || "",
      ram: product.ram || "",
      storage: product.storage || "",
      processor: product.processor || "",
      screen_size: product.screen_size || "",
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(initialFormState);
  };

  const handleSaveEdit = async (product: Product) => {
    if (!editForm.barcode.trim()) {
      showStatus("error", "Barkod / Karekod alanı zorunludur.");
      return;
    }

    if (!editForm.name.trim() && !editForm.brand.trim() && !editForm.model.trim()) {
      showStatus("error", "Ürün Adı boş bırakılacaksa Marka veya Model girilmelidir.");
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

    const manualName = editForm.name.trim();
    const isEditLaptop = editForm.category.trim().toLowerCase() === "bilgisayar";
    const finalName = manualName || buildProductName(editForm.brand, editForm.model, editForm.color, editForm.memory, editForm.ram, editForm.storage, editForm.processor, editForm.screen_size, isEditLaptop) || "İsimsiz Ürün";

    const { data, error } = await updateProduct(product.id, {
      barcode: editForm.barcode.trim(),
      name: finalName,
      category: editForm.category.trim() || null,
      stock: Number(editForm.stock) || 0,
      buy_price: Number(editForm.buy_price) || 0,
      sell_price: Number(editForm.sell_price) || 0,
      min_stock: Number(editForm.min_stock) || 0,
      location: editForm.location.trim() || null,
      description: editForm.description.trim() || null,
      image_url: editForm.image_url.trim() || null,
      is_web_visible: editForm.is_web_visible === true,
      brand: editForm.brand.trim() || null,
      model: editForm.model.trim() || null,
      color: editForm.color.trim() || null,
      memory: editForm.category.trim().toLowerCase() === "bilgisayar" ? null : (editForm.memory.trim() || null),
      ram: editForm.category.trim().toLowerCase() === "bilgisayar" ? (editForm.ram.trim() || null) : null,
      storage: editForm.category.trim().toLowerCase() === "bilgisayar" ? (editForm.storage.trim() || null) : null,
      processor: editForm.category.trim().toLowerCase() === "bilgisayar" ? (editForm.processor.trim() || null) : null,
      screen_size: editForm.category.trim().toLowerCase() === "bilgisayar" ? (editForm.screen_size.trim() || null) : null,
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

  const catLower = form.category.trim().toLowerCase();
  const isPhone = catLower === "telefon";
  const isTablet = catLower === "tablet";
  const isLaptop = catLower === "bilgisayar";
  const isSmartwatch = catLower === "akıllı saat";
  const isAccessory = catLower === "aksesuar";
  // Telefon veya Tablet veya Akıllı Saat — katalog dropdown kullanan kategoriler
  const usePhoneCatalog = isPhone;
  const useTabletCatalog = isTablet;
  const useSmartwatchCatalog = isSmartwatch;
  const useLaptopCatalog = isLaptop;

  // Seçili katalog girişi (Telefon)
  const selectedPhoneEntry = phoneCatalog.find(
    (p) =>
      p.brand.toLowerCase() === selBrand.toLowerCase() &&
      p.model.toLowerCase() === selModel.toLowerCase()
  );
  // Seçili katalog girişi (Tablet)
  const selectedTabletEntry = tabletCatalog.find(
    (p) =>
      p.brand.toLowerCase() === selBrand.toLowerCase() &&
      p.model.toLowerCase() === selModel.toLowerCase()
  );
  // Seçili katalog girişi (Akıllı Saat)
  const selectedWatchEntry = smartwatchCatalog.find(
    (p) =>
      p.brand.toLowerCase() === selBrand.toLowerCase() &&
      p.model.toLowerCase() === selModel.toLowerCase()
  );
  // Seçili katalog girişi (Laptop)
  const selectedLaptopEntry = laptopCatalog.find(
    (p) =>
      p.brand.toLowerCase() === selBrand.toLowerCase() &&
      p.model.toLowerCase() === selModel.toLowerCase()
  );

  const modelColors = isPhone ? (selectedPhoneEntry?.colors ?? [])
    : isTablet ? (selectedTabletEntry?.colors ?? [])
    : isSmartwatch ? (selectedWatchEntry?.colors ?? [])
    : isLaptop ? (selectedLaptopEntry?.colors ?? [])
    : [];

  const modelMemories = isPhone ? (selectedPhoneEntry?.memories ?? [])
    : isTablet ? (selectedTabletEntry?.memories ?? [])
    : isSmartwatch ? (selectedWatchEntry?.memories ?? [])
    : [];

  const laptopRamOptions = selectedLaptopEntry?.ramOptions ?? [];
  const laptopStorageOptions = selectedLaptopEntry?.storageOptions ?? [];

  // Aktif katalog markaları/modelleri
  const activeCatalog = usePhoneCatalog ? phoneCatalog
    : useTabletCatalog ? tabletCatalog
    : useSmartwatchCatalog ? smartwatchCatalog
    : useLaptopCatalog ? laptopCatalog
    : null;
  const activeBrands = isAccessory
    ? accessoryBrands
    : activeCatalog
    ? Array.from(new Set(activeCatalog.map((p) => p.brand)))
    : null;
  const activeModelsForBrand = activeCatalog
    ? activeCatalog.filter((p) => p.brand.toLowerCase() === selBrand.toLowerCase())
    : [];

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
        <div className="space-y-6">
          <form
            onSubmit={handleAddProduct}
            className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5"
          >
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
            Yeni Ürün Ekle
          </p>
          <div className="mt-6 grid gap-4">
            {/* 1. Barkod / Karekod */}
            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">Barkod / Karekod</span>
              <input
                type="text"
                name="barcode"
                id="product-barcode"
                value={form.barcode}
                onChange={(e) => handleFormChange("barcode", e.target.value)}
                ref={barcodeRef}
                required
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            {/* 2. Kategori — Chip seçimi + Diğer toggle */}
            <div className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">Kategori</span>
              {/* Kategori chip'leri */}
              <div className="flex flex-wrap gap-1.5">
                {([
                  { label: "📱 Telefon", value: "Telefon" },
                  { label: "📟 Tablet", value: "Tablet" },
                  { label: "💻 Bilgisayar", value: "Bilgisayar" },
                  { label: "🎧 Aksesuar", value: "Aksesuar" },
                  { label: "⌚ Akıllı Saat", value: "Akıllı Saat" },
                ] as const).map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleFormChange("category", value)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition cursor-pointer ${
                      form.category.trim().toLowerCase() === value.toLowerCase()
                        ? "bg-sky-500 text-white border-sky-500 shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-sky-50 hover:border-sky-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Kategori text: readonly iken dolu, yoksa "Diğer" link ile açılır */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  name="category"
                  id="product-category"
                  value={form.category}
                  readOnly={[
                    "Telefon", "Tablet", "Bilgisayar", "Aksesuar", "Akıllı Saat"
                  ].some((c) => c.toLowerCase() === form.category.trim().toLowerCase())}
                  onChange={(e) => handleFormChange("category", e.target.value)}
                  className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 read-only:bg-slate-100 read-only:text-slate-800 read-only:font-semibold"
                  placeholder="Örn: Telefon, Aksesuar..."
                />
                {form.category && (
                  <button
                    type="button"
                    onClick={() => handleFormChange("category", "")}
                    className="shrink-0 text-xs text-slate-400 hover:text-rose-500 transition px-2 py-1 rounded-lg hover:bg-rose-50"
                  >
                    × Temizle
                  </button>
                )}
              </div>
              {!form.category && (
                <p className="text-xs text-slate-400">Yukarıdan bir kategori chip'i seçin veya alana yazın.</p>
              )}
            </div>

            {/* 3. Marka */}
            <div className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">Marka</span>
              {activeBrands ? (
                <>
                  <select
                    value={selBrand}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelBrand(val);
                      setSelModel("");
                      setSelColor("");
                      setSelMemory("");
                      setSelRam("");
                      setSelStorage("");
                      handleFormChange("brand", val === "_other" ? customBrand : val);
                      handleFormChange("model", "");
                      handleFormChange("color", "");
                      handleFormChange("memory", "");
                      handleFormChange("ram", "");
                      handleFormChange("storage", "");
                    }}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 cursor-pointer"
                    size={1}
                  >
                    <option value="">Marka Seçin...</option>
                    {activeBrands.map((brand) => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                    <option value="_other">Diğer...</option>
                  </select>
                  {selBrand === "_other" && (
                    <input
                      type="text"
                      placeholder="Lütfen marka girin..."
                      value={customBrand}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomBrand(val);
                        handleFormChange("brand", val);
                      }}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    />
                  )}
                </>
              ) : (
                <input
                  type="text"
                  name="brand"
                  id="product-brand"
                  value={form.brand}
                  onChange={(e) => handleFormChange("brand", e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
              )}
            </div>

            {/* 4. Model */}
            <div className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">Model</span>
              {activeCatalog ? (
                <>
                  <select
                    value={selModel}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelModel(val);
                      setSelColor("");
                      setSelMemory("");
                      setSelRam("");
                      setSelStorage("");
                      handleFormChange("model", val === "_other" ? customModel : val);
                      handleFormChange("color", "");
                      handleFormChange("memory", "");
                      handleFormChange("ram", "");
                      handleFormChange("storage", "");
                    }}
                     disabled={!selBrand}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    size={1}
                  >
                    <option value="">Model Seçin...</option>
                    {activeModelsForBrand.map((p) => (
                      <option key={p.model} value={p.model}>{p.model}</option>
                    ))}
                    <option value="_other">Diğer...</option>
                  </select>
                   {!selBrand && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">⚠️ Önce marka seçin</p>
                  )}
                  {selModel === "_other" && (
                    <input
                      type="text"
                      placeholder="Lütfen model girin..."
                      value={customModel}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomModel(val);
                        handleFormChange("model", val);
                      }}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    />
                  )}
                </>
              ) : (
                <input
                  type="text"
                  name="model"
                  id="product-model"
                  value={form.model}
                  disabled={isAccessory && !selBrand}
                  onChange={(e) => handleFormChange("model", e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              )}
            </div>

            {/* 5. Renk */}
            <div className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">Renk</span>
              {(isPhone || isTablet || isLaptop || isSmartwatch) ? (
                <>
                  <select
                    value={selColor}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelColor(val);
                      handleFormChange("color", val === "_other" ? customColor : val);
                    }}
                    disabled={!selModel}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    size={1}
                  >
                    <option value="">Renk Seçin...</option>
                    {modelColors.map((color) => (
                      <option key={color} value={color}>{color}</option>
                    ))}
                    <option value="_other">Diğer...</option>
                  </select>
                   {!selModel && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">⚠️ Önce model seçin</p>
                  )}
                  {selColor === "_other" && (
                    <input
                      type="text"
                      placeholder="Lütfen renk girin..."
                      value={customColor}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomColor(val);
                        handleFormChange("color", val);
                      }}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    />
                  )}
                </>
              ) : isAccessory ? (
                <>
                  <select
                    value={selColor}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelColor(val);
                      handleFormChange("color", val === "_other" ? customColor : val);
                    }}
                    disabled={!selBrand}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    size={1}
                  >
                    <option value="">Renk Seçin...</option>
                    {accessoryColors.map((color) => (
                      <option key={color} value={color}>{color}</option>
                    ))}
                    <option value="_other">Diğer...</option>
                  </select>
                  {selColor === "_other" && (
                    <input
                      type="text"
                      placeholder="Lütfen renk girin..."
                      value={customColor}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomColor(val);
                        handleFormChange("color", val);
                      }}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    />
                  )}
                </>
              ) : (
                <input
                  type="text"
                  name="color"
                  id="product-color"
                  value={form.color}
                  onChange={(e) => handleFormChange("color", e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
              )}
            </div>

            {/* 6. Hafıza / RAM / Depolama */}
            {/* Bilgisayar: RAM + Depolama ayrı ayrı */}
            {isLaptop && (
              <>
                <div className="grid gap-2 text-sm text-slate-700">
                  <span className="font-medium">RAM</span>
                  {selectedLaptopEntry ? (
                    <>
                      <select
                        value={selRam}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelRam(val);
                          handleFormChange("ram", val === "_other" ? customRam : val);
                        }}
                        disabled={!selModel}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        size={1}
                      >
                        <option value="">RAM Seçin...</option>
                        {laptopRamOptions.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                        <option value="_other">Diğer...</option>
                      </select>
                      {!selModel && (
                        <p className="text-xs text-amber-600">⚠️ Önce model seçin</p>
                      )}
                      {selRam === "_other" && (
                        <input
                          type="text"
                          placeholder="Örn: 32 GB"
                          value={customRam}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomRam(val);
                            handleFormChange("ram", val);
                          }}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                        />
                      )}
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        name="ram"
                        id="product-ram"
                        value={form.ram}
                        onChange={(e) => handleFormChange("ram", e.target.value)}
                        placeholder="Örn: 16 GB (Opsiyonel)"
                        disabled={!selBrand}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 disabled:opacity-50"
                      />
                      {!selBrand && <p className="text-xs text-amber-600">⚠️ Önce marka seçin</p>}
                    </>
                  )}
                </div>
                <div className="grid gap-2 text-sm text-slate-700">
                  <span className="font-medium">Depolama</span>
                  {selectedLaptopEntry ? (
                    <>
                      <select
                        value={selStorage}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelStorage(val);
                          handleFormChange("storage", val === "_other" ? customStorage : val);
                        }}
                        disabled={!selModel}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        size={1}
                      >
                        <option value="">Depolama Seçin...</option>
                        {laptopStorageOptions.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                        <option value="_other">Diğer...</option>
                      </select>
                      {!selModel && (
                        <p className="text-xs text-amber-600">⚠️ Önce model seçin</p>
                      )}
                      {selStorage === "_other" && (
                        <input
                          type="text"
                          placeholder="Örn: 1 TB SSD"
                          value={customStorage}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomStorage(val);
                            handleFormChange("storage", val);
                          }}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                        />
                      )}
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        name="storage"
                        id="product-storage"
                        value={form.storage}
                        onChange={(e) => handleFormChange("storage", e.target.value)}
                        placeholder="Örn: 512 GB SSD (Opsiyonel)"
                        disabled={!selBrand}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 disabled:opacity-50"
                      />
                      {!selBrand && <p className="text-xs text-amber-600">⚠️ Önce marka seçin</p>}
                    </>
                  )}
                </div>
                <div className="grid gap-2 text-sm text-slate-700">
                  <span className="font-medium">İşlemci</span>
                  <input
                    type="text"
                    name="processor"
                    id="product-processor"
                    value={form.processor}
                    onChange={(e) => handleFormChange("processor", e.target.value)}
                    placeholder="Örn: M3 Pro (Opsiyonel)"
                    disabled={!selBrand}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 disabled:opacity-50"
                  />
                  {!selBrand && <p className="text-xs text-amber-600">⚠️ Önce marka seçin</p>}
                </div>
                <div className="grid gap-2 text-sm text-slate-700">
                  <span className="font-medium">Ekran Boyutu</span>
                  <input
                    type="text"
                    name="screen_size"
                    id="product-screen_size"
                    value={form.screen_size}
                    onChange={(e) => handleFormChange("screen_size", e.target.value)}
                    placeholder="Örn: 14 (Opsiyonel)"
                    disabled={!selBrand}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 disabled:opacity-50"
                  />
                  {!selBrand && <p className="text-xs text-amber-600">⚠️ Önce marka seçin</p>}
                </div>
              </>
            )}
            {/* Telefon / Tablet / Akıllı Saat: Hafıza (gizli değilse) */}
            {(isPhone || isTablet || isSmartwatch) && !((isPhone || isTablet || isSmartwatch) && selModel && selModel !== "_other" && modelMemories.length === 0) && (
              <div className="grid gap-2 text-sm text-slate-700">
                <span className="font-medium">Hafıza (Opsiyonel)</span>
                {(isPhone || isTablet) && (selModel && selModel !== "_other") ? (
                  <>
                    <select
                      value={selMemory}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelMemory(val);
                        handleFormChange("memory", val === "_other" ? customMemory : val);
                      }}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 cursor-pointer"
                      size={1}
                    >
                      <option value="">Hafıza Seçin...</option>
                      {modelMemories.map((mem) => (
                        <option key={mem} value={mem}>{mem}</option>
                      ))}
                      <option value="_other">Diğer...</option>
                    </select>
                    {selMemory === "_other" && (
                      <input
                        type="text"
                        placeholder="Lütfen hafıza girin..."
                        value={customMemory}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomMemory(val);
                          handleFormChange("memory", val);
                        }}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                      />
                    )}
                  </>
                ) : isSmartwatch && (selModel && selModel !== "_other") ? (
                  /* Akıllı saat: hafıza genellikle yok, opsiyonel manuel */
                  <input
                    type="text"
                    name="memory"
                    id="product-memory"
                    value={form.memory}
                    onChange={(e) => handleFormChange("memory", e.target.value)}
                    placeholder="Opsiyonel (genellikle boş bırakılır)"
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  />
                ) : (
                  <>
                    <input
                      type="text"
                      name="memory"
                      id="product-memory"
                      value={form.memory}
                      onChange={(e) => handleFormChange("memory", e.target.value)}
                      placeholder="Örn: 256 GB (Boş bırakılabilir)"
                      disabled={!!(activeCatalog && (!selModel || selModel === "_other"))}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 disabled:opacity-50"
                    />
                    {activeCatalog && (!selModel || selModel === "_other") && (
                      <p className="text-xs text-amber-600">⚠️ Önce model seçin</p>
                    )}
                  </>
                )}
              </div>
            )}
            {/* Diğer kategoriler: opsiyonel hafıza alanı */}
            {!isPhone && !isTablet && !isLaptop && !isSmartwatch && !isAccessory && (
              <div className="grid gap-2 text-sm text-slate-700">
                <span className="font-medium">Hafıza (Opsiyonel)</span>
                <input
                  type="text"
                  name="memory"
                  id="product-memory"
                  value={form.memory}
                  onChange={(e) => handleFormChange("memory", e.target.value)}
                  placeholder="Örn: 256 GB (Boş bırakılabilir)"
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
              </div>
            )}

            {/* 7. Ürün Adı */}
            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">Ürün Adı (Boş bırakılırsa otomatik oluşturulur)</span>
              <input
                type="text"
                name="name"
                id="product-name"
                value={form.name}
                onChange={(e) => handleFormChange("name", e.target.value)}
                placeholder="Örn: Apple iPhone 15 Pro Max"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            {/* 8. Ürün Açıklaması */}
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

            {/* 9. Ürün Fotoğrafı */}
            <div className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">Ürün Fotoğrafı</span>
              <ProductImageUploader
                imageUrl={form.image_url}
                onUploadSuccess={(url) => handleFormChange("image_url", url)}
                idPrefix="new-product"
              />
            </div>

            {/* 9. Stok Adedi */}
            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">Stok Adedi</span>
              <input
                type="number"
                name="stock"
                id="product-stock"
                value={form.stock}
                onChange={(e) => handleFormChange("stock", formatAmount(e.target.value))}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            {/* 10. Alış Fiyatı */}
            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">Alış Fiyatı</span>
              <input
                type="text"
                name="buy_price"
                id="product-buy_price"
                value={buyPriceFocused ? form.buy_price : formatCurrencyTRY(form.buy_price)}
                onFocus={() => setBuyPriceFocused(true)}
                onBlur={(e) => {
                  setBuyPriceFocused(false);
                  handleFormChange("buy_price", parseCurrencyTRY(e.target.value));
                }}
                onChange={(e) => handleFormChange("buy_price", e.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            {/* 11. Satış Fiyatı */}
            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">Satış Fiyatı</span>
              <input
                type="text"
                name="sell_price"
                id="product-sell_price"
                value={sellPriceFocused ? form.sell_price : formatCurrencyTRY(form.sell_price)}
                onFocus={() => setSellPriceFocused(true)}
                onBlur={(e) => {
                  setSellPriceFocused(false);
                  handleFormChange("sell_price", parseCurrencyTRY(e.target.value));
                }}
                onChange={(e) => handleFormChange("sell_price", e.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            {/* 12. Azalan Stok Alarmı */}
            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">Azalan Stok Alarmı</span>
              <input
                type="number"
                name="min_stock"
                id="product-min_stock"
                value={form.min_stock}
                onChange={(e) => handleFormChange("min_stock", formatAmount(e.target.value))}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            {/* 13. Web Sitesinde Gösterilsin mi? */}
            <label className="flex items-center gap-3 text-sm text-slate-700 select-none cursor-pointer mt-2">
              <input
                type="checkbox"
                name="is_web_visible"
                id="product-is_web_visible"
                checked={form.is_web_visible}
                onChange={(e) => handleFormChange("is_web_visible", e.target.checked)}
                className="h-5 w-5 rounded-lg border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="font-medium">Web Sitesinde Gösterilsin mi?</span>
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

        {/* CANLI ÜRÜN ÖNİZLEME KARTI */}
        <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
              Canlı Ürün Önizleme
            </p>
            <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[10px] font-semibold text-sky-700 border border-sky-100">
              Web Sitesi Görünümü
            </span>
          </div>
          
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5 p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
            {/* Sol: Fotoğraf veya Kategori İkonu */}
            <div className="shrink-0">
              <div className="h-20 w-20 overflow-hidden rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm text-3xl select-none">
                {form.image_url ? (
                  <img
                    src={form.image_url}
                    alt="Önizleme"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (() => {
                    const cat = form.category.trim().toLowerCase();
                    if (cat === "telefon") return "📱";
                    if (cat === "tablet") return "📟";
                    if (cat === "bilgisayar") return "💻";
                    if (cat === "aksesuar") return "🎧";
                    if (cat === "akıllı saat") return "⌚";
                    return "📦";
                  })()
                )}
              </div>
            </div>
            
            {/* Sağ: Bilgiler */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <h4 className="text-sm font-bold text-slate-900 leading-snug">
                  {(() => {
                    const colorVal = selColor === "_other" ? customColor : (selColor || form.color);
                    const isL = form.category.trim().toLowerCase() === "bilgisayar";
                    if (isL) {
                      return getCleanedLaptopTitle(
                        form.name.trim(),
                        form.brand,
                        form.model,
                        form.ram,
                        form.storage,
                        form.processor,
                        form.screen_size,
                        colorVal
                      );
                    }
                    const computedName = buildProductName(
                      form.brand,
                      form.model,
                      colorVal,
                      form.category.trim().toLowerCase() === "bilgisayar" ? null : (selMemory === "_other" ? customMemory : (selMemory || form.memory)),
                      form.ram,
                      form.storage,
                      form.processor,
                      form.screen_size,
                      false
                    );
                    return form.name.trim() || computedName || "Yeni Ürün Adı";
                  })()}
                </h4>
                {form.is_web_visible ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">✓ Webde</span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 border border-slate-200">Gizli</span>
                )}
              </div>
              
              {/* Kategori • Marka • Model (Sadeleştirilmiş) */}
              <p className="text-xs text-slate-500 mb-1 leading-relaxed">
                {(() => {
                  const parts = [];
                  if (form.category) parts.push(form.category);
                  
                  const brandStr = (form.brand || "").trim();
                  const modelStr = (form.model || "").trim();
                  
                  if (brandStr && modelStr) {
                    if (modelStr.toLowerCase().startsWith(brandStr.toLowerCase())) {
                      parts.push(modelStr);
                    } else {
                      parts.push(`${brandStr} ${modelStr}`);
                    }
                  } else if (modelStr) {
                    parts.push(modelStr);
                  } else if (brandStr) {
                    parts.push(brandStr);
                  }
                  return parts.join(' • ') || "Kategori • Model";
                })()}
              </p>
              
              {/* Özellikler: Renk • Hafıza */}
              {((form.category.trim().toLowerCase() === "bilgisayar" ? (form.ram || form.storage || form.processor || form.screen_size) : (selColor || selMemory || form.color || form.memory)) && (
                <p className="text-xs text-slate-500 mb-2">
                  {(() => {
                    const colorVal = selColor === "_other" ? customColor : (selColor || form.color);
                    if (form.category.trim().toLowerCase() === "bilgisayar") {
                      const features = [];
                      if (colorVal) features.push(`🎨 ${colorVal}`);
                      if (form.ram) features.push(`💾 RAM: ${form.ram}`);
                      if (form.storage) features.push(`📁 Depolama: ${form.storage}`);
                      if (form.processor) features.push(`⚙️ İşlemci: ${form.processor}`);
                      if (form.screen_size) {
                        const s = form.screen_size;
                        const sizeStr = s.toLowerCase().includes("inç") || s.includes("\"") || s.toLowerCase().includes("inch") ? s : `${s} inç`;
                        features.push(`🖥️ Ekran: ${sizeStr}`);
                      }
                      return features.join('  ');
                    } else {
                      const memVal = selMemory === "_other" ? customMemory : (selMemory || form.memory);
                      const features = [];
                      if (colorVal) features.push(`🎨 ${colorVal}`);
                      if (memVal) features.push(`💾 ${memVal}`);
                      return features.join('  ');
                    }
                  })()}
                </p>
              ))}
              
              {/* Barkod */}
              <p className="text-[10px] text-slate-400 font-mono mb-2">#{form.barcode || "Barkod / Karekod"}</p>
              
              {/* Fiyat Satırı */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-bold text-slate-900">
                    {formatCurrencyTRY(form.sell_price) || "₺0,00"}
                  </span>
                </div>
                {Number(form.buy_price) > 0 && (
                  <span className="text-xs text-slate-400">
                    Alış: {formatCurrencyTRY(form.buy_price)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

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
                            <span>Barkod / Karekod</span>
                            <input
                              value={editForm.barcode}
                              onChange={(event) =>
                                handleEditFormChange("barcode", event.target.value)
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
                            <span>Marka</span>
                            <input
                              value={editForm.brand}
                              onChange={(event) =>
                                handleEditFormChange("brand", event.target.value)
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-700">
                            <span>Model</span>
                            <input
                              value={editForm.model}
                              onChange={(event) =>
                                handleEditFormChange("model", event.target.value)
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-700">
                            <span>Renk</span>
                            <input
                              value={editForm.color}
                              onChange={(event) =>
                                handleEditFormChange("color", event.target.value)
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                            />
                          </label>
                          {editForm.category.trim().toLowerCase() === "bilgisayar" ? (
                            <>
                              <label className="grid gap-2 text-sm text-slate-700">
                                <span>RAM</span>
                                <input
                                  value={editForm.ram}
                                  onChange={(event) =>
                                    handleEditFormChange("ram", event.target.value)
                                  }
                                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                                />
                              </label>
                              <label className="grid gap-2 text-sm text-slate-700">
                                <span>Depolama</span>
                                <input
                                  value={editForm.storage}
                                  onChange={(event) =>
                                    handleEditFormChange("storage", event.target.value)
                                  }
                                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                                />
                              </label>
                              <label className="grid gap-2 text-sm text-slate-700">
                                <span>İşlemci</span>
                                <input
                                  value={editForm.processor}
                                  onChange={(event) =>
                                    handleEditFormChange("processor", event.target.value)
                                  }
                                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                                />
                              </label>
                              <label className="grid gap-2 text-sm text-slate-700">
                                <span>Ekran Boyutu</span>
                                <input
                                  value={editForm.screen_size}
                                  onChange={(event) =>
                                    handleEditFormChange("screen_size", event.target.value)
                                  }
                                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                                />
                              </label>
                            </>
                          ) : (
                            <label className="grid gap-2 text-sm text-slate-700">
                              <span>Hafıza (Opsiyonel)</span>
                              <input
                                value={editForm.memory}
                                onChange={(event) =>
                                  handleEditFormChange("memory", event.target.value)
                                }
                                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                                placeholder="Örn: 256 GB, 8 GB (Boş bırakılabilir)"
                              />
                            </label>
                          )}
                          <label className="grid gap-2 text-sm text-slate-700">
                            <span>Ürün Adı (Boş bırakılırsa otomatik oluşturulur)</span>
                            <input
                              value={editForm.name}
                              onChange={(event) =>
                                handleEditFormChange("name", event.target.value)
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                              placeholder="Örn: Apple iPhone 15 Pro Max"
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-700">
                            <span>Stok Adedi</span>
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
                              type="text"
                              value={editBuyPriceFocused ? editForm.buy_price : formatCurrencyTRY(editForm.buy_price)}
                              onFocus={() => setEditBuyPriceFocused(true)}
                              onBlur={(event) => {
                                setEditBuyPriceFocused(false);
                                handleEditFormChange("buy_price", parseCurrencyTRY(event.target.value));
                              }}
                              onChange={(event) =>
                                handleEditFormChange("buy_price", event.target.value)
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-700">
                            <span>Satış Fiyatı</span>
                            <input
                              type="text"
                              value={editSellPriceFocused ? editForm.sell_price : formatCurrencyTRY(editForm.sell_price)}
                              onFocus={() => setEditSellPriceFocused(true)}
                              onBlur={(event) => {
                                setEditSellPriceFocused(false);
                                handleEditFormChange("sell_price", parseCurrencyTRY(event.target.value));
                              }}
                              onChange={(event) =>
                                handleEditFormChange("sell_price", event.target.value)
                              }
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-700">
                            <span>Azalan Stok Alarmı</span>
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
                          <div className="grid gap-2 text-sm text-slate-700 sm:col-span-2">
                            <span className="font-medium">Ürün Fotoğrafı</span>
                            <ProductImageUploader
                              imageUrl={editForm.image_url}
                              onUploadSuccess={(url) => handleEditFormChange("image_url", url)}
                              idPrefix="edit-product"
                            />
                          </div>
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
                      /* ─── Ürün Kartı — Profesyonel Tasarım ─── */
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
                        {/* Sol: Fotoğraf */}
                        <div className="shrink-0">
                          <div className="h-20 w-20 overflow-hidden rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center shadow-sm">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className="text-2xl select-none">
                                {product.category?.toLowerCase() === 'telefon' ? '📱'
                                  : product.category?.toLowerCase() === 'tablet' ? '📟'
                                  : product.category?.toLowerCase() === 'bilgisayar' ? '💻'
                                  : product.category?.toLowerCase() === 'aksesuar' ? '🎧'
                                  : product.category?.toLowerCase() === 'akıllı saat' ? '⌚'
                                  : '📦'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Sağ: Bilgi + İşlemler */}
                        <div className="flex-1 min-w-0">
                          {/* Başlık satırı */}
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <h4 className="text-sm font-bold text-slate-900 leading-snug">
                              {product.category?.toLowerCase() === 'bilgisayar' 
                                ? getCleanedLaptopTitle(product.name, product.brand, product.model, product.ram, product.storage, product.processor, product.screen_size, product.color) 
                                : product.name
                              }
                            </h4>
                            {product.is_web_visible ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">✓ Webde</span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 border border-slate-200">Gizli</span>
                            )}
                          </div>

                          {/* Kategori • Marka • Model */}
                          {(product.category || product.brand || product.model) && (
                            <p className="text-xs text-slate-500 mb-1 leading-relaxed">
                              {(() => {
                                const parts = [];
                                if (product.category) parts.push(product.category);
                                
                                const brandStr = (product.brand || "").trim();
                                const modelStr = (product.model || "").trim();
                                
                                if (brandStr && modelStr) {
                                  if (modelStr.toLowerCase().startsWith(brandStr.toLowerCase())) {
                                    parts.push(modelStr);
                                  } else {
                                    parts.push(`${brandStr} ${modelStr}`);
                                  }
                                } else if (modelStr) {
                                  parts.push(modelStr);
                                } else if (brandStr) {
                                  parts.push(brandStr);
                                }
                                return parts.join(' • ');
                              })()}
                            </p>
                          )}

                          {/* Özellikler: Renk • Hafıza / RAM • Depolama • İşlemci • Ekran Boyutu */}
                          {(() => {
                            const isL = product.category?.toLowerCase() === 'bilgisayar';
                            if (isL) {
                              const features = [];
                              if (product.color) features.push(`🎨 ${product.color}`);
                              if (product.ram) features.push(`💾 RAM: ${product.ram}`);
                              if (product.storage) features.push(`📁 Depolama: ${product.storage}`);
                              if (product.processor) features.push(`⚙️ İşlemci: ${product.processor}`);
                              if (product.screen_size) {
                                const s = product.screen_size;
                                const sizeStr = s.toLowerCase().includes("inç") || s.includes("\"") || s.toLowerCase().includes("inch") ? s : `${s} inç`;
                                features.push(`🖥️ Ekran: ${sizeStr}`);
                              }
                              if (features.length > 0) {
                                return (
                                  <p className="text-xs text-slate-500 mb-2">
                                    {features.join('  ')}
                                  </p>
                                );
                              }
                            } else {
                              if (product.color || product.memory) {
                                return (
                                  <p className="text-xs text-slate-500 mb-2">
                                    {[product.color && `🎨 ${product.color}`, product.memory && `💾 ${product.memory}`].filter(Boolean).join('  ')}
                                  </p>
                                );
                              }
                            }
                            return null;
                          })()}

                          {/* Barkod */}
                          <p className="text-[10px] text-slate-400 font-mono mb-2">#{product.barcode || '—'}</p>

                          {/* Stok + Fiyat + İşlemler satırı */}
                          <div className="flex flex-wrap items-center gap-3">
                            {/* Stok */}
                            <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5">
                              <span className={`text-base font-bold ${
                                product.stock === 0 ? 'text-rose-600'
                                : product.stock <= product.min_stock ? 'text-amber-600'
                                : 'text-slate-900'
                              }`}>{product.stock}</span>
                              <span className="text-[10px] text-slate-500 font-medium">adet</span>
                            </div>
                            {/* Satış Fiyatı */}
                            <div className="flex items-baseline gap-1">
                              <span className="text-base font-bold text-slate-900">{formatCurrencyTRY(product.sell_price)}</span>
                            </div>
                            {/* Alış */}
                            {product.buy_price > 0 && (
                              <span className="text-xs text-slate-400">Alış: {formatCurrencyTRY(product.buy_price)}</span>
                            )}

                            {/* İşlem Butonları */}
                            <div className="ml-auto flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleStockAdjustment(product, "IN")}
                                className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 active:scale-95"
                              >
                                + Stok
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStockAdjustment(product, "OUT")}
                                className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600 active:scale-95"
                              >
                                − Stok
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStartEdit(product)}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-95"
                              >
                                Düzenle
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(product.id)}
                                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 active:scale-95"
                              >
                                Sil
                              </button>
                            </div>
                          </div>

                          {/* Açıklama */}
                          {product.description && (
                            <p className="mt-2 text-[11px] text-slate-400 italic line-clamp-2">{product.description}</p>
                          )}
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
