const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox'],
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  });
  
  const page1 = await browser.newPage();
  await page1.setViewport({ width: 390, height: 844 });
  await page1.goto('file:///' + path.resolve(__dirname, 'formula-spy-history.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await page1.screenshot({ path: path.resolve(__dirname, 'screenshot-original.png'), fullPage: false });

  const page2 = await browser.newPage();
  await page2.setViewport({ width: 390, height: 844 });
  await page2.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  
  await page2.evaluate(() => {
    localStorage.setItem('formula-spy:v1', JSON.stringify({
      version: 1,
      profile: { porosity:"medium",density:"medium",condition:"good",oiliness:"normal",curlPattern:"wavy",scalpSensitivity:false,proteinSensitivity:false,siliconeSensitivity:false,chemicallyTreated:false,updatedAt:new Date().toISOString() },
      history: [
        { id:"t1", productName:"Deep Conditioner · Curl Enhancing Smoothie", productType:"deep_conditioner_mask", rawInci:"Water, Cetearyl Alcohol, Butyrospermum Parkii Butter, Glycerin, Stearamidopropyl Dimethylamine", score:87, createdAt:new Date(Date.now()-2*3600000).toISOString(), result:{score:87} },
        { id:"t2", productName:"Treatment · No. 3 Hair Perfector", productType:"treatment", rawInci:"Water, Bis-Aminopropyl Diglycol Dimaleate, Propylene Glycol, Cetearyl Alcohol", score:92, createdAt:new Date(Date.now()-5*3600000).toISOString(), result:{score:92} },
        { id:"t3", productName:"Shampoo · Argan Oil of Morocco Shampoo", productType:"shampoo", rawInci:"Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride", score:64, createdAt:new Date(Date.now()-26*3600000).toISOString(), result:{score:64} },
        { id:"t4", productName:"Leave-in · Shea Butter Leave-In Conditioning Repair Cream", productType:"leave_in_conditioner", rawInci:"Water, Cetearyl Alcohol, Stearyl Alcohol, Canola Oil, Glycerin, Behentrimonium Chloride", score:81, createdAt:new Date(Date.now()-27*3600000).toISOString(), result:{score:81} }
      ]
    }));
  });
  
  await page2.reload({ waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));
  
  await page2.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, a'));
    const h = els.find(el => el.textContent.toLowerCase().includes('history'));
    if (h) h.click();
  });
  
  await new Promise(r => setTimeout(r, 2000));
  await page2.screenshot({ path: path.resolve(__dirname, 'screenshot-react.png'), fullPage: false });

  await browser.close();
  console.log('Done');
})();
