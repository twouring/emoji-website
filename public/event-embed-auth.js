/* Authentication is exchanged only between this origin's popup and iframe, never with the host site. */
window.EmojiEmbedAuth=(()=>{
 const validNonce=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
 const validMessage=(event,source,nonce,type)=>event.origin===location.origin&&event.source===source&&event.data?.type===type&&event.data.nonce===nonce;
 const validToken=token=>typeof token==='string'&&token.length>20&&token.length<=4096;
 async function verify(token){const response=await fetch('/api/auth/session',{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error('登入已失效 / Sign-in expired / ログインの有効期限が切れました');}
 function start({method,lang,returnUrl,onToken,onError}){
  const nonce=crypto.randomUUID(),callback=new URL('/event-embed-auth.html',location.origin);callback.searchParams.set('nonce',nonce);callback.searchParams.set('lang',lang);callback.searchParams.set('return',returnUrl);
  const url=method==='email'?'/event-login.html?lang='+lang+'&redirect='+encodeURIComponent(callback.href):'/auth/google?redirect='+encodeURIComponent(callback.href);
  const popup=window.open(url,'emoji-login-'+nonce,'popup,width=520,height=720');if(!popup){onError({zh:'瀏覽器未開啟登入視窗，請使用上方的新分頁活動連結。',en:'The sign-in window did not open. Use the full event link above.',ja:'ログイン画面を開けませんでした。上のイベントリンクをご利用ください。'}[lang]);return false;}
  let pending=false;
  const clean=()=>{window.removeEventListener('message',receive);clearTimeout(timer);};
  const receive=async event=>{if(pending||!validMessage(event,popup,nonce,'emoji:embed-auth')||!validToken(event.data.token))return;pending=true;try{await verify(event.data.token);await onToken(event.data.token);popup.postMessage({type:'emoji:embed-auth-ack',nonce},location.origin);clean();}catch(error){pending=false;onError(error.message);}};
  window.addEventListener('message',receive);const timer=setTimeout(clean,20*60*1000);return true;
 }
 function relay(redirect){
  let url;try{url=new URL(redirect);}catch{return;}
  const nonce=url.searchParams.get('nonce');if(url.origin!==location.origin||url.pathname!=='/event-embed-auth.html'||!validNonce(nonce)||!window.opener||typeof BroadcastChannel==='undefined')return;
  const channel=new BroadcastChannel('emoji-embed-auth-'+nonce),opener=window.opener;
  channel.onmessage=event=>{if(event.data?.type==='emoji:embed-auth'&&event.data.nonce===nonce&&validToken(event.data.token))opener.postMessage(event.data,location.origin);};
  const ack=event=>{if(validMessage(event,opener,nonce,'emoji:embed-auth-ack')){channel.close();window.removeEventListener('message',ack);window.close();}};
  window.addEventListener('message',ack);window.addEventListener('pagehide',()=>channel.close(),{once:true});
 }
 async function complete({nonce,token,onDone,onError}){
  if(!validNonce(nonce)||!validToken(token)){onError();return;}
  try{await verify(token);try{localStorage.setItem('tth_token',token);localStorage.removeItem('tth_name');}catch{}
   const message={type:'emoji:embed-auth',nonce,token},opener=window.opener;
   if(opener){const ack=event=>{if(validMessage(event,opener,nonce,'emoji:embed-auth-ack')){window.removeEventListener('message',ack);window.close();}};window.addEventListener('message',ack);opener.postMessage(message,location.origin);}
   if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('emoji-embed-auth-'+nonce);channel.postMessage(message);setTimeout(()=>channel.close(),1000);}
   onDone();
  }catch{onError();}
 }
 return {start,relay,complete,validMessage};
})();
