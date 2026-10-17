import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const page=fs.readFileSync(new URL('public/pos.html',root),'utf8');
const ops=fs.readFileSync(new URL('public/pos-ops.js',root),'utf8');
test('POS removes manual refresh markup, CSS, handler and icon mapping',()=>{
 const icons=fs.readFileSync(new URL('public/pos-icons.js',root),'utf8');
 assert.doesNotMatch(page,/p-refresh/);
 assert.doesNotMatch(icons,/p-refresh/);
});
test('offline indicator and automatic refresh still work without a manual refresh button',()=>{
 const net={hidden:true},listeners={},calls=[];
 const ctx={DATA:{},navigator:{onLine:true},document:{hidden:false,getElementById:id=>{assert.equal(id,'p-net');return net;},addEventListener:(event,fn)=>listeners[event]=fn},addEventListener:(event,fn)=>listeners[event]=fn,activate:()=>calls.push('activate'),refreshPending:()=>calls.push('pending')};
 const start=page.indexOf("const net = document.getElementById('p-net');");
 const end=page.indexOf('\n',page.indexOf("document.addEventListener('visibilitychange'",start));
 assert.ok(start>=0&&end>start);
 vm.runInNewContext(page.slice(start,end),ctx);
 assert.equal(net.hidden,true);
 ctx.navigator.onLine=false;listeners.offline();assert.equal(net.hidden,false);
 ctx.navigator.onLine=true;listeners.online();assert.equal(net.hidden,true);
 assert.deepEqual(calls,['activate']);
 listeners.visibilitychange();assert.deepEqual(calls,['activate','activate','pending']);
 ctx.document.hidden=true;listeners.visibilitychange();assert.equal(calls.length,3);
 ctx.document.hidden=false;ctx.DATA=null;listeners.visibilitychange();listeners.online();assert.equal(calls.length,3);
});
test('logged-in POS has one right-side header drawer button, outside scrollable tabs',()=>{
 const header=page.match(/<header class="p-top">([\s\S]*?)<\/header>/)?.[1]||'';
 assert.match(header,/<div class="p-tools">[\s\S]*?<button[^>]*id="p-drawer"[^>]*>錢櫃<\/button>/);
 assert.ok(header.indexOf('id="p-drawer"')>header.indexOf('id="p-nav"'));
 assert.match(page,/function render\(\)[\s\S]*?getElementById\('p-drawer'\)\.hidden = false/);
 assert.match(page,/function renderLogin\(msg\)[\s\S]*?if \(drawer\) drawer\.hidden = true/);
 assert.match(page,/function renderPinLogin\(msg\)[\s\S]*?if \(drawer\) drawer\.hidden = true/);
 assert.match(ops,/\$\{document\.getElementById\('p-drawer'\)\?'':'<div class="a-toolbar"><button[^>]*id="pos-cash-drawer"[^>]*>錢櫃<\/button>/);
});
test('header button preserves operator, reason, audit and busy protection; admin keeps its own button',()=>{
 assert.match(page,/bindCashDrawerButton\(document\.getElementById\('p-drawer'\)\)/);
 assert.match(ops,/function bindCashDrawerButton\(drawerBtn\)/);
 assert.match(ops,/ensureOperator\(async\(\)=>\{const reason=await pickReason/);
 assert.match(ops,/await manualCashDrawer\(reason\)/);
 assert.match(ops,/if\(!document\.getElementById\('p-drawer'\)\)bindCashDrawerButton\(host\.querySelector\('#pos-cash-drawer'\)\)/);
});
