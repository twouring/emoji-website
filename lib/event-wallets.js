const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const http2=require('node:http2');
const {PKPass}=require('passkit-generator');

const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex').slice(0,32);
const localized=value=>({defaultValue:{language:'zh-TW',value:String(value||'—')}});
const b64url=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');

function googleConfig(env=process.env){
 try{const account=JSON.parse(Buffer.from(env.GOOGLE_WALLET_SERVICE_ACCOUNT_B64||'','base64').toString());return env.GOOGLE_WALLET_ISSUER_ID&&account.client_email&&account.private_key?{issuerId:env.GOOGLE_WALLET_ISSUER_ID,account}:null;}catch{return null;}
}
function googleWalletUrl(config,{event,ticket,origin}){
 const {eventClass,eventObject}=googleObjects(config,{event,ticket,origin});
 const claims={iss:config.account.client_email,aud:'google',typ:'savetowallet',iat:Math.floor(Date.now()/1000),origins:[new URL(origin).origin],payload:{eventTicketClasses:[eventClass],eventTicketObjects:[eventObject]}};
 const input=b64url({alg:'RS256',typ:'JWT'})+'.'+b64url(claims),signature=crypto.sign('RSA-SHA256',Buffer.from(input),config.account.private_key).toString('base64url');
 return 'https://pay.google.com/gp/v/save/'+input+'.'+signature;
}
function googleObjects(config,{event,ticket,origin}){const classId=`${config.issuerId}.event_${hash(event.id)}`,objectId=`${config.issuerId}.ticket_${hash(ticket.serial)}`;return {classId,objectId,eventClass:{id:classId,issuerName:'言文字',eventName:localized(event.title),venue:{name:localized(event.location),address:localized(event.location)},dateTime:{start:new Date(event.starts_at).toISOString(),...(event.ends_at?{end:new Date(event.ends_at).toISOString()}:{})},reviewStatus:'UNDER_REVIEW',hexBackgroundColor:event.accent||'#FFDE34',logo:{sourceUri:{uri:new URL('/logo.png',origin).href},contentDescription:localized('言文字')}},eventObject:{id:objectId,classId,state:'ACTIVE',ticketHolderName:ticket.name,ticketNumber:ticket.serial,ticketType:localized(ticket.ticket_name||event.title),barcode:{type:'QR_CODE',value:ticket.token,alternateText:ticket.serial}}};}
async function googleAccessToken(config,fetcher=fetch){const now=Math.floor(Date.now()/1000),claims={iss:config.account.client_email,scope:'https://www.googleapis.com/auth/wallet_object.issuer',aud:config.account.token_uri||'https://oauth2.googleapis.com/token',iat:now,exp:now+3600},input=b64url({alg:'RS256',typ:'JWT'})+'.'+b64url(claims),assertion=input+'.'+crypto.sign('RSA-SHA256',Buffer.from(input),config.account.private_key).toString('base64url'),response=await fetcher(claims.aud,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})}),body=await response.json().catch(()=>({}));if(!response.ok||!body.access_token)throw Error('Google Wallet 授權失敗。');return body.access_token;}
async function googlePatch(kind,id,body,token,fetcher){const response=await fetcher(`https://walletobjects.googleapis.com/walletobjects/v1/${kind}/`+encodeURIComponent(id),{method:'PATCH',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});if(!response.ok&&response.status!==404)throw Error('Google Wallet 票券更新失敗。');return response.status;}
async function updateGoogleWallet(config,data,fetcher=fetch){const {classId,objectId,eventClass,eventObject}=googleObjects(config,data),token=await googleAccessToken(config,fetcher),classStatus=await googlePatch('eventTicketClass',classId,eventClass,token,fetcher),objectStatus=await googlePatch('eventTicketObject',objectId,eventObject,token,fetcher);return {updated:objectStatus>=200&&objectStatus<300,classStatus,objectStatus,objectId};}
async function expireGoogleWallet(config,serial,fetcher=fetch){const objectId=`${config.issuerId}.ticket_${hash(serial)}`,token=await googleAccessToken(config,fetcher),status=await googlePatch('eventTicketObject',objectId,{state:'EXPIRED'},token,fetcher);return {updated:status>=200&&status<300,status,objectId};}

function appleConfig(env=process.env){
 const keys=['APPLE_WALLET_PASS_TYPE_ID','APPLE_WALLET_TEAM_ID','APPLE_WALLET_WWDR_B64','APPLE_WALLET_SIGNER_CERT_B64','APPLE_WALLET_SIGNER_KEY_B64'];if(keys.some(key=>!env[key]))return null;
 return {passTypeIdentifier:env.APPLE_WALLET_PASS_TYPE_ID,teamIdentifier:env.APPLE_WALLET_TEAM_ID,wwdr:Buffer.from(env.APPLE_WALLET_WWDR_B64,'base64'),signerCert:Buffer.from(env.APPLE_WALLET_SIGNER_CERT_B64,'base64'),signerKey:Buffer.from(env.APPLE_WALLET_SIGNER_KEY_B64,'base64'),signerKeyPassphrase:env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE||undefined};
}
function applePassJSON(config,{event,ticket,origin,secret}){
 const labels={date:'日期',location:'地點',holder:'參加者',ticket:'票種',host:'主辦單位'};
 return {formatVersion:1,passTypeIdentifier:config.passTypeIdentifier,teamIdentifier:config.teamIdentifier,serialNumber:ticket.serial,organizationName:'言文字',description:event.title,logoText:'言文字',backgroundColor:'rgb(255, 222, 52)',foregroundColor:'rgb(28, 28, 26)',labelColor:'rgb(28, 28, 26)',relevantDate:new Date(event.starts_at).toISOString(),...(event.ends_at?{expirationDate:new Date(event.ends_at).toISOString()}:{}),webServiceURL:new URL('/api/wallet/apple',origin).href,authenticationToken:crypto.createHmac('sha256',secret).update(ticket.serial).digest('hex'),eventTicket:{headerFields:[{key:'ticket',label:labels.ticket,value:ticket.ticket_name||event.title}],primaryFields:[{key:'event',label:'活動',value:event.title}],secondaryFields:[{key:'date',label:labels.date,value:new Date(event.starts_at).toISOString(),dateStyle:'PKDateStyleMedium',timeStyle:'PKDateStyleShort'}],auxiliaryFields:[{key:'location',label:labels.location,value:event.location||'—'},{key:'holder',label:labels.holder,value:ticket.name}],backFields:[{key:'host',label:labels.host,value:'言文字'},{key:'website',label:'活動頁',value:new URL('/events/'+encodeURIComponent(event.slug),origin).href}]},barcodes:[{format:'PKBarcodeFormatQR',message:ticket.token,messageEncoding:'iso-8859-1',altText:ticket.serial}]};
}
const appleToken=(secret,serial)=>crypto.createHmac('sha256',secret).update(serial).digest('hex');
function verifyAppleToken(secret,serial,authorization){const expected='ApplePass '+appleToken(secret,serial),actual=String(authorization||'');return actual.length===expected.length&&crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected));}
async function appleWalletPass(config,data){
 const assets=path.join(__dirname,'../public/assets/wallet'),buffers={'icon.png':fs.readFileSync(path.join(assets,'icon.png')),'icon@2x.png':fs.readFileSync(path.join(assets,'icon@2x.png')),'icon@3x.png':fs.readFileSync(path.join(assets,'icon@3x.png')),'pass.json':Buffer.from(JSON.stringify(applePassJSON(config,data)))};
 return new PKPass(buffers,{wwdr:config.wwdr,signerCert:config.signerCert,signerKey:config.signerKey,signerKeyPassphrase:config.signerKeyPassphrase}).getAsBuffer();
}
async function notifyAppleDevices(config,pushTokens,clientFactory=http2.connect){if(!pushTokens.length)return {sent:0,failed:[]};const client=clientFactory('https://api.push.apple.com',{cert:config.signerCert,key:config.signerKey,passphrase:config.signerKeyPassphrase}),failed=[];try{await Promise.all(pushTokens.map(token=>new Promise(resolve=>{const request=client.request({':method':'POST',':path':'/3/device/'+token,'apns-topic':config.passTypeIdentifier});let status=0,done=false;const finish=()=>{if(done)return;done=true;if(status!==200)failed.push(token);resolve();};request.on('response',headers=>{status=Number(headers[':status']);});request.on('error',finish);request.on('close',finish);request.end('{}');})));}finally{client.close();}return {sent:pushTokens.length-failed.length,failed};}

module.exports={googleConfig,googleWalletUrl,googleObjects,googleAccessToken,updateGoogleWallet,expireGoogleWallet,appleConfig,applePassJSON,appleWalletPass,appleToken,verifyAppleToken,notifyAppleDevices};
