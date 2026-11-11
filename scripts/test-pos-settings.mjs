// scripts/test-pos-settings.mjs — POS「設定」分頁：不常用分頁收進設定、只有管理員能用的功能不放 POS
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const pos = read('public/pos.html'), set = read('public/pos-settings.js'), server = read('server.js'), api = read('docs/API.md');

function tabs() {
  const src = pos.slice(pos.indexOf('const TABS = ['), pos.indexOf('];', pos.indexOf('const TABS = [')) + 2);
  return JSON.parse(vm.runInNewContext(src.replace('const TABS =', 'TABS =') + ';JSON.stringify(TABS)', {}));
}
test('頂欄只留常用分頁（點歌已移到 ktv.emoji.tw，KK 11/6），庫存／排班／銷量／客群／紀錄移到設定', () => {
  const T = tabs();
  const top = T.filter(t => !t.group).map(t => t.id);
  assert.deepEqual(top, ['pos', 'serve', 'soldout', 'reservations', 'members', 'history', 'clock', 'sales', 'analytics', 'settings']);
  assert.deepEqual(T.filter(t => t.group === 'settings').map(t => t.id).sort(), ['bugs', 'feedback', 'inventory', 'logs', 'shifts', 'tips']);
  for (const t of T.filter(t => t.group)) assert.ok(t.desc, t.id + ' 要有設定頁說明');
  assert.match(pos, /TABS\.filter\(t => !t\.group\)\.map/);
  assert.match(pos, /const navTab = TABS\.find\(t => t\.id === TAB\)\?\.group \|\| TAB/);
  assert.match(pos, /settings:tabSettings/);
  assert.match(pos, /else if \(TAB === 'settings'\) loadSettings\(\)/);
  assert.match(pos, /if \(TAB !== 'settings'\) resetSettings\(\)/);
  assert.match(pos, /<script src="\/pos-settings\.js"><\/script>/);
  assert.match(pos, /href="\/pos-settings\.css"/);
});
test('只有管理員能用的功能只在 admin，不放 POS（KK 11/2）', () => {
  const ops = read('public/pos-ops.js'), admin = read('public/admin.html');
  assert.doesNotMatch(set, /payment-methods|pm-form|pm-label|data-pm-toggle|data-pm-rename/, 'POS 設定頁不得管理收款帳戶');
  assert.match(admin, /paymentMethodsBlock\(d\)/, '收款帳戶管理在 admin 系統設定');
  assert.match(ops, /function onPosPage\(\)/);
  assert.match(ops, /DATA\?\.super&&!onPosPage\(\)\?`<button type="button" class="btn btn--ghost" data-reg-reopen/, '重開補單只在 admin');
  assert.match(ops, /!DATA\.brands&&!onPosPage\(\)&&await posConfirm\(/, '強制清桌只在 admin');
  assert.match(set, /列印站設定（USB ESC\/POS）/);
  assert.match(set, /EmojiPOSPrinterStationSetup\.ps1/);
  assert.match(set, /EmojiPOSPrinterStationInstaller\.zip/);
  assert.match(set, /Windows 安裝程式/);
  assert.match(set, /macOS 安裝程式/);
  assert.match(set, /配對這台 POS 主機/);
  assert.match(set, /儲存並測試列印/);
  assert.match(set, /escposCheck\(c\)/, '測試連線必須驗證 token 與 printerId，不可只測未授權 health');
  assert.doesNotMatch(set, /fetch\(c\.url\+'\/health'/, 'health 不驗 token，不能作為配對成功依據');
  assert.match(ops, /function escposCheck\(c\)/, 'ESC\/POS 配對檢查必須走授權端點');
  assert.match(ops, /\/printers/, 'ESC\/POS 配對檢查需驗證 bridge 列印機清單');
  assert.match(ops, /ESCPOS_LAST_ERROR/, '測試列印失敗必須保留 bridge 回傳的實際錯誤');
  assert.match(ops, /USB ESC\/POS 列印失敗/, '測試列印不可誤導成 mPOP USB-C 問題');
  assert.doesNotMatch(set, /\bconfirm\(|\bprompt\(/, '一律用 posConfirm／pickReason');
});
test('後端：GET 清單、POST/PATCH 超管或店長識別碼、API.md 有文件', () => {
  assert.match(server, /app\.get\('\/api\/admin\/payment-methods',auth,adminOnly,requireDb,/);
  assert.match(api, /### GET \/api\/admin\/payment-methods/);
  assert.match(api, /X-Manager-Pin/);
});
test('舊網址 /pos/products、/pos/customers 轉到 /pos/analytics', () => {
  assert.match(pos, /const LEGACY_ANALYTICS = \{ products:'products', customers:'customers' \}/);
  assert.match(pos, /history\.replaceState\(null, '', POS_BASE \+ '\/analytics\/' \+ ANALYTICS_KIND\)/);
});
