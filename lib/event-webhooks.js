'use strict';

const crypto=require('node:crypto');
const dns=require('node:dns');
const http=require('node:http');
const https=require('node:https');
const net=require('node:net');

const EVENT_TYPES=['event.created','event.updated','event.canceled','guest.registered','guest.updated','guest.refunded'];

function blockedIp(address){
 const ip=String(address||'').toLowerCase();
 if(net.isIPv4(ip)){const p=ip.split('.').map(Number),[a,b]=p;return a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===0||b===168)||a===198&&(b===18||b===19)||a===100&&b>=64&&b<=127;}
 if(!net.isIPv6(ip))return true;
 if(ip==='::'||ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||/^fe[89ab]/.test(ip))return true;
 const mapped=/^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);return mapped?blockedIp(mapped[1]):false;
}

function normalizeWebhook(input,{allowLoopback=false}={}){
 let url;try{url=new URL(String(input?.url||'').trim());}catch{return {error:'請填寫有效的 Webhook URL。'};}
 const hostname=url.hostname.replace(/^\[|\]$/g,''),loopback=['localhost','127.0.0.1','::1'].includes(hostname);
 if(url.username||url.password||url.hash||url.href.length>2048)return {error:'Webhook URL 格式不正確。'};
 if(url.protocol!=='https:'&&!(allowLoopback&&loopback&&url.protocol==='http:'))return {error:'Webhook URL 必須使用 HTTPS。'};
 if(hostname.endsWith('.local')||(net.isIP(hostname)&&blockedIp(hostname)&&!(allowLoopback&&loopback))||(loopback&&!allowLoopback))return {error:'Webhook URL 不可指向內部位址。'};
 const events=[...new Set(Array.isArray(input?.events)?input.events:[])];
 if(!events.length||events.some(type=>!EVENT_TYPES.includes(type)))return {error:'請至少選擇一種有效事件。'};
 return {value:{url:url.href,events}};
}

function signature(secret,timestamp,body){return crypto.createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');}

function sendWebhook({url,secret,id,payload},{allowLoopback=false,timeoutMs=5000}={}){
 const parsed=normalizeWebhook({url,events:['event.updated']},{allowLoopback});if(parsed.error)return Promise.reject(Error(parsed.error));
 const target=new URL(parsed.value.url),body=JSON.stringify(payload),timestamp=Math.floor(Date.now()/1000),headers={
  'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'User-Agent':'Emoji-Event-Webhook/1.0',
  'Webhook-Id':id,'Webhook-Timestamp':String(timestamp),'Webhook-Signature':`t=${timestamp},v1=${signature(secret,timestamp,body)}`,
 };
 const options={method:'POST',headers,timeout:timeoutMs};
 if(target.protocol==='https:')options.lookup=(hostname,lookupOptions,callback)=>dns.lookup(hostname,{...lookupOptions,verbatim:true},(error,address,family)=>{if(error)return callback(error);const addresses=Array.isArray(address)?address.map(item=>item.address):[address];return addresses.some(blockedIp)?callback(Error('Webhook URL 解析為內部位址。')):callback(null,address,family);});
 return new Promise((resolve,reject)=>{
  const request=(target.protocol==='https:'?https:http).request(target,options,response=>{let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>4096)response.destroy();});response.on('end',()=>resolve({status:response.statusCode||0}));response.on('error',reject);});
  request.on('timeout',()=>request.destroy(Error('Webhook 逾時。')));request.on('error',reject);request.end(body);
 });
}

module.exports={EVENT_TYPES,blockedIp,normalizeWebhook,signature,sendWebhook};
