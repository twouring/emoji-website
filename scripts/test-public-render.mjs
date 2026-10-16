// 官網公開內容伺服器端渲染（lib/public-render.js）：首頁消息／活動、空間文案、菜單、JSON-LD、動態 sitemap；
// 頁面不再抓 /api/public；HTTP 層以隔離的 server.js（pg／stripe 替身）驗證 gzip 與快取標頭。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { gunzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const R = require('../lib/public-render');

const EVENT = {
  id: 'e1', slug: 'ai-night', title: '生成式 AI 之夜', description: '一起聊聊 <b>AI</b>', location: '等等空間',
  translations: { en: { title: 'Generative AI Night', description: 'An evening on AI' }, ja: { title: '生成AIナイト' } },
  starts_at: '2026/11/20 19:00', starts_at_iso: '2026-11-20T19:00', ends_at_iso: '2026-11-20T21:00',
  price_twd: 300, status: '報名中', visibility: 'public',
};
const DRAFTISH = { ...EVENT, id: 'e2', slug: 'ended', title: '已結束', status: '已結束' };
const PRIVATE = { ...EVENT, id: 'e3', slug: 'secret', title: '私人', visibility: 'private' };
const MENU = JSON.stringify({ version: 1, items: [
  { id: 'm1', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', en: 'Latte', ja: 'ラテ', price: 150, emo: 120, note: '雙份濃縮', published: true },
  { id: 'm2', venue: 'BAR', cat: 'SAKE', zh: '純米吟釀', en: 'Junmai Ginjo', price: 280, published: true, alcohol: true },
  { id: 'm3', venue: 'CAFE', cat: 'DESSERT', zh: '未發布布丁', price: 90, published: false },
] });
const SNAP = {
  events: [EVENT, DRAFTISH, PRIVATE],
  updates: [{ id: 1, title: '開幕倒數', content: '11/1 見\n第二行', type: '公告', published_at: '2026/10/10' }],
  content: {
    home_notice: '創始名額 <倒數>',
    space_1f_zh: '# 在咖啡\n\n<img src=x onerror=alert(1)>\n\n![外觀](https://cdn.example/a.jpg)\n\n- 約 25 坪',
    space_1f_en: 'Coffee by day.',
    space_hero_image: 'https://cdn.example/hero.jpg',
    space_2f_image: '/uploads/space/2.webp',
    menu: MENU,
  },
};

test('renderHome：公告、活動（連到活動頁）、消息填入並解除 hidden；全部跳脫；活動 ItemList JSON-LD', () => {
  const html = R.renderHome(read('public/index.html'), SNAP, 'zh');
  assert.match(html, /<div id="site-notice" style="[^"]*">創始名額 &lt;倒數&gt;<\/div>/);
  assert.match(html, /<section id="news" style=/);
  assert.match(html, /<div id="news-events">/);
  assert.match(html, /<a href="\/events\/ai-night"[^>]*>生成式 AI 之夜<\/a>/);
  assert.match(html, /2026\/11\/20 19:00｜等等空間/);
  assert.match(html, /一起聊聊 &lt;b&gt;AI&lt;\/b&gt;/);
  assert.doesNotMatch(html, /已結束|私人/, '非公開／非進行中活動不出現');
  assert.match(html, /<div id="news-updates">/);
  assert.match(html, /開幕倒數[\s\S]*2026\/10\/10｜公告[\s\S]*white-space:pre-wrap">11\/1 見\n第二行/);
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const list = ld.find(s => s['@type'] === 'ItemList');
  assert.equal(list.itemListElement.length, 1);
  const ev = list.itemListElement[0].item;
  assert.equal(ev['@type'], 'Event'); assert.equal(ev.name, '生成式 AI 之夜');
  assert.equal(ev.startDate, '2026-11-20T19:00:00+08:00'); assert.equal(ev.url, 'https://www.emoji.tw/events/ai-night');
  assert.equal(ev.location.address, '台北市中正區重慶南路一段 11 號');
  assert.deepEqual(ev.offers, { '@type': 'Offer', price: 300, priceCurrency: 'TWD', availability: 'https://schema.org/InStock', url: 'https://www.emoji.tw/events/ai-night' });
  assert.doesNotMatch(html, /<!--FEATURED_EVENT-->[\s\S]*<!--FEATURED_EVENT-->/);
});

test('renderHome：en／ja 用翻譯並連到語系活動頁；空快照時區塊維持 hidden、不注入 JSON-LD', () => {
  const en = R.renderHome(read('public/en/index.html'), SNAP, 'en');
  assert.match(en, /<a href="\/en\/events\/ai-night"[^>]*>Generative AI Night<\/a>/);
  assert.match(en, /2026\/11\/20 19:00 · 等等空間/);
  const ja = R.renderHome(read('public/ja/index.html'), SNAP, 'ja');
  assert.match(ja, /<a href="\/ja\/events\/ai-night"[^>]*>生成AIナイト<\/a>/);
  for (const snap of [null, {}, { events: [], updates: [], content: {} }]) {
    const html = R.renderHome(read('public/index.html'), snap, 'zh');
    assert.match(html, /<section id="news" hidden/); assert.match(html, /<div id="site-notice" hidden/);
    assert.doesNotMatch(html, /ItemList/);
  }
});

test('renderSpace：Markdown 消毒（onerror 移除、圖片保留）、CMS 圖片覆蓋、無文案區塊 hidden、三語菜單', () => {
  const zh = R.renderSpace(read('public/space.html'), SNAP, 'zh', 'space');
  const md1 = zh.match(/<div class="md-content" data-md="1">([\s\S]*?)<\/div>/)[1];
  assert.match(md1, /<h1>在咖啡<\/h1>/); assert.match(md1, /<li>約 25 坪<\/li>/);
  assert.doesNotMatch(md1, /onerror|alert/);
  assert.match(md1, /<img src="https:\/\/cdn\.example\/a\.jpg" alt="外觀" loading="lazy"/);
  assert.match(zh, /<div class="md-content" data-md="3" hidden><\/div>/);
  assert.match(zh, /<figure class="hero-media" id="media-hero">\s*<img src="https:\/\/cdn\.example\/hero\.jpg"(?![^>]*width=)[^>]*>\s*<figcaption><\/figcaption>/);
  assert.match(zh, /data-image="2"><img src="\/uploads\/space\/2\.webp"(?![^>]*width=)[^>]*>\s*<figcaption>等等空間/);
  assert.match(zh, /data-image="3"><img src="\/assets\/space\/3f-concept\.jpg" [^>]*width="1400"/);
  const cafe = zh.match(/<div data-menu="CAFE">([\s\S]*?)<div data-menu="BAR">/)[1];
  assert.match(cafe, /menu-venue__title">在咖啡/); assert.match(cafe, /拿鐵/); assert.match(cafe, /聚落價 NT\$120/); assert.match(cafe, /雙份濃縮/);
  assert.doesNotMatch(cafe, /未發布布丁|純米吟釀/);
  const bar = zh.match(/<div data-menu="BAR">([\s\S]*?)<\/section>\s*<section class="space-brand" id="stay">/)[1];
  assert.match(bar, /純米吟釀/); assert.match(bar, /未滿十八歲禁止飲酒/);
  assert.doesNotMatch(zh, /CafeOrCoffeeShop|BarOrPub/, 'space 總覽頁不附餐廳 JSON-LD');

  const en = R.renderSpace(read('public/en/space.html'), SNAP, 'en', 'space');
  assert.match(en, /<div class="md-content" data-md="1"><p>Coffee by day\.<\/p>\n<\/div>/);
  assert.match(en, /Hub rate NT\$120/); assert.match(en, /Latte/);
  const ja = R.renderSpace(read('public/ja/space.html'), SNAP, 'ja', 'space');
  assert.match(ja, /<div class="md-content" data-md="1" hidden><\/div>/, 'ja 無文案且不退回 zh');
  assert.match(ja, /ラテ/); assert.match(ja, /ハブ価格 NT\$120/);
  for (const [lang, file] of [['zh', 'public/space.html'], ['en', 'public/en/space.html'], ['ja', 'public/ja/space.html']]) {
    const empty = R.renderSpace(read(file), null, lang, 'space');
    assert.match(empty, new RegExp(`<div data-menu="CAFE"><p class="menu-empty">${R.EMPTY_MENU[lang]}</p></div>`));
    assert.doesNotMatch(empty, /ld\+json">\{"@context":"https:\/\/schema.org","@type":"(?:CafeOrCoffeeShop|BarOrPub)/);
  }
});

test('菜單 JSON-LD：at-cafe → CafeOrCoffeeShop、3am → BarOrPub，hasMenu 依分類分段、只含已發布品項與 TWD 價格', () => {
  const cafe = R.renderSpace(read('public/at-cafe.html'), SNAP, 'zh', 'at-cafe');
  const ld = [...cafe.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const shop = ld.find(s => s['@type'] === 'CafeOrCoffeeShop');
  assert.equal(shop.url, 'https://www.emoji.tw/at-cafe');
  assert.equal(shop.hasMenu.hasMenuSection.length, 1);
  assert.equal(shop.hasMenu.hasMenuSection[0].name, '咖啡');
  assert.deepEqual(shop.hasMenu.hasMenuSection[0].hasMenuItem, [{ '@type': 'MenuItem', name: '拿鐵', description: '雙份濃縮', offers: { '@type': 'Offer', price: 150, priceCurrency: 'TWD' } }]);
  const bar = R.renderSpace(read('public/en/3am.html'), SNAP, 'en', '3am');
  const barLd = JSON.parse(bar.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"BarOrPub"[\s\S]*?)<\/script>/)[1]);
  assert.equal(barLd.url, 'https://www.emoji.tw/en/3am');
  assert.equal(barLd.hasMenu.hasMenuSection[0].name, 'Sake');
  assert.equal(barLd.hasMenu.hasMenuSection[0].hasMenuItem[0].name, 'Junmai Ginjo');
  assert.doesNotMatch(bar, /CafeOrCoffeeShop/);
  // JSON-LD 內的 < 跳脫為 \u003c，品項備註不可提早關閉 <script>
  const evil = { ...SNAP, content: { ...SNAP.content, menu: JSON.stringify({ items: [{ id: 'x', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price: 1, published: true, note: '</script><script>alert(1)' }] }) } };
  const evilHtml = R.renderSpace(read('public/at-cafe.html'), evil, 'zh', 'at-cafe');
  assert.match(evilHtml, /"description":"\\u003c\/script>\\u003cscript>alert\(1\)"/);
  assert.doesNotMatch(evilHtml, /<\/script><script>alert\(1\)/);
});

test('buildSitemap：靜態清單後附公開活動三語網址，lastmod 為台北當天；無活動時原樣回傳', () => {
  const xml = read('public/sitemap.xml');
  const out = R.buildSitemap(xml, SNAP.events, '2026-10-16');
  assert.ok(out.startsWith(xml.slice(0, 200)));
  for (const pre of ['', '/en', '/ja']) assert.match(out, new RegExp(`<loc>https://www\\.emoji\\.tw${pre}/events/ai-night</loc>\\s*<lastmod>2026-10-16</lastmod>`));
  assert.doesNotMatch(out, /events\/ended|events\/secret/);
  assert.equal((out.match(/<\/urlset>/g) || []).length, 1);
  assert.equal(R.buildSitemap(xml, [], '2026-10-16'), xml);
  assert.equal(R.buildSitemap(xml, null, '2026-10-16'), xml);
  assert.match(R.taipeiToday(new Date('2026-10-16T17:30:00Z')), /^2026-10-17$/);
});

test('15 個公開頁不再抓 /api/public，也不載瀏覽器端 marked／DOMPurify／menu-lib', () => {
  for (const pre of ['', 'en/', 'ja/']) {
    for (const page of ['index', 'space', 'at-cafe', '3am', 'stay-square']) {
      const html = read(`public/${pre}${page}.html`);
      assert.doesNotMatch(html, /fetch\('\/api\/public'\)|\/vendor\/marked\.js|\/vendor\/purify\.min\.js|<script src="\/menu-lib\.js">/, `${pre}${page}.html`);
      if (page === 'index') assert.match(html, /<div id="news-events-list"><\/div>[\s\S]*<div id="news-updates-list"><\/div>/);
      else if (page === 'stay-square') assert.match(html, /<div class="md-content" data-md="[2-4]"><\/div>/);
      else assert.match(html, /<div data-menu="(?:CAFE|BAR)"><\/div>/);
    }
  }
  const server = read('server.js');
  assert.match(server, /app\.use\(compression\(\)\)/);
  assert.match(server, /publicRender\.renderHome\(html, snapshot/);
  assert.match(server, /publicRender\.renderSpace\(html, snapshot/);
  assert.match(server, /app\.get\('\/sitemap\.xml'/);
  assert.match(server, /"compression": "\^1\.8\.2"/.test(read('package.json')) ? /compression/ : /NEVER/, 'package.json 需列 compression 依賴');
});

// ---- HTTP：隔離 server.js（無真 DB、無外網）----
async function server(t) {
  const rows = { events: [EVENT], updates: SNAP.updates, content: Object.entries(SNAP.content).map(([key, value]) => ({ key, value })) };
  const run = async (sql) => {
    if (/FROM events e WHERE status IN/.test(sql)) return { rows: rows.events, rowCount: 1 };
    if (/FROM updates ORDER BY/.test(sql)) return { rows: rows.updates, rowCount: 1 };
    if (/FROM site_content WHERE key = ANY/.test(sql)) return { rows: rows.content, rowCount: rows.content.length };
    return { rows: [], rowCount: 0 };
  };
  const localRequire = name => {
    if (name === 'pg') return { Pool: class { query = run; async connect() { return { query: run, release() {} }; } } };
    if (name === 'stripe') return class { constructor() { return {}; } };
    return createRequire(path.join(root, 'server.js'))(name);
  };
  const module = { exports: {} };
  const context = vm.createContext({ require: localRequire, module, __dirname: root,
    process: { env: { NODE_ENV: 'test', APP_SECRET: 'local-test-secret-not-used-in-production', DATABASE_URL: 'unused', STRIPE_SECRET_KEY: 'stub', STRIPE_WEBHOOK_SECRET: 'stub',
      GOOGLE_CLIENT_ID: 'stub', PUBLIC_ORIGIN: 'https://www.emoji.tw', ACCESS_QR_SECRET: 'x', ACCESS_DOOR_SECRET: 'x' } },
    Buffer, URL, URLSearchParams, AbortSignal, Date, setTimeout,
    fetch: () => { throw new Error('External network forbidden in test'); },
    console: { log() {}, warn() {}, error() {} },
  });
  new vm.Script(read('server.js') + '\ndbReady = true;').runInContext(context);
  const http = module.exports.app.listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => new Promise(resolve => { http.close(resolve); http.closeAllConnections(); }));
  const base = `http://127.0.0.1:${http.address().port}`;
  return (url, headers = {}) => new Promise((resolve, reject) => {
    const req = httpRequest(base + url, { headers: { host: 'www.emoji.tw', ...headers } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => { const buf = Buffer.concat(chunks); resolve({ status: res.statusCode, raw: buf, body: (res.headers['content-encoding'] === 'gzip' ? gunzipSync(buf) : buf).toString('utf8'), headers: { get: k => res.headers[k.toLowerCase()] ?? null } }); });
    });
    req.on('error', reject); req.end();
  });
}

test('HTTP：首頁與空間頁 200、gzip、public max-age=60；內容已伺服器端渲染且無 layout 標記；utm_source 維持 no-store', async t => {
  const get = await server(t);
  for (const url of ['/', '/en/', '/ja', '/space', '/en/at-cafe', '/ja/3am', '/stay-square']) {
    const res = await get(url, { 'accept-encoding': 'gzip' });
    assert.equal(res.status, 200, url);
    assert.equal(res.headers.get('content-encoding'), 'gzip', url);
    assert.match(res.headers.get('cache-control'), /public, max-age=60, stale-while-revalidate=600/, url);
    assert.doesNotMatch(res.body, /<!--SITE_HEADER-->|<!--SITE_FOOTER-->|fetch\('\/api\/public'\)/, url);
    assert.match(res.body, /site-nav/, url);
  }
  const home = await get('/');
  assert.equal(home.headers.get('content-encoding'), null, '未要求壓縮時原文回傳');
  assert.match(home.body, /<a href="\/events\/ai-night"[^>]*>生成式 AI 之夜<\/a>/);
  assert.match(home.body, /創始名額 &lt;倒數&gt;/);
  assert.match(home.body, /"@type":"ItemList"/);
  const cafe = await get('/en/at-cafe');
  assert.match(cafe.body, /Latte/); assert.match(cafe.body, /"@type":"CafeOrCoffeeShop"/);
  const utm = await get('/?utm_source=ig', { 'accept-encoding': 'gzip' });
  assert.equal(utm.status, 200); assert.equal(utm.headers.get('cache-control'), 'no-store');
  assert.match(utm.headers.get('set-cookie')?.[0] || '', /^src=ig/);
  const events = await get('/events');
  assert.match(events.headers.get('cache-control'), /max-age=60/);
  const api = await get('/api/public');
  assert.equal(api.headers.get('cache-control'), 'no-store');
});

test('HTTP：動態 sitemap 含活動頁、application/xml、快取一小時；靜態資產依類型快取並保留 ETag', async t => {
  const get = await server(t);
  const sm = await get('/sitemap.xml');
  assert.equal(sm.status, 200);
  assert.match(sm.headers.get('content-type'), /^application\/xml/);
  assert.equal(sm.headers.get('cache-control'), 'public, max-age=3600');
  assert.match(sm.body, /<loc>https:\/\/www\.emoji\.tw\/ja\/events\/ai-night<\/loc>/);
  assert.match(sm.body, /<loc>https:\/\/www\.emoji\.tw\/space<\/loc>/);
  const css = await get('/style.css', { 'accept-encoding': 'gzip' });
  assert.equal(css.status, 200); assert.equal(css.headers.get('cache-control'), 'public, max-age=600');
  assert.equal(css.headers.get('content-encoding'), 'gzip'); assert.ok(css.headers.get('etag'));
  const img = await get('/favicon.svg');
  assert.equal(img.status, 200); assert.equal(img.headers.get('cache-control'), 'public, max-age=86400');
  const vendor = await get('/vendor/qrcode.min.js');
  assert.equal(vendor.status, 200); assert.equal(vendor.headers.get('cache-control'), 'public, max-age=86400');
});
