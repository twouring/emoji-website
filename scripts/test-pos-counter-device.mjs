// 櫃檯加點必須以已綁定 POS 裝置的名稱稽核，不能相信前端自填名稱。
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders');
const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');

const menu = new Map([['coffee', { id: 'coffee', zh: '咖啡', price: 100, venue: 'CAFE', cat: 'COFFEE' }]]);

test('櫃檯加點將後端確認的裝置名稱寫入品項，且不同裝置不合併', () => {
  const first = T.posAddLine([], menu, { item_id: 'coffee', qty: 1, device_name: '在咖啡吧台 iPad' });
  assert.equal(first[0].by, '櫃檯');
  assert.equal(first[0].device_name, '在咖啡吧台 iPad');
  const second = T.posAddLine(first, menu, { item_id: 'coffee', qty: 1, device_name: '三點水吧台 iPad' });
  assert.equal(second.length, 2, '不同裝置的加點不得合併，否則稽核來源會消失');
});

test('櫃檯加點：後端只查權杖綁定且已命名的裝置，缺漏一律拒絕', () => {
  const server = read('server.js');
  const pos = read('public/pos.html');
  const ops = read('public/pos-ops.js');
  const addRequest = ops.slice(ops.indexOf("const send=body=>opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/items'"), ops.indexOf('openItemOptions', ops.indexOf("const send=body=>opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/items'")));
  assert.match(pos, /let DEVICE_ID = localStorage\.getItem\('tth_pos_device'\)/);
  assert.doesNotMatch(addRequest, /device_id:/, '加點請求不得再傳可偽造的裝置代碼');
  assert.match(server, /pos_device:id/, 'PIN 登入簽發權杖必須綁定已驗證的裝置代碼');
  assert.match(server, /pos_device:req\.auth\.pos_device/, '續期後仍必須保留裝置綁定');
  assert.match(server, /async function counterDevice\(req\)/, '後端集中解析櫃檯加點裝置');
  assert.match(server, /req\.auth\.pos_device/, '加點僅採用權杖內已驗證的裝置代碼');
  assert.match(server, /SELECT label FROM pos_devices WHERE device_id=\$1 AND lower\(bound_by_email\)=\$2/, '裝置名稱必須從已綁定資料庫讀取');
  assert.match(server, /if\(!device\)return res\.status\(403\)\.json\(\{error:'這台 POS 尚未綁定或未設定裝置名稱，不能加點。'\}\);/);
  assert.match(server, /device_name:device\.label/, '只把後端確認的名稱傳給品項建立函式');
});
