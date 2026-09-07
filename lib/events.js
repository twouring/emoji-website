'use strict';

const EVENT_STATUSES = ['草稿', '預告', '報名中', '已結束', '已取消'];
const EVENT_VISIBILITIES = ['public', 'private'];

function eventDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  return new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) ? `${text}:00+08:00` : text);
}

function eventSlug(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function normalizeEventInput(body = {}) {
  const title = String(body.title || '').trim();
  if (!title) return { error: '請輸入活動名稱。' };

  const startsAt = eventDate(body.starts_at);
  const endsAt = eventDate(body.ends_at);
  if (startsAt && Number.isNaN(+startsAt)) return { error: '活動開始時間格式不正確。' };
  if (endsAt && Number.isNaN(+endsAt)) return { error: '活動結束時間格式不正確。' };
  if (startsAt && endsAt && endsAt <= startsAt) return { error: '活動結束時間必須晚於開始時間。' };

  const capacity = Number(body.capacity || 0);
  const priceTwd = Number(body.price_twd || 0);
  if (!Number.isInteger(capacity) || capacity < 0) return { error: '活動名額必須是 0 以上的整數。' };
  if (!Number.isInteger(priceTwd) || priceTwd < 0) return { error: '票價必須是 0 以上的整數。' };

  const slug = body.slug == null ? '' : eventSlug(body.slug);
  if (body.slug && slug.length < 3) return { error: '活動網址代稱至少需要 3 個有效字元。' };

  if (body.status != null && !EVENT_STATUSES.includes(body.status)) return { error: '活動狀態不正確。' };
  let translations;
  if (body.translations != null) {
    if (typeof body.translations !== 'object' || Array.isArray(body.translations)) return { error: '多語內容格式不正確。' };
    translations = {};
    const keys = ['title', 'description', 'location', ...require('../public/event-fields').map(([key]) => key)];
    for (const [lang, content] of Object.entries(body.translations)) {
      if (!['zh','en','ja'].includes(lang) || !content || typeof content !== 'object' || Array.isArray(content)) return { error: '多語內容格式不正確。' };
      translations[lang] = {};
      for (const [key, value] of Object.entries(content)) {
        if (!keys.includes(key) || typeof value !== 'string' || value.length > 10000) return { error: '多語欄位不正確或超過 10000 字。' };
        translations[lang][key] = value.trim();
      }
    }
    translations.zh = {...translations.zh, title, description:String(body.description || '').trim(), location:String(body.location || '').trim()};
  }
  return { value: {
    translations,
    title,
    description: String(body.description || '').trim(),
    location: String(body.location || '').trim(),
    startsAt,
    endsAt,
    capacity,
    priceTwd,
    slug,
    visibility: EVENT_VISIBILITIES.includes(body.visibility) ? body.visibility : 'public',
    status: EVENT_STATUSES.includes(body.status) ? body.status : '報名中',
  } };
}

function localizeEvent(event, lang) {
  const content = event.translations?.[lang] || {};
  const out={...event, ...Object.fromEntries(['title','description','location'].map(key => [key, content[key] || event[key]]))};
  out.has_ticket_types=!!event.tickets?.length;out.tickets=require('./event-tickets').publicTickets(event.tickets);
  if(out.ticket_snapshot){const {unlock_code,...safe}=out.ticket_snapshot;out.ticket_snapshot=safe;}
  const rich=event.rich_content?.[lang]??(!content.description?event.rich_content?.zh:null);out.content_html=rich?require('./event-rich-text').richText(rich):'';
  out.event_details={...event.event_details};
  out.event_details.cancellation_reason=event.event_details?.cancellation_translations?.[lang]?.trim()||event.event_details?.cancellation_reason;
  if(!event.registered||['草稿','預告','已取消'].includes(event.status))delete out.event_details.online_url;
  if(!event.registered){
    if(out.event_details.hide_location){out.location='';out.translations=Object.fromEntries(Object.entries(event.translations||{}).map(([lang,v])=>[lang,{...v,location:''}]));}
  }
  return out;
}

function normalizeAttribution(input){
 return Object.fromEntries(['source','campaign','referral','medium','content','term','gclid','fbclid','li_fat_id'].map(key=>[key,typeof input?.[key]==='string'?input[key].trim().slice(0,256):'']));
}
module.exports = { normalizeAttribution, localizeEvent, EVENT_STATUSES, EVENT_VISIBILITIES, eventSlug, normalizeEventInput };
