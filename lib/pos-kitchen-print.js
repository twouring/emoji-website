'use strict';
const orders=require('./table-orders');
// Immutable submission identity follows ticket through split payments and table moves.
// Unsubmitted counter/prepaid lines become one fallback job at persisted payment.
function jobsOf(sources){
 const jobs=new Map();
 for(const s of sources){
  if(s.status==='void')continue;
  for(const l of s.items||[]){
   if(l.cancelled||l.song)continue;   // 點歌不是餐點，不上出餐單
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
 const hit=(await query('UPDATE pos_kitchen_print_jobs SET claimed_at=now(),actor=$2,operator_id=$3,job=$4 WHERE id=$1 AND claimed_at IS NULL RETURNING job',[id,actor,operator||null,JSON.stringify(current||{...row.job,items:[]})])).rows[0];
 return {claimed:!!hit&&!!current,...(hit&&current?{job:current}:{})};
}
module.exports={jobsOf,enqueue,claim};
