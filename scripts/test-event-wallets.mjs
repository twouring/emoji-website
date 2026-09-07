import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import wallets from '../lib/event-wallets.js';

const data={origin:'https://www.emoji.tw',secret:'ticket-secret',event:{id:'event-1',slug:'demo',title:'測試活動',location:'台北',starts_at:'2026-10-31T10:00:00.000Z',ends_at:'2026-10-31T12:00:00.000Z',accent:'#FFDE34'},ticket:{serial:'attendee-1',name:'王小明',ticket_name:'一般票',token:'signed-qr-token'}};

test('Google Wallet uses one signed event ticket with the check-in QR',()=>{
 const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),account={client_email:'wallet@example.test',private_key:privateKey.export({type:'pkcs8',format:'pem'})},config=wallets.googleConfig({GOOGLE_WALLET_ISSUER_ID:'123456',GOOGLE_WALLET_SERVICE_ACCOUNT_B64:Buffer.from(JSON.stringify(account)).toString('base64')});
 const url=new URL(wallets.googleWalletUrl(config,data)),parts=url.pathname.split('/').at(-1).split('.'),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
 assert.equal(url.origin,'https://pay.google.com');assert.equal(claims.iss,account.client_email);assert.equal(claims.payload.eventTicketClasses[0].eventName.defaultValue.value,data.event.title);assert.equal(claims.payload.eventTicketObjects[0].barcode.value,data.ticket.token);assert.equal(claims.payload.eventTicketObjects[0].ticketHolderName,data.ticket.name);assert.equal(parts.length,3);
});

test('Apple Wallet pass metadata keeps event facts and the same check-in QR',()=>{
 const pass=wallets.applePassJSON({passTypeIdentifier:'pass.tw.emoji.events',teamIdentifier:'TEAM123'},data);
 assert.equal(pass.serialNumber,data.ticket.serial);assert.equal(pass.eventTicket.primaryFields[0].value,data.event.title);assert.equal(pass.eventTicket.auxiliaryFields[0].value,data.event.location);assert.equal(pass.eventTicket.auxiliaryFields[1].value,data.ticket.name);assert.equal(pass.barcodes[0].message,data.ticket.token);assert.equal(new URL(pass.webServiceURL).pathname,'/api/wallet/apple');assert.ok(pass.authenticationToken.length>=16);
});

test('wallet providers stay disabled until every required credential exists',()=>{
 assert.equal(wallets.googleConfig({}),null);assert.equal(wallets.appleConfig({}),null);
});
