import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = fs.readFileSync(path.join(root, 'public/admin.html'), 'utf8');

test('後台分為言文字與兩個品牌工作區（等等空間已移除）', () => {
  assert.match(html, /const WORKSPACES = \{/);
  assert.match(html, /label:'言文字'/);
  assert.match(html, /note:'所有品牌共用'/);
  assert.match(html, /CAFE:\{ slug:'cafe', label:'在咖啡'/);
  assert.match(html, /BAR:\{ slug:'bar', label:'三點水'/);
  assert.doesNotMatch(html, /SPACE:\{ slug:'space'/);
  assert.doesNotMatch(html, /label:'等等空間'/);
});

test('POS 相關分頁從 admin 移除，品牌工作區只剩日結報表；活動／行事曆併入言文字', () => {
  assert.match(html, /ROOT_TABS = \['overview','members','commitments','updates','menu','social','ads','outreach','events','calendar','permissions','system','logs'\]/);
  assert.match(html, /ROOT_TABS_BRAND = \['overview','members','commitments','updates','menu','social','ads','events','calendar'\]/);
  // 員工管理（排班打卡）刻意留在 admin：平板上用四位數密碼登入的現場人員不能改員工資料
  assert.match(html, /BRAND_TABS = \{ CAFE:\['sales','staff'\], BAR:\['sales','staff'\] \}/);
  assert.doesNotMatch(html, /CAFE:\['pos','orders'/, '在咖啡工作區不應再有 POS 分頁');
  assert.doesNotMatch(html, /SPACE:\['events','calendar','counter'\]/);
  assert.match(html, /const scopeTabs = \(\) => SCOPE === '' && DATA && DATA\.brands \? ROOT_TABS_BRAND : WORKSPACES\[SCOPE\]\.tabs/);
});

test('品牌子帳號也能進言文字共用工作區，但權限／系統設定／記錄仍限言文字管理員', () => {
  assert.match(html, /const scopesOf = d => d\?\.organizer \? \[''\] : d\?\.brands \? \['', \.\.\.d\.brands\]\.filter\(s => WORKSPACES\[s\]\) : \['', \.\.\.Object\.keys\(BRAND_LABEL\)\]/);
  // ROOT_TABS_BRAND（品牌子帳號在言文字工作區可見的分頁）不含這三頁
  assert.doesNotMatch(html.match(/ROOT_TABS_BRAND = \[[^\]]*\]/)[0], /permissions|system|logs/);
});

test('等等空間「櫃檯」（現場開通會籍）功能已下架', () => {
  assert.doesNotMatch(html, /tabCounter|paintCounter|COUNTER_UID/);
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

test('活動相關連結改用言文字（shared）工作區網址，不再指向已移除的 space 工作區', () => {
  assert.doesNotMatch(html, /BASE\+'\/space\/events/);
  assert.doesNotMatch(html, /\$\{BASE\}\/space\/events/);
  assert.match(html, /BASE\+'\/shared\/events/);
});
