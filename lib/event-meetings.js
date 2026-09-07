'use strict';

const crypto=require('crypto');

const PROVIDERS=['google-meet','zoom'];

function oauthUrl(provider,{clientId,redirectUri,state}){
 if(!PROVIDERS.includes(provider)||!clientId||!redirectUri||!state)throw Error('線上會議服務設定不完整。');
 const url=new URL(provider==='zoom'?'https://zoom.us/oauth/authorize':'https://accounts.google.com/o/oauth2/v2/auth');
 Object.entries({client_id:clientId,redirect_uri:redirectUri,response_type:'code',state}).forEach(([key,value])=>url.searchParams.set(key,value));
 if(provider==='google-meet')Object.entries({scope:'https://www.googleapis.com/auth/calendar.events',access_type:'offline',prompt:'consent'}).forEach(([key,value])=>url.searchParams.set(key,value));
 return url.href;
}

function meetingRequest(provider,event,kind='meeting'){
 if(!PROVIDERS.includes(provider)||!event?.title||!event.starts_at||!event.ends_at)throw Error('活動時間或線上會議服務不完整。');
 const start=new Date(event.starts_at),end=new Date(event.ends_at);if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)throw Error('活動時間不正確。');
 if(provider==='google-meet')return {
  url:'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
  body:{id:'emoji'+crypto.createHash('sha256').update(String(event.id||event.title)).digest('hex'),summary:event.title,description:event.description||'',location:event.location||'',start:{dateTime:start.toISOString(),timeZone:'Asia/Taipei'},end:{dateTime:end.toISOString(),timeZone:'Asia/Taipei'},conferenceData:{createRequest:{requestId:'meet'+crypto.createHash('sha256').update(String(event.id||event.title)).digest('hex'),conferenceSolutionKey:{type:'hangoutsMeet'}}}}
 };
 if(!['meeting','webinar'].includes(kind))throw Error('Zoom 類型不正確。');
 return {
  url:`https://api.zoom.us/v2/users/me/${kind==='webinar'?'webinars':'meetings'}`,
  body:{topic:event.title,agenda:event.description||'',type:2,start_time:start.toISOString(),duration:Math.max(1,Math.ceil((end-start)/60000)),timezone:'Asia/Taipei'}
 };
}

function meetingResult(provider,data){
 if(provider==='zoom')return {id:String(data?.id||''),url:typeof data?.join_url==='string'?data.join_url:''};
 const point=data?.conferenceData?.entryPoints?.find(item=>item.entryPointType==='video'&&typeof item.uri==='string');
 return {id:String(data?.id||''),url:point?.uri||'',pending:data?.conferenceData?.createRequest?.status?.statusCode==='pending'};
}

module.exports={PROVIDERS,oauthUrl,meetingRequest,meetingResult};
