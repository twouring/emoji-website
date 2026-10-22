/* Include on the host website; only this script's event origin (or the member App origin) may enter the dialog. */
/* 報名已搬到會員 App：iframe 載入 App 的 /e/<slug>?embed=1；App origin 取 script 的 data-app-origin，否則由官網網域推得（www.emoji.tw／emoji.tw → app.emoji.tw，其他同源） */
(()=>{
 const script=document.currentScript,origin=new URL(script.src).origin;
 const appOriginOf=(siteOrigin,attr)=>{if(attr){try{return new URL(attr).origin;}catch{}}const u=new URL(siteOrigin);return /^(www\.)?emoji\.tw$/.test(u.hostname)?'https://app.emoji.tw':u.origin;};
 const appOrigin=appOriginOf(origin,script.dataset?.appOrigin);
 const installed=window[Symbol.for('emoji.eventEmbedOrigins')]||(window[Symbol.for('emoji.eventEmbedOrigins')]=new Set());if(installed.has(origin))return;installed.add(origin);
 // postMessage 只接受官網或 App 來源，且必須來自本 iframe
 function navigateFromFrame(event,frame,full){if((event.origin!==origin&&event.origin!==appOrigin)||event.source!==frame.contentWindow||event.data?.type!=='emoji:open-event')return;location.assign(full);}
 const parameters=['tt','ticket_id','coupon','coupon_code','unlock_code','utm_source','utm_campaign','utm_medium','utm_content','utm_term','gclid','fbclid','li_fat_id','ref'];
 document.addEventListener('click',event=>{
  const anchor=event.target.closest?.('a[data-emoji-event]');if(!anchor||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const url=new URL(anchor.href,location.href);if(url.origin!==origin||!/^\/(?:en\/|ja\/)?events\/[^/]+$/.test(url.pathname))return;
  if(typeof HTMLDialogElement==='undefined')return;
  event.preventDefault();const lang=url.pathname.startsWith('/en/')?'en':url.pathname.startsWith('/ja/')?'ja':'zh',labels={zh:['活動報名','關閉','在新分頁開啟活動'],en:['Event registration','Close','Open event in a new tab'],ja:['イベント申込','閉じる','新しいタブで開く']}[lang];
  const incoming=new URLSearchParams(location.search);for(const key of parameters)if(!url.searchParams.has(key)&&incoming.has(key))url.searchParams.set(key,incoming.get(key).slice(0,256));
  // 官網 /events/<slug> → App /e/<slug>（語言改用 ?lang=）；新分頁備援開 App 正常頁，iframe 帶 embed=1
  const app=new URL(appOrigin+'/e/'+url.pathname.split('/').pop());app.search=url.search;if(lang!=='zh')app.searchParams.set('lang',lang);
  const full=app.href;app.searchParams.set('embed','1');
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-label',labels[0]);Object.assign(dialog.style,{width:'min(960px,96vw)',maxWidth:'96vw',height:'90vh',maxHeight:'90vh',padding:'12px',border:'1px solid #ddd',borderRadius:'16px',background:'#fff',color:'#1b1a17'});
  const top=document.createElement('div');Object.assign(top.style,{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'12px',marginBottom:'8px'});
  const fallback=document.createElement('a');fallback.href=full;fallback.target='_blank';fallback.rel='noopener';fallback.textContent=labels[2];fallback.style.fontSize='16px';
  const close=document.createElement('button');close.type='button';close.textContent=labels[1];Object.assign(close.style,{fontSize:'16px',minHeight:'44px',padding:'8px 16px'});close.onclick=()=>dialog.close();
  const frame=document.createElement('iframe');frame.src=app.href;frame.title=labels[0];frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-top-navigation-by-user-activation');Object.assign(frame.style,{width:'100%',height:'calc(100% - 56px)',border:'0'});
  const navigate=event=>navigateFromFrame(event,frame,full);window.addEventListener('message',navigate);
  top.append(fallback,close);dialog.append(top,frame);document.body.append(dialog);dialog.addEventListener('close',()=>{window.removeEventListener('message',navigate);dialog.remove();anchor.focus();},{once:true});dialog.showModal();close.focus();
 });
})();
