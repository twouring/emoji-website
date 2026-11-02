// scripts/test-pos-table-url.mjs — POS 桌號獨立網址 /pos/table/<桌號>（KK 11/2）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const pos = read('public/pos.html'), ops = read('public/pos-ops.js');

function routeCtx(pathname) {
  const calls = [];
  const src = ops.slice(ops.indexOf('const posTableUrl='), ops.indexOf('async function loadPos(){'))
    + pos.slice(pos.indexOf("const LEGACY_ANALYTICS"), pos.indexOf('function go(tab, replace)'));
  const ctx = { TABS: [{ id: 'pos' }, { id: 'sales' }], ANALYTICS_KIND: 'products', POS_TABLE: '', TAB: 'pos', calls,
    location: { pathname }, history: { pushState: (_a, _b, u) => { calls.push(['push', u]); ctx.location.pathname = u; }, replaceState: (_a, _b, u) => { calls.push(['replace', u]); ctx.location.pathname = u; } } };
  vm.runInNewContext(src.replace('let ROUTE_TABLE', 'var ROUTE_TABLE') + ';this.routeTab=routeTab;this.sync=syncPosTableUrl;this.url=posTableUrl;this.rt=()=>ROUTE_TABLE;', ctx);
  return ctx;
}

test('直接開 /pos/table/A3 → 結帳分頁＋該桌；中文與空白桌號可編碼往返', () => {
  let c = routeCtx('/pos/table/A3');
  assert.equal(c.routeTab(), 'pos'); assert.equal(c.rt(), 'A3');
  c = routeCtx('/pos/table/' + encodeURIComponent('外帶 W1'));
  assert.equal(c.routeTab(), 'pos'); assert.equal(c.rt(), '外帶 W1');
  assert.equal(c.url('外帶 W1'), '/pos/table/' + encodeURIComponent('外帶 W1'));
  c = routeCtx('/pos');
  assert.equal(c.routeTab(), 'pos'); assert.equal(c.rt(), '');
  c = routeCtx('/pos/sales');
  assert.equal(c.routeTab(), 'sales'); assert.equal(c.rt(), '');
});

test('進桌 push、回桌況 push、桌已清掉 replace 回 /pos；/admin 不動網址', () => {
  const c = routeCtx('/pos');
  c.POS_TABLE = 'A3'; c.sync(false);
  c.POS_TABLE = ''; c.sync(false);
  c.POS_TABLE = 'B1'; c.sync(false);
  c.POS_TABLE = ''; c.sync(true);
  c.sync(false); // 沒變就不寫
  assert.deepEqual(c.calls, [['push', '/pos/table/A3'], ['push', '/pos'], ['push', '/pos/table/B1'], ['replace', '/pos']]);
  const a = routeCtx('/admin/cafe/pos'); a.POS_TABLE = 'A3'; a.sync(false);
  assert.deepEqual(a.calls, []);
  const s = routeCtx('/pos/sales'); s.TAB = 'sales'; s.POS_TABLE = 'A3'; s.sync(false);
  assert.deepEqual(s.calls, [], '別的分頁不改網址');
});

test('接線：點桌走 posSelectTable、paintPos 同步網址、登入後與上一頁套用網址桌號、結帳分頁連結帶桌號', () => {
  assert.match(ops, /\[data-pos-table\]'\)\.forEach\(b=>b\.onclick=\(\)=>posSelectTable\(b\.dataset\.posTable\)\)/);
  assert.match(ops, /if\(tableGone\)POS_TABLE='';\n  syncPosTableUrl\(tableGone\);/);
  assert.match(pos, /TAB = routeTab\(\);\n    if \(TAB === 'pos'\) POS_TABLE = ROUTE_TABLE;/);
  assert.match(pos, /if \(TAB === 'pos' && POS_TABLE !== ROUTE_TABLE\) posSelectTable\(ROUTE_TABLE\)/);
  assert.match(pos, /const tabUrl = tab => \(tab === 'pos' \? posTableUrl\(POS_TABLE\)/);
});
