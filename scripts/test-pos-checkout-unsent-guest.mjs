// 結帳只顯示／結算已送出的客人餐點；客人還在手機購物車的草稿不可造成誤會或被誤收。
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ops=readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');

test('客人尚未送單的餐點不進結帳畫面、總額或收款 payload',()=>{
  assert.match(ops,/const checkoutLines=cur\.lines\.filter\(l=>l\.credit_of\|\|l\.by==='櫃檯'\|\|l\.placed_at\);/,
    '只有已送單的客人餐點可進結帳；櫃檯代點及預收抵扣維持可結帳');
  assert.match(ops,/const t=posTotals\(\{\.\.\.cur,lines:checkoutLines\}\);/,
    '未送單客人餐點不得計入應收');
  assert.match(ops,/const groups=lineGroups\(checkoutLines\)/,
    '品項表不得露出未送單客人餐點');
  assert.match(ops,/const unsentGuestLines=cur\.lines\.filter\(l=>!l\.credit_of&&l\.by!=='櫃檯'&&!l\.placed_at\);/,
    '只統計客人尚未送單的草稿');
  assert.match(ops,/尚有 \$\{unsentGuestLines\.length\} 項客人餐點尚未送單，請先按「列印出餐單」送單後再結帳。/,
    '畫面只給流程提醒，不顯示餐點名稱');
  assert.match(ops,/lines:POS_PICK\?\[\.\.\.POS_PICK\]:picked\.map\(l=>l\.part_of\|\|l\.line\)/,
    '收款明細明確只送可結帳的品項，不能退回後端預設的整桌品項');
});
