// KK 11/2：自動出單提示音越大聲越好——鎖住滿刻度方波、高頻、多聲，避免被改回小聲
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const fn = js.slice(js.indexOf('function newTicketChime('), js.indexOf('function notifyNewTickets('));

test('新單提示音：滿刻度方波、2kHz 以上、至少 9 聲', () => {
  assert.match(fn, /o\.type='square'/);
  assert.match(fn, /exponentialRampToValueAtTime\(1,/);
  assert.doesNotMatch(fn, /exponentialRampToValueAtTime\(\.[0-9]+,t\+\.0/);
  const notes = fn.match(/NOTES=\[([^\]]+)\]/)[1].split(',').map(Number);
  assert.ok(notes.every(f => f >= 2000), 'frequencies >= 2kHz');
  assert.match(fn, /r<3/);
});

test('iOS 靜音鍵不擋提示音（audioSession playback）', () => {
  assert.match(js, /navigator\.audioSession\.type='playback'/);
});

test('實際排程：9 個 oscillator、gain 峰值 1', () => {
  const calls = { osc: 0, peaks: [] };
  const ctx = { currentTime: 0, destination: {},
    createOscillator: () => { calls.osc++; return { connect() {}, start() {}, stop() {}, frequency: {} }; },
    createGain: () => ({ connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime(v) { calls.peaks.push(v); } } }) };
  // 函式本體取自 repo 內 pos-ops.js（靜態檔案），非外部輸入
  const run = new Function('posAudio', fn + ';newTicketChime();');
  run(() => ctx);
  assert.equal(calls.osc, 9);
  assert.equal(Math.max(...calls.peaks), 1);
});
