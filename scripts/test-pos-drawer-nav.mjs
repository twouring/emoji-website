import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const page=fs.readFileSync(new URL('public/pos.html',root),'utf8');
const ops=fs.readFileSync(new URL('public/pos-ops.js',root),'utf8');
test('logged-in POS has one right-side header drawer button, outside scrollable tabs',()=>{
 const header=page.match(/<header class="p-top">([\s\S]*?)<\/header>/)?.[1]||'';
 assert.match(header,/<div class="p-tools">[\s\S]*?<button[^>]*id="p-drawer"[^>]*>開錢櫃<\/button>/);
 assert.ok(header.indexOf('id="p-drawer"')>header.indexOf('id="p-nav"'));
 assert.match(page,/function render\(\)[\s\S]*?getElementById\('p-drawer'\)\.hidden = false/);
 assert.match(page,/function renderLogin\(msg\)[\s\S]*?if \(drawer\) drawer\.hidden = true/);
 assert.match(page,/function renderPinLogin\(msg\)[\s\S]*?if \(drawer\) drawer\.hidden = true/);
 assert.match(ops,/\$\{document\.getElementById\('p-drawer'\)\?'':'<div class="a-toolbar"><button[^>]*id="pos-cash-drawer"/);
});
test('header button preserves operator, reason, audit and busy protection; admin keeps its own button',()=>{
 assert.match(page,/bindCashDrawerButton\(document\.getElementById\('p-drawer'\)\)/);
 assert.match(ops,/function bindCashDrawerButton\(drawerBtn\)/);
 assert.match(ops,/ensureOperator\(async\(\)=>\{const reason=await pickReason/);
 assert.match(ops,/await manualCashDrawer\(reason\)/);
 assert.match(ops,/if\(!document\.getElementById\('p-drawer'\)\)bindCashDrawerButton\(host\.querySelector\('#pos-cash-drawer'\)\)/);
});
