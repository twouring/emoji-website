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
test('日結頁照常自動重整，改留草稿（KK 11/8）：不得再有日結例外',()=>{
 assert.doesNotMatch(page,/posNoAuto|posWake/);
 const ops=fs.readFileSync(new URL('public/pos-ops.js',root),'utf8');
 const load=ops.slice(ops.indexOf('async function loadSales(){'),ops.indexOf('\n}\n',ops.indexOf('async function loadSales(){')));
 assert.match(load,/salesDraftHydrate\(\)/,'重整後還原開著的表單與已核對帳戶');
 assert.match(load,/salesDraftRestore\(host\);if\(resumeDialog\)salesDialogResume\(host\);/,'重繪後帳回欄位、重開核對中的彈窗');
 assert.match(ops,/const salesDraftKey=\(\)=>'tth_sales_draft_'\+/,'草稿依品牌分開存');
 assert.match(ops,/const done=v=>\{close\(\);salesDialogSave\(null\);resolve\(v\);\};/,'彈窗確認／取消才清草稿');
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
