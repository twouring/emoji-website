import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = fs.readFileSync(path.join(root, 'public/admin.html'), 'utf8');

test('後台分為言文字與三個品牌工作區', () => {
  assert.match(html, /const WORKSPACES = \{/);
  assert.match(html, /label:'言文字'/);
  assert.match(html, /note:'所有品牌共用'/);
  assert.match(html, /CAFE:\{ slug:'cafe', label:'在咖啡'/);
  assert.match(html, /BAR:\{ slug:'bar', label:'三點水'/);
  assert.match(html, /SPACE:\{ slug:'space', label:'等等空間'/);
});

test('各工作區只呈現所屬功能', () => {
  assert.match(html, /ROOT_TABS = \['overview','members','commitments','updates','social','ads','permissions','system','logs'\]/);
  // 餐飲兩店：櫃檯結帳、出餐看板、訂位、日結、菜單（現場營運閉環）
  assert.match(html, /CAFE:\['pos','orders','reservations','sales','menu'\]/);
  assert.match(html, /BAR:\['pos','orders','reservations','sales','menu'\]/);
  assert.match(html, /SPACE:\['events','calendar','counter'\]/);
  assert.match(html, /const scopeTabs = \(\) => WORKSPACES\[SCOPE\]\.tabs/);
});

test('品牌切換攤開在頂欄，不再藏在下拉選單或側欄', () => {
  // 容器放在 <header class="a-top"> 內，按鈕由 render() 依權限填入
  assert.match(html, /<header class="a-top">[\s\S]*<div class="a-workspaces" id="a-workspaces"[^>]*aria-label="切換工作區"><\/div>[\s\S]*<\/header>/);
  assert.match(html, /class="a-tab-nav"/);
  assert.match(html, /data-scope=/);
  assert.doesNotMatch(html, /<select id="a-scope"/);
  assert.doesNotMatch(html, /a-workspaces-label/);
});

test('文案統一用「言文字」，不再寫「言文字共用」或「根帳號」', () => {
  assert.doesNotMatch(html, /言文字共用/);
  assert.doesNotMatch(html, /言文字根帳號|言文字 根後台/);
  assert.match(html, /言文字管理員/);
});

test('新網址包含工作區且舊網址仍可轉址', () => {
  assert.match(html, /const SCOPE_BY_SLUG =/);
  assert.match(html, /function scopedRoute\(/);
  assert.match(html, /return slug\+\(clean\?'\/'\+clean:''\)/);
  assert.match(html, /const requestedScope = SCOPE_BY_SLUG\[routeParts\.shift\(\)\]/);
  assert.match(html, /舊網址相容：未帶工作區或工作區不符時/);
});
