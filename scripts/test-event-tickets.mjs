import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{normalizeTickets,selectTicket,ticketPrice,publicTickets,normalizeCoupons,discountPrice}=require('../lib/event-tickets');
test('ticket types reject invalid inventory, prices, dates and closed sales',()=>{
 const value={id:'t_one',name:'General',price_twd:800,capacity:10,active:true};
 const hidden=normalizeTickets([{...value,hidden:true,unlock_code:'ACCESS',flexible_price:true,minimum_twd:100}]);
 assert.equal(publicTickets(hidden).length,0);assert.equal(publicTickets(hidden,'ACCESS')[0].unlock_code,undefined);
 assert.throws(()=>selectTicket(hidden,'t_one'),/解鎖碼/);assert.equal(selectTicket(hidden,'t_one',Date.now(),'ACCESS').id,'t_one');
 assert.equal(ticketPrice(hidden[0],200),200);assert.throws(()=>ticketPrice(hidden[0],99),/最低票價/);
 const coupons=normalizeCoupons([{code:'EARLY',type:'percent',value:20,max_uses:2,active:true}]);assert.equal(discountPrice(coupons,'early',105).price,84);assert.throws(()=>discountPrice(coupons,'invalid',100),/無效/);assert.equal(discountPrice(normalizeCoupons([{code:'FREE',type:'fixed',value:1000,max_uses:0,active:true}]),'FREE',100).price,0);
 const tickets=normalizeTickets([value]);assert.equal(selectTicket(tickets,'t_one').price_twd,800);
 assert.throws(()=>normalizeTickets([{...value,price_twd:0.1}]),/整數/);
 assert.throws(()=>normalizeTickets([value,value]),/重複/);
 assert.throws(()=>selectTicket(tickets,'other'),/票種/);
 assert.throws(()=>selectTicket(normalizeTickets([{...value,opens_at:'2100-01-01T00:00:00Z'}]),'t_one'),/銷售期間/);
 assert.throws(()=>normalizeTickets([{...value,opens_at:'2100-01-01',closes_at:'2000-01-01'}]),/截止/);
});
