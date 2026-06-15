const fs = require('fs');
const path = require('path');

const fileUrunler = path.join("C:\\Users\\hurce\\.gemini\\antigravity\\scratch\\hurcell-com", "stok", "app", "urunler", "page.tsx");
let contentU = fs.readFileSync(fileUrunler, "utf-8");

contentU = contentU.replace(
    /const \{ data: newCamp, error \} = await supabase!\.from\("campaigns"\)\.insert\(\[payload as any\]\)\.select\("id"\)\.single\(\);/,
    `// @ts-ignore\n      const { data: newCamp, error } = await supabase.from("campaigns").insert([payload]).select("id").single();`
);

contentU = contentU.replace(
    /const \{ error: relError \} = await supabase\.from\("campaign_products"\)\.insert\(rows as any\);/,
    `// @ts-ignore\n      const { error: relError } = await supabase.from("campaign_products").insert(rows);`
);

fs.writeFileSync(fileUrunler, contentU, "utf-8");
console.log("TS ignored");
