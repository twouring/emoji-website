import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const ops = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const pos = readFileSync(new URL('../public/pos.html', import.meta.url), 'utf8');

test('pos-logs API 要店長識別碼（header，不走網址）', () => {
  const i = server.indexOf("app.get('/api/admin/pos-logs'");
  const block = server.slice(i, i + 1400);
  assert.match(block, /rateLimit\(\{ max: 30 \}\)/);
  assert.match(block, /req\.get\('x-manager-pin'\)/);
  assert.match(block, /isManagerRole\(mgr\.role\)/);
  assert.doesNotMatch(block, /staffVisible\(mgr/); // 店長不限店別
  assert.match(block, /status\(403\)/);
  assert.match(server, /const isManagerRole = role => String\(role \|\| ''\)\.includes\('店長'\)/);
});

test('POS 紀錄分頁先擋店長 PIN，PIN 只在記憶體、離開分頁清空', () => {
  assert.match(ops, /if\(!LOGS_PIN\)\{paintLogsGate\(host\);return;\}/);
  assert.match(ops, /\{headers:\{'X-Manager-Pin':LOGS_PIN\}\}/);
  assert.doesNotMatch(ops, /pos-logs\?[^`'"]*pin=/i);
  assert.doesNotMatch(ops, /localStorage[^;\n]*LOGS_PIN|LOGS_PIN[^;\n]*localStorage/);
  assert.match(pos, /if \(TAB !== 'logs'\) \{ LOGS_PIN = ''/);
  assert.match(pos, /\.\.\.\(headers\|\|\{\}\)/);
});
