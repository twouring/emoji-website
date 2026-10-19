'use strict';
/* POS 庫存：原物料（raw）與備料（prep，醬料、高湯、糖漿等店內先做好的半成品）
 * - 進貨（in）加庫存並更新平均單位成本；報廢（waste）、手動耗用（use）扣庫存；盤點（count）直接改成實點數量並記盤差
 * - 製作備料（make）：輸入產出量，依「每批配方 ÷ 每批產出量」等比扣原物料，再把備料加進庫存
 * - 出餐自動扣：品項送出點餐（出餐單成立）時依菜單配方扣，套餐依各組成品項扣；同一行只扣一次（ref_key＝line:<行號>）
 * - 送單後、出餐前作廢的品項自動回補（ref_key＝void:<行號>）；已出餐或已結帳的單作廢不回補（餐點已做），差異用盤點調整
 * 純函式，不碰資料庫；server.js 只負責接線。庫存可為負數（先賣後補登進貨），不會自動估清。 */

const KINDS = { raw: '原物料', prep: '備料' };
const VENUES = ['TTH', 'CAFE', 'BAR'];   // TTH＝兩店共用（例如牛奶、醬料共用一桶）
const VENUE_LABEL = { TTH: '共用', CAFE: '在咖啡', BAR: '三點水' };
const MOVE_TYPES = {
  in: '進貨', use: '耗用', waste: '報廢', count: '盤點', make: '製作備料',
  prep_use: '備料耗用', sale: '出餐扣庫存', void_back: '作廢回補', convert: '換算單位',
};
const MANUAL_TYPES = ['in', 'use', 'waste', 'count', 'make'];
const STORAGE = { chill: '冷藏', freeze: '冷凍', dry: '常溫乾貨' };
const MAX_QTY = 1e7;

const bad = (message, status = 400) => Object.assign(Error(message), { status });
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const round3 = n => Math.round(Number(n) * 1000) / 1000;
const round2 = n => Math.round(Number(n) * 100) / 100;
// 成本到小數 4 位：每 g 成本常只有 0.0x 元（例：梅漬番茄液 0.0147 元/g），2 位會把它變 0.01
const round4 = n => Math.round(Number(n) * 1e4) / 1e4;
function num(v, { min = 0, max = MAX_QTY, allowZero = true, label = '數量' } = {}) {
  if (v === '' || v == null) throw bad(`請輸入${label}。`);
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (!allowZero && n === 0)) throw bad(`${label}須為 ${allowZero ? min : '大於 ' + min} 到 ${max} 之間的數字。`);
  return round3(n);
}

/* 庫存品項設定（新增／修改共用）；cur＝修改時的原資料（沒帶的欄位沿用） */
function itemInput(body = {}, cur = null) {
  const pick = (k, d) => (body[k] !== undefined ? body[k] : cur ? cur[k] : d);
  const name = clean(pick('name', ''), 40);
  if (!name) throw bad('請填寫品名。');
  const kind = String(pick('kind', 'raw'));
  if (!KINDS[kind]) throw bad('類型只能是原物料或備料。');
  const unit = clean(pick('unit', ''), 10);
  if (!unit) throw bad('請填寫單位（例如 g、ml、個、份）。');
  const venue = String(pick('venue', 'TTH') || 'TTH').toUpperCase();
  if (!VENUES.includes(venue)) throw bad('店別只能是共用、在咖啡或三點水。');
  const safety = num(pick('safety_qty', 0) === '' ? 0 : pick('safety_qty', 0), { label: '安全庫存量' });
  let yieldQty = null;
  if (kind === 'prep') yieldQty = num(pick('batch_yield', 1), { min: 0, allowZero: false, label: '每批產出量' });
  const category = clean(pick('category', ''), 20);
  // 進貨包裝：例如庫存單位 g、進貨單位「斤」＝600；沒填＝直接用庫存單位進貨
  const packUnit = clean(pick('pack_unit', ''), 10);
  let packSize = null;
  if (packUnit) packSize = num(pick('pack_size', ''), { min: 0, allowZero: false, label: '每一進貨單位的數量' });
  // 使用率（可食率）：出餐與製作備料依配方的「淨用量 ÷ 使用率」扣毛重；1＝沒有耗損
  const yr = pick('yield_rate', 1);
  const yieldRate = yr === '' || yr == null ? 1 : num(yr, { min: 0.05, max: 1, label: '使用率' });
  // 參考成本（元／庫存單位）：還沒有進貨紀錄、沒有均價時，配方成本用它（例：Drive 食材成本表的每克成本）
  const rc = pick('ref_cost', '');
  let refCost = null;
  if (rc !== '' && rc != null) { const n = Number(rc); if (!Number.isFinite(n) || n < 0 || n > 1e6) throw bad('參考成本要是 0 以上的數字。'); refCost = round4(n); }
  const sl = pick('shelf_life', '');
  const shelfLife = clean(sl, 40);
  return { name, kind, unit, venue, safety_qty: safety, batch_yield: yieldQty, category, shelf_life: shelfLife, ref_cost: refCost, storage: STORAGE[pick('storage', '')] ? pick('storage', '') : '', supplier: clean(pick('supplier', ''), 30), pack_unit: packUnit, pack_size: packUnit ? packSize : null, yield_rate: yieldRate, note: clean(pick('note', ''), 120), active: pick('active', true) !== false };
}

/* 改庫存單位：factor＝1 個舊單位等於幾個新單位（斤→g 填 600）。庫存量、安全量 ×factor，均價、包裝換算 ÷／×factor；
   引用這個品項的菜單配方與備料配方，用量也要 ×factor（由 server 依回傳的 factor 更新） */
function convertInput(body = {}, item) {
  if (!item) throw bad('找不到這個庫存品項。', 404);
  const unit = clean(body.unit, 10);
  if (!unit) throw bad('請填寫新單位。');
  const factor = num(body.factor, { min: 0, max: 1e6, allowZero: false, label: '換算倍數' });
  return {
    unit, factor,
    qty: round3((Number(item.qty) || 0) * factor),
    safety_qty: round3((Number(item.safety_qty) || 0) * factor),
    avg_cost: item.avg_cost == null ? null : Math.round(Number(item.avg_cost) / factor * 1e4) / 1e4,
    ref_cost: item.ref_cost == null ? null : Math.round(Number(item.ref_cost) / factor * 1e4) / 1e4,
    batch_yield: item.batch_yield == null ? null : round3(Number(item.batch_yield) * factor),
    pack_size: item.pack_size == null ? null : round3(Number(item.pack_size) * factor),
  };
}
const scaleLines = (lines, invId, factor) => (Array.isArray(lines) ? lines : []).map(l => (l.inv_id === invId ? { ...l, qty: round3(Number(l.qty) * factor) } : l));
/* 淨用量 → 要扣的毛重 */
const grossOf = (qty, item) => round3(Number(qty) / (Number(item?.yield_rate) > 0 ? Number(item.yield_rate) : 1));

/* 配方：[{inv_id, qty}]（菜單品項每份用量；備料每批用量）。去重、去 0，最多 30 項 */
function recipeInput(lines, items, { selfId = null } = {}) {
  if (!Array.isArray(lines)) throw bad('配方格式不正確。');
  if (lines.length > 30) throw bad('一個配方最多 30 項。');
  const byId = new Map((items || []).map(i => [i.id, i]));
  const out = new Map();
  for (const l of lines) {
    const id = String(l?.inv_id || '');
    if (!byId.has(id)) throw bad('配方裡有找不到的庫存品項，請重新整理。');
    if (selfId && id === selfId) throw bad('備料配方不能包含自己。');
    const q = num(l?.qty, { min: 0, allowZero: false, label: `「${byId.get(id).name}」用量` });
    out.set(id, round3((out.get(id) || 0) + q));
  }
  return [...out].map(([inv_id, qty]) => ({ inv_id, qty }));
}

/* 手動庫存操作 → { type, delta, unit_cost, amount, note, produced? }；item＝目前資料（含 qty） */
function moveInput(body = {}, item) {
  if (!item) throw bad('找不到這個庫存品項。', 404);
  if (item.active === false) throw bad('這個品項已停用。', 409);
  const type = String(body.type || '');
  if (!MANUAL_TYPES.includes(type)) throw bad('操作只能是進貨、耗用、報廢、盤點或製作備料。');
  const note = clean(body.note, 120);
  const cur = Number(item.qty) || 0;
  if (type === 'count') {
    const counted = num(body.counted ?? body.qty, { min: -MAX_QTY, label: '盤點數量' });
    return { type, delta: round3(counted - cur), counted, unit_cost: null, amount: null, note };
  }
  if (type === 'make' && item.kind !== 'prep') throw bad('只有備料可以「製作」。');
  if (type === 'waste' && !note) throw bad('請填寫報廢原因。');
  const has = k => body[k] !== undefined && body[k] !== '' && body[k] != null;
  if (type === 'in') {
    // 用進貨單位登記：packs＝幾斤／幾盒／幾瓶，依品項的「每一進貨單位＝幾個庫存單位」換算
    let q, packs = null;
    if (has('packs')) {
      if (!item.pack_unit || !(Number(item.pack_size) > 0)) throw bad('這個品項沒有設定進貨單位，請直接輸入數量。');
      packs = num(body.packs, { min: 0, allowZero: false, label: '進貨數量' });
      q = round3(packs * Number(item.pack_size));
    } else q = num(body.qty, { min: 0, allowZero: false });
    let unitCost = null, amount = null;
    if (has('amount')) { amount = num(body.amount, { max: 1e8, label: '進貨金額' }); unitCost = round4(amount / q); }
    else if (has('unit_cost')) { unitCost = round4(num(body.unit_cost, { max: 1e6, label: '單位成本' })); amount = round2(unitCost * q); }
    return { type, delta: q, unit_cost: unitCost, amount, note, ...(packs != null ? { packs } : {}) };
  }
  const q = num(body.qty, { min: 0, allowZero: false });
  return { type, delta: type === 'make' ? q : -q, unit_cost: null, amount: null, note, ...(type === 'make' ? { produced: q } : {}) };
}

/* 平均單位成本：進貨時加權平均；庫存≤0 時直接用這批的單價 */
function nextAvgCost(item, delta, unitCost) {
  const cur = Number(item.qty) || 0, avg = item.avg_cost == null ? null : Number(item.avg_cost);
  if (unitCost == null || !(delta > 0)) return avg;
  if (cur <= 0 || avg == null) return round4(unitCost);
  return round4((cur * avg + delta * unitCost) / (cur + delta));
}

/* 製作備料：產出 produced 單位 → 依每批配方等比算出要扣的原物料 [{inv_id, qty}] */
function makePlan(prep, produced, bom, itemsById = null) {
  const y = Number(prep?.batch_yield) || 1;
  const ratio = Number(produced) / y;
  return (bom || []).map(b => ({ inv_id: b.inv_id, qty: grossOf(Number(b.qty) * ratio, itemsById?.get(b.inv_id)) })).filter(b => b.qty > 0);
}

/* 出餐自動扣：送出的品項行 → [{ref_key, line, inv_id, qty}]
 * recipes：Map(menu_item_id → [{inv_id, qty}])。套餐：本身配方（例如外帶杯）＋各組成品項的配方，都乘以份數。
 * 取消、預收、部分付款的抵扣行、沒有菜單 id 的行（例如「其他」沒設配方）都不扣。 */
function consumptionFor(lines, recipes, itemsById = null) {
  const out = [];
  for (const l of lines || []) {
    if (!l || l.cancelled || l.prepay || l.credit_of || !l.line) continue;
    const n = Number(l.qty) || 0;
    if (!(n > 0)) continue;
    const sum = new Map();
    const add = id => { for (const r of recipes.get(id) || []) sum.set(r.inv_id, (sum.get(r.inv_id) || 0) + Number(r.qty) * n); };
    if (l.item_id) add(l.item_id);
    for (const p of Array.isArray(l.parts) ? l.parts : []) if (p && p.item_id) add(p.item_id);
    for (const [inv_id, qty] of sum) if (qty > 0) out.push({ ref_key: 'line:' + l.line, line: l.line, inv_id, qty: grossOf(qty, itemsById?.get(inv_id)) });
  }
  return out;
}
/* 需要讀哪些菜單配方 */
function recipeIdsOf(lines) {
  const ids = new Set();
  for (const l of lines || []) { if (l?.item_id) ids.add(l.item_id); for (const p of Array.isArray(l?.parts) ? l.parts : []) if (p?.item_id) ids.add(p.item_id); }
  return [...ids];
}
/* 作廢時要回補的行：送單後（placed_at）、還沒出餐（served_at）、沒結帳（order_id）就被拿掉的行 */
function restorableRemoved(before, after) {
  const keep = new Set((after || []).map(l => l.line));
  return (before || []).filter(l => l && !keep.has(l.line) && l.placed_at && !l.served_at && !l.order_id);
}

/* 每克（每單位）成本：原物料＝平均進貨成本；備料＝每批配方成本 ÷ 每批產出量（遞迴、防循環）。沒有均價的原物料回 null。 */
function unitCostOf(id, byId, seen = new Set()) {
  const it = byId.get(id);
  if (!it) return null;
  const own = it.avg_cost != null ? Number(it.avg_cost) : it.ref_cost != null ? Number(it.ref_cost) : null;
  if (it.kind !== 'prep' || !(it.bom || []).length) return own;
  if (seen.has(id)) return null;
  seen.add(id);
  let total = 0;
  for (const b of it.bom) { const c = unitCostOf(b.inv_id, byId, seen); if (c == null) { seen.delete(id); return own; } total += c * grossOf(b.qty, byId.get(b.inv_id)); }
  seen.delete(id);
  return round4(total / (Number(it.batch_yield) || 1));
}
/* 菜單品項成本：每份配方毛重 × 單位成本；missing＝缺均價的品項名（成本會偏低） */
function menuCost(lines, byId, price) {
  let cost = 0; const missing = [];
  for (const l of lines || []) { const it = byId.get(l.inv_id); const c = unitCostOf(l.inv_id, byId); if (c == null) { missing.push(it?.name || l.inv_id); continue; } cost += c * grossOf(l.qty, it); }
  cost = round2(cost);
  return { cost, ratio: price > 0 ? Math.round(cost / price * 1000) / 1000 : null, missing };
}

const visible = (item, venues) => !venues || item.venue === 'TTH' || venues.includes(item.venue);
// 低於安全量，或庫存已是負數（先賣後沒補登進貨）都要提醒
const isLow = item => item.active !== false && (Number(item.qty) < 0 || (Number(item.safety_qty) > 0 && Number(item.qty) <= Number(item.safety_qty)));

/* 列表排序：低於安全量的排前面，其次類型（原物料→備料）、分類、品名 */
function sortItems(items) {
  return [...(items || [])].sort((a, b) => (a.active === false) - (b.active === false) || isLow(b) - isLow(a) || (a.kind === b.kind ? 0 : a.kind === 'raw' ? -1 : 1) || String(a.category || '').localeCompare(String(b.category || ''), 'zh-Hant') || String(a.name).localeCompare(String(b.name), 'zh-Hant'));
}

function movesCsv(moves, itemsById = new Map()) {
  const head = ['時間', '品項', '單位', '操作', '變動', '結存', '單位成本', '金額', '備註', '經手人', '關聯'];
  const t = x => new Date(x).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
  return [head, ...(moves || []).map(m => { const it = itemsById.get(m.inv_id) || {}; return [t(m.created_at), it.name || m.inv_id, it.unit || '', MOVE_TYPES[m.type] || m.type, Number(m.delta), m.qty_after == null ? '' : Number(m.qty_after), m.unit_cost == null ? '' : Number(m.unit_cost), m.amount == null ? '' : Number(m.amount), m.note || '', m.operator_name || m.actor || '', m.ref_key || '']; })];
}

module.exports = { KINDS, VENUES, VENUE_LABEL, MOVE_TYPES, MANUAL_TYPES, STORAGE, convertInput, scaleLines, grossOf, unitCostOf, menuCost, itemInput, recipeInput, moveInput, nextAvgCost, makePlan, consumptionFor, recipeIdsOf, restorableRemoved, visible, isLow, sortItems, movesCsv, round3 };
