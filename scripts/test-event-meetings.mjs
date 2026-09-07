import test from 'node:test';
import assert from 'node:assert/strict';
import meetings from '../lib/event-meetings.js';

test('meeting providers create scoped OAuth URLs and provider-native events',()=>{
 const google=new URL(meetings.oauthUrl('google-meet',{clientId:'client',redirectUri:'https://emoji.test/integrations/google-meet/callback',state:'signed'}));
 assert.equal(google.origin,'https://accounts.google.com');assert.equal(google.searchParams.get('scope'),'https://www.googleapis.com/auth/calendar.events');assert.equal(google.searchParams.get('access_type'),'offline');
 const event={title:'Demo',description:'Details',location:'Taipei',starts_at:'2026-10-20T11:00:00.000Z',ends_at:'2026-10-20T13:00:00.000Z'};
 const meet=meetings.meetingRequest('google-meet',event);assert.match(meet.url,/conferenceDataVersion=1/);assert.equal(meet.body.conferenceData.createRequest.conferenceSolutionKey.type,'hangoutsMeet');
 const zoom=meetings.meetingRequest('zoom',event,'webinar');assert.match(zoom.url,/\/webinars$/);assert.equal(zoom.body.duration,120);
 assert.deepEqual(meetings.meetingResult('google-meet',{id:'calendar',conferenceData:{entryPoints:[{entryPointType:'video',uri:'https://meet.google.com/abc'}]}}),{id:'calendar',url:'https://meet.google.com/abc',pending:false});
 assert.deepEqual(meetings.meetingResult('zoom',{id:123,join_url:'https://zoom.us/j/123'}),{id:'123',url:'https://zoom.us/j/123'});
});
