'use strict';
const orders=require('./table-orders');
// Immutable submission identity follows ticket through split payments and table moves.
// Unsubmitted counter/prepaid lines become one fallback job at persisted payment.
function jobsOf(sources){
 const jobs=new Map();
 for(const s of sources){
  if(s.status==='void')continue;
  for(const l of s.items||[]){
   if(l.cancelled||l.song||l.tip||l.cat==='SHOP')continue;   // 點歌、打賞、商店零售品不是餐點，不上出餐單
   const id=l.ticket||(s.session_id?s.id:null);
   if(!id)continue;
   if(!jobs.has(id))jobs.set(id,{id,table_no:s.table_no,status:l.ticket?'placed':s.status,placed_at:l.placed_at||s.paid_at||new Date().toISOString(),items:[]});
   const j=jobs.get(id);if(!j.items.some(x=>x.line===l.line)){
    const {guest,...line}=l;j.items.push(line);
   }
  }
 }
 return [...jobs.values()].flatMap(j=>{
  const venues=[...new Set(j.items.map(l=>l.venue))];
  if(venues.length<2)return [{...j,amount:orders.sum(j.items)}];
  return venues.map(venue=>{const items=j.items.filter(l=>l.venue===venue);return {...j,id:j.id+'_'+venue,source_id:j.id,venue,items,amount:orders.sum(items)};});
 });
}
// 帳本夾點餐明細的整桌累計：這桌目前所有未取消品項（含已結的，不含預收抵扣行）＋三點水服務費；人數取開桌時登記
function tableTotal(session,now=Date.now()){
 if(!session||orders.isTakeout(session.table_no))return null;
 const lines=(session.items||[]).filter(l=>!l.cancelled&&l.credit_of==null&&!l.prepay);
 if(!lines.length)return null;
 const amount=orders.sum(lines),sc=orders.MenuLib.serviceCharge(lines,{takeout:false,now});
 const service=sc?sc.amount:0;
 return {amount,service,total:amount+service,count:lines.reduce((a,l)=>a+(Number(l.qty)||0),0),party:orders.partySize?orders.partySize(session.party_votes):null};
}
async function enqueue(query,sources){
 for(const job of jobsOf(sources))await query('INSERT INTO pos_kitchen_print_jobs(id,job) VALUES($1,$2) ON CONFLICT (id) DO NOTHING',[job.id,JSON.stringify(job)]);
}
async function claim(query,id,venues,actor,operator){
 const row=(await query('SELECT job FROM pos_kitchen_print_jobs WHERE id=$1',[id])).rows[0];
 if(!row||!orders.orderOwnedByVenues(row.job,venues))return null;
 const sources=(await query(`SELECT s.id,NULL::text AS session_id,s.table_no,'placed'::text AS status,s.items,NULL::timestamptz AS paid_at
 FROM table_sessions s WHERE s.status='open' AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.items) l WHERE l->>'ticket'=$1 AND COALESCE(l->>'order_id','')='')
 UNION ALL SELECT o.id,o.session_id,o.table_no,o.status,o.items,o.paid_at
 FROM table_orders o WHERE o.status IN ('paid','ready') AND (o.id=$1 OR EXISTS (SELECT 1 FROM jsonb_array_elements(o.items) l WHERE l->>'ticket'=$1))`,[row.job.source_id||id])).rows;
 const filtered=sources.map(s=>({...s,items:(s.items||[]).filter(l=>!l.served_at&&!l.cancelled&&(s.session_id||!l.order_id)&&(!row.job.venue||l.venue===row.job.venue))}));
 const found=jobsOf(filtered).find(j=>j.id===(row.job.source_id||id));
 const current=found?{...found,id,...(row.job.source_id?{source_id:row.job.source_id,venue:row.job.venue}:{})}:null;
 if(current&&!orders.orderOwnedByVenues(current,venues))return null;
 if(current&&!orders.isTakeout(current.table_no)){
  try{const s=(await query(`SELECT table_no,items,party_votes FROM table_sessions WHERE status='open' AND table_no=$1 ORDER BY created_at DESC LIMIT 1`,[current.table_no])).rows[0];const t=tableTotal(s);if(t)current.table_total=t;}catch(e){/* 累計只是明細附帶資訊，查不到就只印本次 */}
 }
 const hit=(await query('UPDATE pos_kitchen_print_jobs SET claimed_at=now(),actor=$2,operator_id=$3,job=$4 WHERE id=$1 AND claimed_at IS NULL RETURNING job',[id,actor,operator||null,JSON.stringify(current||{...row.job,items:[]})])).rows[0];
 return {claimed:!!hit&&!!current,...(hit&&current?{job:current}:{})};
}
module.exports={jobsOf,enqueue,claim,tableTotal};
