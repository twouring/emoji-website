// scripts/test-pos-device-login.mjs — #2 POS 登入改四位數操作人員密碼＋裝置綁定；#3 操作人員依所屬品牌過濾資料。
// 裝置未綁定前不能用密碼登入；登入後的身分來自 pos_staff.venues（所屬品牌），不是 null＝全開。
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const read = p => fs.readFileSync(p, 'utf8');
const server = read('server.js');
const pos = read('public/pos.html');

test('server.js：裝置綁定表與四個端點，身分只來自 pos_staff，brands 絕不是 null', () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS pos_devices/);
  assert.match(server, /app\.get\('\/api\/pos-devices\/:id',requireDb/, '查裝置是否已綁定免登入');
  assert.match(server, /app\.post\('\/api\/admin\/pos-devices\/bind',auth,adminOnly,requireDb/, '綁定裝置要先登入（任何品牌管理員）');
  assert.match(server, /app\.get\('\/api\/admin\/pos-devices',auth,adminOnly,superOnly,requireDb/, '裝置清單僅超管');
  assert.match(server, /app\.delete\('\/api\/admin\/pos-devices\/:id',auth,adminOnly,superOnly,requireDb/, '清除綁定僅超管（iPad 遺失／更換）');
  assert.match(server, /app\.post\('\/api\/pos-devices\/:id\/pin-login',rateLimit\(\{max:12\}\),requireDb/, '密碼登入免登入但要防猜碼');
  assert.match(server, /密碼錯誤，請重新輸入；若是第一次使用，請先由店長以管理員帳號登入完成裝置綁定/, '未綁定裝置無法用密碼登入，且不洩漏原因');
  assert.match(server, /if\(!brands\.length\)return res\.status\(403\)\.json\(\{error:`\$\{staff\.name\} 尚未設定所屬品牌/, '沒設所屬品牌的操作人員不能登入');
  assert.doesNotMatch(server, /operator_staff_id[^\n]*brands:\s*null/, '操作人員的 brands 絕不能是 null（null＝全開權限）');
});

test('sessionAuth：operator_staff_id 走 pos_staff，不查 users；停用的 staff 立即失效', () => {
  assert.match(server, /if \(p\.operator_staff_id\) \{/);
  assert.match(server, /if \(!staff \|\| !staff\.active\) return null;/);
  assert.match(server, /if \(!brands\.length\) return null; \/\/ 沒設所屬品牌的操作人員：一律視為未登入/);
});

test('/api/auth/renew 與 /api/state：操作人員續期要保留 operator_staff_id；/api/state 的 me 不查 users（避免查到不存在的列）', () => {
  assert.match(server, /\.\.\.\(req\.auth\.operator_staff_id\?\{operator_staff_id:req\.auth\.operator_staff_id\}:\{\}\)\}\)\}\);\n\}\);\n\napp\.post\('\/api\/auth\/email/);
  assert.match(server, /const me = req\.auth\.operator_staff_id \? \{ id: req\.auth\.sub, name: req\.auth\.name \|\| '', email: '', is_admin: true, operator: true \}/);
});

test('pos.html：開機先查裝置是否綁定，未綁定走 Gmail、綁定後走四位數密碼鍵盤；Gmail 登入成功後自動綁定裝置', () => {
  assert.match(pos, /let DEVICE_ID = localStorage\.getItem\('tth_pos_device'\)/);
  assert.match(pos, /function showLoginScreen\(msg\)\{ return DEVICE_BOUND \? renderPinLogin\(msg\) : renderLogin\(msg\); \}/);
  assert.match(pos, /function renderPinLogin\(msg\)\{/);
  assert.match(pos, /api\('\/pos-devices\/' \+ encodeURIComponent\(DEVICE_ID\) \+ '\/pin-login', \{ method:'POST', body:\{ pin \} \}\)/);
  assert.match(pos, /if \(justLoggedInByGmail && !d\.me\?\.operator\) api\('\/admin\/pos-devices\/bind'/);
  assert.doesNotMatch(pos, /localStorage\.setItem\([^)]*pin\b/i, '密碼不可寫進 localStorage');
});

// --- 純邏輯：brand 解析規則，跟伺服器端用同一套算法，防止兩邊漂移 ---
function brandsOf(venues) {
  return String(venues || '').split(',').map(x => x.trim().toUpperCase()).filter(x => ['CAFE', 'BAR'].includes(x));
}
test('brandsOf：單品牌／雙品牌／空白都正確解析，不混入無效字串', () => {
  assert.deepEqual(brandsOf('CAFE'), ['CAFE']);
  assert.deepEqual(brandsOf('CAFE,BAR'), ['CAFE', 'BAR']);
  assert.deepEqual(brandsOf(''), []);
  assert.deepEqual(brandsOf(null), []);
  assert.deepEqual(brandsOf('SPACE,CAFE'), ['CAFE'], '不是 CAFE/BAR 的值要濾掉（操作人員不能有等等空間權限）');
});
