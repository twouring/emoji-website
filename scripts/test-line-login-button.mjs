import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const r = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
test('會員 App 與 Email 登入頁有 LINE 登入入口，且依 /api/auth/methods 顯示', () => {
  const m = r('public/m.html'), e = r('public/event-login.html'), s = r('server.js');
  assert.match(m, /id="line-login" hidden href="\/auth\/line\?redirect=/);
  assert.match(m, /lineLogin:'使用 LINE 登入'/);
  assert.match(m, /fetch\('\/api\/auth\/methods'\)/);
  assert.match(e, /\/auth\/line\?redirect=/);
  assert.match(s, /app\.get\('\/api\/auth\/methods'/);
});
