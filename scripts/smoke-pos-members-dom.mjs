import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer';
const source=()=>fs.readFileSync(new URL('../public/pos-members.js',import.meta.url),'utf8');
test('會員 DOM: browse/history do not bind bill; scan + reason + PIN required for each mutation',async()=>{
 assert.ok(fs.existsSync(new URL('../public/pos-members.js',import.meta.url)),'dedicated member UI must exist');
 const browser=await puppeteer.launch({headless:true,executablePath:process.env.PUPPETEER_EXECUTABLE_PATH,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.setContent('<div id="members-body" class="a-sec"></div>');for(const file of ['style.css','pos-ops.css','pos-members.css'])await page.addStyleTag({content:fs.readFileSync(new URL('../public/'+file,import.meta.url),'utf8')});
 await page.evaluate(()=>{
 window.calls=[];window.POS_YAN={id:'bill-member'};window.POS_MEMBER=true;
 window.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.num=n=>String(n);window.toast=s=>calls.push(['toast',s]);
 window.api=async(path,opt)=>{calls.push([path,opt]);if(opt?.method==='POST')return path.endsWith('lookup')?{member:{id:'u1'},verified:true}:{balance:25,granted:5};if(path.includes('/members/u'))return {member:{id:path.includes('u2')?'u2':'u1',name:'小明',phone:'0912345678'},balance:20,active:true,ledger:[{id:'l1',kind:'grant',delta:5,reason:'活動贈點',operator_name:'店員甲',created_at:'2026-10-17T10:00:00Z'}],next_offset:null};return {members:[{id:'u1',name:'小明',phone:'0912345678'},{id:'u2',name:'小美',phone:'0987654321'}],next_offset:null};};
 window.pickMemberCard=async()=> 'QR';window.pickAmount=async()=>5;window.pickReason=async()=> '活動贈點';window.posConfirm=async()=>true;window.OPERATOR=null;window.ensureOperator=async cb=>{calls.push(['PIN']);OPERATOR={id:'staff1'};try{return await cb();}finally{OPERATOR=null;}};window.spaceRewards=()=>({day_4h:10});window.pickFrom=async()=> 'day_4h';
 });await page.addScriptTag({content:source()});await page.evaluate(()=>loadPosMembers());
 await page.click('[data-member-id="u1"]');await page.waitForSelector('#members-grant');
 assert.ok((await page.$eval('#members-body',e=>e.textContent)).includes('店員甲'));
 await page.click('#members-grant');await page.waitForFunction(()=>calls.some(c=>c[0]==='/admin/yan/grant'));
 const result=await page.evaluate(()=>({calls,member:POS_YAN.id}));assert.equal(result.member,'bill-member');
 const grant=result.calls.find(c=>c[0]==='/admin/yan/grant')[1].body;assert.equal(grant.user_id,'u1');assert.equal(grant.reason,'活動贈點');assert.equal(grant.operator_id,'staff1');assert.equal(result.calls.filter(c=>c[0]==='PIN').length,1);
 await page.waitForSelector('#members-space');await page.click('#members-space');await page.waitForFunction(()=>calls.some(c=>c[0]==='/admin/yan/redeem-space'));
 assert.equal(await page.evaluate(()=>calls.filter(c=>c[0]==='PIN').length),2);
 await page.evaluate(()=>{pickMemberCard=async()=>null;});await page.click('#members-grant');await new Promise(r=>setTimeout(r,50));assert.equal(await page.evaluate(()=>calls.filter(c=>c[0]==='/admin/yan/grant').length),1);
 await page.evaluate(()=>{pickMemberCard=async()=> 'wrong';const old=api;api=async(path,opt)=>path.endsWith('lookup')?{member:{id:'u2'},verified:true}:old(path,opt);});await page.click('#members-grant');await new Promise(r=>setTimeout(r,50));assert.equal(await page.evaluate(()=>calls.filter(c=>c[0]==='/admin/yan/grant').length),1,'mismatched scanned card must not grant');
 for(const width of [1180,820,390]){await page.setViewport({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');if(process.env.POS_PROOF_DIR){fs.mkdirSync(process.env.POS_PROOF_DIR,{recursive:true});await page.screenshot({path:process.env.POS_PROOF_DIR+'/members-'+width+'.png',fullPage:true});}}
 if(process.env.POS_SMOKE_URL){
  const full=await browser.newPage();const errors=[];full.on('pageerror',e=>errors.push(e.message));await full.goto(process.env.POS_SMOKE_URL+'/pos/members',{waitUntil:'networkidle0'});
  const result=await full.evaluate(async()=>{startKitchenPrinting=()=>{};loadPos=()=>{};const fixture={members:[{id:'u1',name:'測試會員',phone:'0912345678'}],next_offset:null};api=async()=>fixture;DATA={brands:['CAFE'],me:{name:'測試人員'}};TAB=routeTab();render();await new Promise(r=>setTimeout(r,50));return {tab:TAB,nav:!!document.querySelector('[data-tab="members"]'),visible:document.querySelector('[data-panel="members"]').classList.contains('on'),text:document.getElementById('members-body').textContent};});
  assert.equal(result.tab,'members');assert.equal(result.nav,true);assert.equal(result.visible,true);assert.ok(result.text.includes('測試會員'));assert.deepEqual(errors,[],'full POS page scripts must boot without JS errors');await full.close();
 }
 }finally{await browser.close();}
});
