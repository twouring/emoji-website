// 訂位頁截圖＋量測：node scripts/shot-reserve.mjs <outdir>
// 攔截 https://www.test/ 讀 public/；/api/reservations/slots 回假資料（11/8 公休、11/10 三點水不開），POST 回成功並記錄 body。
// 固定時間 2026-11-07 20:40（台北），印每張的溢出、選中目的、可訂日期、時段分組、送出 body。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.resolve(process.argv[2] || '/tmp/shot-reserve');
fs.mkdirSync(out, { recursive: true });
const CHROME = process.env.CHROME || '/workspace/local/.pw/chrome-linux/headless_shell';
const FIXED = Date.parse('2026-11-07T20:40:00+08:00');
const CAFE = []; for (let m = 480; m < 1020; m += 30) CAFE.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
const BAR = []; for (let m = 1020; m < 1440; m += 30) BAR.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
['00:00', '00:30', '01:00', '01:30', '02:00', '02:30'].forEach(t => BAR.push(t));
const slotsFor = d => d === '2026-11-08' ? [] : d === '2026-11-10' ? CAFE : [...CAFE, ...BAR];
const fontCss = fs.existsSync('/workspace/local/pos-preview-fonts') ? '' : '';
const posted = [];

async function run(width, lang, scenario) {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--single-process'] });
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(t => { const D = Date; const off = t - D.now(); globalThis.Date = class extends D { constructor(...a) { super(...(a.length ? a : [D.now() + off])); } static now() { return D.now() + off; } }; }, FIXED);
  await page.evaluateOnNewDocument(() => { try { sessionStorage.setItem('reserve_lang_auto', '1'); } catch {} });
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = new URL(req.url());
    if (!u.host.endsWith('www.test')) {
      if (/fonts\.(googleapis|gstatic)/.test(u.host)) return req.respond({ status: 200, contentType: 'text/css', body: '' });
      return req.abort();
    }
    if (u.pathname === '/api/reservations/slots') return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, slots: slotsFor(u.searchParams.get('date')) }) });
    if (u.pathname === '/api/reservations' && req.method() === 'POST') { posted.push(JSON.parse(req.postData())); return req.respond({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, request_id: '1107-08', hold_until: '01:10' }) }); }
    let f = u.pathname === '/reserve' ? 'reserve.html' : u.pathname === '/en/reserve' ? 'en/reserve.html' : u.pathname === '/ja/reserve' ? 'ja/reserve.html' : u.pathname.slice(1);
    const p = path.join(root, 'public', f);
    if (!fs.existsSync(p)) return req.respond({ status: 404, body: '' });
    const type = f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    req.respond({ status: 200, contentType: type, body: fs.readFileSync(p) });
  });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const url = 'https://www.test' + (lang === 'zh' ? '' : '/' + lang) + '/reserve' + (scenario.query || '');
  await page.goto(url, { waitUntil: 'networkidle0' });
  for (const step of scenario.steps || []) {
    await page.evaluate(s => { const i = document.querySelector(s); i.scrollIntoView({ block: 'center' }); i.click(); }, step);
    await new Promise(r => setTimeout(r, 120));
  }
  if (scenario.fill) {
    await page.type('input[name=name]', 'Alex'); await page.type('input[name=phone]', '0912345678'); await page.type('input[name=email]', 'a@b.co');
    await page.click('button[type=submit]'); await new Promise(r => setTimeout(r, 400));
  }
  const m = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    purpose: document.querySelector('input[name=purpose]:checked')?.value || '',
    info: document.getElementById('venueInfo')?.innerText,
    date: document.querySelector('input[name=date]').value,
    dates: [...document.querySelectorAll('input[name=date_pick]')].map(i => i.value.slice(5) + (i.disabled ? '✗' : '') + (i.checked ? '●' : '')).join(' '),
    groups: [...document.querySelectorAll('.slot-group')].map(g => g.querySelector('h3').innerText.replace(/\s+/g, ' ') + ':' + g.querySelectorAll('input').length).join(' | '),
    hints: [...document.querySelectorAll('#slotGroups .hint')].map(x => x.innerText).join(' / '),
    submit: document.querySelector('button[type=submit]')?.innerText,
    small: [...document.querySelectorAll('body *')].filter(e => e.childElementCount === 0 && e.innerText?.trim() && parseFloat(getComputedStyle(e).fontSize) < 16 && e.offsetParent).map(e => e.tagName + ':' + e.innerText.slice(0, 10)).slice(0, 5),
    done: getComputedStyle(document.getElementById('reserveDone')).display !== 'none' ? document.getElementById('reserveSummary').innerText.replace(/\n/g, ' ｜ ') : '',
  }));
  const name = `${scenario.id}-${lang}-${width}.png`;
  await page.screenshot({ path: path.join(out, name), fullPage: true });
  if (scenario.id === '2-drinks' && width === 390 && lang === 'zh') { await page.evaluate(() => document.getElementById('slotGroups').scrollIntoView({ block: 'start' })); await page.screenshot({ path: path.join(out, 'viewport-' + name) }); }
  await browser.close();
  console.log(name, JSON.stringify({ ...m, errors }));
}

const SC = [
  { id: '1-open' },
  { id: '2-drinks', steps: ['input[name=purpose][value=drinks]'] },
  { id: '3-coffee', steps: ['input[name=purpose][value=coffee]'] },
  { id: '4-late-submit', steps: ['input[name=purpose][value=drinks]', 'input[name=time][value="01:00"]', 'input[name=party_size][value="2"]'], fill: true },
  { id: '5-query', query: '?venue=3am&date=2026-11-10' },
];
const only = process.env.ONLY;
for (const s of SC) for (const [w, l] of [[390, 'zh'], [320, 'zh'], [1280, 'zh'], [390, 'en'], [390, 'ja']]) {
  if (only && !s.id.startsWith(only)) continue;
  if (s.id !== '1-open' && s.id !== '2-drinks' && l !== 'zh') continue;
  if (s.id !== '1-open' && w === 1280) continue;
  await run(w, l, s);
}
console.log('POSTED', JSON.stringify(posted));
