/* 桌邊 QR 點餐：桌號簽章、共桌購物車、TapPay pay-by-prime、櫃檯結帳（POS）、日結。
 * 資料模型：table_sessions（一桌一場，多人共用 items）＋ table_orders（每次付款一張出餐單）。
 * 未信任任何前端金額：付款金額一律由伺服器端 items 快照重算。 */
'use strict';

const crypto = require('node:crypto');
require('../public/menu-lib.js'); // 無 window 時掛到 globalThis.MenuLib
const MenuLib = globalThis.MenuLib;

const TABLE_RE = /^[A-Za-z0-9-]{1,8}$/;
const TAPPAY_API = { sandbox: 'https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime', production: 'https://prod.tappaysdk.com/tpc/payment/pay-by-prime' };

/* 桌號簽章：QR 內含 t=桌號&k=簽章，避免任何人在家亂點。撤銷＝換 APP_SECRET（ponytail：不做逐桌撤銷）。 */
function tableKey(table, secret) {
  return crypto.createHmac('sha256', secret).update('table:' + String(table).toUpperCase()).digest('base64url').slice(0, 16);
}
function verifyTable(table, key, secret) {
  if (!TABLE_RE.test(String(table || '')) || typeof key !== 'string' || key.length !== 16) return null;
  const expect = tableKey(table, secret);
  return crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(key)) ? String(table).toUpperCase() : null;
}
function tableUrl(origin, table, secret) {
  return `${origin}/order?t=${encodeURIComponent(String(table).toUpperCase())}&k=${tableKey(table, secret)}`;
}

function tappayConfig(env = process.env) {
  const { TAPPAY_APP_ID, TAPPAY_APP_KEY, TAPPAY_PARTNER_KEY, TAPPAY_MERCHANT_ID } = env;
  if (!TAPPAY_APP_ID || !TAPPAY_APP_KEY || !TAPPAY_PARTNER_KEY || !TAPPAY_MERCHANT_ID) return null;
  const mode = env.TAPPAY_ENV === 'production' ? 'production' : 'sandbox';
  return { appId: TAPPAY_APP_ID, appKey: TAPPAY_APP_KEY, partnerKey: TAPPAY_PARTNER_KEY, merchantId: TAPPAY_MERCHANT_ID, mode };
}

/* 由 site_content.menu 取可點品項，以 id 為 key；給 venue 則只留該品牌（null＝非營業時段，無品項）。
 * 預設排除今日估清與不在供應期間的品項；櫃檯重算會員價時用 { all:true } 連估清的都拿（已點品項不該因估清查不到價） */
function menuIndex(menuJson, venue, { all = false, now } = {}) {
  const doc = MenuLib.parseMenuDoc(menuJson || '');
  const items = (all ? MenuLib.publishedOnly(doc) : MenuLib.orderableOnly(doc, now)).filter(it => venue === undefined || it.venue === venue);
  return new Map(items.map(it => [it.id, it]));
}

const cleanText = (v, max) => String(v ?? '').replace(/[\x00-\x1f]/g, '').trim().slice(0, max);

/* 品牌後台可見店別：brands 為空＝言文字管理員（不限制，回 null）；?venue= 指定單店時不得超出自己的品牌 */
function visibleVenues(brands, requested) {
  const own = Array.isArray(brands) && brands.length ? brands : null;
  const venue = String(requested || '').trim();
  if (venue && (!own || own.includes(venue))) return [venue];
  return own;
}
function itemInVenues(line, venues) {
  return !venues || !line || !line.venue || venues.includes(line.venue);
}
/* 看得到：這張單／這桌至少有一項是自己品牌的；剛開桌還沒點東西的桌大家都看得到 */
function orderVisibleToVenues(order, venues) {
  const items = order?.items || [];
  return !venues || items.length === 0 || items.some(line => itemInVenues(line, venues));
}
/* 可操作（出餐／已取餐／作廢）：整張單都是自己品牌的，避免替別的品牌按出餐 */
function orderOwnedByVenues(order, venues) {
  if (!venues) return true;
  const items = order?.items || [];
  return items.length > 0 && items.every(line => itemInVenues(line, venues));
}
/* 可清桌：整桌都是自己品牌的（空桌也可）；混桌只能由言文字管理員清 */
function sessionClosableByVenues(session, venues) {
  if (!venues) return true;
  return (session?.items || []).every(line => itemInVenues(line, venues));
}
/* 外帶／櫃檯單：POS 開桌時取 W01–W99 最小空號；結完帳且已取餐就自動收掉（內用桌保留「待清桌」給人員確認客人離開） */
const TAKEOUT_RE = /^W\d{2}$/;
const isTakeout = table => TAKEOUT_RE.test(String(table || ''));
function nextTakeoutTable(used) {
  for (let i = 1; i <= 99; i++) { const t = 'W' + String(i).padStart(2, '0'); if (!used.has(t)) return t; }
  return null;
}
function takeoutFinished(session, liveOrders) {
  const items = session?.items || [];
  return items.length > 0 && unpaid(items).length === 0 && !(liveOrders || []).some(o => o.session_id === session.id && (o.status === 'paid' || o.status === 'ready'));
}

/* 新增一行：價格以菜單當下售價快照（桌邊 QR 不登入所以一律一般價；會員價在櫃檯結帳時才套） */
function addLine(items, menu, { item_id, qty, by, guest, note: note0 }) {
  const it = menu.get(String(item_id || ''));
  if (!it) throw Object.assign(Error('品項不存在、已售完或已下架。'), { status: 400 });
  const n = Number(qty);
  if (!Number.isInteger(n) || n < 1 || n > 20) throw Object.assign(Error('數量須為 1–20。'), { status: 400 });
  if (!/^[a-z0-9]{8,32}$/.test(String(guest || ''))) throw Object.assign(Error('缺少來賓識別。'), { status: 400 });
  if (items.filter(l => !l.order_id).length >= 60) throw Object.assign(Error('本桌未結帳品項過多，請先結帳。'), { status: 400 });
  // 同人同品項無備註：合併數量而非另開一行；細項規格需容納糖度、冰塊、麵量、飯量與自由備註。
  const note = cleanText(note0, 160);
  const same = items.find(l => !l.order_id && l.guest === String(guest) && l.item_id === it.id && !l.note && !note);
  if (same) return items.map(l => l === same ? { ...l, qty: Math.min(20, l.qty + n) } : l);
  const line = {
    line: crypto.randomUUID().replace(/-/g, '').slice(0, 10), item_id: it.id, venue: it.venue, cat: it.cat, zh: it.zh, en: it.en, price: it.price, qty: n,
    by: cleanText(by, 20) || '客人', guest: String(guest), note, order_id: null, added_at: new Date().toISOString(),
  };
  return items.concat([line]);
}
function removeLine(items, line, guest) {
  const target = items.find(l => l.line === line);
  if (!target) throw Object.assign(Error('找不到這個品項。'), { status: 404 });
  if (target.order_id) throw Object.assign(Error('已付款品項不可移除。'), { status: 409 });
  if (target.guest !== guest) throw Object.assign(Error('只能移除自己點的品項。'), { status: 403 });
  return items.filter(l => l.line !== line);
}
const lineTotal = l => l.price * l.qty;
const unpaid = items => items.filter(l => !l.order_id);
const sum = lines => lines.reduce((a, l) => a + lineTotal(l), 0);

/* 選要付的行：未指定＝全桌未付；指定＝只付那些（可只付自己的） */
function selectLines(items, lines) {
  const open = unpaid(items);
  if (!Array.isArray(lines) || !lines.length) return open;
  const set = new Set(lines.map(String));
  const picked = open.filter(l => set.has(l.line));
  if (picked.length !== set.size) throw Object.assign(Error('部分品項已付款或已被移除，請重新整理。'), { status: 409 });
  return picked;
}

function payer(body) {
  const name = cleanText(body?.name, 40), phone = cleanText(body?.phone, 20), email = cleanText(body?.email, 120).toLowerCase();
  if (!name) throw Object.assign(Error('請填寫持卡人姓名。'), { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(Error('Email 格式不正確。'), { status: 400 });
  if (phone && !/^\+?[0-9-]{8,20}$/.test(phone)) throw Object.assign(Error('電話格式不正確。'), { status: 400 });
  return { name, phone, email };
}

/* TapPay Pay by Prime；status 0 才算成功。回 TapPay 原始回應（含 rec_trade_id）。 */
async function payByPrime(config, { prime, amount, orderNumber, details, cardholder }, fetcher = fetch) {
  if (typeof prime !== 'string' || !/^[A-Za-z0-9]{20,128}$/.test(prime)) throw Object.assign(Error('付款資料無效，請重新輸入卡號。'), { status: 400 });
  const res = await fetcher(TAPPAY_API[config.mode], {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': config.partnerKey },
    body: JSON.stringify({
      prime, partner_key: config.partnerKey, merchant_id: config.merchantId, amount, currency: 'TWD', details: details.slice(0, 100),
      order_number: orderNumber, remember: false,
      cardholder: { phone_number: cardholder.phone || '+886****0000', name: cardholder.name, email: cardholder.email || 'noreply@emoji.tw' },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.status !== 0) throw Object.assign(Error('付款未成功：' + (out.msg || ('HTTP ' + res.status))), { status: 402, tappay: out });
  return out;
}

/* 每桌一場：沒有未付品項且所有出餐單都完成（或作廢）＝這桌結束，下一組客人掃碼開新場 */
function sessionFinished(items, orders) {
  return unpaid(items).length === 0 && orders.every(o => o.status === 'done' || o.status === 'void') && (items.length > 0 || orders.length > 0);
}

/* ===== 櫃檯結帳（POS）：現場人員在後台替這桌加菜、作廢、收款 ===== */
const PAY_METHODS = { cash: '現金', card: '刷卡', linepay: 'LINE Pay', transfer: '轉帳', tappay: '線上刷卡' };
const POS_GUEST = 'posstaff00';   // 櫃檯加的品項共用這個 guest；客人端看得到但不能刪
function payMethod(method) {
  const m = String(method || '');
  if (!PAY_METHODS[m] || m === 'tappay') throw Object.assign(Error('請選擇付款方式：現金、刷卡、LINE Pay 或轉帳。'), { status: 400 });
  return m;
}
/* 櫃檯替客人加菜：與 QR 加菜同一套快照規則，by 固定顯示「櫃檯」 */
function posAddLine(items, menu, { item_id, qty, note }) {
  return addLine(items, menu, { item_id, qty, note, by: '櫃檯', guest: POS_GUEST });
}
/* 櫃檯作廢未付品項：不限誰點的，但要寫原因（進操作紀錄）；已付的走 voidOrder */
function voidLine(items, line, reason) {
  const target = items.find(l => l.line === line);
  if (!target) throw Object.assign(Error('找不到這個品項。'), { status: 404 });
  if (target.order_id) throw Object.assign(Error('已結帳品項請改用「作廢整張單」。'), { status: 409 });
  if (!cleanText(reason, 80)) throw Object.assign(Error('請填寫作廢原因。'), { status: 400 });
  return items.filter(l => l.line !== line);
}
/* 會員價：結帳當下以菜單 emo 重算（emo>0 且低於原價才套）；品項已不在菜單則維持原價 */
function applyMemberPrice(lines, menuAll) {
  return lines.map(l => {
    const it = menuAll.get(l.item_id);
    const emo = Number(it && it.emo);
    return it && Number.isFinite(emo) && emo > 0 && emo < l.price ? { ...l, price: emo, regular_price: l.price } : l;
  });
}
/* 櫃檯收款：選行（可分帳）→ 可套會員價 → 回 { lines, amount, payer }；寫 DB 由 server 做 */
function posCheckout(items, body, menuAll) {
  const method = payMethod(body?.method);
  let lines = selectLines(items, body?.lines);
  if (!lines.length) throw Object.assign(Error('沒有可結帳的品項。'), { status: 400 });
  const member = body?.member === true;
  if (member) lines = applyMemberPrice(lines, menuAll);
  const amount = sum(lines);
  const who = { name: cleanText(body?.name, 40) || '現場', method, member, staff: cleanText(body?.staff, 120), note: cleanText(body?.note, 80) };
  return { lines, amount, payer: who };
}
/* 作廢出餐單：只有當個營業日的單、且未作廢過；reason 必填 */
function voidOrder(order, reason, now = Date.now()) {
  if (!order) throw Object.assign(Error('找不到這筆出餐單。'), { status: 404 });
  if (order.status === 'void') throw Object.assign(Error('這張單已作廢。'), { status: 409 });
  if (order.tappay && order.tappay.rec_trade_id) throw Object.assign(Error('線上刷卡的單請先在 TapPay 後台退款，再由言文字管理員作廢。'), { status: 409 });
  if (MenuLib.businessDay(order.paid_at) !== MenuLib.businessDay(now)) throw Object.assign(Error('只能作廢當個營業日的單；更早的請聯絡言文字管理員調整報表。'), { status: 409 });
  const r = cleanText(reason, 80);
  if (!r) throw Object.assign(Error('請填寫作廢原因。'), { status: 400 });
  return r;
}

/* ===== 出餐看板輔助 ===== */
function elapsedMin(since, now = Date.now()) {
  const t = +new Date(since);
  return t ? Math.max(0, Math.floor((now - t) / 60000)) : 0;
}
/* 分站：同一張單拆成吧檯（飲品酒水）與廚房（餐點）兩份；空的站不列 */
function splitByStation(order) {
  const out = { bar: [], kitchen: [] };
  for (const l of order?.items || []) out[MenuLib.stationOf(l)].push(l);
  return out;
}
/* 桌況：empty（剛開桌還沒點）、open（有未付）、preparing／ready（有出餐單未取）、idle（都處理完，等清桌或自動結束） */
function tableStatus(session, orders) {
  const items = session?.items || [];
  const open = unpaid(items).length > 0;
  const live = (orders || []).filter(o => o.session_id === session.id && (o.status === 'paid' || o.status === 'ready'));
  if (live.some(o => o.status === 'ready')) return 'ready';
  if (live.length) return 'preparing';
  return open ? 'open' : items.length ? 'idle' : 'empty';
}

/* ===== 日結：依營業日彙總（作廢的單另列、不計營收） ===== */
function salesSummary(orders, { venues = null, now } = {}) {
  const rows = (orders || []).filter(o => orderOwnedByVenues(o, venues));
  const byMethod = {}, byHour = {}, items = new Map();
  let amount = 0, count = 0, voided = 0, voidAmount = 0;
  for (const o of rows) {
    if (o.status === 'void') { voided++; voidAmount += Number(o.amount) || 0; continue; }
    const method = o.payer?.method || (o.tappay?.rec_trade_id ? 'tappay' : 'cash');
    const n = Number(o.amount) || 0;
    amount += n; count++;
    byMethod[method] = (byMethod[method] || 0) + n;
    const h = String((new Date(o.paid_at).getUTCHours() + 8) % 24).padStart(2, '0');
    byHour[h] = (byHour[h] || 0) + n;
    for (const l of o.items || []) {
      const key = l.item_id || l.zh;
      const prev = items.get(key) || { zh: l.zh, venue: l.venue || '', qty: 0, amount: 0 };
      prev.qty += l.qty; prev.amount += lineTotal(l);
      items.set(key, prev);
    }
  }
  return { day: MenuLib.businessDay(now), orders: count, amount, by_method: byMethod, by_hour: byHour, voided, void_amount: voidAmount, items: [...items.values()].sort((a, b) => b.qty - a.qty || b.amount - a.amount) };
}
/* CSV 列（給會計）：前台 downloadCSV 已做公式注入防護，這裡只排欄位 */
function salesCsvRows(orders, { venues = null } = {}) {
  const head = ['營業日', '付款時間', '桌號', '品項', '數量', '單價', '小計', '付款方式', '會員價', '狀態', '作廢原因'];
  const body = [];
  for (const o of (orders || []).filter(o => orderOwnedByVenues(o, venues))) {
    const method = PAY_METHODS[o.payer?.method] || (o.tappay?.rec_trade_id ? PAY_METHODS.tappay : PAY_METHODS.cash);
    const paid = new Date(o.paid_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
    for (const l of o.items || []) body.push([MenuLib.businessDay(o.paid_at), paid, o.table_no, l.zh, l.qty, l.price, lineTotal(l), method, o.payer?.member ? '是' : '', o.status === 'void' ? '作廢' : '成立', o.void_reason || '']);
  }
  return [head, ...body];
}

/* ===== 暫停點餐：site_content.ordering_pause = { CAFE:{paused,message}, BAR:{...} } ===== */
function parsePause(json) {
  let j = {}; try { j = JSON.parse(json || '{}') || {}; } catch { j = {}; }
  const out = {};
  for (const v of MenuLib.VENUES) out[v] = { paused: j[v]?.paused === true, message: cleanText(j[v]?.message, 80) };
  return out;
}
function setPause(json, venue, { paused, message }) {
  if (!MenuLib.VENUES.includes(venue)) throw Object.assign(Error('店別無效。'), { status: 400 });
  const cur = parsePause(json);
  cur[venue] = { paused: paused === true, message: cleanText(message, 80) };
  return JSON.stringify(cur);
}
/* 客人加菜前檢查：目前營業品牌若暫停，回該品牌的文案 */
function pauseFor(json, venue) {
  if (!venue) return null;
  const p = parsePause(json)[venue];
  return p && p.paused ? (p.message || '目前暫停點餐，請洽櫃檯。') : null;
}

/* ===== 估清：只動單一品項的 sold_out 欄位，其他欄位原樣保留（避免兩台平板互相覆蓋整份菜單） ===== */
function setSoldOut(menuJson, itemId, soldOut, venues, now) {
  const doc = MenuLib.parseMenuDoc(menuJson || '');
  const it = doc.items.find(x => x.id === itemId);
  if (!it) throw Object.assign(Error('找不到這個品項。'), { status: 404 });
  if (!itemInVenues(it, venues)) throw Object.assign(Error('只能估清自己店別的品項。'), { status: 403 });
  it.sold_out = soldOut ? MenuLib.businessDay(now) : '';
  return MenuLib.stringifyDoc(MenuLib.touch(doc));
}

/* ===== 訂位：依時段歸屬品牌（08:00–16:59 在咖啡，其餘三點水）；狀態機 ===== */
function reservationVenue(time) {
  const h = Number(String(time || '').slice(0, 2));
  return Number.isFinite(h) && h >= 8 && h < 17 ? 'CAFE' : 'BAR';
}
const RESERVATION_FLOW = { new: ['confirmed', 'cancelled'], confirmed: ['arrived', 'no_show', 'cancelled'], arrived: ['confirmed'], no_show: ['confirmed'], cancelled: ['confirmed'] };
const RESERVATION_LABEL = { new: '待確認', confirmed: '已確認', arrived: '已到', no_show: '未到', cancelled: '已取消' };
function reservationTransition(current, next) {
  if (!RESERVATION_FLOW[current] || !RESERVATION_FLOW[current].includes(next)) throw Object.assign(Error(`「${RESERVATION_LABEL[current] || current}」不能改成「${RESERVATION_LABEL[next] || next}」。`), { status: 409 });
  return next;
}
/* 回覆客人的信（只有 confirmed／cancelled 需要寄；沒留 Email 或其他狀態回 null） */
function reservationReplyMail(r, status, { origin, staffNote }) {
  if (!r.email) return null;
  const when = `${r.reserve_date} ${r.reserve_time}（${r.period}）`;
  if (status === 'confirmed') return { to: r.email, subject: `[言文字] 訂位確認：${when}｜${r.party_size} 位`, text: `${r.name} 您好，\n\n您的訂位已確認：\n日期時間：${when}\n人數：${r.party_size} 位\n申請編號：${r.request_id}${r.table_no ? `\n桌號：${r.table_no}` : ''}${staffNote ? `\n\n店內留言：${staffNote}` : ''}\n\n若需更改請直接撥電話或回覆此信。期待您的光臨。\n\n言文字｜台灣人才聚落\n${origin}/reserve` };
  if (status === 'cancelled') return { to: r.email, subject: `[言文字] 訂位無法安排：${when}`, text: `${r.name} 您好，\n\n很抱歉，${when} 這個時段目前無法安排 ${r.party_size} 位的座位。${staffNote ? `\n\n店內留言：${staffNote}` : ''}\n\n歡迎改選其他時段再送出申請：${origin}/reserve\n\n言文字｜台灣人才聚落` };
  return null;
}

module.exports = { MenuLib, TABLE_RE, TAKEOUT_RE, TAPPAY_API, PAY_METHODS, POS_GUEST, RESERVATION_LABEL, tableKey, verifyTable, tableUrl, tappayConfig, menuIndex, visibleVenues, itemInVenues, orderVisibleToVenues, orderOwnedByVenues, sessionClosableByVenues, isTakeout, nextTakeoutTable, takeoutFinished, addLine, removeLine, selectLines, unpaid, sum, payer, payByPrime, sessionFinished,
  payMethod, posAddLine, voidLine, applyMemberPrice, posCheckout, voidOrder, elapsedMin, splitByStation, tableStatus, salesSummary, salesCsvRows, parsePause, setPause, pauseFor, setSoldOut, reservationVenue, reservationTransition, reservationReplyMail, cleanText };
