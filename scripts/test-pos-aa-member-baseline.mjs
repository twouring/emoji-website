// 平均分攤（AA）× 會員價／點數／聚落價：現行行為基準測試（t_307c6426，2026-11-15 盤點）
// 這份測試「釘住現況」，不是規格：之後若選定方案 1（每人帶會員）或方案 2（分攤鎖會員），
// 預期會有幾項斷言要跟著改，改的時候請在斷言旁註明是哪個決策改掉的。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders.js');
const Y = require('../lib/yan.js');
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ops = read('public/pos-ops.js');
const server = read('server.js');

// 在咖啡兩項：拿鐵 150×2、司康 100×1，原價合計 400；聚落價（九折）135×2＋90＝360
const menuAll = new Map([
  ['latte', { id: 'latte', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price: 150, published: true }],
  ['scone', { id: 'scone', venue: 'CAFE', cat: 'FOOD', zh: '司康', price: 100, published: true, points: 3 }],
]);
const items = () => [
  { line: 'L1', item_id: 'latte', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price: 150, qty: 2, by: '阿明', placed_at: 't' },
  { line: 'S1', item_id: 'scone', venue: 'CAFE', cat: 'FOOD', zh: '司康', price: 100, qty: 1, by: '小美', placed_at: 't' },
];
// 照 POS 的流程跑完前 N−1 人：每人收 floor(原價合計 ÷ N)，回傳桌上品項（含抵扣行）
function prepayFirst(people, its = items()) {
  const gross = T.sum(T.unpaid(its)), each = Math.floor(gross / people), orders = [];
  for (let k = 1; k < people; k++) {
    const o = T.posCheckout(its, { prepay: each, split: { people, index: k }, method: 'cash', member: true }, menuAll, []);
    its = T.settleItems(its, o.lines, 'to_p' + k, o.credit);
    orders.push(o);
  }
  return { its, gross, each, orders };
}

test('伺服器：前 N−1 人是預收單，就算帶 member:true 也不套會員價、不累點，payer.member=false', () => {
  const { each, orders } = prepayFirst(3);
  assert.equal(each, 133);
  for (const o of orders) {
    assert.equal(o.amount, 133);
    assert.equal(o.payer.prepay, true);
    assert.equal(o.payer.member, false, 'posCheckout 對預收強制 member=false');
    assert.equal(o.lines.length, 1, '預收單只有一行「平均分攤 第 k／N 人」，不綁任何品項');
    assert.equal(o.lines[0].item_id, '');
    assert.equal(o.discount, null);
    assert.equal(o.service, null, '服務費由前端算進分攤金額，預收單不另算');
  }
  assert.equal(Y.earnPoints(133, { prepay: true }), 0, '預收單一律 0 點');
  const r = Y.applyEarn([], { userId: 'u1', orderId: 'to_p1', amount: 133, prepay: true });
  assert.equal(r.delta, 0); assert.equal(r.rows.length, 0);
});

test('伺服器：最後一人帶會員時，聚落價套到全桌所有未結品項，前面已收的原價份額照扣，差額全歸最後一人', () => {
  const { its, each } = prepayFirst(3);
  const fin = T.posCheckout(its, { method: 'card', member: true }, menuAll, []);
  const memberTotal = 135 * 2 + 90;   // 360
  assert.equal(fin.amount, memberTotal - each * 2, '最後一人 = 全桌聚落價 − 前兩人原價份額 = 360 − 266 = 94');
  assert.equal(fin.amount, 94);
  const goods = fin.lines.filter(l => !l.credit_of);
  assert.deepEqual(goods.map(l => [l.line, l.price, l.regular_price]), [['L1', 135, 150], ['S1', 90, 100]], '全桌品項都改成聚落價');
  assert.equal(fin.lines.filter(l => l.credit_of).length, 2, '兩行抵扣仍是原價份額 −133');
  assert.equal(fin.payer.member, true);
  // 沒帶會員時最後一人 = 400 − 266 = 134；帶會員省下的 40 元全在最後一人身上
  assert.equal(T.posCheckout(its, { method: 'card' }, menuAll, []).amount, 134);
  // 點數只算最後這張單的實收（revenue）
  assert.equal(fin.revenue, 94); assert.equal(Y.earnPoints(fin.revenue), 0, '94 元不到 100，0 點');
  assert.equal(Y.earnPoints(T.posCheckout(its, { method: 'card' }, menuAll, []).revenue), 1);
  // 結清後桌上全部有 order_id → 伺服器同交易自動清桌
  assert.equal(T.unpaid(T.settleItems(its, fin.lines, 'to_fin')).length, 0);
});

test('伺服器：會員點數兌換也只在最後一人，兌換的品項以 0 元計，可能讓最後一人應收為負而被擋（400）', () => {
  const { its } = prepayFirst(2);   // 前 1 人收 200
  // 兌換司康（0 元）＋聚落價拿鐵 270 → 270 − 200 = 70，還過得去
  const ok = T.posCheckout(its, { method: 'cash', member: true, redeem_lines: ['S1'] }, menuAll, []);
  assert.equal(ok.amount, 70); assert.equal(ok.payer.yan_redeem_points, 3);
  // 4 人分攤：前 3 人各 100 已收 300；最後一人兌換司康＋聚落價 → 270 − 300 = −30 → 400
  const four = prepayFirst(4);
  assert.throws(() => T.posCheckout(four.its, { method: 'cash', member: true, redeem_lines: ['S1'] }, menuAll, []), e => e.status === 400 && /已預收的金額超過/.test(e.message));
});

test('伺服器：只結最後一人時，聚落價差額可能大到讓應收 < 0，整桌卡住（400）', () => {
  // 單價 emo 很低的品項：原價 1000、聚落價 100；10 人分攤前 9 人各 100 已收 900 → 最後一人 100 − 900 < 0
  const m = new Map([['set', { id: 'set', venue: 'CAFE', cat: 'FOOD', zh: '大份', price: 1000, emo: 100, published: true }]]);
  let its = [{ line: 'X', item_id: 'set', venue: 'CAFE', cat: 'FOOD', zh: '大份', price: 1000, qty: 1, placed_at: 't' }];
  for (let k = 1; k < 10; k++) { const o = T.posCheckout(its, { prepay: 100, split: { people: 10, index: k }, method: 'cash' }, m, []); its = T.settleItems(its, o.lines, 'p' + k, o.credit); }
  assert.throws(() => T.posCheckout(its, { method: 'cash', member: true }, m, []), e => e.status === 400);
  assert.equal(T.posCheckout(its, { method: 'cash' }, m, []).amount, 100, '不帶會員就能結');
});

test('伺服器：預收單事後也不能補入會員（attachMemberCheck 409）', () => {
  const now = Date.parse('2026-11-15T08:00:00Z');
  assert.throws(() => T.attachMemberCheck({ status: 'paid', paid_at: new Date(now).toISOString(), payer: { prepay: true, split: { people: 3, index: 1 } } }, now), e => e.status === 409 && /預收/.test(e.message));
  assert.match(server, /if\(memberUser\)\{try\{yanOut=await applyYanForCheckout\(client,\{user:memberUser,orderId,amount:out\.revenue,[^\n]*?prepay:!!out\.payer\.prepay/, 'checkout 累點時把 prepay 傳進去');
});

test('缺口記錄：伺服器沒有拒絕「預收＋會員」，若前端送 member_id，payer.member 會被改寫成會籍狀態（與實際未套會員價不一致）', () => {
  // posCheckout 先把 member 設 false，server.js 拿到 memberUser 後無條件覆寫 payer.member=memberActive
  assert.match(server, /if\(memberUser\)\{out\.payer=\{\.\.\.out\.payer,member:memberActive,member_id:memberUser\.id,/);
  assert.doesNotMatch(server, /prepay[^\n]{0,80}member_id[^\n]{0,40}400/, '目前沒有「預收不可帶會員」的檢查');
});

// ---- 前端（public/pos-ops.js）----
// 從 pos-ops.js 取出 posTotals 與分攤計算那一行，在 vm 裡實際跑，確認畫面上的金額
function frontCtx(state) {
  const src = ops.slice(ops.indexOf('function posTotals(cur){'));
  const fn = src.slice(0, src.indexOf('\n}\n') + 2);
  const aaLine = ops.match(/\n\s*(aa=POS_AA\?\(\(\)=>\{[^\n]*?\}\)\(\):null;)/)[1];
  const MenuLib = require('../public/menu-lib.js') || globalThis.MenuLib;
  const ctx = vm.createContext({ MenuLib: { ...(globalThis.MenuLib || MenuLib), HUB_PRICE_ON: true }, MENU_DOC: { items: [...menuAll.values()] }, POS_YAN: {}, POS_MEMBER: false, POS_PICK: null, POS_QTY: {}, POS_DISCOUNT: null, POS_SVC_WAIVE: null, POS_AA: null, ...state });
  vm.runInContext(fn + `\nfunction aaOf(cur,checkoutLines){let aa;${aaLine}return aa;}`, ctx);
  return ctx;
}

test('前端：分攤金額以「原價」計（不看聚落價），前 N−1 人應收固定 floor(原價 ÷ N)', () => {
  const ctx = frontCtx({ POS_AA: { people: 3 }, POS_MEMBER: true });
  const cur = { takeout: false, lines: items() };
  const aa = ctx.aaOf(cur, cur.lines);
  assert.deepEqual({ ...aa }, { people: 3, index: 1, gross: 400, each: 133, last: false });
  const t = ctx.posTotals(cur);
  assert.equal(t.total, 360, '同一畫面的 posTotals 已是聚落價 360，但第 1 人照收 133（原價份額）');
  assert.match(ops, /if\(aa&&!aa\.last\)total=aa\.each;/);
});

test('前端：最後一人應收 = posTotals（含聚落價）− 已預收，聚落價差額全由最後一人吃下；與伺服器一致', () => {
  const { its } = prepayFirst(3);
  const ctx = frontCtx({ POS_AA: { people: 3 }, POS_MEMBER: true });
  const cur = { takeout: false, lines: its };
  const aa = ctx.aaOf(cur, its);
  assert.equal(aa.index, 3); assert.equal(aa.last, true);
  assert.equal(ctx.posTotals(cur).total, 94, '畫面應收 = 360 − 266');
  assert.equal(T.posCheckout(its, { method: 'card', member: true }, menuAll, []).amount, 94, '伺服器同額');
});

test('前端：前 N−1 人送出的 body 不帶任何會員欄位；會員、點數、來源調查只在最後一人送', () => {
  const i = ops.indexOf("host.querySelector('#pos-checkout').onclick=");
  const body = ops.slice(i, ops.indexOf('const unserved=', i));
  const prepayBody = body.match(/body:\{prepay:aa\.each[^\n]*?operator_id:OPERATOR\?\.id\}/)[0];
  for (const k of ['member', 'member_id', 'member_phone', 'redeem_lines', 'source', 'discount']) assert.ok(!new RegExp('\\b' + k + '\\b').test(prepayBody), `預收 body 不含 ${k}`);
  const finBody = ops.slice(ops.indexOf("body:{method,payments,source:POS_SOURCE"), ops.indexOf("body:{method,payments,source:POS_SOURCE") + 400);
  assert.match(finBody, /member:POS_MEMBER,member_id,member_phone,redeem_lines:/, '最後一人（及一般結帳）才帶會員');
  assert.match(ops, /\$\{aa&&!aa\.last\?'':`<div class="pos-blk pos-blk--source/, '來源調查只在最後一人出現');
});

test('缺口記錄：分攤模式沒有鎖會員入口；前 N−1 人收款後也不清 POS_YAN／POS_MEMBER，先輸入的會員會一路帶到最後一人', () => {
  // startAA 只清折扣、勾選、份數等，不清會員
  const start = ops.match(/function startAA\(people\)\{[^\n]*\}/)[0];
  assert.doesNotMatch(start, /POS_MEMBER|POS_YAN/);
  // 會員入口按鈕在 AA 時照常顯示（沒有 aa 判斷）
  assert.match(ops, /<button type="button" class="pos-member-entry \$\{POS_YAN\.name\|\|POS_YAN\.phone\?'has':''\}" id="pos-member-open"/);
  // 預收成功後只清這幾個，不含 POS_YAN／POS_MEMBER
  const after = ops.match(/\(\)=>\{POS_SPLIT=\{\};POS_RECEIVED='';POS_INV_VALS=\{\};POS_INVOICE\.mode='paper';return reload\(\);\}/);
  assert.ok(after, '預收完成後的清除動作');
  assert.doesNotMatch(after[0], /POS_MEMBER|POS_YAN/);
});

test('前端：分攤時折扣被清掉、折扣列隱藏；聚落價列仍顯示', () => {
  assert.match(ops, /function startAA\(people\)\{POS_AA=\{people\};POS_PICK=null;POS_QTY=\{\};POS_DISCOUNT=null;/);
  assert.match(ops, /<div class="pos-sum-disc" \$\{aa\?'hidden':''\}>/);
  assert.match(ops, /\$\{MenuLib\.HUB_PRICE_ON&&\(POS_YAN\.id\|\|memberSaving>0\)\?`<div class="pos-sum-member">/, '聚落價列沒有 aa 判斷（只受總開關控制）');
});

test('LINE Pay API 收款：分攤、會員一律擋（前後端）', () => {
  assert.match(read('lib/linepay-pos.js'), /\['split','lines','quantities','member','member_id','member_phone','member_token','discount','redeem_lines','payments','prepay','received'\]/);
  assert.match(ops, /if\(POS_AA\|\|POS_PICK\|\|Object\.keys\(POS_QTY\)\.length\|\|POS_MEMBER\|\|POS_YAN\.id\|\|POS_DISCOUNT\|\|POS_METHOD==='mixed'\)/);
});
