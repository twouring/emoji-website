/* Dynamic text interpolated into markup is escaped with esc(); amounts use numeric formatting. */
/* POS 會員：瀏覽與帳單身分完全分開；所有給點／空間兌換仍須掃本人會員卡及逐次認人。 */
let POS_MEMBERS={q:'',offset:0,next:null,list:[],detail:null,seq:0,busy:false};
function posMembershipLabel(plan){return ({day_4h:'單日 4 小時',day_12h:'單日 12 小時',month:'月會籍',quarter:'季會籍',year:'年會籍'})[plan]||plan;}
function posMembershipHistory(d,time){return `<h3>手動開通會籍紀錄</h3>${d.manual_grants?.length?`<ol class="members-ledger">${d.manual_grants.map(r=>`<li><b>${esc(posMembershipLabel(r.plan))}・立即啟用</b><p>開通時間：${esc(time(r.created_at))}</p><p>生效：${esc(time(r.starts_at))} ～ ${esc(time(r.ends_at))}（到期即失效）</p><p>原因：${esc(r.reason)}</p><p>經手人：${esc(r.operator_name||r.operator_id)}</p><p class="hint">手動權益授予，非付款紀錄</p></li>`).join('')}</ol>`:'<p class="hint">還沒有手動開通紀錄。</p>'}`;}
function tabPosMembers(){return '<div class="a-sec" id="members-body"></div>';}
function resetPosMembers(){POS_MEMBERS={q:'',offset:0,next:null,list:[],detail:null,seq:POS_MEMBERS.seq+1,busy:false};}
function paintPosMembers(){
  const host=document.getElementById('members-body');if(!host)return;
  const s=POS_MEMBERS,d=s.detail;
  const kinds={earn:'消費累點',grant:'手動給點',redeem:'點數兌換',expire:'點數到期',void_earn:'作廢扣回',void_redeem:'作廢退點'};
  const time=v=>v?new Date(v).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'—';
  host.innerHTML=`<div class="members-head"><h2>會員${typeof tipIcon==='function'?tipIcon('查會員、看點數、給點與兌換空間。這裡選的會員不會帶入結帳。'):''}</h2>
    <form id="members-search" class="members-tools"><input id="members-q" type="search" maxlength="80" value="${esc(s.q)}" placeholder="姓名或手機" aria-label="姓名或手機" autocomplete="off"><button class="btn" type="submit">搜尋</button><button class="btn btn--ghost" type="button" id="members-scan">掃會員</button></form></div>
    <div class="members-layout"><section aria-label="會員名單"><div class="members-list">${s.list.length?s.list.map(m=>`<button type="button" class="members-card${d?.member.id===m.id?' on':''}" data-member-id="${esc(m.id)}" aria-pressed="${d?.member.id===m.id}"><b>${esc(m.name||'未填姓名')}</b><span>${esc(m.phone||'未填手機')}</span></button>`).join(''):'<p class="hint">沒有符合的會員。搜尋不會建立帳號。</p>'}</div><div class="members-tools members-pager"><button class="btn btn--ghost" type="button" id="members-prev" ${s.offset?'':'disabled'}>上一頁</button><span>第 ${Math.floor(s.offset/25)+1} 頁</span><button class="btn btn--ghost" type="button" id="members-next" ${s.next===null?'disabled':''}>下一頁</button></div></section>
    <section class="members-detail" aria-label="會員資料" aria-live="polite">${d?`<div class="members-who"><h3>${esc(d.member.name||'未填姓名')}</h3><span>${esc(d.member.phone||'未填手機')} <span class="pill ${d.active?'pill-ok':'pill-wait'}">${d.active?'有效會籍':'註冊會員・無有效會籍'}</span></span><p class="members-balance"><b>${num(d.balance)}</b> 點可用</p></div><div class="members-tools"><button class="btn" type="button" id="members-activate" ${s.busy?'disabled':''}>手動開通會籍</button><button class="btn" type="button" id="members-grant" ${s.busy?'disabled':''}>手動給點</button><button class="btn" type="button" id="members-review" ${s.busy||d.reviewed?'disabled':''}>${d.reviewed?'已領 Google 評論點數':'Google 評論 +5 點'}</button><button class="btn btn--ghost" type="button" id="members-space" ${s.busy?'disabled':''}>兌換空間時數</button><button class="btn btn--ghost" type="button" id="members-refresh">重新整理</button></div><p class="hint">每次操作都要掃這位會員的會員卡，並輸入經手人識別碼。餐飲品項請在當次帳單兌換。</p>${posMembershipHistory(d,time)}<h3>點數紀錄</h3>${d.ledger.length?`<ol class="members-ledger">${d.ledger.map(r=>`<li><div><b>${esc(kinds[r.kind]||'點數異動')}</b><strong>${Number(r.delta)>0?'+':''}${num(r.delta)} 點</strong></div><time>${esc(time(r.created_at))}</time>${r.reason?`<p>原因：${esc(r.reason)}</p>`:''}${r.operator_name||r.operator_id?`<p>經手人：${esc(r.operator_name||r.operator_id)}</p>`:''}${r.expires_at?`<p class="hint">到期：${esc(time(r.expires_at))}</p>`:''}</li>`).join('')}</ol>`:'<p class="hint">還沒有點數紀錄。</p>'}${d.next_offset!==null?'<button class="btn btn--ghost" type="button" id="members-more">載入更多紀錄</button>':''}`:'<p class="hint">點選一位會員，查看會籍與點數紀錄。</p>'}</section></div>`;
  host.querySelector('#members-search').onsubmit=e=>{e.preventDefault();s.q=host.querySelector('#members-q').value.trim();s.offset=0;loadPosMembers();};
  host.querySelector('#members-prev').onclick=()=>{s.offset=Math.max(0,s.offset-25);loadPosMembers();};
  host.querySelector('#members-next').onclick=()=>{if(s.next!==null){s.offset=s.next;loadPosMembers();}};
  host.querySelectorAll('[data-member-id]').forEach(b=>b.onclick=()=>openPosMember(b.dataset.memberId));
  host.querySelector('#members-scan').onclick=async()=>{try{const token=await pickMemberCard();if(!token||s!==POS_MEMBERS)return;const out=await api('/admin/yan/lookup',{method:'POST',body:{token}});if(s===POS_MEMBERS&&out.verified&&out.member?.id)await openPosMember(out.member.id);}catch(e){toast(e.message);}};
  if(d){host.querySelector('#members-activate').onclick=()=>mutatePosMember('membership');host.querySelector('#members-grant').onclick=()=>mutatePosMember('grant');host.querySelector('#members-review').onclick=()=>mutatePosMember('review');host.querySelector('#members-space').onclick=()=>mutatePosMember('space');host.querySelector('#members-refresh').onclick=()=>openPosMember(d.member.id);const more=host.querySelector('#members-more');if(more)more.onclick=()=>openPosMember(d.member.id,d.next_offset);}
}
async function loadPosMembers(){
  const s=POS_MEMBERS,seq=++s.seq;
  try{const out=await api('/admin/yan/members?q='+encodeURIComponent(s.q)+'&offset='+s.offset);if(s!==POS_MEMBERS||seq!==s.seq)return;s.list=out.members;s.next=out.next_offset;paintPosMembers();}catch(e){if(seq===s.seq){const h=document.getElementById('members-body');if(h)h.innerHTML=`<h2>會員</h2><p role="alert">${esc(e.message)}</p><button class="btn" id="members-retry">重試</button>`;h?.querySelector('#members-retry')?.addEventListener('click',loadPosMembers);}}
}
async function openPosMember(id,offset=0){
  const s=POS_MEMBERS,seq=++s.seq;
  try{const out=await api('/admin/yan/members/'+encodeURIComponent(id)+'?offset='+offset);if(s!==POS_MEMBERS||seq!==s.seq)return;if(offset&&s.detail?.member.id===id)out.ledger=[...s.detail.ledger,...out.ledger];s.detail=out;paintPosMembers();}catch(e){if(seq===s.seq)toast(e.message);}
}
async function mutatePosMember(kind){
  const s=POS_MEMBERS,d=s.detail;if(!d||s.busy)return;
  s.busy=true;paintPosMembers();
  // Capture target before any dialog/await. Browsing another person must never retarget a mutation.
  const id=d.member.id,who=d.member.name||'會員';
  try{
    const token=await pickMemberCard();if(!token)return;
    const verified=await api('/admin/yan/lookup',{method:'POST',body:{token}});
    if(!verified.verified||verified.member?.id!==id){toast('會員卡與選取的會員不同，未執行操作。');return;}
    if(s!==POS_MEMBERS)return;
    let path,body,message;
    if(kind==='membership'){
      const available=await api('/admin/yan/membership-plans');
      const plan=await pickFrom({title:`替 ${who} 手動開通會籍`,hint:'立即啟用；不收款、不開發票，不建立付款紀錄。',cols:2,options:available.plans.map(p=>({value:p.plan,label:p.label,sub:p.duration}))});if(!plan)return;
      const selected=available.plans.find(p=>p.plan===plan);if(!selected)return;
      const reason=await pickReason({title:'開通原因（必填，永久留存）',presets:['系統漏開','客訴補償','活動贈送','權益補發'],placeholder:'其他原因',maxlength:80});if(!reason?.trim())return;
      if(!await posConfirm(`${who}（${d.member.phone||'未填手機'}）\n方案：${selected.label}\n確認後立即啟用，${selected.duration}；到期即失效。月／季／年依既有曆月與月底規則計算，不是固定天數。\n實際起迄時間以伺服器開通紀錄為準；不等待首次進場，也不套用 7 天待啟用。\n原因：${reason}\n僅授予會籍權益，不會建立付款、訂單或發票。已有有效／待啟用／未來會籍時不能重複開通。`,{ok:'確定立即開通'}))return;
      const old=s.activationAttempt;
      if(!old||old.user_id!==id||old.plan!==plan||old.reason!==reason)s.activationAttempt={user_id:id,plan,reason,request_id:crypto.randomUUID()};
      path='/admin/yan/activate-membership';body={...s.activationAttempt,member_token:token};message='已手動開通會籍（非付款）';
    }else if(kind==='grant'){
      const points=await pickAmount({title:`替 ${who} 手動給幾點？`,presets:[1,5,10,20],min:1,max:1000,unit:'點'});if(!points)return;
      const reason=await pickReason({title:'給點原因（必填，會記在帳本）',presets:['活動贈點','客訴補償','系統漏點','員工獎勵'],placeholder:'其他原因',maxlength:80});if(!reason?.trim())return;
      if(!await posConfirm(`${who}：給 ${points} 點\n原因：${reason}`,{ok:'確定給點'}))return;
      path='/admin/yan/grant';body={user_id:id,points,reason};message='已完成手動給點';
    }else if(kind==='review'){
      if(!await posConfirm(`${who}：Google 地圖評論 +5 點\n請先看過客人手機上已發布的評論。每位會員限領一次。`,{ok:'確認給 5 點'}))return;
      path='/admin/yan/grant';body={user_id:id,kind:'google_review'};message='已給 Google 評論 5 點';
    }else{
      const rw=spaceRewards(),opts=[['day_4h','單日 4 小時'],['day_12h','單日 12 小時']].filter(([k])=>rw[k]>0);
      if(!opts.length){toast('尚未開放空間時數兌換');return;}
      const plan=await pickFrom({title:'用點數兌換空間時數',hint:`${who}，目前 ${num(verified.balance??d.balance)} 點`,cols:2,options:opts.map(([k,label])=>({value:k,label,sub:rw[k]+' 點'}))});if(!plan)return;
      if(!await posConfirm(`${who}：扣 ${rw[plan]} 點兌換${opts.find(o=>o[0]===plan)[1]}？`,{ok:'確定兌換'}))return;
      path='/admin/yan/redeem-space';body={user_id:id,plan};message='已兌換空間時數';
    }
    if(s!==POS_MEMBERS)return;
    await ensureOperator(async()=>{if(s!==POS_MEMBERS)return;const result=await api(path,{method:'POST',body:{...body,operator_id:OPERATOR?.id,...(kind==='membership'?{operator_pin:OPERATOR?.pin}:{})}});if(kind==='membership'){s.activationAttempt=null;const time=v=>new Date(v).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});message=`${result.duplicate?'已確認原開通紀錄，未重複授予':'已立即開通會籍'}（非付款）\n生效：${time(result.grant.starts_at)} ～ ${time(result.grant.ends_at)}`;}toast(message);if(s.detail?.member.id===id)await openPosMember(id);});
  }catch(e){toast(e.message);}finally{s.busy=false;if(s===POS_MEMBERS)paintPosMembers();}
}
