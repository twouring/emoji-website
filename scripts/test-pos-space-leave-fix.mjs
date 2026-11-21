// 補登離場時間（KK 11/21）：忘了按離場的舊入場單，HH:MM 要算在入場之後，不能當成今天（否則超時幾十小時被 20 份上限擋下）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../public/pos-space.js', import.meta.url), 'utf8');
const fn = src.slice(src.indexOf('function spaceLeaveAt('), src.indexOf('const spaceMd'));
const ctx = {}; vm.createContext(ctx); vm.runInContext(fn + ';this.spaceLeaveAt=spaceLeaveAt;', ctx);
const at = (t, inIso, now) => { const d = ctx.spaceLeaveAt(t, inIso, now); return d ? d.toISOString() : null; };

const IN = '2026-11-17T10:24:51.664Z';            // 台北 11/17 18:24 入場
const NOW = Date.parse('2026-11-21T03:30:00Z');    // 台北 11/21 11:30

test('HH:MM 取入場後第一次出現的時刻', () => {
  assert.equal(at('22:24', IN, NOW), '2026-11-17T14:24:00.000Z');
  assert.equal(at('01:30', IN, NOW), '2026-11-17T17:30:00.000Z', '跨午夜算隔天凌晨');
  assert.equal(at('22:24（方案到期）', IN, NOW), '2026-11-17T14:24:00.000Z', '預設鍵文字可直接解析');
});
test('M/D HH:MM 指定日期', () => {
  assert.equal(at('11/18 09:00', IN, NOW), '2026-11-18T01:00:00.000Z');
});
test('早於入場、晚於現在、格式錯回 null', () => {
  assert.equal(at('11/17 17:00', IN, NOW), null);
  assert.equal(at('11/21 12:00', IN, NOW), null);
  assert.equal(at('25:00', IN, NOW), null);
  assert.equal(at('abc', IN, NOW), null);
});
test('補登鍵改用 spaceLeaveAt 並先確認', () => {
  const blk = src.slice(src.indexOf("on('sp-leave-fix'"), src.indexOf("on('sp-checkin'"));
  assert.match(blk, /spaceLeaveAt\(v, cur\.space\.in_at\)/);
  assert.match(blk, /posConfirm\(/);
  assert.doesNotMatch(blk, /HH:MM，今天/);
});
