// 開桌 QR 單實際渲染（真的跑 pos-ops.js 的 printTableQr＋menu-lib.js），各時段各存一張 PNG，並量 100 句鼓勵小語最長的高度
// 用法：node scripts/shot-qr-slip.mjs <輸出資料夾>
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const out = path.resolve(process.argv[2] || 'qr-slip-shots');
fs.mkdirSync(out, { recursive: true });
const pub = p => fs.readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const ops = pub('pos-ops.js');
const clipTop = Number((/const QR_CLIP_TOP=(\d+);/.exec(ops) || [])[1] || 0);
const fn = ops.match(/async function printTableQr\(table,url,info=\{\}\)\{[\s\S]*?\n\}/)[0];

const html = `<!doctype html><meta charset="utf-8"><body>
<script>${pub('vendor/qrcode.min.js')}</script>
<script>${pub('menu-lib.js')}</script>
<script>${pub('pos-encouragement.js')}</script>
<script>${pub('pos-moji.js')}</script>
<script>
const STAR_DOTS=384,QR_CLIP_TOP=${clipTop},BRAND_LABEL={CAFE:'在咖啡',BAR:'三點水'};let LAST=null;
const starReady=()=>true,starOpenHere=async()=>{},toast=()=>{};
const starSend=async({canvas})=>{LAST=canvas.toDataURL('image/png');return true;};
const REAL=MenuLib.orderWindow,REALP=MenuLib.barPolicyActive;
function force(venue,policy){MenuLib.orderWindow=()=>({venue});MenuLib.barPolicyActive=()=>policy;}
${fn}
</script></body>`;

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent(html);
const cases = [['bar', 'BAR', true, { party_size: 4, kids: 1, no: 'A1B2C3', opened_at: '2026-11-01T10:06:47Z' }], ['bar-noparty', 'BAR', true, { no: 'A1B2C3' }], ['cafe', 'CAFE', true, { party_size: 2, kids: 0, no: 'D4E5F6' }]];
for (const [name, venue, policy, info] of cases) {
  const { png, hs } = await page.evaluate(async (venue, policy, info, clip) => {
    force(venue, policy);
    const P = PosEncouragement.phrases, orig = PosEncouragement.pick, hs = [];
    for (let i = 0; i < P.length; i++) {
      window.PosEncouragement = { phrases: P, pick: () => P[i] };
      await printTableQr('B12', 'https://www.emoji.tw/order?s=ts_demo0000000000&k=0123456789abcdef', info);
      const im = new Image(); im.src = LAST; await im.decode(); hs.push((im.height - clip) / 8);
    }
    const longest = hs.indexOf(Math.max(...hs));
    window.PosEncouragement = { phrases: P, pick: () => P[longest] };
    await printTableQr('B12', 'https://www.emoji.tw/order?s=ts_demo0000000000&k=0123456789abcdef', info);
    window.PosEncouragement = { phrases: P, pick: orig };
    return { png: LAST, hs };
  }, venue, policy, info, clipTop);
  fs.writeFileSync(path.join(out, `qr-slip-${name}.png`), Buffer.from(png.split(',')[1], 'base64'));
  console.log(name, 'body mm max', Math.max(...hs), 'min', Math.min(...hs));
}
await browser.close();
console.log('saved to', out);
