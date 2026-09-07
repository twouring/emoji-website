'use strict';
const crypto=require('node:crypto');

function normalizeHostMessage(value){
 if(typeof value!=='string')throw Error('訊息需為 1–5000 字。');const message=value.trim();
 if(!message||message.length>5000)throw Error('訊息需為 1–5000 字。');
 return message;
}

function hostContactMail({event,sender,message,origin}){
 const text=`活動：${event.title}\n來賓：${sender.name}\nEmail：${sender.email}\n\n${message}\n\n${origin}/events/${encodeURIComponent(event.slug)}`,subject=`${sender.name} 詢問「${event.title}」`.replace(/\s+/g,' ').slice(0,160);
 return {to:event.contact_email,replyTo:sender.email,subject,text,idempotencyKey:'event-contact/'+crypto.createHash('sha256').update(`${event.id}\0${sender.id}\0${message}`).digest('hex')};
}

module.exports={normalizeHostMessage,hostContactMail};
