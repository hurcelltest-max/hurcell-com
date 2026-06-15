const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    console.log("Checking /kampanyalar...");
    await page.goto('http://localhost:3000/kampanyalar');
    await page.waitForFunction('!document.body.innerText.includes("yükleniyor") && !document.body.innerText.includes("Yükleniyor")', {timeout: 10000});
    await new Promise(r => setTimeout(r, )); // extra wait for render
    
    const kampResult = await page.evaluate(() => {
        const text = document.body.innerText;
        const hasYeniKampanyaBtn = text.includes("Yeni Kampanya Oluştur");
        const hasDuzenleBtn = text.includes("Düzenle");
        return { hasYeniKampanyaBtn, hasDuzenleBtn, textLength: text.length };
    });
    console.log(`Kampanyalar length: ${kampResult.textLength}`);
    console.log(`Kampanyalar: Yeni Kampanya Butonu Yok mu? -> ${!kampResult.hasYeniKampanyaBtn ? 'EVET' : 'HAYIR'}`);
    console.log(`Kampanyalar: Düzenle Butonu Var mı? -> ${kampResult.hasDuzenleBtn ? 'EVET' : 'HAYIR'}`);

    console.log("Checking /urunler...");
    await page.goto('http://localhost:3000/urunler');
    await page.waitForFunction('!document.body.innerText.includes("yükleniyor") && !document.body.innerText.includes("Yükleniyor")', {timeout: 10000});
    await new Promise(r => setTimeout(r, )); // extra wait for render
    
    const urunResult = await page.evaluate(() => {
        const text = document.body.innerText;
        const hasKampanyaBtn = text.includes("Bu Üründen Kampanya Oluştur");
        const hasSifirKapaliKutu = text.includes("Sıfır Kapalı Kutu");
        return { hasKampanyaBtn, hasSifirKapaliKutu, textLength: text.length };
    });
    console.log(`Ürünler length: ${urunResult.textLength}`);
    console.log(`Ürünler: Bu Üründen Kampanya Oluştur butonu var mı? -> ${urunResult.hasKampanyaBtn ? 'EVET' : 'HAYIR'}`);
    console.log(`Ürünler: Sıfır Kapalı Kutu rozeti var mı? -> ${urunResult.hasSifirKapaliKutu ? 'EVET' : 'HAYIR'}`);

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
