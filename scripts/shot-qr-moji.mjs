// 產出桌號 QR 單的 moji 插圖預覽：全部 100 張總覽＋幾張完整 QR 單（真的跑 pos-ops.js 的 printTableQr）
// 用法：node scripts/shot-qr-moji.mjs <輸出資料夾>
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const out = path.resolve(process.argv[2] || 'qr-moji-shots');
fs.mkdirSync(out, { recursive: true });
const pub = p => fs.readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const ops = pub('pos-ops.js');
const fn = ops.match(/async function printTableQr\(table,url\)\{[\s\S]*?\n\}/)[0];

const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#ddd">
<script>${pub('vendor/qrcode.min.js')}</script>
<script>${pub('pos-encouragement.js')}</script>
<script>${pub('pos-moji.js')}</script>
<script>
const STAR_DOTS=384;let LAST=null;
const starReady=()=>true,starOpenHere=async()=>{},toast=()=>{};
const starSend=async({canvas})=>{LAST=canvas.toDataURL('image/png');return true;};
${fn}
</script></body>`;

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent(html);

// 1) 100 張插圖總覽（10×10，每格插圖＋中文小語）
const grid = await page.evaluate(() => {
  const P = PosEncouragement.phrases, cw = 260, ch = 290, cols = 10;
  const c = document.createElement('canvas'); c.width = cw * cols; c.height = ch * Math.ceil(P.length / cols);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  P.forEach((p, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    g.strokeStyle = '#ccc'; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, cw - 1, ch - 1);
    PosMoji.draw(g, p.m, x + 20, y + 10, 220);
    g.fillStyle = '#000'; g.font = '16px sans-serif'; g.textAlign = 'center';
    g.fillText((i + 1) + '. ' + p.zh, x + cw / 2, y + 225);
    g.fillStyle = '#666'; g.font = '13px sans-serif'; g.fillText(p.m, x + cw / 2, y + 250);
  });
  return c.toDataURL('image/png');
});
fs.writeFileSync(path.join(out, 'moji-100.png'), Buffer.from(grid.split(',')[1], 'base64'));

// 2) 完整 QR 單（58mm／384 dots），抽幾句實際跑 printTableQr
for (const i of [0, 29, 97]) {
  const png = await page.evaluate(async i => {
    const orig = PosEncouragement.pick; const P = PosEncouragement.phrases;
    window.PosEncouragement = { phrases: P, pick: () => P[i] };
    await printTableQr('A' + (i % 9 + 1), 'https://www.emoji.tw/order?s=demo&k=demo');
    window.PosEncouragement = { phrases: P, pick: orig };
    return LAST;
  }, i);
  fs.writeFileSync(path.join(out, `qr-slip-${String(i + 1).padStart(3, '0')}.png`), Buffer.from(png.split(',')[1], 'base64'));
}
await browser.close();
console.log('saved to', out);
