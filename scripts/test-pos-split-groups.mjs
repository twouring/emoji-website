import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders.js');
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ops = read('public/pos-ops.js');

function groupsLib() {
  const ctx = vm.createContext({ Map, Set, String });
  vm.runInContext(ops.slice(ops.indexOf('const ordererOf='), ops.indexOf('function kitchenTicketSpec(')), ctx);
  // 頂層 const 不會掛到 context 物件上，要用運算式取回
  return { lineGroups: vm.runInContext('lineGroups', ctx) };
}

test('lineGroups：依點餐人分組、照第一次出現順序；櫃檯代點自成一組；預收抵扣行最後', () => {
  const { lineGroups } = groupsLib();
  const gs = lineGroups([
    { line: 'a', by: '阿明', zh: '拿鐵' }, { line: 'b', by: '小美', zh: '司康' }, { line: 'c', by: '阿明', zh: '可頌' },
    { line: 'd', by: '櫃檯', zh: '水' }, { line: 'e', credit_of: 'to_1', zh: '已預收', price: -100 }, { line: 'f', by: '', zh: '不知誰點' },
  ]);
  // vm 另一個 realm 的 Array 與本地 Array 不同 prototype，deepEqual 會判不等，先 JSON 走一圈
  assert.deepEqual(JSON.parse(JSON.stringify(gs.map(g => [g.key, g.label, g.lines.map(l => l.line)]))), [
    ['阿明', '阿明', ['a', 'c']], ['小美', '小美', ['b']], ['櫃檯', '櫃檯點的', ['d']], ['', '客人', ['f']], ['credit', '已預收', ['e']],
  ]);
  assert.equal(lineGroups([]).length, 0);
});

test('POS 結帳頁：品項表依點餐人分組（多人才顯示組頭）、組頭「只結這組」一點就只勾那個人的', () => {
  assert.match(ops, /const groups=lineGroups\(cur\.lines\),multi=groups\.filter\(g=>g\.key!=='credit'\)\.length>1;/);
  assert.match(ops, /<tr class="pos-group \$\{on\?'on':''\}"><td colspan="5"><div class="pos-group-wrap"><span class="pos-group-name">\$\{esc\(g\.label\)\}<\/span>/);
  assert.match(ops, /data-pick-group="\$\{esc\(g\.key\)\}">\$\{on\?'已選這組':'只結這組'\}<\/button>/);
  assert.match(ops, /host\.querySelectorAll\('\[data-pick-group\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{[^\n]*POS_PICK=ids\.length===cur\.lines\.length\?null:new Set\(ids\);POS_QTY=\{\};POS_PAYREQ=null;POS_AA=null;paintPos\(\);/);
  assert.match(ops, /return head\+g\.lines\.map\(rowOf\)\.join\(''\);\}\)\.join\(''\)\|\|'<tr><td colspan="5" class="a-empty">/, '沒品項時仍顯示空狀態列');
  const css = read('public/pos-ops.css');
  assert.match(css, /\.pos-lines tr\.pos-group td\{/); assert.match(css, /\.pos-lines tr\.pos-group\.on td\{/);
});

test('文案：三個分帳選項＝全部付款／各付各的／平均分攤，手機頁、POS 結帳需求卡、操作說明一致，舊稱全部移除', () => {
  const html = read('public/order.html'), lib = read('public/order-lib.js'), api = read('docs/API.md');
  assert.match(html, /data-i18n="my_items">各付各的</);
  assert.match(lib, /my_items: '各付各的'/);
  assert.match(ops, /r\.scope==='mine'\?'各付各的':'全部付款'/);
  assert.match(ops, /組頭「只結這組」＝各付各的，「依人數分次收款」＝平均分攤；可分多次收款，全部結清自動清桌/);
  assert.match(api, /`mine`＝各付各的/);
  for (const [name, s] of [['order.html', html], ['order-lib.js', lib], ['pos-ops.js', ops], ['API.md', api]]) {
    assert.doesNotMatch(s, /只付我的|各自付款|各付自己的/, name + ' 不可殘留舊稱');
  }
});

test('多次收款直到結清：各付各的一組一張單、平均分攤一人一張單，最後一筆 unpaid 為 0 → 伺服器同交易自動清桌', () => {
  const items = () => [
    { line: 'a', item_id: 'x', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price: 100, qty: 2, by: '阿明', placed_at: 't' },
    { line: 'b', item_id: 'y', venue: 'CAFE', cat: 'FOOD', zh: '司康', price: 50, qty: 1, by: '小美', placed_at: 't' },
    { line: 'c', item_id: 'z', venue: 'CAFE', cat: 'FOOD', zh: '可頌', price: 70, qty: 1, by: '阿明', placed_at: 't' },
  ];
  // 各付各的：阿明一組、小美一組
  let its = items();
  const p1 = T.posCheckout(its, { method: 'cash', lines: ['a', 'c'], received: 270 }, new Map(), []);
  assert.equal(p1.amount, 270);
  its = T.settleItems(its, p1.lines, 'to_1');
  assert.equal(T.unpaid(its).length, 1, '第一組收完桌還開著');
  const p2 = T.posCheckout(its, { method: 'linepay', lines: ['b'] }, new Map(), []);
  assert.equal(p2.amount, 50);
  its = T.settleItems(its, p2.lines, 'to_2');
  assert.equal(T.unpaid(its).length, 0, '全部結清');
  // 平均分攤 3 人：320 ÷ 3 = 106，最後一人 108
  let aa = items();
  const gross = T.sum(T.unpaid(aa)), each = Math.floor(gross / 3);
  for (let k = 1; k < 3; k++) {
    const o = T.posCheckout(aa, { prepay: each, split: { people: 3, index: k }, method: 'cash', received: each }, new Map(), []);
    assert.equal(o.lines[0].zh, `平均分攤 第 ${k}／3 人`);
    aa = T.settleItems(aa, o.lines, 'to_s' + k, o.credit);
    assert.ok(T.unpaid(aa).length > 0, '前面幾人收完桌仍開著');
  }
  const last = T.posCheckout(aa, { method: 'card' }, new Map(), []);
  assert.equal(last.amount, gross - each * 2);
  aa = T.settleItems(aa, last.lines, 'to_fin');
  assert.equal(T.unpaid(aa).length, 0);
  // 伺服器端：同一筆 checkout 交易內 unpaid 為 0 就把桌關掉（不需再按清桌），部分結帳保持 open
  const server = read('server.js');
  assert.match(server, /const closed=!tableOrders\.isTakeout\(s\.table_no\)&&tableOrders\.unpaid\(items\)\.length===0&&tableOrders\.sessionClosableByVenues\(s,venues\);/);
  assert.match(server, /UPDATE table_sessions SET items=\$2,status=\$3,pay_requests=\$4,updated_at=now\(\) WHERE id=\$1',\[s\.id,JSON\.stringify\(items\),closed\?'closed':'open'/);
  assert.match(ops, /out\.remaining\?`，這桌還有 NT\$\$\{num\(out\.remaining\)\} 未結`:out\.closed\?'，已自動清桌'/, '收款後提示還剩多少或已自動清桌');
});
