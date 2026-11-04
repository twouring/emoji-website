import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const server=fs.readFileSync('server.js','utf8'),pos=fs.readFileSync('public/pos.html','utf8');
const T=await import('../lib/table-orders.js').then(m=>m.default||m);
const plain=x=>JSON.parse(JSON.stringify(x));
function handler(path,ctx){
  const start=server.indexOf("app.post('"+path+"'");
  const source=server.slice(start,server.indexOf('\n}));',start)+6);
  vm.runInNewContext(source,{app:{post(...a){ctx.handler=a.at(-1);}},POS_ACCOUNT_EMAIL:'pos@emoji.tw',rateLimit:()=>()=>{},requireDb(){},auth(){},adminOnly(){},wrap:x=>x,...ctx});
  return ctx.handler;
}
const response=()=>({code:200,status(n){this.code=n;return this;},json(x){this.body=x;return this;}});
async function login(venues,body){
  let signed;const ctx={posStaff:require('../lib/pos-staff.js'),q:async sql=>({rows:sql.includes('FROM pos_devices')?[{venue:''}]:[{id:'st1',name:'小明',venues}]}),signToken:p=>(signed=p,'tok'),uid:p=>p+'x'};
  const res=response();await handler('/api/pos-devices/:id/pin-login',ctx)({params:{id:'d1'},body},res);return {res,signed};
}
test('PIN 登入一定要帶品牌（KK 11/4：先選品牌 POS 再輸入識別碼），token 鎖該品牌',async()=>{
  const {res,signed}=await login('BAR',{pin:'1234',venue:'BAR'});
  assert.equal(res.code,200);assert.deepEqual(plain(res.body.brands),['BAR']);assert.equal(signed.pos_venue,'BAR');
  const r=await login('BAR',{pin:'1234'});assert.equal(r.res.code,400);assert.equal(r.signed,undefined);
});
test('雙品牌員工不再回 choose：在哪個品牌 POS 輸入就進哪個',async()=>{
  const r=await login('CAFE,BAR',{pin:'1234',venue:'cafe'});
  assert.equal(r.res.body.choose,undefined);assert.deepEqual(plain(r.res.body.brands),['CAFE']);assert.equal(r.signed.pos_venue,'CAFE');
});
test('不屬於這個品牌的識別碼一律當密碼錯誤（跨品牌可重複，不洩漏）',async()=>{
  for(const [v,b] of [['CAFE','BAR'],['BAR','CAFE'],['STAY','REST']]){
    const r=await login(v,{pin:'1234',venue:b});assert.equal(r.res.code,404);assert.equal(r.signed,undefined);
  }
  const r=await login('CAFE',{pin:'1234',venue:'SPACE'});assert.equal(r.res.code,400);
});
const authSource=server.slice(server.indexOf('async function sessionAuth('),server.indexOf('\nasync function auth('));
async function session(payload,{venues='CAFE,BAR',active=true}={}){
  const ctx={posStaff:require('../lib/pos-staff.js'),POS_ACCOUNT_EMAIL:'pos@emoji.tw',verifyToken:()=>payload,pool:true,dbReady:true,q:async()=>({rows:[{id:'st1',name:'小明',venues,active}]})};
  vm.runInNewContext(authSource,ctx);return ctx.sessionAuth('t');
}
test('每次請求只拿到 token 鎖定的單一品牌；權限被移除、停用、舊雙品牌 token 都失效',async()=>{
  const p={operator_staff_id:'st1',pos_venue:'BAR'};
  assert.deepEqual(plain((await session(p)).brands),['BAR']);
  assert.equal(await session(p,{venues:'CAFE'}),null);
  assert.equal(await session(p,{active:false}),null);
  assert.equal(await session({operator_staff_id:'st1'}),null,'雙品牌舊 token 須重登');
  assert.deepEqual(plain((await session({operator_staff_id:'st1'},{venues:'CAFE'})).brands),['CAFE'],'單品牌舊 token 沿用');
});
test('續期保留 pos_venue',()=>{
  const start=server.indexOf("app.post('/api/auth/renew'");const src=server.slice(start,server.indexOf('\n});',start)+4);
  let fn;vm.runInNewContext(src,{app:{post(...a){fn=a.at(-1);}},auth(){},requireDb(){},signToken:p=>p});
  const res=response();res.set=()=>res;fn({auth:{operator_staff_id:'st1',pos_venue:'BAR',sub:'staff:st1',role:'admin'}},res);
  assert.equal(res.body.token.pos_venue,'BAR');
});
test('共用座位：混桌送單只送自己品牌，對方品項保持未送',()=>{
  const items=[{line:'a',venue:'CAFE',qty:1},{line:'b',venue:'BAR',qty:1}];
  const out=T.placeLines(items,new Date(),['BAR']).items;
  assert.ok(out.find(l=>l.line==='b').placed_at);assert.equal(out.find(l=>l.line==='a').placed_at,undefined);
  assert.throws(()=>T.placeLines(items,new Date(),['BAR']).items.length&&T.placeLines(out,new Date(),['BAR']),e=>e.status===400);
  assert.equal(T.placeLines(items).items.filter(l=>l.placed_at).length,2,'管理員不限品牌');
});
test('畫面：員工只見品牌標籤、不顯示姓名、無切換、首頁是品牌選擇頁',()=>{
  const src=pos.slice(pos.indexOf('const scopesOf ='),pos.indexOf('function routeTab'));
  const ctx={POS_URL_VENUE:'',DATA:{me:{operator:true,name:'小明'},brands:['BAR']},SCOPE:'CAFE',BRAND_LABEL:{CAFE:'在咖啡',BAR:'三點水'},localStorage:{setItem(){}}};
  vm.runInNewContext(src+'\nsetScope(scopesOf(DATA)[0]);setScope("CAFE");',ctx);assert.equal(ctx.SCOPE,'BAR');
  const nav=pos.slice(pos.indexOf('function paintNav(){'),pos.indexOf('function resetPanels(){'));
  const scopeEl={innerHTML:'',querySelectorAll:()=>[]},navEl={innerHTML:'',querySelectorAll:()=>[]};
  Object.assign(ctx,{document:{getElementById:id=>id==='p-scope'?scopeEl:navEl,querySelector:()=>null},esc:String,TABS:[],TAB:'pos',updateNavMore(){}});
  vm.runInNewContext(nav+'\npaintNav();',ctx);
  assert.match(scopeEl.innerHTML,/>三點水</);assert.doesNotMatch(scopeEl.innerHTML,/小明| · /);assert.doesNotMatch(scopeEl.innerHTML,/<button|data-scope/);
  assert.match(pos,/function renderBrandPicker\(msg\)/);assert.doesNotMatch(pos,/renderBrandChoice|d\.choose/);
  assert.match(pos,/body:\{ pin, venue:POS_URL_VENUE \}/,'PIN 登入固定帶網址的品牌');
  assert.doesNotMatch(pos,/startIdleLock|lockScreen/,'POS 不再自動鎖定螢幕');
  assert.doesNotMatch(pos,/localStorage\.setItem\([^)]*pin\b/i);
});

test('venues 為空（所有品牌員工）：四個品牌都能登入；sessionAuth 也放行',async()=>{
  for(const v of ['CAFE','BAR','STAY','REST']){const r=await login(null,{pin:'1234',venue:v});assert.equal(r.res.code,200,v);assert.equal(r.signed.pos_venue,v);}
  const s=await session({operator_staff_id:'st1',pos_venue:'CAFE'},{venues:null});assert.deepEqual(plain(s.brands),['CAFE']);
});
test('只有 pos@emoji.tw 綁定的裝置能用員工 PIN',()=>{
  assert.match(server,/POS_ACCOUNT_EMAIL = \(process\.env\.POS_ACCOUNT_EMAIL \|\| 'pos@emoji\.tw'\)/);
  assert.equal((server.match(/FROM pos_devices WHERE device_id=\$1 AND lower\(bound_by_email\)=\$2/g)||[]).length,2);
  assert.match(server,/!==POS_ACCOUNT_EMAIL\)return res\.status\(403\)/);
});
