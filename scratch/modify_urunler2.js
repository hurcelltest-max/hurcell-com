const fs = require('fs');
const path = require('path');

const fileUrunler = path.join("C:\\Users\\hurce\\.gemini\\antigravity\\scratch\\hurcell-com", "stok", "app", "urunler", "page.tsx");
let contentU = fs.readFileSync(fileUrunler, "utf-8");

// 1. Badge logic fix (hide device_condition_type for accessories)
// In the "Son Eklenen 5 Ürün" (around line 2742)
contentU = contentU.replace(
    /\{p\.device_condition_type && \(/g,
    "{p.category?.toLowerCase() !== 'aksesuar' && p.device_condition_type && ("
);

// In the main list (around line 3440)
contentU = contentU.replace(
    /\{product\.device_condition_type && \(\(\) => \{/g,
    "{product.category?.toLowerCase() !== 'aksesuar' && product.device_condition_type && (() => {"
);


// 2. Insert "Bu Üründen Kampanya Oluştur" button
// After handleStartEdit button in "Son Eklenen" and "Main List"

const campaignBtnStr = `
                                    <button
                                      type="button"
                                      onClick={() => setCampaignModalProduct(p)}
                                      className="rounded-lg border border-blue-200 bg-white hover:bg-blue-50 px-2.5 py-1.5 text-[10px] font-semibold text-blue-600 transition cursor-pointer"
                                    >
                                      Bu Üründen Kampanya Oluştur
                                    </button>
`;
const campaignBtnStrMain = campaignBtnStr.replace(/setCampaignModalProduct\(p\)/g, "setCampaignModalProduct(product)");

// Replace in Son Eklenen
contentU = contentU.replace(
    /(<button\s+type="button"\s+onClick=\{\(\) => \{\s*handleStartEdit\(p\);\s*\}\}\s+className="[^"]*"\s*>\s*Düzenle\s*<\/button>)/,
    "$1" + campaignBtnStr
);

// Replace in Main List
contentU = contentU.replace(
    /(<button\s+type="button"\s+onClick=\{\(\) => handleStartEdit\(product\)\}\s+className="[^"]*"\s*>\s*Düzenle\s*<\/button>)/,
    "$1" + campaignBtnStrMain
);

// 3. Define state and modal for campaign creation.
const stateInsertIdx = contentU.indexOf("const [isSubmitting");
if (stateInsertIdx !== -1) {
    const campaignStates = `
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

      const { data: newCamp, error } = await supabase.from("campaigns").insert([payload]).select("id").single();
      if (error) throw error;

      let rows = [];
      if (campType === "cross_product") {
         rows = [
           { campaign_id: newCamp.id, product_id: campaignModalProduct.id, product_role: "trigger" }
         ];
      } else {
         rows = [
           { campaign_id: newCamp.id, product_id: campaignModalProduct.id, product_role: "eligible" }
         ];
      }
      
      const { error: relError } = await supabase.from("campaign_products").insert(rows);
      if (relError) throw relError;

      alert("Kampanya başarıyla oluşturuldu.");
      setCampaignModalProduct(null);
    } catch (err: any) {
      alert("Hata: " + err.message);
    } finally {
      setIsCampSaving(false);
    }
  };
`;
    contentU = contentU.slice(0, stateInsertIdx) + campaignStates + contentU.slice(stateInsertIdx);
}

// 4. Render the modal at the end of return statement
const modalCode = `
      {/* KAMPANYA MODALI */}
      {campaignModalProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Yeni Kampanya Oluştur</h3>
                <p className="text-xs text-slate-500 mt-1">{campaignModalProduct.name}</p>
              </div>
              <button onClick={() => setCampaignModalProduct(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                Kapat
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700">Kampanya Adı</label>
                <input type="text" placeholder="Örn: 2. Ürüne %50 İndirim" value={campName} onChange={e => setCampName(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Açıklama</label>
                <textarea placeholder="Müşterilere gösterilecek açıklama..." value={campDesc} onChange={e => setCampDesc(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700">Kampanya Tipi</label>
                  <select value={campType} onChange={e => setCampType(e.target.value as any)} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white">
                    <option value="direct_discount">Direkt İndirim</option>
                    <option value="quantity_discount">Adet Bazlı İndirim</option>
                    <option value="buy_x_pay_y">Al X Öde Y</option>
                    <option value="cross_product">Çapraz Kampanya (Tetikleyici)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">İndirim Türü</label>
                  <select value={campDiscType} onChange={e => setCampDiscType(e.target.value as any)} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white">
                    <option value="percent">Yüzdesel (%)</option>
                    <option value="fixed_amount">Sabit Tutar (TRY)</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700">İndirim Miktarı</label>
                  <input type="number" value={campDiscValue} onChange={e => setCampDiscValue(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Satın Alınacak Adet (Buy Qty)</label>
                  <input type="number" value={campBuyQty} onChange={e => setCampBuyQty(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">İndirimli Adet (Discounted Qty)</label>
                  <input type="number" value={campDiscQty} onChange={e => setCampDiscQty(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700">Başlangıç Tarihi</label>
                  <input type="datetime-local" value={campStarts} onChange={e => setCampStarts(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Bitiş Tarihi</label>
                  <input type="datetime-local" value={campEnds} onChange={e => setCampEnds(e.target.value)} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white" />
                </div>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <input type="checkbox" id="campActive" checked={campIsActive} onChange={e => setCampIsActive(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300" />
                <label htmlFor="campActive" className="text-sm font-semibold text-slate-700">Bu kampanya aktif olarak yayınlansın.</label>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-white">
              <button onClick={() => setCampaignModalProduct(null)} className="px-6 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all">İptal</button>
              <button onClick={handleSaveCampaign} disabled={isCampSaving} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all">{isCampSaving ? "Kaydediliyor..." : "Kaydet"}</button>
            </div>
          </div>
        </div>
      )}
`;

contentU = contentU.replace(/<\/section>\s*$/m, modalCode + "\n    </section>");

fs.writeFileSync(fileUrunler, contentU, "utf-8");
console.log("urunler/page.tsx modified successfully");
