// App 活動頁：「報名完成」不重複顯示；已報名會員可在 App 加購票券
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch { JSDOM = null; }
const src = fs.readFileSync(new URL('../public/m-event.js', import.meta.url), 'utf8');

async function mountPage({ url, event, token = '', routes = {} }) {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { url, runScripts: 'outside-only' });
  const w = dom.window, calls = [];
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.fetch = async (path, opt = {}) => {
    calls.push({ path, method: opt.method || 'GET', body: opt.body ? JSON.parse(opt.body) : null });
    const key = (opt.method || 'GET') + ' ' + path.split('?')[0];
    const data = routes[key] ? routes[key]() : key.startsWith('GET /api/events/') ? { event: structuredClone(event) } : { ok: true, status: 'registered' };
    return { ok: true, json: async () => data };
  };
  w.eval(src);
  const toasts = [];
  w.MEvent.mount({ app: w.document.getElementById('app'), esc: s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`), toast: m => toasts.push(m), lang: 'zh', slug: event.slug, home: '/', token: () => token });
  await new Promise(r => setTimeout(r, 30));
  return { w, calls, toasts, text: () => w.document.body.textContent };
}

const base = { id: 'e1', slug: 'demo', title: '測試活動', status: '報名中', registration_mode: 'native', capacity: 0, reg_count: 3, price_twd: 0, tickets: [], registration_settings: {} };

test('?result=registered + 邀請連結已報名：只出現一次「報名完成」', { skip: !JSDOM }, async () => {
  const routes = { 'POST /api/events/e1/invitation': () => ({ ok: true, status: 'registered', viewer: { name: 'A', email: 'a@x.tw' } }) };
  const p = await mountPage({ url: 'https://app.emoji.tw/e/demo?result=registered#invite=tok', event: base, routes });
  assert.equal(p.text().split('報名完成').length - 1, 1, p.text());
  assert.match(p.text(), /用這個 Email 登入 App 查看票券/);
});

test('已報名會員看到「加購票券」，送出呼叫 additional-tickets', { skip: !JSDOM }, async () => {
  const ev = { ...base, registered: true, registration_status: 'registered' };
  const p = await mountPage({ url: 'https://app.emoji.tw/e/demo', event: ev, token: 'T' });
  const btn = p.w.document.getElementById('mev-add');
  assert.ok(btn, '應有加購按鈕：' + p.text());
  btn.click();
  const f = p.w.document.getElementById('mev-add-form');
  assert.ok(f);
  f.elements.quantity.value = '2';
  f.dispatchEvent(new p.w.Event('submit', { cancelable: true }));
  await new Promise(r => setTimeout(r, 30));
  const call = p.calls.find(c => c.path.includes('/additional-tickets'));
  assert.equal(call?.method, 'POST');
  assert.equal(call.body.quantity, 2);
  assert.ok(p.toasts.includes('已加購'));
});

test('關閉團體報名的活動不顯示加購', { skip: !JSDOM }, async () => {
  const ev = { ...base, registered: true, registration_status: 'registered', registration_settings: { group_registration: false } };
  const p = await mountPage({ url: 'https://app.emoji.tw/e/demo', event: ev, token: 'T' });
  assert.equal(p.w.document.getElementById('mev-add'), null);
});
