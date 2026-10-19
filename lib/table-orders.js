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
function menuIndex(menuJson, venue, { all = false, now, posOnly = false } = {}) {
  const doc = MenuLib.parseMenuDoc(menuJson || '');
  // all 模式連 pos_only 的也要拿（結帳重算會員價時，已點的「其他」要查得到）
  const items = (all ? (doc.items || []).filter(it => it.published) : MenuLib.orderableOnly(doc, now, { posOnly })).filter(it => venue === undefined || it.venue === venue);
  return new Map(items.map(it => [it.id, it]));
}

const cleanText = (v, max) => String(v ?? '').replace(/[\x00-\x1f]/g, '').trim().slice(0, max);

/* 來客人數：客人輸入稱呼時順便點選；同桌每支手機一票（guest 為 key，重選覆蓋自己那票），桌的人數＝平均後四捨五入 */
const PARTY_MAX = 20;
const partyVote = (votes, guest, size) => {
  const g = cleanText(guest, 40), n = Math.floor(Number(size));
  if (!g || !(n >= 1 && n <= PARTY_MAX)) throw Object.assign(Error('請選擇 1–' + PARTY_MAX + ' 位。'), { status: 400 });
  const cur = votes && typeof votes === 'object' && !Array.isArray(votes) ? votes : {};
  return { ...cur, [g]: n };
};
const partySize = votes => {
  const ns = Object.values(votes && typeof votes === 'object' ? votes : {}).map(Number).filter(n => n >= 1);
  return ns.length ? Math.round(ns.reduce((a, n) => a + n, 0) / ns.length) : null;
};

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
/* 套餐：menu 是 id→品項 的 Map。每個選擇欄必須選一個「套餐內容裡列出」的品項，且該品項今天要點得到；
 * 加價（choice.add）由伺服器依套餐內容算，不信前端。回 { add, parts }，parts 供出餐單逐項列出。 */
function comboParts(it, menu, pick) {
  const all = [...menu.values()];
  const parts = []; let add = 0;
  for (const slot of it.combo || []) {
    const p = pick && pick[slot.key];
    const ch = slot.choices.find(c => (p && p.id && c.id === p.id) || c.zh === (p && p.zh) || (p && p.zh && MenuLib.comboTarget(c, all, it.venue)?.zh === p.zh));
    if (!ch) throw Object.assign(Error(`套餐「${it.zh}」還沒選${slot.label}。`), { status: 400 });
    const m = MenuLib.comboTarget(ch, all, it.venue);
    if (!m) throw Object.assign(Error(`「${ch.zh}」今天無法供應，請改選其他${slot.label}。`), { status: 400 });
    add += ch.add || 0;
    parts.push({ slot: slot.label, item_id: m.id, zh: m.zh, en: m.en || '', ja: m.ja || '', cat: m.cat, note: cleanText(p.note, 100) });
  }
  return { add, parts };
}
function addLine(items, menu, { item_id, qty, by, guest, note: note0, price: priceOverride, combo }) {
  const it = menu.get(String(item_id || ''));
  if (!it) throw Object.assign(Error('品項不存在、已售完或已下架。'), { status: 400 });
  // 客製價格品項（例：其他）：只有已驗證過的覆寫價才會用上（posAddLine 才會傳，客人端 addLine 呼叫一律用菜單原價）
  let price = it.custom_price && Number.isFinite(priceOverride) ? priceOverride : it.price;
  const cp = it.cat === 'COMBO' ? comboParts(it, menu, combo) : null;
  if (cp) price += cp.add;
  const n = Number(qty);
  if (!Number.isInteger(n) || n < 1 || n > 20) throw Object.assign(Error('數量須為 1–20。'), { status: 400 });
  if (!/^[a-z0-9]{8,32}$/.test(String(guest || ''))) throw Object.assign(Error('缺少來賓識別。'), { status: 400 });
  if (items.filter(l => !l.order_id).length >= 60) throw Object.assign(Error('本桌未結帳品項過多，請先結帳。'), { status: 400 });
  // 同人同品項無備註：合併數量而非另開一行；細項規格需容納糖度、冰塊、麵量、飯量與自由備註。
  const note = cleanText(note0, 160);
  // 客製價格品項：不同金額視為不同行，不可合併（否則會吃掉前一筆的金額）
  const same = items.find(l => !l.order_id && !l.placed_at && l.guest === String(guest) && l.item_id === it.id && !cp && !l.note && !note && (!it.custom_price || l.price === price));
  if (same) return items.map(l => l === same ? { ...l, qty: Math.min(20, l.qty + n) } : l);
  const line = {
    line: crypto.randomUUID().replace(/-/g, '').slice(0, 10), item_id: it.id, venue: it.venue, cat: it.cat, zh: it.zh, en: it.en, ja: it.ja || '', price, qty: n,
    by: cleanText(by, 20) || '客人', guest: String(guest), note, order_id: null, added_at: new Date().toISOString(),
    ...(cp ? { parts: cp.parts } : {}),
  };
  return items.concat([line]);
}
/* App 掃桌碼兌換：加一行 0 元、原價留 regular_price、記 redeem_points；app_redeem／redeem_user 讓行被移除時能退點。點數由菜單 points 決定（伺服器值）。 */
function addRedeemLine(items, menu, { item_id, by, guest, userId }) {
  const it = menu.get(String(item_id || ''));
  const per = Math.floor(Number(it && it.points)) || 0;
  if (!it || !(per > 0)) throw Object.assign(Error('這個品項目前不開放兌換，或已售完。'), { status: 400 });
  if (items.filter(l => !l.order_id).length >= 60) throw Object.assign(Error('本桌未結帳品項過多，請先結帳。'), { status: 400 });
  const line = {
    line: crypto.randomUUID().replace(/-/g, '').slice(0, 10), item_id: it.id, venue: it.venue, cat: it.cat, zh: it.zh, en: it.en, ja: it.ja || '',
    price: 0, regular_price: it.price, redeem_points: per, app_redeem: true, redeem_user: String(userId), qty: 1,
    by: cleanText(by, 20) || '會員', guest: String(guest), note: '點數兌換', order_id: null, added_at: new Date().toISOString(),
  };
  return { items: items.concat([line]), line };
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
function placeLines(items, now = new Date(), venues = null) {
  // venues 給了就只送自己品牌的品項（共用座位混桌時，員工不會替別家送單）
  const open = items.filter(l => !l.order_id && !l.placed_at && itemInVenues(l, venues));
  if (!open.length) throw Object.assign(Error('沒有待送出的品項。'), { status: 400 });
  const ticket = 'tk_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10), at = new Date(now).toISOString();
  const set = new Set(open.map(l => l.line));
  const out = items.map(l => (set.has(l.line) ? { ...l, ticket, placed_at: at } : l));
  return { items: out, ticket, lines: out.filter(l => l.ticket === ticket) };
}
/* 出餐（品項層級）：看板可一道一道出。lines 給了就只標那幾行 served_at（部分出餐）；沒給＝「整筆出餐」捷徑，整張送單一起標。
   沒有任何一行可標（都出過了、或行不在這張送單）回 404。 */
function serveTicket(items, ticket, now = new Date(), lines = null) {
  const at = new Date(now).toISOString();
  const pick = Array.isArray(lines) && lines.length ? new Set(lines.map(String)) : null;
  let hit = false;
  const out = items.map(l => { if (l.ticket === ticket && !l.served_at && (!pick || pick.has(l.line))) { hit = true; return { ...l, served_at: at }; } return l; });
  if (!hit) throw Object.assign(Error(pick ? '這些品項已經出餐，或不在這張送單裡。' : '找不到這張送單，或已經出餐。'), { status: 404 });
  return out;
}
/* 看板：這桌已送單、未結帳、還有品項沒出完的送單，依送單張次分組，形狀比照出餐單（id、table_no、items、amount、stations）但 status='placed'。
   已出的行一起回（served_at 有值）讓看板劃線；served＝已出幾行、partial＝部分出餐；全部出完的送單才從看板消失。 */
function ticketsOf(session) {
  const by = new Map();
  for (const l of session?.items || []) {
    if (!l.ticket || l.order_id || !l.placed_at) continue;
    if (!by.has(l.ticket)) by.set(l.ticket, { id: l.ticket, ticket: l.ticket, session_id: session.id, table_no: session.table_no, status: 'placed', placed_at: l.placed_at, items: [] });
    by.get(l.ticket).items.push(l);
  }
  return [...by.values()].filter(t => t.items.some(l => !l.served_at))
    .map(t => { const served = t.items.filter(l => l.served_at).length; return { ...t, served, partial: served > 0, amount: sum(t.items), stations: splitByStation(t) }; })
    .sort((a, b) => (a.placed_at < b.placed_at ? -1 : 1));
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

/* ===== 客人送出「結帳需求」：手機上選好要付的範圍（全部付款／各付各的／平均分攤）送給櫃檯，POS 桌號畫面列成按鈕，一點就把那幾項勾好 =====
   存在 table_sessions.pay_requests（JSON 陣列）；每個 guest 只留最新一筆（再送＝覆蓋）；品項結掉後自動從需求裡剔除，空了就整筆消失 */
const PAY_REQUEST_MAX = 20;
function addPayRequest(requests, items, body, now = Date.now()) {
  const guest = cleanText(body?.guest, 40);
  if (!guest) throw Object.assign(Error('缺少識別碼，請重新整理頁面。'), { status: 400 });
  const lines = selectLines(items, body?.lines);
  if (!lines.length) throw Object.assign(Error('沒有可結帳的品項。'), { status: 400 });
  if (lines.some(l => !l.placed_at)) throw Object.assign(Error('還有品項沒送出，請先「送出點餐」再結帳。'), { status: 409 });
  const name = cleanText(body?.name, 40) || '客人';
  // 三種範圍：all＝全部付款、mine＝各付各的（指定行）、split＝平均分攤（全桌未付 ÷ 人數，POS 分多次收）
  const scope = body?.scope === 'mine' ? 'mine' : body?.scope === 'split' ? 'split' : 'all';
  let people;
  if (scope === 'split') { people = Number(body?.people); if (!Number.isInteger(people) || people < 2 || people > 20) throw Object.assign(Error('分攤人數須為 2–20 人。'), { status: 400 }); }
  const kept = (Array.isArray(requests) ? requests : []).filter(r => r && r.guest !== guest).slice(-(PAY_REQUEST_MAX - 1));
  return kept.concat([{ id: 'pr_' + crypto.randomBytes(6).toString('hex'), guest, name, lines: lines.map(l => l.line), scope, ...(people ? { people } : {}), at: new Date(now).toISOString() }]);
}
/* 結帳／作廢後：需求裡已不在未付清單的行剔掉，沒剩任何行的需求整筆移除；POS 關掉的（dismiss）也從這裡拿掉 */
function prunePayRequests(requests, items) {
  const open = new Set(unpaid(items).map(l => l.line));
  return (Array.isArray(requests) ? requests : []).map(r => r && Array.isArray(r.lines) ? { ...r, lines: r.lines.filter(l => open.has(l)) } : null).filter(r => r && r.lines.length);
}
/* POS 顯示用：帶金額與品項數（金額照未付清單現價算，會員價／折扣由櫃檯結帳時再套） */
function payRequestsView(requests, items) {
  const byLine = new Map(unpaid(items).map(l => [l.line, l]));
  return prunePayRequests(requests, items).map(r => { const ls = r.lines.map(l => byLine.get(l)).filter(Boolean); const amount = sum(ls); const v = { id: r.id, name: r.name, scope: r.scope, at: r.at, lines: r.lines, count: ls.length, amount }; if (r.scope === 'split' && r.people) { v.people = r.people; v.each = Math.floor(amount / r.people); } return v; });
}
/* 每桌一場：沒有未付品項且所有出餐單都完成（或作廢）＝這桌結束，下一組客人掃碼開新場 */
function sessionFinished(items, orders) {
  return unpaid(items).length === 0 && orders.every(o => o.status === 'done' || o.status === 'void') && (items.length > 0 || orders.length > 0);
}

/* ===== 櫃檯結帳（POS）：現場人員在後台替這桌加菜、作廢、收款 ===== */
const PAY_METHODS = { cash: '現金', card: '信用卡', linepay: 'LINE Pay', transfer: '轉帳', taishin: '信用卡', other: '其他', tappay: '線上刷卡' };
const POS_GUEST = 'posstaff00';   // 櫃檯加的品項共用這個 guest；客人端看得到但不能刪
/* extraCodes：言文字管理員自訂新增的收款帳戶代碼（Set 或陣列），見 lib/pos-payment-methods.js */
function payMethod(method, extraCodes) {
  const m = String(method || '');
  const extra = extraCodes instanceof Set ? extraCodes : new Set(Array.isArray(extraCodes) ? extraCodes : []);
  if (m === 'tappay' || (!PAY_METHODS[m] && !extra.has(m))) throw Object.assign(Error('請選擇付款方式：現金、信用卡、LINE Pay、轉帳、其他或已啟用的收款帳戶。'), { status: 400 });
  return m;
}
/* 櫃檯替客人加菜：與 QR 加菜同一套快照規則，by 固定顯示「櫃檯」。
 * 客製價格品項（it.custom_price）才會採信 body.price（店員現場輸入、已由 POS UI 驗證），
 * 其餘品項一律用菜單定價，不接受前端喊價。 */
function posAddLine(items, menu, { item_id, qty, note, price, combo }) {
  const it = menu.get(String(item_id || ''));
  let priceOverride;
  if (it && it.custom_price) {
    const p = Number(price);
    if (Number.isFinite(p) && p >= 0 && p <= 100000) priceOverride = Math.round(p);
    else throw Object.assign(Error('請輸入 0–100000 的金額。'), { status: 400 });
  }
  return addLine(items, menu, { item_id, qty, note, price: priceOverride, combo, by: '櫃檯', guest: POS_GUEST });
}
/* 櫃檯作廢未付品項：不限誰點的，但要寫原因（進操作紀錄）；已付的走 voidOrder */
function voidLine(items, line, reason) {
  const target = items.find(l => l.line === line);
  if (!target) throw Object.assign(Error('找不到這個品項。'), { status: 404 });
  if (target.order_id) throw Object.assign(Error('已結帳品項請改用「作廢整張單」。'), { status: 409 });
  if (target.credit_of) throw Object.assign(Error('預收抵扣不能作廢；要取消請作廢那張「部分付款」的單。'), { status: 409 });
  if (!cleanText(reason, 80)) throw Object.assign(Error('請填寫作廢原因。'), { status: 400 });
  return items.filter(l => l.line !== line);
}
/* 聚落價（有效會籍的會員才適用，server 驗證）：結帳當下重算（有填 emo 用 emo，空白＝原價九折；低於原價才套）；品項已不在菜單則維持原價；贈送（price 0）的不動 */
function applyMemberPrice(lines, menuAll) {
  return lines.map(l => {
    const it = menuAll.get(l.item_id);
    const mp = it && it.cat !== 'COMBO' ? MenuLib.memberPrice(it, l.price) : 0;   // 套餐本身已是優惠價，不再疊聚落價
    return it && mp > 0 && mp < l.price ? { ...l, price: mp, regular_price: l.price } : l;
  });
}
/* 點數兌換：選定的行改成 0 元（原價留在 regular_price、記 redeem_points）；每份點數取菜單 points（伺服器值，不信前端），
 * 沒開放兌換（points=0）的品項直接 400。點數餘額與身分由 server 在同一交易檢查。贈送行不重複兌換。回 { lines, points } */
function redeemLines(lines, ids, menuAll) {
  const want = new Set((Array.isArray(ids) ? ids : []).map(String));
  if (!want.size) return { lines, points: 0 };
  let points = 0, hit = 0;
  const out = lines.map(l => {
    if (!(want.has(l.line) || (l.part_of && want.has(l.part_of)))) return l;
    hit++;
    if (l.comp_reason || l.app_redeem) return l;   // 贈送、App 已兌換（點數已扣）的行不重複兌換
    const it = menuAll.get(l.item_id), per = Math.floor(Number(it && it.points)) || 0;
    if (!(per > 0)) throw Object.assign(Error(`「${l.zh}」不開放點數兌換。`), { status: 400 });
    const pts = per * l.qty;
    points += pts;
    return { ...l, regular_price: l.regular_price ?? l.price, price: 0, redeem_points: pts };
  });
  if (!hit) throw Object.assign(Error('要兌換的品項不在這次結帳裡。'), { status: 400 });
  return { lines: out, points };
}
/* 櫃檯改未結帳品項：改數量（1–20）、贈送／取消贈送（贈送＝單價 0，原價留在 regular_price，作廢整單時會還原）、改備註（任何品項都能補／改特別需求）；要原因 */
function editLine(items, line, { qty, free, reason, note } = {}) {
  const t = items.find(l => l.line === line);
  if (!t) throw Object.assign(Error('找不到這個品項。'), { status: 404 });
  if (t.order_id) throw Object.assign(Error('已結帳品項不能修改，請改用「作廢整張單」。'), { status: 409 });
  if (t.credit_of) throw Object.assign(Error('預收抵扣不能修改；要取消請作廢那張「部分付款」的單。'), { status: 409 });
  const out = { ...t };
  if (note !== undefined) out.note = cleanText(note, 160);
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
/* 部分結帳：quantities = { 品項行號: 這次要結的份數 }，小於該行數量就只結那幾份（拆出一行 part_of 原行，剩下的留在桌上）；
   沒帶＝整行結。份數須為 1..qty 的整數；拆出來的行用新的 line 編號，原行由 server 扣掉份數。 */
function partialQty(lines, quantities) {
  if (!quantities || typeof quantities !== 'object') return lines;
  return lines.map(l => {
    if (!(l.line in quantities)) return l;
    const n = Number(quantities[l.line]);
    if (!Number.isInteger(n) || n < 1 || n > l.qty) throw Object.assign(Error('部分結帳的份數須為 1 到該品項數量的整數。'), { status: 400 });
    if (n === l.qty) return l;
    return { ...l, line: crypto.randomUUID().replace(/-/g, '').slice(0, 10), qty: n, part_of: l.line };
  });
}
/* 櫃檯收款：選行（可分帳）→ 可套會員價 → 整單折扣 → 回 { lines, subtotal, discount, amount, payer }；寫 DB 由 server 做 */
/* 混合付款：payments = [{ method, amount }]，每筆為已啟用的付款方式與正整數金額，合計須等於應收；只有一筆就視同單一付款方式 */
function splitPayments(list, amount, extraMethodCodes) {
  if (!Array.isArray(list) || !list.length) return null;
  if (list.length > 6) throw Object.assign(Error('混合付款最多 6 筆。'), { status: 400 });
  const out = list.map(p => {
    const n = Number(p?.amount);
    if (!Number.isInteger(n) || n < 1) throw Object.assign(Error('混合付款每筆金額須為正整數。'), { status: 400 });
    return { method: payMethod(p?.method, extraMethodCodes), amount: n };
  });
  const total = out.reduce((a, p) => a + p.amount, 0);
  if (total !== amount) throw Object.assign(Error(`混合付款合計 NT$${total.toLocaleString('zh-TW')} 與應收 NT$${amount.toLocaleString('zh-TW')} 不符。`), { status: 400 });
  return out;
}
/* 這張單實際用現金付了多少（整單現金＝全額；混合付款＝現金那幾筆的合計，不超過單上金額） */
function cashPaid(payer, amount) {
  const n = Math.max(0, Number(amount) || 0);
  if (!payer) return 0;
  if (payer.method === 'cash') return n;
  if (Array.isArray(payer.payments)) return Math.min(n, payer.payments.filter(p => p.method === 'cash').reduce((a, p) => a + Math.max(0, Number(p.amount) || 0), 0));
  return 0;
}
/* 先收部分金額（客人先付 500，餘額留桌上之後再收）：不綁品項，另開一張「部分付款」單，並在桌上留一行負數「已預收」抵扣（credit_of＝那張單），
   下次結帳自然扣掉；要取消預收就作廢那張單（server 會把抵扣行拿掉）。金額須為正整數且小於這桌目前未結金額（付清請直接收款） */
function prepayLines(items, body, now = Date.now()) {
  const n = Number(body?.prepay);
  const open = unpaid(items);
  const due = sum(open);
  if (!Number.isInteger(n) || n < 1) throw Object.assign(Error('預收金額須為正整數。'), { status: 400 });
  if (n >= due) throw Object.assign(Error(`預收金額須小於這桌未結金額 NT$${due.toLocaleString('zh-TW')}；要付清請直接收款。`), { status: 400 });
  const venue = (open.find(l => l.venue) || {}).venue || '';
  const id = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const at = new Date(now).toISOString();
  // 平均分攤（split:{people,index}）：同一套預收機制，只是品名寫成「平均分攤 第 k／N 人」，收據與查單一眼看出
  const sp = body?.split && Number.isInteger(Number(body.split.people)) && Number.isInteger(Number(body.split.index)) ? { people: Math.min(20, Math.max(2, Number(body.split.people))), index: Math.max(1, Number(body.split.index)) } : null;
  const zh = sp ? `平均分攤 第 ${sp.index}／${sp.people} 人` : '部分付款', en = sp ? `Split ${sp.index}/${sp.people}` : 'Partial payment';
  const line = { line: id(), item_id: '', venue, cat: '', zh, en, price: n, qty: 1, by: '櫃檯', guest: POS_GUEST, prepay: true, placed_at: at, served_at: at };
  const credit = { line: id(), item_id: '', venue, cat: '', zh: '已預收', en: 'Prepaid', price: -n, qty: 1, by: '櫃檯', guest: POS_GUEST, credit_of: '', added_at: at, placed_at: at, served_at: at };
  return { lines: [line], credit, split: sp };
}
function posCheckout(items, body, menuAll, extraMethodCodes) {
  const mixed = Array.isArray(body?.payments) && body.payments.length > 1;
  const method = mixed ? 'mixed' : payMethod(Array.isArray(body?.payments) && body.payments.length === 1 ? body.payments[0]?.method : body?.method, extraMethodCodes);
  const prepay = body?.prepay !== undefined && body?.prepay !== null && body?.prepay !== '' ? prepayLines(items, body) : null;
  let lines = prepay ? prepay.lines : selectLines(items, body?.lines);
  if (!lines.length) throw Object.assign(Error('沒有可結帳的品項。'), { status: 400 });
  if (!prepay) lines = partialQty(lines, body?.quantities);
  const member = !prepay && body?.member === true;
  if (member) lines = applyMemberPrice(lines, menuAll);
  const redeemed = prepay ? { lines, points: 0 } : redeemLines(lines, body?.redeem_lines, menuAll);
  lines = redeemed.lines;
  const subtotal = sum(lines);
  const discount = prepay ? null : discountOf(body, subtotal);
  const amount = subtotal - (discount ? discount.amount : 0);
  if (amount < 0) throw Object.assign(Error('已預收的金額超過這次要結的品項，請先把其他品項一起結，或作廢預收單。'), { status: 400 });
  const payments = mixed ? splitPayments(body.payments, amount, extraMethodCodes) : null;
  // 現金實收／找零只對現金的部分算：整單現金＝應收全額，混合付款＝現金那幾筆合計
  const cashPart = payments ? payments.filter(p => p.method === 'cash').reduce((a, p) => a + p.amount, 0) : method === 'cash' ? amount : 0;
  const cash = cashPart > 0 ? cashReceived('cash', body?.received, cashPart) : null;
  const who = { name: cleanText(body?.name, 40) || '現場', method, member, staff: cleanText(body?.staff, 120), note: cleanText(body?.note, 80) };
  if (payments) who.payments = payments;
  if (prepay) { who.prepay = true; if (prepay.split) who.split = prepay.split; }
  // 操作人員（4 位數識別碼認人，疊在品牌帳號之上）：server 先驗過 id 才會給，這裡只負責塞進 payer
  if (body?.operator?.id) { who.operator_id = cleanText(body.operator.id, 32); who.operator_name = cleanText(body.operator.name, 40); }
  if (discount) who.discount = discount;
  if (redeemed.points) who.yan_redeem_points = redeemed.points;
  if (cash) { who.received = cash.received; who.change = cash.change; }
  return { lines, subtotal, discount, amount, payer: who, credit: prepay ? prepay.credit : null };
}
/* 結帳後更新桌上品項：整行結的標 order_id 與結帳單價；部分結帳的原行扣掉份數留在桌上，已結那幾份以新行（part_of）附在後面標 order_id */
function settleItems(items, paidLines, orderId, credit = null) {
  if (credit) return items.concat([{ ...credit, credit_of: orderId }]);
  const byLine = new Map(paidLines.map(l => [l.line, l]));
  const splits = paidLines.filter(l => l.part_of);
  const out = items.map(l => {
    const split = splits.find(x => x.part_of === l.line);
    if (split) return { ...l, qty: l.qty - split.qty };
    const paid = byLine.get(l.line);
    return paid ? { ...l, order_id: orderId, price: paid.price } : l;
  });
  return out.concat(splits.map(l => ({ ...l, order_id: orderId })));
}
/* 換桌／併桌：來源桌的未結帳品項接到目標桌後面（併桌）；已結帳的單由 server 改 session_id／桌號 */
function mergeItems(targetItems, sourceItems) {
  return (targetItems || []).concat(sourceItems || []);
}
/* 作廢出餐單：只有當個營業日的單、且未作廢過；reason 必填 */
function voidOrder(order, reason, now = Date.now()) {
  if (!order) throw Object.assign(Error('找不到這筆出餐單。'), { status: 404 });
  if (order.payer?.linepay_payment) throw Object.assign(Error('LINE Pay API 實收訂單請先由管理員辦理退款與對帳，不可直接作廢或取消品項。'), { status: 409 });
  if (order.status === 'void') throw Object.assign(Error('這張單已作廢。'), { status: 409 });
  if (order.tappay && order.tappay.rec_trade_id) throw Object.assign(Error('線上刷卡的單請先在 TapPay 後台退款，再由言文字管理員作廢。'), { status: 409 });
  if (MenuLib.businessDay(order.paid_at) !== MenuLib.businessDay(now)) throw Object.assign(Error('只能作廢當個營業日的單；更早的請聯絡言文字管理員調整報表。'), { status: 409 });
  const r = cleanText(reason, 80);
  if (!r) throw Object.assign(Error('請填寫作廢原因。'), { status: 400 });
  return r;
}
/* 更正已結帳單的付款方式（現場點錯）：整張改成單一付款方式；作廢單／線上刷卡不可改，限當個營業日（跨日要動日結報表，交言文字管理員）。
   現金→其他：清掉實收／找零；其他→現金：視為剛好收足額。每次更正留一筆 method_changes，日結與稽核可追。 */
function changePayMethod(order, method, { extraCodes, by = '', operator = null, now = Date.now() } = {}) {
  if (!order) throw Object.assign(Error('找不到這筆出餐單。'), { status: 404 });
  if (order.status === 'void') throw Object.assign(Error('這張單已作廢，不能改付款方式。'), { status: 409 });
  if (order.tappay && order.tappay.rec_trade_id) throw Object.assign(Error('線上刷卡的單不能改付款方式。'), { status: 409 });
  if (order.payer?.prepay) throw Object.assign(Error('部分付款（預收）單不能改付款方式，請作廢後重收。'), { status: 409 });
  if (MenuLib.businessDay(order.paid_at) !== MenuLib.businessDay(now)) throw Object.assign(Error('只能更正當個營業日的單；更早的請聯絡言文字管理員調整報表。'), { status: 409 });
  const m = payMethod(method, extraCodes);
  const prev = order.payer || {};
  const from = Array.isArray(prev.payments) && prev.payments.length ? prev.payments : [{ method: prev.method || 'cash', amount: Number(order.amount) || 0 }];
  if (from.length === 1 && from[0].method === m) throw Object.assign(Error('付款方式沒有變更。'), { status: 400 });
  const { payments, received, change, ...rest } = prev;
  const next = { ...rest, method: m };
  if (m === 'cash') { next.received = Number(order.amount) || 0; next.change = 0; }
  next.method_changes = [...(Array.isArray(prev.method_changes) ? prev.method_changes : []), { from, to: m, at: new Date(now).toISOString(), by: cleanText(by, 120), operator: operator ? cleanText(operator.name || operator.id, 40) : '' }].slice(-10);
  return next;
}
/* 取消已結帳單裡的單一品項（做不出來／客人退菜），不必作廢整張單：
   比照贈送把單價歸零、原價留底（regular_price），從整張單金額扣除這項小計；要原因、限當個營業日，
   線上刷卡／已開立發票的單無法只動一項（金額對不起來），只能整張作廢。最後一項未取消的不能再取消，請改走作廢整張單。 */
function voidOrderLine(order, line, reason, now = Date.now()) {
  if (!order) throw Object.assign(Error('找不到這筆出餐單。'), { status: 404 });
  if (order.payer?.linepay_payment) throw Object.assign(Error('LINE Pay API 實收訂單請先由管理員辦理退款與對帳，不可直接作廢或取消品項。'), { status: 409 });
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
  for (const l of order?.items || []) if (!l.prepay && !l.credit_of) out[MenuLib.stationOf(l)].push(l); // 預收／抵扣不是餐點，不上出餐單
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
  let amount = 0, count = 0, voided = 0, voidAmount = 0, discountAmount = 0, discountCount = 0, compCount = 0, redeemPoints = 0, redeemCount = 0, redeemValue = 0;
  for (const o of rows) {
    if (o.status === 'void') { voided++; voidAmount += Number(o.amount) || 0; continue; }
    const method = o.payer?.method || (o.tappay?.rec_trade_id ? 'tappay' : 'cash');
    const n = Number(o.amount) || 0;
    amount += n; count++;
    if (Array.isArray(o.payer?.payments) && o.payer.payments.length) for (const p of o.payer.payments) byMethod[p.method] = (byMethod[p.method] || 0) + (Number(p.amount) || 0);
    else byMethod[method] = (byMethod[method] || 0) + n;
    const disc = Number(o.payer?.discount?.amount) || 0;
    if (disc > 0) { discountAmount += disc; discountCount++; }
    compCount += (o.items || []).filter(l => l.comp_reason && !l.cancelled).length;
    const rl = (o.items || []).filter(l => l.redeem_points > 0 && !l.cancelled);
    if (rl.length) { redeemCount++; for (const l of rl) { redeemPoints += Number(l.redeem_points) || 0; redeemValue += (Number(l.regular_price) || 0) * (Number(l.qty) || 1); } }
    const h = String((new Date(o.paid_at).getUTCHours() + 8) % 24).padStart(2, '0');
    byHour[h] = (byHour[h] || 0) + n;
    for (const l of o.items || []) {
      if (l.cancelled || l.prepay || l.credit_of) continue; // 取消的品項沒出餐、預收／抵扣不是品項，不列入熱銷統計
      const key = l.item_id || l.zh;
      const prev = items.get(key) || { zh: l.zh, venue: l.venue || '', qty: 0, amount: 0 };
      prev.qty += l.qty; prev.amount += lineTotal(l);
      items.set(key, prev);
    }
  }
  return { day: MenuLib.businessDay(now), orders: count, amount, by_method: byMethod, by_hour: byHour, voided, void_amount: voidAmount, discount_amount: discountAmount, discount_count: discountCount, comp_count: compCount, redeem_points: redeemPoints, redeem_count: redeemCount, redeem_value: redeemValue, items: [...items.values()].sort((a, b) => b.qty - a.qty || b.amount - a.amount) };
}
/* 銷量／客群分析：跨營業日區間彙總（POS「銷量」「客群」分頁）。orders 已是區間內、未作廢的單；
   firstPaid = { member_id: 最早一單 ISO }（全期間，算「新客」＝第一單落在這個區間）。
   會員單＝結帳時有帶會員（payer.member_id）或套了聚落價（payer.member）；桌邊 QR 單＝有任何一行不是櫃檯加的（guest ≠ POS_GUEST）。
   星期以營業日算（凌晨的單歸前一天）。 */
function analyticsRange(query = {}, now = Date.now()) {
  const add = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
  const valid = day => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day + 'T12:00:00Z')) && add(day, 0) === day;
  const to = query.to === undefined ? MenuLib.businessDay(now) : String(query.to);
  if (!valid(to)) throw Object.assign(Error('日期格式不正確。'), { status: 400 });
  let from = query.from === undefined ? add(to, -6) : String(query.from);
  if (!valid(from) || from > to) throw Object.assign(Error('日期區間不正確。'), { status: 400 });
  if (from < add(to, -92)) from = add(to, -92);
  return { from, to, start: new Date(from + 'T03:00:00+08:00'), end: new Date(add(to, 1) + 'T03:00:00+08:00') };
}
function analyticsSummary(orders, { venues = null, from, to, firstPaid = {} } = {}) {
  const rows = (orders || []).filter(o => o.status !== 'void' && orderOwnedByVenues(o, venues) && (!from || MenuLib.businessDay(o.paid_at) >= from) && (!to || MenuLib.businessDay(o.paid_at) <= to));
  const items = new Map(), cats = new Map(), byHour = {}, byWeekday = {}, byDay = {}, byMethod = {}, members = new Map();
  const seg = () => ({ orders: 0, amount: 0 });
  const bump = (s, n) => { s.orders++; s.amount += n; };
  const segs = { member: seg(), guest: seg(), takeout: seg(), dinein: seg(), qr: seg(), counter: seg() };
  let amount = 0, qty = 0;
  const fromIso = from ? new Date(from + 'T03:00:00+08:00').toISOString() : '';
  for (const o of rows) {
    const n = Number(o.amount) || 0; amount += n;
    const day = MenuLib.businessDay(o.paid_at);
    bump(byDay[day] || (byDay[day] = { day, orders: 0, amount: 0 }), n);
    const h = String((new Date(o.paid_at).getUTCHours() + 8) % 24).padStart(2, '0');
    bump(byHour[h] || (byHour[h] = seg()), n);
    const wd = new Date(day + 'T12:00:00Z').getUTCDay();
    bump(byWeekday[wd] || (byWeekday[wd] = seg()), n);
    if (Array.isArray(o.payer?.payments) && o.payer.payments.length) for (const p of o.payer.payments) bump(byMethod[p.method] || (byMethod[p.method] = seg()), Number(p.amount) || 0);
    else { const m = o.payer?.method || (o.tappay?.rec_trade_id ? 'tappay' : 'cash'); bump(byMethod[m] || (byMethod[m] = seg()), n); }
    const mid = o.payer?.member_id ? String(o.payer.member_id) : '';
    if (mid) bump(members.get(mid) || members.set(mid, seg()).get(mid), n);
    bump(mid || o.payer?.member ? segs.member : segs.guest, n);
    bump(isTakeout(o.table_no) ? segs.takeout : segs.dinein, n);
    const lines = (o.items || []).filter(l => !l.cancelled && !l.prepay && !l.credit_of);
    bump(lines.some(l => l.guest && l.guest !== POS_GUEST) ? segs.qr : segs.counter, n);
    for (const l of lines) {
      const q = Number(l.qty) || 0, amt = lineTotal(l); qty += q;
      const key = l.item_id || l.zh;
      const it = items.get(key) || items.set(key, { id: key, zh: l.zh, cat: l.cat || 'OTHER', venue: l.venue || '', qty: 0, amount: 0, orders: 0, _last: '' }).get(key);
      it.qty += q; it.amount += amt; if (it._last !== o.id) { it.orders++; it._last = o.id; }
      const ck = l.cat || 'OTHER';
      const c = cats.get(ck) || cats.set(ck, { cat: ck, qty: 0, amount: 0 }).get(ck);
      c.qty += q; c.amount += amt;
    }
  }
  const mv = [...members.values()];
  const newMembers = [...members.keys()].filter(id => firstPaid[id] && new Date(firstPaid[id]).toISOString() >= fromIso && (!to || MenuLib.businessDay(firstPaid[id]) <= to)).length;
  const sortAmt = (a, b) => b.qty - a.qty || b.amount - a.amount;
  return {
    from, to, orders: rows.length, amount, qty, avg_ticket: rows.length ? Math.round(amount / rows.length) : 0, avg_items: rows.length ? Math.round(qty / rows.length * 10) / 10 : 0,
    by_day: Object.values(byDay).sort((a, b) => a.day < b.day ? -1 : 1), by_hour: byHour, by_weekday: byWeekday, by_method: byMethod,
    items: [...items.values()].sort(sortAmt).map(({ _last, ...it }) => it), categories: [...cats.values()].sort(sortAmt),
    customers: { ...segs, unique_members: members.size, repeat_members: mv.filter(m => m.orders >= 2).length, new_members: newMembers, member_avg_ticket: segs.member.orders ? Math.round(segs.member.amount / segs.member.orders) : 0, guest_avg_ticket: segs.guest.orders ? Math.round(segs.guest.amount / segs.guest.orders) : 0 },
  };
}
/* CSV 列（給會計）：前台 downloadCSV 已做公式注入防護，這裡只排欄位。整單折扣另列一列負數，讓「小計」欄加總＝營收 */
function salesCsvRows(orders, { venues = null, methodLabels = {} } = {}) {
  const head = ['營業日', '付款時間', '桌號', '品項', '數量', '單價', '小計', '付款方式', '聚落價', '發票狀態', '發票號碼', '狀態', '作廢原因'];
  const body = [];
  for (const o of (orders || []).filter(o => orderOwnedByVenues(o, venues))) {
    // 沒記 payer.method 的舊單（啟用付款方式紀錄之前）視同現金；自訂收款帳戶的名稱由呼叫端傳入 methodLabels
    const methodCode = o.payer?.method || (o.tappay?.rec_trade_id ? 'tappay' : 'cash');
    const labelOf = c => methodLabels[c] || PAY_METHODS[c] || c;
    const method = Array.isArray(o.payer?.payments) && o.payer.payments.length ? '混合：' + o.payer.payments.map(p => `${labelOf(p.method)} ${Number(p.amount) || 0}`).join('＋') : labelOf(methodCode);
    const paid = new Date(o.paid_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
    const inv = o.invoice || {};
    const invStatus = inv.status === 'issued' ? '已開立' : inv.status === 'failed' ? '開立失敗' : inv.status === 'void' ? '已作廢' : inv.requested ? '待補開' : '';
    const tail = [method, o.payer?.member ? '是' : '', invStatus, inv.number || '', o.status === 'void' ? '作廢' : '成立', o.void_reason || ''];
    for (const l of o.items || []) body.push([MenuLib.businessDay(o.paid_at), paid, o.table_no, l.cancelled ? `${l.zh}（已取消：${l.cancel_reason || ''}）` : l.comp_reason ? `${l.zh}（贈送：${l.comp_reason}）` : l.redeem_points > 0 ? `${l.zh}（點數兌換 ${l.redeem_points} 點，折抵 NT$${(Number(l.regular_price) || 0) * (Number(l.qty) || 1)}）` : l.zh, l.qty, l.price, lineTotal(l), ...tail]);
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
/* 桌況用：今天營業日（三點水到翌日 03:00，凌晨 00:00–02:59 的訂位算前一個營業日）已排桌號、還沒到的訂位（new／confirmed），依桌號分組、時間排序。
   只給桌況格顯示提示，不自動開桌——客人沒來的桌不該被佔住 */
function reservationsByTable(rows, now) {
  const day = MenuLib.businessDay(now);
  const next = new Date(new Date(day + 'T12:00:00Z').getTime() + 86400e3).toISOString().slice(0, 10);
  const out = {};
  for (const r of rows || []) {
    if (!['new', 'confirmed'].includes(r?.status)) continue;
    const table = cleanText(r.table_no, 8).toUpperCase();
    if (!table) continue;
    const time = String(r.reserve_time || '').slice(0, 5), early = time < '03:00';
    const date = r.reserve_date instanceof Date ? new Date(r.reserve_date.getTime() + 8 * 3600e3).toISOString().slice(0, 10) : String(r.reserve_date || '').slice(0, 10);
    if (date !== (early ? next : day)) continue;
    (out[table] = out[table] || []).push({ id: r.id, time, name: cleanText(r.name, 12), party_size: Number(r.party_size) || 0, status: r.status, sort: (early ? '2' : '1') + time });
  }
  for (const list of Object.values(out)) { list.sort((a, b) => a.sort.localeCompare(b.sort)); list.forEach(x => { delete x.sort; }); }
  return out;
}
/* 回覆客人的信（只有 confirmed／cancelled 需要寄；沒留 Email 或其他狀態回 null） */
function reservationReplyMail(r, status, { origin, staffNote }) {
  if (!r.email) return null;
  const when = `${r.reserve_date} ${r.reserve_time}（${r.period}）`;
  if (status === 'confirmed') return { to: r.email, subject: `[言文字] 訂位確認：${when}｜${r.party_size} 位`, text: `${r.name} 您好，\n\n您的訂位已確認：\n日期時間：${when}\n人數：${r.party_size} 位\n申請編號：${r.request_id}${r.table_no ? `\n桌號：${r.table_no}` : ''}${staffNote ? `\n\n店內留言：${staffNote}` : ''}\n\n若需更改請直接撥電話或回覆此信。期待您的光臨。\n\n言文字｜台灣人才聚落\n${origin}/reserve` };
  if (status === 'cancelled') return { to: r.email, subject: `[言文字] 訂位無法安排：${when}`, text: `${r.name} 您好，\n\n很抱歉，${when} 這個時段目前無法安排 ${r.party_size} 位的座位。${staffNote ? `\n\n店內留言：${staffNote}` : ''}\n\n歡迎改選其他時段再送出申請：${origin}/reserve\n\n言文字｜台灣人才聚落` };
  return null;
}

module.exports = { changePayMethod, MenuLib, TABLE_RE, TAKEOUT_RE, TAPPAY_API, PAY_METHODS, POS_GUEST, RESERVATION_LABEL, tableKey, verifyTable, tableUrl, tappayConfig, menuIndex, visibleVenues, itemInVenues, orderVisibleToVenues, orderOwnedByVenues, sessionClosableByVenues, isTakeout, nextTakeoutTable, takeoutFinished, addLine, removeLine, placeLines, serveTicket, ticketsOf, selectLines, unpaid, sum, payer, payByPrime, sessionFinished, addPayRequest, prunePayRequests, payRequestsView, PAY_REQUEST_MAX,
  payMethod, addRedeemLine, posAddLine, voidLine, editLine, discountOf, cashReceived, applyMemberPrice, redeemLines, posCheckout, partialQty, settleItems, splitPayments, cashPaid, prepayLines, mergeItems, voidOrder, voidOrderLine, elapsedMin, splitByStation, tableStatus, salesSummary, analyticsSummary, analyticsRange, salesCsvRows, parsePause, setPause, pauseFor, setSoldOut, reservationVenue, reservationTransition, reservationsByTable, reservationReplyMail, cleanText, PARTY_MAX, partyVote, partySize };
