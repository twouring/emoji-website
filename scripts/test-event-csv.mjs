import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {parseCSV}=createRequire(import.meta.url)('../public/event-csv');
test('guest CSV parses UTF-8 BOM, quoted commas, multiline values and escaped quotes; rejects malformed input',()=>{
 assert.deepEqual(parseCSV('\ufeffname,email\r\n"王, 小明",test@example.test\r\n'),[['name','email'],['王, 小明','test@example.test']]);
 assert.deepEqual(parseCSV('a,b\n"one\ntwo","say ""yes"""'),[['a','b'],['one\ntwo','say "yes"']]);
 assert.throws(()=>parseCSV('a,"unfinished'),/引號/);assert.throws(()=>parseCSV('"closed"bad,x'),/分隔/);
});
