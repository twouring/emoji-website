/* Dynamic text interpolated into markup is escaped with esc(); amounts use numeric formatting. */
/* POS 會員：瀏覽與帳單身分完全分開；所有給點／空間兌換仍須掃本人會員卡及逐次認人。 */
let POS_MEMBERS={q:'',offset:0,next:null,list:[],detail:null,seq:0,busy:false};
function tabPosMembers(){return '<div class="a-sec" id="members-body"></div>';}
function resetPosMembers(){POS_MEMBERS={q:'',offset:0,next:null,list:[],detail:null,seq:POS_MEMBERS.seq+1,busy:false};}
function paintPosMembers(){
  const host=document.getElementById('members-body');if(!host)return;
  const s=POS_MEMBERS,d=s.detail;
  const kinds={earn:'消費累點',grant:'手動給點',redeem:'點數兌換',expire:'點數到期',void_earn:'作廢扣回',void_redeem:'作廢退點'};
  const time=v=>v?new Date(v).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'—';
  host.innerHTML=`<h2>會員</h2><p class="hint">查會員、看點數、給點與兌換空間。這裡選的會員不會帶入結帳。</p>
    <form id="members-search" class="members-tools"><label>姓名或手機<input id="members-q" type="search" maxlength="80" value="${esc(s.q)}" placeholder="輸入姓名或手機" autocomplete="off"></label><button class="btn" type="submit">搜尋</button><button class="btn btn--ghost" type="button" id="members-scan">掃會員</button></form>
    <div class="members-layout"><section aria-label="會員名單"><div class="members-list">${s.list.length?s.list.map(m=>`<button type="button" class="members-card${d?.member.id===m.id?' on':''}" data-member-id="${esc(m.id)}" aria-pressed="${d?.member.id===m.id}"><b>${esc(m.name||'未填姓名')}</b><span>${esc(m.phone||'未填手機')}</span></button>`).join(''):'<p class="hint">沒有符合的會員。搜尋不會建立帳號。</p>'}</div><div class="members-tools"><button class="btn btn--ghost" type="button" id="members-prev" ${s.offset?'':'disabled'}>上一頁</button><span>第 ${Math.floor(s.offset/25)+1} 頁</span><button class="btn btn--ghost" type="button" id="members-next" ${s.next===null?'disabled':''}>下一頁</button></div></section>
    <section class="members-detail" aria-label="會員資料" aria-live="polite">${d?`<h3>${esc(d.member.name||'未填姓名')}</h3><p>${esc(d.member.phone||'未填手機')} <span class="pill ${d.active?'pill-ok':'pill-wait'}">${d.active?'有效會籍':'註冊會員・無有效會籍'}</span></p><p class="members-balance"><b>${num(d.balance)}</b> 點可用</p><div class="members-tools"><button class="btn" type="button" id="members-grant" ${s.busy?'disabled':''}>手動給點</button><button class="btn btn--ghost" type="button" id="members-space" ${s.busy?'disabled':''}>兌換空間時數</button><button class="btn btn--ghost" type="button" id="members-refresh">重新整理</button></div><p class="hint">每次操作都要掃這位會員的會員卡，並輸入經手人識別碼。餐飲品項請在當次帳單兌換。</p><h3>點數紀錄</h3>${d.ledger.length?`<ol class="members-ledger">${d.ledger.map(r=>`<li><div><b>${esc(kinds[r.kind]||'點數異動')}</b><strong>${Number(r.delta)>0?'+':''}${num(r.delta)} 點</strong></div><time>${esc(time(r.created_at))}</time>${r.reason?`<p>原因：${esc(r.reason)}</p>`:''}${r.operator_name||r.operator_id?`<p>經手人：${esc(r.operator_name||r.operator_id)}</p>`:''}${r.expires_at?`<p class="hint">到期：${esc(time(r.expires_at))}</p>`:''}</li>`).join('')}</ol>`:'<p class="hint">還沒有點數紀錄。</p>'}${d.next_offset!==null?'<button class="btn btn--ghost" type="button" id="members-more">載入更多紀錄</button>':''}`:'<p class="hint">點選一位會員，查看會籍與點數紀錄。</p>'}</section></div>`;
  host.querySelector('#members-search').onsubmit=e=>{e.preventDefault();s.q=host.querySelector('#members-q').value.trim();s.offset=0;loadPosMembers();};
  host.querySelector('#members-prev').onclick=()=>{s.offset=Math.max(0,s.offset-25);loadPosMembers();};
  host.querySelector('#members-next').onclick=()=>{if(s.next!==null){s.offset=s.next;loadPosMembers();}};
  host.querySelectorAll('[data-member-id]').forEach(b=>b.onclick=()=>openPosMember(b.dataset.memberId));
  host.querySelector('#members-scan').onclick=async()=>{try{const token=await pickMemberCard();if(!token||s!==POS_MEMBERS)return;const out=await api('/admin/yan/lookup',{method:'POST',body:{token}});if(s===POS_MEMBERS&&out.verified&&out.member?.id)await openPosMember(out.member.id);}catch(e){toast(e.message);}};
  if(d){host.querySelector('#members-grant').onclick=()=>mutatePosMember('grant');host.querySelector('#members-space').onclick=()=>mutatePosMember('space');host.querySelector('#members-refresh').onclick=()=>openPosMember(d.member.id);const more=host.querySelector('#members-more');if(more)more.onclick=()=>openPosMember(d.member.id,d.next_offset);}
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
    if(kind==='grant'){
      const points=await pickAmount({title:`替 ${who} 手動給幾點？`,presets:[1,5,10,20],min:1,max:1000,unit:'點'});if(!points)return;
      const reason=await pickReason({title:'給點原因（必填，會記在帳本）',presets:['活動贈點','客訴補償','系統漏點','員工獎勵'],placeholder:'其他原因',maxlength:80});if(!reason?.trim())return;
      if(!await posConfirm(`${who}：給 ${points} 點\n原因：${reason}`,{ok:'確定給點'}))return;
      path='/admin/yan/grant';body={user_id:id,points,reason};message='已完成手動給點';
    }else{
      const rw=spaceRewards(),opts=[['day_4h','單日 4 小時'],['day_12h','單日 12 小時']].filter(([k])=>rw[k]>0);
      if(!opts.length){toast('尚未開放空間時數兌換');return;}
      const plan=await pickFrom({title:'用點數兌換空間時數',hint:`${who}，目前 ${num(verified.balance??d.balance)} 點`,cols:2,options:opts.map(([k,label])=>({value:k,label,sub:rw[k]+' 點'}))});if(!plan)return;
      if(!await posConfirm(`${who}：扣 ${rw[plan]} 點兌換${opts.find(o=>o[0]===plan)[1]}？`,{ok:'確定兌換'}))return;
      path='/admin/yan/redeem-space';body={user_id:id,plan};message='已兌換空間時數';
    }
    if(s!==POS_MEMBERS)return;
    await ensureOperator(async()=>{if(s!==POS_MEMBERS)return;await api(path,{method:'POST',body:{...body,operator_id:OPERATOR?.id}});toast(message);if(s.detail?.member.id===id)await openPosMember(id);});
  }catch(e){toast(e.message);}finally{s.busy=false;if(s===POS_MEMBERS)paintPosMembers();}
}
