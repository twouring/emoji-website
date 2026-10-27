import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ops=read('public/pos-ops.js');
function qrContext({ready=true,success=true,qrError=false,enc=true,venue}={}){
  const calls=[], texts=[], canvases=[];
  const context={console,STAR_DOTS:384,...(venue!==undefined?{BRAND_LABEL:{CAFE:'在咖啡',BAR:'三點水'},MenuLib:{orderWindow:()=>({venue})}}:{}),QR_CLIP_TOP:200,QR_BODY_MAX:720,...(enc?{PosEncouragement:{pick:()=>({zh:'測試鼓勵語',en:'Keep going.',m:'coffee/dot'})},PosMoji:{ratio:0.875,draw:(...a)=>{calls.push(['moji',...a.slice(1)]);return true;}}}:{}),toast:m=>calls.push(['toast',m]),starReady:()=>ready,starOpenHere:async()=>calls.push(['setup']),starSend:async job=>{calls.push(['send',job]);return success;},QRCode:{toCanvas:(c,url,options,cb)=>{calls.push(['qr',url,options]);cb(qrError?Error('qr'):null);}},document:{createElement:()=>{const c={getContext:()=>({fillRect(){},fillText:t=>texts.push(t),drawImage:(...a)=>calls.push(['image',...a])})};canvases.push(c);return c;}}};
  vm.createContext(context);
  const match=ops.match(/async function printTableQr\(table,url\)\{[\s\S]*?\n\}/);
  assert.ok(match,'單桌 QR 列印 helper 必須存在');
  vm.runInContext(match[0],context);
  return {context,calls,texts,canvases};
}
test('單桌 QR 直接走 384-dot mPOP 並保留 QR 留白，不開錢櫃或重送交易',async()=>{
  const {context,calls,texts,canvases}=qrContext();
  assert.equal(await context.printTableQr('A1','https://example.test/order?t=A1'),true);
  const qr=calls.find(c=>c[0]==='qr');assert.equal(qr[1],'https://example.test/order?t=A1');assert.ok(qr[2].margin>=4);
  assert.equal(calls.filter(c=>c[0]==='send').length,1);
  assert.equal(canvases.at(-1).width,384);assert.ok(texts.includes('桌號 A1'));assert.ok(texts.includes('在咖啡、三點水'));assert.ok(!texts.includes('言文字'),'桌號 QR 不印母公司名');
  const fn=ops.match(/async function printTableQr\(table,url\)\{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(fn,/drawer|checkout|window\.open|api\(/);
});
test('桌號 QR 店名依點餐時段：在咖啡／三點水，非時段印兩店名，都不印言文字',async()=>{
  for(const [venue,want] of [['CAFE','在咖啡'],['BAR','三點水'],[null,'在咖啡、三點水']]){
    const {context,texts}=qrContext({venue});
    assert.equal(await context.printTableQr('A1','https://example.test/order?t=A1'),true);
    assert.equal(texts[0],want);assert.ok(!texts.includes('言文字'));
  }
});
test('開桌 QR 單中英雙語，並印鼓勵小語與吉祥物插圖',async()=>{
  const {context,texts,calls}=qrContext();
  assert.equal(await context.printTableQr('A1','https://example.test/order?s=1&k=x'),true);
  for(const t of ['桌號 A1','Table A1','掃碼點餐','Scan to order','用餐完請到櫃檯結帳','Please pay at the counter after your meal','測試鼓勵語','Keep going.'])assert.ok(texts.includes(t),'缺少：'+t);
  const moji=calls.find(c=>c[0]==='moji');assert.ok(moji,'要畫 moji 插圖');assert.equal(moji[1],'coffee/dot');assert.equal(moji[4],144);
  const {context:c2,texts:t2}=qrContext({enc:false});
  assert.equal(await c2.printTableQr('A1','url'),true,'沒載入鼓勵小語也要能印');assert.ok(t2.includes('Table A1'));
});
test('未連接 Star、QR 失敗及列印失敗均不宣稱實體出紙成功',async()=>{
  for(const scenario of [{ready:false},{qrError:true},{success:false}]){
    const {context,calls}=qrContext(scenario);assert.equal(await context.printTableQr('A1','url'),false);
    assert.equal(calls.filter(c=>c[0]==='send').length,scenario.success===false?1:0);
  }
});
test('桌位專屬 QR 自動查詢該桌，保留批次入口；查單一單一列、點開看詳情與操作',()=>{
  assert.match(ops,/function openTableQr\(table\)\{return openOneTableQr\(String\(table\)\);\}/);
  assert.match(ops,/async function openOneTableQr\(table\)/);
  assert.match(ops,/api\('\/admin\/tables\/qr\?tables='\+encodeURIComponent\(table\)\)/);
  assert.match(ops,/await printTableQr\(t.table,t.url\)/);
  assert.match(ops,/pb.disabled=true/);assert.match(ops,/finally\{pb.disabled=false/);
  assert.ok(ops.includes('class="hist-list"'));assert.ok(ops.includes('<table class="hist-sheet">'));assert.match(ops,/data-hist-row=/);assert.match(ops,/data-hist-detail=/);
});
test('POS 圖示 script 與導覽圖示接線，未知名稱不能注入 SVG',()=>{
  const html=read('public/pos.html');assert.match(html,/<script src="\/pos-icons.js"><\/script>/);
  const source=read('public/pos-icons.js');
  const ctx={window:{},document:{readyState:'loading',addEventListener(){} }};vm.createContext(ctx);vm.runInContext(source,ctx);
  for(const name of ['wallet','utensils','ban','calendar','search','chart','clock','users','qr','refresh']){
    assert.match(ctx.window.POSIcon(name),/<svg/);assert.match(ctx.window.POSIcon(name),/aria-hidden="true"/);
  }
  assert.equal(ctx.window.POSIcon('<img onerror=alert(1)>'),'');
  assert.equal(ctx.window.POSIcon('toString'),'');
  assert.match(html,/POSIcon\(t.icon\)/);assert.match(html,/POSIcon\('calendar'\)/);
});
test('桌號 QR 單上方留白給帳本夾（≥20mm），標題從留白下方開始',()=>{
  const m=ops.match(/const QR_CLIP_TOP=(\d+);/);assert.ok(m,'要有 QR_CLIP_TOP');assert.ok(Number(m[1])>=160,'留白至少 20mm（160 點）');
  const fn=ops.match(/async function printTableQr\(table,url\)\{[\s\S]*?\n\}/)[0];assert.match(fn,/let y=QR_CLIP_TOP;/);
});
test('桌號 QR 單留白以下壓在 90mm 內（QR_BODY_MAX=720 點），插圖與小語左右並排',async()=>{
  assert.match(ops,/const QR_BODY_MAX=720;/);
  const {context,canvases}=qrContext();
  await context.printTableQr('A12','https://example.test/order?s=1&k=x');
  const out=canvases.at(-1);assert.ok(out.height-200<=720,'留白以下 '+(out.height-200)+' 點超過 90mm');
});
