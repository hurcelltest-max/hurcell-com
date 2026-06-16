"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import Scanner from "@/components/Scanner";

// ─────────────────────────────────────────────────────────────────
// Marka Normalizasyon Yardımcıları (Brand Normalization Helpers)
// ─────────────────────────────────────────────────────────────────

const BRAND_DISPLAY_OVERRIDES: Record<string, string> = {
  samsung: 'Samsung',
  apple: 'Apple',
  ttec: 'TTEC',
  esr: 'ESR',
  xiaomi: 'Xiaomi',
  huawei: 'Huawei',
  oppo: 'OPPO',
  vivo: 'vivo',
  realme: 'realme',
  oneplus: 'OnePlus',
  'one plus': 'OnePlus',
  motorola: 'Motorola',
  nokia: 'Nokia',
  sony: 'Sony',
  lg: 'LG',
  asus: 'ASUS',
  lenovo: 'Lenovo',
  hp: 'HP',
  dell: 'Dell',
  acer: 'Acer',
  msi: 'MSI',
  jbl: 'JBL',
  anker: 'Anker',
  baseus: 'Baseus',
  ugreen: 'UGREEN',
  reeder: 'Reeder',
  casper: 'Casper',
  turkcell: 'Turkcell',
  vestel: 'Vestel',
  philips: 'Philips',
  belkin: 'Belkin',
  spigen: 'Spigen',
  benq: 'BenQ',
  logitech: 'Logitech',
  microsoft: 'Microsoft',
  google: 'Google',
  amazon: 'Amazon',
};

function normalizeBrandKey(brand: string | null | undefined): string {
  if (!brand) return '';
  return brand.trim().toLocaleLowerCase('tr-TR');
}

function formatBrandName(brand: string | null | undefined): string {
  if (!brand) return '';
  const trimmed = brand.trim();
  const key = normalizeBrandKey(trimmed);
  if (BRAND_DISPLAY_OVERRIDES[key]) return BRAND_DISPLAY_OVERRIDES[key];
  return trimmed.charAt(0).toLocaleUpperCase('tr-TR') + trimmed.slice(1);
}

function resolveExistingBrand(
  inputBrand: string | null | undefined,
  existingBrands: (string | null | undefined)[]
): { resolved: string; wasNormalized: boolean } {
  if (!inputBrand?.trim()) return { resolved: '', wasNormalized: false };
  const inputKey = normalizeBrandKey(inputBrand);
  const existing = existingBrands.find(
    (b) => b && normalizeBrandKey(b) === inputKey
  );
  if (existing) {
    const resolved = existing;
    const wasNormalized = resolved.trim() !== inputBrand.trim();
    return { resolved, wasNormalized };
  }
  const resolved = formatBrandName(inputBrand);
  const wasNormalized = resolved !== inputBrand.trim();
  return { resolved, wasNormalized };
}


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


const normalizeText = (value?: string) =>
  (value || '')
    .toLocaleLowerCase('tr-TR')
    .trim();

const isDeviceCategory = (category?: string) => {
  const normalized = normalizeText(category);
  return (
    normalized.includes('telefon') ||
    normalized.includes('phone') ||
    normalized.includes('tablet') ||
    normalized.includes('bilgisayar') ||
    normalized.includes('computer') ||
    normalized.includes('laptop')
  );
};

const isTelefonCategory = (category?: string) => {
  const normalized = normalizeText(category);
  return normalized.includes('telefon') || normalized.includes('phone');
};

const isAksesuarCategory = (category?: string) => {
  const normalized = normalizeText(category);
  return (
    normalized.includes('aksesuar') ||
    normalized.includes('kulaklık') ||
    normalized.includes('kulaklik') ||
    normalized.includes('şarj') ||
    normalized.includes('sarj') ||
    normalized.includes('kablo') ||
    normalized.includes('cable') ||
    normalized.includes('kılıf') ||
    normalized.includes('kilif') ||
    normalized.includes('adaptör') ||
    normalized.includes('adaptor') ||
    normalized.includes('charger')
  );
};


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
  image_url_2: "",
  image_url_3: "",
  is_web_visible: false as boolean,
  is_b2b_visible: false as boolean,
  is_slider_visible: false as boolean,
  is_discounted: false as boolean,
  old_price: "",
  is_campaign: false as boolean,
  campaign_title: "",
  campaign_benefit: "",
  show_campaign_benefit_in_slider: false as boolean,
  campaign_benefit_requires_return: false as boolean,
  b2b_package_title: "",
  b2b_package_description: "",
  b2b_min_quantity: "1",
  b2b_package_price: "",
  brand: "",
  model: "",
  color: "",
  memory: "",
  ram: "",
  storage: "",
  processor: "",
  screen_size: "",
  device_condition_type: "",
  device_category: "",
  imei_1: "",
  imei_2: "",
  serial_number: "",
  battery_health: "",
  box_status: "",
  warranty_status: "",
  supplier_name: "",
  supplier_invoice_no: "",
  service_report_no: "",
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

const getTurkishPackageTitle = (quantity: number): string => {
  if (!quantity || quantity <= 0) return "";
  
  const lastTwo = quantity % 100;
  let suffix = "";
  
  if (quantity % 100 === 0 && quantity > 0) {
    suffix = "'lü";
  } else {
    if (lastTwo >= 10 && lastTwo % 10 === 0) {
      const tens = lastTwo;
      if (tens === 10 || tens === 30) {
        suffix = "'lu";
      } else if (tens === 20 || tens === 50 || tens === 70 || tens === 80) {
        suffix = "'li";
      } else if (tens === 40 || tens === 60 || tens === 90) {
        suffix = "'lı";
      }
    } else {
      const lastDigit = quantity % 10;
      if (lastDigit === 1 || lastDigit === 2 || lastDigit === 5 || lastDigit === 7 || lastDigit === 8) {
        suffix = "'li";
      } else if (lastDigit === 3 || lastDigit === 4) {
        suffix = "'lü";
      } else if (lastDigit === 6) {
        suffix = "'lı";
      } else if (lastDigit === 9) {
        suffix = "'lu";
      }
    }
  }
  
  return `${quantity}${suffix} Paket`;
};

const checkB2bTitleQuantityMismatch = (packageTitle: string, minQuantity: string | number) => {
  if (!packageTitle) return null;
  const match = packageTitle.match(/\d+/);
  if (match) {
    const numInTitle = parseInt(match[0], 10);
    const qty = parseInt(String(minQuantity), 10);
    if (!isNaN(numInTitle) && !isNaN(qty) && numInTitle !== qty) {
      const suffix = getTurkishPackageTitle(numInTitle).replace(String(numInTitle), "").replace(" Paket", "");
      return {
        numInTitle,
        qty,
        warningText: `Paket başlığınız ${numInTitle}${suffix} görünüyor ama paket adedi ${qty}. Paket adedini ${numInTitle} yapmak ister misiniz?`
      };
    }
  }
  return null;
};

export default function UrunlerPage() {
  
  const [campaignModalProduct, setCampaignModalProduct] = useState<Product | null>(null);
  const [campName, setCampName] = useState("");
  const [campDesc, setCampDesc] = useState("");
  const [campType, setCampType] = useState<"direct_discount" | "quantity_discount" | "buy_x_pay_y" | "cross_product">("direct_discount");
  const [campDiscType, setCampDiscType] = useState<"percent" | "fixed_amount">("percent");
  const [campDiscValue, setCampDiscValue] = useState(0);
  const [campBuyQty, setCampBuyQty] = useState(1);
  const [campDiscQty, setCampDiscQty] = useState(1);
  const [campStarts, setCampStarts] = useState("");
  const [campEnds, setCampEnds] = useState("");
  const [campIsActive, setCampIsActive] = useState(true);
  const [isCampSaving, setIsCampSaving] = useState(false);
  const [selectedDiscountedProducts, setSelectedDiscountedProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  useEffect(() => {
    if (campaignModalProduct) {
      setSelectedDiscountedProducts([]);
      setSearchQuery("");
      setIsSearchFocused(false);
      setCampType("cross_product");
      setCampBuyQty(1);
      setCampDiscQty(1);
    }
  }, [campaignModalProduct]);

  useEffect(() => {
    if (campaignModalProduct) {
      setCampName(campaignModalProduct.name + " Özel Kampanya");
      setCampDesc("");
      setCampType("direct_discount");
      setCampDiscType("percent");
      setCampDiscValue(0);
      setCampBuyQty(1);
      setCampDiscQty(1);
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      setCampStarts(now.toISOString().slice(0, 16));
      setCampEnds("");
      setCampIsActive(true);
    }
  }, [campaignModalProduct]);

  const handleSaveCampaign = async () => {
    if (!campaignModalProduct) return;
    setIsCampSaving(true);
    try {
      const payload = {
        name: campName,
        description: campDesc,
        campaign_type: campType,
        discount_type: campDiscType,
        discount_value: campDiscValue,
        buy_quantity: campBuyQty,
        discounted_quantity: campDiscQty,
        starts_at: new Date(campStarts).toISOString(),
        ends_at: campEnds ? new Date(campEnds).toISOString() : null,
        is_active: campIsActive
      };

      const { data: newCamp, error } = await (supabase as any).from("campaigns").insert([payload]).select("id").single();
      if (error) throw error;

      let rows: any[] = [];
      if (campType === "cross_product") {
         rows.push({ campaign_id: (newCamp as any).id, product_id: campaignModalProduct.id, product_role: "trigger" });
         selectedDiscountedProducts.forEach(dp => {
           rows.push({ campaign_id: (newCamp as any).id, product_id: dp.id, product_role: "discounted" });
         });
      } else {
         rows.push({ campaign_id: (newCamp as any).id, product_id: campaignModalProduct.id, product_role: "eligible" });
      }
      
      const { error: relError } = await supabase!.from("campaign_products").insert(rows as any);
      if (relError) throw relError;

      alert("Kampanya başarıyla oluşturuldu.");
      setCampaignModalProduct(null);
    } catch (err: any) {
      alert("Hata: " + err.message);
    } finally {
      setIsCampSaving(false);
    }
  };
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
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  // --- YENİ EKLENEN DURUMLAR VE DEĞERLER (STOK ÖZETİ & MODAL) ---
  const [showAllProductsModal, setShowAllProductsModal] = useState(false);
  const [modalFilter, setModalFilter] = useState("all");
  const [modalSearchQuery, setModalSearchQuery] = useState("");
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  // --- B2B Hızlı Ayarlar Modalı State Tanımları ---
  const [b2bQuickProduct, setB2bQuickProduct] = useState<Product | null>(null);
  const [b2bQuickForm, setB2bQuickForm] = useState({
    is_b2b_visible: false,
    b2b_package_title: "",
    b2b_package_description: "",
    b2b_min_quantity: "1",
    b2b_package_price: "",
  });
  const [b2bQuickError, setB2bQuickError] = useState("");

  const handleOpenB2bQuickModal = (product: Product) => {
    setB2bQuickProduct(product);
    setB2bQuickForm({
      is_b2b_visible: product.is_b2b_visible || false,
      b2b_package_title: product.b2b_package_title || "",
      b2b_package_description: product.b2b_package_description || "",
      b2b_min_quantity: product.b2b_min_quantity != null ? String(product.b2b_min_quantity) : "1",
      b2b_package_price: product.b2b_package_price != null ? String(product.b2b_package_price) : "",
    });
    setB2bQuickError("");
  };

  const handleB2bQuickFormChange = (key: string, value: any) => {
    setB2bQuickForm((prev) => {
      const updated = { ...prev, [key]: value };
      if (key === "b2b_min_quantity" && !prev.b2b_package_title) {
        const qtyNum = parseInt(value, 10);
        if (!isNaN(qtyNum) && qtyNum > 0) {
          updated.b2b_package_title = getTurkishPackageTitle(qtyNum);
        }
      }
      return updated;
    });
  };

  const handleSaveB2bQuickSettings = async () => {
    if (!b2bQuickProduct) return;
    
    const minQty = b2bQuickForm.is_b2b_visible ? Number(b2bQuickForm.b2b_min_quantity) : 0;
    const currentStock = b2bQuickProduct.stock;
    
    if (b2bQuickForm.is_b2b_visible) {
      if (isNaN(minQty) || minQty <= 0) {
        setB2bQuickError("Minimum toptan adet en az 1 olmalıdır.");
        return;
      }
      if (minQty > currentStock) {
        setB2bQuickError("Paket adedi mevcut stoktan fazla olamaz.");
        return;
      }
    }
    
    setSaving(true);
    const updates = {
      is_b2b_visible: b2bQuickForm.is_b2b_visible,
      b2b_package_title: b2bQuickForm.is_b2b_visible ? (b2bQuickForm.b2b_package_title.trim() || null) : null,
      b2b_package_description: b2bQuickForm.is_b2b_visible ? (b2bQuickForm.b2b_package_description.trim() || null) : null,
      b2b_min_quantity: b2bQuickForm.is_b2b_visible ? minQty : null,
      b2b_package_price: b2bQuickForm.is_b2b_visible ? (b2bQuickForm.b2b_package_price.trim() !== "" ? Number(b2bQuickForm.b2b_package_price) : null) : null,
    };
    
    const { data, error } = await updateProduct(b2bQuickProduct.id, updates);
    setSaving(false);
    
    if (error || !data) {
      setB2bQuickError(error ? error.message : "Beklenmeyen hata.");
      return;
    }
    
    setProducts((prev) => prev.map((p) => p.id === b2bQuickProduct.id ? data : p));
    setB2bQuickProduct(null);
    showStatus("success", "B2B ayarları başarıyla güncellendi.");
  };

  const totalProductsCount = products.length;
  const totalStockCount = products.reduce((acc, p) => acc + (Number(p.stock) || 0), 0);

  const b2bProductsCount = products.filter(p => p.is_b2b_visible).length;
  const b2bTotalStockCount = products.filter(p => p.is_b2b_visible).reduce((acc, p) => acc + (Number(p.stock) || 0), 0);

  const phoneStockCount = products
    .filter(p => isDeviceCategory(p.category || "") && normalizeText(p.category || "").includes("telefon"))
    .reduce((acc, p) => acc + (Number(p.stock) || 0), 0);

  const tabletStockCount = products
    .filter(p => isDeviceCategory(p.category || "") && normalizeText(p.category || "").includes("tablet"))
    .reduce((acc, p) => acc + (Number(p.stock) || 0), 0);

  const computerStockCount = products
    .filter(p => isDeviceCategory(p.category || "") && (normalizeText(p.category || "").includes("bilgisayar") || normalizeText(p.category || "").includes("laptop") || normalizeText(p.category || "").includes("computer")))
    .reduce((acc, p) => acc + (Number(p.stock) || 0), 0);

  const accessoryStockCount = products
    .filter(p => normalizeText(p.category || "").includes("aksesuar") || normalizeText(p.category || "").includes("accessory"))
    .reduce((acc, p) => acc + (Number(p.stock) || 0), 0);

  const newSealedCount = products
    .filter(p => p.device_condition_type === "new_sealed")
    .reduce((acc, p) => acc + (Number(p.stock) || 0), 0);

  const usedDeviceCount = products
    .filter(p => p.device_condition_type && p.device_condition_type !== "new_sealed")
    .reduce((acc, p) => acc + (Number(p.stock) || 0), 0);

  const lowStockProductsCount = products.filter(p => p.stock > 0 && p.stock <= p.min_stock).length;
  const outOfStockProductsCount = products.filter(p => p.stock === 0).length;

  const lowStockWarnings = products.filter(p => p.stock > 0 && p.stock <= p.min_stock);

  const lastAddedProducts = [...products]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 5);

  const [quickSearchQuery, setQuickSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const normalizeForSearch = (str: string) => {
    return (str || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .replace(/ş/g, 's')
      .replace(/ğ/g, 'g')
      .replace(/ç/g, 'c')
      .replace(/ö/g, 'o')
      .replace(/ü/g, 'u')
      .trim();
  };

  const quickFilteredProducts = products.filter((p) => {
    const q = normalizeForSearch(quickSearchQuery);
    if (!q) return false;
    return (
      normalizeForSearch(p.name || "").includes(q) ||
      normalizeForSearch(p.barcode || "").includes(q) ||
      normalizeForSearch(p.brand || "").includes(q) ||
      normalizeForSearch(p.model || "").includes(q) ||
      normalizeForSearch(p.color || "").includes(q) ||
      normalizeForSearch(p.category || "").includes(q) ||
      normalizeForSearch(p.description || "").includes(q)
    );
  });

  const suggestions = products.filter((p) => {
    const q = normalizeForSearch(quickSearchQuery);
    if (!q) return false;
    return (
      normalizeForSearch(p.name || "").includes(q) ||
      normalizeForSearch(p.barcode || "").includes(q) ||
      normalizeForSearch(p.brand || "").includes(q) ||
      normalizeForSearch(p.model || "").includes(q) ||
      normalizeForSearch(p.color || "").includes(q) ||
      normalizeForSearch(p.category || "").includes(q)
    );
  }).slice(0, 10);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  // -------------------------------------------------------------

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
    if (typeof window !== "undefined") {
      setPortalTarget(document.getElementById("sidebar-portal"));
      if (window.location.hash === "#tum-urunler") {
        setShowAllProductsModal(true);
      }
    }
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
    setForm((prev) => {
      const updated = { ...prev, [key]: value };
      if (key === "b2b_min_quantity" && !prev.b2b_package_title) {
        const qtyNum = parseInt(value, 10);
        if (!isNaN(qtyNum) && qtyNum > 0) {
          updated.b2b_package_title = getTurkishPackageTitle(qtyNum);
        }
      }
      return updated;
    });
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
    setEditForm((prev) => {
      const updated = { ...prev, [key]: value };
      if (key === "b2b_min_quantity" && !prev.b2b_package_title) {
        const qtyNum = parseInt(value, 10);
        if (!isNaN(qtyNum) && qtyNum > 0) {
          updated.b2b_package_title = getTurkishPackageTitle(qtyNum);
        }
      }
      return updated;
    });
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

    // Enforce device condition type select for Telefon, Tablet, Bilgisayar
    const catTrim = form.category.trim();
    const isDevice = isDeviceCategory(catTrim);
    if (isDevice && !form.device_condition_type) {
      setSaving(false);
      showStatus("error", "Telefon, tablet ve bilgisayar stoklarında cihaz durumu seçilmelidir.");
      return;
    }
    if (isDevice && !form.imei_1.trim()) {
      setSaving(false);
      showStatus("error", "Telefon, tablet ve bilgisayar stoklarında IMEI 1 / Seri No alanı zorunludur.");
      return;
    }

    const minQty = form.is_b2b_visible ? Number(form.b2b_min_quantity) : 0;
    const currentStock = Number(form.stock) || 0;
    if (form.is_b2b_visible) {
      if (isNaN(minQty) || minQty <= 0) {
        setSaving(false);
        showStatus("error", "Minimum toptan adet en az 1 olmalıdır.");
        return;
      }
      if (minQty > currentStock) {
        setSaving(false);
        showStatus("error", "Paket adedi mevcut stoktan fazla olamaz.");
        return;
      }
    }

    let devCat = 'other';
    const normCat = normalizeText(catTrim);
    if (normCat.includes('telefon') || normCat.includes('phone')) devCat = 'phone';
    else if (normCat.includes('tablet')) devCat = 'tablet';
    else if (normCat.includes('bilgisayar') || normCat.includes('computer') || normCat.includes('laptop')) devCat = 'computer';
    else if (normCat.includes('aksesuar') || normCat.includes('accessory')) devCat = 'accessory';

    const memoryValue = computedMemory(form, form.ram, form.storage);
    const manualName = form.name.trim();
    const finalName = manualName || buildProductName(form.brand, form.model, form.color, memoryValue, form.ram, form.storage, form.processor, form.screen_size, isLaptop) || "İsimsiz Ürün";

    // Marka normalizasyonu: mevcut ürünlerin markalarıyla karşılaştır ve standart forma getir
    const existingBrandsList = products.map((p) => p.brand);
    const { resolved: resolvedBrand, wasNormalized: brandWasNormalized } = resolveExistingBrand(
      form.brand.trim(),
      existingBrandsList
    );

    const safeDeviceMetadata = isDevice
      ? {
          imei_1: form.imei_1.trim() || '',
          imei_2: form.imei_2.trim() || '',
          serial_number: form.serial_number.trim() || '',
          battery_health: form.battery_health.trim() || '',
          box_status: form.box_status.trim() || '',
          warranty_status: form.warranty_status.trim() || '',
          supplier_name: form.supplier_name.trim() || '',
          supplier_invoice_no: form.supplier_invoice_no.trim() || '',
          service_report_no: form.service_report_no.trim() || '',
        }
      : {};

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
      image_url_2: form.image_url_2.trim() || null,
      image_url_3: form.image_url_3.trim() || null,
      is_web_visible: form.is_web_visible === true,
      is_b2b_visible: form.is_b2b_visible === true,
      is_slider_visible: form.is_slider_visible === true,
      is_discounted: form.is_discounted === true,
      old_price: form.is_discounted && form.old_price ? Number(form.old_price) : null,
      is_campaign: form.is_campaign === true,
      campaign_title: form.is_campaign ? (form.campaign_title.trim() || null) : null,
      campaign_benefit: form.is_campaign ? (form.campaign_benefit.trim() || null) : null,
      show_campaign_benefit_in_slider: form.show_campaign_benefit_in_slider === true,
      campaign_benefit_requires_return: form.campaign_benefit_requires_return === true,
      b2b_package_title: form.is_b2b_visible ? (form.b2b_package_title.trim() || null) : null,
      b2b_package_description: form.is_b2b_visible ? (form.b2b_package_description.trim() || null) : null,
      b2b_min_quantity: form.is_b2b_visible ? (form.b2b_min_quantity.trim() !== "" ? Number(form.b2b_min_quantity) : null) : null,
      b2b_package_price: form.is_b2b_visible ? (form.b2b_package_price.trim() !== "" ? Number(form.b2b_package_price) : null) : null,
      brand: resolvedBrand || null,
      model: form.model.trim() || null,
      color: form.color.trim() || null,
      memory: isLaptop ? null : (memoryValue.trim() || null),
      ram: isLaptop ? (form.ram.trim() || null) : null,
      storage: isLaptop ? (form.storage.trim() || null) : null,
      processor: isLaptop ? (form.processor.trim() || null) : null,
      screen_size: isLaptop ? (form.screen_size.trim() || null) : null,
      device_condition_type: isTelefonCategory(catTrim) ? (form.device_condition_type || null) : null,
      device_category: isDevice ? devCat : (form.category.trim() || null),
      imei_1: isDevice ? (form.imei_1.trim() || null) : '',
      imei_2: isDevice ? (form.imei_2.trim() || null) : '',
      serial_number: isDevice ? (form.serial_number.trim() || null) : '',
      battery_health: isDevice ? (form.battery_health.trim() || null) : '',
      box_status: isDevice ? (form.box_status.trim() || null) : '',
      warranty_status: isDevice ? (form.warranty_status.trim() || null) : '',
      supplier_name: isDevice ? (form.supplier_name.trim() || null) : '',
      supplier_invoice_no: isDevice ? (form.supplier_invoice_no.trim() || null) : '',
      service_report_no: isDevice ? (form.service_report_no.trim() || null) : '',
      device_metadata: safeDeviceMetadata,
    });

    setSaving(false);
    if (error || !data) {
      const errorMsg = error ? error.message : "Veritabanı yanıtı boş (data null).";
      showStatus("error", `Ürün kaydedilemedi: ${errorMsg}`);
      console.error("Ürün ekleme hatası:", error);
      return;
    }

    setProducts((prev) => [data, ...prev]);
    resetForm();
    // focus barcode for quick entry
    barcodeRef.current?.focus();
    if (brandWasNormalized && resolvedBrand) {
      showStatus("success", `Ürün eklendi. Marka otomatik düzenlendi: "${form.brand.trim()}" → "${resolvedBrand}"`);
    } else {
      showStatus("success", "Ürün başarıyla eklendi.");
    }
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
      image_url_2: product.image_url_2 || "",
      image_url_3: product.image_url_3 || "",
      is_web_visible: product.is_web_visible || false,
      is_b2b_visible: product.is_b2b_visible || false,
      is_slider_visible: product.is_slider_visible || false,
      is_discounted: product.is_discounted || false,
      old_price: product.old_price != null ? String(product.old_price) : "",
      is_campaign: product.is_campaign || false,
      campaign_title: product.campaign_title || "",
      campaign_benefit: product.campaign_benefit || "",
      show_campaign_benefit_in_slider: product.show_campaign_benefit_in_slider || false,
      campaign_benefit_requires_return: product.campaign_benefit_requires_return || false,
      b2b_package_title: product.b2b_package_title || "",
      b2b_package_description: product.b2b_package_description || "",
      b2b_min_quantity: product.b2b_min_quantity != null ? String(product.b2b_min_quantity) : "1",
      b2b_package_price: product.b2b_package_price != null ? String(product.b2b_package_price) : "",
      brand: product.brand || "",
      model: product.model || "",
      color: product.color || "",
      memory: product.memory || "",
      ram: product.ram || "",
      storage: product.storage || "",
      processor: product.processor || "",
      screen_size: product.screen_size || "",
      device_condition_type: product.device_condition_type || "",
      device_category: product.device_category || "",
      imei_1: product.imei_1 || "",
      imei_2: product.imei_2 || "",
      serial_number: product.serial_number || "",
      battery_health: product.battery_health || "",
      box_status: product.box_status || "",
      warranty_status: product.warranty_status || "",
      supplier_name: product.supplier_name || "",
      supplier_invoice_no: product.supplier_invoice_no || "",
      service_report_no: product.service_report_no || "",
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

    // Enforce device condition type select for Telefon, Tablet, Bilgisayar in edits
    const catEditTrim = editForm.category.trim();
    const isEditDevice = isDeviceCategory(catEditTrim);
    if (isEditDevice && !editForm.device_condition_type) {
      setSaving(false);
      showStatus("error", "Telefon, tablet ve bilgisayar stoklarında cihaz durumu seçilmelidir.");
      return;
    }
    if (isEditDevice && !editForm.imei_1.trim()) {
      setSaving(false);
      showStatus("error", "Telefon, tablet ve bilgisayar stoklarında IMEI 1 / Seri No alanı zorunludur.");
      return;
    }

    const minQty = editForm.is_b2b_visible ? Number(editForm.b2b_min_quantity) : 0;
    const currentStock = Number(editForm.stock) || 0;
    if (editForm.is_b2b_visible) {
      if (isNaN(minQty) || minQty <= 0) {
        setSaving(false);
        showStatus("error", "Minimum toptan adet en az 1 olmalıdır.");
        return;
      }
      if (minQty > currentStock) {
        setSaving(false);
        showStatus("error", "Paket adedi mevcut stoktan fazla olamaz.");
        return;
      }
    }

    let devEditCat = 'other';
    const normEditCat = normalizeText(catEditTrim);
    if (normEditCat.includes('telefon') || normEditCat.includes('phone')) devEditCat = 'phone';
    else if (normEditCat.includes('tablet')) devEditCat = 'tablet';
    else if (normEditCat.includes('bilgisayar') || normEditCat.includes('computer') || normEditCat.includes('laptop')) devEditCat = 'computer';
    else if (normEditCat.includes('aksesuar') || normEditCat.includes('accessory')) devEditCat = 'accessory';

    const manualName = editForm.name.trim();
    const isEditLaptop = normEditCat.includes("bilgisayar") || normEditCat.includes("laptop") || normEditCat.includes("computer");
    const finalName = manualName || buildProductName(editForm.brand, editForm.model, editForm.color, editForm.memory, editForm.ram, editForm.storage, editForm.processor, editForm.screen_size, isEditLaptop) || "İsimsiz Ürün";

    // Marka normalizasyonu (düzenleme)
    const existingBrandsListEdit = products.map((p) => p.brand);
    const { resolved: resolvedEditBrand, wasNormalized: editBrandWasNormalized } = resolveExistingBrand(
      editForm.brand.trim(),
      existingBrandsListEdit
    );

    const safeEditDeviceMetadata = isEditDevice
      ? {
          imei_1: editForm.imei_1.trim() || '',
          imei_2: editForm.imei_2.trim() || '',
          serial_number: editForm.serial_number.trim() || '',
          battery_health: editForm.battery_health.trim() || '',
          box_status: editForm.box_status.trim() || '',
          warranty_status: editForm.warranty_status.trim() || '',
          supplier_name: editForm.supplier_name.trim() || '',
          supplier_invoice_no: editForm.supplier_invoice_no.trim() || '',
          service_report_no: editForm.service_report_no.trim() || '',
        }
      : {};

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
      image_url_2: editForm.image_url_2.trim() || null,
      image_url_3: editForm.image_url_3.trim() || null,
      is_web_visible: editForm.is_web_visible === true,
      is_b2b_visible: editForm.is_b2b_visible === true,
      is_slider_visible: editForm.is_slider_visible === true,
      is_discounted: editForm.is_discounted === true,
      old_price: editForm.is_discounted && editForm.old_price ? Number(editForm.old_price) : null,
      is_campaign: editForm.is_campaign === true,
      campaign_title: editForm.is_campaign ? (editForm.campaign_title.trim() || null) : null,
      campaign_benefit: editForm.is_campaign ? (editForm.campaign_benefit.trim() || null) : null,
      show_campaign_benefit_in_slider: editForm.show_campaign_benefit_in_slider === true,
      campaign_benefit_requires_return: editForm.campaign_benefit_requires_return === true,
      b2b_package_title: editForm.is_b2b_visible ? (editForm.b2b_package_title.trim() || null) : null,
      b2b_package_description: editForm.is_b2b_visible ? (editForm.b2b_package_description.trim() || null) : null,
      b2b_min_quantity: editForm.is_b2b_visible ? (editForm.b2b_min_quantity.trim() !== "" ? Number(editForm.b2b_min_quantity) : null) : null,
      b2b_package_price: editForm.is_b2b_visible ? (editForm.b2b_package_price.trim() !== "" ? Number(editForm.b2b_package_price) : null) : null,
      brand: resolvedEditBrand || null,
      model: editForm.model.trim() || null,
      color: editForm.color.trim() || null,
      memory: editForm.category.trim().toLowerCase() === "bilgisayar" ? null : (editForm.memory.trim() || null),
      ram: editForm.category.trim().toLowerCase() === "bilgisayar" ? (editForm.ram.trim() || null) : null,
      storage: editForm.category.trim().toLowerCase() === "bilgisayar" ? (editForm.storage.trim() || null) : null,
      processor: editForm.category.trim().toLowerCase() === "bilgisayar" ? (editForm.processor.trim() || null) : null,
      screen_size: editForm.category.trim().toLowerCase() === "bilgisayar" ? (editForm.screen_size.trim() || null) : null,
      device_condition_type: isTelefonCategory(catEditTrim) ? (editForm.device_condition_type || null) : null,
      device_category: isEditDevice ? devEditCat : (editForm.category.trim() || null),
      imei_1: isEditDevice ? (editForm.imei_1.trim() || null) : '',
      imei_2: isEditDevice ? (editForm.imei_2.trim() || null) : '',
      serial_number: isEditDevice ? (editForm.serial_number.trim() || null) : '',
      battery_health: isEditDevice ? (editForm.battery_health.trim() || null) : '',
      box_status: isEditDevice ? (editForm.box_status.trim() || null) : '',
      warranty_status: isEditDevice ? (editForm.warranty_status.trim() || null) : '',
      supplier_name: isEditDevice ? (editForm.supplier_name.trim() || null) : '',
      supplier_invoice_no: isEditDevice ? (editForm.supplier_invoice_no.trim() || null) : '',
      service_report_no: isEditDevice ? (editForm.service_report_no.trim() || null) : '',
      device_metadata: safeEditDeviceMetadata,
    });

    setSaving(false);
    if (error || !data) {
      const errorMsg = error ? error.message : "Veritabanı yanıtı boş (data null).";
      showStatus("error", `Ürün güncellenemedi: ${errorMsg}`);
      console.error("Ürün güncelleme hatası:", error);
      return;
    }

    setProducts((prev) => {
      return prev.map((item) => {
        return item.id === product.id ? data : item;
      });
    });
    setEditingId(null);
    if (editBrandWasNormalized && resolvedEditBrand) {
      showStatus("success", `Ürün güncellendi. Marka otomatik düzenlendi: "${editForm.brand.trim()}" → "${resolvedEditBrand}"`);
    } else {
      showStatus("success", "Ürün başarıyla güncellendi.");
    }
  };

  const handleToggleSlider = async (product: Product) => {
    const newValue = !product.is_slider_visible;
    
    // Eğer slayta ekleniyorsa otomatik olarak web'de de görünür yapalım
    const payload: any = { is_slider_visible: newValue };
    if (newValue) {
      payload.is_web_visible = true;
    }

    const { error } = await updateProduct(product.id, payload);
    if (error) {
      showStatus("error", "Slayt durumu güncellenirken hata oluştu.");
    } else {
      setProducts(prev => prev.map(p => 
        p.id === product.id 
          ? { ...p, is_slider_visible: newValue, ...(newValue ? { is_web_visible: true } : {}) } 
          : p
      ));
      showStatus("success", newValue ? "Ürün slayta eklendi ve webde görünür yapıldı." : "Ürün slayttan çıkarıldı.");
    }
  };

  const handleDelete = async (productId: string) => {
    if (!window.confirm("Bu ürünü silmek istediğinizden emin misiniz?")) {
      return;
    }

    const { error } = await deleteProduct(productId);
    if (error) {
      const errorMsg = error ? error.message : "Bilinmeyen hata";
      showStatus("error", `Ürün silinemedi: ${errorMsg}`);
      console.error("Ürün silme hatası:", error);
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
      const errorMsg = error && typeof error === 'object' && 'message' in error ? (error as any).message : "Bilinmeyen hata";
      showStatus("error", `Stok güncellenemedi: ${errorMsg}`);
      console.error("Stok güncelleme hatası:", error);
      return;
    }

    setProducts((prev) =>
      prev.map((item) => (item.id === product.id ? { ...item, stock: newStock } : item))
    );
    showStatus("success", "Stok başarıyla güncellendi.");
  };

  const catNormalized = normalizeText(form.category);
  const isPhone = catNormalized.includes("telefon") || catNormalized.includes("phone");
  const isTablet = catNormalized.includes("tablet");
  const isLaptop = catNormalized.includes("bilgisayar") || catNormalized.includes("laptop") || catNormalized.includes("computer");
  const isSmartwatch = catNormalized.includes("akıllı saat") || catNormalized.includes("smartwatch") || catNormalized.includes("watch");
  const isAccessory = catNormalized.includes("aksesuar") || catNormalized.includes("accessory");
  const isDevice = isDeviceCategory(form.category);
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
              Ürünler
            </p>
            <div className="flex items-center gap-3 mt-2">
              <h2 className="text-2xl font-semibold text-slate-900">Ürün yönetimi</h2>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowAllProductsModal(true)}
              className="shrink-0 items-center justify-center gap-2 rounded-2xl bg-slate-100 hover:bg-slate-200 border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition flex shadow-sm"
            >
              📋 Tüm Ürünleri Gör
            </button>
            <div ref={searchContainerRef} className="relative w-full sm:max-w-xs z-30">
            <input
              type="text"
              placeholder="Ürün adı, marka, model veya barkod ara..."
              value={quickSearchQuery}
              onChange={(e) => {
                setQuickSearchQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setShowSuggestions(false);
                  e.currentTarget.blur();
                } else if (e.key === "Enter") {
                  if (suggestions.length > 0) {
                    setQuickSearchQuery(suggestions[0].name || "");
                    setShowSuggestions(false);
                    e.preventDefault();
                  }
                }
              }}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 pl-9 pr-8 text-xs text-slate-800 caret-slate-800 shadow-sm outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100"
            />
            <span className="absolute left-3 top-3 text-slate-400 text-xs select-none pointer-events-none">🔍</span>
            {quickSearchQuery && (
              <button
                type="button"
                onClick={() => {
                  setQuickSearchQuery("");
                  setShowSuggestions(false);
                }}
                className="absolute right-3 top-2.5 rounded-full bg-slate-100 text-slate-400 hover:text-slate-800 text-xs px-1.5 py-0.5"
              >
                ✕
              </button>
            )}

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-lg z-50 divide-y divide-slate-100">
                {suggestions.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setQuickSearchQuery(p.name || "");
                      setShowSuggestions(false);
                    }}
                    className="p-2.5 hover:bg-sky-50/50 cursor-pointer text-xs flex flex-col gap-1 rounded-xl transition-all text-slate-800"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-semibold text-slate-900 truncate" title={p.name}>
                        {p.name}
                      </span>
                      <span className="text-sky-600 font-bold shrink-0">
                        {formatCurrencyTRY(p.sell_price)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-slate-400 mt-0.5">
                      <span className="truncate max-w-[150px]">
                        {p.brand || p.model ? `${p.brand || ''} ${p.model || ''}`.trim() : 'Marka/Model Belirtilmedi'} • {p.barcode}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded-full font-bold ${p.stock > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                        Stok: {p.stock}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
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

      
    <form onSubmit={handleAddProduct} className="grid grid-cols-1 xl:grid-cols-2 gap-8 w-full items-start">
      {/* Orta Kolon */}
      <div className="flex flex-col gap-8">
        
    <div className="rounded-3xl border border-slate-200 border-l-[6px] border-l-blue-500 bg-white/95 p-6 shadow-sm shadow-slate-900/5 flex flex-col gap-6">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
            Yeni Ürün Ekle
          </p>
          <div className="mt-6 flex flex-col gap-6">
            
            {/* --- BÖLÜM 1: TEMEL BİLGİLER --- */}
            <div className="border border-slate-200 rounded-3xl p-5 bg-white shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-sky-500"></div>\n<h3 className="text-sm font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                <span>1. Temel Bilgiler</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. Barkod / Karekod */}
            <div className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">Barkod / Karekod *</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  name="barcode"
                  id="product-barcode"
                  value={form.barcode}
                  onChange={(e) => handleFormChange("barcode", e.target.value)}
                  ref={barcodeRef}
                  required
                  placeholder="Barkod okutun veya yazın..."
                  className="flex-1 min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
                <button
                  type="button"
                  onClick={() => setShowBarcodeScanner(!showBarcodeScanner)}
                  className={`shrink-0 rounded-2xl border px-4 py-3 text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${
                    showBarcodeScanner 
                      ? "bg-rose-500 text-white border-rose-500 hover:bg-rose-600 shadow-rose-500/10" 
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {showBarcodeScanner ? "❌ Kapat" : "📷 Kamerayla Oku"}
                </button>
              </div>
              
              {showBarcodeScanner && (
                <div className="mt-2 rounded-3xl border border-slate-100 bg-slate-50/50 p-2 shadow-inner">
                  <Scanner
                    onDecode={(code) => {
                      handleFormChange("barcode", code);
                      setShowBarcodeScanner(false);
                      showStatus("success", `Barkod başarıyla okundu: ${code}`);
                    }}
                    onError={(message) => {
                      showStatus("error", "Kamera başlatılamadı. Lütfen kamera iznini kontrol edin veya barkodu elle girin.");
                    }}
                    buttonLabel="Barkod Tarayıcıyı Başlat"
                  />
                </div>
              )}
            </div>

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

            {/* Cihaz Durumu */}
            {isTelefonCategory(form.category) && (
              <div className="grid gap-2 text-sm text-slate-700">
                <span className="font-medium">Cihaz Durumu {isDevice && "*"}</span>
                <select
                  value={form.device_condition_type}
                  onChange={(e) => handleFormChange("device_condition_type", e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">Seçiniz</option>
                  <option value="new_sealed">Sıfır Kapalı Kutu</option>
                  <option value="new_open_box">Sıfır Açık Kutu</option>
                  <option value="display">Teşhir Ürünü</option>
                  <option value="used">İkinci El</option>
                  <option value="refurbished">Yenilenmiş</option>
                  <option value="authorized_refurbished">Yetkili Onarıcı Raporlu</option>
                </select>
              </div>
            )}

            {/* Cihaz Durumuna Göre Spesifik Kabul/Kayıt Girişleri */}
            {isTelefonCategory(form.category) && form.device_condition_type && (
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 gap-4 grid text-sm">
                <p className="font-semibold text-xs uppercase tracking-wider text-slate-500">Cihaz Kabul & Giriş Verileri</p>
                
                <label className="grid gap-1">
                  <span>IMEI 1 / Seri No *</span>
                  <input
                    value={form.imei_1}
                    onChange={(e) => handleFormChange("imei_1", e.target.value)}
                    required
                    placeholder="IMEI veya Seri No"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400"
                  />
                </label>

                {form.device_condition_type !== 'new_sealed' && (
                  <>
                    <label className="grid gap-1">
                      <span>IMEI 2 (Varsa)</span>
                      <input
                        value={form.imei_2}
                        onChange={(e) => handleFormChange("imei_2", e.target.value)}
                        placeholder="IMEI 2"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400"
                      />
                    </label>

                    <label className="grid gap-1">
                      <span>Seri Numarası</span>
                      <input
                        value={form.serial_number}
                        onChange={(e) => handleFormChange("serial_number", e.target.value)}
                        placeholder="Seri No"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400"
                      />
                    </label>

                    <label className="grid gap-1">
                      <span>Batarya Sağlığı / Durumu</span>
                      <input
                        value={form.battery_health}
                        onChange={(e) => handleFormChange("battery_health", e.target.value)}
                        placeholder="Örn: %87 veya Yeni"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400"
                      />
                    </label>

                    <label className="grid gap-1">
                      <span>Servis / Yetkili Yenileme Rapor No</span>
                      <input
                        value={form.service_report_no}
                        onChange={(e) => handleFormChange("service_report_no", e.target.value)}
                        placeholder="Servis rapor no"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400"
                      />
                    </label>
                  </>
                )}

                <label className="grid gap-1">
                  <span>Kutu Durumu</span>
                  <input
                    value={form.box_status}
                    onChange={(e) => handleFormChange("box_status", e.target.value)}
                    placeholder={form.device_condition_type === 'new_sealed' ? 'Kapalı kutu / jelatinli' : 'Kutulu, kablo var'}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400"
                  />
                </label>

                <label className="grid gap-1">
                  <span>Garanti Durumu</span>
                  <input
                    value={form.warranty_status}
                    onChange={(e) => handleFormChange("warranty_status", e.target.value)}
                    placeholder="2 Yıl distribütör garantili / Garanti bitti vb."
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400"
                  />
                </label>

                <label className="grid gap-1">
                  <span>Tedarikçi Firma</span>
                  <input
                    value={form.supplier_name}
                    onChange={(e) => handleFormChange("supplier_name", e.target.value)}
                    placeholder="Tedarikçi firma adı"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400"
                  />
                </label>

                <label className="grid gap-1">
                  <span>Tedarikçi Fatura No</span>
                  <input
                    value={form.supplier_invoice_no}
                    onChange={(e) => handleFormChange("supplier_invoice_no", e.target.value)}
                    placeholder="Fatura No"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400"
                  />
                </label>
              </div>
            )}

              </div>
            </div>

            {/* --- BÖLÜM 2: DONANIM & MODEL BİLGİLERİ --- */}
            <div className="border border-slate-200 rounded-3xl p-5 bg-white shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
    </div>
  
        
    <div className="rounded-3xl border border-slate-200 border-l-[6px] border-l-blue-500 bg-white/95 p-6 shadow-sm shadow-slate-900/5 flex flex-col gap-6">
      <h3 className="text-sm font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                <span>2. Donanım & Model Bilgileri</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      disabled={!!(activeCatalog && !selModel)}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 disabled:opacity-50"
                    />
                    {activeCatalog && !selModel && (
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

              </div>
            </div>

            {/* --- BÖLÜM 3: TANIM & GÖRSELLER --- */}
            <div className="border border-slate-200 rounded-3xl p-5 bg-white shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-fuchsia-500"></div>
    </div>
  
        
    <div className="rounded-3xl border border-slate-200 border-l-[6px] border-l-blue-500 bg-white/95 p-6 shadow-sm shadow-slate-900/5 flex flex-col gap-6">
      <h3 className="text-sm font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                <span>4. Fiyat & Stok</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              </div>
            </div>

            {/* --- BÖLÜM 5: AYARLAR & KAMPANYA --- */}
            <div className="border border-slate-200 rounded-3xl p-5 bg-white shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
    </div>
  
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
                {form.is_b2b_visible && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200">B2B</span>
                )}
                {form.device_condition_type && (() => {
                  switch (form.device_condition_type) {
                    case 'new_sealed':
                      return <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200">Sıfır Kapalı Kutu</span>;
                    case 'new_open_box':
                      return <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 border border-indigo-200">Açık Kutu</span>;
                    case 'display':
                      return <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">Teşhir</span>;
                    case 'used':
                      return <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">İkinci El</span>;
                    case 'refurbished':
                      return <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 border border-purple-200">Yenilenmiş</span>;
                    case 'authorized_refurbished':
                      return <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">Yetkili Raporlu Yenilenmiş</span>;
                    default:
                      return null;
                  }
                })()}
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

        <div className="space-y-6 self-start xl:sticky xl:top-6">
      </div>

      {/* Sağ Kolon */}
      <div className="flex flex-col gap-8">
        
    <div className="rounded-3xl border border-slate-200 border-l-[6px] border-l-blue-500 bg-white/95 p-6 shadow-sm shadow-slate-900/5 flex flex-col gap-6">
      <h3 className="text-sm font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                <span>3. Tanım & Görseller</span>
              </h3>
              <div className="flex flex-col gap-4">
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

            {/* 9. Ürün Fotoğrafları */}
            <div className="grid gap-4 text-sm text-slate-700">
              <span className="font-medium">Ürün Fotoğrafları (Maksimum 3 Görsel)</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 font-medium">Ana Görsel</span>
                  <ProductImageUploader
                    imageUrl={form.image_url}
                    onUploadSuccess={(url) => handleFormChange("image_url", url)}
                    idPrefix="new-product-img1"
                  />
                  {form.image_url && (
                    <button
                      type="button"
                      onClick={() => handleFormChange("image_url", "")}
                      className="text-xs text-rose-500 hover:text-rose-700 font-semibold"
                    >
                      Kaldır
                    </button>
                  )}
                </div>
                
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 font-medium">Ek Görsel 1</span>
                  <ProductImageUploader
                    imageUrl={form.image_url_2}
                    onUploadSuccess={(url) => handleFormChange("image_url_2", url)}
                    idPrefix="new-product-img2"
                  />
                  {form.image_url_2 && (
                    <button
                      type="button"
                      onClick={() => handleFormChange("image_url_2", "")}
                      className="text-xs text-rose-500 hover:text-rose-700 font-semibold"
                    >
                      Kaldır
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs text-slate-500 font-medium">Ek Görsel 2</span>
                  <ProductImageUploader
                    imageUrl={form.image_url_3}
                    onUploadSuccess={(url) => handleFormChange("image_url_3", url)}
                    idPrefix="new-product-img3"
                  />
                  {form.image_url_3 && (
                    <button
                      type="button"
                      onClick={() => handleFormChange("image_url_3", "")}
                      className="text-xs text-rose-500 hover:text-rose-700 font-semibold"
                    >
                      Kaldır
                    </button>
                  )}
                </div>
              </div>
            </div>

              </div>
            </div>

            {/* --- BÖLÜM 4: FİYAT & STOK --- */}
            <div className="border border-slate-200 rounded-3xl p-5 bg-white shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
    </div>
  
        
    <div className="rounded-3xl border border-slate-200 border-l-[6px] border-l-blue-500 bg-white/95 p-6 shadow-sm shadow-slate-900/5 flex flex-col gap-6">
      <h3 className="text-sm font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                <span>5. Ayarlar & Kampanya</span>
              </h3>
              <div className="flex flex-col gap-4">
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

            {/* 14. B2B / Toptanda Gösterilsin mi? */}
            <label className="flex items-center gap-3 text-sm text-slate-700 select-none cursor-pointer mt-2">
              <input
                type="checkbox"
                name="is_b2b_visible"
                id="product-is_b2b_visible"
                checked={form.is_b2b_visible}
                onChange={(e) => handleFormChange("is_b2b_visible", e.target.checked)}
                className="h-5 w-5 rounded-lg border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="font-medium">B2B / Toptanda Gösterilsin mi?</span>
            </label>

            {/* Slayt / Kampanya Ayarları */}
            <div className="mt-6 p-5 rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 space-y-4 w-full shadow-sm">
              <p className="text-sm font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                🌟 Slayt & Kampanya Ayarları
              </p>
              
              <label className="flex items-center gap-3 text-sm text-slate-700 select-none cursor-pointer">
                <input
                  type="checkbox"
                  name="is_slider_visible"
                  checked={form.is_slider_visible}
                  onChange={(e) => handleFormChange("is_slider_visible", e.target.checked)}
                  className="h-5 w-5 rounded-lg border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="font-medium">Slaytta Gösterilsin mi?</span>
              </label>

              <label className="flex items-center gap-3 text-sm text-slate-700 select-none cursor-pointer mt-2">
                <input
                  type="checkbox"
                  name="is_discounted"
                  checked={form.is_discounted}
                  onChange={(e) => handleFormChange("is_discounted", e.target.checked)}
                  className="h-5 w-5 rounded-lg border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="font-medium">İndirimli Ürün mü?</span>
              </label>

              {form.is_discounted && (
                <div className="space-y-4 border-t border-slate-200 pt-4 mt-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
                    Eski Fiyat
                    <input
                      type="number"
                      name="old_price"
                      placeholder="Örn: 15000"
                      value={form.old_price}
                      onChange={handleFormInputChange}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>
                  <p className="text-[10px] text-slate-500">Mevcut Satış Fiyatı yeni fiyat olarak gösterilecektir. Eski fiyat satış fiyatından büyük değilse indirim rozeti gösterilmez.</p>
                </div>
              )}

              <label className="flex items-center gap-3 text-sm text-slate-700 select-none cursor-pointer mt-2">
                <input
                  type="checkbox"
                  name="is_campaign"
                  checked={form.is_campaign}
                  onChange={(e) => handleFormChange("is_campaign", e.target.checked)}
                  className="h-5 w-5 rounded-lg border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="font-medium">Kampanyalı Ürün mü?</span>
              </label>

              {form.is_campaign && (
                <div className="space-y-4 border-t border-slate-200 pt-4 mt-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
                    Kampanya Başlığı
                    <input
                      type="text"
                      name="campaign_title"
                      placeholder="Örn: Haftanın Fırsatı"
                      value={form.campaign_title}
                      onChange={handleFormInputChange}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
                    Müşteriye Sağlanan Fayda (Hediye/Avantaj)
                    <input
                      type="text"
                      name="campaign_benefit"
                      placeholder="Örn: Telefon alana kılıf hediye"
                      value={form.campaign_benefit}
                      onChange={handleFormInputChange}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>

                  <label className="flex items-center gap-3 text-sm text-slate-700 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      name="show_campaign_benefit_in_slider"
                      checked={form.show_campaign_benefit_in_slider}
                      onChange={(e) => handleFormChange("show_campaign_benefit_in_slider", e.target.checked)}
                      className="h-5 w-5 rounded-lg border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="font-medium">Kampanya faydası slaytta gösterilsin mi?</span>
                  </label>

                  <label className="flex items-center gap-3 text-sm text-slate-700 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      name="campaign_benefit_requires_return"
                      checked={form.campaign_benefit_requires_return}
                      onChange={(e) => handleFormChange("campaign_benefit_requires_return", e.target.checked)}
                      className="h-5 w-5 rounded-lg border-slate-300 text-rose-500 focus:ring-rose-500"
                    />
                    <span className="font-medium">İadelerde bu fayda geri istensin mi? (Müşteriye iade ekranında uyarı gösterilir)</span>
                  </label>
                </div>
              )}
            </div>

            {/* B2B Paket Alanları */}
            {form.is_b2b_visible && (
              <div className="mt-4 p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4 w-full">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">B2B Paket Bilgileri</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
                    B2B Paket Başlığı
                    <input
                      type="text"
                      name="b2b_package_title"
                      placeholder="Örn: 10'lu Apple USB-C Paket"
                      value={form.b2b_package_title}
                      onChange={handleFormInputChange}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
                    Paket Adedi / Minimum Sipariş
                    <input
                      type="number"
                      name="b2b_min_quantity"
                      min="1"
                      placeholder="Örn: 4"
                      value={form.b2b_min_quantity}
                      onChange={handleFormInputChange}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    />
                    <span className="text-[10px] text-slate-400 font-normal mt-0.5">Bu ürün bayiye en az kaç adetlik paketle sunulacak?</span>
                  </label>
                </div>

                {/* Mismatch Warning */}
                {(() => {
                  const mismatch = checkB2bTitleQuantityMismatch(form.b2b_package_title, form.b2b_min_quantity);
                  if (mismatch) {
                    return (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span>⚠️ {mismatch.warningText}</span>
                        <button
                          type="button"
                          onClick={() => handleFormChange("b2b_min_quantity", String(mismatch.numInTitle))}
                          className="text-xs font-bold text-sky-700 hover:text-sky-800 bg-white border border-sky-200 rounded-lg px-2.5 py-1 transition cursor-pointer self-start sm:self-auto shadow-sm"
                        >
                          {mismatch.numInTitle} yap
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
                    B2B Paket Fiyatı (Toplam)
                    <input
                      type="text"
                      name="b2b_package_price"
                      placeholder="Örn: 499"
                      value={form.b2b_package_price}
                      onChange={(e) => handleFormChange("b2b_package_price", formatAmount(e.target.value))}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    />
                    <span className="text-[10px] text-slate-400 font-normal mt-0.5">Bu fiyat, yukarıdaki paket adedi için toplam bayi fiyatıdır. Örn: Paket adedi 4 ve fiyat 499 ise, 4 adetlik paketin toplam fiyatı ₺499’dur.</span>
                    {Number(form.b2b_min_quantity) > 0 && Number(form.b2b_package_price) > 0 && (
                      <div className="text-xs text-sky-700 font-bold mt-1.5 bg-sky-50 px-3 py-1.5 rounded-xl border border-sky-100 inline-block self-start">
                        Yaklaşık adet fiyatı: {formatCurrencyTRY(Number(form.b2b_package_price) / Number(form.b2b_min_quantity))}
                      </div>
                    )}
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
                    B2B Paket Açıklaması
                    <input
                      type="text"
                      name="b2b_package_description"
                      placeholder="Paket detayları..."
                      value={form.b2b_package_description}
                      onChange={handleFormInputChange}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
          </div>
    </div>
  
        {/* Sticky Ürün Ekle Butonu */}
          <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 border-t border-slate-200 bg-white/95 p-4 backdrop-blur-md z-10 rounded-b-3xl flex justify-end shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-8 py-3.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 shadow-lg shadow-slate-900/20"
            >
              {saving ? "Kaydediliyor..." : "Ürün Ekle"}
            </button>
          </div>
        {/* Son Eklenen 5 Ürün */}
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
                {quickSearchQuery ? `Arama Sonuçları (${quickFilteredProducts.length})` : "Son Eklenen Ürünler"}
              </h3>
              <span className="text-xs text-slate-400 font-medium">
                {quickSearchQuery ? "Bulunan Ürünler" : "Son 5 Ürün"}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="pb-2">Ürün Adı</th>
                    <th className="pb-2 text-center">Stok</th>
                    <th className="pb-2 text-right">Fiyat</th>
                    <th className="pb-2 text-center w-24">Slayt</th>
                    <th className="pb-2 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quickSearchQuery && quickFilteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400 font-medium">
                        Sonuç bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    (quickSearchQuery ? quickFilteredProducts : lastAddedProducts).map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-2.5 pr-2">
                          <div className="font-semibold text-slate-800 truncate max-w-[150px]" title={p.name}>
                            {p.name}
                          </div>
                          {isTelefonCategory(p.category || "") && p.device_condition_type && (
                            <div className="mt-0.5">
                              {(() => {
                                switch (p.device_condition_type) {
                                  case 'new_sealed':
                                    return <span className="inline-block rounded px-1.5 py-0.2 text-[9px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">Sıfır Kapalı Kutu</span>;
                                  case 'new_open_box':
                                    return <span className="inline-block rounded px-1.5 py-0.2 text-[9px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">Açık Kutu</span>;
                                  case 'display':
                                    return <span className="inline-block rounded px-1.5 py-0.2 text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">Teşhir</span>;
                                  case 'used':
                                    return <span className="inline-block rounded px-1.5 py-0.2 text-[9px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">İkinci El</span>;
                                  case 'refurbished':
                                    return <span className="inline-block rounded px-1.5 py-0.2 text-[9px] font-semibold bg-purple-50 text-purple-700 border border-purple-100">Yenilenmiş</span>;
                                  case 'authorized_refurbished':
                                    return <span className="inline-block rounded px-1.5 py-0.2 text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">Yetkili Raporlu</span>;
                                  default:
                                    return null;
                                }
                              })()}
                            </div>
                          )}
                          {p.is_b2b_visible && (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <span className="inline-block rounded px-1.5 py-0.2 text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-100">Toptanda</span>
                              <span className="text-[9px] text-slate-500 font-medium">
                                {p.b2b_package_price != null ? (
                                  <>
                                    (B2B Paket: {formatCurrencyTRY(p.b2b_package_price)}
                                    {p.b2b_min_quantity && Number(p.b2b_min_quantity) > 1 && (
                                      <> • Adet: {formatCurrencyTRY(Number(p.b2b_package_price) / Number(p.b2b_min_quantity))}</>
                                    )})
                                  </>
                                ) : (
                                  "(B2B: Teklif)"
                                )}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 text-center font-bold text-slate-700">{p.stock}</td>
                        <td className="py-2.5 text-right font-bold text-slate-900">{formatCurrencyTRY(p.sell_price)}</td>
                        <td className="py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSlider(p)}
                            className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition cursor-pointer inline-flex items-center justify-center gap-1 min-w-[80px] ${
                              p.is_slider_visible
                                ? "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {p.is_slider_visible ? "🌟 Slaytta" : "Slayta Ekle"}
                          </button>
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenB2bQuickModal(p)}
                              className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition cursor-pointer ${
                                p.is_b2b_visible
                                  ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {p.is_b2b_visible ? "Toptan Ayarları" : "Toptana Aç"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleStartEdit(p);
                                setShowAllProductsModal(true);
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 cursor-pointer"
                            >
                              Düzenle
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={() => {
                setModalFilter("all");
                setModalSearchQuery("");
                setShowAllProductsModal(true);
              }}
              className="w-full mt-2 inline-flex items-center justify-center rounded-2xl bg-sky-500 hover:bg-sky-600 px-4 py-3 text-xs font-bold text-white shadow-md shadow-sky-500/10 transition active:scale-95 cursor-pointer"
            >
              👁️ Tüm Ürünleri Gör
            </button>
          </div></div>
      </div>
    </form>
  
<div style={{ display: "contents" }}>

      {portalTarget && createPortal(
        <div className="flex flex-col gap-8 pb-6 w-[280px] lg:w-[300px] xl:w-[360px]">
          {/* Stok Özeti Panel Kartı */}
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-900/5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600 mb-4">Stok Özeti</h3>
            
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3 flex flex-col justify-between animate-in fade-in duration-200">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Toplam Ürün</span>
                <span className="text-xl font-bold text-slate-800 mt-1">{totalProductsCount}</span>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3 flex flex-col justify-between animate-in fade-in duration-200">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Toplam Stok</span>
                <span className="text-xl font-bold text-slate-800 mt-1">{totalStockCount}</span>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3 flex flex-col justify-between animate-in fade-in duration-200">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Telefon</span>
                <span className="text-xl font-bold text-slate-800 mt-1">{phoneStockCount}</span>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3 flex flex-col justify-between animate-in fade-in duration-200">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tablet</span>
                <span className="text-xl font-bold text-slate-800 mt-1">{tabletStockCount}</span>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3 flex flex-col justify-between animate-in fade-in duration-200">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Bilgisayar</span>
                <span className="text-xl font-bold text-slate-800 mt-1">{computerStockCount}</span>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3 flex flex-col justify-between animate-in fade-in duration-200">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Aksesuar</span>
                <span className="text-xl font-bold text-slate-800 mt-1">{accessoryStockCount}</span>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50/20 p-3 flex flex-col justify-between animate-in fade-in duration-200">
                <span className="text-[10px] font-semibold text-sky-600 uppercase tracking-wider">Sıfır Kapalı Kutu</span>
                <span className="text-xl font-bold text-sky-700 mt-1">{newSealedCount}</span>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/20 p-3 flex flex-col justify-between animate-in fade-in duration-200">
                <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider">İkinci El / Diğer</span>
                <span className="text-xl font-bold text-indigo-700 mt-1">{usedDeviceCount}</span>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/20 p-3 flex flex-col justify-between animate-in fade-in duration-200">
                <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Stoku Azalan</span>
                <span className="text-xl font-bold text-amber-700 mt-1">{lowStockProductsCount}</span>
              </div>
              <div className="rounded-2xl border border-rose-100 bg-rose-50/20 p-3 flex flex-col justify-between animate-in fade-in duration-200">
                <span className="text-[10px] font-semibold text-rose-600 uppercase tracking-wider">Stoku Biten</span>
                <span className="text-xl font-bold text-rose-700 mt-1">{outOfStockProductsCount}</span>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/20 p-3 flex flex-col justify-between animate-in fade-in duration-200">
                <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">B2B’ye Açık Ürün</span>
                <span className="text-xl font-bold text-blue-700 mt-1">{b2bProductsCount}</span>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/20 p-3 flex flex-col justify-between animate-in fade-in duration-200">
                <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">Toptan Stok Adedi</span>
                <span className="text-xl font-bold text-blue-700 mt-1">{b2bTotalStockCount}</span>
              </div>
            </div>
          </div>

          {/* Düşük Stok Uyarıları (Varsa) */}
          {lowStockWarnings.length > 0 && (
            <div className="rounded-3xl border border-amber-200 bg-white/95 p-6 shadow-sm shadow-amber-900/5 space-y-4 animate-in fade-in duration-200">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600 flex items-center gap-2">
                <span className="text-lg">⚠️</span> Düşük Stok Uyarıları
              </h3>
              <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto scrollbar-thin pr-2">
                {lowStockWarnings.slice(0, 10).map((p) => (
                  <div 
                    key={p.id} 
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4 cursor-pointer hover:bg-amber-50/50 px-2 -mx-2 rounded-xl transition-colors"
                    onClick={() => {
                      setModalSearchQuery(p.barcode || p.name);
                      handleStartEdit(p);
                      setShowAllProductsModal(true);
                    }}
                  >
                    <span className="text-xs font-bold text-slate-800 truncate" title={p.name}>{p.name}</span>
                    <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black shrink-0 ${p.stock === 0 ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                      {p.stock} Adet Kaldı
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>,
        portalTarget
      )}
  
{/* TÜM ÜRÜNLER MODALI */}
      {showAllProductsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6">
          <div className="relative w-full max-w-[95vw] max-h-[90vh] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Tüm Ürünler ({products.length})</h3>
                <p className="text-xs text-slate-500 mt-0.5">Tüm kayıtlı ürünleri buradan listeleyebilir, arayabilir, filtreleyebilir ve düzenleyebilirsiniz.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleCancelEdit();
                  setShowAllProductsModal(false);
                }}
                className="rounded-full bg-slate-100 hover:bg-rose-50 hover:text-rose-600 p-2 text-slate-400 transition cursor-pointer"
                title="Kapat"
              >
                ✕
              </button>
            </div>

            {/* Arama & Filtreler */}
            <div className="p-6 border-b border-slate-100 bg-white gap-4 flex flex-col sm:flex-row sm:items-center">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Ürün adı, barkod, marka, model ile ara..."
                  value={modalSearchQuery}
                  onChange={(e) => setModalSearchQuery(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 pl-10 text-xs shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
                <span className="absolute left-3.5 top-3.5 text-slate-400 text-xs select-none pointer-events-none">🔍</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-w-2xl">
                {([
                  { label: "Tümü", value: "all" },
                  { label: "📱 Telefon", value: "phone" },
                  { label: "📟 Tablet", value: "tablet" },
                  { label: "💻 Bilgisayar", value: "computer" },
                  { label: "🎧 Aksesuar", value: "accessory" },
                  { label: "⚠️ Stoku Az", value: "low_stock" },
                  { label: "❌ Stoku Biten", value: "out_of_stock" },
                  { label: "💎 Sıfır", value: "new" },
                  { label: "🔄 Yenilenmiş", value: "refurbished" },
                  { label: "🤝 İkinci El", value: "used" },
                ]).map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setModalFilter(value)}
                    className={`px-3 py-1.5 text-[10px] font-semibold rounded-full border transition cursor-pointer ${
                      modalFilter === value
                        ? "bg-slate-800 text-white border-slate-800 shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ürün Listesi */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      <th className="px-4 py-3">Ürün Detayı</th>
                      <th className="px-4 py-3 text-center w-24">Stok</th>
                      <th className="px-4 py-3 text-right w-32">Fiyat</th>
                      <th className="px-4 py-3 text-center w-28">Slayt</th>
                      <th className="px-4 py-3 text-right w-52">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const filtered = products.filter((p) => {
                        const query = modalSearchQuery.toLowerCase().trim();
                        if (query) {
                          const matchesName = (p.name || '').toLowerCase().includes(query);
                          const matchesBarcode = (p.barcode || '').toLowerCase().includes(query);
                          const matchesBrand = (p.brand || '').toLowerCase().includes(query);
                          const matchesModel = (p.model || '').toLowerCase().includes(query);
                          if (!matchesName && !matchesBarcode && !matchesBrand && !matchesModel) return false;
                        }

                        if (modalFilter === "all") return true;
                        
                        const normCat = normalizeText(p.category || "");
                        if (modalFilter === "phone") return isDeviceCategory(p.category || "") && normCat.includes("telefon");
                        if (modalFilter === "tablet") return isDeviceCategory(p.category || "") && normCat.includes("tablet");
                        if (modalFilter === "computer") return isDeviceCategory(p.category || "") && (normCat.includes("bilgisayar") || normCat.includes("laptop") || normCat.includes("computer"));
                        if (modalFilter === "accessory") return normCat.includes("aksesuar") || normCat.includes("accessory");
                        
                        if (modalFilter === "low_stock") return p.stock > 0 && p.stock <= p.min_stock;
                        if (modalFilter === "out_of_stock") return p.stock === 0;
                        if (modalFilter === "new") return p.device_condition_type === "new_sealed" || p.device_condition_type === "new_open_box";
                        if (modalFilter === "refurbished") return p.device_condition_type === "refurbished" || p.device_condition_type === "authorized_refurbished";
                        if (modalFilter === "used") return p.device_condition_type === "used" || p.device_condition_type === "display";

                        return true;
                      });

                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-slate-400">Aradığınız kriterlere uygun ürün bulunamadı.</td>
                          </tr>
                        );
                      }

                      return filtered.map((product) => {
                        const isEditDevice = isDeviceCategory(editForm.category);
                        return (
                          <tr key={product.id} className="hover:bg-slate-50/50 transition">
                            {editingId === product.id ? (
                              <td colSpan={5} className="p-4 bg-slate-50/50">
                                <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4">
                                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                                    <label className="grid gap-2 text-[11px] text-slate-700">
                                      <span>Barkod / Karekod</span>
                                      <input
                                        value={editForm.barcode}
                                        onChange={(event) => handleEditFormChange("barcode", event.target.value)}
                                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                      />
                                    </label>
                                    <label className="grid gap-2 text-[11px] text-slate-700">
                                      <span>Kategori</span>
                                      <input
                                        value={editForm.category}
                                        onChange={(event) => handleEditFormChange("category", event.target.value)}
                                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                      />
                                    </label>
                                    <label className="grid gap-2 text-[11px] text-slate-700">
                                      <span>Marka</span>
                                      <input
                                        value={editForm.brand}
                                        onChange={(event) => handleEditFormChange("brand", event.target.value)}
                                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                      />
                                    </label>
                                    <label className="grid gap-2 text-[11px] text-slate-700">
                                      <span>Model</span>
                                      <input
                                        value={editForm.model}
                                        onChange={(event) => handleEditFormChange("model", event.target.value)}
                                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                      />
                                    </label>
                                    
                                    {isTelefonCategory(editForm.category) && (
                                      <label className="grid gap-2 text-[11px] text-slate-700">
                                        <span>Cihaz Durumu</span>
                                        <select
                                          value={editForm.device_condition_type}
                                          onChange={(event) => handleEditFormChange("device_condition_type", event.target.value)}
                                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none font-semibold text-sky-600"
                                        >
                                          <option value="">Seçiniz</option>
                                          <option value="new_sealed">Sıfır Kapalı Kutu</option>
                                          <option value="new_open_box">Sıfır Açık Kutu</option>
                                          <option value="display">Teşhir Ürünü</option>
                                          <option value="used">İkinci El</option>
                                          <option value="refurbished">Yenilenmiş</option>
                                          <option value="authorized_refurbished">Yetkili Onarıcı Raporlu</option>
                                        </select>
                                      </label>
                                    )}

                                    <label className="grid gap-2 text-[11px] text-slate-700">
                                      <span>Renk</span>
                                      <input
                                        value={editForm.color}
                                        onChange={(event) => handleEditFormChange("color", event.target.value)}
                                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                      />
                                    </label>

                                    {isTelefonCategory(editForm.category) && editForm.device_condition_type && (
                                      <>
                                        <label className="grid gap-2 text-[11px] text-slate-700">
                                          <span>IMEI 1 / Seri No *</span>
                                          <input
                                            value={editForm.imei_1}
                                            onChange={(event) => handleEditFormChange("imei_1", event.target.value)}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                          />
                                        </label>

                                        {editForm.device_condition_type !== 'new_sealed' && (
                                          <>
                                            <label className="grid gap-2 text-[11px] text-slate-700">
                                              <span>IMEI 2 (Varsa)</span>
                                              <input
                                                value={editForm.imei_2}
                                                onChange={(event) => handleEditFormChange("imei_2", event.target.value)}
                                                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                              />
                                            </label>
                                            <label className="grid gap-2 text-[11px] text-slate-700">
                                              <span>Seri Numarası</span>
                                              <input
                                                value={editForm.serial_number}
                                                onChange={(event) => handleEditFormChange("serial_number", event.target.value)}
                                                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                              />
                                            </label>
                                            <label className="grid gap-2 text-[11px] text-slate-700">
                                              <span>Batarya Sağlığı / Durumu</span>
                                              <input
                                                value={editForm.battery_health}
                                                onChange={(event) => handleEditFormChange("battery_health", event.target.value)}
                                                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                              />
                                            </label>
                                            <label className="grid gap-2 text-[11px] text-slate-700">
                                              <span>Servis / Rapor No</span>
                                              <input
                                                value={editForm.service_report_no}
                                                onChange={(event) => handleEditFormChange("service_report_no", event.target.value)}
                                                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                              />
                                            </label>
                                          </>
                                        )}

                                        <label className="grid gap-2 text-[11px] text-slate-700">
                                          <span>Kutu Durumu</span>
                                          <input
                                            value={editForm.box_status}
                                            onChange={(event) => handleEditFormChange("box_status", event.target.value)}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                          />
                                        </label>

                                        <label className="grid gap-2 text-[11px] text-slate-700">
                                          <span>Garanti Durumu</span>
                                          <input
                                            value={editForm.warranty_status}
                                            onChange={(event) => handleEditFormChange("warranty_status", event.target.value)}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                          />
                                        </label>

                                        <label className="grid gap-2 text-[11px] text-slate-700">
                                          <span>Tedarikçi</span>
                                          <input
                                            value={editForm.supplier_name}
                                            onChange={(event) => handleEditFormChange("supplier_name", event.target.value)}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                          />
                                        </label>

                                        <label className="grid gap-2 text-[11px] text-slate-700">
                                          <span>Tedarikçi Fatura No</span>
                                          <input
                                            value={editForm.supplier_invoice_no}
                                            onChange={(event) => handleEditFormChange("supplier_invoice_no", event.target.value)}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                          />
                                        </label>
                                      </>
                                    )}

                                    {editForm.category.trim().toLowerCase() === "bilgisayar" ? (
                                      <>
                                        <label className="grid gap-2 text-[11px] text-slate-700">
                                          <span>RAM</span>
                                          <input
                                            value={editForm.ram}
                                            onChange={(event) => handleEditFormChange("ram", event.target.value)}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                          />
                                        </label>
                                        <label className="grid gap-2 text-[11px] text-slate-700">
                                          <span>Depolama</span>
                                          <input
                                            value={editForm.storage}
                                            onChange={(event) => handleEditFormChange("storage", event.target.value)}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                          />
                                        </label>
                                        <label className="grid gap-2 text-[11px] text-slate-700">
                                          <span>İşlemci</span>
                                          <input
                                            value={editForm.processor}
                                            onChange={(event) => handleEditFormChange("processor", event.target.value)}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                          />
                                        </label>
                                        <label className="grid gap-2 text-[11px] text-slate-700">
                                          <span>Ekran Boyutu</span>
                                          <input
                                            value={editForm.screen_size}
                                            onChange={(event) => handleEditFormChange("screen_size", event.target.value)}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                          />
                                        </label>
                                      </>
                                    ) : (
                                      <label className="grid gap-2 text-[11px] text-slate-700">
                                        <span>Hafıza (Opsiyonel)</span>
                                        <input
                                          value={editForm.memory}
                                          onChange={(event) => handleEditFormChange("memory", event.target.value)}
                                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                          placeholder="Örn: 256 GB"
                                        />
                                      </label>
                                    )}

                                    <label className="grid gap-2 text-[11px] text-slate-700">
                                      <span>Ürün Adı</span>
                                      <input
                                        value={editForm.name}
                                        onChange={(event) => handleEditFormChange("name", event.target.value)}
                                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                      />
                                    </label>
                                    <label className="grid gap-2 text-[11px] text-slate-700">
                                      <span>Stok Adedi</span>
                                      <input
                                        type="number"
                                        value={editForm.stock}
                                        onChange={(event) => handleEditFormChange("stock", formatAmount(event.target.value))}
                                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                      />
                                    </label>
                                    <label className="grid gap-2 text-[11px] text-slate-700">
                                      <span>Alış Fiyatı</span>
                                      <input
                                        type="text"
                                        value={editBuyPriceFocused ? editForm.buy_price : formatCurrencyTRY(editForm.buy_price)}
                                        onFocus={() => setEditBuyPriceFocused(true)}
                                        onBlur={(event) => {
                                          setEditBuyPriceFocused(false);
                                          handleEditFormChange("buy_price", parseCurrencyTRY(event.target.value));
                                        }}
                                        onChange={(event) => handleEditFormChange("buy_price", event.target.value)}
                                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                      />
                                    </label>
                                    <label className="grid gap-2 text-[11px] text-slate-700">
                                      <span>Satış Fiyatı</span>
                                      <input
                                        type="text"
                                        value={editSellPriceFocused ? editForm.sell_price : formatCurrencyTRY(editForm.sell_price)}
                                        onFocus={() => setEditSellPriceFocused(true)}
                                        onBlur={(event) => {
                                          setEditSellPriceFocused(false);
                                          handleEditFormChange("sell_price", parseCurrencyTRY(event.target.value));
                                        }}
                                        onChange={(event) => handleEditFormChange("sell_price", event.target.value)}
                                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                      />
                                    </label>
                                    <label className="grid gap-2 text-[11px] text-slate-700">
                                      <span>Azalan Stok Alarmı</span>
                                      <input
                                        type="number"
                                        value={editForm.min_stock}
                                        onChange={(event) => handleEditFormChange("min_stock", formatAmount(event.target.value))}
                                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                      />
                                    </label>
                                    <label className="grid gap-2 text-[11px] text-slate-700">
                                      <span>Raf / Konum</span>
                                      <input
                                        value={editForm.location}
                                        onChange={(event) => handleEditFormChange("location", event.target.value)}
                                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
                                      />
                                    </label>
                                    <div className="grid gap-4 text-[11px] text-slate-700 sm:col-span-2">
                                       <span className="font-medium">Ürün Fotoğrafları (Maksimum 3 Görsel)</span>
                                       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                         <div className="space-y-1">
                                           <span className="text-[10px] text-slate-500 font-medium">Ana Görsel</span>
                                           <ProductImageUploader
                                             imageUrl={editForm.image_url}
                                             onUploadSuccess={(url) => handleEditFormChange("image_url", url)}
                                             idPrefix="edit-product-img1"
                                           />
                                           {editForm.image_url && (
                                             <button
                                               type="button"
                                               onClick={() => handleEditFormChange("image_url", "")}
                                               className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold"
                                             >
                                               Kaldır
                                             </button>
                                           )}
                                         </div>
                                         
                                         <div className="space-y-1">
                                           <span className="text-[10px] text-slate-500 font-medium">Ek Görsel 1</span>
                                           <ProductImageUploader
                                             imageUrl={editForm.image_url_2}
                                             onUploadSuccess={(url) => handleEditFormChange("image_url_2", url)}
                                             idPrefix="edit-product-img2"
                                           />
                                           {editForm.image_url_2 && (
                                             <button
                                               type="button"
                                               onClick={() => handleEditFormChange("image_url_2", "")}
                                               className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold"
                                             >
                                               Kaldır
                                             </button>
                                           )}
                                         </div>

                                         <div className="space-y-1">
                                           <span className="text-[10px] text-slate-500 font-medium">Ek Görsel 2</span>
                                           <ProductImageUploader
                                             imageUrl={editForm.image_url_3}
                                             onUploadSuccess={(url) => handleEditFormChange("image_url_3", url)}
                                             idPrefix="edit-product-img3"
                                           />
                                           {editForm.image_url_3 && (
                                             <button
                                               type="button"
                                               onClick={() => handleEditFormChange("image_url_3", "")}
                                               className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold"
                                             >
                                               Kaldır
                                             </button>
                                           )}
                                         </div>
                                       </div>
                                     </div>
                                    <label className="grid gap-2 text-[11px] text-slate-700 sm:col-span-2">
                                      <span>Ürün Açıklaması</span>
                                      <textarea
                                        value={editForm.description}
                                        onChange={(event) => handleEditFormChange("description", event.target.value)}
                                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none resize-y"
                                        rows={2}
                                      />
                                    </label>
                                    <div className="grid gap-2 text-[11px] text-slate-700 sm:col-span-2">
                                      <span className="font-medium">Ürün Fotoğrafı</span>
                                      <ProductImageUploader
                                        imageUrl={editForm.image_url}
                                        onUploadSuccess={(url) => handleEditFormChange("image_url", url)}
                                        idPrefix="edit-product-modal"
                                      />
                                    </div>
                                    <label className="flex items-center gap-3 text-xs text-slate-700 select-none cursor-pointer sm:col-span-2 py-1">
                                      <input
                                        type="checkbox"
                                        checked={editForm.is_web_visible}
                                        onChange={(event) => handleEditFormChange("is_web_visible", event.target.checked)}
                                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                      />
                                      <span>Web sitesinde gösterilsin mi?</span>
                                    </label>
                                    <label className="flex items-center gap-3 text-xs text-slate-700 select-none cursor-pointer sm:col-span-2 py-1">
                                      <input
                                        type="checkbox"
                                        checked={editForm.is_b2b_visible}
                                        onChange={(event) => handleEditFormChange("is_b2b_visible", event.target.checked)}
                                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                      />
                                      <span>B2B / Toptanda gösterilsin mi?</span>
                                    </label>

                                    {/* Edit Modalı Slayt / Kampanya Ayarları */}
                                    <div className="sm:col-span-2 mt-4 p-5 rounded-xl border-2 border-indigo-200 bg-indigo-50/40 space-y-4 w-full shadow-sm">
                                      <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                                        🌟 Slayt & Kampanya Ayarları
                                      </p>
                                      
                                      <label className="flex items-center gap-3 text-xs text-slate-700 select-none cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={editForm.is_slider_visible}
                                          onChange={(e) => handleEditFormChange("is_slider_visible", e.target.checked)}
                                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                        />
                                        <span className="font-semibold">Slaytta Gösterilsin mi?</span>
                                      </label>

                                      <label className="flex items-center gap-3 text-xs text-slate-700 select-none cursor-pointer mt-2">
                                        <input
                                          type="checkbox"
                                          checked={editForm.is_discounted}
                                          onChange={(e) => handleEditFormChange("is_discounted", e.target.checked)}
                                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                        />
                                        <span className="font-semibold">İndirimli Ürün mü?</span>
                                      </label>

                                      {editForm.is_discounted && (
                                        <div className="space-y-4 border-t border-slate-200 pt-4 mt-2">
                                          <label className="grid gap-1 text-[11px] text-slate-700">
                                            <span>Eski Fiyat</span>
                                            <input
                                              type="number"
                                              value={editForm.old_price}
                                              onChange={(e) => handleEditFormChange("old_price", e.target.value)}
                                              placeholder="Örn: 15000"
                                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
                                            />
                                          </label>
                                          <p className="text-[10px] text-slate-500">Mevcut Satış Fiyatı yeni fiyat olarak gösterilecektir. Eski fiyat satış fiyatından büyük değilse indirim rozeti gösterilmez.</p>
                                        </div>
                                      )}

                                      <label className="flex items-center gap-3 text-xs text-slate-700 select-none cursor-pointer mt-2">
                                        <input
                                          type="checkbox"
                                          checked={editForm.is_campaign}
                                          onChange={(e) => handleEditFormChange("is_campaign", e.target.checked)}
                                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                        />
                                        <span className="font-semibold">Kampanyalı Ürün mü?</span>
                                      </label>

                                      {editForm.is_campaign && (
                                        <div className="space-y-4 border-t border-slate-200 pt-4 mt-2">
                                          <label className="grid gap-1 text-[11px] text-slate-700">
                                            <span>Kampanya Başlığı</span>
                                            <input
                                              type="text"
                                              value={editForm.campaign_title}
                                              onChange={(e) => handleEditFormChange("campaign_title", e.target.value)}
                                              placeholder="Örn: Haftanın Fırsatı"
                                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
                                            />
                                          </label>

                                          <label className="grid gap-1 text-[11px] text-slate-700">
                                            <span>Müşteriye Sağlanan Fayda (Hediye/Avantaj)</span>
                                            <input
                                              type="text"
                                              value={editForm.campaign_benefit}
                                              onChange={(e) => handleEditFormChange("campaign_benefit", e.target.value)}
                                              placeholder="Örn: Telefon alana kılıf hediye"
                                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
                                            />
                                          </label>

                                          <label className="flex items-center gap-3 text-xs text-slate-700 select-none cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={editForm.show_campaign_benefit_in_slider}
                                              onChange={(e) => handleEditFormChange("show_campaign_benefit_in_slider", e.target.checked)}
                                              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                            />
                                            <span className="font-semibold">Kampanya faydası slaytta gösterilsin mi?</span>
                                          </label>

                                          <label className="flex items-center gap-3 text-xs text-slate-700 select-none cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={editForm.campaign_benefit_requires_return}
                                              onChange={(e) => handleEditFormChange("campaign_benefit_requires_return", e.target.checked)}
                                              className="h-4 w-4 rounded border-slate-300 text-rose-500 focus:ring-rose-500"
                                            />
                                            <span className="font-semibold">İadelerde bu fayda geri istensin mi?</span>
                                          </label>
                                        </div>
                                      )}
                                    </div>
                                    {editForm.is_b2b_visible && (
                                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:col-span-2 p-3 rounded-xl border border-slate-200 bg-slate-50/50 w-full">
                                        <label className="grid gap-1 text-[11px] text-slate-700">
                                          <span>B2B Paket Başlığı</span>
                                          <input
                                            type="text"
                                            value={editForm.b2b_package_title}
                                            onChange={(event) => handleEditFormChange("b2b_package_title", event.target.value)}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
                                            placeholder="Örn: 10'lu Apple Adaptör"
                                          />
                                        </label>
                                        <label className="grid gap-1 text-[11px] text-slate-700">
                                          <span>Paket Adedi / Minimum Sipariş</span>
                                          <input
                                            type="number"
                                            min="1"
                                            placeholder="Örn: 4"
                                            value={editForm.b2b_min_quantity}
                                            onChange={(event) => handleEditFormChange("b2b_min_quantity", event.target.value)}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
                                          />
                                          <span className="text-[9px] text-slate-400 font-normal mt-0.5">Bu ürün bayiye en az kaç adetlik paketle sunulacak?</span>
                                        </label>

                                        {/* Mismatch Warning */}
                                        {(() => {
                                          const mismatch = checkB2bTitleQuantityMismatch(editForm.b2b_package_title, editForm.b2b_min_quantity);
                                          if (mismatch) {
                                            return (
                                              <div className="col-span-1 sm:col-span-2 rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-[10px] text-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 font-semibold">
                                                <span>⚠️ {mismatch.warningText}</span>
                                                <button
                                                  type="button"
                                                  onClick={() => handleEditFormChange("b2b_min_quantity", String(mismatch.numInTitle))}
                                                  className="text-[10px] font-bold text-sky-700 hover:text-sky-800 bg-white border border-sky-200 rounded px-2 py-0.5 transition cursor-pointer self-start sm:self-auto shadow-sm"
                                                >
                                                  {mismatch.numInTitle} yap
                                                </button>
                                              </div>
                                            );
                                          }
                                          return null;
                                        })()}

                                        <label className="grid gap-1 text-[11px] text-slate-700">
                                          <span>B2B Paket Fiyatı (Toplam)</span>
                                          <input
                                            type="text"
                                            value={editForm.b2b_package_price}
                                            onChange={(event) => handleEditFormChange("b2b_package_price", formatAmount(event.target.value))}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
                                            placeholder="Teklif Alın için boş bırakın"
                                          />
                                          <span className="text-[9px] text-slate-400 font-normal mt-0.5">Bu fiyat, yukarıdaki paket adedi için toplam bayi fiyatıdır. Örn: Paket adedi 4 ve fiyat 499 ise, 4 adetlik paketin toplam fiyatı ₺499’dur.</span>
                                          {Number(editForm.b2b_min_quantity) > 0 && Number(editForm.b2b_package_price) > 0 && (
                                            <div className="text-[10px] text-sky-700 font-bold mt-1 bg-sky-50 px-2 py-1 rounded border border-sky-100 inline-block self-start">
                                              Yaklaşık adet fiyatı: {formatCurrencyTRY(Number(editForm.b2b_package_price) / Number(editForm.b2b_min_quantity))}
                                            </div>
                                          )}
                                        </label>
                                        <label className="grid gap-1 text-[11px] text-slate-700">
                                          <span>B2B Paket Açıklaması</span>
                                          <input
                                            type="text"
                                            value={editForm.b2b_package_description}
                                            onChange={(event) => handleEditFormChange("b2b_package_description", event.target.value)}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
                                            placeholder="Açıklama..."
                                          />
                                        </label>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                                    <label className="flex items-center gap-3 text-sm text-slate-700 select-none cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={editForm.is_slider_visible}
                                        onChange={(e) => handleEditFormChange("is_slider_visible", e.target.checked)}
                                        className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                      <span className="font-bold text-indigo-700">🌟 Slaytta Göster</span>
                                    </label>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleSaveEdit(product)}
                                        disabled={saving}
                                        className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                                      >
                                        Kaydet
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleCancelEdit}
                                        className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                      >
                                        İptal
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            ) : (
                              <>
                                <td className="px-4 py-3.5">
                                  <div className="flex items-start gap-3">
                                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
                                      {product.image_url ? (
                                        <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                                      ) : (
                                        <span className="text-lg">
                                          {product.category?.toLowerCase() === 'telefon' ? '📱'
                                            : product.category?.toLowerCase() === 'tablet' ? '📟'
                                            : product.category?.toLowerCase() === 'bilgisayar' ? '💻'
                                            : product.category?.toLowerCase() === 'aksesuar' ? '🎧'
                                            : product.category?.toLowerCase() === 'akıllı saat' ? '⌚'
                                            : '📦'}
                                        </span>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-semibold text-slate-950 truncate max-w-[280px]" title={product.name}>
                                        {product.category?.toLowerCase() === 'bilgisayar' 
                                          ? getCleanedLaptopTitle(product.name, product.brand, product.model, product.ram, product.storage, product.processor, product.screen_size, product.color) 
                                          : product.name
                                        }
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                        <span className="text-[10px] text-slate-400 font-mono">#{product.barcode || '—'}</span>
                                        {product.category && (
                                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-medium">{product.category}</span>
                                        )}
                                        {product.is_b2b_visible && (
                                          <div className="inline-flex flex-wrap items-center gap-1">
                                            <span className="rounded px-1.5 py-0.2 text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-100">Toptanda</span>
                                            <span className="text-[9px] text-slate-500 font-semibold">
                                              {product.b2b_package_price != null ? (
                                                <>
                                                  (B2B Paket: {formatCurrencyTRY(product.b2b_package_price)}
                                                  {product.b2b_min_quantity && Number(product.b2b_min_quantity) > 1 && (
                                                    <> • Adet: {formatCurrencyTRY(Number(product.b2b_package_price) / Number(product.b2b_min_quantity))}</>
                                                  )})
                                                </>
                                              ) : (
                                                "(B2B: Teklif)"
                                              )}
                                            </span>
                                          </div>
                                        )}
                                        {product.is_campaign && (
                                          <span className="rounded px-1.5 py-0.2 text-[9px] font-bold bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100">Kampanyalı</span>
                                        )}
                                        {product.is_slider_visible && (
                                          <span className="rounded flex items-center gap-1 px-1.5 py-0.2 text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">🌟 Slaytta</span>
                                        )}
                                        {isTelefonCategory(product.category || "") && product.device_condition_type && (() => {
                                          switch (product.device_condition_type) {
                                            case 'new_sealed':
                                              return <span className="rounded px-1.5 py-0.2 text-[9px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">Sıfır Kapalı Kutu</span>;
                                            case 'new_open_box':
                                              return <span className="rounded px-1.5 py-0.2 text-[9px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">Açık Kutu</span>;
                                            case 'display':
                                              return <span className="rounded px-1.5 py-0.2 text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">Teşhir</span>;
                                            case 'used':
                                              return <span className="rounded px-1.5 py-0.2 text-[9px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">İkinci El</span>;
                                            case 'refurbished':
                                              return <span className="rounded px-1.5 py-0.2 text-[9px] font-semibold bg-purple-50 text-purple-700 border border-purple-100">Yenilenmiş</span>;
                                            case 'authorized_refurbished':
                                              return <span className="rounded px-1.5 py-0.2 text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">Yetkili Raporlu</span>;
                                            default:
                                              return null;
                                          }
                                        })()}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded-full font-bold ${
                                    product.stock === 0 ? 'bg-rose-100 text-rose-700'
                                    : product.stock <= product.min_stock ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-100 text-slate-800'
                                  }`}>{product.stock} adet</span>
                                </td>
                                <td className="px-4 py-3.5 text-right font-bold text-slate-900">{formatCurrencyTRY(product.sell_price)}</td>
                                <td className="px-4 py-3.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleSlider(product)}
                                    className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition cursor-pointer inline-flex items-center justify-center gap-1 min-w-[90px] ${
                                      product.is_slider_visible
                                        ? "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                    }`}
                                  >
                                    {product.is_slider_visible ? "🌟 Slaytta" : "Slayta Ekle"}
                                  </button>
                                </td>
                                <td className="px-4 py-3.5 text-right">
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleStockAdjustment(product, "IN")}
                                      className="rounded-lg bg-emerald-500 hover:bg-emerald-600 px-2 py-1.5 text-[10px] font-semibold text-white transition cursor-pointer"
                                    >
                                      +
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleStockAdjustment(product, "OUT")}
                                      className="rounded-lg bg-amber-500 hover:bg-amber-600 px-2 py-1.5 text-[10px] font-semibold text-white transition cursor-pointer"
                                    >
                                      −
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenB2bQuickModal(product)}
                                      className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition cursor-pointer ${
                                        product.is_b2b_visible
                                          ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                      }`}
                                    >
                                      {product.is_b2b_visible ? "📦 Toptan" : "📦 Toptana Aç"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleStartEdit(product)}
                                      className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 transition cursor-pointer"
                                    >
                                      ✏️ Düzenle
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setCampaignModalProduct(product)}
                                      className="rounded-lg border border-blue-200 bg-white hover:bg-blue-50 px-2.5 py-1.5 text-[10px] font-semibold text-blue-600 transition cursor-pointer"
                                    >
                                      📢 Kampanya
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleDelete(product.id)}
                                      className="rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 text-[10px] font-semibold text-rose-700 transition cursor-pointer"
                                    >
                                      🗑️ Sil
                                    </button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  handleCancelEdit();
                  setShowAllProductsModal(false);
                }}
                className="rounded-2xl bg-slate-900 hover:bg-slate-800 px-5 py-2.5 text-xs font-bold text-white transition cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* B2B HIZLI AYARLAR MODALI */}
      {b2bQuickProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Ürünü B2B / Toptan Satışa Aç</h3>
                <p className="text-xs text-slate-500 mt-0.5">Ürünün toptan satış görünürlüğünü ve paket ayarlarını yapın.</p>
              </div>
              <button
                type="button"
                onClick={() => setB2bQuickProduct(null)}
                className="rounded-full bg-slate-100 hover:bg-rose-50 hover:text-rose-600 p-2 text-slate-400 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Error Message */}
            {b2bQuickError && (
              <div className="mx-6 mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold">
                ⚠️ {b2bQuickError}
              </div>
            )}

            {/* Content */}
            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              {/* Salt Okunur Bilgiler */}
              <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-2 text-xs text-slate-600">
                <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mb-1">Cihaz / Ürün Bilgisi</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div>
                    <span className="font-semibold text-slate-400">Ürün Adı:</span>
                    <p className="font-bold text-slate-800 truncate" title={b2bQuickProduct.name}>{b2bQuickProduct.name}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-400">Barkod:</span>
                    <p className="font-mono text-slate-800">#{b2bQuickProduct.barcode || "—"}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-400">Mevcut Stok:</span>
                    <p className="font-bold text-slate-800">{b2bQuickProduct.stock} adet</p>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-400">Satış Fiyatı:</span>
                    <p className="font-bold text-slate-800">{formatCurrencyTRY(b2bQuickProduct.sell_price)}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-400">Webde Görünür mü?</span>
                    <p className="mt-0.5">
                      {b2bQuickProduct.is_web_visible ? (
                        <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">✓ Evet</span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200">Hayır</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-400">B2B'de Görünür mü?</span>
                    <p className="mt-0.5">
                      {b2bQuickProduct.is_b2b_visible ? (
                        <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">✓ Evet</span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200">Hayır</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Düzenlenebilir Alanlar */}
              <div className="space-y-4">
                <label className="flex items-center gap-3 text-sm text-slate-700 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={b2bQuickForm.is_b2b_visible}
                    onChange={(e) => setB2bQuickForm(prev => ({ ...prev, is_b2b_visible: e.target.checked }))}
                    className="h-5 w-5 rounded-lg border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="font-semibold text-slate-800">B2B / Toptanda Gösterilsin mi?</span>
                </label>

                {b2bQuickForm.is_b2b_visible && (
                  <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/30 space-y-4 w-full animate-in fade-in duration-200">
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
                      B2B Paket Başlığı
                      <input
                        type="text"
                        placeholder="Örn: 10'lu Apple USB-C Paket"
                        value={b2bQuickForm.b2b_package_title}
                        onChange={(e) => handleB2bQuickFormChange("b2b_package_title", e.target.value)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2"
                      />
                    </label>

                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
                      B2B Paket Açıklaması
                      <input
                        type="text"
                        placeholder="Paket detayları..."
                        value={b2bQuickForm.b2b_package_description}
                        onChange={(e) => handleB2bQuickFormChange("b2b_package_description", e.target.value)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2"
                      />
                    </label>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
                        Paket Adedi / Minimum Sipariş
                        <input
                          type="number"
                          min="1"
                          placeholder="Örn: 4"
                          value={b2bQuickForm.b2b_min_quantity}
                          onChange={(e) => handleB2bQuickFormChange("b2b_min_quantity", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2"
                        />
                        <span className="text-[10px] text-slate-400 font-normal mt-0.5">Bu ürün bayiye en az kaç adetlik paketle sunulacak?</span>
                      </label>

                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
                        B2B Paket Fiyatı (Toplam)
                        <input
                          type="text"
                          placeholder="Örn: 499"
                          value={b2bQuickForm.b2b_package_price}
                          onChange={(e) => handleB2bQuickFormChange("b2b_package_price", formatAmount(e.target.value))}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-sky-300 focus:ring-2"
                        />
                        <span className="text-[10px] text-slate-400 font-normal mt-0.5">Bu fiyat, yukarıdaki paket adedi için toplam bayi fiyatıdır. Örn: Paket adedi 4 ve fiyat 499 ise, 4 adetlik paketin toplam fiyatı ₺499’dur.</span>
                        {Number(b2bQuickForm.b2b_min_quantity) > 0 && Number(b2bQuickForm.b2b_package_price) > 0 && (
                          <div className="text-xs text-sky-700 font-bold mt-1.5 bg-sky-50 px-3 py-1.5 rounded-xl border border-sky-100 inline-block self-start">
                            Yaklaşık adet fiyatı: {formatCurrencyTRY(Number(b2bQuickForm.b2b_package_price) / Number(b2bQuickForm.b2b_min_quantity))}
                          </div>
                        )}
                      </label>
                    </div>

                    {/* Mismatch Warning */}
                    {(() => {
                      const mismatch = checkB2bTitleQuantityMismatch(b2bQuickForm.b2b_package_title, b2bQuickForm.b2b_min_quantity);
                      if (mismatch) {
                        return (
                          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-semibold">
                            <span>⚠️ {mismatch.warningText}</span>
                            <button
                              type="button"
                              onClick={() => handleB2bQuickFormChange("b2b_min_quantity", String(mismatch.numInTitle))}
                              className="text-xs font-bold text-sky-700 hover:text-sky-800 bg-white border border-sky-200 rounded-lg px-2.5 py-1 transition cursor-pointer self-start sm:self-auto shadow-sm"
                            >
                              {mismatch.numInTitle} yap
                            </button>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setB2bQuickProduct(null)}
                className="rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 px-5 py-2.5 text-xs font-bold text-slate-700 transition cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSaveB2bQuickSettings}
                disabled={saving}
                className="rounded-2xl bg-slate-900 hover:bg-slate-800 px-5 py-2.5 text-xs font-bold text-white transition cursor-pointer disabled:opacity-50"
              >
                {saving ? "Kaydediliyor..." : "B2B Ayarlarını Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    
      {/* KAMPANYA MODALI */}
      {campaignModalProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-lg text-slate-900">{campaignModalProduct.name} için kampanya oluştur</h3>
              </div>
              <button onClick={() => setCampaignModalProduct(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                Kapat
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl mb-4">
                <p className="text-xs font-bold text-blue-900">Seçilen şart ürün: {campaignModalProduct.name}</p>
                <p className="text-xs text-blue-700 mt-1">Bu ürün kampanyayı başlatır, değiştirilemez.</p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Kampanya Adı</label>
                <input type="text" placeholder="Örn: Kılıf alana ekran koruyucu 1 TL" value={campName} onChange={e => setCampName(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white text-slate-900" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Açıklama</label>
                <textarea placeholder="Müşterilere gösterilecek açıklama..." value={campDesc} onChange={e => setCampDesc(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white text-slate-900" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700">Kampanya Tipi</label>
                  <select value={campType} onChange={e => setCampType(e.target.value as any)} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white text-slate-900">
                    <option value="direct_discount">Bu ürüne direkt indirim yap</option>
                    <option value="quantity_discount">Bu üründen belirli adet alınca indirim yap</option>
                    <option value="cross_product">Bu ürün alınırsa başka üründe indirim yap</option>
                    <option value="buy_x_pay_y">Bu ürün veya seçili ürünlerde Al X Öde Y kampanyası yap</option>
                  </select>
                  {campType === "cross_product" && (
                  <div className="mt-4 p-4 border border-blue-100 bg-blue-50/50 rounded-xl">
                    <label className="text-xs font-bold text-slate-700 block mb-2">İndirim Uygulanacak Ürünleri Seç (Zorunlu)</label>
                    <div className="flex gap-2 mb-2 flex-wrap">
                      {selectedDiscountedProducts.map(dp => (
                        <span key={dp.id} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-md flex items-center gap-1">
                          {dp.name} 
                          <button type="button" onClick={() => setSelectedDiscountedProducts(prev => prev.filter(p => p.id !== dp.id))} className="text-blue-500 hover:text-blue-900 ml-1">x</button>
                        </span>
                      ))}
                    </div>
                    <div className="relative">
                       <input 
                         type="text" 
                         placeholder="Ürün adı, barkod ya da marka arayın..." 
                         value={searchQuery} 
                         onChange={e => setSearchQuery(e.target.value)}
                         onFocus={() => setIsSearchFocused(true)}
                         onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                         className="w-full border border-slate-200 rounded-xl p-3 text-xs bg-white text-slate-900"
                       />
                       {(isSearchFocused || searchQuery.length > 0) && (
                         <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 shadow-2xl rounded-xl max-h-64 overflow-y-auto z-[110]">
                           {(() => {
                             const q = searchQuery.trim().toLowerCase();
                             const filtered = products.filter(p => {
                               if (p.id === campaignModalProduct.id) return false;
                               if (selectedDiscountedProducts.find(sp => sp.id === p.id)) return false;
                               if (!q) return true;
                               const searchStr = `${p.name} ${p.barcode || ''} ${p.brand || ''} ${p.model || ''}`.toLowerCase();
                               return searchStr.includes(q);
                             }).slice(0, 20); // İlk 20 sonucu göster
                             
                             if (filtered.length === 0) {
                               return <div className="p-4 text-xs text-slate-500 text-center">Ürün bulunamadı.</div>;
                             }
                             
                             return filtered.map(p => (
                               <div 
                                 key={p.id} 
                                 className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0"
                                 onClick={() => {
                                   setSelectedDiscountedProducts(prev => [...prev, p]);
                                   setSearchQuery("");
                                 }}
                               >
                                 <div className="h-10 w-10 shrink-0 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center">
                                   {p.image_url ? (
                                     <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                                   ) : (
                                     <span className="text-slate-400 text-lg">
                                       {p.category?.toLowerCase() === 'telefon' ? '📱' 
                                          : p.category?.toLowerCase() === 'tablet' ? '💊' 
                                          : p.category?.toLowerCase() === 'bilgisayar' ? '💻' 
                                          : p.category?.toLowerCase() === 'aksesuar' ? '🎧' 
                                          : p.category?.toLowerCase() === 'akıllı saat' ? '⌚' 
                                          : '📦'}
                                     </span>
                                   )}
                                 </div>
                                 <div className="flex-1 min-w-0">
                                   <div className="text-xs font-bold text-slate-900 truncate">{p.name}</div>
                                   <div className="flex gap-2 mt-1">
                                     <span className="text-[10px] text-slate-500 font-mono">#{p.barcode || 'Barkodsuz'}</span>
                                     <span className="text-[10px] text-slate-500">{p.category}</span>
                                   </div>
                                 </div>
                                 <div className="text-xs font-bold text-slate-900 text-right shrink-0">
                                   {(p.sell_price || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
                                 </div>
                               </div>
                             ));
                           })()}
                         </div>
                       )}
                    </div>
                  </div>
                )}
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">İndirim Türü</label>
                  <select value={campDiscType} onChange={e => setCampDiscType(e.target.value as any)} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white text-slate-900">
                    <option value="percent">Yüzde indirim</option>
                    <option value="fixed_amount">Sabit tutar indirimi</option>
                    <option value="fixed_price">Sabit son fiyat</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700">İndirim Miktarı / Değeri</label>
                  <input type="number" value={campDiscValue} onChange={e => setCampDiscValue(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white text-slate-900" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">
                    Kaç Adet Alınca?
                  </label>
                  {campType === "cross_product" && <p className="text-[9px] text-slate-500 leading-tight mt-0.5">Şart üründen sepette kaç adet olunca kampanya devreye girer?</p>}
                  <input type="number" min="1" value={campBuyQty} onChange={e => setCampBuyQty(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white text-slate-900" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">
                    Kaç Adede İndirim Uygulanacak?
                  </label>
                  {campType === "cross_product" && <p className="text-[9px] text-slate-500 leading-tight mt-0.5">Sepetteki indirimli üründen kaç adede indirim uygulanır?</p>}
                  <input type="number" min="1" value={campDiscQty} onChange={e => setCampDiscQty(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white text-slate-900" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700">Başlangıç Tarihi</label>
                  <input type="datetime-local" value={campStarts} onChange={e => setCampStarts(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white text-slate-900" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Bitiş Tarihi</label>
                  <input type="datetime-local" value={campEnds} onChange={e => setCampEnds(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white text-slate-900" />
                </div>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <input type="checkbox" id="campActive" checked={campIsActive} onChange={e => setCampIsActive(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300" />
                <label htmlFor="campActive" className="text-sm font-semibold text-slate-900">Bu kampanya aktif olarak yayınlansın.</label>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-white">
              <button onClick={() => setCampaignModalProduct(null)} className="px-6 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all text-slate-700">İptal</button>
              <button onClick={handleSaveCampaign} disabled={isCampSaving || (campType === "cross_product" && selectedDiscountedProducts.length === 0)} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50">{isCampSaving ? "Kaydediliyor..." : "Kaydet"}</button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
