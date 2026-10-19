/* 點數帳本（純函式）：消費累積、折抵、作廢沖回。餘額由流水重建，不另存快取。 */
'use strict';

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeTwPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const d = digits(raw);
  let nine;
  if (/^09\d{8}$/.test(d)) nine = d.slice(1);
  else if (/^9\d{8}$/.test(d)) nine = d;
  else if (/^8869\d{8}$/.test(d)) nine = d.slice(3);
  else return null;
  return '+886' + nine;
}

function earnPoints(amount, { prepay } = {}) {
  if (prepay) return 0;
  const n = Math.floor(Number(amount) || 0);
  if (!Number.isFinite(n) || n < 100) return 0;
  return Math.floor(n / 100);
}

function expiresAt(at) {
  const t = at instanceof Date ? at : new Date(at);
  const y = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Taipei', year: 'numeric' }).format(t));
  return new Date(Date.UTC(y + 1, 3, 30, 15, 59, 59, 999)).toISOString();
}

function iso(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(+d) ? null : d.toISOString();
}

function hasKind(rows, kind, refId) {
  return (rows || []).some(r => r.kind === kind && r.ref_id === refId);
}

function row(partial) {
  return {
    id: partial.id || 'yn_' + Math.random().toString(36).slice(2, 12),
    user_id: partial.user_id,
    kind: partial.kind,
    delta: partial.delta,
    brand: partial.brand || '',
    ref_type: partial.ref_type || 'order',
    ref_id: partial.ref_id,
    reason: partial.reason || '',
    operator_id: partial.operator_id || null,
    operator_name: partial.operator_name || '',
    expires_at: partial.expires_at || null,
    created_at: iso(partial.created_at) || new Date().toISOString(),
  };
}

function liveLots(rows, now = new Date()) {
  const list = Array.isArray(rows) ? rows : [];
  const voidEarn = new Set(list.filter(r => r.kind === 'void_earn').map(r => r.ref_id));
  const voidRedeem = new Set(list.filter(r => r.kind === 'void_redeem').map(r => r.ref_id));
  const lots = list
    .filter(r => (r.kind === 'earn' || r.kind === 'grant') && !voidEarn.has(r.ref_id))
    .map(r => ({ remaining: r.delta, expires_at: r.expires_at, created_at: r.created_at }))
    .filter(l => !l.expires_at || new Date(l.expires_at) > now)
    .sort((a, b) => String(a.expires_at || '9999').localeCompare(String(b.expires_at || '9999')) || String(a.created_at).localeCompare(String(b.created_at)));
  for (const r of list) {
    if (r.kind !== 'redeem' || voidRedeem.has(r.ref_id)) continue;
    let need = Math.max(0, -Number(r.delta) || 0);
    for (const l of lots) {
      if (need <= 0) break;
      const take = Math.min(l.remaining, need);
      l.remaining -= take;
      need -= take;
    }
  }
  return lots;
}

function balance(rows, now = new Date()) {
  return liveLots(rows, now).reduce((s, l) => s + l.remaining, 0);
}

function applyEarn(rows, { userId, orderId, amount, brand, at, prepay } = {}) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  if (!orderId || hasKind(list, 'earn', orderId)) return { rows: list, delta: 0 };
  const delta = earnPoints(amount, { prepay });
  if (delta <= 0) return { rows: list, delta: 0 };
  const created = at ? new Date(at) : new Date();
  list.push(row({
    user_id: userId,
    kind: 'earn',
    delta,
    brand: brand || '',
    ref_id: orderId,
    expires_at: expiresAt(created),
    created_at: created,
  }));
  return { rows: list, delta };
}

/* POS 手動給點：必須有原因與經手人，帳本留痕；效期同消費累積 */
const MAX_GRANT = 1000;
const REVIEW_POINTS = 5;   // Google 地圖評論獎勵（每位會員一次）
function applyGrant(rows, { userId, points, reason, operator, at } = {}) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  const n = Number(points);
  if (!Number.isInteger(n) || n < 1 || n > MAX_GRANT) throw Object.assign(Error(`給點須為 1–${MAX_GRANT} 的整數。`), { status: 400 });
  const why = String(reason || '').replace(/[\x00-\x1f]/g, ' ').trim().slice(0, 200);
  if (why.length < 2) throw Object.assign(Error('請填寫給點原因。'), { status: 400 });
  if (!operator || !operator.id) throw Object.assign(Error('請先輸入 4 位數識別碼，給點要記是誰操作的。'), { status: 400 });
  const created = at ? new Date(at) : new Date();
  const rec = row({
    user_id: userId, kind: 'grant', delta: n, ref_type: 'manual',
    ref_id: 'gr_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36),
    reason: why, operator_id: operator.id, operator_name: operator.name || '',
    expires_at: expiresAt(created), created_at: created,
  });
  list.push(rec);
  return { rows: list, delta: n, rec };
}

function applyVoidEarn(rows, { orderId } = {}) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  if (!orderId || hasKind(list, 'void_earn', orderId)) return { rows: list, delta: 0 };
  const earn = list.find(r => r.kind === 'earn' && r.ref_id === orderId);
  if (!earn) return { rows: list, delta: 0 };
  const delta = -earn.delta;
  list.push(row({
    user_id: earn.user_id,
    kind: 'void_earn',
    delta,
    brand: earn.brand,
    ref_id: orderId,
    expires_at: earn.expires_at,
    created_at: new Date(),
  }));
  return { rows: list, delta };
}

/* 點數可兌換的空間時數方案；每種要幾點由後台設定（site_content.yan_rewards = {"day_4h":點數,"day_12h":點數}），0 或沒設＝不開放 */
const SPACE_PLANS = ['day_4h', 'day_12h'];
function parseSpaceRewards(value) {
  let j = {};
  try { j = typeof value === 'string' ? JSON.parse(value || '{}') : (value || {}); } catch { j = {}; }
  const out = {};
  for (const p of SPACE_PLANS) out[p] = Math.max(0, Math.min(1000000, Math.floor(Number(j && j[p])) || 0));
  return out;
}

function applyRedeem(rows, { orderId, points, amount, userId, at, now, refType } = {}) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  if (!orderId || hasKind(list, 'redeem', orderId)) return { rows: list, delta: 0, used: 0 };
  const n = Number(points);
  const due = Math.max(0, Math.floor(Number(amount) || 0));
  if (!Number.isInteger(n) || n < 1) throw Object.assign(Error('折抵點數須為正整數。'), { status: 400 });
  if (amount !== undefined && n > due) throw Object.assign(Error('兌換點數不得超過上限。'), { status: 400 });
  const avail = balance(list, now || at || new Date());
  if (n > avail) throw Object.assign(Error('點數不足。'), { status: 400 });
  list.push(row({
    user_id: userId || (list[0] && list[0].user_id),
    kind: 'redeem',
    delta: -n,
    ref_type: refType || 'order',
    ref_id: orderId,
    expires_at: null,
    created_at: at || new Date(),
  }));
  return { rows: list, delta: -n, used: n };
}

function applyVoidRedeem(rows, { orderId } = {}) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  if (!orderId || hasKind(list, 'void_redeem', orderId)) return { rows: list, delta: 0 };
  const redeem = list.find(r => r.kind === 'redeem' && r.ref_id === orderId);
  if (!redeem) return { rows: list, delta: 0 };
  const delta = -redeem.delta;
  list.push(row({
    user_id: redeem.user_id,
    kind: 'void_redeem',
    delta,
    ref_id: orderId,
    expires_at: null,
    created_at: new Date(),
  }));
  return { rows: list, delta };
}

function cardClaims({ id, name } = {}) {
  return { sub: id, ent: 'yan-card', plan: 'yan-card', name: String(name || '').slice(0, 40) };
}

function publicYan(rows, now = new Date()) {
  const bal = balance(rows, now);
  return { balance: bal, count: (rows || []).length };
}

module.exports = {
  normalizeTwPhone, SPACE_PLANS, parseSpaceRewards, earnPoints, expiresAt, balance, liveLots,
  applyEarn, applyGrant, MAX_GRANT, REVIEW_POINTS, applyVoidEarn, applyRedeem, applyVoidRedeem,
  cardClaims, publicYan, hasKind,
};
