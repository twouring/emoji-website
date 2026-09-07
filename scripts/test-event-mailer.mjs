import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {deliverDue}=createRequire(import.meta.url)('../lib/event-mailer');
test('unsubscribe tokens are deterministic, purpose-bound and tamper resistant',()=>{
 const {signUnsubscribe,verifyUnsubscribe}=createRequire(import.meta.url)('../lib/event-mailer');
 const token=signUnsubscribe('mail_test_1','test-secret');assert.equal(token,signUnsubscribe('mail_test_1','test-secret'));
 assert.equal(verifyUnsubscribe(token,'test-secret'),'mail_test_1');
 for(const invalid of [token+'x',token.replace('mail_test_1','mail_test_2'),token+'.extra',null])assert.equal(verifyUnsubscribe(invalid,'test-secret'),null);
 assert.equal(verifyUnsubscribe(token,'wrong-secret'),null);
});
test('notification worker records provider acceptance, reuses a delivery key and blocks stale uncertain retries',async()=>{
 const row={id:'mail_1',email:'test@example.test',subject:'Test',body:'Test',first_attempt_at:new Date()};let updates=[];
 const q=async(sql,args)=>{if(sql.includes('RETURNING *'))return {rows:[row]};updates.push({sql,args});return {rows:[]};};
 let key;await deliverDue(q,async m=>{key=m.idempotencyKey;return {id:'provider_1'};});assert.equal(key,'event-delivery/mail_1');assert.match(updates[0].sql,/accepted/);
 updates=[];await deliverDue(q,async()=>{throw new Error('timeout');});assert.match(updates[0].sql,/retry/);
 row.first_attempt_at=new Date(Date.now()-24*3600000);updates=[];await deliverDue(q,async()=>{assert.fail('must not resend after provider idempotency expires');});assert.match(updates[0].sql,/review_required/);
});
test('event invitations use the selected event language and stay bound to invited status',async()=>{
 const {queueEventInvitation}=createRequire(import.meta.url)('../lib/event-mailer');let call;
 await queueEventInvitation(async(sql,args)=>(call={sql,args},{rows:[{id:args[0]}]}),{event:{id:'event_1',slug:'demo',title:'中文活動',translations:{en:{title:'English event'}}},registrationId:'registration_1',email:'guest@example.test',name:'Guest',language:'en',origin:'https://emoji.test'});
 assert.match(call.sql,/expected_status/);assert.equal(call.args[0],'invite_registration_1');assert.equal(call.args[3],"You're invited · English event");assert.match(call.args[4],/https:\/\/emoji\.test\/en\/events\/demo$/);assert.equal(call.args[8],'invited');
});
test('registration messages validate custom templates and retain localized defaults',()=>{
 const {normalizeRegistrationEmails,registrationMail}=createRequire(import.meta.url)('../lib/event-mailer');
 const email_templates=normalizeRegistrationEmails({confirmation:{subject:' Welcome ',body:' Your ticket is ready. '},pending:{subject:'',body:''},declined:{subject:'',body:''}});assert.equal(email_templates.confirmation.subject,'Welcome');
 const event={title:'English event',slug:'demo'};assert.equal(registrationMail({event,settings:{email_templates},lang:'en',status:'registered',name:'Guest',origin:'https://emoji.test'}).subject,'Welcome');
 assert.match(registrationMail({event,settings:{email_templates},lang:'ja',status:'pending_approval',origin:'https://emoji.test'}).subject,/承認待ち/);
 for(const bad of [null,{confirmation:{subject:3,body:''}},{confirmation:{subject:'x'.repeat(161),body:''}}])assert.throws(()=>normalizeRegistrationEmails(bad));
});
test('host invitations include the management link and calendar attachment',async()=>{
 const {queueHostInvitation}=createRequire(import.meta.url)('../lib/event-mailer');let call;await queueHostInvitation(async(sql,args)=>(call={sql,args},{rows:[{id:args[0]}]}),{event:{id:'event_1',title:'Test event'},email:'host@example.test',name:'Host',role:'manager',origin:'https://emoji.test',ics:'BEGIN:VCALENDAR'});
 assert.match(call.args[0],/^host_invite_/);assert.match(call.args[4],/https:\/\/emoji\.test\/organizer\/events\/event_1/);assert.equal(JSON.parse(call.args[5])[0].filename,'event.ics');
});
test('visible-only hosts receive the public event link',async()=>{
 const {queueHostInvitation}=createRequire(import.meta.url)('../lib/event-mailer');let call;await queueHostInvitation(async(sql,args)=>(call={sql,args},{rows:[{id:args[0]}]}),{event:{id:'event_1',slug:'demo',title:'Test event'},email:'host@example.test',name:'Host',role:'host',origin:'https://emoji.test'});
 assert.match(call.args[4],/https:\/\/emoji\.test\/events\/demo$/);assert.doesNotMatch(call.args[4],/organizer/);
});
test('contact-host messages validate content, hide recipients and keep retries idempotent',()=>{
 const {normalizeHostMessage,hostContactMail}=createRequire(import.meta.url)('../lib/event-contact');
 assert.equal(normalizeHostMessage('  Can I transfer my ticket?  '),'Can I transfer my ticket?');for(const bad of ['',null,{},'x'.repeat(5001)])assert.throws(()=>normalizeHostMessage(bad));
 const input={event:{id:'event_1',slug:'demo',title:'Demo event',contact_email:'creator@example.test'},sender:{id:'guest_1',name:'Guest',email:'guest@example.test'},message:'Can I transfer my ticket?',origin:'https://emoji.test'},mail=hostContactMail(input);
 assert.equal(mail.to,'creator@example.test');assert.equal(mail.replyTo,'guest@example.test');assert.match(mail.text,/https:\/\/emoji\.test\/events\/demo$/);assert.equal(mail.idempotencyKey,hostContactMail(input).idempotencyKey);assert.notEqual(mail.idempotencyKey,hostContactMail({...input,message:'Different'}).idempotencyKey);
});
test('Svix official signature vector, tampering, expiry and unknown versions',()=>{
 const {verifyMailWebhook}=createRequire(import.meta.url)('../lib/mail');
 const raw=Buffer.from('{"event_type":"ping","data":{"success":true}}'),secret='whsec_plJ3nmyCDGBKInavdOK15jsl',headers={'svix-id':'msg_loFOjxBNrRLzqYUf','svix-timestamp':'1731705121','svix-signature':'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0='};
 assert.equal(verifyMailWebhook(raw,headers,secret,1731705121000).event_type,'ping');
 assert.throws(()=>verifyMailWebhook(Buffer.from('{}'),headers,secret,1731705121000));
 assert.throws(()=>verifyMailWebhook(raw,headers,secret,1731705521000));
 assert.throws(()=>verifyMailWebhook(raw,{...headers,'svix-signature':headers['svix-signature'].replace('v1,','v2,')},secret,1731705121000));
});
test('blast targeting validates multiple statuses and prevents ticket filters for invitees',()=>{
 const {normalizeBlast}=createRequire(import.meta.url)('../lib/event-mailer');
 assert.deepEqual(normalizeBlast({subject:' Update ',body:' Details ',audiences:['registered','waitlisted','registered'],ticket_ids:['t_vip']}),{subject:'Update',body:'Details',audiences:['registered','waitlisted'],ticketIds:['t_vip']});
 for(const audiences of [[],['cancelled'],['invited']])assert.throws(()=>normalizeBlast({subject:'Update',body:'Details',audiences,ticket_ids:['t_vip']}));
});
test('rich notifications sanitize content and preserve the fixed HTML delivery body',async()=>{
 const {normalizeBlast}=createRequire(import.meta.url)('../lib/event-mailer');
 const value=normalizeBlast({subject:'News',body:'Details',body_html:'<h2>Details</h2><script>bad()</script>',audiences:['registered']});assert.equal(value.bodyHtml,'<h2>Details</h2>');
 assert.throws(()=>normalizeBlast({subject:'News',body:'Details',body_html:{},audiences:['registered']}));
 const row={id:'mail_rich',email:'test@example.test',subject:'News',body:'Details',body_html:'<h2>Details</h2><img src="/uploads/events/photo.png"><a href="/uploads/events/info.pdf">PDF</a>',first_attempt_at:new Date(),context:{registration_id:null,event_id:'event',slug:'event'}};
 const q=async sql=>sql.includes('RETURNING *')?{rows:[row]}:{rows:[],rowCount:0};let delivered;
 await deliverDue(q,async message=>{delivered=message;return {id:'provider_rich'};},'https://events.example.test','test-secret');
 assert.match(delivered.html,/<h2>Details<\/h2>/);assert.match(delivered.html,/https:\/\/events.example.test\/uploads\/events\/info.pdf/);assert.match(delivered.html,/<a href="https:\/\/events.example.test\/event-unsubscribe.html#token=/);assert.match(delivered.text,/Unsubscribe/);assert.equal(delivered.idempotencyKey,'event-delivery/mail_rich');
});
test('provider payload contains safe HTML plus unchanged plain text without any network call',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const require=createRequire(new URL('../lib/mail.js',import.meta.url));let payload;
 const module={exports:{}};runInNewContext(readFileSync(new URL('../lib/mail.js',import.meta.url),'utf8'),{module,require,process:{env:{RESEND_API_KEY:'fake-local-test-only'}},console,AbortSignal,fetch:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');payload=JSON.parse(options.body);return {ok:true,json:async()=>({id:'fake_delivery'})};}});
 await module.exports.sendMail({to:'nobody@example.test',subject:'Test',text:'Plain version',html:'<h2>Formatted</h2><script>bad()</script><a href="https://example.test/info.pdf">PDF</a>',idempotencyKey:'test-rich'});
 assert.equal(payload.text,'Plain version');assert.match(payload.html,/<h2>Formatted<\/h2>/);assert.doesNotMatch(payload.html,/script|bad\(\)/);assert.match(payload.html,/https:\/\/example.test\/info.pdf/);
});

test('cancellation is an essential event notice and does not inherit blast opt-outs',async()=>{
 const {notificationCategory}=await import('../lib/event-mailer.js');assert.equal(notificationCategory({id:'cancellation_test',context:{registration_id:null}}),null);assert.equal(notificationCategory({id:'host_invite_test',context:{registration_id:null}}),null);
});

test('worker suppresses cancellation mail when the event has reopened',async()=>{
 for(const [status,current] of [['報名中',true],['已取消',true],['已取消',false]]){
  const writes=[];let sent=0;const row={id:'cancellation_test',email:'local@example.test',subject:'Cancelled',body:'Reason',first_attempt_at:new Date(),context:{event_status:status,event_id:'test',cancellation_current:current}};
  const q=async(sql,args)=>{if(sql.includes('RETURNING *'))return {rows:[row]};writes.push({sql,args});return {rows:[]};};
  await deliverDue(q,async()=>{sent++;return {id:'mock-provider'};});
  assert.equal(sent,status==='已取消'&&current?1:0);assert.match(writes[0].sql,status==='已取消'&&current?/accepted/:/state='cancelled'/);
 }
});
