// 會員 App（app.emoji.tw）安裝引導與管理入口
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const m = read('public/m.html');
const installKind = vm.runInNewContext(m.slice(m.indexOf('function installKind'), m.indexOf('/* install-end */')) + '\ninstallKind');
const base = { standalone: false, dismissedAt: 0, now: 1e12, hasPrompt: false, ios: false, inApp: false };

test('安裝引導：已安裝不顯示；7 天內按過「稍後」不顯示；之後再顯示', () => {
  assert.equal(installKind({ ...base, hasPrompt: true, standalone: true }), null);
  assert.equal(installKind({ ...base, hasPrompt: true, dismissedAt: 1e12 - 6 * 864e5 }), null);
  assert.equal(installKind({ ...base, hasPrompt: true, dismissedAt: 1e12 - 8 * 864e5 }), 'prompt');
});
test('安裝引導：Android／桌面用系統安裝視窗，iOS 教學，LINE 等內建瀏覽器要先換瀏覽器', () => {
  assert.equal(installKind({ ...base, hasPrompt: true }), 'prompt');
  assert.equal(installKind({ ...base, ios: true }), 'ios');
  assert.equal(installKind({ ...base, ios: true, inApp: true }), 'inapp');
  assert.equal(installKind({ ...base, hasPrompt: true, inApp: true }), 'inapp');
  assert.equal(installKind(base), null, '不支援也沒有安裝事件就不打擾');
});

test('App「我的」頁：管理員有「前往後台」、主辦有 App「管理我的活動」', () => {
  assert.match(m, /https:\/\/admin\.emoji\.tw\/admin/); assert.match(m, /href="\/host"/);
  assert.match(m, /role:s\.role,organizer:!!s\.organizer/);
});
test('官網不再有會員頁：member.html 三語已刪除、App 不再連回「完整會員專區」', () => {
  for (const f of ['public/member.html', 'public/en/member.html', 'public/ja/member.html']) assert.equal(fs.existsSync(new URL('../' + f, import.meta.url)), false, f);
  assert.doesNotMatch(m, /\/member\?web=1|完整會員專區/);
});
test('app 子站收到 #token= 後存起並清掉網址（沿用既有行為）；service worker 版本已更新', () => {
  assert.match(m, /hash\.get\('token'\)/);
  assert.match(read('public/m-sw.js'), /VERSION = 'm-v([5-9]|\d{2,})'/);
});
