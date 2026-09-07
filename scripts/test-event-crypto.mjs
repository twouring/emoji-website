import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{Wallet}=require('ethers'),crypto=require('../lib/event-crypto');

const base58=bytes=>{const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+Buffer.from(bytes).toString('hex')),out='';while(n){out=alphabet[Number(n%58n)]+out;n/=58n;}for(const byte of bytes){if(byte)break;out='1'+out;}return out||'1';};

test('wallet signatures and Ethereum token gates are verified',async()=>{
 const wallet=Wallet.createRandom(),gate=crypto.normalizeTokenGate({enabled:true,type:'erc20',contract:'0x0000000000000000000000000000000000000001',name:'Community Token',minimum:'1.5',decimals:18});
 assert.equal(gate.minimum,'1.5');assert.deepEqual(crypto.normalizeTokenGate(),{enabled:false});assert.throws(()=>crypto.normalizeTokenGate({...gate,contract:'bad'}),/合約地址/);assert.throws(()=>crypto.normalizeTokenGate({...gate,minimum:'0'}),/最低持有量/);assert.throws(()=>crypto.normalizeTokenGate({...gate,minimum:'1.0000000000000000001'}),/最低持有量/);
 const proof={p:'event-crypto',e:'ev_one',c:'ethereum',a:wallet.address,n:'once'},message=crypto.challengeMessage({event:proof.e,chain:proof.c,address:proof.a,nonce:proof.n}),signature=await wallet.signMessage(message);
 assert.deepEqual(crypto.verifyEthereum({token:'proof',signature},proof.e,()=>proof),{chain:'ethereum',address:wallet.address});
 assert.throws(()=>crypto.verifyEthereum({token:'proof',signature},'other',()=>proof),/失效/);
 const savedFetch=global.fetch;
 try{global.fetch=async()=>({ok:true,json:async()=>({result:'0x14d1120d7b160000'})});assert.equal((await crypto.tokenBalance(gate,wallet.address,'https://rpc.example.test')).eligible,true);global.fetch=async()=>({ok:true,json:async()=>({result:'0x1'})});assert.equal((await crypto.tokenBalance(gate,wallet.address,'https://rpc.example.test')).eligible,false);}finally{global.fetch=savedFetch;}
 try{const nft={...gate,type:'erc721',minimum:'1',decimals:0};global.fetch=async(_url,request)=>{assert.match(JSON.parse(request.body).params[0].data,/^0x6352211e0{63}7$/);return {ok:true,json:async()=>({result:'0x'+wallet.address.slice(2).padStart(64,'0')})};};assert.deepEqual(await crypto.tokenBalance(nft,wallet.address,'https://rpc.example.test','7'),{eligible:true,token_id:'7'});await assert.rejects(()=>crypto.tokenBalance(nft,wallet.address,'https://rpc.example.test','bad'),/Token ID/);await assert.rejects(()=>crypto.tokenBalance(nft,wallet.address,'https://rpc.example.test',(2n**256n).toString()),/Token ID/);}finally{global.fetch=savedFetch;}
 await assert.rejects(()=>crypto.tokenBalance(gate,wallet.address,''),/尚未設定/);
 const {publicKey,privateKey}=generateKeyPairSync('ed25519'),address=base58(publicKey.export({format:'der',type:'spki'}).subarray(-32)),solanaProof={p:'event-crypto',e:'ev_one',c:'solana',a:address,n:'solana-once'},solanaMessage=crypto.challengeMessage({event:solanaProof.e,chain:solanaProof.c,address,nonce:solanaProof.n}),solanaSignature=sign(null,Buffer.from(solanaMessage),privateKey).toString('base64');
 assert.equal(crypto.solanaAddress(address),address);assert.deepEqual(crypto.verifySolana({token:'proof',signature:solanaSignature},'ev_one',()=>solanaProof),{chain:'solana',address});assert.throws(()=>crypto.verifySolana({token:'proof',signature:Buffer.from('bad').toString('base64')},'ev_one',()=>solanaProof),/簽名/);assert.throws(()=>crypto.solanaAddress('bad'),/地址/);
});

test('event UI configures and submits token-gated tickets',()=>{
 const fs=require('node:fs'),admin=fs.readFileSync(new URL('../public/admin.html',import.meta.url),'utf8'),events=fs.readFileSync(new URL('../public/events.html',import.meta.url),'utf8');
 assert.match(admin,/data-token-enabled/);assert.match(admin,/data-token-contract/);assert.match(admin,/同一錢包每場活動只能報名一次/);assert.match(admin,/data-ticket-remove/);assert.match(admin,/tickets\.splice/);
 assert.match(admin,/rs-wallet-ethereum/);assert.match(admin,/rs-wallet-solana/);assert.match(admin,/NFT Token ID/);assert.match(events,/id="ethereum-connect"/);assert.match(events,/id="solana-connect"/);assert.match(events,/id="nft-token-label"/);assert.match(events,/personal_sign/);assert.match(events,/solana_wallet_proof:data\.get/);assert.match(events,/nft_token_id'\]\.map/);
});
