'use strict';
function normalizeTickets(input){
 if(!Array.isArray(input)||input.length>30)throw new Error('票種最多 30 種。');
 const ids=new Set();
 return input.map(t=>{
  if(!t||typeof t.id!=='string'||!/^t_[a-zA-Z0-9_-]{1,60}$/.test(t.id)||ids.has(t.id))throw new Error('票種識別碼無效或重複。');ids.add(t.id);
  if(typeof t.name!=='string'||!t.name.trim()||t.name.length>200)throw new Error('請填寫票種名稱。');
  const out={id:t.id,name:t.name.trim(),description:String(t.description||'').slice(0,2000)};
  for(const key of ['price_twd','capacity']){if(!Number.isSafeInteger(t[key])||t[key]<0||t[key]>10000000)throw new Error('票價與名額必須是有效非負整數。');out[key]=t[key];}
  for(const key of ['opens_at','closes_at']){if(t[key]&&(!Number.isFinite(Date.parse(t[key]))||typeof t[key]!=='string'))throw new Error('票種時間格式不正確。');out[key]=t[key]?new Date(t[key]).toISOString():null;}
  if(out.opens_at&&out.closes_at&&out.opens_at>=out.closes_at)throw new Error('票種截止必須晚於開賣時間。');
  if(typeof t.active!=='boolean')throw new Error('票種啟用狀態格式不正確。');out.active=t.active;
  if(t.hidden!==undefined&&typeof t.hidden!=='boolean'||t.flexible_price!==undefined&&typeof t.flexible_price!=='boolean')throw new Error('票種開關格式不正確。');
  if(t.requires_approval!==undefined&&typeof t.requires_approval!=='boolean')throw new Error('審核設定格式不正確。');out.requires_approval=t.requires_approval===true;
  out.hidden=t.hidden===true;out.flexible_price=t.flexible_price===true;
  out.unlock_code=String(t.unlock_code||'').trim().toUpperCase();
  if(out.hidden&&(!/^[A-Z0-9_-]{4,64}$/.test(out.unlock_code)))throw new Error('隱藏票需設定 4–64 位英數解鎖碼。');
  out.minimum_twd=t.minimum_twd??out.price_twd;
  if(!Number.isSafeInteger(out.minimum_twd)||out.minimum_twd<0||out.minimum_twd>out.price_twd)throw new Error('最低金額必須是 0 至建議票價之間的整數。');
  return out;
 });
}
function selectTicket(tickets,id,now=Date.now(),code=''){
 const ticket=tickets.find(t=>t.id===id&&t.active);
 if(!ticket||ticket.hidden&&ticket.unlock_code!==String(code).trim().toUpperCase())throw new Error('請選擇有效票種，隱藏票須提供正確解鎖碼。');
 if((ticket.opens_at&&now<Date.parse(ticket.opens_at))||(ticket.closes_at&&now>=Date.parse(ticket.closes_at)))throw new Error('這個票種目前不在銷售期間。');
 return ticket;
}
function ticketPrice(ticket,amount){
 if(!ticket.flexible_price)return ticket.price_twd;
 const value=amount===undefined||amount===null||amount===''?ticket.price_twd:Number(amount);
 if(!Number.isSafeInteger(value)||value<ticket.minimum_twd||value>10000000)throw new Error('請輸入不低於最低票價的有效整數金額。');
 return value;
}
function publicTickets(tickets,code=''){
 return (tickets||[]).filter(t=>t.active&&(!t.hidden||t.unlock_code===String(code).trim().toUpperCase())).map(t=>{const {unlock_code,...safe}=t;return safe;});
}
module.exports={normalizeTickets,selectTicket,ticketPrice,publicTickets};
function normalizeCoupons(input){
 if(!Array.isArray(input)||input.length>100)throw new Error('優惠碼最多 100 組。');const codes=new Set();
 return input.map(c=>{const code=String(c.code||'').trim().toUpperCase();if(!/^[A-Z0-9_-]{3,64}$/.test(code)||codes.has(code))throw new Error('優惠碼需為 3–64 位英數，且不可重複。');codes.add(code);
 if(!['percent','fixed'].includes(c.type)||!Number.isSafeInteger(c.value)||c.value<1||c.value>(c.type==='percent'?100:10000000)||!Number.isSafeInteger(c.max_uses)||c.max_uses<0||typeof c.active!=='boolean')throw new Error('折扣與使用上限設定不正確。');
 if(c.expires_at&&(!Number.isFinite(Date.parse(c.expires_at))||typeof c.expires_at!=='string'))throw new Error('優惠碼期限格式不正確。');
 return {code,type:c.type,value:c.value,max_uses:c.max_uses,active:c.active,expires_at:c.expires_at?new Date(c.expires_at).toISOString():null};});
}
function discountPrice(coupons,code,price,now=Date.now()){
 if(!code)return {price,coupon:null};const coupon=coupons.find(c=>c.code===String(code).trim().toUpperCase()&&c.active);
 if(!coupon||coupon.expires_at&&Date.parse(coupon.expires_at)<=now)throw new Error('優惠碼無效或已到期。');
 const discount=Math.min(price,coupon.type==='percent'?Math.floor(price*coupon.value/100):coupon.value);
 return {price:price-discount,coupon:{...coupon,discount_twd:discount,original_price_twd:price}};
}
module.exports.normalizeCoupons=normalizeCoupons;module.exports.discountPrice=discountPrice;
function normalizeTax(input){
 if(!input||input.enabled===false)return {enabled:false,name:'',rate_bps:0};
 const name=String(input.name||'').trim(),rate=Number(input.rate_bps);
 if(input.enabled!==true||!name||name.length>80||!Number.isSafeInteger(rate)||rate<1||rate>10000)throw new Error('稅金需有 80 字內名稱與 0.01%–100% 稅率。');
 return {enabled:true,name,rate_bps:rate};
}
function taxPrice(tax,price){
 if(!tax?.enabled)return {price,tax:null};
 const taxTwd=Math.round(price*tax.rate_bps/10000);
 return {price:price+taxTwd,tax:{name:tax.name,rate_bps:tax.rate_bps,taxable_twd:price,tax_twd:taxTwd,total_twd:price+taxTwd}};
}
module.exports.normalizeTax=normalizeTax;module.exports.taxPrice=taxPrice;
