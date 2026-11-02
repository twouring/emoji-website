import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');

test('POS 開桌帳單自動帶入桌上已登入會員（KK 11/2）', () => {
  assert.match(src, /function posAutoMember\(cur\)/);
  assert.match(src, /posAutoMember\(cur\)/, 'paintPos 要呼叫');
  const fn = src.slice(src.indexOf('function posAutoMember'), src.indexOf('function tableMembersHtml'));
  assert.match(fn, /member_id:m\.id,session_id:cur\.id/, '走同一條 lookup 驗證（場次＋members）');
  assert.match(fn, /POS_YAN\.id\|\|POS_YAN\.phone/, '已手動選會員不覆蓋');
  assert.match(fn, /POS_AUTO_SKIP/, '移除後不再自動帶');
  assert.match(src, /pos-yan-clear'\);if\(clr\)clr\.onclick=\(\)=>\{POS_AUTO_SKIP\.add\(cur\.id\)/);
});
