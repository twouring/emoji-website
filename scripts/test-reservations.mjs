import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/reserve.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/reserve.js'), 'utf8');

test('reservation page is mobile-first and reachable as /reserve', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.emoji\.tw\/reserve">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover">/);
  assert.match(html, /<form id="reserveForm"/);
  assert.match(html, /name="date" type="date"/);
  assert.match(html, /name="time" type="time"/);
  assert.match(html, /name="phone" type="tel" inputmode="tel" autocomplete="tel"/);
  assert.match(html, /送出是「訂位申請」/);
});

test('reservation frontend posts JSON safely without innerHTML', () => {
  assert.match(js, /fetch\('\/api\/reservations'/);
  assert.match(js, /method:'POST'/);
  assert.match(js, /summary\.textContent=''/);
  assert.match(js, /document\.createTextNode/);
  assert.doesNotMatch(js, /innerHTML/);
});

test('reservation API stores requests and notifies operations', () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS dining_reservations/);
  assert.match(server, /CREATE INDEX IF NOT EXISTS dining_reservations_date_idx/);
  assert.match(server, /app\.post\('\/api\/reservations', rateLimit\(\{ max: 30, windowMs: 3600000 \}\), requireDb, wrap/);
  assert.match(server, /reservationInput\(req\.body\)/);
  assert.match(server, /sendMailQuietly\(\{ to: NOTIFY_EMAIL, subject: `\[訂位\]/);
  assert.match(server, /request_id/);
});
