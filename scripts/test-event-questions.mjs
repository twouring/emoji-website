import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{questions,answers}=require('../lib/event-questions');
test('registration questions validate choices and required answers, retaining the original question snapshot',()=>{
 const list=questions([{id:'q_food',label:'餐點',type:'multiple',options:['葷','素'],required:true},{id:'q_terms',label:'同意條款',type:'terms',required:true},{id:'q_site',label:'網站',type:'website',required:false}]);
 assert.throws(()=>answers(list,{}),/必填/);
 assert.throws(()=>answers(list,{q_food:['其他'],q_terms:true}),/選項/);
 assert.throws(()=>answers(list,{q_food:['素'],q_terms:'yes'}),/勾選/);
 assert.throws(()=>answers(list,{q_food:['素'],q_terms:true,q_site:'javascript:alert(1)'}),/網址/);
 const snapshot=JSON.parse(JSON.stringify(answers(list,{q_food:['素'],q_terms:true})));
 list[0].label='新問題';assert.equal(snapshot[0].question.label,'餐點');
 assert.throws(()=>questions([{...list[0]},{...list[0]}]),/重複/);
 const translated=questions([{id:'q_one',label:'餐點',type:'single',options:['葷','素'],required:true,option_translations:{en:['Meat','Vegetarian']}}]);
 assert.equal(translated[0].option_translations.en[1],'Vegetarian');assert.equal(answers(translated,{q_one:'素'})[0].value,'素');
 assert.throws(()=>questions([{...translated[0],option_translations:{en:['One']}}]),/逐行/);
 assert.throws(()=>answers(list,{unknown:'injected'}),/已更新/);
});
