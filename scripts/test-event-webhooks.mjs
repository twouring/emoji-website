import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{blockedIp,normalizeWebhook,signature}=require('../lib/event-webhooks');

test('event webhook validation rejects internal targets and invalid subscriptions',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.1.1','::1','fd00::1'])assert.equal(blockedIp(ip),true,ip);
 assert.match(normalizeWebhook({url:'http://example.com/hook',events:['event.updated']}).error,/HTTPS/);
 assert.match(normalizeWebhook({url:'https://127.0.0.1/hook',events:['event.updated']}).error,/內部/);
 assert.match(normalizeWebhook({url:'https://[::1]/hook',events:['event.updated']}).error,/內部/);
 assert.match(normalizeWebhook({url:'https://example.com/hook',events:[]}).error,/至少/);
 assert.deepEqual(normalizeWebhook({url:'https://example.com/hook',events:['event.updated','event.updated']}).value.events,['event.updated']);
 assert.ok(normalizeWebhook({url:'http://127.0.0.1/hook',events:['event.updated']},{allowLoopback:true}).value);
 assert.match(normalizeWebhook({url:'http://10.0.0.1/hook',events:['event.updated']},{allowLoopback:true}).error,/HTTPS|內部/);
});

test('event webhook signature covers the timestamp and exact JSON body',()=>{
 const secret='whsec_test',timestamp='1788796800',body=JSON.stringify({type:'guest.registered',data:{guest:{id:'r_1'}}});
 assert.equal(signature(secret,timestamp,body),crypto.createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex'));
 assert.notEqual(signature(secret,timestamp,body+' '),signature(secret,timestamp,body));
});
