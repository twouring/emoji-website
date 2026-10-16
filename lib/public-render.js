'use strict';
/**
 * 官網公開內容伺服器端渲染（取代瀏覽器端 fetch('/api/public')）：
 * - renderHome：首頁公告、近期活動、最新消息 + 活動 ItemList JSON-LD
 * - renderSpace：空間文案（Markdown → 消毒 HTML）、CMS 圖片、在咖啡／三點水菜單 + 餐廳菜單 JSON-LD
 * - buildSitemap：靜態 sitemap 加上公開活動頁
 * 純函式，只吃 snapshot = { events, updates, content }（與 /api/public 同來源的原始列），無 DB 依賴。
 */
const sanitizeHtml = require('sanitize-html');
const marked = require('../public/vendor/marked.js');
require('../public/menu-lib.js');
const MenuLib = globalThis.MenuLib;
const { localizeEvent } = require('./events');
const { publicContent, publicEventCopy } = require('./public-copy');
const { resolveFloorMarkdown, resolveSpaceImage } = require('./space-content');

const SITE_ORIGIN = 'https://www.emoji.tw';
const ADDRESS = '台北市中正區重慶南路一段 11 號';
const ORG_NAME = '言文字・台灣人才聚落';
const PUBLIC_STATUS = ['預告', '報名中'];
const LANGS = ['zh', 'en', 'ja'];
const EMPTY_MENU = { zh: '目前尚未提供菜單資料。', en: 'Menu coming soon.', ja: 'メニュー準備中。' };
const TIME_TBD = { zh: '時間待定', en: 'Time TBD', ja: '日時未定' };
const META_SEP = { zh: '｜', en: ' · ', ja: '｜' };
const VENUE_SCHEMA = {
  CAFE: { type: 'CafeOrCoffeeShop', name: { zh: '在咖啡 at cafe', en: 'at cafe', ja: '在咖啡 at cafe' }, path: '/at-cafe' },
  BAR: { type: 'BarOrPub', name: { zh: '三點水 3AM', en: '3AM', ja: '三點水 3AM' }, path: '/3am' },
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const langOf = lang => (LANGS.includes(lang) ? lang : 'zh');
const baseOf = lang => (lang === 'zh' ? '' : '/' + lang);
const jsonLd = schema => `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`;
const injectHead = (html, schema) => (schema ? html.replace('</head>', `${jsonLd(schema)}\n</head>`) : html);

function normalizeSnapshot(snapshot) {
  const s = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return {
    events: Array.isArray(s.events) ? s.events : [],
    updates: Array.isArray(s.updates) ? s.updates : [],
    content: s.content && typeof s.content === 'object' ? s.content : {},
  };
}

/** 公開活動（預告／報名中、visibility=public），依語系在地化並套品牌文案 */
function publicEvents(events, lang) {
  return events
    .filter(e => e && e.visibility === 'public' && PUBLIC_STATUS.includes(e.status))
    .map(e => publicEventCopy(localizeEvent(e, lang)));
}

function eventUrl(event, lang) {
  return event.slug ? `${baseOf(lang)}/events/${encodeURIComponent(event.slug)}` : '';
}

/* ---------- Markdown → 消毒 HTML（允許圖片與基本排版，無 script／事件屬性） ---------- */
function markdownHtml(md) {
  const raw = String(md || '').trim();
  if (!raw) return '';
  return sanitizeHtml(marked.parse(raw), {
    allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'ul', 'ol', 'li', 'a', 'img', 'figure', 'figcaption', 'hr', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'width', 'height', 'loading'], ol: ['start'] },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowProtocolRelative: false,
    transformTags: {
      a: (tag, attrs) => ({ tagName: 'a', attribs: /^https?:\/\//.test(attrs.href || '') ? { ...attrs, target: '_blank', rel: 'noopener noreferrer' } : attrs }),
      img: (tag, attrs) => ({ tagName: 'img', attribs: { ...attrs, alt: String(attrs.alt || '').slice(0, 300), loading: 'lazy' } }),
    },
    exclusiveFilter: frame => frame.tag === 'img' && !frame.attribs.src,
  });
}

/* ---------- 首頁 ---------- */
function homeEventsHtml(events, lang) {
  return events.map(e => {
    const href = eventUrl(e, lang);
    const title = href ? `<a href="${esc(href)}" style="text-decoration:underline;text-underline-offset:3px">${esc(e.title)}</a>` : esc(e.title);
    const meta = esc(e.starts_at || TIME_TBD[lang]) + (e.location ? META_SEP[lang] + esc(e.location) : '');
    return '<div style="padding:12px 0;border-top:1px solid var(--line)">'
      + `<b style="font-weight:500">${title}</b>`
      + `<div style="color:var(--muted);font-size:1rem;margin-top:.2em">${meta}</div>`
      + (e.description ? `<p style="color:var(--ink-soft);font-size:1rem;margin-top:.35em">${esc(e.description)}</p>` : '')
      + '</div>';
  }).join('');
}

function homeUpdatesHtml(updates, lang) {
  return updates.map(u => '<div style="padding:12px 0;border-top:1px solid var(--line)">'
    + `<b style="font-weight:500">${esc(u.title)}</b>`
    + `<div style="color:var(--muted);font-size:1rem;margin-top:.2em">${esc(u.published_at)}${META_SEP[lang]}${esc(u.type)}</div>`
    + (u.content ? `<p style="color:var(--ink-soft);font-size:1rem;margin-top:.35em;white-space:pre-wrap">${esc(u.content)}</p>` : '')
    + '</div>').join('');
}

/** 近期公開活動 ItemList（活動頁本身另有完整 Event JSON-LD） */
function eventsJsonLd(events, lang) {
  if (!events.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: { zh: '近期活動', en: 'Upcoming events', ja: '近日のイベント' }[lang],
    itemListElement: events.map((e, i) => {
      const url = SITE_ORIGIN + (eventUrl(e, lang) || baseOf(lang) + '/events');
      const item = {
        '@type': 'Event',
        name: String(e.title || ''),
        url,
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        location: { '@type': 'Place', name: String(e.location || ORG_NAME), address: ADDRESS },
        organizer: { '@type': 'Organization', name: ORG_NAME, url: SITE_ORIGIN },
      };
      if (e.description) item.description = String(e.description).replace(/\s+/g, ' ').trim().slice(0, 300);
      if (e.starts_at_iso) item.startDate = `${e.starts_at_iso}:00+08:00`;
      if (e.ends_at_iso) item.endDate = `${e.ends_at_iso}:00+08:00`;
      if (Number(e.price_twd) > 0 && e.status === '報名中') item.offers = { '@type': 'Offer', price: Number(e.price_twd), priceCurrency: 'TWD', availability: 'https://schema.org/InStock', url };
      return { '@type': 'ListItem', position: i + 1, item };
    }),
  };
}

function renderHome(html, snapshot, lang) {
  lang = langOf(lang);
  const snap = normalizeSnapshot(snapshot);
  const content = publicContent(snap.content);
  const events = publicEvents(snap.events, lang);
  const updates = snap.updates.slice(0, 5);
  let out = String(html);
  const notice = String(content.home_notice || '').trim();
  if (notice) out = out.replace(/(<div id="site-notice")\s+hidden([^>]*>)<\/div>/, (_, open, rest) => `${open}${rest}${esc(notice)}</div>`);
  if (events.length) out = out
    .replace('<div id="news-events-list"></div>', `<div id="news-events-list">${homeEventsHtml(events, lang)}</div>`)
    .replace(/<div id="news-events"\s+hidden>/, '<div id="news-events">');
  if (updates.length) out = out
    .replace('<div id="news-updates-list"></div>', `<div id="news-updates-list">${homeUpdatesHtml(updates, lang)}</div>`)
    .replace(/<div id="news-updates"\s+hidden>/, '<div id="news-updates">');
  if (events.length || updates.length) out = out.replace(/<section id="news"\s+hidden/, '<section id="news"');
  return injectHead(out, eventsJsonLd(events, lang));
}

/* ---------- 空間／品牌頁 ---------- */
function menuItems(content) {
  if (!content.menu) return [];
  return MenuLib.sortItems(MenuLib.publishedOnly(MenuLib.parseMenuDoc(content.menu)));
}

function itemName(item, lang) {
  if (lang === 'en') return item.en || item.zh;
  if (lang === 'ja') return item.ja || item.zh;
  return item.zh;
}

/** 餐廳 + hasMenu（分類 MenuSection → MenuItem/Offer），只用已發布品項 */
function menuJsonLd(items, venue, lang) {
  const list = items.filter(it => it.venue === venue);
  const v = VENUE_SCHEMA[venue];
  if (!list.length || !v) return null;
  const sections = [];
  for (const it of list) {
    let sec = sections.find(s => s.cat === it.cat);
    if (!sec) { sec = { cat: it.cat, items: [] }; sections.push(sec); }
    sec.items.push(it);
  }
  const url = SITE_ORIGIN + baseOf(lang) + v.path;
  return {
    '@context': 'https://schema.org',
    '@type': v.type,
    name: v.name[lang],
    url,
    address: { '@type': 'PostalAddress', streetAddress: ADDRESS, addressLocality: '台北市', addressCountry: 'TW' },
    servesCuisine: venue === 'CAFE' ? ['Coffee', 'Japanese'] : ['Japanese', 'Izakaya'],
    priceRange: 'NT$',
    hasMenu: {
      '@type': 'Menu',
      name: { zh: '菜單', en: 'Menu', ja: 'メニュー' }[lang],
      inLanguage: lang === 'zh' ? 'zh-Hant' : lang,
      hasMenuSection: sections.map(sec => {
        const label = MenuLib.CAT_LABEL[sec.cat] || { zh: sec.cat, en: sec.cat, ja: sec.cat };
        return {
          '@type': 'MenuSection',
          name: label[lang] || label.zh,
          hasMenuItem: sec.items.map(it => {
            const note = lang === 'ja' && it.note_ja ? it.note_ja : it.note;
            const mi = { '@type': 'MenuItem', name: itemName(it, lang) };
            if (note) mi.description = note;
            if (it.image) mi.image = /^https?:\/\//.test(it.image) ? it.image : SITE_ORIGIN + it.image;
            if (!it.custom_price && Number(it.price) >= 0) mi.offers = { '@type': 'Offer', price: Number(it.price), priceCurrency: 'TWD' };
            return mi;
          }),
        };
      }),
    },
  };
}

function swapImage(html, selectorAttr, url, { clearCaption = false } = {}) {
  if (!url) return html;
  const re = new RegExp(`(<figure[^>]*${selectorAttr}[^>]*>\\s*)<img\\b([^>]*)>(\\s*<figcaption>[\\s\\S]*?</figcaption>)?`);
  return html.replace(re, (m, open, attrs, caption) => {
    const next = attrs
      .replace(/\s+src="[^"]*"/, ` src="${esc(url)}"`)
      .replace(/\s+width="[^"]*"/, '')
      .replace(/\s+height="[^"]*"/, '');
    const cap = caption ? (clearCaption ? caption.replace(/<figcaption>[\s\S]*?<\/figcaption>/, '<figcaption></figcaption>') : caption) : '';
    return `${open}<img${next}>${cap}`;
  });
}

/**
 * @param {string} html 已組裝 header／footer 的頁面
 * @param {object|null} snapshot { events, updates, content }
 * @param {'zh'|'en'|'ja'} lang
 * @param {'space'|'at-cafe'|'3am'|'stay-square'} [page] 決定附加哪一家的菜單 JSON-LD
 */
function renderSpace(html, snapshot, lang, page) {
  lang = langOf(lang);
  const snap = normalizeSnapshot(snapshot);
  const content = publicContent(snap.content);
  let out = String(html);
  out = swapImage(out, 'id="media-hero"', resolveSpaceImage(content, 'hero'), { clearCaption: true });
  for (const f of [1, 2, 3, 4]) {
    const body = markdownHtml(resolveFloorMarkdown(content, f, lang));
    out = out.replace(new RegExp(`<div class="md-content" data-md="${f}"></div>`), body
      ? `<div class="md-content" data-md="${f}">${body}</div>`
      : `<div class="md-content" data-md="${f}" hidden></div>`);
    out = swapImage(out, `data-image="${f}"`, resolveSpaceImage(content, f));
  }
  const items = menuItems(content);
  for (const venue of ['CAFE', 'BAR']) {
    const menu = MenuLib.renderMenuHtml(items.filter(it => it.venue === venue), lang, EMPTY_MENU[lang]);
    out = out.split(`<div data-menu="${venue}"></div>`).join(`<div data-menu="${venue}">${menu}</div>`);
  }
  const schemaVenue = page === 'at-cafe' ? 'CAFE' : page === '3am' ? 'BAR' : null;
  return injectHead(out, schemaVenue ? menuJsonLd(items, schemaVenue, lang) : null);
}

/* ---------- sitemap ---------- */
function taipeiToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function buildSitemap(staticXml, events, today = taipeiToday()) {
  const xml = String(staticXml || '');
  const slugs = (Array.isArray(events) ? events : [])
    .filter(e => e && e.slug && e.visibility === 'public' && PUBLIC_STATUS.includes(e.status))
    .map(e => encodeURIComponent(e.slug));
  const seen = new Set();
  const entries = [];
  for (const slug of slugs) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    for (const pre of ['', '/en', '/ja']) {
      const loc = `${SITE_ORIGIN}${pre}/events/${slug}`;
      if (xml.includes(`<loc>${loc}</loc>`)) continue;
      entries.push(`  <url>\n    <loc>${esc(loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>`);
    }
  }
  if (!entries.length || !xml.includes('</urlset>')) return xml;
  return xml.replace('</urlset>', `${entries.join('\n')}\n</urlset>`);
}

module.exports = { renderHome, renderSpace, markdownHtml, menuJsonLd, eventsJsonLd, buildSitemap, taipeiToday, EMPTY_MENU, publicEvents };
