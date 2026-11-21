// 結帳只顯示／結算已送出的客人餐點；客人還在手機購物車的草稿不可造成誤會或被誤收。
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ops=readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');

test('客人尚未送單的餐點不進結帳畫面、總額或收款 payload',()=>{
  assert.match(ops,/const posDraft=l=>!l\.order_id&&!l\.cancelled&&!l\.placed_at&&!l\.served_at&&!l\.credit_of&&l\.by!=='櫃檯'&&l\.by!=='官網'&&l\.guest!=='posstaff00';/,
    '草稿判斷與伺服器 isDraft 一致');
  assert.match(ops,/const checkoutLines=cur\.lines\.filter\(l=>!posDraft\(l\)\);/,
    '只有已送單的客人餐點可進結帳；櫃檯代點及預收抵扣維持可結帳');
  assert.match(ops,/const t=posTotals\(\{\.\.\.cur,lines:checkoutLines\}\);/,
    '未送單客人餐點不得計入應收');
  assert.match(ops,/const groups=lineGroups\(checkoutLines\)/,
    '品項表不得露出未送單客人餐點');
  assert.match(ops,/const unsentGuestLines=cur\.lines\.filter\(posDraft\);/,
    '只統計客人尚未送單的草稿');
  assert.match(ops,/另有 \$\{unsentGuestLines\.length\} 項客人還沒送出，不列入這次結帳/,
    '畫面只給流程提醒，不顯示餐點名稱');
  assert.match(ops,/lines:POS_PICK\?\[\.\.\.POS_PICK\]:picked\.map\(l=>l\.part_of\|\|l\.line\)/,
    '收款明細明確只送可結帳的品項，不能退回後端預設的整桌品項');
});

import {createRequire} from 'node:module';
const T=createRequire(import.meta.url)('../lib/table-orders.js');
const sent={line:'a1',item_id:'x',venue:'BAR',zh:'已送',price:100,qty:1,by:'小明',guest:'g1234567',order_id:null,placed_at:'2026-11-21T10:00:00Z'};
const draft={line:'b2',item_id:'y',venue:'BAR',zh:'草稿',price:80,qty:1,by:'小明',guest:'g1234567',order_id:null};
test('伺服器：草稿不擋結清與清桌（KK 11/21）',()=>{
  assert.equal(T.isDraft(draft),true);
  assert.equal(T.isDraft(sent),false);
  assert.equal(T.isDraft({...draft,by:'櫃檯'}),false,'櫃檯加的不是草稿');
  assert.equal(T.isDraft({...draft,by:'官網'}),false,'官網方案不是草稿');
  assert.equal(T.isDraft({...draft,served_at:'2026-11-21T10:00:00Z'}),false,'商店零售品已出，不是草稿');
  assert.equal(T.isDraft({...draft,credit_of:'to_1',price:-50}),false);
  assert.deepEqual(T.billable([sent,draft]).map(l=>l.line),['a1']);
  assert.equal(T.billable([{...sent,order_id:'to_1'},draft]).length,0,'只剩草稿＝已結清，可自動清桌');
});
