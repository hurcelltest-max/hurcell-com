const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // 1. Check /kampanyalar
    console.log("Checking /kampanyalar...");
    await page.goto('http://localhost:3000/kampanyalar', { waitUntil: 'networkidle0' });
    
    // Evaluate Kampanyalar
    const kampResult = await page.evaluate(() => {
        const text = document.body.innerText;
        const hasYeniKampanyaBtn = text.includes("Yeni Kampanya Oluştur");
        const hasDuzenleBtn = text.includes("Düzenle");
        return { hasYeniKampanyaBtn, hasDuzenleBtn };
    });
    console.log(`Kampanyalar: Yeni Kampanya Butonu Yok mu? -> ${!kampResult.hasYeniKampanyaBtn ? 'EVET' : 'HAYIR'}`);
    console.log(`Kampanyalar: Düzenle Butonu Var mı? -> ${kampResult.hasDuzenleBtn ? 'EVET' : 'HAYIR'}`);

    // 2. Check /urunler
    console.log("Checking /urunler...");
    await page.goto('http://localhost:3000/urunler', { waitUntil: 'networkidle0' });
    
    const urunResult = await page.evaluate(() => {
        const text = document.body.innerText;
        const hasKampanyaBtn = text.includes("Bu Üründen Kampanya Oluştur");
        const hasSifirKapaliKutu = text.includes("Sıfır Kapalı Kutu");
        return { hasKampanyaBtn, hasSifirKapaliKutu };
    });
    console.log(`Ürünler: Bu Üründen Kampanya Oluştur butonu var mı? -> ${urunResult.hasKampanyaBtn ? 'EVET' : 'HAYIR'}`);
    // Wait, the badge might be hidden if there are no accessories, but if there are accessories it shouldn't show.
    // Let's assume the user has accessories in DB.
    console.log(`Ürünler: Sıfır Kapalı Kutu rozeti var mı? -> ${urunResult.hasSifirKapaliKutu ? 'EVET' : 'HAYIR'}`);

    await browser.close();
    console.log("Verification finished.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
