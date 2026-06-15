const fs = require('fs');
const path = require('path');

const fileUrunler = path.join("C:\\Users\\hurce\\.gemini\\antigravity\\scratch\\hurcell-com", "stok", "app", "urunler", "page.tsx");
let contentU = fs.readFileSync(fileUrunler, "utf-8");

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

if (!contentU.includes("const [campaignModalProduct")) {
    const insertIdx = contentU.indexOf("const [products, setProducts]");
    if (insertIdx !== -1) {
        contentU = contentU.slice(0, insertIdx) + campaignStates + contentU.slice(insertIdx);
        fs.writeFileSync(fileUrunler, contentU, "utf-8");
        console.log("State inserted successfully");
    } else {
        console.log("Could not find insertion point");
    }
} else {
    console.log("State already exists");
}
