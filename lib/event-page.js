'use strict';
const { localePaths } = require('./layout');
const { localizeEvent } = require('./events');
const FEATURED_ID = 'e_halloween_2026';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function eventPage(html, event, reqPath) {
  const { lang } = localePaths(reqPath);
  const e = localizeEvent(event, lang), base = lang === 'zh' ? '' : '/' + lang;
  const words = {
    zh: ['報名尚未開放','免費報名','前往報名','查看報名與票券','查看 IG 活動消息','時間待定','預計','活動已結束'],
    en: ['Registration not open yet','Free registration','Register','Registration and tickets','Event updates on Instagram','Time TBA','Planned','Event ended'],
    ja: ['申込受付前','無料で申し込む','申し込む','申込・チケットを見る','Instagramで最新情報を見る','日時未定','予定','イベント終了']
  }[lang];
  const booking = base + '/events/' + encodeURIComponent(e.slug);
  const open = e.status === '報名中';
  const actions = open
    ? `<a class="btn btn--solid" href="${booking}">${e.tickets?.length ? words[2] : e.price_twd > 0 ? words[2] + ' · NT$' + Number(e.price_twd).toLocaleString('en-US') : words[1]} →</a>`
    : `<strong>${e.status === '已取消' ? {zh:'活動已取消',en:'Event cancelled',ja:'イベント中止'}[lang] : e.status === '已結束' ? words[7] : words[0]}</strong>`;
  const start = e.starts_at_iso ? new Date(e.starts_at_iso + ':00+08:00') : null;
  const fmt = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-TW' : lang === 'ja' ? 'ja-JP' : 'en-US', {dateStyle:'full',timeStyle:'short',timeZone:'Asia/Taipei'});
  const end = e.ends_at_iso ? new Date(e.ends_at_iso + ':00+08:00') : null;
  const when = start ? `${e.status === '預告' ? words[6] + ' · ' : ''}${fmt.format(start)}${end ? ' – ' + fmt.format(end) : ''} (UTC+8)` : words[5];
  const content = {...e.translations?.zh, ...Object.fromEntries(Object.entries(e.translations?.[lang] || {}).filter(([,v])=>v)), title:e.title,description:e.description,location:e.location,when,
    poster_date:start ? new Intl.DateTimeFormat('en-US',{month:'2-digit',day:'2-digit',timeZone:'Asia/Taipei'}).format(start).replace('/','.') : '—'};
  const schema = {'@context':'https://schema.org','@type':'WebPage',name:e.title,description:e.description,url:'https://www.emoji.tw'+base+'/halloween-2026',inLanguage:lang};
  return html.replace(/\{\{([a-z_0-9]+)\}\}/g, (_, key) => {
    if(key === 'actions') return actions + `<a class="btn btn--ghost" href="${open || e.status === '已結束' ? booking : 'https://www.instagram.com/emoji0701/'}">${open || e.status === '已結束' ? words[3] : words[4]}</a>`;
    if(key === 'hosts') return e.host_names?.length ? `<p>${{zh:'主辦團隊',en:'Hosted by',ja:'主催'}[lang]} · ${e.host_names.map(escape).join(' · ')}</p>` : '';
    if(key === 'schema') return `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script>`;
    return escape(content[key]);
  });
}
function featuredEvent(html, event, reqPath) {
  if (!event || event.visibility !== 'public' || !['預告','報名中'].includes(event.status)) return html.replace('<!--FEATURED_EVENT-->','');
  const {lang} = localePaths(reqPath), e = localizeEvent(event,lang), base = lang==='zh'?'':'/'+lang;
  const label = {zh:'查看活動 →',en:'Explore the event →',ja:'イベントを見る →'}[lang];
  return html.replace('<!--FEATURED_EVENT-->', `<div class="wrap"><section class="hy-feature"><div><p>${escape(e.starts_at || '')} · UTC+8</p><h2>${escape(e.title)}</h2><p>${escape(e.translations?.[lang]?.headline || e.translations?.zh?.headline || e.description)}</p></div><a class="btn btn--solid" href="${base}/halloween-2026">${label}</a></section></div>`);
}
module.exports = { FEATURED_ID, eventPage, featuredEvent };
