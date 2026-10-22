/* 會員 App 活動報名頁（app.emoji.tw/e/<slug>）——規格 v2 §4.1：報名一律在 App，官網只展示。
   由 m.html 以 <script src="/m-event.js"> 載入，m.html 在 login() 之前分流到 MEvent.mount()，未登入也能瀏覽與以訪客身分報名。
   所有來自 API 的字串都經 esc() 再放進樣板；純函式另外掛在 MEvent 上方便 node 單元測試。 */
(function(root){
'use strict';
const L={
 zh:{loading:'載入中…',notFound:'找不到這個活動。',loadFail:'目前無法載入活動，請稍後再試。',back:'‹ 返回',site:'在官網看完整介紹 ↗',host:'主辦',when:'時間',where:'地點',tba:'時間待定',placeTba:'地點待定',free:'免費',
  ticket:'選擇票種',onSale:d=>d+' 開賣',ended:'已截止',until:d=>'售至 '+d,approval:'需審核',unlock:'有隱藏票解鎖碼？',unlockLabel:'隱藏票解鎖碼',unlockBtn:'解鎖票種',unlocked:'已更新可選票種',flex:'自訂金額（自由定價票）',flexHint:'留白使用建議票價',
  details:'報名資料',name:'姓名',first:'名',last:'姓',email:'Email',guestHint:'送出後會用這個 Email 建立言文字會員帳號（免密碼），之後用此 Email 登入 App 就能看票券。',as:n=>'以 '+n+' 報名',qty:'票數',qtyHint:'所有票券先使用購買者資料，報名後可逐張轉票。',
  about:'報名問題',select:'請選擇',agree:'我同意上述條款',terms:'查看條款',sign:'輸入簽名',coupon:'優惠碼（選填）',couponHint:'折扣會在付款頁顯示',
  venue:'＋場地茶飲費 NT$150／張（附茶飲一杯）',total:'合計',req:'標示 * 的為必填。',
  register:'立即報名',pay:'前往付款',request:'申請報名',waitlist:'加入候補',resume:'繼續付款',busy:'處理中…',
  wallet:'此活動需要錢包驗證，請在官網活動頁報名',walletBtn:'前往官網報名 ↗',external:'前往報名 ↗',externalNote:'此活動由主辦方在外部網站售票',private:'包場活動，不開放報名',
  closed:'目前不開放報名',notOpen:'目前不在報名期間',preview:'預告・報名尚未開放',full:'名額已滿',cancelled:'活動已取消',
  done:'報名完成',doneSub:'確認信與票券資訊會寄到你的 Email。',paidCheck:'付款確認中，稍後會寄出確認信。',canceledPay:'已取消付款',canceledSub:'名額會保留到結帳連結到期，可重新報名。',retry:'重新報名',
  pending_approval:'報名已送出，等待主辦人審核',waitlisted:'已加入候補；取得名額前尚未報名成功',declined:'主辦人未核准此次報名',approved:'已核准，請在 24 小時內付款完成報名',pending_payment:'等待付款',refund_pending:'退款處理中，票券暫停使用',capture_pending:'信用卡請款處理中，完成後才會核發票券',refunded:'已退款，原票券已失效',
  guestLogin:'用這個 Email 登入 App 查看票券',mine:'我的報名',show:'出示票券',cancel:'取消報名',refund:'退票',
  cancelConfirm:'確定取消報名？',refundConfirm:'確定退票？依退票規則，票價扣 10% 手續費後退回；場地茶飲費依規則處理。活動開始前 8 日內不可自助退票。',refundDone:(r,f)=>'已申請退票：退回 NT$'+r+'（手續費 NT$'+f+'）',cancelDone:'已取消報名',
  inviteBad:'這個邀請連結無效、已過期或已回覆。',invitedFor:'這封邀請是給',checked:'已完成簽到'},
 en:{loading:'Loading…',notFound:'Event not found.',loadFail:'Events are temporarily unavailable.',back:'‹ Back',site:'Full details on the website ↗',host:'Hosted by',when:'When',where:'Where',tba:'Time TBA',placeTba:'Location TBA',free:'Free',
  ticket:'Ticket type',onSale:d=>'On sale '+d,ended:'Sales ended',until:d=>'Until '+d,approval:'Approval required',unlock:'Have a hidden ticket code?',unlockLabel:'Hidden ticket code',unlockBtn:'Unlock tickets',unlocked:'Available tickets updated',flex:'Your amount (flexible price)',flexHint:'Blank uses suggested price',
  details:'Your details',name:'Name',first:'First name',last:'Last name',email:'Email',guestHint:'We will create a free member account with this email (no password). Sign in to the App with it to view your ticket.',as:n=>'Registering as '+n,qty:'Number of tickets',qtyHint:'All tickets use the buyer’s details first and can be transferred after registration.',
  about:'Questions',select:'Select…',agree:'I agree to these terms',terms:'Review terms',sign:'Type your signature',coupon:'Promo code (optional)',couponHint:'Discount is shown on the payment page',
  venue:'+ Venue & tea fee NT$150 per ticket (one drink included)',total:'Total',req:'Fields marked * are required.',
  register:'Register',pay:'Continue to payment',request:'Request to join',waitlist:'Join waitlist',resume:'Resume payment',busy:'Processing…',
  wallet:'This event requires wallet verification. Please register on the website.',walletBtn:'Register on the website ↗',external:'Register ↗',externalNote:'Tickets are sold on an external website',private:'Buyout event — registration is not open',
  closed:'Registration is closed',notOpen:'Registration is not currently open',preview:'Preview · Registration coming soon',full:'Sold out',cancelled:'Event cancelled',
  done:'Registration complete',doneSub:'Confirmation and ticket details will be emailed to you.',paidCheck:'Confirming payment. A confirmation email will follow.',canceledPay:'Payment canceled',canceledSub:'Your spot is held until checkout expires. You can register again.',retry:'Register again',
  pending_approval:'Request submitted. Awaiting host approval.',waitlisted:'You are on the waitlist. Your place is not confirmed yet.',declined:'The host declined this registration.',approved:'Approved. Pay within 24 hours to confirm.',pending_payment:'Payment pending',refund_pending:'Refund processing. Your ticket is inactive.',capture_pending:'Card capture is processing.',refunded:'Refunded. Your original ticket is no longer valid.',
  guestLogin:'Sign in to the App with this email to view your ticket',mine:'Your registration',show:'Show ticket',cancel:'Cancel registration',refund:'Request refund',
  cancelConfirm:'Cancel your registration?',refundConfirm:'Request a refund? Per policy, the ticket price is refunded minus a 10% fee; the venue fee follows the policy. Self-service refunds close 8 days before the event.',refundDone:(r,f)=>'Refund requested: NT$'+r+' (fee NT$'+f+')',cancelDone:'Registration cancelled',
  inviteBad:'This invitation link is invalid, expired, or already answered.',invitedFor:'This invitation is for',checked:'Checked in'},
 ja:{loading:'読み込み中…',notFound:'イベントが見つかりません。',loadFail:'現在イベントを読み込めません。',back:'‹ 戻る',site:'公式サイトで詳細を見る ↗',host:'主催',when:'日時',where:'場所',tba:'日時未定',placeTba:'場所未定',free:'無料',
  ticket:'チケット種類',onSale:d=>d+' 販売開始',ended:'販売終了',until:d=>d+' まで',approval:'承認制',unlock:'非公開チケットコードをお持ちですか？',unlockLabel:'非公開チケットコード',unlockBtn:'チケットを表示',unlocked:'選択可能なチケットを更新しました',flex:'希望金額（自由料金）',flexHint:'空欄は推奨料金',
  details:'申込情報',name:'氏名',first:'名',last:'姓',email:'メール',guestHint:'このメールで会員アカウント（パスワード不要）を作成します。App にログインするとチケットを確認できます。',as:n=>n+' として申し込む',qty:'チケット枚数',qtyHint:'すべてのチケットは購入者情報で発行され、申込後に個別譲渡できます。',
  about:'質問',select:'選択してください',agree:'上記の規約に同意します',terms:'規約を確認',sign:'署名を入力',coupon:'割引コード（任意）',couponHint:'割引は支払い画面で表示されます',
  venue:'＋会場・お茶代 NT$150／枚（ドリンク付き）',total:'合計',req:'* は必須項目です。',
  register:'申し込む',pay:'支払いへ進む',request:'参加を申請',waitlist:'キャンセル待ちに登録',resume:'支払いを続ける',busy:'処理中…',
  wallet:'このイベントはウォレット認証が必要です。公式サイトで申し込んでください。',walletBtn:'公式サイトで申し込む ↗',external:'申し込む ↗',externalNote:'外部サイトでチケットを販売しています',private:'貸切イベントのため申込できません',
  closed:'申込受付は終了しました',notOpen:'現在は申込受付期間外です',preview:'予告・申込受付前',full:'満席',cancelled:'イベント中止',
  done:'申込が完了しました',doneSub:'確認とチケット情報をメールでお送りします。',paidCheck:'支払いを確認中です。確認メールをお送りします。',canceledPay:'支払いはキャンセルされました',canceledSub:'Checkout の期限まで枠を確保します。再度お申し込みいただけます。',retry:'もう一度申し込む',
  pending_approval:'申込済み・主催者の承認待ち',waitlisted:'キャンセル待ちです。参加はまだ確定していません。',declined:'今回の申込は承認されませんでした。',approved:'承認済みです。24時間以内に支払いを完了してください。',pending_payment:'支払い待ち',refund_pending:'返金処理中のため、チケットは無効です。',capture_pending:'決済処理中です。',refunded:'返金済みです。元のチケットは無効です。',
  guestLogin:'このメールで App にログインしてチケットを確認',mine:'申込状況',show:'チケットを表示',cancel:'申込を取り消す',refund:'払い戻し',
  cancelConfirm:'申込を取り消しますか？',refundConfirm:'払い戻しを申請しますか？規定によりチケット代から手数料10%を差し引いて返金します。開催8日前以降はセルフ払い戻しできません。',refundDone:(r,f)=>'払い戻しを申請しました：NT$'+r+'（手数料 NT$'+f+'）',cancelDone:'申込を取り消しました',
  inviteBad:'この招待リンクは無効、期限切れ、または回答済みです。',invitedFor:'この招待の宛先',checked:'チェックイン済み'}
};
const VENUE_FEE_TWD=150,INVITE_KEY='tth_event_invite';
const ATTR_KEYS=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','ref','gclid','fbclid','li_fat_id'];
const BLOCKED=['pending_payment','approved','pending_approval','waitlisted','declined','refund_pending','capture_pending'];
/* ---- 純函式（node 測試用） ---- */
// /e/<slug> → slug；不是活動頁回 null
function slugFromPath(pathname){const m=/^\/e\/([^/?#]+)\/?$/.exec(pathname||'');if(!m)return null;try{return decodeURIComponent(m[1]);}catch{return null;}}
const money=(n,free)=>Number(n)>0?'NT$'+Number(n).toLocaleString('en-US'):(free||'NT$0');
const taxed=(e,p)=>e?.registration_settings?.tax?.enabled?p+Math.round(p*e.registration_settings.tax.rate_bps/10000):p;
// 會員活動（審核過的公開原生報名活動）每張票加收場地茶飲費（與 lib/venue-fees.js attendeeVenueFeePerTicket 同規則）
function venueFeePerTicket(e){return e&&e.review_status!=null&&e.visibility==='public'&&(e.registration_mode||'native')==='native'?VENUE_FEE_TWD:0;}
// 需要錢包驗證或 Token 票的活動暫不在 App 報名，導回官網
function needsWallet(e){const w=e?.registration_settings?.wallet_collection||{};return !!(w.ethereum||w.solana||(e?.tickets||[]).some(t=>t.active&&t.token_gate?.enabled));}
// 票種販售狀態：closes_at 為不含，午夜截止顯示前一天
function ticketSale(t,now,locale){const day=(iso,ex)=>new Date(Date.parse(iso)-(ex?60000:0)).toLocaleDateString(locale||'zh-TW',{month:'numeric',day:'numeric',timeZone:'Asia/Taipei'});
 if(t.opens_at&&now<Date.parse(t.opens_at))return {off:true,kind:'onSale',day:day(t.opens_at)};
 if(t.closes_at&&now>=Date.parse(t.closes_at))return {off:true,kind:'ended'};
 return {off:false,kind:t.closes_at?'until':'',day:t.closes_at?day(t.closes_at,true):''};}
// 合計：票價（含稅）× 張數 ＋ 場地茶飲費 × 張數
function orderTotal(e,ticket,qty,flexAmount){const n=Math.max(1,Number(qty)||1),base=ticket?(ticket.flexible_price&&flexAmount!==''&&flexAmount!=null?Number(flexAmount):ticket.price_twd):e.price_twd;return taxed(e,Number(base)||0)*n+venueFeePerTicket(e)*n;}
function attributionFrom(params,referrer){let src='direct';try{src=referrer?new URL(referrer).hostname:'direct';}catch{}const g=k=>params.get(k)||'';return {source:g('utm_source')||src,campaign:g('utm_campaign'),referral:g('ref'),medium:g('utm_medium'),content:g('utm_content'),term:g('utm_term'),gclid:g('gclid'),fbclid:g('fbclid'),li_fat_id:g('li_fat_id')};}
// 主按鈕文字（付費時帶金額）
function primaryLabel(e,t,total,T){const s=e.registration_settings||{},full=e.capacity>0&&e.reg_count>=e.capacity;if(full&&s.waitlist)return T.waitlist;if(s.requires_approval||t?.requires_approval)return T.request;if(e.registration_status==='pending_payment')return T.resume+(total>0?' · '+money(total):'');return total>0?T.pay+' · '+money(total):T.register;}
// 組 POST /api/events/:id/register 的 body（欄位同官網 register()）
function buildRegisterBody(e,get,getAll,ctx){const qs=e.registration_settings?.questions||[];const v=k=>get(k)||undefined;
 return {lang:ctx.lang,quantity:Number(get('quantity')||1),attribution:ctx.attribution,invite_token:ctx.inviteToken||undefined,name:v('name'),email:v('email'),first_name:v('first_name'),last_name:v('last_name'),ticket_id:v('ticket_id'),unlock_code:v('unlock_code'),amount_twd:v('amount_twd'),coupon_code:v('coupon_code'),
  answers:Object.fromEntries(qs.map(q=>[q.id,q.type==='multiple'?getAll(q.id):q.type==='terms'&&q.terms?{accepted:!!get(q.id),reviewed:get(q.id+'__reviewed')==='1',signature:get(q.id+'__signature')||''}:['checkbox','terms'].includes(q.type)?!!get(q.id):get(q.id)||'']))};}

/* ---- 畫面 ---- */
const CSS=`.mev{padding-bottom:110px}.mev .cover{width:100%;border-radius:16px;margin-bottom:14px;aspect-ratio:16/9;object-fit:cover;background:var(--alt)}.mev h1{font-size:1.5rem;margin:6px 0 10px}.mev .facts{color:var(--soft)}.mev .facts p{margin:4px 0}.mev .desc{white-space:pre-wrap;color:var(--soft)}.mev .tk{display:flex;gap:12px;align-items:flex-start;min-height:56px;border:1.5px solid var(--line);border-radius:14px;padding:12px 14px;margin-bottom:8px;background:var(--card)}.mev .tk input{width:22px;height:22px;margin-top:2px}.mev .tk.off{opacity:.55}.mev .tk span{flex:1}.mev .tk small{display:block;color:var(--muted)}.mev .tk:has(input:checked){border-color:var(--ink)}.mev fieldset{border:0;padding:0;margin:14px 0 0}.mev legend{color:var(--soft);padding:0}.mev .req{color:#B3261E}.mev .note{color:var(--muted);font-size:1rem}.mev .alert{border:1.5px solid #B3261E;border-radius:12px;padding:12px 14px;color:#B3261E;background:var(--card)}.mev .ok{border:1.5px solid var(--ink);border-radius:16px;padding:16px;background:var(--accent)}.mev .sum{display:flex;justify-content:space-between;margin-top:8px}.mev details{margin-top:12px}.mev summary{min-height:44px;display:flex;align-items:center;cursor:pointer}.mev-bar{position:fixed;left:0;right:0;bottom:0;z-index:40;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:rgba(251,250,246,.97);border-top:1px solid var(--line)}.mev-bar .btn{max-width:480px;margin:0 auto}`;
function mount(o){
 const {app,tabs,esc,toast}=o,lang=['en','ja'].includes(o.lang)?o.lang:'zh',T=L[lang],locale=lang==='zh'?'zh-TW':lang==='ja'?'ja-JP':'en-US',slug=o.slug;
 const query=new URLSearchParams(location.search),embedded=query.get('embed')==='1',attribution=attributionFrom(query,document.referrer);
 const hash=new URLSearchParams(location.hash.slice(1));let inviteToken=hash.get('invite')||'';
 try{if(inviteToken)sessionStorage.setItem(INVITE_KEY,inviteToken);else inviteToken=sessionStorage.getItem(INVITE_KEY)||'';}catch{}
 if(hash.has('invite'))history.replaceState(null,'',location.pathname+location.search);
 if(tabs)tabs.hidden=true;
 if(!document.getElementById('mev-css')){const s=document.createElement('style');s.id='mev-css';s.textContent=CSS;document.head.append(s);}
 const tok=()=>o.token()||'';
 async function api(path,opt={}){const h={'content-type':'application/json'};if(tok())h.authorization='Bearer '+tok();const r=await fetch('/api'+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined});let d={};try{d=await r.json();}catch{}if(!r.ok){const err=new Error(d.error||T.loadFail);err.status=r.status;throw err;}return d;}
 const siteUrl=()=>(o.site||'')+(lang==='zh'?'':'/'+lang)+'/events/'+encodeURIComponent(slug);
 const shell=(inner,bar)=>{app.innerHTML=`<div class="mev"><div class="hello"><button class="btn" id="mev-back" type="button">${esc(T.back)}</button></div>${inner}</div>${bar?`<div class="mev-bar">${bar}</div>`:''}`;const b=document.getElementById('mev-back');if(b){b.hidden=embedded;b.onclick=()=>{if(history.length>1)history.back();else location.href=o.home||'/';};}window.scrollTo(0,0);};
 let banner='';
 async function load(){
  shell(`<p class="empty">${esc(T.loading)}</p>`);
  let e;try{e=(await api('/events/'+encodeURIComponent(slug)+'?lang='+lang+(attribution.referral?'&ref='+encodeURIComponent(attribution.referral):''))).event;}catch(err){return shell(`<p class="empty">${esc(err.status===404?T.notFound:err.message)}</p>`);}
  if(!e)return shell(`<p class="empty">${esc(T.notFound)}</p>`);
  // 舊網址（slug 已改）→ 換成目前網址
  if(e.slug&&e.slug!==slug)history.replaceState(null,'','/e/'+encodeURIComponent(e.slug)+location.search);
  if(inviteToken){try{const inv=await api('/events/'+e.id+'/invitation',{method:'POST',body:{token:inviteToken,action:'preview'}});if(['invited','pending_payment'].includes(inv.status)){e.viewer=inv.viewer;e.registration_status=inv.status;e.invited_via_link=inv.status==='invited';}else if(inv.status==='registered'){e.viewer=inv.viewer;e.guest_submitted=true;e.registration_status='registered';}else throw 0;}catch{e.invite_error=T.inviteBad;inviteToken='';try{sessionStorage.removeItem(INVITE_KEY);}catch{}}}
  render(e);
 }
 function head(e){const d=e.event_details||{};return `${d.cover_url?`<img class="cover" src="${esc(d.cover_url)}" alt="">`:''}<h1>${esc(e.title)}</h1><div class="facts"><p><b>${esc(T.when)}</b> ${esc([e.starts_at,e.ends_at].filter(Boolean).join(' – ')||T.tba)}</p><p><b>${esc(T.where)}</b> ${esc(e.location||T.placeTba)}</p>${e.host_names?.length?`<p><b>${esc(T.host)}</b> ${e.host_names.map(esc).join(' · ')}</p>`:''}</div>${e.description?`<p class="desc">${esc(e.description)}</p>`:''}<p><a href="${esc(siteUrl())}" target="_blank" rel="noopener">${esc(T.site)}</a></p>`;}
 function ticketCards(e,tickets){const now=Date.now(),open=tickets.filter(t=>!ticketSale(t,now,locale).off),pre=query.get('tt')||query.get('ticket_id'),pick=(open.find(t=>t.id===pre)||(open.length===1?open[0]:null))?.id;
  return tickets.map(t=>{const s=ticketSale(t,now,locale),note=s.kind==='onSale'?T.onSale(s.day):s.kind==='ended'?T.ended:s.kind==='until'?T.until(s.day):(t.description||'');return `<label class="tk${s.off?' off':''}"><input type="radio" name="ticket_id" value="${esc(t.id)}" required ${s.off?'disabled':''}${t.id===pick?' checked':''}><span><b>${esc(t.name)}${t.requires_approval?' · '+esc(T.approval):''}</b>${note?`<small>${esc(note)}</small>`:''}</span><b>${esc(money(taxed(e,t.price_twd),T.free))}</b></label>`;}).join('');}
 function questionField(q){const label=esc(q.translations?.[lang]||q.label),name=esc(q.id),req=q.required?'required':'',mark=q.required?'<span class="req" aria-hidden="true"> *</span>':'',opt=(v,i)=>esc(q.option_translations?.[lang]?.[i]||v);
  if(q.type==='long')return `<label class="field">${label}${mark}<textarea name="${name}" maxlength="10000" ${req}></textarea></label>`;
  if(q.type==='single'&&(q.options||[]).length<=4)return `<fieldset data-q="${name}"><legend>${label}${mark}</legend>${q.options.map((v,i)=>`<label class="chk"><input type="radio" name="${name}" value="${esc(v)}" ${req}> ${opt(v,i)}</label>`).join('')}</fieldset>`;
  if(q.type==='single')return `<label class="field">${label}${mark}<select name="${name}" ${req}><option value="">${esc(T.select)}</option>${q.options.map((v,i)=>`<option value="${esc(v)}">${opt(v,i)}</option>`).join('')}</select></label>`;
  if(q.type==='multiple')return `<fieldset data-multiple="${name}" data-required="${q.required?1:''}"><legend>${label}${mark}</legend>${(q.options||[]).map((v,i)=>`<label class="chk"><input type="checkbox" name="${name}" value="${esc(v)}"> ${opt(v,i)}</label>`).join('')}</fieldset>`;
  if(q.type==='terms'&&q.terms){const t=q.terms,content=t.content?.[lang]||t.content?.zh||'',locked=t.show_before_accept;return `<fieldset data-terms="${name}"><legend>${label}${mark}</legend>${t.kind==='link'?`<p><a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer" data-terms-review="${name}">${esc(T.terms)} ↗</a></p>`:`<details data-terms-review="${name}"><summary>${esc(T.terms)}</summary><div class="desc">${content /* 條款內文為伺服器端已清洗的 rich text（與官網 events.html 同一來源），故不再 esc */}</div></details>`}<input type="hidden" name="${name}__reviewed" value="${locked?'':'1'}"><label class="chk"><input type="checkbox" name="${name}" ${req} ${locked?'disabled':''}> ${esc(T.agree)}</label>${t.require_signature?`<label class="field">${esc(T.sign)}<input name="${name}__signature" maxlength="200" ${req}></label>`:''}</fieldset>`;}
  if(['checkbox','terms'].includes(q.type))return `<label class="chk"><input type="checkbox" name="${name}" ${req}> ${label}${mark}</label>`;
  const type=q.type==='phone'?'tel':q.type==='url'||q.type==='website'?'url':q.type==='email'?'email':'text';
  return `<label class="field">${label}${mark}<input name="${name}" type="${type}" maxlength="10000" ${req}></label>`;}
 function statusView(e){
  const s=e.registration_status,ok=e.registered||s==='registered';
  if(e.guest_submitted)return `<section class="sec ok" role="status"><h2>${esc(ok?T.done:T[s]||T.done)}</h2><p>${esc(T.doneSub)}</p><a class="btn solid" href="${esc(o.home||'/')}">${esc(T.guestLogin)}</a></section>`;
  if(ok){const paid=Number(e.amount_paid||0)>0,canSelf=!e.recipient_only&&!e.checked_in_at;return `<section class="sec"><h2>${esc(T.mine)}</h2>${e.checked_in_at?`<p><span class="pill on">${esc(T.checked)}</span></p>`:''}<button class="btn solid" id="mev-ticket" type="button">${esc(T.show)}</button>${canSelf?`<button class="quiet" id="mev-cancel" type="button" data-paid="${paid?1:''}">${esc(paid?T.refund:T.cancel)}</button>`:''}</section>`;}
  if(['pending_approval','waitlisted','declined','refund_pending','capture_pending','refunded'].includes(s))return `<section class="sec tile" role="status"><p>${esc(T[s])}</p>${['pending_approval','waitlisted'].includes(s)&&tok()?`<button class="quiet" id="mev-cancel" type="button">${esc(T.cancel)}</button>`:''}</section>`;
  return '';}
 function render(e){
  const s=e.registration_settings||{},mode=e.registration_mode||'native',top=head(e)+(banner||'')+(e.invite_error?`<p class="alert" role="alert">${esc(e.invite_error)}</p>`:'');
  if(mode==='closed')return shell(`<h1>${esc(T.private)}</h1>`);
  if(mode==='external'){const u=(()=>{try{const x=new URL(e.registration_url);if(!x.searchParams.has('utm_source'))x.searchParams.set('utm_source','emoji');return x.href;}catch{return '';}})();return shell(top+`<p class="note">${esc(T.externalNote)}</p>`,u&&['預告','報名中'].includes(e.status)?`<a class="btn solid" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(T.external)}</a>`:'');}
  const sv=statusView(e);if(sv)return bindStatus(e,shell(top+sv));
  const notice=t=>shell(top+`<p class="tile" role="status">${esc(t)}</p>`);
  if(e.status==='已取消')return notice(T.cancelled);
  if(e.status==='預告')return notice(T.preview);
  if(e.status!=='報名中'&&e.registration_status!=='approved')return notice(T.closed);
  if((s.opens_at&&Date.now()<Date.parse(s.opens_at))||(s.closes_at&&Date.now()>=Date.parse(s.closes_at)))return notice(T.notOpen);
  if(e.capacity>0&&e.reg_count>=e.capacity&&!s.waitlist&&!BLOCKED.includes(e.registration_status))return notice(T.full);
  if(needsWallet(e))return shell(top+`<section class="sec tile" role="status"><p>${esc(T.wallet)}</p><a class="btn solid" href="${esc(siteUrl())}" target="_blank" rel="noopener">${esc(T.walletBtn)}</a></section>`);
  const tickets=(e.tickets||[]).filter(t=>t.active),hasTickets=!!(e.has_ticket_types||tickets.length),viewer=e.viewer||o.me||null,req='<span class="req" aria-hidden="true"> *</span>';
  const ticketBlock=hasTickets&&e.registration_status!=='approved'?`<fieldset class="sec" id="mev-tickets"><legend><h2>${esc(T.ticket)}</h2></legend><div id="mev-ticket-list">${ticketCards(e,tickets)}</div><label class="field" id="mev-flex" hidden>${esc(T.flex)}<input name="amount_twd" type="number" min="0" step="1" inputmode="numeric" placeholder="${esc(T.flexHint)}"></label><details${query.get('unlock_code')?' open':''}><summary>${esc(T.unlock)}</summary><label class="field">${esc(T.unlockLabel)}<input name="unlock_code" maxlength="64" autocomplete="off" value="${esc((query.get('unlock_code')||'').slice(0,64))}"></label><button class="btn" type="button" id="mev-unlock">${esc(T.unlockBtn)}</button></details></fieldset>`:'';
  const qtyBlock=s.group_registration!==false&&e.registration_status!=='approved'?`<label class="field">${esc(T.qty)}<input name="quantity" id="mev-qty" type="number" inputmode="numeric" min="1" max="${e.capacity>0?Math.max(1,Math.min(1000,e.capacity-e.reg_count)):1000}" value="1" required></label><p class="note">${esc(T.qtyHint)}</p>`:'';
  const idBlock=e.invited_via_link?`<p class="tile">${esc(T.invitedFor)} <b>${esc(viewer?.name)}</b> · ${esc(viewer?.email)}</p>`:tok()&&viewer?`<p class="tile">${esc(T.as(viewer.name||viewer.email||''))}</p>`:(s.split_name?`<label class="field">${esc(T.last)}${req}<input name="last_name" maxlength="60" required autocomplete="family-name"></label><label class="field">${esc(T.first)}${req}<input name="first_name" maxlength="60" required autocomplete="given-name"></label>`:`<label class="field">${esc(T.name)}${req}<input name="name" maxlength="120" required autocomplete="name"></label>`)+`<label class="field">${esc(T.email)}${req}<input name="email" type="email" maxlength="254" required autocomplete="email" inputmode="email"></label><p class="note">${esc(T.guestHint)}</p>`;
  const qs=(s.questions||[]).map(questionField).join(''),fee=venueFeePerTicket(e);
  const coupon=(query.get('coupon')||query.get('coupon_code')||'').slice(0,64);
  const form=`<form id="mev-form" novalidate><p class="note">${esc(T.req)}</p>${ticketBlock}<section class="sec"><h2>${esc(T.details)}</h2>${idBlock}${qtyBlock}</section>${qs?`<section class="sec"><h2>${esc(T.about)}</h2>${qs}</section>`:''}<details${coupon?' open':''}><summary>${esc(T.coupon)}</summary><label class="field">${esc(T.coupon)}<input name="coupon_code" maxlength="64" value="${esc(coupon)}"></label><p class="note">${esc(T.couponHint)}</p></details><section class="sec" id="mev-sum"></section><p class="alert" id="mev-err" role="alert" hidden></p></form>`;
  shell(top+form,`<button class="btn solid" id="mev-go" type="submit" form="mev-form">${esc(T.register)}</button>`);
  const f=document.getElementById('mev-form'),go=document.getElementById('mev-go');
  const selected=()=>(e.tickets||[]).find(t=>t.id===f.querySelector('[name="ticket_id"]:checked')?.value)||null;
  const sync=()=>{const t=selected(),flex=document.getElementById('mev-flex');if(flex){flex.hidden=!t?.flexible_price;flex.querySelector('input').min=t?.minimum_twd||0;}
   const qty=Number(f.querySelector('[name="quantity"]')?.value||e.quantity||1)||1,amount=e.registration_status==='approved'?Number(e.amount_due||0):orderTotal(e,hasTickets?t:null,qty,f.querySelector('[name="amount_twd"]')?.value);
   const ticketPrice=hasTickets?(t?taxed(e,t.price_twd):null):taxed(e,e.price_twd);
   document.getElementById('mev-sum').innerHTML=fee&&e.registration_status!=='approved'?`<div class="sum"><span>${esc(T.ticket)}</span><span>${ticketPrice==null?'—':esc(money(ticketPrice,T.free))} × ${qty}</span></div><p class="note">${esc(T.venue)}</p><div class="sum"><b>${esc(T.total)}</b><b>${esc(money(amount,T.free))}</b></div>`:amount>0?`<div class="sum"><b>${esc(T.total)}</b><b>${esc(money(amount))}</b></div>`:'';
   go.textContent=primaryLabel(e,t,hasTickets&&!t&&e.registration_status!=='approved'?0:amount,T);};
  f.addEventListener('change',sync);f.addEventListener('input',ev=>{if(['quantity','amount_twd'].includes(ev.target.name))sync();});sync();
  // 條款：看過（展開或點連結）才能勾選
  f.querySelectorAll('[data-terms-review]').forEach(el=>{const n=el.dataset.termsReview,mark=()=>{f.querySelector(`[name="${n}__reviewed"]`).value='1';f.querySelector(`input[type=checkbox][name="${n}"]`).disabled=false;};el.addEventListener(el.tagName==='DETAILS'?'toggle':'click',mark);});
  const unlock=async code=>{const out=await api('/events/'+e.id+'/ticket-options',{method:'POST',body:{unlock_code:code}});e.tickets=out.tickets||[];document.getElementById('mev-ticket-list').innerHTML=ticketCards(e,e.tickets.filter(t=>t.active));sync();};
  document.getElementById('mev-unlock')?.addEventListener('click',async()=>{try{await unlock(f.querySelector('[name="unlock_code"]').value);toast(T.unlocked);}catch(err){toast(err.message);}});
  const preUnlock=(query.get('unlock_code')||coupon||'').slice(0,64);if(preUnlock&&document.getElementById('mev-unlock'))unlock(preUnlock).catch(()=>{});
  f.onsubmit=ev=>{ev.preventDefault();submit(e,f,go);};
 }
 function firstInvalid(f){for(const el of f.querySelectorAll('input,select,textarea')){if(el.disabled&&el.type!=='checkbox')continue;if(!el.checkValidity())return el;}for(const fs of f.querySelectorAll('[data-multiple][data-required="1"]'))if(!fs.querySelector('input:checked'))return fs.querySelector('input');return null;}
 function showError(msg,el){const box=document.getElementById('mev-err');box.textContent=msg;box.hidden=false;const target=el||box;target.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>target.focus?.({preventScroll:true}),200);}
 async function submit(e,f,go){
  if(go.disabled)return;const bad=firstInvalid(f);if(bad)return showError(bad.validationMessage||T.req,bad);
  const data=new FormData(f),label=go.textContent;go.disabled=true;go.setAttribute('aria-busy','true');go.textContent=T.busy;document.getElementById('mev-err').hidden=true;
  const body=buildRegisterBody(e,k=>data.get(k),k=>data.getAll(k),{lang,attribution,inviteToken});
  try{const out=await api('/events/'+encodeURIComponent(e.id)+'/register',{method:'POST',body});
   if(out.url){if(embedded){window.open(out.url,'_blank','noopener');go.textContent=label;go.disabled=false;go.setAttribute('aria-busy','false');return;}location.href=out.url;return;}
   inviteToken='';try{sessionStorage.removeItem(INVITE_KEY);}catch{}
   if(out.guest){e.guest_submitted=true;e.registration_status=out.status||'registered';e.registered=e.registration_status==='registered';return render(e);}
   banner=resultBanner(out.status||'registered');await load();
  }catch(err){go.disabled=false;go.setAttribute('aria-busy','false');go.textContent=label;showError(err.message);}
 }
 function resultBanner(status){if(status==='registered'||status==='paid')return `<section class="sec ok" role="status"><h2>${esc(T.done)}</h2><p>${esc(T.doneSub)}</p></section>`;if(status==='canceled')return `<section class="sec tile" role="status"><h2>${esc(T.canceledPay)}</h2><p>${esc(T.canceledSub)}</p></section>`;if(status==='checking')return `<section class="sec tile" role="status"><p>${esc(T.paidCheck)}</p></section>`;return T[status]?`<section class="sec tile" role="status"><p>${esc(T[status])}</p></section>`:'';}
 function bindStatus(e){
  document.getElementById('mev-ticket')?.addEventListener('click',()=>o.openTicket&&o.openTicket(e.id));
  const c=document.getElementById('mev-cancel');if(c)c.onclick=async()=>{if(!confirm(c.dataset.paid?T.refundConfirm:T.cancelConfirm))return;c.disabled=true;try{const out=await api('/events/'+encodeURIComponent(e.id)+'/register',{method:'DELETE'});toast(out.refund_twd>0||out.fee_twd>0?T.refundDone(Number(out.refund_twd||0).toLocaleString('en-US'),Number(out.fee_twd||0).toLocaleString('en-US')):T.cancelDone);banner='';await load();}catch(err){toast(err.message);c.disabled=false;}};
 }
 // 付款回傳：?result=paid&s=<session> → 核對後顯示「報名完成」；?result=canceled → 已取消付款；其他狀態（舊結果頁轉來）直接顯示文案
 (async()=>{const result=query.get('result');if(result){const sid=query.get('s');if(result==='paid'&&sid){try{const v=await api('/events/checkout/verify',{method:'POST',body:{session_id:sid}});banner=resultBanner(v.paid||v.status==='registered'?'paid':'checking');}catch{banner=resultBanner('checking');}}else banner=resultBanner(result==='paid'?'checking':result);
  const q=new URLSearchParams(location.search);q.delete('result');q.delete('s');history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:''));}
  await load();})();
}
const MEvent={slugFromPath,mount,venueFeePerTicket,needsWallet,ticketSale,orderTotal,attributionFrom,primaryLabel,buildRegisterBody,money,L,VENUE_FEE_TWD};
if(typeof module!=='undefined'&&module.exports)module.exports=MEvent;else root.MEvent=MEvent;
})(typeof window!=='undefined'?window:globalThis);
