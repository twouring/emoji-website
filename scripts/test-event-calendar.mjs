import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{eventCalendar}=require('../lib/event-calendar');
test('calendar exports UTC times and escapes text and folds UTF-8 lines',()=>{
 const text=eventCalendar({id:'e_1',slug:'one',title:'活動'.repeat(70),location:'Taipei;1,2',description:'a\nb',starts_at:'2026-10-31T18:00:00+08:00',ends_at:'2026-11-01T00:00:00+08:00'},'https://www.emoji.tw');
 assert.ok(text.includes('DTSTART:20261031T100000Z'));assert.ok(text.includes('DTEND:20261031T160000Z'));
 assert.ok(text.includes('Taipei\\;1\\,2'));assert.ok(text.includes('a\\nb'));
 assert.ok(text.split('\r\n').every(line=>Buffer.byteLength(line)<=74));
 assert.match(eventCalendar({id:'cancelled',status:'已取消',starts_at:'2026-10-31T10:00:00Z'},'https://www.emoji.tw'),/STATUS:CANCELLED/);
 assert.throws(()=>eventCalendar({id:'no-time'},'https://www.emoji.tw'),/開始時間/);
});
test('site-wide calendar feed lists every timed public event and skips events without a start time',()=>{
 const {eventsCalendar}=require('../lib/event-calendar');
 const text=eventsCalendar([
  {id:'e_1',slug:'one',title:'開幕茶會',starts_at:'2026-11-01T14:00:00+08:00',ends_at:'2026-11-01T17:00:00+08:00',location:'言文字'},
  {id:'e_2',slug:'two',title:'No time yet'},
  {id:'e_3',slug:'three',title:'Talk',starts_at:'2026-11-13T18:30:00+08:00',status:'已取消'},
 ],'https://www.emoji.tw','言文字活動');
 assert.equal(text.match(/BEGIN:VEVENT/g).length,2);assert.equal(text.match(/BEGIN:VCALENDAR/g).length,1);
 assert.ok(text.includes('X-WR-CALNAME:言文字活動'));assert.ok(text.includes('X-WR-TIMEZONE:Asia/Taipei'));
 assert.ok(text.includes('DTSTART:20261101T060000Z'));assert.ok(text.includes('UID:e_3@emoji.tw'));assert.ok(!text.includes('No time yet'));
 assert.ok(text.includes('URL:https://www.emoji.tw/events/one'));assert.match(text,/STATUS:CANCELLED/);
 assert.ok(text.split('\r\n').every(line=>Buffer.byteLength(line)<=74));
 assert.match(eventsCalendar([],'https://www.emoji.tw'),/X-WR-CALNAME:言文字活動[\s\S]*END:VCALENDAR/);
});
test('Google Calendar template preserves Taiwan event times and safely encodes content',()=>{
 const {googleCalendarUrl}=require('../lib/event-calendar');
 assert.throws(()=>googleCalendarUrl({status:'已取消'},'https://www.emoji.tw'),/已取消/);
 const url=new URL(googleCalendarUrl({title:'A & B',slug:'hello world',description:'Line 1\nLine 2',location:'Taipei',starts_at:'2026-10-31T18:00:00+08:00',ends_at:'2026-11-01T00:00:00+08:00'},'https://www.emoji.tw'));
 assert.equal(url.origin,'https://calendar.google.com');assert.equal(url.searchParams.get('text'),'A & B');assert.equal(url.searchParams.get('dates'),'20261031T100000Z/20261031T160000Z');assert.equal(url.searchParams.get('stz'),'Asia/Taipei');assert.match(url.searchParams.get('details'),/hello%20world$/);
 assert.throws(()=>googleCalendarUrl({starts_at:'2026-10-31T10:00:00Z'},'https://www.emoji.tw'),/開始與結束/);
});
