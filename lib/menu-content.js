'use strict';
/* 菜單內容管理（KK 11/15）：POS 員工職稱含「內容管理員」（或「店長」）可在 POS 與 MCP 更新自己品牌的菜單品項與照片。
 * 本檔只放純邏輯（可單測）：權限判斷、單一品項編輯（部分更新、不動估清／份數這些 POS 即時欄位）、圖片解碼與 https 下載。
 * 讀寫資料庫在 server.js（patchMenu 鎖 menu 列）。 */
const https = require('node:https');
require('../public/menu-lib.js');
const ML = globalThis.MenuLib;
const { checkUrl } = require('./event-import');
const { sniffImageType, MAX_BYTES } = require('./social-upload');

const CONTENT_ROLE_RE = /內容管理員|店長/;
const canEditContent = role => CONTENT_ROLE_RE.test(String(role || ''));
const err = (msg, status = 400) => Object.assign(Error(msg), { status });

/* 可編輯欄位（POS／MCP 白名單）；估清、剩餘份數、書籍欄位不在這裡（各有專用功能） */
const EDITABLE = ['zh', 'en', 'ja', 'ko', 'cat', 'price', 'emo', 'points', 'note', 'note_en', 'note_ja', 'note_ko', 'image', 'published', 'sort', 'available_from', 'available_to', 'alcohol', 'pos_only', 'custom_price', 'combo'];
const LIVE = ['sold_out', 'sold_out_by', 'stock_day', 'stock_left'];

/* 圖片網址只收站內上傳路徑或 https（避免 javascript:／data: 等） */
function cleanImage(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\/(ig-media|uploads)\/[A-Za-z0-9._\-/]+$/.test(s) && !s.includes('..')) return s;
  if (/^https:\/\/[^\s"'<>]+$/.test(s) && s.length <= 500) return s;
  throw err('照片網址格式不正確（請用上傳照片功能）。');
}

/* 單一品項新增／修改。input.id 有值＝修改（部分更新），沒有＝新增到 venue。venues＝這個帳號可改的品牌（null＝不限）。
 * 回 { json, item }；違規丟 { status } 錯誤 */
function editItem(menuJson, input, { venue, venues, now } = {}) {
  const b = input && typeof input === 'object' ? input : {};
  const doc = ML.parseMenuDoc(menuJson || '');
  const id = String(b.id || b.item_id || '').trim();
  const cur = id ? doc.items.find(x => x.id === id) : null;
  if (id && !cur) throw err('找不到這個品項。', 404);
  const own = Array.isArray(venues) && venues.length ? venues : null;
  if (cur && own && !own.includes(cur.venue)) throw err('只能修改自己品牌的品項。', 403);
  const target = cur ? cur.venue : String(venue || (own && own.length === 1 ? own[0] : '')).toUpperCase();
  if (!cur) {
    if (!ML.ITEM_VENUES.includes(target)) throw err('這個品牌沒有菜單品項（約書旅、在咖啡、三點水才有）。');
    if (own && !own.includes(target)) throw err('只能新增到自己品牌。', 403);
  }
  const patch = {};
  for (const k of EDITABLE) if (b[k] !== undefined) patch[k] = b[k];
  if (b.combo_text !== undefined) patch.combo = ML.comboFromText(b.combo_text);
  if (patch.image !== undefined) patch.image = cleanImage(patch.image);
  if (patch.cat !== undefined && !ML.CATS.includes(patch.cat)) throw err('分類無效：' + patch.cat);
  if (patch.cat === 'BOOK' && cur?.cat !== 'BOOK') throw err('書籍請用約書旅書冊（掃 ISBN）新增。');
  if (cur?.cat === 'BOOK' && patch.cat && patch.cat !== 'BOOK') throw err('書籍不能改成其他分類。');
  for (const k of ['price', 'emo', 'points', 'sort']) if (patch[k] !== undefined && !(Number.isFinite(Number(patch[k])) && Number(patch[k]) >= 0)) throw err(`${k} 必須是 0 以上的數字。`);
  for (const k of ['published', 'alcohol', 'pos_only', 'custom_price']) if (patch[k] !== undefined) patch[k] = patch[k] === true || patch[k] === 'true';
  for (const k of ['zh', 'en', 'ja', 'ko']) if (patch[k] !== undefined) patch[k] = String(patch[k]).slice(0, 80);
  for (const k of ['note', 'note_en', 'note_ja', 'note_ko']) if (patch[k] !== undefined) patch[k] = String(patch[k]).slice(0, 600);
  const raw = { ...(cur || { published: false, cat: 'FOOD', sort: (Math.max(0, ...doc.items.filter(x => x.venue === target).map(x => Number(x.sort) || 0)) + 10) }), ...patch, venue: target };
  if (!cur) raw.id = undefined;
  const item = ML.normalizeItem(raw);
  if (!item.zh) throw err('品名（中文）必填。');
  if (cur) for (const k of LIVE) item[k] = cur[k];
  if (cur && cur.cat === 'BOOK') Object.assign(item, { isbn: cur.isbn, barcode: cur.barcode, barcode_format: cur.barcode_format, author: cur.author, publisher: cur.publisher, list_price: cur.list_price, pub_date: cur.pub_date, stock_left: cur.stock_left });
  const next = ML.upsertItem(doc, item);
  next.items = next.items.map(x => (x.id === item.id ? item : x));
  ML.linkCombo(item, next.items);
  const v = ML.validateDoc(next);
  if (!v.ok) throw err(v.error);
  return { json: ML.stringifyDoc(next), item, created: !cur };
}

/* 編輯畫面／MCP 用的品項欄位（含照片、多語、說明；不含書籍內部欄位） */
const view = it => ({ id: it.id, venue: it.venue, cat: it.cat, zh: it.zh, en: it.en, ja: it.ja, ko: it.ko, price: it.price, emo: it.emo, member_price: ML.memberPrice(it), points: it.points, note: it.note, note_en: it.note_en, note_ja: it.note_ja, note_ko: it.note_ko, image: it.image, published: it.published, pos_only: it.pos_only, custom_price: it.custom_price, alcohol: it.alcohol, sort: it.sort, available_from: it.available_from, available_to: it.available_to, combo_text: it.cat === 'COMBO' ? ML.comboToText(it.combo) : '', sold_out: ML.soldOutToday(it), stock_left: ML.stockLeft(it), shared: ML.isShared(it) });

/* base64（可含 data:image/...;base64, 前綴）→ { buffer, mimetype }；只收 JPEG／PNG／WebP、≤5MB，檔頭要對 */
function decodeImage(b64) {
  const s = String(b64 || '').replace(/^data:image\/[a-z+]+;base64,/i, '').replace(/\s+/g, '');
  if (!s || !/^[A-Za-z0-9+/=_-]+$/.test(s)) throw err('照片資料格式不正確。');
  const buffer = Buffer.from(s, 'base64');
  if (buffer.length > MAX_BYTES) throw err('照片要 5MB 以下。');
  const mimetype = sniffImageType(buffer.subarray(0, 12));
  if (!mimetype) throw err('只接受 JPEG、PNG 或 WebP 照片。');
  return { buffer, mimetype };
}

/* 從 https 網址下載照片（MCP 給的網址）：SSRF 檢查沿用活動匯入（擋私網、釘 IP），最多轉址 3 次、10 秒、5MB */
function getOnce(url, { address, family }, signal) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', signal, headers: { 'user-agent': 'emoji-menu-content/1.0 (+https://www.emoji.tw)', accept: 'image/*' },
      lookup: (_h, o, cb) => (o && o.all ? cb(null, [{ address, family }]) : cb(null, address, family)) }, res => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400) { res.resume(); return resolve({ status, location: res.headers.location }); }
      const chunks = []; let size = 0;
      res.on('data', c => { size += c.length; if (size > MAX_BYTES) { res.destroy(); reject(err('照片要 5MB 以下。')); } else chunks.push(c); });
      res.on('end', () => resolve({ status, buffer: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject); req.end();
  });
}
async function fetchImage(raw, { resolve, request = getOnce, timeoutMs = 10000 } = {}) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let current = raw;
    for (let hop = 0; hop <= 3; hop++) {
      let target;
      try { target = await checkUrl(current, resolve ? { resolve } : {}); } catch (e) { throw err(e.message || '照片網址無法使用。'); }
      let r;
      try { r = await request(target.url, target, ctl.signal); } catch (e) { if (e.status) throw e; throw err(ctl.signal.aborted ? '下載照片逾時。' : '無法下載這個照片網址。'); }
      if (r.status >= 300 && r.status < 400) { if (!r.location || hop === 3) throw err('照片網址轉址過多。'); current = new URL(r.location, target.url).toString(); continue; }
      if (r.status !== 200) throw err(`照片網址回應 ${r.status}。`);
      const mimetype = sniffImageType(r.buffer.subarray(0, 12));
      if (!mimetype) throw err('這個網址不是 JPEG、PNG 或 WebP 照片（Google Drive 請用可直接下載的連結）。');
      return { buffer: r.buffer, mimetype };
    }
    throw err('照片網址轉址過多。');
  } finally { clearTimeout(timer); }
}

module.exports = { CONTENT_ROLE_RE, canEditContent, EDITABLE, editItem, view, cleanImage, decodeImage, fetchImage };
