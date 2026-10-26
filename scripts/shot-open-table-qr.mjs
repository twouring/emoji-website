// 截圖：一次開多桌選桌、開桌後本桌 QR 面板（假 API，不碰正式站）。CHROME_PATH=... node scripts/shot-open-table-qr.mjs <outdir>
import puppeteer from 'puppeteer';
import fs from 'node:fs';
const out = process.argv[2] || '.';
const src = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const cut = (a, b) => { const i = src.indexOf(a); return src.slice(i, src.indexOf(b, i)); };
const qr = fs.readFileSync(new URL('../public/vendor/qrcode.min.js', import.meta.url), 'utf8');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'] });
const res = {};
for (const w of [390, 1024]) {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewport({ width: w, height: 844 });
  await page.setContent('<html lang="zh-Hant"><body></body></html>');
  for (const f of ['style.css', 'pos-ops.css']) await page.addStyleTag({ content: fs.readFileSync(new URL('../public/' + f, import.meta.url), 'utf8') });
  const posHTML = fs.readFileSync(new URL('../public/pos.html', import.meta.url), 'utf8');
  for (const m of posHTML.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) await page.addStyleTag({ content: m[1] });
  await page.addScriptTag({ content: qr });
  await page.addScriptTag({ content: `
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const toast=m=>{window.lastToast=m;};const starReady=()=>false;
    const tipIcon=h=>'<button type="button" class="tip-q" aria-label="操作說明"></button>';
    async function api(p){return {tables:[{table:'A3',url:'https://www.emoji.tw/order?s=ts_0123456789abcdef&k=AbCdEfGhIjKlMnOp'}]};}
    ${cut('function pickOverlay(', '// 從清單點一個')}
    ${cut('// 本桌點餐 QR（單次）', 'async function openManyTables(')}
  ` });
  await page.evaluate(() => { window.p = pickTables({ title: '一次開多桌', options: ['A1','A2','A3','A4','A5','A6','A7','A8','B1','B2','C1','C2'] }); });
  await page.click('[data-mt="A2"]'); await page.click('[data-mt="A3"]'); await page.click('[data-mt="A4"]');
  const label = await page.$eval('[data-ok]', b => b.textContent);
  await page.screenshot({ path: `${out}/multi-${w}.png` });
  const ov1 = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await page.click('[data-ok]'); const picked = await page.evaluate(() => window.p);
  await page.evaluate(() => openOneTableQr('A3')); await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: `${out}/qr-${w}.png` });
  const img = await page.$eval('#qr-one img', i => i.naturalWidth).catch(() => 0);
  res[w] = { label, picked, img, overflow: [ov1, await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)], errors };
}
console.log(JSON.stringify(res));
await browser.close();
