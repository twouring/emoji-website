// Local-only UI exercise; every API result is synthetic, external requests are blocked.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {once} from 'node:events';
import puppeteer from 'puppeteer';
const root=path.resolve(import.meta.dirname,'..'),errors=[];
const server=http.createServer((req,res)=>{
 const files={'/style.css':'public/style.css','/pos-ops.js':'public/pos-ops.js','/pos-ops.css':'public/pos-ops.css','/menu-lib.js':'public/menu-lib.js'};
 if(files[req.url]){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.join(root,files[req.url])));return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><meta charset="utf-8"><title>合成測試：LINE Pay API</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/pos-ops.css"><div id="pos-body"></div><script>
 window.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.num=String;window.applicationTime=String;window.opsHref=s=>s;window.DATA={invoice:{configured:false},payment_methods:[{code:'cash',label:'現金',active:true},{code:'linepay',label:'LINE Pay（手動）',active:true}]};window.SCOPE='CAFE';window.TAB='pos';window.BRAND_LABEL={CAFE:'在咖啡',BAR:'三點水'};window.MENU_DOC={items:[]};window.calls=[];window.messages=[];window.printed=[];window.toast=s=>messages.push(s);
 </script><script src="/menu-lib.js"></script><script src="/pos-ops.js"></script><script>
 ensureOperator=fn=>fn();OPERATOR={id:'op_test'};bindRegisterBar=()=>{};loadPos=async()=>{};printCheckoutOrder=async o=>printed.push(o);
 window.scenario='settled';window.api=async(p,o)=>{calls.push({path:p,body:o?.body});if(p.endsWith('/prepare'))return {id:'lp_synthetic',state:'prepared',amount:240,mode:'production'};if(p.endsWith('/cancel'))return {id:'lp_synthetic',state:'cancelled',amount:240};if(scenario==='settled')return {id:'lp_synthetic',state:'settled',amount:240,result:{order_id:'to_synthetic',closed:true},order:{id:'to_synthetic',items:[],amount:240}};return {id:'lp_synthetic',state:scenario,amount:240,code:scenario==='failed'?'1142':undefined};};
 window.reset=(enabled=false,pending=null)=>{calls.length=0;messages.length=0;printed.length=0;POS_TABLE='A1';POS_PICK=null;POS_QTY={};POS_MEMBER=false;POS_DISCOUNT=null;POS_YAN={};POS_METHOD='cash';POS_DATA={pause:{},linepay:{enabled,mode:enabled?'production':null,blockers:enabled?[]:['缺少付款 API 憑證；尚未確認商家權限']},sessions:[{id:'ts_synthetic',table:'A1',state:'ordered',lines:[{line:'a',zh:'合成測試品項',venue:'CAFE',qty:2,price:120,placed_at:'test'}],linepay:pending}],orders:[]};paintPos();};reset();
 </script>`);
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const browser=await puppeteer.launch({headless:'shell',executablePath:process.env.CHROME_BIN||'/workspace/local/.chrome-headless/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox','--disable-gpu']});
try{
 const page=await browser.newPage();await page.setViewport({width:1180,height:820});
 page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
 page.on('request',r=>r.url().startsWith(`http://127.0.0.1:${server.address().port}`)?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 assert.equal(await page.$eval('#pos-linepay-api',b=>b.disabled),true);
 assert.match(await page.$eval('#pos-body',e=>e.textContent),/缺少付款 API 憑證/);
 await page.screenshot({path:'/workspace/linepay-pos-disabled.png',fullPage:true});
 for(const scenario of ['settled','failed','unknown']){
  await page.evaluate(s=>{scenario=s;reset(true);},scenario);
  await page.click('#pos-linepay-api');await page.waitForSelector('[data-code]');
  await page.type('[data-code]','123456789012345678');await page.click('[data-next]');await page.waitForSelector('.pos-confirm [data-ok]');
  assert.deepEqual(await page.evaluate(()=>calls.map(x=>x.path)),['/admin/orders/sessions/ts_synthetic/linepay/prepare']);
  if(scenario==='settled')await page.screenshot({path:'/workspace/linepay-pos-confirm.png',fullPage:true});
  await page.click('.pos-confirm [data-ok]');await page.waitForFunction(()=>calls.length===2&&messages.length>0);
  assert.equal(await page.evaluate(()=>calls.filter(x=>x.path.endsWith('/pay')).length),1);
  assert.equal(await page.evaluate(()=>printed.length),scenario==='settled'?1:0);
 }
 await page.evaluate(()=>reset(true,{id:'lp_synthetic',state:'unknown',amount:240}));
 assert.equal(await page.$eval('#pos-checkout',b=>b.disabled),true);
 await page.click('#pos-linepay-api');await page.waitForFunction(()=>calls.length>0);
 assert.deepEqual(await page.evaluate(()=>calls.map(x=>x.path)),['/admin/orders/sessions/ts_synthetic/linepay/check']);
 await page.evaluate(()=>reset(true));await page.click('#pos-linepay-api');await page.waitForSelector('[data-code]');await page.click('[data-cancel]');await page.waitForFunction(()=>calls.length===2);
 assert.ok(await page.evaluate(()=>calls[1].path.endsWith('/cancel')));
 assert.deepEqual(errors,[]);
 console.log('PASS real POS DOM: disabled blocking, server quote before explicit charge, success/decline/unknown, original-transaction query, manual checkout disabled while pending, cancel sends no payment. External network blocked.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
