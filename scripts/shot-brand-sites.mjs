// 子品牌站本機截圖：用正式站 /api/public 快照跑 renderSpace，攔截請求回 public/，不碰 DB。
// node scripts/shot-brand-sites.mjs <public.json> <out-dir>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const puppeteer = require('puppeteer');
const { composeLayout } = require(path.join(ROOT, 'lib/layout.js'));
const { renderSpace } = require(path.join(ROOT, 'lib/public-render.js'));
const [snapFile, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const snap = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
const snapshot = { events: [], updates: [], content: snap.content };
const PUB = path.join(ROOT, 'public');
const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
const FONT_DIR = '/workspace/local/fonts';
const fontFiles = fs.existsSync(FONT_DIR) ? fs.readdirSync(FONT_DIR) : [];
const local = name => fontFiles.find(f => f.toLowerCase().includes(name));
const browser = await puppeteer.launch({ executablePath: '/workspace/local/brand-chrome/chrome-linux64/chrome', args: ['--no-sandbox'] });
const report = [];
for (const slug of ['at-cafe', '3am', 'stay-square']) {
  const html = renderSpace(composeLayout(fs.readFileSync(path.join(PUB, 'brand-sites', slug + '.html'), 'utf8'), '/' + slug), snapshot, 'zh', slug);
  fs.writeFileSync(path.join(out, slug + '.rendered.html'), html);
  for (const [w, h] of [[1280, 900], [390, 844], [320, 700]]) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, isMobile: w < 500, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on('request', r => {
      const u = new URL(r.url());
      if (u.hostname === 'brand.test') {
        if (u.pathname === '/') return r.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
        const f = path.join(PUB, decodeURIComponent(u.pathname));
        if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.respond({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
        return r.respond({ status: 404, body: '' });
      }
      if (u.hostname === 'www.emoji.tw' && u.pathname.startsWith('/ig-media/')) return r.continue();
      if (u.hostname.includes('google.com')) return r.respond({ status: 200, contentType: 'text/html', body: '<body style="background:#e8e4da"></body>' });
      return r.continue();
    });
    await page.goto('https://brand.test/', { waitUntil: 'networkidle2', timeout: 60000 }).catch(e => console.error(slug, w, e.message));
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; const u = i.src; i.src = ''; i.src = u; }));
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } scrollTo(0, 0); });
    await page.evaluate(async () => { await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 20000); }))); });
    const m = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      menuItems: document.querySelectorAll('.menu-item').length,
      yellow: [...document.querySelectorAll('*')].filter(e => /255, 222, 52/.test(getComputedStyle(e).backgroundColor + getComputedStyle(e).color)).length,
      brokenImg: [...document.querySelectorAll('img')].filter(i => i.naturalWidth === 0).map(i => i.src).slice(0, 8),
      imgs: document.images.length,
      sisters: [...document.querySelectorAll('.bs-sisters img')].map(i => Math.round(i.getBoundingClientRect().height)).join('/'),
      headLogo: Math.round(document.querySelector('.bs-head__logo img').getBoundingClientRect().height),
      footLink: getComputedStyle(document.querySelector('.bs-foot ul a')).color,
      small: [...document.querySelectorAll('body *')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.tagName + '.' + e.className).slice(0, 5),
      smallTargets: [...document.querySelectorAll('.bs-btn')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 44).length,
    }));
    report.push({ slug, w, ...m });
    await page.screenshot({ path: path.join(out, `${slug}-${w}.png`), fullPage: w !== 1280 ? false : false });
    await page.screenshot({ path: path.join(out, `${slug}-${w}-full.png`), fullPage: true });
    await page.close();
  }
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
