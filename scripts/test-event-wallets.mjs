import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {EventEmitter} from 'node:events';
import wallets from '../lib/event-wallets.js';

const data={origin:'https://www.emoji.tw',secret:'ticket-secret',event:{id:'event-1',slug:'demo',title:'測試活動',location:'台北',starts_at:'2026-10-31T10:00:00.000Z',ends_at:'2026-10-31T12:00:00.000Z',accent:'#FFDE34'},ticket:{serial:'attendee-1',name:'王小明',ticket_name:'一般票',token:'signed-qr-token'}};

test('Google Wallet uses one signed event ticket with the check-in QR',()=>{
 const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),account={client_email:'wallet@example.test',private_key:privateKey.export({type:'pkcs8',format:'pem'})},config=wallets.googleConfig({GOOGLE_WALLET_ISSUER_ID:'123456',GOOGLE_WALLET_SERVICE_ACCOUNT_B64:Buffer.from(JSON.stringify(account)).toString('base64')});
 const url=new URL(wallets.googleWalletUrl(config,data)),parts=url.pathname.split('/').at(-1).split('.'),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
 assert.equal(url.origin,'https://pay.google.com');assert.equal(claims.iss,account.client_email);assert.equal(claims.payload.eventTicketClasses[0].eventName.defaultValue.value,data.event.title);assert.equal(claims.payload.eventTicketObjects[0].barcode.value,data.ticket.token);assert.equal(claims.payload.eventTicketObjects[0].ticketHolderName,data.ticket.name);assert.equal(parts.length,3);
});

test('Google Wallet refreshes issued classes and tickets with a scoped service token',async()=>{
 const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),config=wallets.googleConfig({GOOGLE_WALLET_ISSUER_ID:'123456',GOOGLE_WALLET_SERVICE_ACCOUNT_B64:Buffer.from(JSON.stringify({client_email:'wallet@example.test',private_key:privateKey.export({type:'pkcs8',format:'pem'}),token_uri:'https://oauth.example.test/token'})).toString('base64')}),calls=[];
 const fetcher=async(url,request)=>{calls.push({url:String(url),request});return String(url).includes('/token')?{ok:true,json:async()=>({access_token:'access-token'})}:{ok:true,status:200,json:async()=>({})};};
 const out=await wallets.updateGoogleWallet(config,data,fetcher);assert.equal(out.updated,true);assert.equal(calls.length,3);assert.equal(calls[0].url,'https://oauth.example.test/token');assert.match(String(calls[0].request.body),/jwt-bearer/);assert.match(calls[1].url,/eventTicketClass/);assert.match(calls[2].url,/eventTicketObject/);assert.equal(JSON.parse(calls[2].request.body).barcode.value,data.ticket.token);assert.equal(calls[2].request.headers.authorization,'Bearer access-token');
 calls.length=0;await wallets.expireGoogleWallet(config,data.ticket.serial,fetcher);assert.equal(JSON.parse(calls[1].request.body).state,'EXPIRED');
});

test('Apple Wallet pass metadata keeps event facts and the same check-in QR',()=>{
 const pass=wallets.applePassJSON({passTypeIdentifier:'pass.tw.emoji.events',teamIdentifier:'TEAM123'},data);
 assert.equal(pass.serialNumber,data.ticket.serial);assert.equal(pass.eventTicket.primaryFields[0].value,data.event.title);assert.equal(pass.eventTicket.auxiliaryFields[0].value,data.event.location);assert.equal(pass.eventTicket.auxiliaryFields[1].value,data.ticket.name);assert.equal(pass.barcodes[0].message,data.ticket.token);assert.equal(new URL(pass.webServiceURL).pathname,'/api/wallet/apple');assert.ok(pass.authenticationToken.length>=16);
 assert.equal(wallets.verifyAppleToken(data.secret,data.ticket.serial,'ApplePass '+pass.authenticationToken),true);assert.equal(wallets.verifyAppleToken(data.secret,data.ticket.serial,'ApplePass wrong'),false);
});

test('Apple Wallet sends one silent APNs update per registered device',async()=>{
 const headers=[],clientFactory=()=>({request(value){headers.push(value);const request=new EventEmitter();request.end=()=>queueMicrotask(()=>{request.emit('response',{':status':200});request.emit('close');});return request;},close(){}});
 const result=await wallets.notifyAppleDevices({passTypeIdentifier:'pass.tw.emoji.events',signerCert:Buffer.from('cert'),signerKey:Buffer.from('key')},['a'.repeat(64),'b'.repeat(64)],clientFactory);
 assert.deepEqual(result,{sent:2,failed:[]});assert.equal(headers.length,2);assert.equal(headers[0]['apns-topic'],'pass.tw.emoji.events');assert.match(headers[0][':path'],/^\/3\/device\/[a-f0-9]{64}$/);
});

test('wallet providers stay disabled until every required credential exists',()=>{
 assert.equal(wallets.googleConfig({}),null);assert.equal(wallets.appleConfig({}),null);
});
