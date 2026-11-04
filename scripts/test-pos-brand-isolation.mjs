// 品牌 POS 完全獨立（KK 11/5）：每個 POS 功能只看／只改自己品牌的資料
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const H = require('../lib/reservation-hours.js');
const root = new URL('..', import.meta.url);
const read = f => fs.readFileSync(new URL(f, root), 'utf8');
const server = read('server.js');
const route = sig => { const i = server.indexOf(sig); assert.ok(i >= 0, sig); return server.slice(i, server.indexOf('\n}));', i)); };
const cafe = t => t >= '08:00' && t < '17:00';

test('不可訂位設定：品牌只看自己的時段', () => {
  const cfg = { weekly: { 1: H.ALL.filter(t => t !== '10:00' && t !== '20:00') }, dates: {} };
  const v = H.venueView(cfg, cafe);
  assert.ok(v.all.every(cafe));
  assert.ok(!v.weekly[1].includes('10:00'));
  assert.ok(v.weekly[1].every(cafe));
});

test('不可訂位設定：品牌存檔不動另一品牌的時段', () => {
  const cur = { weekly: { 1: H.ALL.filter(t => t !== '20:00') }, dates: { '2099-01-01': [] } };   // 三點水週一 20:00 關、某日全天公休
  const view = H.venueView(cur, cafe);
  view.weekly[2] = view.all.filter(t => t !== '09:00');   // 在咖啡新增週二 09:00 關
  delete view.dates['2099-01-01'];                        // 在咖啡把那天自己的時段打開
  const m = H.mergeVenue(cur, view, cafe);
  assert.ok(!m.weekly[1].includes('20:00'), '三點水的週一限制要保留');
  assert.ok(!m.weekly[2].includes('09:00') && m.weekly[2].includes('20:00'));
  const d = H.slotsFor(m, '2099-01-01');
  assert.ok(d.includes('09:00'), '在咖啡那天打開');
  assert.ok(!d.includes('20:00'), '三點水那天仍公休');
});

test('server：POS 各功能依品牌過濾', () => {
  assert.match(route("app.get('/api/admin/reservations',"), /pinVenue\(req,req\.query\.venue\)/);
  for (const sig of ["app.post('/api/admin/reservations',", "app.post('/api/admin/reservations/:id/status'", "app.patch('/api/admin/reservations/:id'", "app.delete('/api/admin/reservations/:id'"])
    assert.doesNotMatch(route(sig), /const venues=null/, sig);
  assert.match(route("app.get('/api/admin/reservation-hours'"), /venueView/);
  assert.match(route("app.put('/api/admin/reservation-hours'"), /mergeVenue/);
  assert.match(route("app.get('/api/admin/orders/service-calls'"), /posScope\(req\)/);
  assert.match(route("app.post('/api/admin/orders/service-calls/:id/done'"), /posScope\(req\)/);
  assert.match(route("app.get('/api/admin/orders/feedback'"), /posScope\(req\)/);
  assert.match(route("app.get('/api/admin/orders/tips/events'"), /posScope\(req\)/);
  assert.match(route("app.get('/api/admin/orders/tips',"), /posScope\(req\)/);
  assert.match(route("app.post('/api/admin/orders/tips/settings'"), /'tip_settings:'\+tv/);
  assert.match(route("app.get('/api/admin/attendance',"), /posScope\(req\)/);
  assert.match(route("app.patch('/api/admin/attendance/:id'"), /posScope\(req\)/);
  assert.match(route("app.delete('/api/admin/attendance/:id'"), /posScope\(req\)/);
  assert.match(route("app.post('/api/admin/orders/sessions/:id/party'"), /orderVisibleToVenues\(s,posScope\(req\)\)/);
  assert.match(server, /const tipDecideRoute[\s\S]{0,600}posScope\(req\)/);
});

test('POS 前端：每支 /admin/* 呼叫自動帶 venue', () => {
  assert.match(read('public/pos.html'), /if \(SCOPE && \/\^\\\/admin\\\/\/\.test\(path\) && !\/\[\?&\]venue=\/\.test\(path\)\) path \+=/);
});
