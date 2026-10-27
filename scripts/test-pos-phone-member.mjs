// POS 結帳輸入電話自動新增會員：查不到手機就建 users 列、回 created，POS 告知「已新增會員」；會員 App 改手機撞到已建帳號回 409
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const ops=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
const fnSrc=server.slice(server.indexOf('async function findOrCreateMemberByPhone('),server.indexOf('async function applyYanForCheckout('));
const yan=(await import('../lib/yan.js')).default;

function client(existing){
  const calls=[];
  return {calls,query:async(sql,params)=>{calls.push(sql);if(sql.startsWith('SELECT id,name'))return {rows:existing?[existing]:[]};return {rows:[]};}};
}
function load(){const ctx=vm.createContext({yan,uid:p=>p+'new'});vm.runInContext(fnSrc+';this.f=findOrCreateMemberByPhone;',ctx);return ctx.f;}

test('unknown phone creates a member and flags created; known phone does not',async()=>{
  const f=load();
  const c1=client(null);const u=await f(c1,'0912-345-678');
  assert.equal(u.created,true);assert.equal(u.phone_e164,'+886912345678');
  assert.ok(c1.calls.some(s=>/INSERT INTO users/.test(s)));
  const c2=client({id:'u1',name:'小明',phone_e164:'+886912345678'});const v=await f(c2,'0912345678');
  assert.equal(v.created,undefined);assert.ok(!c2.calls.some(s=>/INSERT/.test(s)));
  await assert.rejects(f(client(null),'12345'),/台灣手機/);
});
test('lookup and checkout responses expose created flag',()=>{
  assert.match(server,/verified: !!\(token \|\| req\.body\?\.member_id\), created: !!user\.created \}/);
  assert.match(server,/member_created:!!memberUser\?\.created/);
});
test('POS tells staff a new member was created',()=>{
  assert.match(ops,/created:!!out\.created/);
  assert.match(ops,/已新增會員 \$\{p\}/);
  assert.match(ops,/out\.member_created\?'，已新增會員'/);
  assert.match(ops,/不是會員自動新增/);
  assert.doesNotMatch(ops,/只累點（尚未綁定會員帳號）/);
});
test('member app profile phone clash returns 409 instead of 500',()=>{
  const route=server.slice(server.indexOf("app.post('/api/me/profile'"),server.indexOf("app.post('/api/me/plans/checkout'"));
  assert.match(route,/e\.code === '23505'\) return res\.status\(409\)/);
});
