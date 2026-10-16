// 出餐看板：開放式餐吧不分吧檯／廚房，每個品項前標菜單類別（咖啡、茶、日式主食…）讓現場一眼看出餐飲類型。
// 純邏輯：在 vm 載入 menu-lib.js + pos-ops.js，直接呼叫 orderLines／groupByCat／catLabel；畫面字串另以原始碼掃描確認。
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ops = read('public/pos-ops.js'), css = read('public/pos-ops.css');
function ctx() {
  const c = vm.createContext({ console, setTimeout, clearTimeout });
  vm.runInContext(read('public/menu-lib.js'), c); vm.runInContext(ops, c); return c;
}

test('看板品項依菜單類別順序攤平（餐點在前、飲品在後），同類保留原順序；預收／抵扣不列', () => {
  const c = ctx();
  c.o = { stations: { bar: [{ cat: 'COFFEE', zh: '拿鐵' }, { cat: 'TEA', zh: '焙茶' }, { cat: 'COFFEE', zh: '美式' }], kitchen: [{ cat: 'JAPANESE', zh: '鮭魚丼' }] } };
  // vm 另一個 realm 的 Array 跟本地 Array 不同原型，deepEqual(strict) 會失敗，先轉 JSON 再比
  const run = expr => JSON.parse(JSON.stringify(vm.runInContext(expr, c)));
  assert.deepEqual(run('orderLines(o).map(l=>l.zh)'), ['鮭魚丼', '拿鐵', '美式', '焙茶']);
  c.p = { items: [{ cat: 'COFFEE', zh: '拿鐵' }, { cat: '', zh: '部分付款', prepay: true }, { cat: '', zh: '已預收', credit_of: 'x' }, { cat: 'BREAD', zh: '吐司' }] };
  assert.deepEqual(run('orderLines(p).map(l=>l.zh)'), ['吐司', '拿鐵'], '沒有 stations 時從 items 現算，預收／抵扣不是餐點');
  assert.deepEqual(run('groupByCat(orderLines(o)).map(([cat,ls])=>[cat,ls.length])'), [['JAPANESE', 1], ['COFFEE', 2], ['TEA', 1]]);
});

test('類別顯示中文菜單類別名；未知或空類別退回「其他」', () => {
  const c = ctx();
  assert.equal(vm.runInContext("catLabel('COFFEE')", c), '咖啡');
  assert.equal(vm.runInContext("catLabel('JAPANESE')", c), '日式主食');
  assert.equal(vm.runInContext("catLabel('')", c), '其他');
  assert.equal(vm.runInContext("catLabel(undefined)", c), '其他');
});

test('看板採市售 KDS 一單一卡；每道保留類別籤＋品名＋數量＋規格籤', () => {
  assert.ok(!/STATION_LABEL|stationHtml|ticketStations|【吧檯】|【廚房】|品項（吧檯／廚房）|依吧檯／廚房分列/.test(ops), 'pos-ops.js 畫面與出餐單不該再出現吧檯／廚房分站');
  assert.match(ops, /<article class="kds-card\$\{[^`]*\$\{cardHead\(o,at,state\)\}\$\{linesHtml\(o\)\}<div class="kds-foot">/, '出餐看板改為一單一卡（KDS）：卡頭＋品項＋卡尾主鍵');
  assert.match(ops, /<div class="kds-head"><b class="kds-table">/, '卡頭桌號大字；用 div 不用 header/footer（全站 footer 樣式會染黑卡尾）');
  assert.ok(!/<(header|footer) class="kds-/.test(ops), '卡片不得用 header/footer 元素');
  assert.match(ops, /<span class="kds-age"[^>]*>\$\{elapsedText\(at\)\}<\/span>/, '卡頭顯示等候分鐘，不放時刻／金額');
  assert.ok(!/<th>結帳<\/th>|num\(o\.amount\)[^\n]*未結帳/.test(ops.slice(ops.indexOf('async function loadOrders'), ops.indexOf('async function loadPos'))), '出餐看板不顯示金額與付款方式');
  assert.match(ops, /<div class="ops-line\$\{[^`]*\}"><span class="ops-cat">\$\{esc\(catLabel\(l\.cat\)\)\}<\/span><div class="ops-line-body">/);
  assert.match(ops, /<b class="ops-name">\$\{esc\(l\.zh\)\}<\/b><b class="ops-qty\$\{l\.qty>1\?' many':''\}">×\$\{l\.qty\}<\/b>/, '品名加粗、數量 ×2 以上反白');
  assert.match(css, /\.ops-line\{display:grid;grid-template-columns:auto 1fr/, '類別欄用 auto（直向平板放不下時膠囊換行），不用 max-content 撐出橫向捲軸');
  assert.match(css, /\.ops-qty\.many\{background:var\(--ink\);color:var\(--paper\)/);
  for (const k of ['default', 'option', 'custom']) assert.match(css, new RegExp(`\\.ops-spec-${k}\\{|\\.ops-spec\\{`), '三種規格籤樣式');
  for (const k of ['temperature','sugar','ice','rice','noodle','custom']) assert.match(css, new RegExp(`\\.ops-spec-${k}\\{`), `${k} 有獨立底色`);
  assert.match(css, /\.ops-cat\{white-space:nowrap\}/, '短類別籤維持單行');
  assert.match(css, /\.ops-name,\.ops-spec\{white-space:normal;overflow-wrap:anywhere;max-width:100%\}/, '長品名與客製規格必須換行，不得被卡片裁掉');
  assert.match(css, /\.kds-grid\{columns:300px/, '卡片用 CSS columns 瀑布排欄，卡高不一不留空');
  assert.match(css, /\.kds-card\{[^}]*break-inside:avoid/, '卡片不跨欄被切');
  assert.match(css, /\.kds-card\.kds-late \.kds-age\{color:#b42318\}/, '超時卡片紅字');
});

test('規格拆籤：預設值淡化、非預設值深色、自由需求 ※；沒載 order-lib 時全部當非預設', () => {
  const c = ctx(); vm.runInContext(read('public/order-lib.js'), c);
  const run = expr => JSON.parse(JSON.stringify(vm.runInContext(expr, c)));
  c.l = { cat: 'COFFEE', zh: '拿鐵咖啡', note: '溫度：冰；糖度：正常糖；冰塊：去冰；燕麥奶' };
  assert.deepEqual(run('specParts(l)'), [
    { text: '冰', kind: 'default', tone: 'temperature' }, { text: '正常糖', kind: 'default', tone: 'sugar' }, { text: '去冰', kind: 'option', tone: 'ice' }, { text: '燕麥奶', kind: 'custom', tone: 'custom' },
  ]);
  c.r = { cat: 'JAPANESE', zh: '鮭魚親子丼', note: '飯量：飯多' };
  assert.deepEqual(run('specParts(r)'), [{ text: '飯多', kind: 'option', tone: 'rice' }]);
  assert.deepEqual(run('specParts({cat:"BREAD",zh:"吐司"})'), [], '沒備註就沒籤');
  assert.deepEqual(run('specParts({cat:"BREAD",zh:"吐司",note:"不要蔥"})'), [{ text: '不要蔥', kind: 'custom', tone: 'custom' }]);
  assert.deepEqual(run('specParts({cat:"BREAD",zh:"吐司",note:"不要蔥、醬另放"})'), [{ text: '不要蔥', kind: 'custom', tone: 'custom' }, { text: '醬另放', kind: 'custom', tone: 'custom' }], '常用備註膠囊以「、」連接，拆成一顆一籤');
  const c2 = ctx();
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('specParts({cat:"COFFEE",zh:"拿鐵",note:"溫度：冰；冰塊：正常冰"})', c2))), [{ text: '冰', kind: 'option', tone: 'temperature' }, { text: '正常冰', kind: 'option', tone: 'ice' }], '沒 OrderLib 時不知道預設，一律深色（寧可多看一眼）');
});
