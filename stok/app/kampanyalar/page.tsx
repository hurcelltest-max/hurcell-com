"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Campaign {
  id: string;
  name: string;
  description: string;
  campaign_type: string;
  discount_type: "percent" | "fixed_amount";
  discount_value: number;
  buy_quantity: number;
  discounted_quantity: number;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface Product {
  id: string;
  name: string;
  barcode: string;
  brand: string;
  model: string;
  sell_price: number;
}

export default function CampaignsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  // Modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formCampaignId, setFormCampaignId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formDiscountType, setFormDiscountType] = useState<"percent" | "fixed_amount">("percent");
  const [formDiscountValue, setFormDiscountValue] = useState<number>(0);
  const [formBuyQty, setFormBuyQty] = useState<number>(2);
  const [formDiscQty, setFormDiscQty] = useState<number>(1);
  const [formStartsAt, setFormStartsAt] = useState("");
  const [formEndsAt, setFormEndsAt] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  // Product linkage state
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignProducts, setCampaignProducts] = useState<string[]>([]); // product IDs linked
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) return;
      
      // Fetch all campaigns
      const { data: camps, error: cError } = await (supabase as any)
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (cError) throw cError;
      setCampaigns(camps || []);

      // Fetch products for dropdown/association
      const { data: prods, error: pError } = await (supabase as any)
        .from("products")
        .select("id, name, barcode, brand, model, sell_price")
        .eq("is_web_visible", true)
        .order("name", { ascending: true });
      if (pError) throw pError;
      setProducts(prods || []);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const loadCampaignProducts = async (campId: string) => {
    if (!supabase) return;
    try {
      const { data, error: cpError } = await (supabase as any)
        .from("campaign_products")
        .select("product_id")
        .eq("campaign_id", campId);
      if (cpError) throw cpError;
      setCampaignProducts(data?.map((row: any) => row.product_id) || []);
    } catch (err: any) {
      console.error("Error loading campaign products:", err);
    }
  };

  const handleSelectCampaign = async (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    await loadCampaignProducts(campaign.id);
  };

  const handleOpenCreateModal = () => {
    setFormCampaignId(null);
    setFormName("");
    setFormDesc("");
    setFormDiscountType("percent");
    setFormDiscountValue(0);
    setFormBuyQty(2);
    setFormDiscQty(1);
    
    // Set starts_at to current datetime local, format to YYYY-MM-DDTHH:MM
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setFormStartsAt(now.toISOString().slice(0, 16));
    setFormEndsAt("");
    setFormIsActive(true);
    setIsFormOpen(true);
  };

  const handleOpenEditModal = (camp: Campaign) => {
    setFormCampaignId(camp.id);
    setFormName(camp.name);
    setFormDesc(camp.description || "");
    setFormDiscountType(camp.discount_type);
    setFormDiscountValue(camp.discount_value);
    setFormBuyQty(camp.buy_quantity);
    setFormDiscQty(camp.discounted_quantity);
    
    const startStr = new Date(camp.starts_at);
    startStr.setMinutes(startStr.getMinutes() - startStr.getTimezoneOffset());
    setFormStartsAt(startStr.toISOString().slice(0, 16));
    
    if (camp.ends_at) {
      const endStr = new Date(camp.ends_at);
      endStr.setMinutes(endStr.getMinutes() - endStr.getTimezoneOffset());
      setFormEndsAt(endStr.toISOString().slice(0, 16));
    } else {
      setFormEndsAt("");
    }
    
    setFormIsActive(camp.is_active);
    setIsFormOpen(true);
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Frontend Validations
    if (!formName.trim()) {
      alert("Kampanya adı zorunludur.");
      return;
    }
    if (formDiscountValue <= 0) {
      alert("İndirim değeri 0'dan büyük olmalıdır.");
      return;
    }
    if (formDiscountType === "percent" && formDiscountValue > 100) {
      alert("Yüzde cinsinden indirim değeri 100'den büyük olamaz.");
      return;
    }
    if (formBuyQty <= 0 || formDiscQty <= 0) {
      alert("Satın alma ve indirimli adetler 0'dan büyük olmalıdır.");
      return;
    }
    if (formDiscQty > formBuyQty) {
      alert("İndirimli ürün adedi, satın alma adedinden (buy_quantity) fazla olamaz.");
      return;
    }
    if (!formStartsAt) {
      alert("Başlangıç tarihi belirtilmelidir.");
      return;
    }

    if (formIsActive) {
      if (!formCampaignId) {
        alert("Aktif kampanya için en az 1 ürün bağlanmalıdır. Lütfen önce pasif kaydedip ürün bağlayın.");
        return;
      }
      try {
        const { count, error: countError } = await (supabase as any)
          .from("campaign_products")
          .select("product_id", { count: "exact", head: true })
          .eq("campaign_id", formCampaignId);
        if (countError) throw countError;
        if (count === 0) {
          alert("Aktif kampanya için en az 1 ürün bağlanmalıdır.");
          return;
        }
      } catch (err) {
        console.error("Ürün sayısı kontrol edilirken hata:", err);
      }
    }

    try {
      if (!supabase) return;

      const payload = {
        name: formName.trim(),
        description: formDesc.trim() || null,
        campaign_type: "quantity_discount",
        discount_type: formDiscountType,
        discount_value: Number(formDiscountValue),
        buy_quantity: Number(formBuyQty),
        discounted_quantity: Number(formDiscQty),
        starts_at: new Date(formStartsAt).toISOString(),
        ends_at: formEndsAt ? new Date(formEndsAt).toISOString() : null,
        is_active: formIsActive
      };

      if (formCampaignId) {
        // Update
        const { error: saveError } = await (supabase as any)
          .from("campaigns")
          .update(payload)
          .eq("id", formCampaignId);
        if (saveError) throw saveError;
      } else {
        // Insert
        const { error: saveError } = await (supabase as any)
          .from("campaigns")
          .insert([payload]);
        if (saveError) throw saveError;
      }

      setIsFormOpen(false);
      await loadData();
      setSelectedCampaign(null);
    } catch (err: any) {
      console.error(err);
      alert("Kampanya kaydedilirken hata oluştu: " + err.message);
    }
  };

  const handleDeleteCampaign = async (campId: string) => {
    if (!confirm("Bu kampanyayı silmek istediğinizden emin misiniz? Kampanyaya bağlı tüm ürünler otomatik olarak ayrılacaktır. Sipariş kayıtları etkilenmez.")) {
      return;
    }
    
    setError(null);
    try {
      if (!supabase) return;
      const { error: dError } = await (supabase as any)
        .from("campaigns")
        .delete()
        .eq("id", campId);
      if (dError) throw dError;
      
      if (selectedCampaign?.id === campId) {
        setSelectedCampaign(null);
      }
      await loadData();
    } catch (err: any) {
      console.error(err);
      alert("Kampanya silinirken hata oluştu: " + err.message);
    }
  };

  const handleToggleActive = async (camp: Campaign) => {
    try {
      if (!supabase) return;
      
      if (!camp.is_active) {
        const { count, error: countError } = await (supabase as any)
          .from("campaign_products")
          .select("product_id", { count: "exact", head: true })
          .eq("campaign_id", camp.id);
        if (countError) throw countError;
        if (count === 0) {
          alert("Aktif kampanya için en az 1 ürün bağlanmalıdır.");
          return;
        }
      }

      const { error: uError } = await (supabase as any)
        .from("campaigns")
        .update({ is_active: !camp.is_active })
        .eq("id", camp.id);
      if (uError) throw uError;
      
      // Update local state
      setCampaigns(campaigns.map(c => c.id === camp.id ? { ...c, is_active: !c.is_active } : c));
      if (selectedCampaign?.id === camp.id) {
        setSelectedCampaign({ ...selectedCampaign, is_active: !selectedCampaign.is_active });
      }
    } catch (err: any) {
      console.error(err);
      alert("Aktiflik durumu güncellenirken hata oluştu: " + err.message);
    }
  };

  const handleLinkProduct = async (prodId: string) => {
    if (!selectedCampaign || !supabase) return;
    try {
      const { error: lError } = await (supabase as any)
        .from("campaign_products")
        .insert([{ campaign_id: selectedCampaign.id, product_id: prodId }]);
      if (lError) throw lError;
      
      setCampaignProducts([...campaignProducts, prodId]);
    } catch (err: any) {
      console.error(err);
      alert("Ürün kampanyaya bağlanırken hata oluştu.");
    }
  };

  const handleUnlinkProduct = async (prodId: string) => {
    if (!selectedCampaign || !supabase) return;
    try {
      const { error: uError } = await (supabase as any)
        .from("campaign_products")
        .delete()
        .eq("campaign_id", selectedCampaign.id)
        .eq("product_id", prodId);
      if (uError) throw uError;
      
      setCampaignProducts(campaignProducts.filter(id => id !== prodId));
    } catch (err: any) {
      console.error(err);
      alert("Ürün kampanyadan çıkarılırken hata oluştu.");
    }
  };

  // Filters for product selector
  const filteredProducts = products.filter(p => {
    const query = searchQuery.toLocaleLowerCase("tr-TR");
    return (
      !query ||
      p.name.toLocaleLowerCase("tr-TR").includes(query) ||
      p.brand.toLocaleLowerCase("tr-TR").includes(query) ||
      p.model.toLocaleLowerCase("tr-TR").includes(query) ||
      p.barcode.includes(query)
    );
  });

  return (
    <section className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-3xl border border-slate-200 bg-white/95 px-6 py-6 shadow-sm shadow-slate-900/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">KAMPANYA YÖNETİMİ</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Kampanyalar</h2>
          </div>
          
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Yükleniyor...</div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{error}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left panel: Campaigns list */}
          <div className="lg:col-span-6 space-y-4">
            <h3 className="text-sm font-mono tracking-wider uppercase text-slate-450">Kampanya Listesi</h3>
            <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="divide-y divide-slate-100">
                {campaigns.length === 0 ? (
                  <p className="p-6 text-sm text-slate-450 text-center">Henüz bir kampanya tanımlanmamış.</p>
                ) : (
                  campaigns.map((camp) => (
                    <div 
                      key={camp.id}
                      onClick={() => handleSelectCampaign(camp)}
                      className={`p-5 transition-all cursor-pointer flex justify-between items-start gap-4 ${
                        selectedCampaign?.id === camp.id ? "bg-slate-50/80 border-l-4 border-blue-600 pl-4" : "hover:bg-slate-50/30"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-800">{camp.name}</h4>
                          <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded-lg ${
                            camp.is_active 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                              : "bg-slate-50 text-slate-500 border-slate-200"
                          }`}>
                            {camp.is_active ? "Aktif" : "Pasif"}
                          </span>
                        </div>
                        {camp.description && <p className="text-xs text-slate-500 line-clamp-1">{camp.description}</p>}
                        <div className="text-[10px] text-slate-400 font-mono">
                          {camp.discount_type === "percent" ? `%${camp.discount_value}` : `${camp.discount_value} TRY`} İndirim ({camp.buy_quantity} al, {camp.discounted_quantity} indirimli)
                        </div>
                        <div className="text-[9px] text-slate-450 font-light">
                          {new Date(camp.starts_at).toLocaleDateString("tr-TR")} {camp.ends_at && ` - ${new Date(camp.ends_at).toLocaleDateString("tr-TR")}`}
                        </div>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleActive(camp); }}
                          className="px-2 py-1 text-[10px] font-bold border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600 transition-all cursor-pointer"
                        >
                          {camp.is_active ? "Kapat" : "Aç"}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenEditModal(camp); }}
                          className="px-2 py-1 text-[10px] font-bold border border-slate-200 rounded-lg hover:bg-slate-100 text-blue-600 transition-all cursor-pointer"
                        >
                          Düzenle
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(camp.id); }}
                          className="px-2 py-1 text-[10px] font-bold border border-rose-100 rounded-lg hover:bg-rose-50 text-rose-600 transition-all cursor-pointer"
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right panel: Campaign Linked Products */}
          <div className="lg:col-span-6 space-y-4">
            <h3 className="text-sm font-mono tracking-wider uppercase text-slate-450">Kampanya Ürünleri</h3>
            {selectedCampaign ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="pb-3 border-b border-slate-100">
                  <h4 className="text-sm font-bold text-slate-900">{selectedCampaign.name}</h4>
                  <p className="text-xs text-slate-500 mt-1">{selectedCampaign.description || "Açıklama belirtilmemiş."}</p>
                </div>

                {/* Search products filter */}
                <input
                  type="text"
                  placeholder="Ürün adı, marka, model veya barkod ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                />

                <div className="max-h-[350px] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
                  {filteredProducts.length === 0 ? (
                    <p className="p-4 text-xs text-slate-450 text-center">Filtreye uygun ürün bulunamadı.</p>
                  ) : (
                    filteredProducts.map((p) => {
                      const isLinked = campaignProducts.includes(p.id);
                      
                      let discountedPrice = p.sell_price;
                      if (selectedCampaign && isLinked) {
                        if (selectedCampaign.discount_type === "percent") {
                          discountedPrice = p.sell_price - (p.sell_price * selectedCampaign.discount_value / 100);
                        } else {
                          discountedPrice = p.sell_price - selectedCampaign.discount_value;
                        }
                        if (discountedPrice < 0) discountedPrice = 0;
                      }

                      return (
                        <div key={p.id} className="p-3 flex items-center justify-between gap-4 text-xs">
                          <div>
                            <p className="font-bold text-slate-700">{p.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {p.brand} {p.model} · Barkod: {p.barcode} · Fiyat: <span className={isLinked ? "line-through text-rose-400" : ""}>{p.sell_price} TRY</span>
                              {isLinked && (
                                <span className="ml-2 font-bold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded">
                                  İndirimli: {discountedPrice.toFixed(2)} TRY
                                </span>
                              )}
                            </p>
                          </div>
                          
                          <button
                            onClick={() => isLinked ? handleUnlinkProduct(p.id) : handleLinkProduct(p.id)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                              isLinked 
                                ? "bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100" 
                                : "bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-100"
                            }`}
                          >
                            {isLinked ? "Bağlantıyı Kes" : "Kampanyaya Ekle"}
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-white/50 border-dashed p-12 text-center text-xs text-slate-400 space-y-1">
                <p>Ürün bağlantılarını yönetmek için sol panelden bir kampanya seçin.</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Campaign Create/Edit Modal Form */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">{formCampaignId ? "Kampanyayı Düzenle" : "Yeni Kampanya Oluştur"}</h3>
              <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-700 text-sm font-semibold cursor-pointer">Kapat</button>
            </div>

            <form onSubmit={handleSaveCampaign} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-750">Kampanya Adı</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Örn: 2. Ürüne %50 İndirim"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-all"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-750">Açıklama</label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Müşterilere gösterilecek açıklama..."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-750">İndirim Türü</label>
                  <select
                    value={formDiscountType}
                    onChange={(e) => setFormDiscountType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none cursor-pointer"
                  >
                    <option value="percent">Yüzdesel (%)</option>
                    <option value="fixed_amount">Sabit Tutar (TRY)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-750">İndirim Miktarı</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formDiscountValue}
                    onChange={(e) => setFormDiscountValue(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-all"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-750">Satın Alınacak Adet (Buy Qty)</label>
                  <input
                    type="number"
                    value={formBuyQty}
                    onChange={(e) => setFormBuyQty(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-all"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-750">İndirimli Adet (Discounted Qty)</label>
                  <input
                    type="number"
                    value={formDiscQty}
                    onChange={(e) => setFormDiscQty(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-all"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-750">Başlangıç Tarihi</label>
                  <input
                    type="datetime-local"
                    value={formStartsAt}
                    onChange={(e) => setFormStartsAt(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-all"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-750">Bitiş Tarihi</label>
                  <input
                    type="datetime-local"
                    value={formEndsAt}
                    onChange={(e) => setFormEndsAt(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  id="form-is-active"
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-200 text-blue-600 focus:ring-blue-500/20 cursor-pointer h-4 w-4"
                />
                <label htmlFor="form-is-active" className="font-bold text-slate-750 cursor-pointer">Bu kampanya aktif olarak yayınlansın.</label>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl transition-all cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
