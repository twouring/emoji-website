import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const pos = readFileSync(new URL('../public/pos.html', import.meta.url), 'utf8');
const login = pos.slice(pos.indexOf('function renderLogin('), pos.indexOf('// 操作人員四位數密碼登入'));
function harness(request) {
  const button = { disabled:false }, error = { hidden:true }, password = { value:'test-password' };
  const form = { elements:{ email:{ value:'manager@example.test' }, password }, querySelector:()=>button };
  const elements = { 'p-logout':{}, 'p-nav':{}, 'p-scope':{}, 'pos-password-login':form, 'pos-login-error':error };
  const saved = [], app = { innerHTML:'' };
  const ctx = { document:{ getElementById:id=>elements[id] || null }, app, esc:String, DEVICE_BOUND:false,
    AUTH_ORIGIN:'https://www.emoji.tw', location:{ origin:'https://pos.emoji.tw' }, encodeURIComponent,
    api:request, KEY:'tth_token', token:null, justLoggedInByAdmin:false,
    localStorage:{ setItem:(...args)=>saved.push(args) }, main:async()=>{ctx.booted=true;}, renderPinLogin(){} };
  runInNewContext(login, ctx);
  ctx.renderLogin();
  return { ctx, form, button, error, password, saved, app };
}

test('POS password form posts to shared admin endpoint and reuses token/bootstrap plus device binding', async()=>{
  let call;
  const h=harness(async(...args)=>{call=args;return {token:'signed-session'};});
  assert.match(h.app.innerHTML,/id="pos-password-login"/);
  assert.match(h.app.innerHTML,/autocomplete="username"/);
  assert.match(h.app.innerHTML,/autocomplete="current-password"/);
  assert.match(h.app.innerHTML,/使用 Google 登入/);
  assert.match(h.app.innerHTML,/event-login\.html/);
  await h.form.onsubmit({preventDefault(){}});
  assert.equal(call[0],'/auth/admin/password');
  assert.equal(call[1].method,'POST');
  assert.equal(JSON.stringify(call[1].body),JSON.stringify({email:'manager@example.test',password:'test-password'}));
  assert.deepEqual(h.saved,[['tth_token','signed-session']]);
  assert.equal(h.ctx.token,'signed-session');
  assert.equal(h.ctx.justLoggedInByAdmin,true);
  assert.equal(h.ctx.booted,true);
  assert.equal(h.password.value,'');
});

test('failed password login clears secret, shows text-only error, allows retry and never persists credentials', async()=>{
  const h=harness(async()=>{throw new Error('<invalid credentials>');});
  await h.form.onsubmit({preventDefault(){}});
  assert.equal(h.password.value,'');
  assert.equal(h.error.textContent,'<invalid credentials>');
  assert.equal(h.error.hidden,false);
  assert.equal(h.button.disabled,false);
  assert.deepEqual(h.saved,[]);
  assert.equal(h.ctx.booted,undefined);
});

test('pending password request disables duplicate submission', async()=>{
  let resolve, calls=0;
  const h=harness(()=>{calls++;return new Promise(done=>{resolve=done;});});
  const pending=h.form.onsubmit({preventDefault(){}});
  assert.equal(h.button.disabled,true);
  await h.form.onsubmit({preventDefault(){}});
  assert.equal(calls,1);
  resolve({token:'signed-session'});
  await pending;
});

const boot=pos.slice(pos.indexOf('async function main(){'),pos.indexOf('\nmain();\n</script>'));
for (const [label,state,allowed] of [
  ['unrestricted admin',{role:'admin',me:{}},true],
  ['cafe admin',{role:'admin',brands:['CAFE'],me:{}},true],
  ['non-food admin',{role:'admin',brands:['SPACE'],me:{}},false],
  ['non-admin session',{role:'invited',me:{}},false],
]) test(`password bootstrap preserves brand/role gate: ${label}`,async()=>{
  const paths=[],screens=[];
  const ctx={token:'signed-session',DEVICE_ID:'test-device',DEVICE_BOUND:false,justLoggedInByAdmin:true,
    BRAND_LABEL:{CAFE:'在咖啡',BAR:'三點水'},api:async path=>{paths.push(path);return path==='/state'?state:{};},
    showLoginScreen:msg=>screens.push(msg),MenuLib:{parseMenuDoc:()=>({})},routeTab:()=> 'pos',
    render:()=>{ctx.rendered=true;},refreshPending(){},renewToken(){},app:{},esc:String};
  runInNewContext(boot,ctx);
  await ctx.main();
  assert.equal(ctx.rendered===true,allowed);
  assert.equal(paths.includes('/admin/pos-devices/bind'),allowed);
  assert.equal(screens.length,allowed?0:1);
});
