import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('會員 App 回饋：表單、會員 API 與 POS 匯總接線完整', () => {
  const app = read('public/m.html');
  const server = read('server.js');
  const pos = read('public/pos-feedback.js');
  assert.match(app, /id="feedback"/);
  assert.match(app, /function feedbackPage\(\)/);
  assert.match(app, /post\('\/api\/me\/feedback'/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS member_feedback/);
  assert.match(server, /app\.post\('\/api\/me\/feedback',auth,requireDb/);
  assert.match(server, /SELECT f\.id,'會員 App' AS source/);
  assert.match(pos, /r\.source \|\| '桌邊點餐'/);
});
