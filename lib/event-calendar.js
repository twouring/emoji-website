'use strict';
const escape=value=>String(value||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
const date=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
const fold=line=>{let output='',size=0;for(const ch of line){const bytes=Buffer.byteLength(ch);if(size+bytes>74){output+='\r\n ';size=1;}output+=ch;size+=bytes;}return output;};
const validStart=event=>!!event.starts_at&&Number.isFinite(+new Date(event.starts_at));
function vevent(event,origin,stamp){
 return ['BEGIN:VEVENT',`UID:${escape(event.id)}@emoji.tw`,`DTSTAMP:${stamp}`,`DTSTART:${date(event.starts_at)}`,...(event.ends_at?[`DTEND:${date(event.ends_at)}`]:[]),`STATUS:${event.status==='已取消'?'CANCELLED':'CONFIRMED'}`,`SUMMARY:${escape(event.title)}`,`DESCRIPTION:${escape(event.description)}`,`LOCATION:${escape(event.location)}`,`URL:${origin}/events/${encodeURIComponent(event.slug)}`,'END:VEVENT'];
}
function eventCalendar(event,origin){
 if(!validStart(event))throw new Error('活動尚未設定開始時間。');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//emoji.tw//Events//ZH','CALSCALE:GREGORIAN','METHOD:PUBLISH',...vevent(event,origin,date(new Date())),'END:VCALENDAR',''].map(fold).join('\r\n');
}
/** 整站公開活動的訂閱日曆（Google／Apple 行事曆「以 URL 訂閱」）：沒有開始時間的活動略過，不整份失敗。 */
function eventsCalendar(events,origin,name){
 const stamp=date(new Date());
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//emoji.tw//Events//ZH','CALSCALE:GREGORIAN','METHOD:PUBLISH',`X-WR-CALNAME:${escape(name||'言文字活動')}`,'X-WR-TIMEZONE:Asia/Taipei','REFRESH-INTERVAL;VALUE=DURATION:PT12H',...(events||[]).filter(validStart).flatMap(event=>vevent(event,origin,stamp)),'END:VCALENDAR',''].map(fold).join('\r\n');
}
function googleCalendarUrl(event,origin){
 if(event.status==='已取消')throw Error('活動已取消，無法新增行程。');
 const start=new Date(event.starts_at),end=new Date(event.ends_at);
 if(!event.starts_at||!event.ends_at||!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)throw Error('活動尚未設定有效的開始與結束時間。');
 const format=date=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const url=new URL('https://calendar.google.com/calendar/r/eventedit');
 url.search=new URLSearchParams({action:'TEMPLATE',text:event.title||'',dates:format(start)+'/'+format(end),stz:'Asia/Taipei',etz:'Asia/Taipei',details:(event.description||'')+'\n'+origin+'/events/'+encodeURIComponent(event.slug),location:event.location||''}).toString();return url.href;
}
module.exports={eventCalendar,eventsCalendar,googleCalendarUrl};
