import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { lastCarrier } = require('../lib/ezpay-invoice.js');
const src = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('lastCarrier 只帶格式正確的手機載具／自然人憑證', () => {
  assert.deepEqual(lastCarrier({ mode: 'mobile', carrier_num: '/abc+123' }), { mode: 'mobile', carrier_num: '/ABC+123' });
  assert.deepEqual(lastCarrier({ mode: 'citizen', carrier_num: 'AB12345678901234' }), { mode: 'citizen', carrier_num: 'AB12345678901234' });
  assert.equal(lastCarrier({ mode: 'mobile', carrier_num: '/AB' }), null);
  assert.equal(lastCarrier({ mode: 'company', buyer_ubn: '12345678' }), null);
  assert.equal(lastCarrier(null), null);
});

test('lookup 只對驗證過身分的會員回載具（KK 11/5）', () => {
  const fn = server.slice(server.indexOf("app.post('/api/admin/yan/lookup'"), server.indexOf('/* POS 合併會員'));
  assert.match(fn, /const carrier = verified \? ezpayInvoice\.lastCarrier/);
  assert.match(fn, /WHERE user_id=\$1 AND invoice->>'mode' IN \('mobile','citizen'\)/);
  assert.match(fn, /carrier \}\);/);
});

test('POS 綁定會員時自動帶入載具，換會員還原紙本', () => {
  const apply = src.slice(src.indexOf('function posApplyCarrier'), src.indexOf('function posCarrierSync'));
  assert.match(apply, /POS_INVOICE\.mode!=='paper'/, '櫃檯已改發票類型就不覆蓋');
  assert.match(apply, /POS_INV_VALS\.carrier_num=c\.carrier_num/);
  const auto = src.slice(src.indexOf('function posAutoMember'), src.indexOf('function tableMembersHtml'));
  assert.match(auto, /posApplyCarrier\(out\)/, '桌邊登入自動帶入會員也帶載具');
  assert.equal((src.match(/const cr=posApplyCarrier\(out\)/g) || []).length, 3, '自動帶入＋掃會員卡＋點桌上會員');
  assert.match(src, /posCarrierSync\(\);if\(cur&&typeof posAutoMember/);
  assert.match(src, /POS_INVOICE\.mode=r\.checked\?r\.value:POS_INVOICE\.mode;delete POS_INVOICE\.auto;/, '手動改類型後不再自動還原');
});

test('posCarrierSync：會員換掉就還原紙本並清掉自動帶入的條碼', () => {
  const sync = src.slice(src.indexOf('function posCarrierSync'), src.indexOf('function tableMembersHtml'));
  const apply = src.slice(src.indexOf('function posApplyCarrier'), src.indexOf('function posCarrierSync'));
  const ctx = new Function(`let POS_INVOICE={mode:'paper'},POS_INV_VALS={},POS_YAN={id:'u1'};const INV_LABEL={mobile:'手機載具',citizen:'自然人憑證'};${apply}${sync}
    const msg=posApplyCarrier({member:{id:'u1'},carrier:{mode:'mobile',carrier_num:'/ABC1234'}});
    const a={mode:POS_INVOICE.mode,num:POS_INV_VALS.carrier_num,msg};posCarrierSync();const b=POS_INVOICE.mode;
    POS_YAN={phone:'',name:''};posCarrierSync();
    return {a,b,c:POS_INVOICE.mode,num:POS_INV_VALS.carrier_num};`)();
  assert.equal(ctx.a.mode, 'mobile'); assert.equal(ctx.a.num, '/ABC1234'); assert.match(ctx.a.msg, /手機載具 \/ABC1234/);
  assert.equal(ctx.b, 'mobile', '同一會員不還原');
  assert.equal(ctx.c, 'paper'); assert.equal(ctx.num, undefined);
});
