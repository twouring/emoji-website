// 2026-10 活動頁改版的使用者契約：月份分組＋日期塊列表、真實社會證明、分享列、事實區、手機底部 CTA、訂閱日曆。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/events.html', import.meta.url), 'utf8');
const code = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 只載入改版段落（T2 … setupCtaBar）加上它依賴的少數既有函式，避免整支腳本的 DOM 啟動流程。
function ctx(lang = 'zh', extra = {}) {
  const slice = code.slice(code.indexOf('/* ---- 2026-10 改版'), code.indexOf('const privateEventLabel='));
  const context = vm.createContext({
    lang, locale: lang === 'zh' ? 'zh-TW' : lang === 'ja' ? 'ja-JP' : 'en-US', base: lang === 'zh' ? '' : '/' + lang,
    esc, Intl, Date, Math, Number, Map, Set, encodeURIComponent, URLSearchParams,
    T: { public: { zh: '公開活動', en: 'Public event', ja: '公開イベント' }[lang], members: 'members', private: 'private', details: { zh: '查看詳情／報名', en: 'View details / register', ja: '詳細' }[lang], free: { zh: '免費', en: 'Free', ja: '無料' }[lang] },
    previewLabel: 'PREVIEW', externalEventLabel: 'EXTERNAL', privateEventLabel: 'PRIVATE', embedded: false,
    money: n => n > 0 ? 'NT$' + Number(n).toLocaleString('en-US') : { zh: '免費', en: 'Free', ja: '無料' }[lang],
    taxedPrice: (e, p) => p, eventPath: e => '/events/' + e.slug,
    inApp: e => (e.registration_mode || 'native') === 'native', appUrlFor: e => 'https://app.emoji.tw/e/' + e.slug,
    location: { origin: 'https://www.emoji.tw', host: 'www.emoji.tw' }, document: { getElementById: () => null, querySelector: () => null, addEventListener() {} }, navigator: {}, toast() {},
    ...extra,
  });
  vm.runInContext(slice, context);
  return context;
}

const soon = new Date(Date.now() + 3 * 86400000);
const iso = d => d.toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 16).replace(' ', 'T');
const baseEvent = { id: 'e1', slug: 'demo', title: 'Demo <Night>', description: 'Line one\nLine two', location: '言文字', status: '報名中', visibility: 'public', registration_mode: 'native', starts_at_iso: '2026-11-01T14:00', ends_at_iso: '2026-11-01T17:00', capacity: 0, reg_count: 0, tickets: [{ id: 't_default', name: '一般票', active: true, price_twd: 150 }], registration_settings: {}, event_details: {} };

test('list card: date block, month grouping key, clamped description, escaped title and lazy cover', () => {
  const c = ctx('zh');
  const html = c.eventCard({ ...baseEvent, event_details: { cover_url: 'https://cdn.example/c.jpg?x="1"' } });
  assert.match(html, /<div class="ev-date" aria-hidden="true"><b>1<\/b><span>週日<\/span>/);
  assert.match(html, /ev-desc ev-desc--clamp/);
  assert.match(html, /Demo &lt;Night&gt;/);
  assert.doesNotMatch(html, /<Night>/);
  assert.match(html, /<img src="https:\/\/cdn\.example\/c\.jpg\?x=&quot;1&quot;" alt="" loading="lazy"/);
  assert.match(html, /ev-pill ev-pill--open/);
  assert.equal(c.monthKey(baseEvent), '2026-11');
  assert.equal(c.monthLabel(baseEvent), '2026年11月');
  assert.equal(ctx('en').monthLabel(baseEvent), 'November 2026');
  assert.equal(ctx('ja').monthLabel(baseEvent), '2026年11月');
  assert.equal(c.monthKey({ ...baseEvent, starts_at_iso: null }), '9999', 'untimed events sort last');
  assert.match(html, /href="https:\/\/app\.emoji\.tw\/e\/demo"/, '官網列表卡片直接連 App 活動頁');
  const plain = c.eventCard(baseEvent);
  assert.match(plain, /ev-card--plain/);
  assert.doesNotMatch(plain, /ev-card__art/);
});

test('list card: external events link out with dashed pill and no social proof; private slots stay anonymous', () => {
  const c = ctx('en');
  const ext = c.eventCard({ ...baseEvent, registration_mode: 'external', registration_url: 'https://www.meetup.com/x', status: '預告', reg_count: 12, capacity: 20 });
  assert.match(ext, /href="https:\/\/www\.meetup\.com\/x" target="_blank" rel="noopener noreferrer"/);
  assert.match(ext, /ev-pill--ext/);
  assert.doesNotMatch(ext, /ev-proof/);
  assert.match(ext, /External registration/);
  const closed = c.eventCard({ ...baseEvent, registration_mode: 'closed', title: 'Secret' });
  assert.match(closed, /PRIVATE/);
  assert.doesNotMatch(closed, /Secret|<a /);
});

test('social proof uses only real numbers: count when > 0, remaining only when scarce, full or waitlist when sold out', () => {
  const c = ctx('zh');
  assert.equal(c.proof(baseEvent), '', 'no registrations → nothing');
  assert.match(c.proof({ ...baseEvent, reg_count: 25 }), /已報名 25 人/);
  assert.doesNotMatch(c.proof({ ...baseEvent, reg_count: 25 }), /ev-left/);
  assert.doesNotMatch(c.proof({ ...baseEvent, reg_count: 10, capacity: 120 }), /剩/, '110 left is not scarce');
  assert.match(c.proof({ ...baseEvent, reg_count: 17, capacity: 20 }), /剩 3 席/);
  assert.match(c.proof({ ...baseEvent, reg_count: 20, capacity: 20 }), /名額已滿/);
  assert.match(c.proof({ ...baseEvent, reg_count: 20, capacity: 20, registration_settings: { waitlist: true } }), /可候補/);
  assert.match(ctx('en').proof({ ...baseEvent, reg_count: 17, capacity: 20 }), /17 registered.*3 spots left/);
  assert.equal(c.proof({ ...baseEvent, registration_mode: 'external', reg_count: 9 }), '');
});

test('list price shows the lowest open ticket with 起/from and falls back to event price', () => {
  const c = ctx('zh');
  const past = new Date(Date.now() - 86400000).toISOString(), future = new Date(Date.now() + 86400000).toISOString();
  assert.equal(c.listPrice({ ...baseEvent, tickets: [{ active: true, price_twd: 700, closes_at: past }, { active: true, price_twd: 900 }] }), 'NT$900', 'closed early bird excluded');
  assert.equal(c.listPrice({ ...baseEvent, tickets: [{ active: true, price_twd: 500 }, { active: true, price_twd: 900 }] }), 'NT$500 起');
  assert.equal(ctx('en').listPrice({ ...baseEvent, tickets: [{ active: true, price_twd: 500 }, { active: true, price_twd: 900 }] }), 'NT$500 from');
  assert.equal(c.listPrice({ ...baseEvent, tickets: [{ active: true, price_twd: 900, opens_at: future }] }), 'NT$900', 'not-yet-open ticket still shows its own price (no event-level fallback)');
  assert.equal(c.listPrice({ ...baseEvent, tickets: [{ active: true, price_twd: 0 }] }), '免費');
  assert.equal(c.listPrice({ ...baseEvent, price_twd: 800, tickets: [{ active: true, price_twd: 0 }] }), '免費', 'event-level price_twd is ignored');
  assert.equal(c.listPrice({ ...baseEvent, status: '預告' }), 'PREVIEW');
});

test('closing hints only within seven days and only from real ticket or registration deadlines', () => {
  const c = ctx('zh');
  assert.equal(c.closingTicket(baseEvent), '');
  assert.match(c.closingTicket({ ...baseEvent, tickets: [{ active: true, name: '早鳥票', closes_at: soon.toISOString() }] }), /早鳥票 售至 \d+\/\d+/);
  assert.equal(c.closingTicket({ ...baseEvent, tickets: [{ active: true, name: '早鳥票', closes_at: new Date(Date.now() + 30 * 86400000).toISOString() }] }), '', 'a month away is not urgent');
  assert.match(c.closingTicket({ ...baseEvent, registration_settings: { closes_at: soon.toISOString() } }), /截止/);
});

test('facts block: date block + full date + calendar links, location with Google Maps, hidden/online variants', () => {
  const c = ctx('zh');
  const html = c.factsBlock(baseEvent);
  assert.match(html, /<div class="ev-fact"><div class="ev-date" aria-hidden="true"><b>1<\/b>/);
  assert.match(html, /2026年11月1日 星期日/);
  assert.match(html, /14:00 – 17:00 · 台北時間/);
  assert.match(html, /href="\/api\/events\/demo\/calendar\.ics\?lang=zh"/);
  assert.match(html, /calendar\/google\?lang=zh/);
  assert.match(html, /google\.com\/maps\/search\/\?api=1&query=%E8%A8%80%E6%96%87%E5%AD%97/);
  assert.match(c.factsBlock({ ...baseEvent, location: '', event_details: { hide_location: true } }), /報名後顯示地點/);
  assert.match(c.factsBlock({ ...baseEvent, location: '', event_details: { mode: 'online' } }), /線上活動/);
  assert.match(c.factsBlock({ ...baseEvent, starts_at_iso: null, ends_at_iso: null }), /時間待定/);
  assert.doesNotMatch(c.factsBlock({ ...baseEvent, status: '已取消' }), /calendar\/google/);
  assert.match(c.timeRange({ ...baseEvent, starts_at_iso: '2026-10-31T18:00', ends_at_iso: '2026-11-01T00:00' }), /18:00 – 11\/1 00:00/, 'cross-midnight shows the end date');
});

test('share bar: LINE, copy, Threads, Facebook with encoded URL and text; native share hidden until supported', () => {
  const c = ctx('zh');
  const html = c.shareBar({ ...baseEvent, title: 'A & B' });
  assert.match(html, /social-plugins\.line\.me\/lineit\/share\?url=https%3A%2F%2Fwww\.emoji\.tw%2Fevents%2Fdemo&text=A%20%26%20B/);
  assert.match(html, /threads\.net\/intent\/post\?text=A%20%26%20B[^"]*https%3A%2F%2Fwww\.emoji\.tw%2Fevents%2Fdemo/);
  assert.match(html, /facebook\.com\/sharer\/sharer\.php\?u=https%3A%2F%2Fwww\.emoji\.tw%2Fevents%2Fdemo/);
  assert.match(html, /id="ev-share-copy"/);
  assert.match(html, /id="ev-share-native" hidden/);
  assert.match(html, /data-text="A &amp; B · 11\/1（週日） 14:00 – 17:00 · 言文字"/);
  assert.equal((html.match(/target="_blank" rel="noopener"/g) || []).length, 3);
  assert.match(html, /id="ev-share-ig"/, 'Instagram story button');
});

test('Instagram share: 1080x1920 story card via Web Share files, download+copy fallback, no IG web-intent URL', () => {
  assert.match(source, /async function shareToInstagram\(bar\)/);
  assert.match(source, /c\.width=W;c\.height=H/);
  assert.match(source, /const W=1080,H=1920/);
  assert.match(source, /navigator\.canShare&&navigator\.canShare\(\{files:\[file\]\}\)/);
  assert.match(source, /a\.download=file\.name/);
  assert.match(source, /navigator\.clipboard\.writeText\(url\)/);
  assert.match(source, /bar\.dataset\.text|text:bar\.dataset\.text/);
  assert.equal((source.match(/igLabel:'/g) || []).length, 3, 'zh/en/ja copy');
  assert.equal((source.match(/igDone:'/g) || []).length, 3);
});

test('detail page renders facts + share for public events only and wires the bottom CTA', () => {
  assert.ok(source.indexOf('${factsBlock(e)}') > source.indexOf('<h1 class="ev-h1"'), 'facts right under the title');
  assert.match(source, /\$\{e\.visibility==='public'&&e\.registration_mode!=='closed'\?shareBar\(e\):''\}/);
  assert.match(source, /\$\{e\.registered\|\|e\.registration_id\?'':sideProof\(e\)\}/);
  assert.match(source, /bindShare\(\);setupCtaBar\(e\);/);
  assert.match(source, /<div class="ev-cta-bar" id="ev-cta-bar" hidden>/);
  assert.match(source, /<img class="ev-cover" src="\$\{esc\(e\.event_details\.cover_url\)\}" alt="" loading="eager" fetchpriority="high">/);
  assert.match(source, /@media\(max-width:760px\)\{\.ev-cta-bar:not\(\[hidden\]\)\{display:grid\}body\.has-cta-bar \.ev-main\{padding-bottom:120px\}\}/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
});

test('bottom CTA bar: shown for native/external open events, hidden when embedded or closed, labels follow price', () => {
  const run = (event, { embedded = false, hasRegister = true } = {}) => {
    const classes = new Set(), body = { classList: { toggle: (k, on) => on ? classes.add(k) : classes.delete(k) } };
    const bar = { hidden: true, classList: { add(k) { classes.add('bar:' + k); }, remove(k) { classes.delete('bar:' + k); }, toggle(k, on) { on ? classes.add('bar:' + k) : classes.delete('bar:' + k); } } };
    const texts = {}, el = id => ({ set textContent(v) { texts[id] = v; }, get textContent() { return texts[id]; }, onclick: null });
    const side = { scrollIntoView() {}, querySelector: () => null, offsetHeight: 600, classList: { toggle() {} } };
    const context = ctx('zh', {
      embedded,
      document: { body, getElementById: id => id === 'ev-cta-bar' ? bar : id === 'ev-register' ? null : id === 'ev-app-go' ? (hasRegister ? { href: 'https://app.emoji.tw/e/demo' } : null) : el(id), querySelector: s => s === '.ev-side' ? side : null, addEventListener() {} },
      IntersectionObserver: class { constructor(cb) { this.cb = cb; } observe() { this.cb([{ isIntersecting: false }]); } disconnect() {} },
      matchMedia: () => ({ matches: false }), innerHeight: 844, window: { open() {} },
    });
    context.setupCtaBar(event);
    return { hidden: bar.hidden, classes: [...classes], texts };
  };
  const paid = run(baseEvent);
  assert.equal(paid.hidden, false); assert.ok(paid.classes.includes('has-cta-bar')); assert.ok(paid.classes.includes('bar:is-visible'));
  assert.equal(paid.texts['ev-cta-price'], 'NT$150'); assert.equal(paid.texts['ev-cta-go'], '前往付款'); assert.match(paid.texts['ev-cta-note'], /11\/1（週日） 14:00 – 17:00/);
  assert.equal(run({ ...baseEvent, tickets: [{ active: true, price_twd: 0 }] }).texts['ev-cta-go'], '立即報名');
  assert.equal(run({ ...baseEvent, price_twd: 800, tickets: [{ active: true, price_twd: 0 }] }).texts['ev-cta-go'], '立即報名', 'event-level price_twd is ignored');
  const ext = run({ ...baseEvent, registration_mode: 'external', registration_url: 'https://x' }, { hasRegister: false });
  assert.equal(ext.hidden, false); assert.equal(ext.texts['ev-cta-go'], '前往報名 ↗');
  assert.equal(run(baseEvent, { embedded: true }).hidden, true, 'never inside an embed iframe');
  assert.equal(run({ ...baseEvent, status: '已結束' }, { hasRegister: false }).hidden, true, 'no register button → no bar');
  assert.equal(run({ ...baseEvent, registration_mode: 'closed' }, { hasRegister: false }).hidden, true);
});

test('calendar subscription menu offers Google, webcal and copy URL in the active language', () => {
  for (const lang of ['zh', 'en', 'ja']) {
    let html = '';
    const host = { set innerHTML(v) { html = v; }, replaceChildren() {} };
    const c = ctx(lang, { document: { getElementById: id => id === 'ev-hero-actions' ? host : { onclick: null }, addEventListener() {} } });
    c.renderHeroActions();
    assert.match(html, /calendar\.google\.com\/calendar\/r\?cid=webcal%3A%2F%2Fwww\.emoji\.tw%2Fapi%2Fevents%2Fcalendar\.ics%3Flang%3D/);
    assert.match(html, new RegExp(`href="webcal://www\\.emoji\\.tw/api/events/calendar\\.ics\\?lang=${lang}"`));
    assert.match(html, new RegExp(`data-url="https://www\\.emoji\\.tw/api/events/calendar\\.ics\\?lang=${lang}"`));
    assert.match(html, /instagram\.com\/emoji0701/);
  }
});

test('server registers the site-wide calendar feed before the per-event slug route and documents it', () => {
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const feed = server.indexOf("app.get('/api/events/calendar.ics'"), slug = server.indexOf("app.get(['/api/events/:slug/calendar.ics'");
  assert.ok(feed > 0 && slug > 0 && feed < slug, 'feed route must win over :slug');
  assert.match(server, /visibility='public' AND e\.registration_mode<>'closed'/);
  assert.match(fs.readFileSync(new URL('../docs/API.md', import.meta.url), 'utf8'), /### GET \/api\/events\/calendar\.ics/);
});

test('no sub-16px text in the redesigned styles', () => {
  const css = source.slice(source.indexOf('/* ---- 2026-10 改版'), source.indexOf('</style>'));
  for (const m of css.matchAll(/font-size:([^;}]+)/g)) {
    const v = m[1].trim();
    assert.ok(/^(\d*\.?\d+)rem$/.test(v) ? parseFloat(v) >= 1 : /clamp|max\(/.test(v) || v === 'inherit', `font-size ${v}`);
  }
});

test('已結束活動：列表卡片弱化（灰階、已結束標籤、不顯示價格與報名人數），CTA 改「查看活動」', () => {
  const c = ctx('zh');
  const html = c.eventCard({ ...baseEvent, status: '已結束', reg_count: 12, price_twd: 500 });
  assert.match(html, /ev-card--past/);
  assert.match(html, /ev-pill--past">已結束</);
  assert.match(html, /查看活動 →/);
  assert.doesNotMatch(html, /NT\$500/);
  assert.doesNotMatch(html, /已報名 12 人/);
  assert.match(source, /\.ev-card--past\{opacity:\.6;filter:grayscale\(1\)\}/);
  assert.match(source, /api\('\/events\?past=1&lang='\+lang\)/);
});
