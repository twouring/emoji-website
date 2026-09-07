import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {embedOrigins}=createRequire(import.meta.url)('../lib/event-embed');
test('embedding permits only precise HTTPS origins, with explicit local test support',()=>{
 assert.deepEqual(embedOrigins(['https://example.com/','https://example.com','https://events.example.com:8443']),['https://example.com','https://events.example.com:8443']);
 for(const value of [null,'https://example.com',['http://example.com'],['https://example.com/path'],['https://user:pass@example.com'],['https://*.example.com'],['https://example.com?x=1'],['https://example.com/#x'],Array(11).fill('https://example.com'),['javascript:alert(1)'],['https://example.com\'; script-src *']])assert.throws(()=>embedOrigins(value));
 assert.deepEqual(embedOrigins(['http://localhost:8099'],true),['http://localhost:8099']);assert.throws(()=>embedOrigins(['http://localhost:8099']));assert.throws(()=>embedOrigins(['http://192.168.1.2'],true));
});
test('embed authentication accepts only the matching popup, origin and nonce',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');let opened,received,verified=0;const listeners=new Map(),sent=[];
 const popup={postMessage:(...args)=>sent.push(args)},window={open:url=>{opened=url;return popup;},addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)};
 runInNewContext(readFileSync(new URL('../public/event-embed-auth.js',import.meta.url),'utf8'),{window,location:{origin:'https://events.example.test'},URL,crypto:{randomUUID:()=> '12345678-1234-4234-8234-123456789012'},setTimeout:()=>1,clearTimeout:()=>{},fetch:async()=>{verified++;return {ok:true};}});
 window.EmojiEmbedAuth.start({method:'email',lang:'en',returnUrl:'https://events.example.test/en/events/demo',onToken:token=>{received=token;},onError:()=>assert.fail('unexpected error')});
 const bridge=new URL(new URL(opened,'https://events.example.test').searchParams.get('redirect')),nonce=bridge.searchParams.get('nonce'),token='test-session-token-valid';
 const message={origin:'https://events.example.test',source:popup,data:{type:'emoji:embed-auth',nonce,token}},receive=listeners.get('message');
 for(const bad of [{...message,origin:'https://host.example.test'},{...message,source:{}},{...message,data:{...message.data,nonce:'wrong'}},{...message,data:{...message.data,token:'x'}}])await receive(bad);
 assert.equal(verified,0);assert.equal(received,undefined);await receive(message);assert.equal(received,token);assert.equal(verified,1);assert.equal(sent[0][1],'https://events.example.test');assert.equal(sent[0][0].type,'emoji:embed-auth-ack');assert.equal(listeners.has('message'),false);
});
test('embedded checkout refresh waits for authoritative payment status, including additional orders',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm'),source=readFileSync(new URL('../public/events.html',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('function watchEmbedCheckout('),source.indexOf('async function cancel(e)'));
 for(const additional of [false,true]){
  let next,loaded=0,paidToast=0,result={paid:false,status:additional?'registered':'pending_payment',order_status:'pending_payment'};
  const refresh={},message={},box={isConnected:true,querySelector:selector=>selector==='button'?refresh:message};
  const context={lang:'en',document:{createElement:()=>box},window:{addEventListener:()=>{}},esc:value=>value,setTimeout:fn=>{next=fn;return 1;},clearTimeout:()=>{},Date,api:async(path,options)=>{assert.equal(path,'/events/checkout/verify');assert.equal(options.body.session_id,'cs_test_fixture');return result;},loadDetail:async()=>{loaded++;},toast:()=>paidToast++,T:{paid:'Paid'}};
  runInNewContext(code+';watchEmbedCheckout({slug:"test"},{url:"https://checkout.stripe.com/test",session_id:"cs_test_fixture",order_id:'+(additional?'"order_test"':'null')+'},{replaceWith(){}});',context);
  await next();assert.equal(loaded,0);assert.equal(paidToast,0);assert.match(message.textContent,/Still waiting/);
  result={paid:true,status:'registered',order_status:'registered'};await next();assert.equal(loaded,1);assert.equal(paidToast,1);
 }
});

test('embed navigation accepts only its own frame and uses the configured event URL',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../public/event-embed.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf(' function navigateFromFrame('),source.indexOf(' const parameters='));
 const assigned=[],frame={contentWindow:{}},full='https://events.example.test/en/events/demo?tt=free';
 const context={origin:'https://events.example.test',location:{assign:url=>assigned.push(url)}};
 runInNewContext(code,context);
 const valid={origin:context.origin,source:frame.contentWindow,data:{type:'emoji:open-event',url:'https://attacker.example'}};
 for(const event of [{...valid,origin:'https://attacker.example'},{...valid,source:{}},{...valid,data:{type:'other'}}])context.navigateFromFrame(event,frame,full);
 assert.equal(assigned.length,0);context.navigateFromFrame(valid,frame,full);assert.deepEqual(assigned,[full]);
});
test('email sign-in exposes busy state and restores retry after failure',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../public/event-login.html',import.meta.url),'utf8'),elements={};
 for(const id of ['send','verify','status','login'])elements[id]={setAttribute(key,value){this[key]=value;}};
 const context={lang:'en',copy:['','','','Send','Verify'],el:id=>elements[id],call:async()=>{assert.equal(elements.verify.disabled,true);assert.equal(elements.verify['aria-busy'],'true');throw Error('Retry');},code:'fixture',location:{replace(){assert.fail('failed verification must not navigate');}},URL};
 runInNewContext(source.slice(source.indexOf('const working='),source.lastIndexOf('</script>')),context);
 await elements.verify.onclick();assert.equal(elements.verify.disabled,false);assert.equal(elements.verify['aria-busy'],'false');assert.equal(elements.verify.textContent,'Verify');assert.equal(elements.status.textContent,'Retry');
});
test('registration failure preserves the form, exposes a persistent error and restores the primary action',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../public/events.html',import.meta.url),'utf8'),button={textContent:'Register',disabled:false,setAttribute(k,v){this[k]=v;}},form={append(node){this.feedback=node;}},feedback={setAttribute(){}};
 let calls=0;
 const context={lang:'en',attribution:{},document:{getElementById:id=>id==='ev-register'?button:id==='ev-registration-form'?form:null,createElement:()=>feedback},FormData:class {get(){return null;}},api:async()=>{calls++;assert.equal(button['aria-busy'],'true');assert.equal(button.textContent,'Processing…');throw Error('Sold out. Choose another ticket.');}};
 runInNewContext(source.slice(source.indexOf('async function register('),source.indexOf('function watchEmbedCheckout(')),context);
 await context.register({id:'test',registration_settings:{}});assert.equal(calls,1);assert.equal(button.disabled,false);assert.equal(button['aria-busy'],'false');assert.equal(button.textContent,'Register');assert.equal(form.feedback.hidden,false);assert.equal(form.feedback.textContent,'Sold out. Choose another ticket.');
 button.disabled=true;await context.register({id:'test'});assert.equal(calls,1);
});
