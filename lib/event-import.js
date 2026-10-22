'use strict';
/* 從其他活動平台匯入（規格 4.5）：伺服器抓活動頁，依序讀 schema.org Event JSON-LD → Open Graph → <title>。
 * 只做一次性複製，不下載圖片（回傳 image_url 讓前端預覽）。
 * SSRF 防護：只允許 https、預設埠；DNS 解析後擋私網／loopback／link-local／metadata 與 IPv6 私網；
 * 連線時把已驗證的 IP 釘進 lookup（避免 DNS rebinding）；轉址手動處理最多 3 次、每次重新檢查；5 秒逾時、2MB 上限。 */
const net = require('node:net');
const dns = require('node:dns');

const MAX_BYTES = 2 * 1024 * 1024, TIMEOUT_MS = 5000, MAX_REDIRECTS = 3;

class ImportError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// 不可連線的位址：私網、loopback、link-local（含 169.254.169.254 metadata）、CGNAT、文件保留段、多播、IPv6 ULA／link-local
const BLOCK = new net.BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4]]) BLOCK.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8], ['2001:db8::', 32], ['100::', 64], ['2001::', 32], ['2002::', 16]])
  BLOCK.addSubnet(a, p, 'ipv6');

/** IP 字串是否屬於不可連線範圍；IPv4-mapped（::ffff:a.b.c.d）與 NAT64（64:ff9b::/96）解回 IPv4 再判斷。 */
function isBlockedIp(ip) {
  const s = String(ip || '').replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  const kind = net.isIP(s);
  if (!kind) return true;
  if (kind === 4) return BLOCK.check(s, 'ipv4');
  const mapped = s.match(/^(?:::ffff:(?:0:)?|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return BLOCK.check(mapped[1], 'ipv4');
  const hex = s.match(/^(?:::ffff:(?:0:)?|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) { const n = (parseInt(hex[1], 16) << 16 >>> 0) + parseInt(hex[2], 16); return BLOCK.check([n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255].join('.'), 'ipv4'); }
  return BLOCK.check(s, 'ipv6');
}

const defaultResolve = host => dns.promises.lookup(host, { all: true, verbatim: true });

/** 驗證網址並解析出可連線的 IP；任何一個解析結果落在禁區就整個拒絕。 */
async function checkUrl(raw, { resolve = defaultResolve } = {}) {
  let url;
  try { url = new URL(String(raw || '').trim()); } catch { throw new ImportError('invalid_url', '請貼上完整的活動網址（https:// 開頭）。'); }
  if (String(raw).length > 2000) throw new ImportError('invalid_url', '網址過長。');
  if (url.protocol !== 'https:') throw new ImportError('blocked', '只接受 https:// 開頭的網址。');
  if (url.username || url.password) throw new ImportError('blocked', '網址不可包含帳號密碼。');
  if (url.port && url.port !== '443') throw new ImportError('blocked', '只接受標準 https 連接埠。');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || /\.(localhost|local|internal|intranet|lan|home|corp)$/.test(host) || host === 'metadata.google.internal')
    throw new ImportError('blocked', '這個網址指向內部網路，無法匯入。');
  let addresses;
  if (net.isIP(host)) addresses = [{ address: host, family: net.isIP(host) }];
  else {
    try { addresses = await resolve(host); } catch { throw new ImportError('unreachable', '找不到這個網站。'); }
    if (!Array.isArray(addresses)) addresses = [addresses];
  }
  if (!addresses.length || addresses.some(a => isBlockedIp(a && a.address))) throw new ImportError('blocked', '這個網址指向內部網路，無法匯入。');
  return { url, address: addresses[0].address, family: addresses[0].family || net.isIP(addresses[0].address) };
}

/** 實際發出一次 GET：連到已驗證的 IP（TLS SNI／Host 仍用原網域），不自動跟隨轉址，讀到 2MB 為止。 */
function requestOnce(url, { address, family }, { signal, maxBytes = MAX_BYTES } = {}) {
  const https = require('node:https');
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET', signal,
      headers: { 'user-agent': 'emoji-event-import/1.0 (+https://www.emoji.tw)', accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8' },
      lookup: (_h, opts, cb) => (opts && opts.all ? cb(null, [{ address, family }]) : cb(null, address, family)),
    }, res => {
      const status = res.statusCode || 0, headers = res.headers || {};
      if (status >= 300 && status < 400) { res.resume(); return resolve({ status, headers, body: '' }); }
      const chunks = []; let size = 0, done = false;
      const finish = () => { if (done) return; done = true; resolve({ status, headers, body: Buffer.concat(chunks).toString('utf8') }); };
      res.on('data', c => { if (done) return; size += c.length; chunks.push(size > maxBytes ? c.subarray(0, c.length - (size - maxBytes)) : c); if (size >= maxBytes) { finish(); res.destroy(); } });
      res.on('end', finish); res.on('error', e => (done ? null : reject(e)));
    });
    req.on('error', reject); req.end();
  });
}

/** 抓活動頁：手動處理最多 3 次轉址，每一跳都重新做 SSRF 檢查；全程 5 秒。 */
async function fetchEventPage(raw, { resolve = defaultResolve, request = requestOnce, timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES, maxRedirects = MAX_REDIRECTS } = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = raw;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const target = await checkUrl(current, { resolve });
      let res;
      try { res = await request(target.url, target, { signal: controller.signal, maxBytes }); }
      catch (e) { throw new ImportError(controller.signal.aborted ? 'timeout' : 'unreachable', controller.signal.aborted ? '讀取逾時。' : '無法連線到這個網站。'); }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers && (res.headers.location || res.headers.Location);
        if (!loc) throw new ImportError('unreachable', '網站回應轉址但沒有目的地。');
        if (hop === maxRedirects) throw new ImportError('too_many_redirects', '轉址次數過多。');
        current = new URL(String(loc), target.url).href;
        continue;
      }
      if (res.status !== 200) throw new ImportError('unreachable', '網站回應 ' + res.status + '。');
      const type = String((res.headers && res.headers['content-type']) || 'text/html');
      if (!/html|xml/i.test(type)) throw new ImportError('not_html', '這個網址不是活動網頁。');
      return { final_url: target.url.href, html: String(res.body || '').slice(0, maxBytes) };
    }
    throw new ImportError('too_many_redirects', '轉址次數過多。');
  } finally { clearTimeout(timer); }
}

/* ---------- 解析 ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return Object.hasOwn(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
  });
}
const clean = (s, max) => {
  const text = decodeEntities(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]*>/g, ''))
    .replace(/\r/g, '').replace(/[ \t\f\v]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text.length > max ? text.slice(0, max).trim() : text;
};

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  return out;
}

function jsonLdBlocks(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/application\/ld\+json/i.test(attrs('<x ' + m[1] + '>').type || '')) continue;
    const text = m[2].trim().replace(/^<!--|-->$/g, '').replace(/^\/\*<!\[CDATA\[\*\/|\/\*\]\]>\*\/$/g, '');
    try { out.push(JSON.parse(text)); } catch { try { out.push(JSON.parse(decodeEntities(text))); } catch { /* 壞掉的 JSON-LD 略過 */ } }
  }
  return out;
}
const isEventType = t => [].concat(t || []).some(x => typeof x === 'string' && /(^|[/#:])\w*Event$/.test(x));
function findEvent(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) { for (const n of node) { const f = findEvent(n, depth + 1); if (f) return f; } return null; }
  if (isEventType(node['@type'])) return node;
  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item', 'subEvent', 'event']) { const f = findEvent(node[key], depth + 1); if (f) return f; }
  return null;
}
const firstText = v => { if (v == null) return ''; if (Array.isArray(v)) return firstText(v[0]); if (typeof v === 'object') return firstText(v.name ?? v['@value'] ?? v.url ?? ''); return String(v); };
function placeText(loc) {
  if (!loc) return '';
  if (Array.isArray(loc)) return loc.map(placeText).filter(Boolean).join(' / ');
  if (typeof loc === 'string') return loc;
  if (/VirtualLocation/.test(firstText(loc['@type']))) return loc.name || '線上';
  const addr = loc.address;
  const addrText = typeof addr === 'string' ? addr : addr && typeof addr === 'object'
    ? [addr.postalCode, addr.addressRegion, addr.addressLocality, addr.streetAddress].filter(Boolean).join(' ') : '';
  return [loc.name, addrText && addrText !== loc.name ? addrText : ''].filter(Boolean).join(' · ');
}
const imageUrl = v => { if (!v) return ''; if (Array.isArray(v)) return imageUrl(v[0]); if (typeof v === 'object') return imageUrl(v.url || v.contentUrl || v['@id']); return String(v); };

/** ISO 時間 → 台北時間 'YYYY-MM-DDTHH:mm'；沒有時區的時間視為台北時間並標記 assumed；只有日期回 null（不猜時間）。 */
function toTaipei(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if (!m) return null;
  if (!m[3]) return { value: m[1] + 'T' + m[2], assumed: true };
  const d = new Date(m[1] + 'T' + m[2] + ':00' + (m[3].toUpperCase() === 'Z' ? 'Z' : m[3].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')));
  if (!Number.isFinite(+d)) return null;
  return { value: new Date(+d + 8 * 3600e3).toISOString().slice(0, 16), assumed: false };
}
function absHttps(u, base) { try { const x = new URL(String(u || '').trim(), base); return x.protocol === 'https:' ? x.href : ''; } catch { return ''; } }

/** 解析活動頁 HTML。只回真的讀到的欄位，讀不到的留空（不顯示假資料）。 */
function parseEventHtml(html, pageUrl) {
  const src = String(html || '');
  const out = { title: '', description: '', starts_at: '', ends_at: '', location: '', image_url: '', organizer: '', timezone_assumed: false };
  const ev = findEvent(jsonLdBlocks(src));
  if (ev) {
    out.title = clean(firstText(ev.name), 160);
    out.description = clean(firstText(ev.description), 5000);
    const s = toTaipei(firstText(ev.startDate)), e = toTaipei(firstText(ev.endDate));
    if (s) { out.starts_at = s.value; out.timezone_assumed ||= s.assumed; }
    if (e) { out.ends_at = e.value; out.timezone_assumed ||= e.assumed; }
    out.location = clean(placeText(ev.location), 300);
    out.image_url = absHttps(imageUrl(ev.image), pageUrl);
    out.organizer = clean([].concat(ev.organizer || []).map(firstText).filter(Boolean).join('、'), 120);
  }
  const meta = {};
  for (const m of src.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]), key = (a.property || a.name || a.itemprop || '').toLowerCase();
    if (key && a.content != null && !meta[key]) meta[key] = a.content;
  }
  out.title ||= clean(meta['og:title'] || meta['twitter:title'], 160);
  out.description ||= clean(meta['og:description'] || meta['twitter:description'] || meta.description, 5000);
  out.image_url ||= absHttps(meta['og:image:secure_url'] || meta['og:image'] || meta['twitter:image'], pageUrl);
  if (!out.starts_at) { const s = toTaipei(meta['event:start_time'] || meta.startdate); if (s) { out.starts_at = s.value; out.timezone_assumed ||= s.assumed; } }
  if (!out.ends_at) { const e = toTaipei(meta['event:end_time'] || meta.enddate); if (e) { out.ends_at = e.value; out.timezone_assumed ||= e.assumed; } }
  if (!out.title) { const t = src.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i); if (t) out.title = clean(t[1], 160); }
  out.fields_found = ['title', 'description', 'starts_at', 'ends_at', 'location', 'image_url', 'organizer'].filter(k => out[k]);
  if (!out.starts_at && !out.ends_at) out.timezone_assumed = false;
  return out;
}

/** 正規化成重複匯入比對用的來源網址：去掉 hash 與常見追蹤參數。 */
function normalizeSourceUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|ref$|ref_src$|mc_)/i.test(k)) u.searchParams.delete(k);
    return u.href;
  } catch { return ''; }
}

module.exports = { ImportError, isBlockedIp, checkUrl, fetchEventPage, parseEventHtml, normalizeSourceUrl, toTaipei, requestOnce, MAX_BYTES, TIMEOUT_MS, MAX_REDIRECTS };
