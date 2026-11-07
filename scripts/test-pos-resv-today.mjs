// 訂位「今天」看板（KK 11/7）：今日組數／人數、下一組、倒數與逾時、只看今天、每 60 秒重抓
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/pos-ops.css', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('/* 訂位「今天」看板'), src.indexOf('/* 倒數每 30 秒就地更新'));
const ctx = { esc: s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])), todayTaipei: () => '2026-11-07' };
vm.createContext(ctx); vm.runInContext(block + ';Object.assign(globalThis,{resvTodayEta,resvTodayStats,resvTodayHtml});', ctx);
const at = hm => Date.parse(`2026-11-07T${hm}:00+08:00`);
const R = (id, time, status, party = 2, extra = {}) => ({ id, reserve_date: '2026-11-07', reserve_time: time, status, party_size: party, name: '客' + id, phone: '09', ...extra });
const rows = [R('a', '12:00', 'arrived', 4), R('b', '13:00', 'confirmed', 2), R('c', '13:30', 'confirmed', 3), R('d', '11:00', 'confirmed', 2), R('e', '15:00', 'new', 5), R('f', '14:00', 'cancelled', 6), R('g', '10:00', 'no_show', 2)];

test('倒數：兩小時內顯示分鐘、30 分內醒目、保留 10 分、逾時', () => {
  const now = at('12:50');
  assert.deepEqual({ ...ctx.resvTodayEta(R('x', '13:00', 'confirmed'), now) }, { cls: 'soon', text: '10 分鐘後' });
  assert.deepEqual({ ...ctx.resvTodayEta(R('x', '14:20', 'confirmed'), now) }, { cls: '', text: '1 小時 30 分後' });
  assert.equal(ctx.resvTodayEta(R('x', '18:00', 'confirmed'), now).text, '');
  assert.deepEqual({ ...ctx.resvTodayEta(R('x', '12:46', 'confirmed'), now) }, { cls: 'due', text: '該到了・保留 6 分' });
  assert.deepEqual({ ...ctx.resvTodayEta(R('x', '12:20', 'confirmed'), now) }, { cls: 'late', text: '逾時 30 分' });
  assert.equal(ctx.resvTodayEta(R('x', '11:00', 'confirmed'), now).text, '逾時 1 小時 50 分');
  assert.equal(ctx.resvTodayEta(R('x', '12:20', 'arrived'), now).text, '已到');
});

test('統計：取消不算組數，下一組跳過逾時超過保留時間的', () => {
  const st = ctx.resvTodayStats(rows, at('12:50'));
  assert.equal(st.groups, 6); assert.equal(st.guests, 18);
  assert.equal(st.wait, 4); assert.equal(st.arrived, 1); assert.equal(st.noShow, 1); assert.equal(st.pending, 1); assert.equal(st.cancelled, 1);
  assert.equal(st.late, 1);            // 11:00 那組逾時
  assert.equal(st.next.id, 'b');       // 13:00
});

test('看板 HTML：依時間排序、下一組標示、有已到／未到鍵、不列已取消', () => {
  const h = ctx.resvTodayHtml(rows, at('12:50'));
  assert.match(h, /今天 11\/07（六）/);
  assert.match(h, /<b>6<\/b> 組・<b>18<\/b> 位/);
  assert.match(h, /下一組 <b>13:00<\/b> 客b/);
  assert.doesNotMatch(h, /客f/);
  const order = [...h.matchAll(/data-rt-id="(\w)"/g)].map(m => m[1]);
  assert.deepEqual(order, ['g', 'd', 'a', 'b', 'c', 'e']);
  assert.match(h, /data-resv="b" data-resv-status="arrived">已到/);
  assert.match(h, /data-resv="b" data-resv-status="no_show">未到/);
  assert.match(h, /data-rt-id="b"[^>]*>|is-next" data-rt-id="b"/);
  assert.match(ctx.resvTodayHtml([], at('12:00')), /今天沒有訂位/);
});

test('接線：看板放在清單上方、不管清單看哪天都抓今天、自動重抓', () => {
  assert.match(src, /\$\{resvTodayHtml\(todayRows\)\}/);
  assert.match(src, /from=\$\{today\}&days=1/);
  assert.match(src, /todayRows\.find\(x=>x\.id===b\.dataset\.resv\)/);
  assert.match(src, /__resvEtaTick/);
  assert.match(src, /__resvLoadedAt/);
  assert.match(css, /\.resv-today\{/);
  assert.match(css, /\.rt-acts \.btn\{min-height:44px/);
});
