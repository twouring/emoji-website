'use strict';
function eventCalendar(event,origin){
 if(!event.starts_at||!Number.isFinite(+new Date(event.starts_at)))throw new Error('活動尚未設定開始時間。');
 const escape=value=>String(value||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
 const date=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const fold=line=>{let output='',size=0;for(const ch of line){const bytes=Buffer.byteLength(ch);if(size+bytes>74){output+='\r\n ';size=1;}output+=ch;size+=bytes;}return output;};
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//emoji.tw//Events//ZH','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',`UID:${escape(event.id)}@emoji.tw`,`DTSTAMP:${date(new Date())}`,`DTSTART:${date(event.starts_at)}`,...(event.ends_at?[`DTEND:${date(event.ends_at)}`]:[]),`STATUS:${event.status==='已取消'?'CANCELLED':'CONFIRMED'}`,`SUMMARY:${escape(event.title)}`,`DESCRIPTION:${escape(event.description)}`,`LOCATION:${escape(event.location)}`,`URL:${origin}/events/${encodeURIComponent(event.slug)}`,'END:VEVENT','END:VCALENDAR',''].map(fold).join('\r\n');
}
function googleCalendarUrl(event,origin){
 if(event.status==='已取消')throw Error('活動已取消，無法新增行程。');
 const start=new Date(event.starts_at),end=new Date(event.ends_at);
 if(!event.starts_at||!event.ends_at||!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)throw Error('活動尚未設定有效的開始與結束時間。');
 const format=date=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const url=new URL('https://calendar.google.com/calendar/r/eventedit');
 url.search=new URLSearchParams({action:'TEMPLATE',text:event.title||'',dates:format(start)+'/'+format(end),stz:'Asia/Taipei',etz:'Asia/Taipei',details:(event.description||'')+'\n'+origin+'/events/'+encodeURIComponent(event.slug),location:event.location||''}).toString();return url.href;
}
module.exports={eventCalendar,googleCalendarUrl};
