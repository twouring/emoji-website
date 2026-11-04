// Run: node scripts/check-app-stylebook.mjs [screenshot-dir]
// 用本機 Chrome 開 /stylebook/app/，確認 App 樣式有載入、手機寬度不跑版、按鈕觸控區足夠。
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
const root = fileURLToPath(new URL('../public/', import.meta.url));
const shots = process.argv[2];
const server = http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : { channel: 'chrome' }) });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', r => r.url().startsWith('http://127.0.0.1:') ? r.continue() : r.abort());
  const url = `http://127.0.0.1:${server.address().port}/stylebook/app/`;
  if (shots) await mkdir(shots, { recursive: true });
  for (const width of [320, 375, 390, 430, 1180]) {
    await page.setViewport({ width, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.documentElement.dataset.ready);
    const r = await page.evaluate(() => {
      const doc = document.documentElement;
      const frames = [...document.querySelectorAll('.sbk-frame')];
      const controls = frames.flatMap(f => [...f.querySelectorAll('button,a,input,select,textarea')]).filter(el => el.getClientRects().length && el.type !== 'radio' && el.type !== 'checkbox');
      return {
        ready: doc.dataset.ready, appCss: (document.getElementById('app-css')?.textContent || '').length,
        btnMin: getComputedStyle(document.querySelector('#actions .sbk-frame .btn')).minHeight,
        passBg: getComputedStyle(document.querySelector('.sbk-frame .pass')).backgroundColor,
        overflow: doc.scrollWidth - doc.clientWidth,
        frameOverflow: frames.filter(f => f.scrollWidth > f.clientWidth + 1).map(f => f.getAttribute('aria-label')),
        small: controls.filter(el => { const b = el.getBoundingClientRect(); return b.height < 40 || b.width < 40; }).map(el => (el.className || el.tagName) + ':' + el.textContent.trim().slice(0, 12)),
        items: document.querySelectorAll('.sbk-item').length,
        // 文字對比：每個有直接文字的元素，和最近的不透明底色比，至少 3:1（抓「白字在白卡」這類繼承錯誤）
        lowContrast: (() => {
          const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
          const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
          const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 3 || c[3] > .5) return c; } return [251, 250, 246]; };
          const bad = [];
          for (const f of frames) for (const el of f.querySelectorAll('*')) {
            if (el.closest('svg') || !el.getClientRects().length) continue;
            if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
            const cs = getComputedStyle(el); if (+cs.opacity < .9 || el.closest('.off,.lock,[disabled],.way.line')) continue; // LINE 登入鈕依 LINE 官方規範白字綠底，不在此檢查
            const a = lum(rgb(cs.color)), b = lum(bgOf(el)), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
            if (ratio < 3) bad.push(`${el.className || el.tagName}「${el.textContent.trim().slice(0, 10)}」${ratio.toFixed(2)}`);
          }
          return bad;
        })(),
      };
    });
    assert.equal(r.ready, '1', 'App 樣式載入失敗');
    assert.ok(r.appCss > 10000, 'App CSS 太短：' + r.appCss);
    assert.equal(r.btnMin, '52px', '.btn 沒有套到 App 樣式');
    assert.equal(r.passBg, 'rgb(27, 26, 23)', '.pass 沒有套到 App 樣式');
    assert.ok(r.overflow <= 1, `${width}px 整頁橫向溢位 ${r.overflow}`);
    assert.deepEqual(r.frameOverflow, [], `${width}px 展示框內容溢位`);
    assert.deepEqual(r.small, [], `${width}px 觸控區過小`);
    assert.deepEqual(r.lowContrast, [], `${width}px 文字對比不足`);
    if (shots) await page.screenshot({ path: path.join(shots, `app-stylebook-${width}.png`), fullPage: true });
    console.log(`PASS ${width}px（${r.items} 個元件）`);
  }
  assert.deepEqual(errors, [], 'page errors');
} finally {
  await browser?.close();
  server.close();
}
