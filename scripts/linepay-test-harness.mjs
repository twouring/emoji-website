// Synthetic SQL boundary only; the separate PGlite verification exercises actual SQL.
export function fixture(lp,env,{pay=async a=>({returnCode:'0000',info:{orderId:a.id,transactionId:'2019010112345678910',payInfo:[{amount:a.amount}]}}),check}={}){
  const session={id:'ts_test',table_no:'A1',status:'open',items:[{line:'a',venue:'CAFE',price:120,qty:1,placed_at:'test'}]};
  const attempts=[],orders=[],calls=[];let tail=Promise.resolve();
  const query=async(sql,p=[])=>{
    calls.push({sql,p});
    if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
    if(sql.startsWith('SELECT * FROM table_sessions'))return {rows:[structuredClone(session)]};
    if(sql.startsWith('SELECT * FROM linepay_payments'))return {rows:attempts.filter(a=>a.session_id===p[0]&&(sql.includes('id=$2')?a.id===p[1]:!['failed','cancelled','settled'].includes(a.state))).map(a=>structuredClone(a))};
    if(sql.startsWith('INSERT INTO linepay_payments')){const a={id:p[0],session_id:p[1],amount:p[2],snapshot:JSON.parse(p[3]),quote:JSON.parse(p[4]),mode:p[5],channel:p[6],state:'prepared'};attempts.push(a);return {rows:[structuredClone(a)]};}
    if(sql.startsWith('UPDATE linepay_payments SET state=$2')){const a=attempts.find(a=>a.id===p[0]);Object.assign(a,{state:p[1],transaction_id:p[2]||null,code:p[3]||null,result:p[4]?JSON.parse(p[4]):null});return {rows:[structuredClone(a)]};}
    throw Error('Unexpected test SQL: '+sql);
  };
  const pool={connect:async()=>{let unlock;const prev=tail;tail=new Promise(r=>unlock=r);await prev;return {query,release:unlock};}};
  let n=0,payCalls=0,checkCalls=0;
  const service=lp.createService({pool,env,uid:()=>`lp_${++n}`,quote:async(s,auth)=>{if(auth.brands?.includes('BAR'))throw Object.assign(Error('denied'),{status:403});return {amount:s.items.reduce((n,l)=>n+l.price*l.qty,0),lines:s.items,invoice:{},payer:{method:'linepay'}};},owned:(s,auth)=>!auth.brands?.includes('BAR'),finish:async(c,s,a)=>{const out={order_id:'to_test',amount:a.amount};orders.push(out);return out;},api:{pay:async(...args)=>{payCalls++;return pay(...args);},check:async(...args)=>{checkCalls++;return check(...args);}}});
  return {service,session,attempts,orders,calls,get payCalls(){return payCalls;},get checkCalls(){return checkCalls;}};
}
