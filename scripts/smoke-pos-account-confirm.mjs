// Run with CHROME_PATH=/path/to/chrome node scripts/smoke-pos-account-confirm.mjs.
// 各帳戶確認：核對按鈕→對話框（現金面額點鈕、LINE Pay 自動帶入店別實收、差額必填原因）→ 帶入關帳表單。只用本機假資料，不碰正式環境。
import puppeteer from 'puppeteer';import fs from 'node:fs';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.setViewport({width:375,height:812});
await page.setContent('<html lang="zh-Hant"><body><main id="host"></main></body></html>');
for(const f of ['style.css','pos-ops.css'])await page.addStyleTag({content:fs.readFileSync(new URL('../public/'+f,import.meta.url),'utf8')});
await page.addScriptTag({content:`
const BRAND_LABEL={CAFE:'在咖啡',BAR:'三點水'},REG_DENOMS=[1000,500,100,50,10,5,1],REASON_PRESETS={close_note:['找錯錢','點鈔誤差']},SCOPE='';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),num=v=>Number(v||0).toLocaleString('en-US');
const payMethodLabel=c=>({linepay:'LINE Pay',taishin:'刷卡／台新手機付',transfer:'轉帳'}[c]||c),tipIcon=()=>'',applicationTime=v=>v||'',opsHelp=()=>'',toast=m=>{window.toasts=(window.toasts||[]).concat(m);};
const bindOpenForm=()=>{};const PAY_LABEL={};const DATA={};
${slice('const reasonChips=','function pickOverlay(')}
${slice('function pickOverlay(','function pickFrom(')}
${slice('const denomGrid=','function openRegisterForm(')}
${slice('const REG_CLOSE_DRAFTS=','function registerBlock(')}
${slice('function bindDailyClose(','/* 日結：')}
window.r={id:'fx',venue:'CAFE',opening_cash:1000,cash_in:50,cash_out:20,expected:1230,sales:{amount:640},reconciliation_accounts:{linepay:100,taishin:300,transfer:0},account_labels:{}};
window.REG_DATA={registers:[r],current:{CAFE:r}};window.sales={linepay:{synced_at:'2026-10-17T04:30:00Z',configured:true,linepay:{amount:999},by_venue:{CAFE:{linepay:{amount:110}},BAR:{linepay:{amount:889}}}}};
window.mount=()=>{document.querySelector('#host').innerHTML=accountConfirmBlock(REG_DATA,sales);bindAccountConfirm(document.querySelector('#host'),sales,async()=>{window.reloads=(window.reloads||0)+1;mount();});};mount();
`});
const input=async(s,v)=>page.$eval(s,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},String(v));
const disabled=s=>page.$eval(s,e=>e.matches(':disabled'));
const txt=s=>page.$eval(s,e=>e.textContent.trim());
// 四個核對按鈕；pill 0/4
assert.equal(await page.$$eval("[data-acct-open]",b=>b.length),4);assert.equal(await txt('.pill'),'0/4 已確認');
// 現金：按面額點鈔 1000×1 + 100×2 + 10×3 = 1230 → 無差額可確認
await page.click('[data-acct-open="cash"]');await page.waitForSelector('.pos-move-box');
assert.equal(await disabled('[data-ok]'),true);
await input('[data-denom="1000"]',1);await input('[data-denom="100"]',2);await input('[data-denom="10"]',3);
assert.equal(await txt('#acct-actual-show'),'NT$1,230');assert.equal(await txt('#acct-diff-show'),'0');assert.equal(await disabled('[data-ok]'),false);
await page.click('[data-ok]');await page.waitForFunction(()=>!document.querySelector('.pos-move-box'));
assert.equal(await txt('.pill'),'1/4 已確認');
// LINE Pay：自動帶入 by_venue CAFE=110（非全店 999）→ 差 +10 → 未填原因擋；填原因放行
await page.click('[data-acct-open="linepay"]');await page.waitForSelector('.pos-move-box');
assert.equal(await page.$eval('#acct-actual',e=>e.value),'110');assert.equal(await txt('#acct-diff-show'),'+10');
assert.equal(await disabled('[data-ok]'),true);assert.equal(await page.$eval('#acct-reason-label',e=>e.hidden),false);
await page.click('[data-reason-chip],.reason-chips button');assert.equal(await disabled('[data-ok]'),false);
await page.click('[data-ok]');await page.waitForFunction(()=>!document.querySelector('.pos-move-box'));
assert.equal(await txt('.pill'),'2/4 已確認');
// 刷卡：手填 300 相符；轉帳 0
await page.click('[data-acct-open="taishin"]');await page.waitForSelector('.pos-move-box');await input('#acct-actual',300);await page.click('[data-ok]');await page.waitForFunction(()=>!document.querySelector('.pos-move-box'));
await page.click('[data-acct-open="transfer"]');await page.waitForSelector('.pos-move-box');await input('#acct-actual',0);assert.equal(await disabled('[data-ok]'),false);await page.click('[data-ok]');await page.waitForFunction(()=>!document.querySelector('.pos-move-box'));
assert.equal(await txt('.pill'),'4/4 已確認');assert.ok((await page.$eval('.pill',e=>e.className)).includes('pill-ok'));
// 重開現金對話框：帶回先前面額；取消不改
await page.click('[data-acct-open="cash"]');await page.waitForSelector('.pos-move-box');assert.equal(await page.$eval('[data-denom="100"]',e=>e.value),'2');await page.click('[data-cancel]');
// 關帳表單帶入：點鈔 1230、linepay 110 + 原因、taishin 300、transfer 0
await page.evaluate(()=>{document.querySelector('#host').insertAdjacentHTML('beforeend',dailyCloseForm(r));bindDailyClose(document.querySelector('.reg-close-form'),r,async()=>{});});
assert.equal(await page.$eval('#reg-counted',e=>e.value),'1230');assert.equal(await page.$eval('.reg-close-form [data-denom="1000"]',e=>e.value),'1');
assert.equal(await page.$eval('[data-account-actual="linepay"]',e=>e.value),'110');assert.equal(await page.$eval('[data-account-reason="linepay"]',e=>e.value),'找錯錢');
assert.equal(await page.$eval('[data-account-actual="transfer"]',e=>e.value),'0');
assert.equal(await txt('#reg-counted-show'),'NT$1,230');
assert.deepEqual(errors,[]);console.log('SMOKE OK');
}finally{await browser.close();}
