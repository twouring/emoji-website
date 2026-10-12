'use strict';

const crypto = require('node:crypto');

const groups = {
  '付款': [
    ['STRIPE_SECRET_KEY','Stripe Secret Key',1],['STRIPE_WEBHOOK_SECRET','Stripe Webhook Secret',1],
    ['TAPPAY_APP_ID','TapPay App ID'],['TAPPAY_APP_KEY','TapPay App Key'],['TAPPAY_PARTNER_KEY','TapPay Partner Key',1],['TAPPAY_MERCHANT_ID','TapPay Merchant ID'],['TAPPAY_ENV','TapPay 環境（sandbox／production）'],
  ],
  '電子發票與 LINE Pay 對帳': [
    ['EZPAY_INVOICE_MERCHANT_ID','ezPay 電子發票商店代號'],['EZPAY_INVOICE_HASH_KEY','ezPay HashKey（32 碼）',1],['EZPAY_INVOICE_HASH_IV','ezPay HashIV（16 碼）',1],
    ['EZPAY_INVOICE_VERSION','ezPay API 版本（預設 1.5）'],['EZPAY_INVOICE_ISSUE_URL','ezPay 開立網址（測試環境才需填）'],['EZPAY_INVOICE_INVALID_URL','ezPay 作廢網址（測試環境才需填）'],
    ['LINEPAY_MERCHANT_ID','LINE Pay 商家後台帳號'],['LINEPAY_MERCHANT_PW','LINE Pay 商家後台密碼',1],['LINEPAY_API_VERSION','LINE Pay 後台 API 版本（後台改版時才需填）'],
  ],
  '寄信': [
    ['RESEND_API_KEY','Resend API Key',1],['RESEND_WEBHOOK_SECRET','Resend Webhook Secret',1],
    ['MAIL_FROM','寄件者'],['NOTIFY_EMAIL','系統通知收件信箱'],
  ],
  '登入與線上會議': [
    ['GOOGLE_CLIENT_ID','Google Client ID'],['GOOGLE_CLIENT_SECRET','Google Client Secret',1],
    ['GOOGLE_MEET_CLIENT_ID','Google Meet Client ID'],['GOOGLE_MEET_CLIENT_SECRET','Google Meet Client Secret',1],
    ['ZOOM_CLIENT_ID','Zoom Client ID'],['ZOOM_CLIENT_SECRET','Zoom Client Secret',1],
  ],
  '簡訊與推播': [
    ['TWILIO_ACCOUNT_SID','Twilio Account SID',1],['TWILIO_AUTH_TOKEN','Twilio Auth Token',1],
    ['TWILIO_VERIFY_SERVICE_SID','Twilio Verify Service SID'],['TWILIO_MESSAGING_SERVICE_SID','Twilio Messaging Service SID'],
    ['TWILIO_SMS_FROM','Twilio SMS 寄件號碼'],['TWILIO_WHATSAPP_FROM','Twilio WhatsApp 寄件號碼'],['TWILIO_WHATSAPP_CONTENT_SID','Twilio WhatsApp Content SID'],
    ['WEB_PUSH_VAPID_PUBLIC_KEY','Web Push VAPID Public Key'],['WEB_PUSH_VAPID_PRIVATE_KEY','Web Push VAPID Private Key',1],['WEB_PUSH_SUBJECT','Web Push Subject'],
  ],
  '電子票券': [
    ['GOOGLE_WALLET_ISSUER_ID','Google Wallet Issuer ID'],['GOOGLE_WALLET_SERVICE_ACCOUNT_B64','Google Wallet 服務帳號（Base64）',1],
    ['APPLE_WALLET_PASS_TYPE_ID','Apple Wallet Pass Type ID'],['APPLE_WALLET_TEAM_ID','Apple Wallet Team ID'],
    ['APPLE_WALLET_WWDR_B64','Apple WWDR 憑證（Base64）',1],['APPLE_WALLET_SIGNER_CERT_B64','Apple 簽署憑證（Base64）',1],
    ['APPLE_WALLET_SIGNER_KEY_B64','Apple 簽署私鑰（Base64）',1],['APPLE_WALLET_SIGNER_KEY_PASSPHRASE','Apple 私鑰密碼',1],
  ],
  '社群、AI 與檔案': [
    ['IG_ACCESS_TOKEN','Instagram Access Token',1],['IG_USER_ID','Instagram User ID'],['IG_AUTOPUBLISH','Instagram 自動發布（0／1）'],
    ['IG_WEEKLY_TARGET','Instagram 每週目標'],['IG_AI_MODEL','AI 模型'],['IG_AI_PHRASES','AI 慣用語清單'],['IG_BANNED_WORDS','禁用詞清單'],['IG_MAX_EMOJI','每篇 Emoji 上限'],
    ['ANTHROPIC_API_KEY','Anthropic API Key',1],['ANTHROPIC_BASE_URL','Anthropic API 網址'],
    ['S3_ENDPOINT','S3 Endpoint'],['S3_BUCKET','S3 Bucket'],['S3_REGION','S3 Region'],
    ['S3_ACCESS_KEY','S3 Access Key',1],['S3_SECRET_KEY','S3 Secret Key',1],
  ],
  '活動與會員': [
    ['ACCESS_QR_SECRET','會員進出 QR 簽章密鑰',1],['ACCESS_DOOR_SECRET','門禁掃描密鑰',1],['EVENT_QR_SECRET','活動票券 QR 簽章密鑰',1],
    ['ETHEREUM_RPC_URL','Ethereum RPC 網址',1],['MAX_PARTICIPANTS','創始會員名額'],['MEMBERSHIP_START','創始會籍起算日'],['SALE_END','創始會員售止日'],['MEMBER_URL','會員頁網址'],
  ],
};

const settings = Object.entries(groups).flatMap(([group, rows]) => rows.map(([key,label,secret=false]) => ({key,label,group,secret:!!secret})));
const byKey = new Map(settings.map(item => [item.key,item]));
const blocked = ['DATABASE_URL','POSTGRES_CONNECTION_STRING','POSTGRES_HOST','POSTGRES_PORT','POSTGRES_USERNAME','POSTGRES_PASSWORD','POSTGRES_DATABASE','POSTGRES_DB','PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSL','APP_SECRET','PII_KEY','ADMIN_API_KEY','SUPER_ADMIN_EMAIL','PUBLIC_ORIGIN','WEB_ORIGINS','NODE_ENV','PORT','TRUST_PROXY_HOPS'];

function keyFor(appSecret) {
  if (!appSecret || appSecret === 'dev-insecure-secret-change-me') throw Object.assign(Error('請先在部署環境設定 APP_SECRET。'),{status:503});
  return crypto.createHash('sha256').update('emoji-system-settings:'+appSecret).digest();
}
function encrypt(key,value,appSecret) {
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',keyFor(appSecret),iv);cipher.setAAD(Buffer.from(key));
  const body=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');
}
function decrypt(key,value,appSecret) {
  const [version,iv,tag,body]=String(value).split('.');if(version!=='v1'||!iv||!tag||body===undefined)throw Error('系統設定密文格式錯誤。');
  const decipher=crypto.createDecipheriv('aes-256-gcm',keyFor(appSecret),Buffer.from(iv,'base64url'));decipher.setAAD(Buffer.from(key));decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body,'base64url')),decipher.final()]).toString('utf8');
}
function validate(key,input) {
  if(!byKey.has(key))throw Object.assign(Error('未知的系統設定。'),{status:400});
  if(typeof input!=='string'||input.includes('\0')||Buffer.byteLength(input)>100000)throw Object.assign(Error('設定內容格式不正確或過長。'),{status:400});
  const value=input.trim();
  if(key==='TAPPAY_ENV'&&value&&!['sandbox','production'].includes(value))throw Object.assign(Error('請填 sandbox 或 production。'),{status:400});
  if(['IG_AUTOPUBLISH'].includes(key)&&!/^[01]$/.test(value))throw Object.assign(Error('請填 0 或 1。'),{status:400});
  if(['MAX_PARTICIPANTS','IG_WEEKLY_TARGET','IG_MAX_EMOJI'].includes(key)&&(!/^\d+$/.test(value)||Number(value)>100000))throw Object.assign(Error('請填 0 至 100000 的整數。'),{status:400});
  if(['MEMBERSHIP_START','SALE_END'].includes(key)&&!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Object.assign(Error('請使用 YYYY-MM-DD 日期格式。'),{status:400});
  if(['ANTHROPIC_BASE_URL','S3_ENDPOINT','MEMBER_URL','ETHEREUM_RPC_URL','EZPAY_INVOICE_ISSUE_URL','EZPAY_INVOICE_INVALID_URL'].includes(key)&&value&&!/^https?:\/\//.test(value))throw Object.assign(Error('網址必須以 http:// 或 https:// 開頭。'),{status:400});
  // ezPay 用 AES-256-CBC：HashKey 必須 32 碼、HashIV 必須 16 碼，長度錯了要到結帳開發票那一刻才會炸，所以存檔時就擋
  if(key==='EZPAY_INVOICE_MERCHANT_ID'&&!/^[A-Za-z0-9]{1,20}$/.test(value))throw Object.assign(Error('商店代號只能是英數字。'),{status:400});
  if(key==='EZPAY_INVOICE_HASH_KEY'&&Buffer.byteLength(value)!==32)throw Object.assign(Error('ezPay HashKey 必須是 32 碼。'),{status:400});
  if(key==='EZPAY_INVOICE_HASH_IV'&&Buffer.byteLength(value)!==16)throw Object.assign(Error('ezPay HashIV 必須是 16 碼。'),{status:400});
  if(key==='EZPAY_INVOICE_VERSION'&&!/^\d+(\.\d+)?$/.test(value))throw Object.assign(Error('API 版本格式如 1.5。'),{status:400});
  return value;
}
// 執行時才讀 process.env 的設定：後台存檔後由各服務定時重新載入即可生效，不用重新部署
const live=new Set(['EZPAY_INVOICE_MERCHANT_ID','EZPAY_INVOICE_HASH_KEY','EZPAY_INVOICE_HASH_IV','EZPAY_INVOICE_VERSION','EZPAY_INVOICE_ISSUE_URL','EZPAY_INVOICE_INVALID_URL','LINEPAY_MERCHANT_ID','LINEPAY_MERCHANT_PW','LINEPAY_API_VERSION']);
function isLive(key){return live.has(key);}
function describe(rows,env=process.env,appSecret=env.APP_SECRET) {
  const stored=new Map(rows.map(row=>[row.key,row]));
  return settings.map(item=>{const row=stored.get(item.key),fromDb=!!row,configured=fromDb||!!env[item.key];return {...item,live:isLive(item.key),configured,source:fromDb?'database':env[item.key]?'environment':'none',value:item.secret?'':fromDb?decrypt(item.key,row.value,appSecret):(env[item.key]||'')};});
}
function apply(rows,env=process.env,appSecret=env.APP_SECRET) { for(const row of rows)if(byKey.has(row.key))env[row.key]=decrypt(row.key,row.value,appSecret);return env; }
/* 定時重新載入：後台存檔後，兩個 Cloud Run 服務（官網／POS 與後台）都在下一輪套用。
 * 只處理 live 鍵：資料庫有值就覆蓋，資料庫清掉就恢復成啟動時的部署環境值（baseline 由第一次呼叫記下）。 */
let baselineEnv=null;
function snapshotBaseline(env=process.env){baselineEnv=Object.fromEntries([...live].map(k=>[k,env[k]]));return baselineEnv;}
function refresh(rows,env=process.env,appSecret=env.APP_SECRET,baseline=baselineEnv||snapshotBaseline(env)) {
  const stored=new Map(rows.filter(row=>live.has(row.key)).map(row=>[row.key,row]));
  for(const key of live){const row=stored.get(key);const next=row?decrypt(key,row.value,appSecret):baseline[key];if(next===undefined)delete env[key];else env[key]=next;}
  return env;
}

module.exports={settings,byKey,blocked,live,isLive,encrypt,decrypt,validate,describe,apply,snapshotBaseline,refresh};
