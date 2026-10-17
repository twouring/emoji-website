import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer';
import {createServer} from 'node:http';
test('手動開通 DOM：同人掃卡、原因、逐次 PIN、立即啟用確認、重試同鍵、不綁結帳',async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:process.env.PUPPETEER_EXECUTABLE_PATH,args:['--no-sandbox']});
 const host=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end('<div id="members-body"></div>');});host.listen(0,'127.0.0.1');await new Promise(r=>host.once('listening',r));
 try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${host.address().port}`);
 for(const file of ['style.css','pos-ops.css','pos-members.css'])await page.addStyleTag({content:fs.readFileSync(new URL('../public/'+file,import.meta.url),'utf8')});
 await page.evaluate(()=>{
 window.calls=[];window.POS_YAN={id:'bill-member'};window.cardId='u1';window.reason='系統漏開';window.confirmed=true;window.fail=true;window.OPERATOR=null;
 window.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.num=String;window.toast=s=>calls.push(['toast',s]);
 window.pickMemberCard=async()=> 'card';window.pickReason=async()=>reason;window.pickFrom=async o=>{calls.push(['plans',o]);return 'month';};window.posConfirm=async s=>{calls.push(['confirm',s]);return confirmed;};window.ensureOperator=async cb=>{calls.push(['PIN']);OPERATOR={id:'1234',pin:'1234'};try{return await cb();}finally{OPERATOR=null;}};
 window.api=async(path,opt)=>{calls.push([path,opt]);if(path.endsWith('lookup'))return {verified:true,member:{id:cardId}};if(path.endsWith('membership-plans'))return {plans:[{plan:'month',label:'月會籍',duration:'自開通起 1 個月'}]};if(path.endsWith('activate-membership')){if(fail)throw new Error('網路中斷');return {ok:true,grant:{starts_at:'2026-10-17T15:00:00Z',ends_at:'2026-11-17T15:00:00Z'}};}return {member:{id:'u1',name:'測試會員',phone:'0912345678'},active:false,balance:0,ledger:[],manual_grants:[{plan:'month',reason:'補發<script>',operator_name:'店員甲',created_at:'2026-10-17T15:00:00Z',starts_at:'2026-10-17T15:00:00Z',ends_at:'2026-11-17T15:00:00Z'}],next_offset:null};};
 });await page.addScriptTag({content:fs.readFileSync(new URL('../public/pos-members.js',import.meta.url),'utf8')});
 await page.evaluate(()=>openPosMember('u1'));
 assert.ok(await page.$('#members-activate'),'manual membership action must exist');
 await page.evaluate(()=>mutatePosMember('membership'));
 let writes=await page.evaluate(()=>calls.filter(c=>c[0]==='/admin/yan/activate-membership'));
 assert.equal(writes.length,1);assert.equal(writes[0][1].body.member_token,'card');assert.equal(writes[0][1].body.operator_id,'1234');assert.equal(writes[0][1].body.reason,'系統漏開');assert.equal(writes[0][1].body.user_id,'u1');assert.match(writes[0][1].body.request_id,/^[\da-f-]{36}$/i);
 await page.evaluate(()=>{fail=false;return mutatePosMember('membership');});
 writes=await page.evaluate(()=>calls.filter(c=>c[0]==='/admin/yan/activate-membership'));assert.equal(writes.length,2);assert.equal(writes[0][1].body.request_id,writes[1][1].body.request_id);
 assert.equal(await page.evaluate(()=>calls.filter(c=>c[0]==='PIN').length),2);
 assert.match(await page.evaluate(()=>calls.find(c=>c[0]==='confirm')[1]),/立即啟用/);assert.match(await page.evaluate(()=>calls.find(c=>c[0]==='confirm')[1]),/不會建立付款/);
 assert.equal(await page.evaluate(()=>POS_YAN.id),'bill-member');assert.ok((await page.$eval('#members-body',e=>e.textContent)).includes('補發<script>'));assert.equal(await page.$('#members-body script'),null);
 for(const change of [()=>{cardId='u2';},()=>{cardId='u1';reason='';},()=>{reason='補發';confirmed=false;}]){await page.evaluate(change);await page.evaluate(()=>mutatePosMember('membership'));assert.equal(await page.evaluate(()=>calls.filter(c=>c[0]==='/admin/yan/activate-membership').length),2);}
 for(const width of [1180,820,390]){await page.setViewport({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');if(process.env.POS_PROOF_DIR){fs.mkdirSync(process.env.POS_PROOF_DIR,{recursive:true});await page.screenshot({path:process.env.POS_PROOF_DIR+'/manual-membership-'+width+'.png',fullPage:true});}}
 }finally{await browser.close();await new Promise(r=>host.close(r));}
});
