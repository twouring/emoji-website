import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
const channels=createRequire(import.meta.url)('../lib/event-channels');

test('phone verification and text delivery use Twilio without accepting unverified formats',async()=>{
 const config={accountSid:'ACtest',authToken:'secret',verifyServiceSid:'VAverify',messagingServiceSid:'MGsender'},calls=[];
 const fetcher=async(url,request)=>{calls.push({url:String(url),body:Object.fromEntries(request.body)});return {ok:true,json:async()=>String(url).includes('VerificationCheck')?{status:'approved'}:{sid:'SMtest',status:'queued'}};};
 await channels.startPhoneVerification(config,{phone:'+886912345678',channel:'sms'},fetcher);assert.equal(calls[0].body.Channel,'sms');
 assert.equal(await channels.checkPhoneVerification(config,{phone:'+886912345678',code:'123456'},fetcher),true);
 const out=await channels.sendText(config,{to:'+886912345678',channel:'whatsapp',body:'Event update',statusCallback:'https://emoji.test/status'},fetcher);assert.equal(out.sid,'SMtest');assert.equal(calls[2].body.To,'whatsapp:+886912345678');
 await assert.rejects(()=>channels.startPhoneVerification(config,{phone:'0912345678',channel:'sms'},fetcher));
});

test('push delivery keeps the event URL and VAPID identity in the encrypted sender call',async()=>{
 let sent;await channels.sendPush({subject:'mailto:events@emoji.tw',publicKey:'public',privateKey:'private'},{endpoint:'https://push.example.test/1',keys:{auth:'a',p256dh:'b'}},{title:'Update',url:'/events/demo'},async(...args)=>(sent=args,{statusCode:201}));
 assert.equal(JSON.parse(sent[1]).url,'/events/demo');assert.equal(sent[2].vapidDetails.subject,'mailto:events@emoji.tw');
});

test('Twilio callbacks reject tampered delivery state',()=>{
 const url='https://emoji.test/api/twilio/events/status',params={MessageSid:'SMtest',MessageStatus:'delivered'},signature=createHmac('sha1','token').update(url+'MessageSidSMtestMessageStatusdelivered').digest('base64');
 assert.equal(channels.verifyTwilioSignature('token',url,params,signature),true);assert.equal(channels.verifyTwilioSignature('token',url,{...params,MessageStatus:'failed'},signature),false);
});
