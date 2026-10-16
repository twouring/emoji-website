import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),kitchen=require('../lib/pos-kitchen-print');
const line={line:'a',ticket:'tk_test',venue:'CAFE',zh:'咖啡',price:100,qty:1,note:'舊備註'};
function db(sources){let saved={id:'tk_test',table_no:'A1',items:[line]};return {query:async(sql,p)=>{if(sql.startsWith('SELECT job'))return {rows:[{job:saved}]};if(sql.includes('FROM table_sessions'))return {rows:sources};if(p[3])saved=JSON.parse(p[3]);return {rows:[{job:saved}]};}};}
test('claim refreshes pending ticket from live merged table, quantities and notes, omitting removed/served lines',async()=>{
 const d=db([{id:'ts_new',table_no:'B1',items:[{...line,qty:2,note:'無奶'},{...line,line:'b',served_at:'now'}]}]);
 const out=await kitchen.claim(d.query,'tk_test',['CAFE'],'staff');
 assert.equal(out.job.table_no,'B1');assert.equal(out.job.items.length,1);assert.equal(out.job.items[0].qty,2);assert.equal(out.job.items[0].note,'無奶');
});
test('removed, completed or cancelled source is retired without granting a print',async()=>{
 const out=await kitchen.claim(db([]).query,'tk_test',['CAFE'],'staff');assert.equal(out.claimed,false);
});
