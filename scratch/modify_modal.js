const fs = require('fs');
const path = require('path');

const filePath = path.join("C:\\Users\\hurce\\.gemini\\antigravity\\scratch\\hurcell-com", "stok", "app", "urunler", "page.tsx");
let content = fs.readFileSync(filePath, "utf-8");

// 1. Add states
const statesInsertIdx = content.indexOf('const [isCampSaving, setIsCampSaving] = useState(false);');
if (statesInsertIdx !== -1 && !content.includes('selectedDiscountedProducts')) {
    const newStates = `const [isCampSaving, setIsCampSaving] = useState(false);
  const [selectedDiscountedProducts, setSelectedDiscountedProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");`;
    content = content.replace('const [isCampSaving, setIsCampSaving] = useState(false);', newStates);
}

// 2. Reset states in useEffect
const resetIdx = content.indexOf('setCampIsActive(true);');
if (resetIdx !== -1 && !content.includes('setSelectedDiscountedProducts([]);')) {
    content = content.replace('setCampIsActive(true);', 'setCampIsActive(true);\n      setSelectedDiscountedProducts([]);\n      setSearchQuery("");');
}

// 3. Update save logic
const oldSaveLogic = `
      let rows = [];
      if (campType === "cross_product") {
         rows = [
           { campaign_id: (newCamp as any).id, product_id: campaignModalProduct.id, product_role: "trigger" }
         ];
      } else {
         rows = [
           { campaign_id: (newCamp as any).id, product_id: campaignModalProduct.id, product_role: "eligible" }
         ];
      }
`;
const newSaveLogic = `
      let rows: any[] = [];
      if (campType === "cross_product") {
         rows.push({ campaign_id: (newCamp as any).id, product_id: campaignModalProduct.id, product_role: "trigger" });
         selectedDiscountedProducts.forEach(dp => {
           rows.push({ campaign_id: (newCamp as any).id, product_id: dp.id, product_role: "discounted" });
         });
      } else {
         rows.push({ campaign_id: (newCamp as any).id, product_id: campaignModalProduct.id, product_role: "eligible" });
      }
`;
content = content.replace(oldSaveLogic, newSaveLogic);

// 4. Title replace
content = content.replace(
    '<h3 className="font-bold text-lg text-slate-900">Yeni Kampanya Oluştur</h3>\n                <p className="text-xs text-slate-500 mt-1">{campaignModalProduct.name}</p>',
    '<h3 className="font-bold text-lg text-slate-900">{campaignModalProduct.name} için kampanya oluştur</h3>'
);

// 5. campType dropdown replace
const oldCampTypeSelect = `<select value={campType} onChange={e => setCampType(e.target.value as any)} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white">
                    <option value="direct_discount">Direkt İndirim</option>
                    <option value="quantity_discount">Adet Bazlı İndirim</option>
                    <option value="buy_x_pay_y">Al X Öde Y</option>
                    <option value="cross_product">Çapraz Kampanya (Tetikleyici)</option>
                  </select>`;
const newCampTypeSelect = `<select value={campType} onChange={e => setCampType(e.target.value as any)} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white">
                    <option value="cross_product">Bu ürün alınırsa başka üründe indirim yap</option>
                    <option value="direct_discount">Direkt İndirim</option>
                    <option value="quantity_discount">Adet Bazlı İndirim</option>
                    <option value="buy_x_pay_y">Al X Öde Y</option>
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
                         placeholder="Ürün ara..." 
                         value={searchQuery} 
                         onChange={e => setSearchQuery(e.target.value)} 
                         className="w-full border border-slate-200 rounded-xl p-2 text-xs bg-white"
                       />
                       {searchQuery.length > 1 && (
                         <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 shadow-xl rounded-xl max-h-40 overflow-y-auto z-10">
                           {products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) && p.id !== campaignModalProduct.id && !selectedDiscountedProducts.find(sp => sp.id === p.id)).map(p => (
                             <div 
                               key={p.id} 
                               className="p-2 text-xs hover:bg-slate-50 cursor-pointer border-b last:border-0"
                               onClick={() => {
                                 setSelectedDiscountedProducts(prev => [...prev, p]);
                                 setSearchQuery("");
                               }}
                             >
                               {p.name} - {p.category}
                             </div>
                           ))}
                         </div>
                       )}
                    </div>
                  </div>
                )}`;
content = content.replace(oldCampTypeSelect, newCampTypeSelect);

// 6. discType dropdown replace
const oldDiscTypeSelect = `<select value={campDiscType} onChange={e => setCampDiscType(e.target.value as any)} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white">
                    <option value="percent">Yüzdesel (%)</option>
                    <option value="fixed_amount">Sabit Tutar (TRY)</option>
                  </select>`;
const newDiscTypeSelect = `<select value={campDiscType} onChange={e => setCampDiscType(e.target.value as any)} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white">
                    <option value="percent">Yüzde indirim</option>
                    <option value="fixed_amount">Sabit tutar indirimi</option>
                    <option value="fixed_price">Sabit son fiyat</option>
                  </select>`;
content = content.replace(oldDiscTypeSelect, newDiscTypeSelect);

// 7. quantities replace
const oldQty = `<div>
                  <label className="text-xs font-bold text-slate-700">Satın Alınacak Adet (Buy Qty)</label>
                  <input type="number" value={campBuyQty} onChange={e => setCampBuyQty(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">İndirimli Adet (Discounted Qty)</label>
                  <input type="number" value={campDiscQty} onChange={e => setCampDiscQty(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white" />
                </div>`;
const newQty = `<div>
                  <label className="text-xs font-bold text-slate-700">Kaç Adet Alınca?</label>
                  <input type="number" value={campBuyQty} onChange={e => setCampBuyQty(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Kaç Adede İndirim Uygulanacak?</label>
                  <input type="number" value={campDiscQty} onChange={e => setCampDiscQty(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl p-3 text-xs mt-1 bg-slate-50 focus:bg-white" />
                </div>`;
content = content.replace(oldQty, newQty);


fs.writeFileSync(filePath, content, "utf-8");
console.log("Done");
