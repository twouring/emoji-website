'use strict';
/**
 * 合作夥伴（Partners）與參加者徽章：純函式，無 DB 依賴。
 * - 夥伴由管理員在 admin 設定：名稱、Logo、網址、所屬信箱（完整 Email 或 @網域）、是否在官網顯示、排序。
 * - 夥伴信箱底下的會員建立的活動，可在 App 主辦後台標註為該夥伴的活動；管理員可標註任何活動。
 * - 參加者每參加一場夥伴活動（已簽到，或報名有效且活動已結束）累積一次，依場數升級徽章。
 */

const MAX_EMAILS = 200;
// 徽章等級門檻（累積參加場數）：1 場拿到徽章，之後 3／6／10 場升級
const LEVELS = [
  { level: 1, min: 1, name: { zh: '初識', en: 'Newcomer', ja: 'はじめまして' } },
  { level: 2, min: 3, name: { zh: '熟客', en: 'Regular', ja: '常連' } },
  { level: 3, min: 6, name: { zh: '鐵粉', en: 'Super fan', ja: 'ファン' } },
  { level: 4, min: 10, name: { zh: '摯友', en: 'Inner circle', ja: '親友' } },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** 信箱清單：接受陣列或以換行／逗號／空白分隔的字串；完整 Email 或 @網域，一律小寫去重。回傳 {value} 或 {error} */
function normalizeEmails(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(/[\s,，;；]+/);
  const out = [];
  for (const item of raw) {
    let v = String(item || '').trim().toLowerCase();
    if (!v) continue;
    if (!v.includes('@') && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) v = '@' + v; // 只填網域時補 @
    if (!EMAIL_RE.test(v) && !DOMAIN_RE.test(v)) return { error: `信箱格式不正確：${item}` };
    if (!out.includes(v)) out.push(v);
  }
  if (out.length > MAX_EMAILS) return { error: `所屬信箱最多 ${MAX_EMAILS} 筆。` };
  return { value: out };
}

/** email 是否屬於這組信箱（完整比對，或 @網域 比對網域） */
function emailMatches(entries, email) {
  const e = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return false;
  const domain = e.slice(e.lastIndexOf('@'));
  return (Array.isArray(entries) ? entries : []).some(x => x === e || (x.startsWith('@') && x === domain));
}

const slugify = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function safeUrl(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  try { const u = new URL(s); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch (e) { return null; }
}

/** Logo：站內上傳路徑（/uploads/…、/ig-media/…）或 https 網址 */
function safeLogo(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^\/(uploads|ig-media|assets)\/[A-Za-z0-9._\-/]+$/.test(s) && !s.includes('..')) return s;
  const u = safeUrl(s);
  return u && u.startsWith('https://') ? u : null;
}

/** 後台表單 → 夥伴欄位。回傳 {value} 或 {error} */
function normalizePartnerInput(b) {
  b = b && typeof b === 'object' ? b : {};
  const name = String(b.name || '').trim();
  if (!name) return { error: '請輸入合作夥伴名稱。' };
  if (name.length > 80) return { error: '名稱最多 80 字。' };
  const url = safeUrl(b.url);
  if (url === null) return { error: '網址須為 http(s) 開頭。' };
  const logo = safeLogo(b.logo_url);
  if (logo === null) return { error: 'Logo 請上傳圖片，或填 https 圖片網址。' };
  const emails = normalizeEmails(b.emails);
  if (emails.error) return emails;
  const description = String(b.description || '').trim();
  if (description.length > 300) return { error: '簡介最多 300 字。' };
  const sort = Number.isFinite(+b.sort) ? Math.max(-9999, Math.min(9999, Math.trunc(+b.sort))) : 0;
  return { value: { name, slug: slugify(b.slug || name), url, logo_url: logo, emails: emails.value, description, visible: b.visible !== false, sort } };
}

/** 場數 → 徽章等級（未達 1 場回 null）與下一級資訊 */
function levelFor(count) {
  const n = Math.max(0, Math.trunc(+count || 0));
  let cur = null;
  for (const l of LEVELS) if (n >= l.min) cur = l;
  const next = LEVELS.find(l => l.min > n) || null;
  return { count: n, level: cur ? cur.level : 0, name: cur ? cur.name : null, next_level: next ? next.level : null, next_min: next ? next.min : null, to_next: next ? next.min - n : 0 };
}

/** 依夥伴彙整 {partner_id, count} 列，附上等級；只回已拿到徽章（≥1 場）的夥伴，等級高、場數多者在前 */
function buildBadges(partners, counts) {
  const byId = new Map((partners || []).map(p => [p.id, p]));
  return (counts || [])
    .map(r => ({ p: byId.get(r.partner_id), lv: levelFor(r.count) }))
    .filter(x => x.p && x.lv.level > 0)
    .map(({ p, lv }) => ({ partner_id: p.id, partner_name: p.name, slug: p.slug, logo_url: p.logo_url || '', url: p.url || '', ...lv }))
    .sort((a, b) => b.level - a.level || b.count - a.count || a.partner_name.localeCompare(b.partner_name));
}

/** 官網／App 公開用：只留可公開欄位（不外露所屬信箱） */
function publicPartner(p) {
  if (!p) return null;
  return { id: p.id, name: p.name, slug: p.slug, logo_url: p.logo_url || '', url: p.url || '', description: p.description || '' };
}

module.exports = { LEVELS, normalizeEmails, emailMatches, normalizePartnerInput, levelFor, buildBadges, publicPartner, slugify };
