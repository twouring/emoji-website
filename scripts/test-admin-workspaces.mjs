import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = fs.readFileSync(path.join(root, 'public/admin.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

// KK 2026-11-02：admin 不分品牌、以手機為主，主要使用者是言文字高管，首頁一次看所有品牌並挑出問題
test('後台不再分品牌工作區：沒有工作區切換、只有一組分頁', () => {
  assert.doesNotMatch(html, /const WORKSPACES = \{|id="a-workspaces"|data-scope=|tth_scope|BRAND_TABS|ROOT_TABS\b/);
  assert.match(html, /const ADMIN_TABS = \['overview','sales','staff','events','calendar','members','commitments','updates','menu','social','ads','outreach','partners','permissions','system','logs'\]/);
  assert.match(html, /const SCOPE = '';/, 'pos-ops.js 共用的 SCOPE 固定為所有品牌');
  assert.doesNotMatch(html, /tabCounter|paintCounter|COUNTER_UID/);
});

test('admin 只給總公司：品牌子帳號登入直接擋回 POS，沒有子帳號分支', () => {
  assert.match(html, /if \(d\.brands\) return renderLogin\('後台只開放總公司帳號/);
  assert.match(html, /const scopeTabs = \(\) => ADMIN_TABS;/);
  assert.match(html, /const homeTab = \(\) => 'overview';/);
  assert.doesNotMatch(html, /BRAND_HIDDEN|DATA\.brands|overviewTodoHTML/);
  assert.doesNotMatch(html, /d\.organizer|ORGANIZER_PORTAL/, 'admin 不再保留主辦模式分支');
});

test('手機：底部固定常用分頁＋「更多」整頁清單', () => {
  assert.match(html, /const DOCK_TABS = \['overview','sales','staff','events'\]/);
  assert.match(html, /<nav class="a-dock" aria-label="常用分頁">/);
  assert.match(html, /data-more aria-expanded="false" aria-controls="a-nav"/);
  assert.match(html, /\.a-dock\{position:fixed;left:0;right:0;bottom:0/);
  assert.match(html, /\.a-dock button\{[^}]*min-height:64px/, '觸控區 ≥44px');
  assert.match(html, /\.a-dock\{display:none\}/, '桌面不顯示底部分頁');
});

test('舊網址（/admin/shared|cafe|bar|space/…）拿掉工作區前綴', () => {
  assert.match(html, /const OLD_WORKSPACE_SLUGS = \['shared','cafe','bar','space'\]/);
  assert.match(html, /if \(clean !== h\) \{ history\.replaceState/);
  assert.doesNotMatch(html, /\/shared\//, '站內連結不再帶工作區');
  // 從本 repo 的 admin.html 切出函式在沙箱執行（內容是自家原始碼，不含外部輸入）
  const src = html.slice(html.indexOf('function scopedRoute(route){'), html.indexOf('function opsHref('));
  const ctx = { OLD_WORKSPACE_SLUGS: ['shared', 'cafe', 'bar', 'space'] };
  vm.runInNewContext(src, ctx);
  assert.equal(ctx.scopedRoute('shared/events/e1'), 'events/e1');
  assert.equal(ctx.scopedRoute('/cafe/sales/'), 'sales');
  assert.equal(ctx.scopedRoute('bar'), '');
  assert.equal(ctx.scopedRoute('events'), 'events');
});

test('總覽＝高管總覽：讀 /api/admin/exec、每分鐘自動更新、底部總覽鈕有問題數', () => {
  assert.match(html, /EXEC = await api\('\/admin\/exec'\)/);
  assert.match(html, /if \(tab === 'overview'\) \{ loadExec\(\); return; \}/);
  assert.match(html, /EXEC_TIMER = setTimeout\(/);
  assert.match(html, /data-exec-dot/);
  assert.match(html, /function execIssue\(i\)/);
  assert.match(html, /載入失敗：\$\{esc\(EXEC_ERR\)\}/, '讀取失敗要照實顯示');
});

test('API：/api/admin/exec 只給言文字管理員（不在品牌子帳號白名單）並寫進文件', () => {
  assert.match(server, /app\.get\('\/api\/admin\/exec',auth,adminOnly,requireDb,/);
  const food = server.match(/const FOOD_API = (\/.*\/);/)[1], shared = server.match(/const SHARED_API = (\/.*\/);/)[1];
  assert.doesNotMatch(food, /exec/); assert.doesNotMatch(shared, /exec/);
  assert.match(fs.readFileSync(path.join(root, 'docs/API.md'), 'utf8'), /### GET \/api\/admin\/exec/);
});

test('文案統一用「言文字」', () => {
  assert.doesNotMatch(html, /言文字共用/);
  assert.doesNotMatch(html, /言文字根帳號|言文字 根後台/);
  assert.match(html, /言文字管理員/);
});
