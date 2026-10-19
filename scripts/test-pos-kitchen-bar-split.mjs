import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
// 出餐單分兩張：餐點單（黑底橫幅＋實心邊條）與飲品單（斜線橫幅＋虛線邊條）
const src=readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
const menuLib=readFileSync(new URL('../public/menu-lib.js',import.meta.url),'utf8');
function ctx(){
 const texts=[],sent=[],rects=[];
 const g={save(){},restore(){},rect(){},clip(){},fillRect(...a){rects.push(a);},strokeRect(){},fillText(t){texts.push(t);},measureText(t){return {width:[...String(t)].length*20};},drawImage(){},beginPath(){},setLineDash(){},moveTo(){},lineTo(){},stroke(){}};
 const c=vm.createContext({console,setTimeout,clearTimeout,document:{createElement:()=>({getContext:()=>g})},BRAND_LABEL:{cafe:'在咖啡'},SCOPE:'cafe',num:String,applicationTime:String,navigator:{userAgent:'StarWebPRNTBrowser'},toast(){}});
 vm.runInContext(menuLib,c);vm.runInContext(src,c);
 c.sent=sent;vm.runInContext('StarWebPrintBuilder=function(){};StarWebPrintTrader=function(){};starSend=async job=>{sent.push(job);return true;}',c);
 return {c,texts,sent,rects};
}
const order={id:'o9',table_no:'A3',paid_at:'now',items:[
 {zh:'拿鐵',qty:2,price:90,cat:'COFFEE',note:'冰塊：去冰'},
 {zh:'咖哩飯',qty:1,price:200,cat:'MAIN'},
 {zh:'清酒',qty:1,price:300,cat:'SAKE'},
 {zh:'午餐套餐',qty:1,price:320,cat:'COMBO',parts:[{slot:'主餐',zh:'咖哩飯',cat:'MAIN'},{slot:'飲品',zh:'紅茶',cat:'TEA'}]},
 {zh:'已退',qty:1,price:80,cat:'BEER',cancelled:true},
]};
test('mixed order prints two tickets: food first, then drinks',async()=>{
 const {c,texts,sent}=ctx();c.o=order;
 assert.equal(await vm.runInContext('printOrder(o)',c),true);
 assert.equal(sent.length,2,'餐點與飲品各一張');
 const parts=vm.runInContext('ticketParts(o).map(t=>[t.kind,t.order.items.map(l=>l.zh+"|"+(l.parts||[]).map(p=>p.zh).join(","))])',c);
 assert.deepEqual(JSON.parse(JSON.stringify(parts)),[
  ['food',['午餐套餐|咖哩飯','咖哩飯|']],
  ['drink',['午餐套餐|紅茶','拿鐵|','清酒|']],
 ]);
 assert.ok(texts.includes('餐 點')&&texts.includes('飲 品'),'兩種橫幅字');
 assert.ok(texts.includes('餐點單 共 2 件')&&texts.includes('飲品單 共 4 件'));
 assert.ok(texts.includes('同單另有飲品單')&&texts.includes('同單另有餐點單'));
 assert.ok(!texts.includes('已退'));
});
test('drink-only order prints one ticket without cross reference',async()=>{
 const {c,texts,sent}=ctx();c.o={id:'o1',table_no:'B1',items:[{zh:'拿鐵',qty:1,price:90,cat:'COFFEE'}]};
 await vm.runInContext('printOrder(o)',c);
 assert.equal(sent.length,1);assert.ok(texts.includes('飲 品'));assert.ok(!texts.includes('餐 點'));
 assert.ok(!texts.some(t=>String(t).startsWith('同單另有')));
});
test('food and drink tickets render visibly different marks',()=>{
 const {c}=ctx();
 const food=vm.runInContext("kitchenTicketSpec({table_no:'A1',items:[{zh:'吐司',qty:1,cat:'BREAD'}]},'food',2)",c);
 const drink=vm.runInContext("kitchenTicketSpec({table_no:'A1',items:[{zh:'拿鐵',qty:1,cat:'COFFEE'}]},'drink',2)",c);
 const style=s=>JSON.parse(JSON.stringify(s)).filter(x=>x.kind==='banner'||x.kind==='edge').map(x=>x.style);
 assert.ok(style(food).every(s=>s==='solid')&&style(food).length===3);
 assert.ok(style(drink).every(s=>s==='hatch')&&style(drink).length===3);
});
test('a print failure on the second ticket reports failure (auto queue pauses)',async()=>{
 const {c}=ctx();c.o=order;let n=0;c.starSendStub=async()=>++n<2;
 vm.runInContext('starSend=starSendStub',c);
 assert.equal(await vm.runInContext('printOrder(o)',c),false);
});
test('browser fallback prints both tickets with page break and distinct banners',async()=>{
 const html=[];const c=vm.createContext({console,setTimeout,clearTimeout,navigator:{userAgent:'Safari'},window:{open:()=>({document:{write:h=>html.push(h),close(){}},focus(){},print(){}})},esc:String,applicationTime:String,toast(){}});
 vm.runInContext(menuLib,c);vm.runInContext(src,c);c.o=order;
 await vm.runInContext('printOrder(o)',c);
 assert.equal(html.length,1);assert.match(html[0],/tk-food[\s\S]*tk-drink/);assert.match(html[0],/page-break-after:always/);
 assert.match(html[0],/bn-food\{background:#000/);assert.match(html[0],/bn-drink\{background:repeating-linear-gradient/);
});
