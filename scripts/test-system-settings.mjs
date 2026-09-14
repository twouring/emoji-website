import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';

const require=createRequire(import.meta.url);
const settings=require('../lib/system-settings');
const secret='a'.repeat(64);

test('system settings encrypt at rest, mask secrets and reject invalid input',()=>{
  const ciphertext=settings.encrypt('STRIPE_SECRET_KEY','sk_live_private',secret);
  assert.ok(!ciphertext.includes('sk_live_private'));
  assert.equal(settings.decrypt('STRIPE_SECRET_KEY',ciphertext,secret),'sk_live_private');
  assert.throws(()=>settings.decrypt('RESEND_API_KEY',ciphertext,secret));
  const shown=settings.describe([{key:'STRIPE_SECRET_KEY',value:ciphertext}],{APP_SECRET:secret});
  assert.deepEqual(shown.find(x=>x.key==='STRIPE_SECRET_KEY'),{key:'STRIPE_SECRET_KEY',label:'Stripe Secret Key',group:'付款',secret:true,configured:true,source:'database',value:''});
  assert.throws(()=>settings.validate('IG_AUTOPUBLISH','true'));
  assert.throws(()=>settings.validate('MEMBERSHIP_START','2026/11/01'));
  assert.throws(()=>settings.validate('DATABASE_URL','postgres://private'));
});

test('stored settings override process values only after bootstrap load',()=>{
  const env={APP_SECRET:secret,MAIL_FROM:'old@example.test'};
  settings.apply([{key:'MAIL_FROM',value:settings.encrypt('MAIL_FROM','new@example.test',secret)}],env,secret);
  assert.equal(env.MAIL_FROM,'new@example.test');
  assert.ok(settings.blocked.includes('APP_SECRET'));
  assert.ok(settings.blocked.includes('ADMIN_API_KEY'));
});

test('admin routes are super-only and the UI never asks to reveal stored secrets',()=>{
  const server=readFileSync(new URL('../server.js',import.meta.url),'utf8'),admin=readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');
  assert.match(server,/app\.get\('\/api\/admin\/system-settings', auth, adminOnly, superOnly, requireDb/);
  assert.match(server,/app\.post\('\/api\/admin\/system-settings', auth, adminOnly, superOnly, requireDb/);
  assert.match(admin,/id:'system'.*render:tabSystem/);
  assert.match(admin,/d\.super\?'[^']*system-settings-body/);
  assert.match(admin,/type=\"password\" autocomplete=\"new-password\"/);
  assert.doesNotMatch(admin,/data-system-reveal|解密顯示/);
});

test('legacy Instagram token is migrated out of public content into encrypted settings',async()=>{
  const previous=process.env.APP_SECRET;process.env.APP_SECRET=secret;let stored,deleted=false;
  const q=async(sql,args=[])=>{
    if(sql.includes('SELECT value FROM system_settings'))return {rows:[]};
    if(sql.includes("SELECT value FROM site_content"))return {rows:[{value:'legacy-private-token'}]};
    if(sql.includes('INSERT INTO system_settings')){stored=args[1];return {rows:[]};}
    if(sql.includes('DELETE FROM site_content')){deleted=true;return {rows:[]};}
    throw Error(sql);
  };
  try{assert.equal(await require('../lib/ig-publisher').getToken({q}),'legacy-private-token');}
  finally{if(previous===undefined)delete process.env.APP_SECRET;else process.env.APP_SECRET=previous;}
  assert.ok(deleted);assert.ok(stored&&!stored.includes('legacy-private-token'));
  assert.equal(settings.decrypt('IG_ACCESS_TOKEN',stored,secret),'legacy-private-token');
});
