// 高管總覽截圖與量測：本機起靜態 server 讀 public/，/api/state 與 /api/admin/exec 回快照（不碰 DB）
// node scripts/shot-admin-exec.mjs <輸出目錄> <state.json> <exec.json>
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');
const [out, statePath, execPath] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const PUB = new URL('../public/', import.meta.url).pathname;
const state = JSON.parse(fs.readFileSync(statePath, 'utf8')), exec = JSON.parse(fs.readFileSync(execPath, 'utf8'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/api/state') return json(state);
  if (u.pathname === '/api/admin/exec') return json(exec);
  if (u.pathname.startsWith('/api/')) return json({ rows: [], orders: [], registers: [], current: {}, applications: [], posts: [] });
  let f = u.pathname.startsWith('/admin') ? 'admin.html' : decodeURIComponent(u.pathname.slice(1));
  const file = path.join(PUB, f);
  if (!file.startsWith(PUB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
const report = [];
try {
  for (const [w, h, mobile, name, route] of [[390, 844, true, '390', '/admin'], [320, 640, true, '320', '/admin'], [1280, 900, false, '1280', '/admin'], [390, 844, true, '390-more', '/admin'], [390, 844, true, '390-oldurl', '/admin/cafe/sales']]) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
    await page.setRequestInterception(true);
    page.on('request', r => /fonts\.(googleapis|gstatic)/.test(r.url()) ? r.abort() : r.continue());
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.evaluateOnNewDocument(() => localStorage.setItem('tth_token', 'x.eyJleHAiOjk5OTk5OTk5OTl9.x'));
    await page.goto(base + route, { waitUntil: 'networkidle0' });
    await page.waitForSelector(route === '/admin' ? '.ex-sum' : '[data-panel="sales"].on', { timeout: 10000 });
    if (name === '390-more') { await page.click('[data-more]'); await new Promise(r => setTimeout(r, 200)); }
    const m = await page.evaluate(() => {
      const de = document.documentElement, dock = document.querySelector('.a-dock'), r = dock?.getBoundingClientRect();
      const small = [...document.querySelectorAll('a.ex-issue,.a-dock button,[data-exec-reload]')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 44).length;
      const over = [...document.querySelectorAll('.ex-issue,.ex-brand,.ex-sum>div')].filter(e => e.getBoundingClientRect().right > innerWidth + 0.5).length;
      return { path: location.pathname, overflowX: de.scrollWidth - de.clientWidth, dockVisible: !!(dock && getComputedStyle(dock).display !== 'none'), dockBottom: r ? Math.round(innerHeight - r.bottom) : null,
        workspaceSwitch: !!document.querySelector('[data-scope],#a-workspaces'), issues: document.querySelectorAll('.ex-issue').length, brands: [...document.querySelectorAll('.ex-brand h3')].map(e => e.textContent),
        dot: document.querySelector('[data-exec-dot]')?.hidden === false ? document.querySelector('[data-exec-dot]').textContent : null, navOpen: document.querySelector('#a-nav')?.classList.contains('open'), small, over };
    });
    report.push({ name, ...m, errors });
    await page.screenshot({ path: path.join(out, `admin-exec-${name}.png`), fullPage: !name.includes('more') });
    await page.close();
  }
} finally { await browser.close(); srv.close(); }
console.log(JSON.stringify(report, null, 1));
