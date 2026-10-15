import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {once} from 'node:events';
const require=createRequire(import.meta.url);
const root=path.resolve(import.meta.dirname,'..');
const SECRET='test-only-admin-password-secret';
async function harness(t, users=[]) {
 const {hashPassword}=require('../lib/admin-password');
 const hash=await hashPassword('test-only-random-password-42');
 const attempts=new Map();
 const run=async(sql,args=[])=>{
  if(sql.includes('INSERT INTO admin_password_attempts')){const n=(attempts.get(args[0])||0)+1;attempts.set(args[0],n);return {rows:[{attempts:n}]};}
  if(sql.startsWith('INSERT INTO users')){users.push({id:args[0],name:args[1],email:args[2],is_admin:false});return {rows:[],rowCount:1};}
  if(sql.startsWith('UPDATE users SET is_admin=true')){const u=users.find(u=>u.id===args[0]);Object.assign(u,{is_admin:true,admin_brand:args[1],admin_password_hash:args[2]});return {rows:[],rowCount:1};}
  if(sql.includes('SELECT')&&sql.includes('FROM users'))return {rows:users.filter(u=>sql.includes('lower(email)')?u.email.toLowerCase()===args[0]:u.id===args[0]).map(u=>({...u,admin_password_hash:u.admin_password_hash||hash}))};
  if(sql.includes('SELECT EXISTS'))return {rows:[{allowed:false}]};
  return {rows:[],rowCount:0};
 };
 const mod={exports:{}};
 const localRequire=name=>name==='pg'?{Pool:class{query=run;async connect(){return {query:run,release(){}};}}}:name==='stripe'?class{}:createRequire(path.join(root,'server.js'))(name);
 const context=vm.createContext({require:localRequire,module:mod,__dirname:root,process:{env:{NODE_ENV:'test',APP_SECRET:SECRET,DATABASE_URL:'unused',STRIPE_SECRET_KEY:'stub',STRIPE_WEBHOOK_SECRET:'stub',GOOGLE_CLIENT_ID:'stub',PUBLIC_ORIGIN:'http://localhost',ACCESS_QR_SECRET:'x',ACCESS_DOOR_SECRET:'x'}},Buffer,URL,URLSearchParams,AbortSignal,Date,setTimeout,console:{log(){},warn(){},error(){}}});
 new vm.Script(readFileSync(path.join(root,'server.js'),'utf8')+'\ndbReady=true;').runInContext(context);
 const http=mod.exports.app.listen(0,'127.0.0.1');await once(http,'listening');
 t.after(()=>new Promise(resolve=>{http.close(resolve);http.closeAllConnections();}));
 return async(url,body,token)=>{const res=await fetch('http://127.0.0.1:'+http.address().port+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,headers:res.headers,body:await res.json()};};
}
test('admin password login returns a session rehydrated from DB; non-admin, absent, wrong passwords are indistinguishable',async t=>{
 const users=[{id:'u-admin',email:'admin@example.test',name:'Test',is_admin:true,admin_brand:null},{id:'u-member',email:'member@example.test',is_admin:false}];
 const call=await harness(t,users);
 const good=await call('/api/auth/admin/password',{email:' ADMIN@example.test ',password:'test-only-random-password-42'});
 assert.equal(good.status,200);assert.equal(good.headers.get('cache-control'),'no-store');
 const payload=require('../lib/security').verifyToken(good.body.token,SECRET);assert.equal(payload.sub,'u-admin');assert.equal(payload.role,'invited');
 assert.equal((await call('/api/auth/session',null,good.body.token)).status,200);
 for(const [email,password] of [['member@example.test','test-only-random-password-42'],['absent@example.test','test-only-random-password-42'],['admin@example.test','wrong']]){
  const bad=await call('/api/auth/admin/password',{email,password});assert.equal(bad.status,401);assert.deepEqual(bad.body,{error:'Email 或密碼錯誤。'});
 }
 users[0].is_admin=false;
 assert.equal((await call('/api/auth/admin/password',{email:'admin@example.test',password:'test-only-random-password-42'})).status,401);
});
test('password login shared account rate limit and provisioning authentication',async t=>{
 const call=await harness(t);
 for(let i=0;i<10;i++)assert.equal((await call('/api/auth/admin/password',{email:'missing@example.test',password:'wrong'})).status,401);
 const limited=await call('/api/auth/admin/password',{email:'missing@example.test',password:'wrong'});assert.equal(limited.status,429);assert.ok(limited.headers.get('retry-after'));
 assert.equal((await call('/api/admin/users/password',{email:'admin@example.test',password:'test-only-random-password-42',admin:true,brands:[]})).status,401);
});
test('super-only provisioning creates unrestricted DB admin and rotates password without granting super',async t=>{
 const users=[{id:'super',email:'us@twouring.com',is_admin:false},{id:'ordinary',email:'ordinary@example.test',is_admin:true}];
 const call=await harness(t,users),sign=require('../lib/security').signToken;
 const superToken=sign({role:'invited',sub:'super'},SECRET),ordinary=sign({role:'invited',sub:'ordinary'},SECRET);
 const body={email:' NEW@example.test ',name:'New admin',password:'provision-test-only-password',admin:true,brands:[]};
 assert.equal((await call('/api/admin/users/password',body,ordinary)).status,403);
 assert.equal((await call('/api/admin/users/password',{...body,admin:false},superToken)).status,400);
 assert.equal((await call('/api/admin/users/password',{...body,email:'us@twouring.com'},superToken)).status,400);
 const created=await call('/api/admin/users/password',body,superToken);assert.equal(created.status,200);assert.deepEqual(created.body.user.brands,[]);assert.equal(created.body.user.admin,true);assert.equal(created.body.user.email,'new@example.test');
 const user=users.find(u=>u.email==='new@example.test');assert.equal(user.is_admin,true);assert.equal(user.admin_brand,null);assert.match(user.admin_password_hash,/^scrypt\$/);assert.ok(!JSON.stringify(created.body).includes(user.admin_password_hash));
 assert.equal((await call('/api/auth/admin/password',{email:user.email,password:body.password})).status,200);
 const rotated=await call('/api/admin/users/password',{...body,password:'rotated-test-only-password'},superToken);assert.equal(rotated.status,200);assert.equal(users.filter(u=>u.email===user.email).length,1);
 assert.equal((await call('/api/auth/admin/password',{email:user.email,password:body.password})).status,401);
 assert.equal((await call('/api/auth/admin/password',{email:user.email,password:'rotated-test-only-password'})).status,200);
});
test('admin login offers accessible password form alongside Google; organizers keep magic links',()=>{
 const html=readFileSync(path.join(root,'public/admin.html'),'utf8');
 const source=html.slice(html.indexOf('function renderLogin('),html.indexOf('/* ---------- CSV'));
 assert.match(source,/id="admin-password-login"/);
 assert.match(source,/autocomplete="username"/);assert.match(source,/autocomplete="current-password"/);
 assert.match(source,/api\('\/auth\/admin\/password'/);
 assert.match(source,/localStorage\.setItem\(KEY/);
 assert.match(source,/if\(!ORGANIZER_PORTAL\)/);
});
test('scrypt hashes are salted, bounded, and verify without accepting malformed hashes',async()=>{
 const {hashPassword,verifyPassword}=require('../lib/admin-password');
 const password='test-only-random-password-42';
 const a=await hashPassword(password),b=await hashPassword(password);
 assert.notEqual(a,b);assert.match(a,/^scrypt\$/);
 assert.equal(await verifyPassword(password,a),true);
 assert.equal(await verifyPassword('incorrect',a),false);
 for(const value of [null,'','scrypt$bad','scrypt$999999$8$1$ab$cd'])assert.equal(await verifyPassword(password,value),false);
 await assert.rejects(()=>hashPassword('short'));
 await assert.rejects(()=>hashPassword('a'.repeat(1025)));
});
