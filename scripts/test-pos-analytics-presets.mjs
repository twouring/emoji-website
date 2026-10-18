import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
const start=src.indexOf('function analyticsPresetRange(');
const end=src.indexOf('\nfunction loadProducts',start);
// 只執行本 repo 的原始碼片段（無外部輸入），用來單元測試前端純函式
const fn=new Function(src.slice(start,end)+';return analyticsPresetRange;')();

test('presets: week starts Monday, same-period compares to last week/month',()=>{
  const t='2026-10-18';   // 週日
  assert.deepEqual(fn('today',t),['2026-10-18','2026-10-18']);
  assert.deepEqual(fn('yesterday',t),['2026-10-17','2026-10-17']);
  assert.deepEqual(fn('week',t),['2026-10-12','2026-10-18']);
  assert.deepEqual(fn('lastweek_td',t),['2026-10-05','2026-10-11']);
  assert.deepEqual(fn('month',t),['2026-10-01','2026-10-18']);
  assert.deepEqual(fn('lastmonth_td',t),['2026-09-01','2026-09-18']);
  assert.deepEqual(fn('last7',t),['2026-10-12','2026-10-18']);
  assert.deepEqual(fn('last30',t),['2026-09-19','2026-10-18']);
});

test('presets: Monday, month-end clamp and January rollover',()=>{
  assert.deepEqual(fn('week','2026-10-19'),['2026-10-19','2026-10-19']);
  assert.deepEqual(fn('lastweek_td','2026-10-19'),['2026-10-12','2026-10-12']);
  assert.deepEqual(fn('lastmonth_td','2026-03-31'),['2026-02-01','2026-02-28']);
  assert.deepEqual(fn('lastmonth_td','2027-01-15'),['2026-12-01','2026-12-15']);
  assert.deepEqual(fn('week','2027-01-02'),['2026-12-28','2027-01-02']);
});

test('presets toolbar is wired on 銷量／客群 with all labels',()=>{
  for(const l of ['當週','當月','上週同期','上月同期','近七天','近三十天'])assert.ok(src.includes(`'${l}'`),l);
  assert.match(src,/id="analytics-presets"/);
  assert.match(src,/#analytics-presets \[data-preset\]/);
});
