import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const server = read('server.js');
const ops = read('public/pos-ops.js');
const docs = read('docs/API.md');

test('PATCH /api/admin/reservations/:id 修改訂位資訊：驗證同櫃檯登記、沿用原語言來源、擋別店時段', () => {
  assert.match(server, /app\.patch\('\/api\/admin\/reservations\/:id',auth,adminOnly,requireDb,wrap/);
  assert.match(server, /SELECT id,reserve_time,lang,source FROM dining_reservations WHERE id=\$1/);
  assert.match(server, /找不到這筆訂位。/);
  assert.match(server, /reservations\.normalizeReservation\(\{date:req\.body\?\.date,time:req\.body\?\.time,party_size:req\.body\?\.party_size,name:req\.body\?\.name,phone:req\.body\?\.phone,email:req\.body\?\.email,note:req\.body\?\.note,lang:cur\.lang,source:cur\.source\},new Date\(\),\{staff:true\}\)/, '驗證要用 staff:true（Email 可空、不擋 30 分鐘內時段），語言與來源沿用原紀錄');
  assert.match(server, /改到的時段不屬於自己的店別。/, '品牌子帳號不能把時段改到別的店別');
  assert.match(server, /UPDATE dining_reservations SET reserve_date=\$2,reserve_time=\$3,period=\$4,party_size=\$5,name=\$6,phone=\$7,email=\$8,note=\$9,updated_at=now\(\) WHERE id=\$1/);
  // 編輯端點不碰狀態／桌號／店內留言，那些仍走 /status
  assert.doesNotMatch(server.match(/app\.patch\('\/api\/admin\/reservations\/:id'[\s\S]*?\}\)\);/)[0], /staff_note|table_no|status=/);
});

test('docs/API.md 記錄 PATCH /api/admin/reservations/:id，且說明不會自動寄信通知客人', () => {
  assert.match(docs, /### PATCH \/api\/admin\/reservations\/:id/);
  const section = docs.split('### PATCH /api/admin/reservations/:id')[1].split(/\n### /)[0];
  assert.match(section, /不會自動寄信通知客人/);
  assert.match(section, /403/);
});

test('POS「訂位」分頁：每筆都有「編輯」按鈕，開啟表單可改日期／時間／人數／姓名／電話／Email／備註並送 PATCH', () => {
  assert.match(ops, /RESV_EDIT=null/, '全域狀態要有 RESV_EDIT（不被 15 秒自動刷新機制清掉用）');
  assert.match(ops, /data-resv-edit="\$\{esc\(r\.id\)\}">編輯<\/button>/);
  assert.match(ops, /const editing=RESV_EDIT\?d\.reservations\.find\(x=>x\.id===RESV_EDIT\):null;/);
  for (const id of ['re-date', 're-time', 're-party', 're-name', 're-phone', 're-email', 're-note', 're-save', 're-cancel']) {
    assert.match(ops, new RegExp(`id="${id}"`), `編輯表單缺 #${id}`);
  }
  assert.match(ops, /api\('\/admin\/reservations\/'\+editing\.id,\{method:'PATCH',body\}\)/);
  assert.match(ops, /host\.querySelectorAll\('\[data-resv-edit\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{RESV_EDIT=b\.dataset\.resvEdit;loadReservations\(\);\}\);/);
  assert.match(ops, /if\(reCancel\)reCancel\.onclick=\(\)=>\{RESV_EDIT=null;loadReservations\(\);\};/);
});
