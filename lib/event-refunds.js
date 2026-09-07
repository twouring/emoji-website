'use strict';
// All amounts here are integer minor units (TWD cents), matching Stripe.
function refundTotals(paid,refunds){
 let succeeded=0,pending=0;
 for(const r of refunds){if(r.status==='succeeded')succeeded+=r.amount;else if(!['failed','canceled'].includes(r.status))pending+=r.amount;}
 return {succeeded,pending,remaining:Math.max(0,paid-succeeded-pending),status:succeeded>=paid?'refunded':succeeded+pending>=paid?'refund_pending':'registered'};
}
module.exports={refundTotals};
