/* Include on the host website; only this script's event origin may enter the dialog. */
(()=>{
 const origin=new URL(document.currentScript.src).origin;
 const installed=window[Symbol.for('emoji.eventEmbedOrigins')]||(window[Symbol.for('emoji.eventEmbedOrigins')]=new Set());if(installed.has(origin))return;installed.add(origin);
 function navigateFromFrame(event,frame,full){if(event.origin!==origin||event.source!==frame.contentWindow||event.data?.type!=='emoji:open-event')return;location.assign(full);}
 const parameters=['tt','ticket_id','coupon','coupon_code','unlock_code','utm_source','utm_campaign','utm_medium','utm_content','utm_term','gclid','fbclid','li_fat_id','ref'];
 document.addEventListener('click',event=>{
  const anchor=event.target.closest?.('a[data-emoji-event]');if(!anchor||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const url=new URL(anchor.href,location.href);if(url.origin!==origin||!/^\/(?:en\/|ja\/)?events\/[^/]+$/.test(url.pathname))return;
  if(typeof HTMLDialogElement==='undefined')return;
  event.preventDefault();const lang=url.pathname.startsWith('/en/')?'en':url.pathname.startsWith('/ja/')?'ja':'zh',labels={zh:['活動報名','關閉','在新分頁開啟活動'],en:['Event registration','Close','Open event in a new tab'],ja:['イベント申込','閉じる','新しいタブで開く']}[lang];
  const incoming=new URLSearchParams(location.search);for(const key of parameters)if(!url.searchParams.has(key)&&incoming.has(key))url.searchParams.set(key,incoming.get(key).slice(0,256));
  const full=url.href;url.pathname=url.pathname.replace('/events/','/embed/events/');
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-label',labels[0]);Object.assign(dialog.style,{width:'min(960px,96vw)',maxWidth:'96vw',height:'90vh',maxHeight:'90vh',padding:'12px',border:'1px solid #ddd',borderRadius:'16px',background:'#fff',color:'#1b1a17'});
  const top=document.createElement('div');Object.assign(top.style,{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'12px',marginBottom:'8px'});
  const fallback=document.createElement('a');fallback.href=full;fallback.target='_blank';fallback.rel='noopener';fallback.textContent=labels[2];fallback.style.fontSize='16px';
  const close=document.createElement('button');close.type='button';close.textContent=labels[1];Object.assign(close.style,{fontSize:'16px',minHeight:'44px',padding:'8px 16px'});close.onclick=()=>dialog.close();
  const frame=document.createElement('iframe');frame.src=url.href;frame.title=labels[0];frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-top-navigation-by-user-activation');Object.assign(frame.style,{width:'100%',height:'calc(100% - 56px)',border:'0'});
  const navigate=event=>navigateFromFrame(event,frame,full);window.addEventListener('message',navigate);
  top.append(fallback,close);dialog.append(top,frame);document.body.append(dialog);dialog.addEventListener('close',()=>{window.removeEventListener('message',navigate);dialog.remove();anchor.focus();},{once:true});dialog.showModal();close.focus();
 });
})();
