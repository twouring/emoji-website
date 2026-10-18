import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const ops = fs.readFileSync(new URL('public/pos-ops.js', root), 'utf8');
const css = fs.readFileSync(new URL('public/pos-ops.css', root), 'utf8');

test('操作說明＝標題後方的「?」tooltip，點擊才顯示', () => {
  assert.match(ops, /const tipIcon=html=>`<button type="button" class="tip-q"/);
  assert.match(css, /\.tip-q\{[^}]*min-width:44px;min-height:44px/, '觸控目標 44px');
  assert.match(css, /\.tip-pop\{position:fixed/);
  assert.match(ops, /e\.key==='Escape'/, 'Esc 可關閉');
});

test('各頁標題後都有說明圖示；說明文字不再直接攤在畫面上', () => {
  const heads = ['<h2>出餐', '<h2>櫃檯結帳</h2>${opsHelp', '<h2>查單</h2>${opsHelp', '<h2>訂位 ', '<h2>日結報表</h2>${opsHelp', '<h2>估清</h2>${opsHelp', '<h2>打卡</h2>${opsHelp', '<h2>排班表</h2>${staff.length?opsHelp', '<h3>開關帳</h3>${opsHelp', '<h3>員工</h3>${tipIcon', '<h3>出勤紀錄</h3>${opsHelp', '${tipIcon(CHECKOUT_TIP)}'];
  for (const h of heads) assert.ok(ops.includes(h), h);
  for (const t of ['補打卡${tipIcon', '操作人員${tipIcon', '要去哪一桌？${tipIcon', '開帳</h4>${tipIcon', '小結點驗</h4>${tipIcon'])
    assert.ok(ops.includes(t), t);
  assert.doesNotMatch(ops, /<h3>\$\{esc\((?:title|cfg\.title)\)\}<\/h3>(?:\$\{hint\?|<p class="hint">)/, '彈窗標題下不再攤開說明');
});
