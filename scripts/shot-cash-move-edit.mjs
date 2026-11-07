// 截圖量測：日結臨時收支「修改／刪除」（390／1180），印溢出、按鈕尺寸、實際送出的請求
import puppeteer from 'puppeteer';import fs from 'node:fs';
const out=process.argv[2]||'.';const source=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/workspace/local/.pw/chrome-linux/headless_shell',headless:true,args:['--no-sandbox','--font-render-hinting=none']});
for(const w of [390,1180]){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:w,height:900});
  await page.setContent('<html lang="zh-Hant"><body><main id="host" class="a-main"></main></body></html>');
  for(const f of ['style.css','pos-ops.css'])await page.addStyleTag({content:fs.readFileSync(new URL('../public/'+f,import.meta.url),'utf8')});
  await page.addStyleTag({content:'body{font-family:"Noto Sans CJK TC","Noto Sans TC",sans-serif}'});
  await page.addScriptTag({content:`
const BRAND_LABEL={CAFE:'在咖啡'},REG_DENOMS=[1000,500,100,50,10,5,1],REASON_PRESETS={cash_move:['買耗材','找零補鈔'],count_note:[],close_note:[]},SCOPE='CAFE',DATA={};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),num=v=>Number(v||0).toLocaleString('en-US');
const tipIcon=()=>'',opsHelp=()=>'',toast=m=>{window.toasts=(window.toasts||[]).concat(m);},clockText=v=>String(v).slice(11,16),applicationTime=v=>v,onPosPage=()=>true;
const bindOpenForm=()=>{},openRegisterForm=()=>'',dailyCloseForm=()=>'',shiftRevenueHtml=()=>'',printRegisterReport=()=>{},printCashMoveReceipt=async()=>{};
window.confirms=[];async function posConfirm(m,o){window.confirms.push([m,o]);return true;}
async function opsThen(fn,msg,reload){try{const out=await fn();toast(typeof msg==='function'?await msg(out):msg);if(reload)await reload(out);}catch(e){toast(e.message);}}
window.apiCalls=[];async function api(path,opts){window.apiCalls.push([path,opts?.method||'GET',opts?.body||null]);return {expected_cash:1234};}
${slice('const reasonChips=','function pickOverlay(')}
const regState=r=>!r?'closed':r.closed_at?'done':'open';
let REG_CASH_OPEN=false,REG_CASH_EDIT=null,REG_CLOSE_OPEN=false,REG_COUNT_OPEN=false,REG_OPEN_FORM='';
${slice('function registerBlock(','/* 日結：')}
const r={id:'rg_1',venue:'CAFE',opened_at:'2026-11-07T08:00',opening_cash:3000,cash_sales:4200,cash_in:50,cash_out:750,expected:6500,moves:[
 {id:'cm_1',type:'out',amount:250,reason:'買檸檬',staff:'小明',created_at:'2026-11-07T10:12'},
 {id:'cm_2',type:'in',amount:50,reason:'找零補鈔，從隔壁換的五十元硬幣',staff:'阿華',created_at:'2026-11-07T11:40'},
 {id:'cm_3',type:'out',amount:500,reason:'支付打賞給 歌手',staff:'店長',created_at:'2026-11-07T21:00',locked:'tip'}]};
window.REG_DATA={registers:[r],current:{CAFE:r}};
window.mount=async()=>{document.querySelector('#host').innerHTML=registerBlock(REG_DATA);bindRegisterBlock(document.querySelector('#host'),async()=>{window.reloads=(window.reloads||0)+1;mount();});};mount();
`});
  const m=async tag=>{const d=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,btns:[...document.querySelectorAll('[data-cash-edit],[data-cash-del]')].map(b=>{const r=b.getBoundingClientRect();return [b.textContent,Math.round(r.width),Math.round(r.height),Math.round(r.right)];})}));console.log(w,tag,JSON.stringify(d));await page.screenshot({path:`${out}/cash-${w}-${tag}.png`,fullPage:true});};
  await m('list');
  await page.click('[data-cash-edit="cm_1"]');await new Promise(r=>setTimeout(r,100));
  console.log(w,'prefill',await page.evaluate(()=>[document.querySelector('#reg-cash-type').value,document.querySelector('#reg-cash-amount').value,document.querySelector('#reg-cash-reason').value,document.querySelector('#reg-cash-save').textContent]));
  await m('edit');
  await page.$eval('#reg-cash-amount',e=>e.value='300');await page.click('#reg-cash-save');await new Promise(r=>setTimeout(r,100));
  await page.click('[data-cash-del="cm_2"]');await new Promise(r=>setTimeout(r,100));
  console.log(w,'calls',JSON.stringify(await page.evaluate(()=>window.apiCalls)),'confirm',JSON.stringify(await page.evaluate(()=>window.confirms.map(c=>c[0]))),'toasts',JSON.stringify(await page.evaluate(()=>window.toasts)),'errors',JSON.stringify(errors));
  await page.close();
}
await browser.close();
