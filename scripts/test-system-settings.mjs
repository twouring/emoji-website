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
  assert.deepEqual(shown.find(x=>x.key==='STRIPE_SECRET_KEY'),{key:'STRIPE_SECRET_KEY',label:'Stripe Secret Key',group:'付款',secret:true,live:false,configured:true,source:'database',value:''});
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

test('ezPay invoice and LINE Pay credentials are managed from the back office and reload without restart',()=>{
  for(const key of ['EZPAY_INVOICE_MERCHANT_ID','EZPAY_INVOICE_HASH_KEY','EZPAY_INVOICE_HASH_IV','LINEPAY_MERCHANT_ID','LINEPAY_MERCHANT_PW'])assert.ok(settings.byKey.has(key),key);
  assert.equal(settings.byKey.get('EZPAY_INVOICE_HASH_KEY').secret,true);
  assert.equal(settings.byKey.get('LINEPAY_MERCHANT_PW').secret,true);
  assert.equal(settings.byKey.get('EZPAY_INVOICE_MERCHANT_ID').secret,false);
  assert.ok(settings.isLive('EZPAY_INVOICE_HASH_KEY'));assert.ok(settings.isLive('LINEPAY_MERCHANT_PW'));assert.ok(!settings.isLive('STRIPE_SECRET_KEY'));
  // AES-256-CBC 長度在存檔時就擋，不要等到結帳才炸
  assert.equal(settings.validate('EZPAY_INVOICE_HASH_KEY','k'.repeat(32)),'k'.repeat(32));
  assert.throws(()=>settings.validate('EZPAY_INVOICE_HASH_KEY','k'.repeat(31)),/32 碼/);
  assert.equal(settings.validate('EZPAY_INVOICE_HASH_IV','i'.repeat(16)),'i'.repeat(16));
  assert.throws(()=>settings.validate('EZPAY_INVOICE_HASH_IV','i'.repeat(17)),/16 碼/);
  assert.throws(()=>settings.validate('EZPAY_INVOICE_MERCHANT_ID','36 22'));
  assert.throws(()=>settings.validate('EZPAY_INVOICE_ISSUE_URL','cinv.ezpay.com.tw/Api/invoice_issue'));
  assert.throws(()=>settings.validate('EZPAY_INVOICE_VERSION','v1.5'));
  // 定時重載：DB 有值就覆蓋、DB 清掉就恢復部署環境值，非 live 鍵不碰
  const env={APP_SECRET:secret,EZPAY_INVOICE_MERCHANT_ID:'env-id',STRIPE_SECRET_KEY:'stripe-env'};
  settings.snapshotBaseline(env);
  settings.refresh([{key:'EZPAY_INVOICE_MERCHANT_ID',value:settings.encrypt('EZPAY_INVOICE_MERCHANT_ID','db-id',secret)},{key:'EZPAY_INVOICE_HASH_KEY',value:settings.encrypt('EZPAY_INVOICE_HASH_KEY','k'.repeat(32),secret)},{key:'STRIPE_SECRET_KEY',value:settings.encrypt('STRIPE_SECRET_KEY','stripe-db',secret)}],env,secret);
  assert.equal(env.EZPAY_INVOICE_MERCHANT_ID,'db-id');assert.equal(env.EZPAY_INVOICE_HASH_KEY,'k'.repeat(32));assert.equal(env.STRIPE_SECRET_KEY,'stripe-env');
  settings.refresh([],env,secret);
  assert.equal(env.EZPAY_INVOICE_MERCHANT_ID,'env-id');assert.equal('EZPAY_INVOICE_HASH_KEY' in env,false);
  assert.equal(settings.describe([],env,secret).find(x=>x.key==='EZPAY_INVOICE_HASH_IV').live,true);
  const server=readFileSync(new URL('../server.js',import.meta.url),'utf8'),bootstrap=readFileSync(new URL('../bootstrap.js',import.meta.url),'utf8');
  assert.match(bootstrap,/snapshotBaseline\(\);systemSettings\.apply\(rows\)/,'開機先記部署環境 baseline 再套 DB 覆寫');
  assert.match(server,/setInterval\(\(\) => refreshLiveSettings\(\)[\s\S]{0,200}\n[\s\S]{0,400}if \(ADMIN_MODE\) \{/,'live 設定重載必須在 ADMIN_MODE return 之前，後台服務也要跑');
  assert.match(server,/restart_required:!live/);
  assert.match(server,/schedule\('30 4 \* \* \*', \(\) => cronRunner\.run\('linepay-daily'\)/,'LINE Pay 排程一律掛上');
  assert.match(server,/cronRunner\.define\('linepay-daily',[^\n]*\n\s*\{ enabled: \(\) => linepay\.configured\(\)/,'LINE Pay 帳密在執行時才檢查');
  assert.match(server,/async function refreshLiveSettings\(\)\{[^\n]*liveSettings\.markFresh\(\);\}/,'手動重載後重設 lazy 重載計時');
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
