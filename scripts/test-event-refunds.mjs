import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {refundTotals}=createRequire(import.meta.url)('../lib/event-refunds');
test('partial, pending, failed and full refunds preserve the remaining amount and ticket state',()=>{
 assert.deepEqual(refundTotals(10000,[{amount:3000,status:'succeeded'}]),{succeeded:3000,pending:0,remaining:7000,status:'registered'});
 assert.deepEqual(refundTotals(10000,[{amount:3000,status:'succeeded'},{amount:7000,status:'pending'}]),{succeeded:3000,pending:7000,remaining:0,status:'refund_pending'});
 assert.deepEqual(refundTotals(10000,[{amount:3000,status:'succeeded'},{amount:7000,status:'failed'}]),{succeeded:3000,pending:0,remaining:7000,status:'registered'});
 assert.equal(refundTotals(10000,[{amount:3000,status:'succeeded'},{amount:7000,status:'succeeded'}]).status,'refunded');
});
