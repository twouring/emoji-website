'use strict';
/* 會計對帳報表（admin「會計對帳」分頁，KK 11/15）：跨營業日區間，依法人 → 品牌 → 營業日彙總。
 * 純函式：輸入已依開帳日認列好 ledger_day 的單、帳本、LINE Pay／中信交易，不碰 DB，可直接測。
 * 口徑與日結一致：營收不含打賞（代收轉付）、作廢另列；收款方式金額＝實收（含打賞，對得上錢櫃與收單後台）。
 * 發票：已開立金額＝ezPay 開立時的金額（不含打賞）；稅額依含稅總額 /1.05 拆（同 ezpay-invoice.taxIncluded）。 */
const tableOrders = require('./table-orders');
const linepay = require('./linepay');
const ctbc = require('./ctbc');
const { GROUP_OF } = require('./pos-payment-methods');
const { invoiceOrder, taxIncluded } = require('./ezpay-invoice');

const { MenuLib, PAY_METHODS, orderTip } = tableOrders;
const VENUES = ['CAFE', 'BAR', 'STAY', 'REST'];
const VENUE_LABEL = { CAFE: '在咖啡', BAR: '三點水', STAY: '等等空間', REST: '約書旅' };
/* 法人：沿用收款帳戶分組（言文字＝在咖啡＋三點水；遊遊＝等等空間＋約書旅，KK 11/11） */
const ENTITY_LABEL = { FNB: '言文字股份有限公司', SPACE: '遊遊股份有限公司' };
const entityOf = v => GROUP_OF[v] || '';
const MAX_DAYS = 93;

const addDay = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
const validDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && addDay(d, 0) === d;
function range(query = {}, now = Date.now()) {
  const today = MenuLib.businessDay(now);
  const to = query.to === undefined || query.to === '' ? today : String(query.to);
  const from = query.from === undefined || query.from === '' ? to.slice(0, 8) + '01' : String(query.from);
  if (!validDay(from) || !validDay(to) || from > to) throw Object.assign(Error('日期區間不正確。'), { status: 400 });
  if (from < addDay(to, -(MAX_DAYS - 1))) throw Object.assign(Error(`區間最多 ${MAX_DAYS} 天。`), { status: 400 });
  const days = []; for (let d = from; d <= to; d = addDay(d, 1)) days.push(d);
  return { from, to, days, start: new Date(from + 'T03:00:00+08:00'), end: new Date(addDay(to, 1) + 'T03:00:00+08:00') };
}
const venueOfOrder = o => ((Array.isArray(o.items) ? o.items : []).find(l => l && l.venue) || {}).venue || '';
const iso = x => x ? new Date(x).toISOString() : null;
const tpe = x => x ? new Date(x).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '';
const dayStr = d => d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10);

function invoiceInfo(o) {
  const inv = o.invoice || {};
  const status = inv.status === 'issued' ? 'issued' : inv.status === 'void' ? 'void' : inv.status === 'failed' ? 'failed' : inv.requested ? 'pending' : 'none';
  const amount = status === 'issued' ? Math.max(0, Math.round(Number(invoiceOrder(o).amount) || 0)) : 0;
  return { status, amount, number: inv.number || '', buyer_ubn: inv.buyer_ubn || '', issued_at: inv.issued_at || '', mode: inv.mode || '' };
}
const INV_LABEL = { issued: '已開立', void: '已作廢', failed: '開立失敗', pending: '待補開', none: '未開立' };

function blank() { return { orders: 0, amount: 0, collected: 0, service: 0, discount: 0, tip: 0, voided: 0, void_amount: 0, by_method: {}, invoice_count: 0, invoice_amount: 0, invoice_tax: 0, uninvoiced: 0, invoice_failed: 0, invoice_pending: 0, cash_diff: 0, linepay_pos: 0, linepay_actual: 0, ctbc_pos: 0, ctbc_actual: 0 }; }
function addInto(t, r) {
  for (const k of Object.keys(t)) if (typeof t[k] === 'number') t[k] += Number(r[k]) || 0;
  for (const [m, n] of Object.entries(r.by_method || {})) t.by_method[m] = (t.by_method[m] || 0) + n;
}

/* orders：含 ledger_day（開帳日認列），欄位同日結；registers：區間內帳本；linepayTxs／ctbcTxs：區間內交易 */
function build({ from, to, days, orders = [], registers = [], linepayTxs = [], ctbcTxs = [], methodLabels = {} }) {
  const labelOf = c => methodLabels[c] || PAY_METHODS[c] || c;
  const byDay = new Map(days.map(d => [d, []]));
  for (const o of orders) { const d = o.ledger_day || MenuLib.businessDay(o.paid_at); if (byDay.has(d)) byDay.get(d).push(o); }
  const regsByDay = new Map(days.map(d => [d, []]));
  for (const r of registers) { const d = dayStr(r.day); if (regsByDay.has(d)) regsByDay.get(d).push({ ...r, day: d }); }
  const txDay = t => MenuLib.businessDay(t.paid_at);   // 收單交易依 03:00 換日，同日結
  const lpByDay = new Map(days.map(d => [d, []])), ctByDay = new Map(days.map(d => [d, []]));
  for (const t of linepayTxs) lpByDay.get(txDay(t))?.push(t);
  for (const t of ctbcTxs) ctByDay.get(txDay(t))?.push(t);

  const rows = [], issues = [], invoiceRows = [];
  for (const day of days) {
    const dayOrders = byDay.get(day), regs = regsByDay.get(day);
    const lp = linepay.reconcile(dayOrders, lpByDay.get(day), { registers: regs });
    const ct = ctbc.reconcile(dayOrders, ctByDay.get(day), { registers: regs });
    for (const v of VENUES) {
      const vo = dayOrders.filter(o => venueOfOrder(o) === v);
      const vr = regs.filter(r => r.venue === v);
      const lpv = lp.by_venue[v] || { pos: {}, linepay: {} }, ctv = ct.by_venue[v] || { pos: {}, ctbc: {} };
      if (!vo.length && !vr.length && !lpv.linepay.amount && !ctv.ctbc.amount) continue;
      const s = tableOrders.salesSummary(vo, { venues: null });
      const live = vo.filter(o => o.status !== 'void');
      let invCount = 0, invAmount = 0, invTax = 0, failed = 0, pending = 0;
      for (const o of live) {
        const inv = invoiceInfo(o);
        if (inv.status === 'issued') { invCount++; invAmount += inv.amount; invTax += taxIncluded(inv.amount).TaxAmt; }
        if (inv.status === 'failed') failed++;
        if (inv.status === 'pending') pending++;
      }
      const closed = vr.length > 0 && vr.every(r => r.closed_at);
      const cashDiff = vr.reduce((a, r) => a + (r.closed_at ? Number(r.diff) || 0 : 0), 0);
      const row = {
        day, venue: v, venue_label: VENUE_LABEL[v], entity: entityOf(v), entity_label: ENTITY_LABEL[entityOf(v)] || '',
        orders: s.orders, amount: s.amount, collected: s.collected, service: s.service_amount, discount: s.discount_amount, tip: s.tip_amount,
        voided: s.voided, void_amount: s.void_amount, by_method: s.by_method,
        invoice_count: invCount, invoice_amount: invAmount, invoice_tax: invTax, uninvoiced: Math.max(0, s.amount - invAmount), invoice_failed: failed, invoice_pending: pending,
        register: vr.length ? (closed ? 'closed' : 'open') : 'none', registers: vr.length, cash_diff: cashDiff,
        linepay_pos: lpv.pos.amount || 0, linepay_actual: lpv.linepay.amount || 0, ctbc_pos: ctv.pos.amount || 0, ctbc_actual: ctv.ctbc.amount || 0,
      };
      rows.push(row);
      const tag = `${day} ${VENUE_LABEL[v]}`;
      if (s.orders && row.register === 'none') issues.push({ level: 'warn', day, venue: v, text: `${tag}：有 ${s.orders} 張單但沒有開帳紀錄` });
      if (row.register === 'open') issues.push({ level: 'warn', day, venue: v, text: `${tag}：帳本未關帳，數字為暫計` });
      if (cashDiff) issues.push({ level: 'warn', day, venue: v, text: `${tag}：現金短溢 ${cashDiff > 0 ? '+' : ''}${cashDiff}` });
      if (row.linepay_actual !== row.linepay_pos) issues.push({ level: 'warn', day, venue: v, text: `${tag}：LINE Pay 實收 ${row.linepay_actual}／POS 登記 ${row.linepay_pos}，差 ${row.linepay_actual - row.linepay_pos}` });
      if (row.ctbc_actual !== row.ctbc_pos) issues.push({ level: 'warn', day, venue: v, text: `${tag}：中信刷卡實收 ${row.ctbc_actual}／POS 登記 ${row.ctbc_pos}，差 ${row.ctbc_actual - row.ctbc_pos}` });
      if (failed) issues.push({ level: 'warn', day, venue: v, text: `${tag}：發票開立失敗 ${failed} 張` });
      if (pending) issues.push({ level: 'info', day, venue: v, text: `${tag}：發票待補開 ${pending} 張` });
      for (const o of vo) {
        const inv = invoiceInfo(o), tip = o.status === 'void' ? 0 : orderTip(o), n = Number(o.amount) || 0, revenue = o.status === 'void' ? 0 : n - tip;
        const tax = taxIncluded(revenue);
        const pays = Array.isArray(o.payer?.payments) && o.payer.payments.length ? o.payer.payments.map(p => `${labelOf(p.method)} ${Number(p.amount) || 0}`).join('＋') : labelOf(o.payer?.method || (o.tappay?.rec_trade_id ? 'tappay' : 'cash'));
        invoiceRows.push([ENTITY_LABEL[entityOf(v)] || '', VENUE_LABEL[v], day, tpe(o.paid_at), o.table_no || '', o.id, o.status === 'void' ? '作廢' : '成立', n, tip, revenue, tax.Amt, tax.TaxAmt,
          Number(o.payer?.service_charge?.amount) || 0, Number(o.payer?.discount?.amount) || 0, pays, INV_LABEL[inv.status], inv.number, inv.amount || '', inv.buyer_ubn, tpe(inv.issued_at), o.void_reason || '']);
      }
    }
  }
  // 彙總：品牌、法人、全部
  const byVenue = {}, byEntity = {}, total = blank();
  for (const r of rows) {
    addInto(byVenue[r.venue] ||= { ...blank(), label: r.venue_label, entity: r.entity }, r);
    addInto(byEntity[r.entity] ||= { ...blank(), label: r.entity_label, venues: [] }, r);
    if (!byEntity[r.entity].venues.includes(r.venue)) byEntity[r.entity].venues.push(r.venue);
    addInto(total, r);
  }
  // 付款方式欄：依區間內實際出現的方式（固定順序在前）
  const ORDER = ['cash', 'ctbc', 'linepay', 'transfer', 'stripe', 'tappay', 'other'];
  const methods = [...new Set(rows.flatMap(r => Object.keys(r.by_method)))].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
  const method_labels = Object.fromEntries(methods.map(m => [m, labelOf(m)]));
  const dailyHead = ['法人', '店別', '營業日', '帳本', '單數', '營收（含稅，不含打賞）', '未稅', '稅額', '服務費', '折扣', '打賞代收', '實收合計', ...methods.map(m => `收款：${method_labels[m]}`), '發票張數', '發票金額', '發票稅額', '未開發票營收', '作廢單數', '作廢金額', '現金短溢', 'LINE Pay POS', 'LINE Pay 實收', 'LINE Pay 差額', '中信 POS', '中信實收', '中信差額'];
  const REG = { closed: '已關帳', open: '未關帳', none: '無帳本' };
  const line = (a, b, c, reg, r) => { const t = taxIncluded(r.amount); return [a, b, c, reg, r.orders, r.amount, t.Amt, t.TaxAmt, r.service, r.discount, r.tip, r.collected, ...methods.map(m => r.by_method[m] || 0), r.invoice_count, r.invoice_amount, r.invoice_tax, r.uninvoiced, r.voided, r.void_amount, r.cash_diff, r.linepay_pos, r.linepay_actual, r.linepay_actual - r.linepay_pos, r.ctbc_pos, r.ctbc_actual, r.ctbc_actual - r.ctbc_pos]; };
  const daily = [dailyHead, ...rows.map(r => line(r.entity_label, r.venue_label, r.day, REG[r.register], r))];
  for (const [v, t] of Object.entries(byVenue)) daily.push(line(ENTITY_LABEL[t.entity] || '', t.label, `${from}～${to} 小計`, '', t));
  for (const t of Object.values(byEntity)) daily.push(line(t.label, '（法人合計）', `${from}～${to}`, '', t));
  const invoiceHead = ['法人', '店別', '營業日', '結帳時間', '桌號', '單號', '狀態', '實收', '打賞代收', '營收（含稅）', '未稅', '稅額', '服務費', '折扣', '付款方式', '發票狀態', '發票號碼', '發票金額', '買方統編', '發票開立時間', '作廢原因'];
  return { from, to, days: days.length, rows, by_venue: byVenue, by_entity: byEntity, total, methods, method_labels, issues,
    csv: { daily, invoices: [invoiceHead, ...invoiceRows], linepay: linepay.csvRows(days.flatMap(d => linepay.reconcile(byDay.get(d), lpByDay.get(d), { registers: regsByDay.get(d) }).rows)), ctbc: ctbc.csvRows(days.flatMap(d => ctbc.reconcile(byDay.get(d), ctByDay.get(d), { registers: regsByDay.get(d) }).rows)) } };
}

module.exports = { VENUES, VENUE_LABEL, ENTITY_LABEL, entityOf, MAX_DAYS, range, build, invoiceInfo, venueOfOrder };
