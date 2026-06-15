const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // Set viewport
  await page.setViewport({ width: 1280, height: 800 });

  // 1. Urunler page
  await page.goto('http://localhost:3000/urunler');
  // Wait for loading to finish
  await page.waitForTimeout(3000);
  
  // Take screenshot of Urunler
  await page.screenshot({ path: path.join(__dirname, 'urunler_screenshot.png') });

  // 2. Kampanyalar page
  await page.goto('http://localhost:3000/kampanyalar');
  await page.waitForTimeout(3000);
  
  // Take screenshot of Kampanyalar
  await page.screenshot({ path: path.join(__dirname, 'kampanyalar_screenshot.png') });

  await browser.close();
  console.log("Screenshots captured");
})();
