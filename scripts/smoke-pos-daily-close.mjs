// Run with CHROME_PATH=/path/to/chrome node scripts/smoke-pos-daily-close.mjs.
// Uses synthetic local fixtures only; never calls production or writes financial data.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const R=createRequire(import.meta.url)('../lib/pos-register.js');
const source=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:375,height:812,deviceScaleFactor:1});
 await page.setContent('<html lang="zh-Hant"><meta name="viewport" content="width=device-width, initial-scale=1"><body><main id="host"></main></body></html>');
 for(const file of ['style.css','pos-ops.css'])await page.addStyleTag({content:fs.readFileSync(new URL('../public/'+file,import.meta.url),'utf8')});
 const posHTML=fs.readFileSync(new URL('../public/pos.html',import.meta.url),'utf8');
 for(const m of posHTML.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))await page.addStyleTag({content:m[1]});
 await page.exposeFunction('closeFixture',body=>{
   const s=R.expectedCash({opening_cash:1000,cash_sales:200,moves:[{type:'in',amount:50},{type:'out',amount:20}]});
   const c=R.closeRegister(body,s,{accounts:{linepay:100,ctbc:300,transfer:0,wallet:40},order_total:640});
   return {...c,report:R.registerReport({venue:'CAFE',day:'2026-10-17',closed_at:'2026-10-17',...c},s,{amount:640},[])};
 });
 // Only trusted local source and fixed synthetic fixtures are injected in this isolated page.
 await page.addScriptTag({content:`
 const BRAND_LABEL={CAFE:'在咖啡',BAR:'三點水'},REG_DENOMS=[2000,1000,500,200,100,50,20,10,5,1],REASON_PRESETS={close_note:[]};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),num=v=>Number(v||0).toLocaleString('en-US');
 const payMethodLabel=c=>({linepay:'LINE Pay',ctbc:'信用卡',transfer:'轉帳',wallet:'其他帳戶'}[c]||c),tipIcon=()=>'',fillChips=()=>'',reasonChips=()=>'',applicationTime=v=>v||'',printWindow=(title,html)=>window.printed=html;
 let REG_CLOSE_OPEN='fixture';const posConfirm=async()=>true,starReady=()=>false;
 async function opsThen(fn,msg,reload){try{const out=await fn();window.lastMessage=await msg(out);await reload();}catch(e){window.lastMessage=e.message;}}
 async function api(path,{body}){window.submitted=body;return closeFixture(body);}
 ${slice('const denomGrid=', 'function openRegisterForm(')}
 ${slice('async function printRegisterReport(', 'function registerBlock(')}
 ${slice('function bindDailyClose(', '/* 日結：')}
 window.r={id:'fixture',venue:'CAFE',opening_cash:1000,cash_in:50,cash_out:20,expected:1230,sales:{amount:640},reconciliation_accounts:{linepay:100,ctbc:300,transfer:0,wallet:40},account_labels:{}};
 window.mount=()=>{document.querySelector('#host').innerHTML=dailyCloseForm(r);bindDailyClose(document.querySelector('.reg-close-form'),r,async()=>{window.reloaded=true;});};mount();
 `});
 const input=async(s,v)=>page.$eval(s,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},String(v));
 const disabled=async s=>page.$eval(s,e=>e.matches(':disabled'));
 const confirm=async code=>{const s=`[data-close-confirm="${code}"]`;assert.equal(await disabled(s),false,`${code} must be ready`);await page.click(s);};
 assert.equal(await disabled('#reg-close-go'),true);
 assert.equal(await disabled('[data-account-actual="linepay"]'),true);
 await input('#reg-counted',1230);await confirm('cash');
 for(const [code,actual] of Object.entries({linepay:100,ctbc:300,transfer:0,wallet:40})){await input(`[data-account-actual="${code}"]`,actual);await confirm(code);}
 assert.equal(await disabled('#reg-close-go'),false);assert.equal(await page.$eval('#reg-actual-total',e=>e.textContent),'NT$640');
 // Same-data async rerender preserves the draft and confirmations.
 await page.evaluate(()=>mount());assert.equal(await disabled('#reg-close-go'),false);
 // Editing a confirmed amount clears it and all downstream confirmations.
 await input('[data-account-actual="linepay"]',110);assert.equal(await disabled('#reg-close-go'),true);assert.equal(await disabled('[data-close-confirm="linepay"]'),true);
 await input('[data-account-reason="linepay"]','跨日入帳');await confirm('linepay');for(const c of ['ctbc','transfer','wallet'])await confirm(c);
 assert.equal(await disabled('#reg-close-go'),true);assert.equal(await page.$eval('#reg-total-reason-label',e=>e.hidden),false);
 await input('#reg-total-reason','總差異待追查');assert.equal(await disabled('#reg-close-go'),false);
 await page.click('#reg-close-go');await page.waitForFunction(()=>window.reloaded===true);
 const b=await page.evaluate(()=>window.submitted);assert.equal(b.total_reason,'總差異待追查');assert.equal(b.accounts.transfer.actual,0);assert.equal(b.accounts.wallet.confirmed,true);
 assert.match(await page.evaluate(()=>window.printed),/逐項帳戶核對/);assert.match(await page.evaluate(()=>window.printed),/總差異待追查/);
 // A successful close deletes its draft; a new in-progress draft is invalidated on change.
 assert.equal(await page.evaluate(()=>REG_CLOSE_DRAFTS.has(r.id)),false);
 await page.evaluate(()=>{REG_CLOSE_OPEN=r.id;mount();});
 await input('#reg-counted',1230);await confirm('cash');await input('[data-account-actual="linepay"]',110);
 // An authoritative change invalidates confirmations, while retaining typed amounts.
 await page.evaluate(()=>{r.sales.amount=641;mount();});assert.equal(await disabled('#reg-close-go'),true);assert.equal(await page.$eval('[data-close-confirm="cash"]',e=>e.checked),false);assert.equal(await page.$eval('[data-account-actual="linepay"]',e=>e.value),'110');
 await page.evaluate(()=>{r={...r,id:'bar-fixture',venue:'BAR'};mount();});assert.equal(await page.$eval('#reg-counted',e=>e.value),'');
 // Chips emit non-bubbling input events; they must invalidate confirmations too.
 await input('#reg-counted',1230);await confirm('cash');
 await page.$eval('#reg-keep',e=>{e.value='500';e.dispatchEvent(new Event('input'));});
 assert.equal(await page.$eval('[data-close-confirm="cash"]',e=>e.checked),false);
 await input('[data-denom="1000"]',0);assert.equal(await page.$eval('#reg-counted-show',e=>e.textContent),'NT$0');
 await input('[data-denom="1000"]',-1);assert.equal(await disabled('[data-close-confirm="cash"]'),true);
 await input('[data-denom="1000"]','');
 // Printing failure must leave the successful close final, with an explicit reprint hint.
 await page.evaluate(()=>{r={...r,id:'print-failure',sales:{amount:640}};REG_CLOSE_OPEN=r.id;window.reloaded=false;printRegisterReport=async()=>{throw new Error('printer unavailable');};mount();});
 await input('#reg-counted',1230);await confirm('cash');
 for(const [code,actual] of Object.entries({linepay:100,ctbc:300,transfer:0,wallet:40})){await input(`[data-account-actual="${code}"]`,actual);await confirm(code);}
 await page.click('#reg-close-go');await page.waitForFunction(()=>window.reloaded===true);
 assert.match(await page.evaluate(()=>window.lastMessage),/重印關帳單/);
 assert.equal(await page.evaluate(()=>REG_CLOSE_OPEN),false);
 assert.deepEqual(errors,[]);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'375px has no horizontal overflow');
 const screenshot=process.env.SCREENSHOT_PATH;if(screenshot)await page.screenshot({path:screenshot,fullPage:true});
 console.log('PASS: Chromium 375px sequential confirmation, explicit zero/custom accounts, edit invalidation, same-data draft restore, separate total reason, API payload/backend validation, frozen print, stale reset, brand isolation; no page errors.');
}finally{await browser.close();}
