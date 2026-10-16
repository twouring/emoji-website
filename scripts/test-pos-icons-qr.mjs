import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ops=read('public/pos-ops.js');
function qrContext({ready=true,success=true,qrError=false}={}){
  const calls=[], texts=[], canvases=[];
  const context={console,STAR_DOTS:384,toast:m=>calls.push(['toast',m]),starReady:()=>ready,starOpenHere:async()=>calls.push(['setup']),starSend:async job=>{calls.push(['send',job]);return success;},QRCode:{toCanvas:(c,url,options,cb)=>{calls.push(['qr',url,options]);cb(qrError?Error('qr'):null);}},document:{createElement:()=>{const c={getContext:()=>({fillRect(){},fillText:t=>texts.push(t),drawImage:(...a)=>calls.push(['image',...a])})};canvases.push(c);return c;}}};
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
  assert.equal(canvases.at(-1).width,384);assert.ok(texts.includes('桌號 A1'));assert.ok(texts.includes('言文字'));
  const fn=ops.match(/async function printTableQr\(table,url\)\{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(fn,/drawer|checkout|window\.open|api\(/);
});
test('未連接 Star、QR 失敗及列印失敗均不宣稱實體出紙成功',async()=>{
  for(const scenario of [{ready:false},{qrError:true},{success:false}]){
    const {context,calls}=qrContext(scenario);assert.equal(await context.printTableQr('A1','url'),false);
    assert.equal(calls.filter(c=>c[0]==='send').length,scenario.success===false?1:0);
  }
});
test('桌位專屬 QR 自動查詢該桌，保留批次入口與新版查單卡片',()=>{
  assert.match(ops,/if\(typeof table==='string'\)return openOneTableQr\(table\)/);
  assert.match(ops,/async function openOneTableQr\(table\)/);
  assert.match(ops,/api\('\/admin\/tables\/qr\?tables='\+encodeURIComponent\(table\)\)/);
  assert.match(ops,/await printTableQr\(t.table,t.url\)/);
  assert.match(ops,/pb.disabled=true/);assert.match(ops,/finally\{pb.disabled=false/);
  assert.ok(ops.includes('class="hist-list"'));assert.doesNotMatch(ops,/hist-tbl/);
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
