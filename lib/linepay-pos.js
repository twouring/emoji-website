'use strict';
// Narrow first release: whole unpaid bill, standard saved prices, one API tender.
function createHooks({tableOrders,contentValue,resolveOperator,activePaymentCodes,registersOpenMap,posRegister,ezpayInvoice,actorOf,uid}){
  const fail=(status,message)=>Object.assign(Error(message),{status});
  return {
    owned:(s,auth)=>tableOrders.sessionClosableByVenues(s,tableOrders.visibleVenues(auth.brands)),
    async quote(s,auth,body,c){
      if(['lines','quantities','member','member_id','member_phone','member_token','discount','redeem_lines','payments','prepay','received'].some(k=>body[k]!==undefined&&body[k]!==null))throw fail(400,'LINE Pay API 收款目前限整桌原價單一付款；不接受分帳、會員價、點數、折扣或混合付款。');
      const operator=await resolveOperator({auth},body.operator_id);if(!operator)throw fail(400,'請先認證有效的操作人員。');
      const methods=await activePaymentCodes();if(!methods.includes('linepay'))throw fail(409,'請先在付款方式啟用 LINE Pay。');
      const out=tableOrders.posCheckout(s.items,{method:'linepay',staff:actorOf(auth)||'',operator},tableOrders.menuIndex(await contentValue('menu'),undefined,{all:true}),methods);
      if(out.lines.some(l=>!l.placed_at&&!l.credit_of))throw fail(409,'請先送出全部點餐再收款。');
      const warning=posRegister.checkoutAllowed(out.lines,await registersOpenMap(c,tableOrders.MenuLib.businessDay()),{strict:!!tableOrders.visibleVenues(auth.brands)}).warning;
      const invoice=ezpayInvoice.invoiceForm(body.invoice||{});
      return {...out,invoice,warning};
    },
    async finish(c,s,a,auth){
      const out=a.quote,orderId=uid('to_'),lines=out.lines.map(l=>({...l,order_id:orderId})),items=tableOrders.settleItems(s.items,out.lines,orderId);
      const payer={...out.payer,linepay_payment:a.id,linepay_transaction:a.transaction_id,linepay_environment:a.mode};
      const served=out.lines.every(l=>l.served_at),closed=!tableOrders.isTakeout(s.table_no)&&tableOrders.unpaid(items).length===0&&tableOrders.sessionClosableByVenues(s,tableOrders.visibleVenues(auth.brands));
      await c.query('INSERT INTO table_orders(id,session_id,table_no,items,amount,payer,invoice,status,done_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[orderId,s.id,s.table_no,JSON.stringify(lines),out.amount,JSON.stringify(payer),JSON.stringify(out.invoice||{}),served?'done':'paid',served?new Date():null]);
      if(closed)await c.query("UPDATE table_orders SET status='done',done_at=now() WHERE session_id=$1 AND status IN ('paid','ready')",[s.id]);
      await c.query('UPDATE table_sessions SET items=$2,status=$3,pay_requests=$4,updated_at=now() WHERE id=$1',[s.id,JSON.stringify(items),closed?'closed':'open',JSON.stringify(tableOrders.prunePayRequests(s.pay_requests,items))]);
      return {ok:true,order_id:orderId,amount:out.amount,subtotal:out.subtotal,method:'linepay',closed,remaining:tableOrders.sum(tableOrders.unpaid(items)),invoice:out.invoice,warning:out.warning||undefined};
    }
  };
}
module.exports={createHooks};
