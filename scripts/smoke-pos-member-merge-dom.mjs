// 合併會員 DOM：會員詳細 → 合併會員 → 搜尋另一個帳號 → 預覽（預設保留有 Email／LINE 的帳號）→ 確認 → 店長識別碼 → POST /admin/yan/merge
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer';
const read=f=>fs.readFileSync(new URL('../public/'+f,import.meta.url),'utf8');
test('合併會員 DOM flow',async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:process.env.PUPPETEER_EXECUTABLE_PATH,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.setViewport({width:1180,height:820});
  await page.setContent('<div id="members-body" class="a-sec"></div>');
  for(const f of ['style.css','pos-ops.css','pos-members.css'])await page.addStyleTag({content:read(f)});
  await page.evaluate(()=>{
   window.calls=[];window.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.num=n=>String(n);window.toast=s=>calls.push(['toast',s]);window.tipIcon=()=>'';
   window.pickOverlay=(html,label)=>{const ov=document.createElement('div');ov.className='pos-move-ov';ov.innerHTML=`<div class="pos-move-box" role="dialog" aria-label="${label}">${html}</div>`;document.body.appendChild(ov);return {ov,close:()=>ov.remove()};};
   window.posConfirm=async m=>{calls.push(['confirm',m]);return true;};
   window.OPERATOR=null;window.ensureOperator=async cb=>{OPERATOR={id:'s1',name:'店長',pin:'1234'};try{return await cb();}finally{OPERATOR=null;}};
   const pos={id:'pos',name:'+886912345678',phone:'+886912345678',email:'',line:false,balance:30,active:false,orders:3,entitlements:0,events:0,reservations:1};
   const app={id:'app',name:'KK',phone:'',email:'kk@x.tw',line:true,balance:5,active:true,orders:0,entitlements:1,events:2,reservations:0};
   window.api=async(path,opt)=>{calls.push([path,opt?.body]);
    if(path.startsWith('/admin/yan/members?q=0912'))return {members:[{id:'pos',name:'+886912345678',phone:'+886912345678'},{id:'app',name:'KK',phone:''}],next_offset:null};
    if(path.startsWith('/admin/yan/members?'))return {members:[{id:'pos',name:'+886912345678',phone:'+886912345678'}],next_offset:null};
    if(path.startsWith('/admin/yan/members/'))return {member:{id:path.includes('app')?'app':'pos',name:path.includes('app')?'KK':'+886912345678',phone:'+886912345678'},balance:35,active:true,ledger:[],manual_grants:[],next_offset:null};
    if(path.startsWith('/admin/yan/merge-preview')){const k=new URL('http://x'+path).searchParams.get('keep_id');const [keep,drop]=k==='app'?[app,pos]:[pos,app];return {keep,drop,blocker:null,result:{name:'KK',phone:'+886912345678',email:'kk@x.tw',line:true}};}
    if(path==='/admin/yan/merge')return {ok:true,keep_id:opt.body.keep_id,balance:35};
    throw Error('unexpected '+path);};
  });
  await page.addScriptTag({content:read('pos-members.js')});
  await page.evaluate(()=>openPosMember('pos'));
  await page.waitForSelector('#members-merge');await page.click('#members-merge');
  await page.waitForSelector('[data-merge-q]');await page.type('[data-merge-q]','0912');await page.click('[data-merge-search] button[type=submit]');
  await page.waitForSelector('[data-merge-pick]');
  assert.equal(await page.$$eval('[data-merge-pick]',b=>b.length),1,'目前這位不出現在候選名單');
  await page.click('[data-merge-pick="app"]');
  await page.waitForSelector('.members-merge-pair');
  assert.match(await page.$eval('.is-keep',e=>e.textContent),/kk@x\.tw/,'預設保留有 Email／LINE 登入的帳號');
  await page.screenshot({path:process.env.SHOT||'/dev/null'});
  await page.click('[data-merge-swap]');await page.waitForFunction(()=>document.querySelector('.is-keep')?.textContent.includes('沒有 Email'));
  await page.click('[data-merge-swap]');await page.waitForFunction(()=>document.querySelector('.is-keep')?.textContent.includes('kk@x.tw'));
  await page.click('[data-merge-ok]');
  await page.waitForFunction(()=>calls.some(c=>c[0]==='/admin/yan/merge'));
  const body=await page.evaluate(()=>calls.find(c=>c[0]==='/admin/yan/merge')[1]);
  assert.deepEqual(body,{keep_id:'app',drop_id:'pos',operator_id:'s1',operator_pin:'1234'});
  await page.waitForFunction(()=>calls.some(c=>c[0]==='toast'&&/已合併會員/.test(c[1])));
 }finally{await browser.close();}
});
