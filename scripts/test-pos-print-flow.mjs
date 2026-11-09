import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
const menuLib=readFileSync(new URL('../public/menu-lib.js',import.meta.url),'utf8');
const load=()=>vm.createContext({console,setTimeout,clearTimeout});
function printContext(){
 const texts=[],sent=[];const g={save(){},restore(){},rect(){},clip(){},fillRect(){},strokeRect(){},fillText(t){texts.push(t);},measureText(t){return {width:[...String(t)].length*20};},drawImage(){},beginPath(){},setLineDash(){},moveTo(){},lineTo(){},stroke(){}};
 const c=vm.createContext({console,setTimeout,clearTimeout,document:{createElement:()=>({getContext:()=>g})},BRAND_LABEL:{cafe:'在咖啡'},SCOPE:'cafe',num:String,applicationTime:String,navigator:{userAgent:'StarWebPRNTBrowser'},PosEncouragement:{pick:()=>({zh:'測試鼓勵語',en:'Keep going.'})},toast(){}});
 vm.runInContext(menuLib,c);vm.runInContext(src,c);c.sent=sent;vm.runInContext('StarWebPrintBuilder=function(){};StarWebPrintTrader=function(){};starSend=async job=>{sent.push(job);return true;}',c);
 return {c,texts,sent};
}
for(const blocked of [true,false])test(`register browser report returns ${blocked?'false when popup is blocked':'true after printing'}`,async()=>{
 const messages=[],calls=[];
 const popup={document:{write(html){calls.push(html);},close(){}},focus(){},print(){calls.push('printed');}};
 const c=vm.createContext({console,setTimeout,clearTimeout,navigator:{userAgent:'Safari'},window:{open:()=>blocked?null:popup},BRAND_LABEL:{CAFE:'在咖啡'},num:String,applicationTime:String,esc:String,toast:m=>messages.push(m)});
 vm.runInContext(src,c);
 const result=await vm.runInContext("printRegisterReport({venue:'CAFE',day:'2026-10-17',opened_at:'2026-10-17'},'關帳單')",c);
 assert.equal(result,!blocked);
 if(blocked){assert.equal(calls.length,0);assert.ok(messages.some(m=>m.includes('瀏覽器擋下列印視窗')));}
 else{assert.equal(calls.at(-1),'printed');assert.match(calls[0],/關帳單/);}
});

test('company invoice canvas includes buyer tax ID and name',async()=>{
 const {c,texts}=printContext();await vm.runInContext("invoiceProofCanvas({invoice:{status:'issued',number:'AB12345678',buyer_ubn:'12345678',buyer_name:'測試公司'},items:[],amount:100})",c);
 assert.ok(texts.includes('12345678'));assert.ok(texts.includes('測試公司'));
 assert.ok(texts.includes('言文字股份有限公司'));
 assert.ok(!texts.includes('測試鼓勵語'),'鼓勵小語改印在開桌 QR 單，不印在發票證明聯');
});
test('kitchen and receipt use mPOP with all items and long notes',async()=>{
 const {c,texts,sent}=printContext();c.o={id:'o1',table_no:'A1',amount:100,paid_at:'now',items:[{zh:'咖啡',qty:1,price:100,cat:'COFFEE',note:'少冰少糖'.repeat(30)}]};
 await vm.runInContext('printOrder(o);',c);assert.equal(sent.length,1);assert.ok(texts.some(t=>t.includes('咖啡')));
 assert.ok(texts.includes('出餐單'));assert.ok(texts.includes('A1'));assert.ok(texts.includes('【咖啡】'),'出餐單標菜單類別，不標吧檯／廚房');assert.ok(!texts.some(t=>/吧檯|廚房/.test(String(t))));
 assert.ok(!texts.some(t=>String(t).includes('NT$')||String(t)==='100'));
 await vm.runInContext('printReceipt(o);',c);assert.equal(sent.length,2);assert.ok(texts.includes('收據明細'));
 assert.ok(texts.some(t=>String(t).includes('合計')));
});
test('kitchen ticket groups by menu category (food first) and omits cancelled items and prices',async()=>{
 const {c,texts}=printContext();c.o={id:'o2',table_no:'B1',amount:280,paid_at:'now',payer:{method:'cash',received:300,change:20},items:[
  {zh:'拿鐵',qty:2,price:90,cat:'COFFEE',note:'去冰'},
  {zh:'吐司',qty:1,price:100,cat:'BREAD'},
  {zh:'已退的菜',qty:1,price:80,cat:'MAIN',cancelled:true},
 ]};
 await vm.runInContext('printOrder(o);',c);
 assert.ok(texts.includes('出餐單'));assert.ok(texts.includes('【麵包主食】'));assert.ok(texts.includes('【咖啡】'));assert.ok(!texts.includes('【主食】'),'取消的品項連類別標題都不印');
 assert.ok(texts.indexOf('【麵包主食】')<texts.indexOf('【咖啡】'),'依菜單類別順序：餐點在前、飲品在後');
 assert.equal(texts.filter(t=>t==='□ 拿鐵').length,2,'每份一行（KK 11/9）');assert.ok(texts.includes('□ 吐司'));assert.ok(!texts.some(t=>String(t).includes('已退的菜')));
 assert.ok(texts.some(t=>String(t).includes('去冰')),'規格印在品名下一行');assert.ok(texts.includes('廚房單 共 1 件')&&texts.includes('吧台單 共 2 件'),'餐點與飲品分兩張');
 assert.ok(!texts.some(t=>/現金|合計|NT\$|實收/.test(String(t))));
});
test('receipt detail shows guest totals, payment and invoice',async()=>{
 const {c,texts}=printContext();c.o={id:'o3',table_no:'A2',amount:170,paid_at:'now',payer:{method:'cash',received:200,change:30,discount:{type:'amount',value:10,amount:10,reason:'熟客'}},invoice:{number:'AB12345678',buyer_ubn:'12345678'},items:[{zh:'拿鐵',qty:2,price:90,cat:'COFFEE'}]};
 await vm.runInContext('printReceipt(o);',c);
 assert.ok(texts.includes('收據明細'));assert.ok(texts.includes('拿鐵 ×2'));assert.ok(texts.includes('合計'));
 assert.ok(texts.some(t=>String(t).includes('折扣')));assert.ok(texts.some(t=>String(t).includes('實收')));
 assert.ok(texts.some(t=>String(t).includes('發票 AB12345678')));assert.ok(texts.some(t=>String(t).includes('買受人統編')));
});
test('checkout prints receipt, never kitchen, even when invoice printing throws',async()=>{
 const {c}=printContext();c.jobs=[];vm.runInContext("printReceipt=async()=>jobs.push('receipt');printOrder=async()=>jobs.push('kitchen');printInvoiceProof=async()=>{throw Error('offline')};",c);
 await vm.runInContext("printCheckoutOrder({invoice:{status:'issued'},payer:{method:'cash'}})",c);assert.deepEqual([...c.jobs],['receipt']);
});
test('printer jobs are serialized and recover after a failed job',async()=>{
 const c=load();vm.runInContext(src,c);c.started=[];c.release=[];
 vm.runInContext('starSendNow=job=>{started.push(job.id);return new Promise((resolve,reject)=>release.push(job.fail?()=>reject(Error("offline")):()=>resolve(true)));}',c);
 const a=vm.runInContext('starSend({id:1,fail:true})',c);const caught=a.catch(()=>false);const b=vm.runInContext('starSend({id:2})',c);
 await Promise.resolve();assert.deepEqual([...c.started],[1]);c.release[0]();await caught;await Promise.resolve();await Promise.resolve();assert.deepEqual([...c.started],[1,2]);c.release[1]();assert.equal(await b,true);
});
test('without an invoice checkout prints receipt only',async()=>{
 const {c}=printContext();c.jobs=[];vm.runInContext("printReceipt=async()=>jobs.push('receipt');printOrder=async()=>jobs.push('kitchen');",c);
 await vm.runInContext("printCheckoutOrder({invoice:{},payer:{method:'card'}})",c);assert.deepEqual([...c.jobs],['receipt']);
});
test('checkout prints invoice and receipt exactly once, with no kitchen call',async()=>{
 const {c}=printContext();c.jobs=[];vm.runInContext("printReceipt=async()=>jobs.push('receipt');printOrder=async()=>jobs.push('kitchen');printInvoiceProof=async()=>jobs.push('invoice');",c);
 await vm.runInContext("printCheckoutOrder({invoice:{status:'issued'}})",c);assert.deepEqual([...c.jobs],['invoice','receipt']);
});
test('automatic receipt outside Star Browser never opens a popup',async()=>{
 const {c}=printContext();vm.runInContext("navigator.userAgent='Safari';printWindow=()=>{throw Error('unexpected popup')};",c);
 assert.equal(await vm.runInContext("printReceipt({items:[]},{auto:true})",c),false);
});
test('history offers invoice scan lookup without auto-voiding',()=>{
 assert.match(src,/id="hist-scan"/);assert.match(src,/PosInvoiceScan\.open\(\{onScan/);
 assert.match(src,/HIST_Q=number;HIST_DAY=MenuLib\.businessDay\(\);loadHistory\(\)/);
});
test('every checkout starts with paper invoice and no-invoice is last',()=>{
 const c=load();vm.runInContext(src,c);
 assert.equal(vm.runInContext('POS_INVOICE.mode',c),'paper');
 assert.match(src,/\[\['paper','紙本'\].*\['','不開立'\]\]/);
 assert.match(src,/POS_INVOICE.mode='paper';return reload/);
});
test('table panel offers pre-checkout kitchen and receipt printing',()=>{
 assert.match(src,/<div class="pos-table-actions"><button[^>]*id="pos-place"[\s\S]{0,600}id="pos-slip"[\s\S]{0,1200}id="pos-move"[\s\S]{0,400}id="pos-close"/,'列印出餐單→換桌／併桌→清桌在左欄底部同一排');assert.doesNotMatch(src,/pos-prepay/);
 assert.match(src,/id="pos-place"[\s\S]{0,300}aria-label="列印出餐單"><span>出餐<\/span><\/button>/);assert.doesNotMatch(src,/送出點餐／列印出餐單/);assert.match(src,/id="pos-print-receipt"/);
 assert.doesNotMatch(src,/printOrder\(tableTicket\(\)\)/,'都送過時不可整桌重印（KK 11/1：加點單混入前面的餐點）');assert.match(src,/const t=lastTicket\(\);if\(t\)await printOrder\(t\)/);assert.match(src,/reprint:true/);assert.match(src,/o\.reprint\)spec\.push\(\{kind:'center',text:o\.single\?'【補印】單品':'【補印】最近一次送單'/);assert.match(src,/sessions\/'\+cur\.id\+'\/place/);
});

test('發票證明聯與收據明細預設印賣方統編 93537055', async () => {
  const {c,texts}=printContext();await vm.runInContext("invoiceProofCanvas({invoice:{status:'issued',number:'AB12345678',buyer_ubn:'12345678'},items:[],amount:100})",c);
  assert.ok(texts.some(t=>/^93537055$/.test(t)),'證明聯要印賣方統編');
  assert.ok(texts.some(t=>/買方統編/.test(t)));
  const r=vm.runInContext("receiptTicketSpec({id:'o9',table_no:'A1',amount:100,items:[],payer:{method:'cash'},invoice:{number:'AB12345678'}})",c);
  assert.ok(JSON.parse(JSON.stringify(r)).some(x=>x&&x.text==='賣方統編 93537055'));
});

test('帳本夾：內用送單（在咖啡、三點水）多印一張點餐明細，外帶不印', async () => {
 for (const [venue, table, want] of [['BAR','A1',2],['CAFE','A1',2],['BAR','W01',1]]) {
  const {c,texts,sent}=printContext();c.o={id:'tk_1',table_no:table,placed_at:'now',items:[{zh:'烏龍麵',qty:2,price:320,cat:'MAIN',venue,note:'麵量：少麵'}]};
  await vm.runInContext('printOrder(o,{auto:true,slip:true});',c);
  assert.equal(sent.length,want,`${venue} ${table}`);
  if(want===2){assert.ok(texts.includes('點餐明細'));assert.ok(texts.includes('□ 烏龍麵'));assert.ok(texts.includes('320 × 2')&&texts.includes('640'),'單價×數量＋小計');assert.ok(texts.some(t=>String(t).includes('[少麵')));}
 }
 const {c,sent}=printContext();c.o={id:'tk_2',table_no:'A1',items:[{zh:'烏龍麵',qty:1,price:320,cat:'MAIN',venue:'BAR'}]};
 await vm.runInContext('printOrder(o);',c);assert.equal(sent.length,1,'補印出餐單不附明細');
});
test('點餐明細：套餐內容各帶 □、桌號人數、整桌累計含服務費', async () => {
 const {c,texts}=printContext();
 c.o={id:'tk_abc123',table_no:'B1',placed_at:'now',table_total:{amount:1448,service:145,total:1593,count:9,party:4},items:[
  {zh:'98套餐',qty:1,price:98,cat:'MAIN',venue:'BAR',by:'小明',parts:[{slot:'湯品',zh:'奶油蘑菇湯'},{slot:'麵包',zh:'餐包'}]}]};
 await vm.runInContext('ticketCanvas(orderSlipSpec(o))',c);
 for(const t of ['桌 B1','4 位','□ 98套餐','　□ 湯品：奶油蘑菇湯','　□ 麵包：餐包','整桌小計','1,448','服務費 10%','NT$1,593','點餐：小明','用餐完請到櫃檯結帳，謝謝'])assert.ok(texts.join('').replace(/,/g,'').includes(t.replace(/,/g,'')),t+' 未印出：'+JSON.stringify(texts));
});
test('自動出單佇列送單時附點餐明細', () => {
 assert.ok(src.includes('printOrder(claim.job,{auto:true,slip:true})'));
});

test('點餐明細全中文（KK 11/2）：不印英文品名，外語規格轉回中文且只印值', async () => {
 const {c,texts}=printContext();
 vm.runInContext(readFileSync(new URL('../public/order-lib.js',import.meta.url),'utf8'),c);
 c.o={id:'tk_en1',table_no:'A2',placed_at:'now',items:[
  {zh:'拿鐵',en:'Latte',qty:1,price:120,cat:'COFFEE',venue:'CAFE',note:'Temperature：Hot'},
  {zh:'柚子氣泡',en:'Yuzu Sparkling',qty:1,price:150,cat:'SPARKLING',venue:'CAFE',note:'Ice：Less ice'},
  {zh:'98套餐',en:'Set +98',qty:1,price:98,cat:'COMBO',venue:'BAR',parts:[{slot:'飲品',zh:'紅茶',en:'Black tea',note:'Temperature：Iced'}]}]};
 await vm.runInContext('ticketCanvas(orderSlipSpec(o))',c);
 const all=texts.join('|');
 assert.ok(!/[A-Za-z]{3,}/.test(all.replace(/tk_en1|now/g,'')),'不得有英文：'+all);
 assert.ok(all.includes('[熱]')&&all.includes('[少冰]'),all);
 assert.ok(all.includes('　□ 飲品：紅茶（冰）'),all);
});

test('各別結帳時「列印明細」只印這次要結的品項；出餐單仍印整桌；平均分攤標本次應收', () => {
 assert.match(src,/const receiptTicket=\(\)=>\{const partial=!!POS_PICK\|\|Object\.keys\(POS_QTY\)\.length>0;/);
 assert.match(src,/return tableTicketOf\(t\.picked\.filter/);
 assert.match(src,/printReceipt\(receiptTicket\(\)\)/);
 assert.match(src,/share:`平均分攤 \$\{aa\.people\} 人/);
 assert.match(src,/if\(o\.share\)spec\.push/);
});

test('收據明細 spec：share 字樣印在「尚未結帳」上方', () => {
 const {c}=printContext();
 const r=JSON.parse(JSON.stringify(vm.runInContext("receiptTicketSpec({id:'o9',table_no:'A1',amount:300,items:[],preview:true,share:'平均分攤 3 人・第 1 人應收 NT$100',payer:{method:'cash'},invoice:{}})",c)));
 const i=r.findIndex(x=>x&&x.text==='平均分攤 3 人・第 1 人應收 NT$100'),j=r.findIndex(x=>x&&x.text==='【尚未結帳・僅供核對】');
 assert.ok(i>=0&&j>i);
});

test('列印點餐明細（KK 11/5）：整桌已送出品項補印，排除未送出／取消／預收／點歌，合計含服務費', async () => {
 assert.match(src,/id="pos-slip"[\s\S]{0,300}aria-label="列印點餐明細"><span>明細<\/span><\/button>/);
 assert.match(src,/\$\{cur\.takeout\?'':`<button class="btn btn--ghost" id="pos-slip"/,'外帶不顯示');
 const {c,texts,sent}=printContext();
 c.cur={id:'s1',table:'A3',party_size:3,lines:[
  {line:1,zh:'烏龍麵',qty:2,price:320,cat:'MAIN',venue:'BAR',placed_at:'t1',ticket:'k1'},
  {line:2,zh:'拿鐵',qty:1,price:120,cat:'COFFEE',venue:'BAR',placed_at:'t2',ticket:'k2'},
  {line:3,zh:'取消品',qty:1,price:99,cat:'MAIN',venue:'BAR',placed_at:'t1',cancelled:true},
  {line:4,zh:'未送出品',qty:1,price:50,cat:'MAIN',venue:'BAR'},
  {line:5,zh:'點歌',qty:1,price:10,cat:'SONG',venue:'BAR',placed_at:'t2',song:{}}]};
 const o=vm.runInContext('tableSlipOrder(cur)',c);
 assert.deepEqual(o.items.map(l=>l.line),[1,2]);
 assert.equal(o.table_total.party,3);
 await vm.runInContext('ticketCanvas(orderSlipSpec(tableSlipOrder(cur)))',c);
 const all=texts.join('|');
 for(const t of ['點餐明細（整桌）','□ 烏龍麵','□ 拿鐵','已送出 ×3','3 位'])assert.ok(all.includes(t),t+'：'+all);
 for(const t of ['取消品','未送出品','點歌'])assert.ok(!all.includes(t),t+' 不該印');
 assert.equal(vm.runInContext("tableSlipOrder({id:'x',table:'A1',lines:[{zh:'a',qty:1,price:1}]})",c),null,'沒送出的不印');
});

test('左欄動作鍵一排不換行（KK 11/5）：grid 單列＋圖示', () => {
 const css=readFileSync(new URL('../public/pos-ops.css',import.meta.url),'utf8'),ic=readFileSync(new URL('../public/pos-icons.js',import.meta.url),'utf8');
 assert.match(css,/\.pos-table-actions\{display:grid;grid-auto-flow:column/);
 assert.doesNotMatch(css,/\.pos-table-actions #pos-place\{flex-basis:100%\}/);
 for(const [id,n] of [['pos-place','send'],['pos-slip','receipt'],['pos-party','users'],['pos-move','swap'],['pos-close','xcircle']])assert.ok(ic.includes(`['#${id}','${n}']`),id);
});

test('個別品項列印出餐單（KK 11/7）：已送出品項「⋯」有「印出餐單」，只印該品項並標【補印】單品', async () => {
 assert.match(src,/data-print-line=/);
 assert.match(src,/l\.placed_at&&!l\.cancelled&&!l\.song&&!l\.tip&&l\.cat!=='SHOP'\?`<button[^`]*data-print-line/);
 assert.match(src,/querySelectorAll\('\[data-print-line\]'\)[\s\S]{0,400}printOrder\(\{[^}]*items:\[l\],reprint:true,single:true\}\)/);
 const {c,texts,sent}=printContext();
 c.o={id:'tk_1',table_no:'A3',placed_at:'now',reprint:true,single:true,items:[{line:'L2',zh:'拿鐵',qty:1,price:150,cat:'COFFEE'}]};
 await vm.runInContext('printOrder(o);',c);
 assert.equal(sent.length,1,'單一飲品只印一張吧台單');
 assert.ok(texts.includes('【補印】單品'));assert.ok(!texts.includes('【補印】最近一次送單'));
 assert.ok(texts.some(t=>String(t).includes('拿鐵')));assert.ok(!texts.some(t=>String(t).includes('點餐明細')),'單品補印不附點餐明細');
});
