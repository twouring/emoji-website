// 內用開桌（單桌、訂位桌、一次開多桌）完成後回結帳分頁桌況，不停在該桌帳單；外帶與已開的桌才切進去（KK 11/4）
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
test('單桌開桌：新開內用回桌況',()=>assert.match(src,/POS_TABLE=\(out\.created&&!out\.takeout\)\?'':out\.table;/));
test('訂位桌開桌：新開回桌況',()=>assert.match(src,/POS_TABLE=out\.created\?'':out\.table;POS_PICK=null;/));
test('一次開多桌：回桌況',()=>{const f=src.slice(src.indexOf('async function openManyTables'));assert.match(f.slice(0,f.indexOf('\n}\n')),/POS_TABLE='';await reload\(\);/);});
test('開桌成功不得直接 POS_TABLE=out.table',()=>assert.doesNotMatch(src,/async out=>\{POS_TABLE=out\.table;/));
