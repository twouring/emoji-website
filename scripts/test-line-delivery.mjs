import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const line = require('../lib/line');
const deliveryModule = () => require('../lib/line-delivery');

test('LINE retry key 已接受的 409 視為成功，其他 409 仍失敗', async()=>{
  const reply = accepted => async()=>({ok:false,status:409,headers:{get:k=>accepted&&k==='x-line-accepted-request-id'?'request-1':null},text:async()=>JSON.stringify({message:'duplicate'})});
  assert.deepEqual(await line.push({accessToken:'t'},'U1','test',{retryKey:'key',fetcher:reply(true)}),{accepted:true});
  await assert.rejects(()=>line.push({accessToken:'t'},'U1','test',{fetcher:reply(false)}));
});

test('用餐評論邀請三語、僅接受完整 HTTPS URL，不含誘導好評', () => {
  for (const lang of ['zh','en','ja']) {
    const card = line.reviewCard('https://example.com/review', lang);
    assert.equal(card.type, 'flex');
    assert.match(JSON.stringify(card), /https:\/\/example.com\/review/);
  }
  for (const url of ['http://example.com', 'https://', 'https://a:b@example.com', 'javascript:alert(1)']) {
    assert.throws(() => line.reviewCard(url), /HTTPS/);
    assert.throws(() => require('../lib/system-settings').validate('LINE_REVIEW_URL',url), /HTTPS|https/);
  }
});

test('未設定不存取 DB；送出使用持久 retry key，重試不洩漏 API 回應', async () => {
  const { createLineDelivery } = deliveryModule();
  const queries = [], logs = [], calls = [];
  let configured = false, claimed = false, fail = true;
  const job = { id:'review:u1:2026-10-16', kind:'review', source_id:'o1', version:1, retry_key:'12345678-1234-4234-8234-123456789abc', attempts:1 };
  const q = async (sql, args) => {
    queries.push({sql,args});
    if (sql.includes('WITH picked')) { if(claimed)return {rows:[]}; claimed=true; return {rows:[job]}; }
    if(sql.includes('FROM table_orders o JOIN users')) return {rows:[{line_user_id:'U1'}]};
    return {rows:[],rowCount:1};
  };
  const service = createLineDelivery({q, origin:()=> 'https://www.emoji.tw', env:()=>configured?{LINE_CHANNEL_SECRET:'s',LINE_CHANNEL_ACCESS_TOKEN:'t',LINE_REVIEW_URL:'https://example.com/review'}:{}, buildTicket:async()=>null, log:{error:m=>logs.push(m)}, fetcher:async(url,init)=>{ calls.push(init); if(fail)throw Error('private@example.com SECRET'); return {ok:true,text:async()=> '{}'}; }});
  assert.equal(await service.run(),0); assert.equal(queries.length,0);
  configured=true; await service.run();
  assert.equal(calls[0].headers['X-Line-Retry-Key'],job.retry_key);
  assert.ok(queries.some(x=>x.sql.includes('last_error')&&x.args?.includes('delivery_failed')));
  assert.ok(logs.length); assert.ok(!JSON.stringify(logs).includes('private@'));
  claimed=false; fail=false; await service.run();
  assert.equal(calls[1].headers['X-Line-Retry-Key'],job.retry_key);
  assert.ok(queries.some(x=>x.sql.includes('sent_at=CASE')&&x.args.includes('sent')));
});
