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
  if (target.placed_at) throw Object.assign(Error('已送出的品項請洽櫃檯。'), { status: 409 });
  if (target.guest !== guest) throw Object.assign(Error('只能移除自己點的品項。'), { status: 403 });
  return items.filter(l => l.line !== line);
}

/* ===== 桌邊送單：客人加進購物車後按「送出點餐」，品項立刻進出餐看板（未結帳），用餐完再到櫃檯結帳 =====
 * 行上三個時間戳：placed_at（送單）、served_at（出餐）、order_id（結帳）。沒有新表：看板用 ticketsOf 從場的 items 現算。 */
/* 送單：整桌還沒送出的一起送（購物車全桌共用，送出前畫面看得到全部）；回 { items, ticket, lines } */
function placeLines(items, now = new Date()) {
  const open = items.filter(l => !l.order_id && !l.placed_at);
  if (!open.length) throw Object.assign(Error('沒有待送出的品項。'), { status: 400 });
  const ticket = 'tk_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10), at = new Date(now).toISOString();
  const set = new Set(open.map(l => l.line));
  const out = items.map(l => (set.has(l.line) ? { ...l, ticket, placed_at: at } : l));
  return { items: out, ticket, lines: out.filter(l => l.ticket === ticket) };
}
/* 出餐：看板按「已出餐」，同一張送單的品項全部標 served_at；全部出過了回 404 */
function serveTicket(items, ticket, now = new Date()) {
  const at = new Date(now).toISOString();
  let hit = false;
  const out = items.map(l => { if (l.ticket === ticket && !l.served_at) { hit = true; return { ...l, served_at: at }; } return l; });
  if (!hit) throw Object.assign(Error('找不到這張送單，或已經出餐。'), { status: 404 });
  return out;
}
/* 看板：這桌已送單、未出餐、未結帳的品項依送單張次分組，形狀比照出餐單（id、table_no、items、amount、stations）但 status='placed' */
function ticketsOf(session) {
  const by = new Map();
  for (const l of session?.items || []) {
    if (!l.ticket || l.order_id || !l.placed_at || l.served_at) continue;
    if (!by.has(l.ticket)) by.set(l.ticket, { id: l.ticket, ticket: l.ticket, session_id: session.id, table_no: session.table_no, status: 'placed', placed_at: l.placed_at, items: [] });
    by.get(l.ticket).items.push(l);
  }
  return [...by.values()].map(t => ({ ...t, amount: sum(t.items), stations: splitByStation(t) })).sort((a, b) => (a.placed_at < b.placed_at ? -1 : 1));
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
const PAY_METHODS = { cash: '現金', card: '刷卡', linepay: 'LINE Pay', transfer: '轉帳', taishin: '台新手機付', tappay: '線上刷卡' };
const POS_GUEST = 'posstaff00';   // 櫃檯加的品項共用這個 guest；客人端看得到但不能刪
/* extraCodes：言文字管理員自訂新增的收款帳戶代碼（Set 或陣列），見 lib/pos-payment-methods.js */
function payMethod(method, extraCodes) {
  const m = String(method || '');
  const extra = extraCodes instanceof Set ? extraCodes : new Set(Array.isArray(extraCodes) ? extraCodes : []);
  if (m === 'tappay' || (!PAY_METHODS[m] && !extra.has(m))) throw Object.assign(Error('請選擇付款方式：現金、刷卡、LINE Pay、轉帳、台新手機付或已啟用的收款帳戶。'), { status: 400 });
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
/* 會員價：結帳當下以菜單 emo 重算（emo>0 且低於原價才套）；品項已不在菜單則維持原價；贈送（price 0）的不動 */
function applyMemberPrice(lines, menuAll) {
  return lines.map(l => {
    const it = menuAll.get(l.item_id);
    const emo = Number(it && it.emo);
    return it && Number.isFinite(emo) && emo > 0 && emo < l.price ? { ...l, price: emo, regular_price: l.price } : l;
  });
}
/* 櫃檯改未結帳品項：改數量（1–20）、贈送／取消贈送（贈送＝單價 0，原價留在 regular_price，作廢整單時會還原）；要原因 */
function editLine(items, line, { qty, free, reason } = {}) {
  const t = items.find(l => l.line === line);
  if (!t) throw Object.assign(Error('找不到這個品項。'), { status: 404 });
  if (t.order_id) throw Object.assign(Error('已結帳品項不能修改，請改用「作廢整張單」。'), { status: 409 });
  const out = { ...t };
  if (qty !== undefined) {
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1 || n > 20) throw Object.assign(Error('數量須為 1–20。'), { status: 400 });
    out.qty = n;
  }
  if (free !== undefined) {
    if (free === true) {
      const r = cleanText(reason, 80);
      if (!r) throw Object.assign(Error('請填寫贈送原因。'), { status: 400 });
      out.regular_price = t.regular_price ?? t.price; out.price = 0; out.comp_reason = r;
    } else {
      out.price = t.regular_price ?? t.price; delete out.regular_price; delete out.comp_reason;
    }
  }
  return items.map(l => (l === t ? out : l));
}
/* 整單折扣：percent（1–100％，四捨五入）或 amount（固定金額，不得超過小計）；要原因（進日結與操作紀錄）。沒帶＝不折 */
function discountOf(body, subtotal) {
  const d = body?.discount;
  if (!d || typeof d !== 'object' || !d.type) return null;
  const type = String(d.type), value = Number(d.value), reason = cleanText(d.reason, 40);
  if (!['percent', 'amount'].includes(type)) throw Object.assign(Error('折扣類型無效。'), { status: 400 });
  if (!Number.isInteger(value) || value < 1) throw Object.assign(Error(type === 'percent' ? '折扣％須為 1–100 的整數。' : '折抵金額須為正整數。'), { status: 400 });
  if (type === 'percent' && value > 100) throw Object.assign(Error('折扣％須為 1–100 的整數。'), { status: 400 });
  const amount = type === 'percent' ? Math.round(subtotal * value / 100) : value;
  if (amount > subtotal) throw Object.assign(Error('折抵金額不可超過小計。'), { status: 400 });
  if (!reason) throw Object.assign(Error('請填寫折扣原因。'), { status: 400 });
  return { type, value, amount, reason };
}
/* 現金實收：只在現金時記；要 ≥ 應收，回找零 */
function cashReceived(method, received, amount) {
  if (method !== 'cash' || received === undefined || received === null || received === '') return null;
  const n = Number(received);
  if (!Number.isInteger(n) || n < amount || n > 10000000) throw Object.assign(Error('實收金額須為整數且不少於應收金額。'), { status: 400 });
  return { received: n, change: n - amount };
}
/* 櫃檯收款：選行（可分帳）→ 可套會員價 → 整單折扣 → 回 { lines, subtotal, discount, amount, payer }；寫 DB 由 server 做 */
function posCheckout(items, body, menuAll, extraMethodCodes) {
  const method = payMethod(body?.method, extraMethodCodes);
  let lines = selectLines(items, body?.lines);
  if (!lines.length) throw Object.assign(Error('沒有可結帳的品項。'), { status: 400 });
  const member = body?.member === true;
  if (member) lines = applyMemberPrice(lines, menuAll);
  const subtotal = sum(lines);
  const discount = discountOf(body, subtotal);
  const amount = subtotal - (discount ? discount.amount : 0);
  const cash = cashReceived(method, body?.received, amount);
  const who = { name: cleanText(body?.name, 40) || '現場', method, member, staff: cleanText(body?.staff, 120), note: cleanText(body?.note, 80) };
  // 操作人員（4 位數識別碼認人，疊在品牌帳號之上）：server 先驗過 id 才會給，這裡只負責塞進 payer
  if (body?.operator?.id) { who.operator_id = cleanText(body.operator.id, 32); who.operator_name = cleanText(body.operator.name, 40); }
  if (discount) who.discount = discount;
  if (cash) { who.received = cash.received; who.change = cash.change; }
  return { lines, subtotal, discount, amount, payer: who };
}
/* 換桌／併桌：來源桌的未結帳品項接到目標桌後面（併桌）；已結帳的單由 server 改 session_id／桌號 */
function mergeItems(targetItems, sourceItems) {
  return (targetItems || []).concat(sourceItems || []);
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
/* 取消已結帳單裡的單一品項（做不出來／客人退菜），不必作廢整張單：
   比照贈送把單價歸零、原價留底（regular_price），從整張單金額扣除這項小計；要原因、限當個營業日，
   線上刷卡／已開立發票的單無法只動一項（金額對不起來），只能整張作廢。最後一項未取消的不能再取消，請改走作廢整張單。 */
function voidOrderLine(order, line, reason, now = Date.now()) {
  if (!order) throw Object.assign(Error('找不到這筆出餐單。'), { status: 404 });
  if (order.status === 'void') throw Object.assign(Error('這張單已作廢。'), { status: 409 });
  if (order.tappay && order.tappay.rec_trade_id) throw Object.assign(Error('線上刷卡的單請先在 TapPay 後台退款，再由言文字管理員作廢整張單。'), { status: 409 });
  if (order.invoice?.status === 'issued') throw Object.assign(Error('已開立發票的單無法只取消一項，請作廢整張單後重開。'), { status: 409 });
  if (MenuLib.businessDay(order.paid_at) !== MenuLib.businessDay(now)) throw Object.assign(Error('只能取消當個營業日的品項；更早的請聯絡言文字管理員調整報表。'), { status: 409 });
  const items = order.items || [];
  const target = items.find(l => l.line === line);
  if (!target) throw Object.assign(Error('找不到這個品項。'), { status: 404 });
  if (target.cancelled) throw Object.assign(Error('這個品項已取消。'), { status: 409 });
  if (items.filter(l => !l.cancelled).length <= 1) throw Object.assign(Error('這是這張單最後一項，請改用「作廢整張單」。'), { status: 409 });
  const r = cleanText(reason, 80);
  if (!r) throw Object.assign(Error('請填寫取消原因。'), { status: 400 });
  const refund = lineTotal(target);
  const nextItems = items.map(l => l !== target ? l : { ...l, regular_price: l.regular_price ?? l.price, price: 0, cancelled: true, cancel_reason: r, cancelled_at: new Date(now).toISOString() });
  return { items: nextItems, amount: Math.max(0, Math.round((Number(order.amount) || 0) - refund)), reason: r, refund };
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
/* 桌況：empty（剛開桌還沒點）、open（有未付）、ordered（已送單待出餐）、preparing／ready（有出餐單未取）、idle（都處理完，等清桌或自動結束） */
function tableStatus(session, orders) {
  const items = session?.items || [];
  const open = unpaid(items);
  const live = (orders || []).filter(o => o.session_id === session.id && (o.status === 'paid' || o.status === 'ready'));
  if (live.some(o => o.status === 'ready')) return 'ready';
  if (live.length) return 'preparing';
  if (open.some(l => l.placed_at && !l.served_at)) return 'ordered';
  return open.length ? 'open' : items.length ? 'idle' : 'empty';
}

/* ===== 日結：依營業日彙總（作廢的單另列、不計營收） ===== */
function salesSummary(orders, { venues = null, now } = {}) {
  const rows = (orders || []).filter(o => orderOwnedByVenues(o, venues));
  const byMethod = {}, byHour = {}, items = new Map();
  let amount = 0, count = 0, voided = 0, voidAmount = 0, discountAmount = 0, discountCount = 0, compCount = 0;
  for (const o of rows) {
    if (o.status === 'void') { voided++; voidAmount += Number(o.amount) || 0; continue; }
    const method = o.payer?.method || (o.tappay?.rec_trade_id ? 'tappay' : 'cash');
    const n = Number(o.amount) || 0;
    amount += n; count++;
    byMethod[method] = (byMethod[method] || 0) + n;
    const disc = Number(o.payer?.discount?.amount) || 0;
    if (disc > 0) { discountAmount += disc; discountCount++; }
    compCount += (o.items || []).filter(l => l.comp_reason && !l.cancelled).length;
    const h = String((new Date(o.paid_at).getUTCHours() + 8) % 24).padStart(2, '0');
    byHour[h] = (byHour[h] || 0) + n;
    for (const l of o.items || []) {
      if (l.cancelled) continue; // 取消的品項沒出餐，不列入熱銷統計
      const key = l.item_id || l.zh;
      const prev = items.get(key) || { zh: l.zh, venue: l.venue || '', qty: 0, amount: 0 };
      prev.qty += l.qty; prev.amount += lineTotal(l);
      items.set(key, prev);
    }
  }
  return { day: MenuLib.businessDay(now), orders: count, amount, by_method: byMethod, by_hour: byHour, voided, void_amount: voidAmount, discount_amount: discountAmount, discount_count: discountCount, comp_count: compCount, items: [...items.values()].sort((a, b) => b.qty - a.qty || b.amount - a.amount) };
}
/* CSV 列（給會計）：前台 downloadCSV 已做公式注入防護，這裡只排欄位。整單折扣另列一列負數，讓「小計」欄加總＝營收 */
function salesCsvRows(orders, { venues = null, methodLabels = {} } = {}) {
  const head = ['營業日', '付款時間', '桌號', '品項', '數量', '單價', '小計', '付款方式', '會員價', '發票狀態', '發票號碼', '狀態', '作廢原因'];
  const body = [];
  for (const o of (orders || []).filter(o => orderOwnedByVenues(o, venues))) {
    // 沒記 payer.method 的舊單（啟用付款方式紀錄之前）視同現金；自訂收款帳戶的名稱由呼叫端傳入 methodLabels
    const methodCode = o.payer?.method || (o.tappay?.rec_trade_id ? 'tappay' : 'cash');
    const method = methodLabels[methodCode] || PAY_METHODS[methodCode] || methodCode;
    const paid = new Date(o.paid_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
    const inv = o.invoice || {};
    const invStatus = inv.status === 'issued' ? '已開立' : inv.status === 'failed' ? '開立失敗' : inv.status === 'void' ? '已作廢' : inv.requested ? '待補開' : '';
    const tail = [method, o.payer?.member ? '是' : '', invStatus, inv.number || '', o.status === 'void' ? '作廢' : '成立', o.void_reason || ''];
    for (const l of o.items || []) body.push([MenuLib.businessDay(o.paid_at), paid, o.table_no, l.cancelled ? `${l.zh}（已取消：${l.cancel_reason || ''}）` : l.comp_reason ? `${l.zh}（贈送：${l.comp_reason}）` : l.zh, l.qty, l.price, lineTotal(l), ...tail]);
    const d = o.payer?.discount;
    if (d && Number(d.amount) > 0) body.push([MenuLib.businessDay(o.paid_at), paid, o.table_no, `折扣（${d.type === 'percent' ? d.value + '％' : 'NT$' + d.value}：${d.reason || ''}）`, 1, -Number(d.amount), -Number(d.amount), ...tail]);
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

module.exports = { MenuLib, TABLE_RE, TAKEOUT_RE, TAPPAY_API, PAY_METHODS, POS_GUEST, RESERVATION_LABEL, tableKey, verifyTable, tableUrl, tappayConfig, menuIndex, visibleVenues, itemInVenues, orderVisibleToVenues, orderOwnedByVenues, sessionClosableByVenues, isTakeout, nextTakeoutTable, takeoutFinished, addLine, removeLine, placeLines, serveTicket, ticketsOf, selectLines, unpaid, sum, payer, payByPrime, sessionFinished,
  payMethod, posAddLine, voidLine, editLine, discountOf, cashReceived, applyMemberPrice, posCheckout, mergeItems, voidOrder, voidOrderLine, elapsedMin, splitByStation, tableStatus, salesSummary, salesCsvRows, parsePause, setPause, pauseFor, setSoldOut, reservationVenue, reservationTransition, reservationReplyMail, cleanText };
