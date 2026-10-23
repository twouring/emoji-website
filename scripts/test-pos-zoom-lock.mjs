// scripts/test-pos-zoom-lock.mjs — POS（iPad）全站鎖定尺寸：雙指、雙擊皆不可縮放；密碼鍵盤按鈕穩定觸發。
// 純原始碼正則驗證（沒有真的 iOS Safari 可跑手勢測試），鎖住三個實作要點：viewport、touch-action、gesturestart。
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const html = read('public/pos.html');

test('viewport 鎖定 maximum-scale=1、user-scalable=no（第一層防護，iOS Safari 會忽略但不影響其他瀏覽器）', () => {
  const m = html.match(/<meta name="viewport" content="([^"]+)">/);
  assert.ok(m, '找不到 viewport meta');
  assert.match(m[1], /maximum-scale=1/);
  assert.match(m[1], /user-scalable=no/);
});

test('全域 touch-action:manipulation 擋雙擊放大（同時取消點擊延遲）', () => {
  assert.match(html, /html,body\{touch-action:manipulation\}/);
});

test('監聽 gesturestart/gesturechange/gestureend 並 preventDefault 擋 iOS 雙指縮放（touch-action 管不到這組事件）', () => {
  assert.match(html, /\['gesturestart','gesturechange','gestureend'\]\.forEach\(ev => document\.addEventListener\(ev, e => e\.preventDefault\(\)\)\)/);
});

test('密碼鍵盤（打卡 /pos/clock、操作人員切換）按鈕觸控區不小於 44px，且用 onclick 綁定（非透明圖層攔截）', () => {
  const css = read('public/pos-ops.css');
  const m = css.match(/\.clock-key\{[^}]*\}/);
  assert.ok(m, '找不到 .clock-key 樣式');
  assert.match(m[0], /min-height:84px/, '按鈕觸控區需 ≥44px（目前 84px）');
  const js = read('public/pos-ops.js');
  assert.match(js, /\[data-key\]'\)\.forEach\(b=>b\.onclick=/, '打卡鍵盤用 onclick 穩定綁定');
});

test('PIN 鍵盤共用樣式：.clock-pad 要 width:100%（登入卡是 grid，少了會縮成 43px 窄鍵），鍵高 84px、數字 2rem、面板最寬 440px', () => {
  const css = read('public/pos-ops.css');
  assert.match(css, /\.clock-pad\{width:100%;max-width:440px;margin:0 auto\}/);
  assert.match(css, /\.clock-key\{[^}]*min-height:84px[^}]*font-size:2rem/);
  assert.match(css, /\.op-card\{max-width:480px/);
  assert.match(read('public/pos.html'), /\.p-login-card\{width:min\(100%,480px\)/);
});

test('App PWA（m.html）不鎖縮放：照使用者裝置習慣允許雙指放大（WCAG 1.4.4），只用 touch-action:manipulation 擋雙擊誤放大', () => {
  const m = read('public/m.html');
  const v = m.match(/<meta name="viewport" content="([^"]+)">/);
  assert.ok(v, '找不到 viewport meta');
  assert.doesNotMatch(v[1], /maximum-scale|user-scalable=no/);
  assert.match(m, /html,body\{touch-action:manipulation\}/);
  assert.doesNotMatch(m, /gesturestart/);
});
