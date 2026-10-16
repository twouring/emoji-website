import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {createLineService}=require('../lib/line-service');
const env=()=>({LINE_CHANNEL_SECRET:'s',LINE_CHANNEL_ACCESS_TOKEN:'t'});
const owner='U'+'a'.repeat(32), other='U'+'b'.repeat(32);
const reservation={id:'r1',status:'confirmed',line_user_id:owner};
function harness(q){const calls=[],logs=[];return {calls,logs,svc:createLineService({q,env,uid:p=>p,origin:()=> 'https://www.emoji.tw',log:{error:m=>logs.push(m)},fetcher:async(url,init)=>{calls.push(init);return {ok:true,text:async()=> '{}'};}})};}
test('無法覆寫他人的訂位綁定，不能向陌生 LINE 洩漏訂位卡',async()=>{
 const h=harness(async sql=>({rows:sql.startsWith('SELECT')?[reservation]:[],rowCount:0}));
 assert.equal(await h.svc.linkReservation('r1',other),null);assert.equal(h.calls.length,0);
});
test('綁定不能解除他人 LINE，競態由唯一索引保護並回衝突',async()=>{
 const sql=[];const h=harness(async text=>{sql.push(text);return {rowCount:0,rows:[]};});
 await assert.rejects(()=>h.svc.bindUser('u1',owner),e=>e.status===409);
 assert.ok(!sql.some(x=>/SET line_user_id=NULL/.test(x)));
});
test('quiet 失敗有可觀測紀錄但不得寫入含個資的例外',async()=>{
 const h=harness(async()=>({rows:[]}));
 assert.equal(await h.svc.quiet('test',()=>{throw Error('secret@example.com token=secret');}),null);
 assert.equal(h.logs.length,1);assert.ok(!h.logs[0].includes('secret'));
});
test('LINE 取消以同一 dining_reservations 原子更新，仍檢查擁有者與軟刪除',async()=>{
 const sql=[]; const h=harness(async(text,args)=>{sql.push({text,args});return {rows:text.startsWith('SELECT')?[reservation]:[],rowCount:1};});
 assert.equal((await h.svc.cancelByLine('r1',owner)).ok,true);
 const update=sql.find(x=>x.text.includes("status='cancelled'"));
 assert.match(update.text,/line_user_id=\$2/);assert.match(update.text,/deleted_at IS NULL/);assert.equal(update.args[1],owner);
});
