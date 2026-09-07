import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const {normalizeEventInput,localizeEvent}=require('../lib/events');
const {eventPage,featuredEvent}=require('../lib/event-page');
const seed=require('../lib/halloween-seed.json');
const event={id:'e_halloween_2026',slug:'halloween-2026',...seed.zh,translations:seed,status:'預告',visibility:'public',price_twd:0,starts_at_iso:'2026-10-31T18:00',ends_at_iso:'2026-11-01T00:00'};
test('event translations reject invalid fields and preserve omitted payloads',()=>{
 assert.equal(normalizeEventInput({title:'test'}).value.translations,undefined);
 for(const translations of [[],{xx:{}},{en:{html:'<b>'}},{en:{title:'x'.repeat(10001)}},{en:{title:3}}]) assert.ok(normalizeEventInput({title:'test',translations}).error);
 assert.equal(normalizeEventInput({title:'中文',status:'預告',translations:{zh:{title:'stale'}}}).value.translations.zh.title,'中文');
 assert.ok(normalizeEventInput({title:'test',status:'typo'}).error);
 assert.equal(localizeEvent(event,'en').title,seed.en.title);
 assert.equal(localizeEvent({...event,translations:{en:{title:''}}},'en').title,event.title);
});
test('three-language landing renders safe editable copy and preview never advertises free tickets',()=>{
 for(const lang of ['zh','en','ja']){
  const file=new URL(`../public/${lang==='zh'?'':lang+'/'}halloween-2026.html`,import.meta.url);
  const out=eventPage(fs.readFileSync(file,'utf8'),event,lang==='zh'?'/halloween-2026':`/${lang}/halloween-2026`);
  assert.ok(out.includes(seed[lang].title));assert.doesNotMatch(out,/\{\{/);assert.doesNotMatch(out,/href="[^\"]*\/events\/halloween-2026/);
 }
 const evil={...event,translations:{...seed,en:{...seed.en,headline:'<script>alert(1)</script>',section_title:''}}};
 const out=eventPage('{{headline}}|{{section_title}}',evil,'/en/halloween-2026');
 assert.match(out,/&lt;script&gt;/);assert.ok(out.includes(seed.zh.section_title));
});
test('registration state and price control CTA; private/draft events never appear as featured',()=>{
 assert.match(eventPage('{{actions}}',{...event,status:'報名中',price_twd:800},'/en/halloween-2026'),/NT\$800/);
 assert.match(eventPage('{{actions}}',{...event,status:'報名中'},'/ja/halloween-2026'),/\/ja\/events\/halloween-2026/);
 for(const e of [null,{...event,status:'草稿'},{...event,visibility:'private'},{...event,status:'已結束'}])assert.equal(featuredEvent('<!--FEATURED_EVENT-->',e,'/'),'');
 assert.match(featuredEvent('<!--FEATURED_EVENT-->',event,'/en/'),/\/en\/halloween-2026/);
});
test('registration attribution keeps supported campaign and ad IDs without accepting arbitrary payloads',()=>{
 const {normalizeAttribution}=require('../lib/events');
 const out=normalizeAttribution({source:' newsletter ',campaign:'launch',medium:'email',content:'hero',term:'community',gclid:'g'.repeat(300),fbclid:'fb123',li_fat_id:'li123',email:'private@example.test',referral:{bad:true}});
 assert.equal(out.source,'newsletter');assert.equal(out.medium,'email');assert.equal(out.gclid.length,256);assert.equal(out.fbclid,'fb123');assert.equal(out.li_fat_id,'li123');assert.equal(out.referral,'');assert.equal(out.email,undefined);assert.equal(normalizeAttribution(null).source,'');
});

test('check-in workspace localizes controls and exposes staff modes without a parallel UI',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../public/event-checkin.html',import.meta.url),'utf8');
 const init=source.slice(source.indexOf('const lang='),source.indexOf('const eventId='));
 for(const [lang,title,label] of [['zh','活動現場簽到','確認簽到'],['en','Event check-in','Confirm check-in'],['ja','イベント受付','受付を確定']]){
  const heading={dataset:{i18n:'title'},textContent:''},button={dataset:{i18n:'submit'},textContent:''},input={dataset:{placeholder:'placeholder'},placeholder:''},recent={dataset:{}},document={title:'',documentElement:{},querySelectorAll:selector=>selector==='[data-i18n]'?[heading,button]:[input],getElementById:id=>id==='recent'?recent:null};
  runInNewContext(init,{document,location:{search:'?lang='+lang},URLSearchParams});
  assert.equal(document.title,title+'｜言文字');assert.equal(button.textContent,label);assert.ok(input.placeholder);assert.ok(recent.dataset.empty);assert.equal(document.documentElement.lang,lang==='zh'?'zh-Hant':lang);
 }
 assert.match(source,/name="mode" value="standard"/);assert.match(source,/name="mode" value="express"/);assert.match(source,/id="guest-search"/);
});

test('check-in camera ignores repeated starts and stops a stream granted after leaving the page',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../public/event-checkin.html',import.meta.url),'utf8');let grant,requests=0,stopped=0,leave;
 const camera={disabled:false,setAttribute(k,v){this[k]=v;}},video={hidden:true},context={T:{cameraUnavailable:'no camera',cameraFailed:'camera failed',ready:'ready'},mode:'standard',cameraVersion:0,stream:null,frame:null,window:{BarcodeDetector:class{}},navigator:{mediaDevices:{getUserMedia(){requests++;return new Promise(resolve=>grant=resolve);}}},document:{getElementById:id=>id==='camera'?camera:video},result:{},checkIn(){},cancelAnimationFrame(){},requestAnimationFrame(){},addEventListener:(name,fn)=>{leave=fn;}};
 const end=source.indexOf('addEventListener("pagehide",stop);')+'addEventListener("pagehide",stop);'.length;
 runInNewContext(source.slice(source.indexOf('function stop()'),end),context);
 const pending=camera.onclick();await camera.onclick();assert.equal(requests,1);assert.equal(camera['aria-busy'],'true');leave();grant({getTracks:()=>[{stop(){stopped++;}}]});await pending;
 assert.equal(stopped,1);assert.equal(video.hidden,true);assert.equal(video.srcObject,null);assert.equal(camera.disabled,false);assert.equal(camera['aria-busy'],'false');
});

test('check-in undo keeps a retryable failure and refreshes only after success',async()=>{
 const {runInNewContext}=await import('node:vm'),source=fs.readFileSync(new URL('../public/event-checkin.html',import.meta.url),'utf8'),result={};let calls=0,painted=0;
 const context={T:{undone:'Undone'},result,context:null,encodeURIComponent,paintContext(){painted++;},api:async()=>{calls++;throw Error('Retry undo');}};
 runInNewContext(source.slice(source.indexOf('async function undoGuest('),source.indexOf('form.onsubmit=')),context);
 assert.equal(await context.undoGuest({registration_id:'reg'}),false);assert.equal(result.textContent,'Retry undo');assert.equal(calls,1);assert.equal(painted,0);
 context.api=async()=>++calls===2?{}:{guests:[]};assert.equal(await context.undoGuest({registration_id:'reg'}),true);assert.equal(result.textContent,'Undone');assert.equal(painted,1);
});

test('feedback and coupon actions prevent repeats and restore controls with persistent results',async()=>{
 const {runInNewContext}=await import('node:vm'),source=fs.readFileSync(new URL('../public/events.html',import.meta.url),'utf8');
 const context={lang:'en'};runInNewContext(source.slice(source.indexOf('async function feedbackAction('),source.indexOf('async function register(')),context);
 const button={textContent:'Check discount',setAttribute(k,v){this[k]=v;}},result={};let resolve,calls=0;
 const pending=context.feedbackAction(button,result,()=>{calls++;return new Promise(r=>{resolve=r;});});
 assert.equal(button.disabled,true);assert.equal(button['aria-busy'],'true');assert.equal(button.textContent,'Processing…');await context.feedbackAction(button,result,()=>{calls++;});assert.equal(calls,1);
 resolve('NT$100 · No place reserved yet');await pending;assert.equal(result.textContent,'NT$100 · No place reserved yet');assert.equal(button.disabled,false);assert.equal(button.textContent,'Check discount');
 await context.feedbackAction(button,result,async()=>{throw Error('Please retry');});assert.equal(result.textContent,'Please retry');assert.equal(button.disabled,false);assert.equal(button['aria-busy'],'false');
});

test('changing quote inputs invalidates an in-flight price or error',async()=>{
 const {runInNewContext}=await import('node:vm'),source=fs.readFileSync(new URL('../public/events.html',import.meta.url),'utf8');
 const result={},button={textContent:'Check',setAttribute(){}};let invalidate,finish;
 const context={lang:'en',document:{getElementById:id=>id==='coupon-result'?result:{addEventListener:(name,handler)=>{invalidate=handler;}}}};
 runInNewContext(source.slice(source.indexOf("  document.getElementById('ev-registration-form').addEventListener('input'"),source.indexOf('  const ticketSelect=')),context);
 runInNewContext(source.slice(source.indexOf('async function feedbackAction('),source.indexOf('async function register(')),context);
 for(const fail of [false,true]){const pending=context.feedbackAction(button,result,()=>new Promise((resolve,reject)=>{finish=fail?reject:resolve;}));invalidate({target:{name:'ticket_id'}});finish(fail?Error('Old error'):'Old price');await pending;assert.equal(result.textContent,'');assert.equal(button.disabled,false);}
});

test('changing group quantity preserves attendee drafts without inserting executable attributes',async()=>{
 const {runInNewContext}=await import('node:vm'),source=fs.readFileSync(new URL('../public/events.html',import.meta.url),'utf8');let change,inputs=[];
 const container={querySelectorAll:()=>inputs,innerHTML:''};const context={lang:'en',esc:value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),document:{getElementById:id=>id==='ticket-attendees'?container:{addEventListener:(name,handler)=>{change=handler;}}}};
 runInNewContext(source.slice(source.indexOf('  const attendeeDraft={}'),source.indexOf("  document.getElementById('ev-registration-form').addEventListener('input'")),context);
 change({target:{value:'2'}});assert.match(container.innerHTML,/Name \(required\)/);
 inputs=[{name:'attendee_name_0',value:'A "guest"'},{name:'attendee_email_0',value:'one@example.test'},{name:'attendee_name_1',value:'Second'}];change({target:{value:'3'}});
 assert.match(container.innerHTML,/value="A &quot;guest&quot;"/);assert.match(container.innerHTML,/value="one@example.test"/);assert.match(container.innerHTML,/value="Second"/);
 inputs=[];change({target:{value:'1'}});assert.equal(container.innerHTML,'');change({target:{value:'2'}});assert.match(container.innerHTML,/value="Second"/);
});

test('cancelled and unpublished events do not expose online meeting URLs even to registered accounts',()=>{
 const online={...event,registered:true,event_details:{online_url:'https://example.test/private-meeting'}};
 assert.equal(localizeEvent({...online,status:'報名中'},'en').event_details.online_url,'https://example.test/private-meeting');
 for(const status of ['草稿','預告','已取消'])assert.equal(localizeEvent({...online,status},'en').event_details.online_url,undefined);
 assert.equal(localizeEvent({...online,registered:false,status:'報名中'},'en').event_details.online_url,undefined);
});

test('insights ignores obsolete responses and offers retry after current failure',async()=>{
 const {runInNewContext}=await import('node:vm'),source=fs.readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');let current,html='',requests=[];
 const host={replaceChildren(node){current=node;html='';},contains:node=>node===current,scrollIntoView(){},set innerHTML(value){html=value;current=null;},get innerHTML(){return html;}},retry={},select={};
 const context={document:{createElement:()=>({setAttribute(){}}),getElementById:id=>id==='ev-hosts'?host:id==='insight-retry'?retry:select},api:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),esc:v=>String(v)};
 runInNewContext(source.slice(source.indexOf('async function showEventInsights('),source.indexOf('async function showEventPayments(')),context);
 const older=context.showEventInsights('one'),newer=context.showEventInsights('two',1);
 requests[1].resolve({views:[],guests:[],visitors:{},attribution:[]});await newer;const latest=html;assert.match(latest,/今天/);requests[0].reject(Error('Old failure'));await older;assert.equal(html,latest);
 const failed=context.showEventInsights('two',7);requests[2].reject(Error('Unavailable'));await failed;assert.match(html,/Unavailable/);assert.equal(typeof retry.onclick,'function');
 const pending=retry.onclick();requests[3].resolve({views:[],guests:[]});await pending;assert.doesNotMatch(html,/Unavailable/);
});

test('insights CSV uses the loaded scope and keeps views and registrations distinct',async()=>{
 const {runInNewContext}=await import('node:vm'),source=fs.readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');let click,exported;
 const context={document:{getElementById:()=>({set onclick(value){click=value;}})},id:'event',days:1,visits:3,registered:2,checked:1,selfService:1,selfRegistered:2,selfChecked:1,data:{visitors:{unique_sessions:2},online:{participants:1,clicks:2},views:[{day:'2026-09-07',source:'partner',campaign:'sale',views:3}],registrations:[{day:'2026-09-07',bookings:2,self_service_bookings:1,registered:3,self_service_registered:2,self_service_checked_in:1}],attribution:[{source:'partner',campaign:'sale',referral:'friend',bookings:1,registered:2}]},downloadCSV:(name,rows)=>{exported={name,rows};}};
 runInNewContext(source.slice(source.indexOf(" document.getElementById('insight-export').onclick="),source.indexOf(" document.getElementById('insight-days').onchange=")),context);click();
 assert.equal(exported.name,'活動數據-event-1天.csv');assert.ok(exported.rows.every(row=>row.length===8));assert.equal(exported.rows.find(row=>row[0]==='瀏覽')[2],'2026-09-07');assert.match(exported.rows[1][1],/今天/);assert.equal(exported.rows.find(row=>row[6]==='有效報名人數')[1],'目前累計');assert.equal(exported.rows.find(row=>row[6]==='前台自行報名筆數')[7],1);assert.equal(exported.rows.find(row=>row[6]==='前台報名目前已簽到')[7],1);assert.equal(exported.rows.filter(row=>row[0]==='報名來源').length,2);
});

test('event management opens one task-based panel instead of expanding every action in the table',async()=>{
 const {runInNewContext}=await import('node:vm'),source=fs.readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');
 const context={EVENT_FIELDS:[],BASE:'/admin',esc:v=>String(v),NT:v=>'NT$'+v};
 runInNewContext(source.slice(source.indexOf('function tabEvents('),source.indexOf('function openEventEditor(')),context);
 const list=context.tabEvents({events:[{id:'event-1',slug:'event-one',title:'Example',status:'報名中',visibility:'public',capacity:10,reg_count:2,checkin_count:1,price_twd:0}],users:[]});
 assert.equal((list.match(/data-ev-manage=/g)||[]).length,1);assert.match(list,/href="\/admin\/events\/event-1"/);assert.doesNotMatch(list,/<summary>管理活動/);assert.match(list,/id="ev-manager"/);
 assert.match(list,/id="event-editor-title">建立新活動/);assert.match(list,/建立活動後，再設定票種、報名表與公開頁內容/);
 assert.match(source,/id="rg-ticket"/);assert.match(source,/<option value="">全部<\/option><option value="registered">已報名<\/option>/);assert.match(source,/data-guest-tickets=/);
 context.BASE='/organizer';assert.match(context.tabEvents({events:[{id:'event-1',title:'Example',status:'草稿'}],organizer:true}),/href="\/organizer\/events\/event-1"/);context.BASE='/admin';
 const manager={hidden:true,innerHTML:'',querySelector:()=>({}),querySelectorAll:()=>[],scrollIntoView(){}},listView={hidden:false};
 context.document={title:'',getElementById:id=>id==='ev-manager'?manager:id==='event-list-view'?listView:{hidden:false,style:{}}};
 runInNewContext(source.slice(source.indexOf('function showEventManager('),source.indexOf('function tabApplications(')),context);
 context.showEventManager('event-1',{events:[{id:'event-1',slug:'event-one',title:'Example',status:'報名中',capacity:10,reg_count:2,checkin_count:1}],can_create_events:true});
 assert.equal(manager.hidden,false);assert.equal(listView.hidden,true);assert.match(manager.innerHTML,/返回活動清單/);assert.match(manager.innerHTML,/報名與來賓/);assert.match(manager.innerHTML,/票券與報名流程/);assert.match(manager.innerHTML,/活動頁與分享/);assert.match(manager.innerHTML,/成效與紀錄/);assert.equal((manager.innerHTML.match(/ui-button--accent/g)||[]).length,1);
});

test('online join waits for authorization and retains a retryable error without navigating',async()=>{
 const {runInNewContext}=await import('node:vm'),source=fs.readFileSync(new URL('../public/events.html',import.meta.url),'utf8');
 for(const lang of ['zh','en','ja']){
  let click,resolve,reject,navigated,calls=0;const button={textContent:'Join',setAttribute(k,v){this[k]=v;}},result={};
  const context={lang,embedded:false,e:{id:'local-event'},document:{getElementById:id=>id==='event-online-open'?{removeAttribute(){}}:id==='event-online-status'?result:{addEventListener:(name,handler)=>{click=handler;}}},api:(path,options)=>{assert.equal(path,'/events/local-event/join-online');assert.equal(options.method,'POST');calls++;return new Promise((ok,no)=>{resolve=ok;reject=no;});},location:{assign:url=>{navigated=url;}}};
  runInNewContext(source.slice(source.indexOf('async function feedbackAction('),source.indexOf('async function register(')),context);
  runInNewContext(source.slice(source.indexOf("  document.getElementById('event-online-join')?.addEventListener"),source.indexOf("  document.getElementById('event-feedback')?.addEventListener")),context);
  const pending=click({currentTarget:button});assert.equal(button.disabled,true);assert.equal(navigated,undefined);await click({currentTarget:button});assert.equal(calls,1);reject(Error('Registration is no longer valid'));await pending;assert.equal(navigated,undefined);assert.equal(result.textContent,'Registration is no longer valid');assert.equal(button.disabled,false);
  const retry=click({currentTarget:button});resolve({url:'https://example.test/meeting'});await retry;assert.equal(navigated,'https://example.test/meeting');assert.equal(button['aria-busy'],'false');
 }
});

test('embedded online join exposes a separate-tab link only after successful authorization',async()=>{
 const {runInNewContext}=await import('node:vm'),source=fs.readFileSync(new URL('../public/events.html',import.meta.url),'utf8');let click,resolve,reject;
 const button={textContent:'Join',setAttribute(){}},result={},link={hidden:false,href:'https://example.test/old',removeAttribute(name){delete this[name];}};
 const context={lang:'en',embedded:true,e:{id:'test'},document:{getElementById:id=>id==='event-online-open'?link:id==='event-online-status'?result:{addEventListener:(name,handler)=>{click=handler;}}},api:()=>new Promise((yes,no)=>{resolve=yes;reject=no;}),location:{assign(){assert.fail('must not navigate the iframe');}}};
 runInNewContext(source.slice(source.indexOf('async function feedbackAction('),source.indexOf('async function register(')),context);
 runInNewContext(source.slice(source.indexOf("  document.getElementById('event-online-join')?.addEventListener"),source.indexOf("  document.getElementById('event-feedback')?.addEventListener")),context);
 let pending=click({currentTarget:button});assert.equal(link.hidden,true);assert.equal(link.href,undefined);resolve({url:'https://example.test/meeting'});await pending;assert.equal(link.hidden,false);assert.equal(link.href,'https://example.test/meeting');assert.match(result.textContent,/verified/);
 pending=click({currentTarget:button});reject(Error('No longer registered'));await pending;assert.equal(link.hidden,true);assert.equal(link.href,undefined);
});

test('event cancellation checks provider status and skips already closed checkouts on retry',async()=>{
 const {runInNewContext}=await import('node:vm'),source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');const retrieved=[],expired=[];
 const context={open:['open','expired','complete'].map(status=>({stripe_session_id:status})),stripe:{checkout:{sessions:{retrieve:async id=>{retrieved.push(id);return {id,status:id};},expire:async id=>{expired.push(id);}}}}};
 const code=source.slice(source.indexOf(' for(const row of open){'),source.indexOf(' const held=',source.indexOf(' for(const row of open){')));
 await runInNewContext('(async()=>{'+code+'})()',context);assert.deepEqual(retrieved,['open','expired','complete']);assert.deepEqual(expired,['open']);
});

test('cancellation form retains failures, prevents duplicate submits and validates the reason before confirming',async()=>{
 const {runInNewContext}=await import('node:vm'),source=fs.readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');let click,confirmations=0,calls=0,reject;
 const button={textContent:'Cancel',setAttribute(k,v){this[k]=v;}},message={},reason={value:'',focus(){this.focused=true;},setAttribute(k,v){this[k]=v;}},notify={checked:true};
 const context={id:'local',event:{status:'報名中'},document:{getElementById:id=>id==='detail-cancel'?{set onclick(value){click=value;}}:id==='detail-message'?message:id==='detail-cancel-reason'?reason:notify},confirm:()=>{confirmations++;return true;},api:()=>{calls++;return new Promise((yes,no)=>{reject=no;});}};
 runInNewContext(source.slice(source.indexOf(" document.getElementById('detail-cancel').onclick="),source.indexOf(" host.scrollIntoView",source.indexOf(" document.getElementById('detail-cancel').onclick="))),context);
 await click({currentTarget:button});assert.equal(confirmations,0);assert.equal(reason.focused,true);assert.equal(reason['aria-invalid'],'true');
 reason.value='Weather';const pending=click({currentTarget:button});await click({currentTarget:button});assert.equal(calls,1);assert.equal(confirmations,1);assert.equal(reason['aria-invalid'],'false');assert.equal(button['aria-busy'],'true');reject(Error('Mail service unavailable'));await pending;
 assert.equal(message.textContent,'Mail service unavailable');assert.equal(reason.value,'Weather');assert.equal(notify.checked,true);assert.equal(button.disabled,false);assert.equal(button.textContent,'Cancel');assert.equal(context.event.status,'報名中');
});

test('cancellation reason uses the requested translation and falls back to the original',()=>{
 const cancelled={...event,event_details:{cancellation_reason:'天候因素',cancellation_translations:{en:'Bad weather',ja:' '}}};
 assert.equal(localizeEvent(cancelled,'en').event_details.cancellation_reason,'Bad weather');assert.equal(localizeEvent(cancelled,'ja').event_details.cancellation_reason,'天候因素');
});
