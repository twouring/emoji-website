'use strict';
/**
 * 官網與子品牌站語系預設（KK 2026-11-05）：從外部進入未帶語系的中文網址時，
 * 依 cookie（使用者上次看的語系）→ 瀏覽器 Accept-Language 決定；瀏覽器沒設定或不是中／日／英，一律英文。
 * 站內點語言切換（同網域 Referer）尊重網址本身，並記住選擇。搜尋引擎爬蟲不轉址，避免中文頁無法收錄。
 */
const COOKIE = 'site_lang';
const LANGS = ['zh', 'en', 'ja'];
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless/i;

/** Accept-Language → 'zh'|'en'|'ja'；依 q 值排序，取第一個支援的語系，沒有就英文 */
function pickLang(header) {
  const items = String(header || '').split(',').map((part, i) => {
    const [tag, ...params] = part.trim().toLowerCase().split(';');
    const q = params.map(s => /^\s*q=([\d.]+)/.exec(s)).find(Boolean);
    return { base: tag.split('-')[0], q: q ? Number(q[1]) : 1, i };
  }).filter(x => x.base && x.base !== '*' && x.q > 0);
  items.sort((a, b) => b.q - a.q || a.i - b.i);
  return items.map(x => x.base).find(b => LANGS.includes(b)) || 'en';
}

const langOfPath = p => /^\/(en|ja)(?:\/|$)/.exec(p)?.[1] || 'zh';

function readCookie(req) {
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=(zh|en|ja)(?:;|$)').exec(req.headers.cookie || '');
  return m ? m[1] : '';
}

/**
 * @param {object} o
 * @param {(req) => boolean} o.applies     這個 host 是否套用（官網、子品牌站）
 * @param {(req, p) => boolean} o.localized 該中文路徑是否有 en／ja 版本
 */
function langPrefMiddleware({ applies, localized }) {
  return function langPref(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const p = req.path;
    if (/^\/(api|auth|admin|internal|uploads)(\/|$)/.test(p) || (/\.[a-z0-9]+$/i.test(p) && !/\.html?$/i.test(p))) return next();
    if (!applies(req)) return next();
    const lang = langOfPath(p);
    let sameSite = false;
    try { sameSite = new URL(req.get('referer') || '').hostname.toLowerCase() === String(req.hostname).toLowerCase(); } catch { /* 無 Referer */ }
    const remember = l => { if (readCookie(req) !== l) res.cookie(COOKIE, l, { maxAge: 365 * 864e5, sameSite: 'lax', secure: req.secure, path: '/' }); };
    if (lang !== 'zh') { if (localized(req, p.replace(/^\/(en|ja)/, '') || '/')) remember(lang); return next(); }
    if (!localized(req, p)) return next();
    res.vary('Accept-Language'); res.vary('Cookie');
    if (sameSite) { remember('zh'); return next(); }
    if (BOT.test(req.get('user-agent') || '')) return next();
    const want = readCookie(req) || pickLang(req.get('accept-language'));
    if (want === 'zh') return next();
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.set('Cache-Control', 'private, no-store');
    return res.redirect(302, '/' + want + (p === '/' || p === '/index.html' ? '' : p) + qs);
  };
}

module.exports = { pickLang, langPrefMiddleware, COOKIE };
