// 帳本夾點餐明細預覽：真的跑 pos-ops.js 的 orderSlipSpec＋ticketCanvas，輸出 58mm 熱感紙 PNG
// 用法：node scripts/shot-order-slip.mjs <輸出資料夾>
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const out = path.resolve(process.argv[2] || 'order-slip-shots');
fs.mkdirSync(out, { recursive: true });
const pub = p => fs.readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const html = `<!doctype html><meta charset="utf-8"><body>
<script>${pub('menu-lib.js')}</script>
<script>window.BRAND_LABEL={BAR:'三點水',CAFE:'在咖啡'};window.SCOPE='';window.num=n=>Number(n).toLocaleString('en-US');
window.applicationTime=()=>'2026/10/27 18:15';window.navigator.__star=1;</script>
<script>${pub('pos-ops.js')}</script></body>`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', e => console.error('pageerror', e.message));
await page.setContent(html);
const samples = {
  bar: { id: 'tk_9f3a1038', table_no: 'B1', placed_at: 'now', table_total: { amount: 1448, service: 145, total: 1593, count: 9, party: 4 }, items: [
    { zh: '波塞冬秘醬海鮮', qty: 1, price: 398, cat: 'MAIN', venue: 'BAR', by: '小明' },
    { zh: '熱帶鮮果茶', qty: 1, price: 160, cat: 'TEA', venue: 'BAR', by: '小明', note: '冰量：少冰；先上' },
    { zh: '彩椒酒香蛤蜊義麵', qty: 2, price: 298, cat: 'MAIN', venue: 'BAR', by: '小明' },
    { zh: '98 套餐', qty: 1, price: 98, cat: 'MAIN', venue: 'BAR', by: '小明', parts: [{ slot: '麵包', zh: '餐包' }, { slot: '湯品', zh: '奶油蘑菇湯' }] },
  ] },
  cafe: { id: 'tk_77c2a001', table_no: 'A3', placed_at: 'now', table_total: { amount: 340, service: 0, total: 340, count: 3, party: 2 }, items: [
    { zh: '拿鐵', qty: 2, price: 120, cat: 'COFFEE', venue: 'CAFE', by: 'Amy', note: '溫度：冰；去冰（有小碎冰）' },
    { zh: '肉桂捲', qty: 1, price: 100, cat: 'BREAD', venue: 'CAFE', by: 'Amy' },
  ] },
};
for (const [k, o] of Object.entries(samples)) {
  const png = await page.evaluate(o => ticketCanvas(orderSlipSpec(o)).toDataURL('image/png'), o);
  fs.writeFileSync(path.join(out, `order-slip-${k}.png`), Buffer.from(png.split(',')[1], 'base64'));
  console.log('wrote', path.join(out, `order-slip-${k}.png`));
}
await browser.close();
