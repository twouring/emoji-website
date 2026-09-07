'use strict';
async function deliverDue(q,send,origin='',unsubscribeSecret=''){
 const providers=typeof send==='function'?{email:send}:send;
 const active=Object.entries(providers||{}).filter(([,value])=>typeof value==='function').map(([key])=>key);
 if(!active.length)return false;
 // Provider idempotency lasts 24h. Never automatically retry an uncertain send beyond 23h.
 const row=(await q(`UPDATE event_deliveries SET state='processing',next_attempt_at=now()+interval '5 minutes',first_attempt_at=COALESCE(first_attempt_at,now())
 WHERE id=(SELECT id FROM event_deliveries WHERE state IN ('queued','processing','retry') AND next_attempt_at<=now() AND COALESCE(channel,'email')=ANY($1) ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *, (SELECT jsonb_build_object('registration_id',m.registration_id,'ticket_version',m.ticket_version,'expected_status',m.expected_status,'event_id',m.event_id,'slug',e.slug,'event_status',e.status,'cancellation_current',m.created_at>=COALESCE((e.event_details->>'cancelled_at')::timestamptz,'-infinity'::timestamptz)) FROM event_messages m JOIN events e ON e.id=m.event_id WHERE m.id=event_deliveries.message_id) AS context`,[active])).rows[0];
 if(!row)return false;
 if(row.id.startsWith('cancellation_')&&(row.context?.event_status!=='已取消'||row.context?.cancellation_current===false)){await q("UPDATE event_deliveries SET state='cancelled',last_error='取消狀態或版本已變更，停止舊取消通知' WHERE id=$1",[row.id]);return true;}
 const category=notificationCategory(row);
 if(category&&row.context?.event_id){const optedOut=(await q(`SELECT 1 FROM event_notification_preferences p JOIN users u ON u.id=p.user_id WHERE p.event_id=$1 AND lower(u.email)=lower($2) AND CASE $3 WHEN 'blasts' THEN NOT p.blasts WHEN 'reminders' THEN NOT p.reminders WHEN 'feedback' THEN NOT p.feedback ELSE false END LIMIT 1`,[row.context.event_id,row.email,category])).rowCount;
 if(optedOut){await q("UPDATE event_deliveries SET state='cancelled',last_error='來賓已停用此類通知' WHERE id=$1",[row.id]);return true;}}
 if(category&&row.channel&&row.channel!=='email'){const preference=(await q('SELECT channels FROM event_notification_preferences p JOIN users u ON u.id=p.user_id WHERE p.event_id=$1 AND lower(u.email)=lower($2)',[row.context.event_id,row.email])).rows[0];if(preference&&preference.channels?.[category]?.[row.channel==='text'?'text':'push']===false){await q("UPDATE event_deliveries SET state='cancelled',last_error='來賓已停用此通知通路' WHERE id=$1",[row.id]);return true;}}
 if(row.context?.registration_id){
  const valid=(await q(`SELECT 1 FROM event_regs r JOIN events e ON e.id=r.event_id WHERE r.id=$1 AND r.ticket_version=$2 AND r.status=COALESCE($3,'registered') AND (e.status<>'已取消' OR $3 IS NOT NULL)
 AND ($4<>'feedback' OR (e.registration_settings->'feedback'->>'enabled'='true' AND NOT EXISTS(SELECT 1 FROM event_feedback f WHERE f.event_id=e.id AND f.user_id=r.user_id)))
 AND ($4<>'reminder' OR COALESCE(e.registration_settings->'reminders','[]'::jsonb) @> $5::jsonb)`,[row.context.registration_id,row.context.ticket_version,row.context.expected_status||null,row.id.startsWith('feedback_')?'feedback':row.id.startsWith('reminder_')?'reminder':'other',JSON.stringify([Number(row.id.split('_').at(-1))])])).rowCount;
  if(!valid){await q("UPDATE event_deliveries SET state='cancelled',last_error='報名或活動已失效，取消自動通知' WHERE id=$1",[row.id]);return true;}
 }
 if(Date.now()-new Date(row.first_attempt_at).getTime()>23*3600000){await q("UPDATE event_deliveries SET state='review_required',last_error='需先向寄信服務核對結果，不能自動重寄' WHERE id=$1",[row.id]);return true;}
 try{
  const unsubscribe=category&&origin&&unsubscribeSecret?origin+'/event-unsubscribe.html#token='+signUnsubscribe(row.id,unsubscribeSecret):null;
  const footer=(unsubscribe?'\n\n取消此類通知 / Unsubscribe / 配信停止\n'+unsubscribe:'')+(category&&origin&&row.context?.slug?'\n\n管理活動通知 / Notification preferences / 通知設定\n'+origin+'/events/'+encodeURIComponent(row.context.slug)+'#notification-settings':'');
  const {mailRichText}=require('./event-rich-text'),{textToHtml}=require('./mail');
  const html=row.body_html?mailRichText(row.body_html,origin)+textToHtml(footer):undefined;
  let out;if(!row.channel||row.channel==='email')out=await providers.email({to:row.email,subject:row.subject,text:row.body+footer,html,attachments:row.attachments||[],idempotencyKey:'event-delivery/'+row.id});
  else if(row.channel==='text'){const invite=String(row.body).match(/https?:\/\/[^\s]+#invite=[^\s]+/)?.[0],body=invite?row.body.replace(invite,'').trim().slice(0,700)+'\n'+invite:row.body.slice(0,900)+'\n'+origin+'/events/'+encodeURIComponent(row.context.slug);out=await providers.text({to:row.recipient,channel:row.provider_channel||'sms',body:row.subject+'\n'+body,statusCallback:origin+'/api/twilio/events/status'});}
  else if(row.channel==='push'){const invite=String(row.body).match(/https?:\/\/[^\s]+#invite=[^\s]+/)?.[0];out=await providers.push(row.push_subscription,{title:row.subject,body:row.body.replace(invite||'','').trim().slice(0,240),url:invite?new URL(invite).pathname+new URL(invite).hash:'/events/'+encodeURIComponent(row.context.slug)});}
  if(!out)throw new Error('通知服務未接受訊息');const providerId=out.id||out.sid||row.id;
  await q("UPDATE event_deliveries SET state='accepted',provider_id=$2,last_error=NULL WHERE id=$1",[row.id,providerId]);
 }catch(e){if(row.channel==='push'&&[404,410].includes(e.statusCode)){await q('DELETE FROM event_push_subscriptions WHERE endpoint=$1',[row.recipient]);await q("UPDATE event_deliveries SET state='failed',last_error='推播訂閱已失效' WHERE id=$1",[row.id]);}else await q("UPDATE event_deliveries SET state='retry',last_error=$2 WHERE id=$1",[row.id,String(e.message).slice(0,500)]);}
 return true;
}
async function queueEventMail(q,{id,eventId,email,subject,body,attachments=[],registrationId=null,ticketVersion=null,expectedStatus=null,emailEnabled=true}){
 return q(`WITH message AS (
 INSERT INTO event_messages(id,event_id,subject,body,audience,state,send_at,registration_id,ticket_version,expected_status) VALUES($1,$2,$4,$5,'registered','scheduled',now(),$7,$8,$9)
 ON CONFLICT(id) DO NOTHING RETURNING id)
 INSERT INTO event_deliveries(id,message_id,email,recipient,channel,subject,body,next_attempt_at,attachments)
 SELECT $1,$1,$3,$3,'email',$4,$5,now(),$6::jsonb FROM message WHERE $10 RETURNING id`,[id,eventId,email,subject,body,JSON.stringify(attachments),registrationId,ticketVersion,expectedStatus,emailEnabled]);
}
async function queueMemberChannels(q,{id,eventId,email,subject,body,category}){const channels=require('./event-channels'),text=channels.twilioConfig(),push=channels.pushConfig();if(!text&&!push)return 0;const defaults={email:true,text:true,push:true},member=(await q(`SELECT u.phone,u.phone_verified_at IS NOT NULL AS phone_verified,u.message_channel,COALESCE(p.channels->$3,$4::jsonb) AS channels,COALESCE((SELECT jsonb_agg(s.subscription) FROM event_push_subscriptions s WHERE s.user_id=u.id),'[]'::jsonb) AS subscriptions FROM users u LEFT JOIN event_notification_preferences p ON p.event_id=$2 AND p.user_id=u.id WHERE lower(u.email)=lower($1)`,[email,eventId,category,JSON.stringify(defaults)])).rows[0];if(!member)return 0;let count=0;if(text&&member.phone_verified&&member.channels?.text!==false){const result=await q(`INSERT INTO event_deliveries(id,message_id,email,recipient,channel,provider_channel,subject,body,next_attempt_at) VALUES($1,$2,$3,$4,'text',$5,$6,$7,now()) ON CONFLICT DO NOTHING`,[id+'_text',id,email,member.phone,member.message_channel,subject,body]);count+=result.rowCount??result.rows?.length??0;}if(push&&member.channels?.push!==false)for(const subscription of member.subscriptions){const result=await q(`INSERT INTO event_deliveries(id,message_id,email,recipient,channel,subject,body,next_attempt_at,push_subscription) VALUES($1,$2,$3,$4,'push',$5,$6,now(),$7) ON CONFLICT DO NOTHING`,[id+'_push_'+require('node:crypto').createHash('sha256').update(subscription.endpoint).digest('hex').slice(0,12),id,email,subscription.endpoint,subject,body,JSON.stringify(subscription)]);count+=result.rowCount??result.rows?.length??0;}return count;}
async function queueEventInvitation(q,{event,registrationId,email,name,language='zh',origin='',token='',message='',emailEnabled=true}){
 const lang=['en','ja'].includes(language)?language:'zh',title=event.translations?.[lang]?.title||event.title,copy={zh:['邀請你參加','你受邀參加以下活動：'],en:["You're invited",'You are invited to this event:'],ja:['イベントへのご招待','次のイベントに招待されました：']}[lang];
 const id='invite_'+registrationId,url=origin+(lang==='zh'?'':'/'+lang)+'/events/'+encodeURIComponent(event.slug)+(token?'#invite='+encodeURIComponent(token):''),subject=copy[0]+' · '+title,body=[name,copy[1],title,message,url].filter(Boolean).join('\n\n');
 const mail=await queueEventMail(q,{id,eventId:event.id,registrationId,ticketVersion:1,expectedStatus:'invited',email,subject,body,emailEnabled});return (mail.rowCount??mail.rows?.length??0)+await queueMemberChannels(q,{id,eventId:event.id,email,subject,body,category:'invites'});
}
async function queueHostInvitation(q,{event,email,name,role,origin='',ics=''}){
 const access=role==='manager'?origin+'/organizer/events/'+encodeURIComponent(event.id):role==='checkin'?origin+'/event-checkin.html?event='+encodeURIComponent(event.id):origin+'/events/'+encodeURIComponent(event.slug);
 return queueEventMail(q,{id:'host_invite_'+require('crypto').randomUUID(),eventId:event.id,email,subject:'活動主辦邀請 · '+event.title,body:`${name}\n\n你已受邀協助「${event.title}」。\nYou have been invited to help manage this event.\nこのイベントの運営に招待されました。\n\n${access}`,attachments:ics?[{filename:'event.ics',content:Buffer.from(ics).toString('base64')}]:[]});
}
function normalizeRegistrationEmails(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('報名通知設定格式不正確。');
 const out={};for(const kind of ['confirmation','pending','declined']){const item=value[kind]||{};if(!item||typeof item!=='object'||typeof item.subject!=='string'||typeof item.body!=='string'||item.subject.length>160||item.body.length>5000)throw Error('報名通知主旨或內容格式不正確。');out[kind]={subject:item.subject.trim(),body:item.body.trim()};}return out;
}
function registrationMail({event,settings={},lang='zh',status='registered',name='',message='',origin=''}){
 lang=['en','ja'].includes(lang)?lang:'zh';const copy={
  registered:{zh:['報名成功','請登入活動頁查看個人票券與活動資訊。'],en:['Registration confirmed','Sign in to the event page for your tickets and event details.'],ja:['申込完了','イベントページにログインしてチケットと詳細をご確認ください。']},
  approved:{zh:['已核准，請於 24 小時內付款','請登入活動頁完成付款。'],en:['Approved — pay within 24 hours','Sign in to the event page to complete payment.'],ja:['承認済み：24時間以内にお支払いください','イベントページにログインしてお支払いを完了してください。']},
  declined:{zh:['未獲核准','這次報名未獲核准。'],en:['Not approved','Your registration was not approved.'],ja:['承認されませんでした','今回のお申し込みは承認されませんでした。']},
  waitlisted:{zh:['候補中','你的報名目前在候補名單。'],en:['Waitlisted','Your registration is currently on the waitlist.'],ja:['キャンセル待ち','現在キャンセル待ちです。']},
  pending_approval:{zh:['待審核','主辦人收到你的報名，審核後會再通知。'],en:['Pending approval','The host received your registration and will notify you after review.'],ja:['承認待ち','主催者がお申し込みを受け付けました。審査後にお知らせします。']},
  capture_pending:{zh:['請款處理中','付款正在處理，完成後會核發票券。'],en:['Payment processing','Payment is processing. Your ticket will be issued after completion.'],ja:['決済処理中','決済完了後にチケットを発行します。']},
 }[status]||{zh:[status,status],en:[status,status],ja:[status,status]};const defaults=copy[lang],kind=status==='declined'?'declined':['pending_approval','waitlisted'].includes(status)?'pending':'confirmation',custom=settings.email_templates?.[kind]||{},title=custom.subject||defaults[0],body=custom.body||defaults[1],url=origin+(lang==='zh'?'':'/'+lang)+'/events/'+encodeURIComponent(event.slug);
 return {subject:custom.subject?title:title+' · '+event.title,body:[name,event.title,body,message,url].filter(Boolean).join('\n\n')};
}
async function queueCancellation(q,event,reason,origin,translations={}){
 const recipients=(await q(`SELECT DISTINCT ON (email) email,language FROM (
 SELECT lower(u.email) AS email,r.language FROM event_regs r JOIN users u ON u.id=r.user_id WHERE r.event_id=$1 AND r.status IN ('registered','pending_payment','pending_approval','approved','waitlisted','capture_pending')
 UNION ALL SELECT lower(a.email),r.language FROM event_attendees a JOIN event_regs r ON r.id=a.registration_id LEFT JOIN event_ticket_orders o ON o.id=a.order_id WHERE r.event_id=$1 AND r.status='registered' AND (a.order_id IS NULL OR o.status='registered')
 ) recipients WHERE email<>'' ORDER BY email,language`,[event.id])).rows;
 for(const recipient of recipients){
  const lang=['en','ja'].includes(recipient.language)?recipient.language:'zh',title=event.translations?.[lang]?.title||event.title;
  const copy={zh:['活動已取消','取消原因','已付款票款由言文字平台另行處理；本通知不代表退款已完成。'],en:['Event cancelled','Reason','Payments are handled separately by emoji. This notice does not confirm a refund.'],ja:['イベント中止','中止理由','お支払いの返金は言文字が別途対応します。この通知は返金完了を意味しません。']}[lang];
  await queueEventMail(q,{id:'cancellation_'+require('crypto').randomUUID(),eventId:event.id,email:recipient.email,subject:copy[0]+' · '+title,body:title+'\n\n'+copy[1]+': '+(translations[lang]?.trim()||reason)+'\n\n'+copy[2]+'\n\n'+origin+(lang==='zh'?'':'/'+lang)+'/events/'+encodeURIComponent(event.slug)});
 }
 return recipients.length;
}
async function queueReminders(q,origin){
 const rows=(await q(`SELECT r.id,r.ticket_version,r.language,r.created_at,e.id AS event_id,e.slug,e.title,e.translations,e.starts_at,u.email,h.hours
 FROM event_regs r JOIN events e ON e.id=r.event_id JOIN users u ON u.id=r.user_id
 CROSS JOIN LATERAL (SELECT jsonb_array_elements_text(COALESCE(e.registration_settings->'reminders','[]'::jsonb))::int AS hours) h
 WHERE r.status='registered' AND e.status='報名中' AND h.hours IN (1,24) AND e.starts_at>now()
 AND e.starts_at<=now()+h.hours*interval '1 hour' AND r.created_at<=e.starts_at-h.hours*interval '1 hour'
 AND NOT EXISTS(SELECT 1 FROM event_messages m WHERE m.id='reminder_'||r.id||'_'||r.ticket_version||'_'||h.hours)
 ORDER BY e.starts_at LIMIT 100`)).rows;
 for(const r of rows){const lang=['en','ja'].includes(r.language)?r.language:'zh',title=r.translations?.[lang]?.title||r.title;
 const time=new Date(r.starts_at).toLocaleString(lang==='zh'?'zh-TW':lang==='ja'?'ja-JP':'en-US',{timeZone:'Asia/Taipei'}),url=origin+(lang==='zh'?'':'/'+lang)+'/events/'+encodeURIComponent(r.slug);
 const label={zh:'活動提醒',en:'Event reminder',ja:'イベントのリマインダー'}[lang];
 const id='reminder_'+r.id+'_'+r.ticket_version+'_'+r.hours,subject=label+' · '+title,body=title+'\n'+time+' (UTC+8)\n\n'+url;await queueEventMail(q,{id,eventId:r.event_id,registrationId:r.id,ticketVersion:r.ticket_version,email:r.email,subject,body,emailEnabled:!!process.env.RESEND_API_KEY});await queueMemberChannels(q,{id,eventId:r.event_id,email:r.email,subject,body,category:'reminders'});}
 return rows.length;
}
module.exports={deliverDue,queueEventMail,queueEventInvitation,queueReminders};

function normalizeBlast(input){
 const {subject,body}=input||{},audiences=input?.audiences??[input?.audience],ticketIds=input?.ticket_ids??[];
 if(typeof subject!=='string'||!subject.trim()||subject.length>200||typeof body!=='string'||!body.trim()||body.length>20000)throw Error('請填寫主旨與內容。');
 if(!Array.isArray(audiences)||!audiences.length||audiences.some(s=>!['registered','pending_approval','waitlisted','approved','checked_in','invited'].includes(s)))throw Error('請選擇有效收件狀態。');
 if(!Array.isArray(ticketIds)||ticketIds.length>30||ticketIds.some(id=>typeof id!=='string'||!/^t_[a-zA-Z0-9_-]{1,60}$/.test(id)))throw Error('票種篩選格式錯誤。');
 if(audiences.includes('invited')&&ticketIds.length)throw Error('受邀未報名者沒有票券，不能同時限制票種。');
 const bodyHtml=input.body_html==null?'':require('./event-rich-text').richText(input.body_html);
 return {subject:subject.trim(),body:body.trim(),...(input.body_html!==undefined?{bodyHtml}:{}),audiences:[...new Set(audiences)],ticketIds:[...new Set(ticketIds)]};
}
// Shared by delivery preview, scheduling and the guest page; m = message, r = registration.
const blastAudienceSQL=`(
 (CASE WHEN jsonb_array_length(m.audiences)>0 THEN m.audiences ELSE jsonb_build_array(m.audience) END) ? r.status
 OR ((CASE WHEN jsonb_array_length(m.audiences)>0 THEN m.audiences ELSE jsonb_build_array(m.audience) END) ? 'checked_in' AND r.status='registered' AND
 (r.checked_in_at IS NOT NULL OR EXISTS(SELECT 1 FROM event_attendees a WHERE a.registration_id=r.id AND a.checked_in_at IS NOT NULL))))
 AND (jsonb_array_length(m.ticket_ids)=0 OR
 (m.ticket_ids ? (r.ticket_snapshot->>'id') AND r.quantity>COALESCE((SELECT SUM(o.quantity) FROM event_ticket_orders o WHERE o.registration_id=r.id AND o.ticket_version=r.ticket_version AND o.status IN ('registered','refund_pending')),0))
 OR EXISTS(SELECT 1 FROM event_ticket_orders o WHERE o.registration_id=r.id AND o.ticket_version=r.ticket_version AND o.status='registered' AND o.quantity>0 AND m.ticket_ids ? (o.ticket_snapshot->>'id')))`;
module.exports.normalizeBlast=normalizeBlast;
module.exports.blastAudienceSQL=blastAudienceSQL;

async function queueFeedbackRequests(q,origin){
 const rows=(await q(`SELECT r.id,r.ticket_version,r.language,e.id AS event_id,e.slug,e.title,e.translations,e.registration_settings->'feedback' AS feedback,u.email
 FROM event_regs r JOIN events e ON e.id=r.event_id JOIN users u ON u.id=r.user_id
 WHERE r.status='registered' AND e.status IN ('報名中','已結束') AND e.ends_at IS NOT NULL
 AND e.registration_settings->'feedback'->>'enabled'='true'
 AND e.ends_at+COALESCE((e.registration_settings->'feedback'->>'delay_hours')::int,0)*interval '1 hour'<=now()
 AND NOT EXISTS(SELECT 1 FROM event_feedback f WHERE f.event_id=e.id AND f.user_id=r.user_id)
 AND NOT EXISTS(SELECT 1 FROM event_messages m WHERE m.id='feedback_'||r.id||'_'||r.ticket_version)
 ORDER BY e.ends_at LIMIT 100`)).rows;
 for(const r of rows){const lang=['en','ja'].includes(r.language)?r.language:'zh',title=r.translations?.[lang]?.title||r.title;
 const subject=r.feedback.subject||{zh:'分享你的活動感受',en:'How was the event?',ja:'イベントはいかがでしたか？'}[lang],body=r.feedback.body||{zh:'謝謝你參加！歡迎花一分鐘分享回饋，幫助我們準備下一場活動。',en:'Thank you for joining us. Share your feedback to help us improve the next event.',ja:'ご参加ありがとうございました。次回の改善に向けて、ご感想をお聞かせください。'}[lang];
 await queueEventMail(q,{id:'feedback_'+r.id+'_'+r.ticket_version,eventId:r.event_id,registrationId:r.id,ticketVersion:r.ticket_version,email:r.email,subject:subject+' · '+title,body:body+'\n\n'+origin+(lang==='zh'?'':'/'+lang)+'/events/'+encodeURIComponent(r.slug)+'#event-feedback'});}
 return rows.length;
}
module.exports.queueFeedbackRequests=queueFeedbackRequests;

function signUnsubscribe(id,secret){
 return id+'.'+require('node:crypto').createHmac('sha256',secret).update('event-unsubscribe:'+id).digest('base64url');
}
function verifyUnsubscribe(token,secret){
 if(typeof token!=='string'||token.length>240)return null;
 const [id,signature,...extra]=token.split('.');
 if(extra.length||!id||!/^[A-Za-z0-9_-]{1,180}$/.test(id)||!signature)return null;
 return require('./security').safeEqual(token,signUnsubscribe(id,secret))?id:null;
}
function notificationCategory(row){if(row.id.startsWith('cancellation_')||row.id.startsWith('host_invite_'))return null;return row.id.startsWith('reminder_')?'reminders':row.id.startsWith('feedback_')?'feedback':row.context&&!row.context.registration_id?'blasts':null;}
module.exports.signUnsubscribe=signUnsubscribe;
module.exports.verifyUnsubscribe=verifyUnsubscribe;
module.exports.notificationCategory=notificationCategory;
module.exports.queueHostInvitation=queueHostInvitation;
module.exports.normalizeRegistrationEmails=normalizeRegistrationEmails;
module.exports.registrationMail=registrationMail;

module.exports.queueCancellation=queueCancellation;
