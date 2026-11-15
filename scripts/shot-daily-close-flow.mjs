import puppeteer from 'puppeteer';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true,args:['--no-sandbox']});
try{
 for(const width of [390,1280]){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width,height:850,deviceScaleFactor:1});
  await page.setContent('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><body><main id="sales-body" class="a-sec"></main></body></html>');
  await page.addStyleTag({content:fs.readFileSync(new URL('../public/style.css',import.meta.url),'utf8')});
  await page.addStyleTag({content:fs.readFileSync(new URL('../public/pos-ops.css',import.meta.url),'utf8')});
  await page.addScriptTag({content:`const SCOPE='CAFE',TAB='sales',DATA={},MENU_DOC={},BRAND_LABEL={CAFE:'在咖啡',BAR:'三點水'},MenuLib={businessDay:()=> '2026-11-15'};const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),num=v=>Number(v||0).toLocaleString('en-US'),applicationTime=v=>v||'',opsHref=()=>'',toast=()=>{},api=async()=>({}),downloadCSV=()=>{};`});
  await page.addScriptTag({path:new URL('../public/pos-ops.js',import.meta.url).pathname});
  if(errors.length)throw Error(errors.join('\n'));
  const state=await page.evaluate(()=>{
    const r={id:'rg_1',venue:'CAFE',day:'2026-11-15',opened_at:'2026-11-15T08:00:00+08:00',opening_cash:3000,cash_in:500,cash_out:200,cash_sales:1000,expected:4300,moves:[{id:'cm_1',type:'in',reason:'補零錢',amount:500,receipt_photo:'/ig-media/assets/cash-receipt.jpg'}],sales:{orders:2,amount:1000,collected:1000},reconciliation_accounts:{linepay:0,ctbc:0,transfer:0},account_labels:{linepay:'LINE Pay',ctbc:'信用卡',transfer:'轉帳'},pending:{tables:0,amount:0,list:[]}};
    REG_DATA={registers:[r],current:{CAFE:r},open_tables_by:{CAFE:[]}};
    const d={linepay:{configured:true,synced_at:'2026-11-15',by_venue:{CAFE:{linepay:{amount:0}}}},ctbc:{configured:true,synced_at:'2026-11-15',by_venue:{CAFE:{ctbc:{amount:0}}}}};
    document.querySelector('#sales-body').innerHTML=accountConfirmBlock(REG_DATA,d)+registerBlock(REG_DATA);
    REG_CLOSE_OPEN=r.id;document.querySelector('#sales-body').innerHTML=accountConfirmBlock(REG_DATA,d)+registerBlock(REG_DATA);
    return {steps:[...document.querySelectorAll('.reg-step-head h3')].map(x=>x.textContent),photo:!!document.querySelector('.reg-photo-link'),horizontal:document.documentElement.scrollWidth>innerWidth,offenders:[...document.querySelectorAll('*')].filter(x=>x.getBoundingClientRect().right>innerWidth+2).slice(0,8).map(x=>[x.tagName,x.className,x.getBoundingClientRect().right]),closeDisabled:document.querySelector('#reg-close-go').disabled};
  });
  console.log(width,JSON.stringify(state));if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/daily-close-'+width+'.png',fullPage:true});
  assert.deepEqual(state.steps,['核對所有帳戶','取出現金營收、列印關帳單']);assert.equal(state.photo,true);assert.equal(state.horizontal,false);assert.equal(state.closeDisabled,true);assert.deepEqual(errors,[]);
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/daily-close-'+width+'.png',fullPage:true});
  console.log(width,JSON.stringify(state));await page.close();
 }
}finally{await browser.close();}
