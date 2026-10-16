import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('floor layout parser migrates legacy order, validates table keys and finite coordinates',()=>{
 const s=read('server.js'),ctx={};vm.createContext(ctx);vm.runInContext(s.slice(s.indexOf('function tableLayoutParse('),s.indexOf('// 桌況',s.indexOf('function tableLayoutParse('))),ctx);
 assert.equal(JSON.stringify(ctx.tableLayoutParse('["B2","A1"]')),'{"order":["B2","A1"],"pos":{}}');
 const out=ctx.tableLayoutParse(JSON.stringify({pos:{A1:[20,30],bad:[null,3],B1:[101,4],C1:['10',30]}}));
 assert.equal(JSON.stringify(out),'{"order":[],"pos":{"A1":[20,30]}}');
});
test('floor editor keeps drag targets inside canvas even with many added tables',()=>{
 const s=read('public/pos-ops.js'),ctx={};vm.createContext(ctx);vm.runInContext(s.slice(s.indexOf('function defaultTablePos('),s.indexOf('function paintPos(')),ctx);
 const names=Array.from({length:40},(_,i)=>'A'+i),pos=ctx.defaultTablePos(names,{});
 for(const [x,y] of Object.values(pos)){assert.ok(x>=0&&x<=76);assert.ok(y>=0&&y<=76);}
});
