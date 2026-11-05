'use strict';
/* POS MCP（KK 11/5）：讓各品牌（子租戶）的 AI 代理以 MCP 串接自己品牌的 POS。
 * 傳輸：Streamable HTTP 無狀態模式，POST /api/mcp 收 JSON-RPC、回 application/json。
 * 身分：品牌金鑰 pmk_<cafe|bar|stay|rest>_<32 字>＝HMAC(APP_SECRET, 'pos-mcp:<版本>:<品牌>')，不必另存資料；
 *   換版本（POS_MCP_KEY_VERSION）＝全部金鑰作廢。金鑰在 auth() 換成「只有該品牌」的後台身分，
 *   沿用既有 posScope／visibleVenues 隔離，另外只放行 ALLOW 白名單路徑（會員、員工、設定一律碰不到）。
 * 工具內部以同一把金鑰呼叫本機既有 REST API（call），不另寫一套查詢。 */
const crypto = require('crypto');
const { safeEqual } = require('./security');
require('../public/menu-lib.js');   // 掛到 globalThis.MenuLib
const ML = globalThis.MenuLib;

const VENUES = { cafe: 'CAFE', bar: 'BAR', stay: 'STAY', rest: 'REST' };
const LABEL = { CAFE: '在咖啡', BAR: '三點水', STAY: '等等空間', REST: '約書旅' };
const KEY_RE = /^pmk_(cafe|bar|stay|rest)_([A-Za-z0-9_-]{32})$/;
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

function keyFor(venue, secret, version = 'v1') {
  const slug = Object.keys(VENUES).find(k => VENUES[k] === venue);
  if (!slug || !secret) return '';
  const mac = crypto.createHmac('sha256', secret).update(`pos-mcp:${version}:${venue}`).digest('base64url').slice(0, 32);
  return `pmk_${slug}_${mac}`;
}
/* 品牌金鑰 → 品牌代碼；不是有效金鑰回 null */
function venueOfKey(token, secret, version = 'v1') {
  const m = KEY_RE.exec(String(token || ''));
  if (!m || !secret) return null;
  const venue = VENUES[m[1]];
  return safeEqual(token, keyFor(venue, secret, version)) ? venue : null;
}

/* 品牌金鑰能打的路徑（method path 完全比對）；其他 /api 一律 403 */
const ALLOW = new Set([
  'POST /api/mcp',
  'GET /api/admin/registers', 'GET /api/admin/orders', 'GET /api/admin/orders/history', 'GET /api/admin/sales',
  'GET /api/admin/analytics', 'GET /api/admin/reservations', 'GET /api/admin/inventory', 'GET /api/admin/orders/feedback',
  'POST /api/admin/menu/sold-out',
]);
const allowed = (method, path) => ALLOW.has(`${String(method).toUpperCase()} ${path}`);

const DAY = { type: 'string', description: '營業日 YYYY-MM-DD（台北 03:00 換日），不填＝今天' };
const VENUE_ARG = { type: 'string', enum: ['CAFE', 'BAR', 'STAY', 'REST'], description: '品牌（只有總公司金鑰需要；品牌金鑰固定為自己品牌）' };
const obj = (props = {}, required = []) => ({ type: 'object', properties: { venue: VENUE_ARG, ...props }, required, additionalProperties: false });
const RO = { readOnlyHint: true, openWorldHint: false };

const TOOLS = [
  { name: 'pos_status', title: '目前營運狀態', description: '這個品牌現在有沒有開帳、開帳時間、帳上現金與營收、開著的桌數與未結金額。', inputSchema: obj(), annotations: RO },
  { name: 'pos_tables', title: '桌況', description: '目前每桌（含外帶 W 號）的狀態、未結品項與金額、人數。', inputSchema: obj(), annotations: RO },
  { name: 'pos_sales', title: '日結營收', description: '某營業日的營收、單數、付款方式分布、熱銷品項、折扣與作廢。', inputSchema: obj({ day: DAY }), annotations: RO },
  { name: 'pos_orders', title: '查單', description: '某營業日的訂單清單（最新在前），可用桌號／金額／發票號碼／單號尾碼搜尋。', inputSchema: obj({ day: DAY, q: { type: 'string', description: '搜尋字串（選填）' }, limit: { type: 'integer', minimum: 1, maximum: 200, description: '最多幾筆，預設 50' } }), annotations: RO },
  { name: 'pos_analytics', title: '銷量與客群分析', description: '日期區間（最長 93 天）的營收趨勢、時段、星期、品項排行、會員占比、來客數與外國客比例。', inputSchema: obj({ from: { type: 'string', description: 'YYYY-MM-DD，預設 6 天前' }, to: { type: 'string', description: 'YYYY-MM-DD，預設今天' } }), annotations: RO },
  { name: 'pos_reservations', title: '訂位', description: '從某天起 N 天內的訂位（狀態、人數、桌號、備註）與待確認數。', inputSchema: obj({ from: { type: 'string', description: 'YYYY-MM-DD，預設今天' }, days: { type: 'integer', minimum: 1, maximum: 60, description: '預設 7' } }), annotations: RO },
  { name: 'pos_menu', title: '菜單與估清', description: '這個品牌目前上架的品項、價格、是否估清、今日剩餘份數。', inputSchema: obj({ include_unpublished: { type: 'boolean', description: '含未上架品項，預設否' } }), annotations: RO },
  { name: 'pos_inventory', title: '庫存', description: '庫存品項現量、安全量、均價；可只列低於安全量的。', inputSchema: obj({ low_only: { type: 'boolean', description: '只列低於安全量，預設否' } }), annotations: RO },
  { name: 'pos_feedback', title: '客人回饋', description: '桌邊點餐留下的回饋與平均滿意度。', inputSchema: obj({ from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } }), annotations: RO },
  { name: 'pos_set_sold_out', title: '估清／恢復供應', description: '把品項設為今日售完（隔天 03:00 自動恢復）或恢復供應。只能改自己品牌的品項；品項 id 先用 pos_menu 查。', inputSchema: obj({ item_id: { type: 'string' }, sold_out: { type: 'boolean', description: 'true＝估清，false＝恢復供應' } }, ['item_id', 'sold_out']), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
];

const qs = o => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v)); const s = p.toString(); return s ? '?' + s : ''; };
const lineText = l => `${l.zh || l.name || l.item_id}×${l.qty || 1}`;
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o && o[k] !== undefined).map(k => [k, o[k]]));

/* 各工具：args（已補 venue）→ 結果物件；call(method, path, body) 打本機 API，回 {status, data} */
const RUN = {
  async pos_status(a, call) {
    const r = (await call('GET', '/api/admin/registers' + qs({ venue: a.venue }))).data;
    const reg = r.current?.[a.venue] || null;
    const o = (await call('GET', '/api/admin/orders' + qs({ venue: a.venue }))).data;
    const open = (o.sessions || []).filter(s => s.state !== 'empty');
    return {
      venue: a.venue, label: LABEL[a.venue], day: r.day,
      register: reg ? { state: reg.closed_at ? 'closed' : 'open', opened_at: reg.opened_at, closed_at: reg.closed_at || null, opened_by: reg.opened_by || null, opening_cash: reg.opening_cash, cash_sales: reg.cash_sales, sales: reg.sales ? pick(reg.sales, ['orders', 'amount', 'collected', 'by_method', 'voided']) : null } : { state: 'none' },
      open_tables: open.length, unpaid_amount: open.reduce((s, x) => s + (Number(x.unpaid_amount) || 0), 0),
      waiting_tickets: (o.orders || []).length, ordering_pause: o.pause?.[a.venue] || null,
    };
  },
  async pos_tables(a, call) {
    const o = (await call('GET', '/api/admin/orders' + qs({ venue: a.venue }))).data;
    return { venue: a.venue, tables: (o.sessions || []).map(s => ({ table: s.table, takeout: s.takeout, state: s.state, party: s.party_size ?? null, kids: s.kids ?? null, foreign: s.foreign ?? null, staff: s.operator, unpaid_amount: s.unpaid_amount, unpaid: (s.lines || []).map(lineText), opened_at: s.created_at, pickup_at: s.pickup_at })) };
  },
  async pos_sales(a, call) {
    const d = (await call('GET', '/api/admin/sales' + qs({ venue: a.venue, day: a.day }))).data;
    const out = pick(d, ['day', 'orders', 'amount', 'collected', 'by_method', 'by_hour', 'voided', 'void_amount', 'discount_amount', 'discount_count', 'comp_count', 'redeem_points', 'redeem_count', 'tip_amount', 'service_charge']);
    out.items = (d.items || []).slice(0, 30);
    if (d.linepay) out.linepay = pick(d.linepay, ['synced_at', 'diff', 'pos', 'linepay']);
    if (d.ctbc) out.ctbc = pick(d.ctbc, ['synced_at', 'diff', 'pos', 'ctbc', 'sync_error']);
    return { venue: a.venue, ...out };
  },
  async pos_orders(a, call) {
    const d = (await call('GET', '/api/admin/orders/history' + qs({ venue: a.venue, day: a.day, q: a.q }))).data;
    const limit = Math.min(200, Math.max(1, Number(a.limit) || 50));
    return { venue: a.venue, day: d.day, count: d.count, orders: (d.orders || []).slice(0, limit).map(o => ({ id: o.id, no: String(o.id || '').slice(-6).toUpperCase(), table: o.table_no, amount: o.amount, status: o.status, paid_at: o.paid_at, method: o.payer?.method || null, member: !!(o.user_id || o.payer?.member_id), invoice: o.invoice?.number || o.invoice?.InvoiceNumber || null, void_reason: o.void_reason || null, items: (o.items || []).filter(l => !l.cancelled_at).map(lineText) })) };
  },
  async pos_analytics(a, call) {
    const d = (await call('GET', '/api/admin/analytics' + qs({ venue: a.venue, from: a.from, to: a.to }))).data;
    return { venue: a.venue, ...pick(d, ['from', 'to', 'orders', 'amount', 'qty', 'avg_ticket', 'avg_items', 'by_day', 'by_hour', 'by_weekday', 'by_method', 'categories', 'customers', 'visitors']), items: (d.items || []).slice(0, 30) };
  },
  async pos_reservations(a, call) {
    const d = (await call('GET', '/api/admin/reservations' + qs({ venue: a.venue, from: a.from, days: a.days }))).data;
    return { venue: a.venue, from: d.from, days: d.days, pending: d.pending, reservations: (d.reservations || []).map(r => pick(r, ['id', 'reserve_date', 'reserve_time', 'party_size', 'name', 'status', 'table_no', 'note', 'internal_note', 'source'])) };
  },
  async pos_menu(a, call) {
    const d = (await call('GET', '/api/public')).data;
    const items = ML.forVenue(ML.parseMenuDoc(d.content?.menu).items, a.venue).filter(it => a.include_unpublished || it.published !== false);
    return { venue: a.venue, business_day: ML.businessDay(), items: items.map(it => ({ id: it.id, name: it.zh, en: it.en || '', cat: it.cat, price: it.price, published: it.published !== false, sold_out: ML.soldOutToday(it), stock_left: ML.stockLeft(it) })) };
  },
  async pos_inventory(a, call) {
    const d = (await call('GET', '/api/admin/inventory' + qs({ venue: a.venue }))).data;
    let items = (d.items || []).map(i => ({ id: i.id, name: i.name, unit: i.unit, qty: i.qty, safety_qty: i.safety_qty, avg_cost: i.avg_cost, category: i.category, supplier: i.supplier, low: i.safety_qty != null && i.qty < i.safety_qty }));
    if (a.low_only) items = items.filter(i => i.low);
    return { venue: a.venue, low: d.low, items };
  },
  async pos_feedback(a, call) {
    const d = (await call('GET', '/api/admin/orders/feedback' + qs({ venue: a.venue, from: a.from, to: a.to }))).data;
    return { venue: a.venue, count: d.count, avg_rating: d.avg_rating, feedback: (d.feedback || []).slice(0, 100).map(f => pick(f, ['created_at', 'table_no', 'kind', 'rating', 'text', 'name', 'lang'])) };
  },
  async pos_set_sold_out(a, call) {
    const r = await call('POST', '/api/admin/menu/sold-out', { item_id: String(a.item_id || ''), sold_out: a.sold_out === true, venue: a.venue });
    return { venue: a.venue, item_id: a.item_id, ...r.data };
  },
};

class ToolError extends Error {}

/* 一個 JSON-RPC 訊息 → 回應物件（通知回 null）。ctx = { venue（品牌金鑰的品牌，總公司金鑰為 null）, call } */
async function handle(msg, ctx) {
  const id = msg && msg.id;
  const isNote = !msg || id === undefined || id === null;
  const ok = result => (isNote ? null : { jsonrpc: '2.0', id, result });
  const fail = (code, message) => (isNote ? null : { jsonrpc: '2.0', id, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Invalid Request');
  const p = msg.params || {};
  switch (msg.method) {
    case 'initialize': {
      const v = PROTOCOLS.includes(p.protocolVersion) ? p.protocolVersion : PROTOCOLS[0];
      return ok({ protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'emoji-pos', title: '言文字 POS', version: '1.0.0' },
        instructions: ctx.venue ? `這把金鑰只能看／改「${LABEL[ctx.venue]}」(${ctx.venue}) 的 POS 資料。金額單位新台幣元；營業日台北 03:00 換日。` : '總公司金鑰：各工具可帶 venue（CAFE 在咖啡／BAR 三點水／STAY 等等空間／REST 約書旅）。' });
    }
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': {
      const run = RUN[p.name];
      if (!run) return fail(-32602, `Unknown tool: ${p.name}`);
      const args = { ...(p.arguments || {}) };
      if (ctx.venue) args.venue = ctx.venue;                    // 品牌金鑰：一律鎖自己品牌，忽略傳入的 venue
      else if (!args.venue) return ok({ content: [{ type: 'text', text: '請帶 venue（CAFE／BAR／STAY／REST）。' }], isError: true });
      try {
        const data = await run(args, async (method, path, body) => {
          const r = await ctx.call(method, path, body);
          if (r.status >= 400) throw new ToolError((r.data && r.data.error) || `HTTP ${r.status}`);
          return r;
        });
        return ok({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data });
      } catch (e) {
        if (!(e instanceof ToolError)) console.error('[pos-mcp]', p.name, e);
        return ok({ content: [{ type: 'text', text: e instanceof ToolError ? e.message : '查詢失敗，請稍後再試。' }], isError: true });
      }
    }
    default:
      if (msg.method.startsWith('notifications/')) return null;
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

module.exports = { VENUES, LABEL, TOOLS, ALLOW, allowed, keyFor, venueOfKey, handle };
