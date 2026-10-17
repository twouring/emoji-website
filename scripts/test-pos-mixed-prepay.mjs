import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders.js');
const items = () => [
  { line: 'a1', item_id: 'x', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price: 100, qty: 3 },
  { line: 'b2', item_id: 'y', venue: 'CAFE', cat: 'FOOD', zh: '司康', price: 50, qty: 1 },
];
const menu = new Map();
test('混合付款：合計等於應收才過，payer 記 payments，method=mixed', () => {
  const out = T.posCheckout(items(), { payments: [{ method: 'cash', amount: 200 }, { method: 'card', amount: 150 }], received: 500 }, menu, []);
  assert.equal(out.amount, 350); assert.equal(out.payer.method, 'mixed');
  assert.deepEqual(out.payer.payments, [{ method: 'cash', amount: 200 }, { method: 'card', amount: 150 }]);
  assert.equal(out.payer.received, 500); assert.equal(out.payer.change, 300, '找零只對現金那筆算');
  assert.throws(() => T.posCheckout(items(), { payments: [{ method: 'cash', amount: 200 }, { method: 'card', amount: 100 }] }, menu, []), /不符/);
  assert.throws(() => T.posCheckout(items(), { payments: [{ method: 'cash', amount: 0 }, { method: 'card', amount: 350 }] }, menu, []), /正整數/);
  assert.throws(() => T.posCheckout(items(), { payments: [{ method: 'bogus', amount: 100 }, { method: 'card', amount: 250 }] }, menu, []), /付款方式/);
  assert.throws(() => T.posCheckout(items(), { payments: [{ method: 'cash', amount: 100 }, { method: 'card', amount: 250 }], received: 50 }, menu, []), /實收/);
  const single = T.posCheckout(items(), { payments: [{ method: 'linepay', amount: 350 }] }, menu, []);
  assert.equal(single.payer.method, 'linepay'); assert.equal(single.payer.payments, undefined);
});
test('cashPaid：整單現金全額、混合只算現金、刷卡 0', () => {
  assert.equal(T.cashPaid({ method: 'cash' }, 350), 350);
  assert.equal(T.cashPaid({ method: 'mixed', payments: [{ method: 'cash', amount: 200 }, { method: 'card', amount: 150 }] }, 350), 200);
  assert.equal(T.cashPaid({ method: 'card' }, 350), 0);
  assert.equal(T.cashPaid({ method: 'mixed', payments: [{ method: 'cash', amount: 900 }] }, 350), 350, '不超過單上金額');
});
test('日結 by_method 依混合付款拆到各方式；CSV 付款方式欄列出各筆', () => {
  const orders = [
    { status: 'paid', amount: 350, paid_at: '2026-10-16T04:00:00Z', payer: { method: 'mixed', payments: [{ method: 'cash', amount: 200 }, { method: 'card', amount: 150 }] }, items: items() },
    { status: 'paid', amount: 100, paid_at: '2026-10-16T04:10:00Z', payer: { method: 'cash' }, items: [items()[1]] },
  ];
  const rep = T.salesSummary(orders, { now: new Date('2026-10-16T05:00:00Z') });
  assert.equal(rep.by_method.cash, 300); assert.equal(rep.by_method.card, 150); assert.equal(rep.amount, 450);
  const csv = T.salesCsvRows(orders);
  assert.match(csv[1][7], /^混合：現金 200＋信用卡 150$/);
});
test('先收部分金額：開「部分付款」單、桌上留負數抵扣行、下次結帳自動扣', () => {
  const its = items();
  const pre = T.posCheckout(its, { prepay: 200, method: 'cash', received: 200 }, menu, []);
  assert.equal(pre.amount, 200); assert.equal(pre.payer.prepay, true);
  assert.equal(pre.lines.length, 1); assert.equal(pre.lines[0].prepay, true); assert.equal(pre.lines[0].zh, '部分付款');
  assert.equal(pre.credit.price, -200);
  const next = T.settleItems(its, pre.lines, 'to_pre', pre.credit);
  assert.equal(next.length, 3);
  const credit = next.find(l => l.credit_of === 'to_pre');
  assert.ok(credit && !credit.order_id); assert.equal(T.sum(T.unpaid(next)), 150);
  assert.ok(!next.some(l => l.order_id === 'to_pre'), '部分付款行不留在桌上');
  // 預收不上出餐單
  assert.deepEqual(T.splitByStation({ items: pre.lines }), { bar: [], kitchen: [] });
  // 抵扣行不能改／作廢
  assert.throws(() => T.editLine(next, credit.line, { qty: 2 }), /預收/);
  assert.throws(() => T.voidLine(next, credit.line, '誤按'), /預收/);
  // 最後結清：抵扣自動扣
  const fin = T.posCheckout(next, { method: 'card' }, menu, []);
  assert.equal(fin.amount, 150); assert.equal(fin.lines.length, 3);
  const settled = T.settleItems(next, fin.lines, 'to_fin');
  assert.equal(T.unpaid(settled).length, 0);
  assert.equal(settled.find(l => l.credit_of === 'to_pre').order_id, 'to_fin');
});
test('預收金額限制：正整數且小於未結金額；不套會員價／折扣', () => {
  for (const bad of [0, -5, 1.5, 'x', 350, 400]) assert.throws(() => T.posCheckout(items(), { prepay: bad, method: 'cash' }, menu, []), e => e.status === 400, String(bad));
  const out = T.posCheckout(items(), { prepay: 100, method: 'card', member: true, discount: { type: 'percent', value: 50, reason: 'x' } }, menu, []);
  assert.equal(out.amount, 100); assert.equal(out.discount, null); assert.equal(out.payer.member, false);
});
test('抵扣超過這次勾選的品項金額時 400', () => {
  const its = items();
  const pre = T.posCheckout(its, { prepay: 300, method: 'cash' }, menu, []);
  const next = T.settleItems(its, pre.lines, 'to_pre', pre.credit);
  const credit = next.find(l => l.credit_of);
  assert.throws(() => T.posCheckout(next, { method: 'cash', lines: ['b2', credit.line] }, menu, []), /預收/);
});
test('前端與伺服器接線：混合付款 UI、先收部分金額、作廢退現金看 cashPaid', () => {
  const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ops, /code:'mixed',label:'混合付款'/, '結帳頁不放混合付款按鈕，每單本來就可多次收款');
  assert.match(ops, /data-split=/); assert.doesNotMatch(ops, /id="pos-prepay"/, '先收部分金額已移除：直接收款，結清自動清桌');
  assert.match(ops, /body:\{method,payments,member:POS_MEMBER/);
  assert.match(ops, /const refundCash=cashPaidOf\(order\)>0&&await posConfirm\('這次作廢/);
  assert.match(ops, /const refundCash=cashPaidOf\(order\)>0&&await posConfirm\('取消品項/);
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /tableOrders\.settleItems\(s\.items,out\.lines,orderId,out\.credit\)/);
  assert.match(server, /const cash=tableOrders\.cashPaid\(payer,order\.amount\);/);
  assert.match(server, /cash_refund=req\.body\?\.refund_cash===true\?tableOrders\.cashPaid\(o\.payer,o\.amount\):0/);
  assert.match(server, /Math\.min\(refund,tableOrders\.cashPaid\(o\.payer,o\.amount\)\)/);
  assert.match(server, /o\.payer\?\.prepay\?s\.items\.filter\(l=>l\.order_id!==o\.id&&l\.credit_of!==o\.id\)/);
  assert.match(server, /這筆預收已抵扣在後面的結帳單/);
});

test('平均分攤多次收款：前 N−1 人走預收單（品名標第 k／N 人、payer.split），最後一人收剩餘；POS 有入口、分次收款鍵、分攤時不套折扣', () => {
  const its = items();
  const gross = T.sum(T.unpaid(its));
  const each = Math.floor(gross / 3);
  const p1 = T.posCheckout(its, { prepay: each, split: { people: 3, index: 1 }, method: 'cash', received: each }, menu, []);
  assert.equal(p1.lines[0].zh, '平均分攤 第 1／3 人'); assert.deepEqual(p1.payer.split, { people: 3, index: 1 }); assert.equal(p1.payer.prepay, true);
  let next = T.settleItems(its, p1.lines, 'to_s1', p1.credit);
  const p2 = T.posCheckout(next, { prepay: each, split: { people: 3, index: 2 }, method: 'linepay' }, menu, []);
  assert.equal(p2.lines[0].zh, '平均分攤 第 2／3 人');
  next = T.settleItems(next, p2.lines, 'to_s2', p2.credit);
  assert.equal(next.filter(l => l.credit_of).length, 2);
  const fin = T.posCheckout(next, { method: 'card' }, menu, []);
  assert.equal(fin.amount, gross - each * 2, '最後一人＝全桌減前面已收（含尾差）');
  assert.equal(T.unpaid(T.settleItems(next, fin.lines, 'to_fin')).length, 0);
  // 沒帶 split 的預收仍是「部分付款」
  assert.equal(T.posCheckout(items(), { prepay: 100, method: 'cash' }, menu, []).lines[0].zh, '部分付款');
  const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
  assert.match(ops, /POS_PAYREQ=null,POS_AA=null,/);
  assert.match(ops, /function startAA\(people\)\{POS_AA=\{people\};POS_PICK=null;POS_QTY=\{\};POS_DISCOUNT=null;/);
  assert.match(ops, /id="pos-aa-open"/); assert.match(ops, /id="pos-aa-clear"/);
  assert.match(ops, /index=cur\.lines\.filter\(l=>l\.credit_of\)\.length\+1/, '第幾人由桌上抵扣行數推算');
  assert.match(ops, /if\(aa&&!aa\.last\)total=aa\.each;/);
  assert.match(ops, /body:\{prepay:aa\.each,split:\{people:aa\.people,index:aa\.index\},method,payments,invoice:invoiceBody\(host\),received:rec,operator_id:OPERATOR\?\.id\}/);
  assert.match(ops, /\$\{aa\?\(aa\.last\?'收最後一人':`收第 \$\{aa\.index\}／\$\{aa\.people\} 人`\)\+' ':'收款 '\}NT\$/);
  assert.match(ops, /<div class="pos-sum-disc" \$\{aa\?'hidden':''\}>/, '分攤時折扣列隱藏');
  assert.match(ops, /POS_RECEIVED='';POS_AA=null;paintPos\(\);/, '換桌／返回桌況會離開分攤模式');
});
