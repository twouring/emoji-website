'use strict';
const {endsAtAfterActivation,deriveMemberAccess}=require('./entitlements');
// Only standard memberships; promotional/founding/event privileges are never manually issued here.
const manualPlans=Object.freeze([
 {plan:'day_4h',label:'單日 4 小時',duration:'自開通起 4 小時'},
 {plan:'day_12h',label:'單日 12 小時',duration:'自開通起 12 小時'},
 {plan:'month',label:'月會籍',duration:'自開通起 1 個月'},
 {plan:'quarter',label:'季會籍',duration:'自開通起 3 個月'},
 {plan:'year',label:'年會籍',duration:'自開通起 12 個月'},
]);
function invalid(message,status=400){return Object.assign(new Error(message),{status});}
function prepareManualMembership(body,entitlements,now=new Date()){
 if(!manualPlans.some(p=>p.plan===body.plan))throw invalid('請選擇一般會籍方案。');
 if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.trim().length>80||/[\x00-\x1f\x7f]/.test(body.reason))throw invalid('開通原因必填，限 80 字且不可含控制字元。');
 const access=deriveMemberAccess(entitlements,now);
 if(access.active||access.pending.length||entitlements.some(e=>e.ends_at&&new Date(e.ends_at)>now))throw invalid('已有有效、待啟用或未來會籍，請先確認原會籍，不能重複開通。',409);
 return {plan:body.plan,reason:body.reason.trim(),activated_at:now,starts_at:now,ends_at:endsAtAfterActivation(body.plan,now)};
}
module.exports={manualPlans,prepareManualMembership};
