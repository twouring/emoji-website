// POS 桌況：客人點餐後未送單滿 2 分鐘，桌卡必須顯示可見提醒，且不依賴下一次 API 資料變更。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');

test('未送單滿兩分鐘：桌況卡顯示分鐘數與警示樣式，分鐘跳動時會就地更新', () => {
  const ops = read('public/pos-ops.js');
  const css = read('public/pos-ops.css');

  assert.match(ops, /const UNSENT_WARN_MIN=2;/, '門檻固定為兩分鐘');
  assert.match(ops, /const unsentReminder=\(s,now=Date\.now\(\)\)=>\{/, '未送單提醒要依未送出品項時計算');
  assert.match(ops, /data-unsent-since=/, '桌卡要保留時計資料，才能在滿兩分鐘立即更新');
  assert.match(ops, /pos-unsentwarn-tag/, '桌卡要有可見的未送單警示文字');
  assert.match(ops, /\.pos-unsentwarn\[data-unsent-since\]/, '每分鐘需就地更新未送單提醒，不必等待 API 資料更新');
  assert.match(css, /\.pos-table\.unsentwarn/, '未送單逾時桌卡要有獨立警示樣式');
  assert.match(css, /\.pos-table \.pos-unsentwarn-tag/, '未送單警示文字要有可讀顏色');
});

test('未送單逾時：彈窗與專屬雙音提示各事件只提醒一次，多桌合併通知', () => {
  const ops = read('public/pos-ops.js');

  assert.match(ops, /let POS_UNSENT_ALERTED=new Set\(\);/, '要記住已提醒事件，避免同一桌反覆彈窗');
  assert.match(ops, /function unsentAlertBeep\(\)/, '未送單要使用不同於新單的專屬音效');
  assert.match(ops, /function alertUnsentOrders\(sessions\)/, '逾時提醒要集中處理');
  assert.match(ops, /posConfirm\(`以下桌次已點餐超過 2 分鐘，尚未送單：\\n\$\{tables\}/, '要顯示桌號的彈窗');
  assert.match(ops, /ok:'知道了'/, '彈窗只要求確認，不改動訂單');
  assert.match(ops, /if\(TAB==='pos'\)alertUnsentOrders\(POS_DATA\.sessions\);/, '收到最新桌況後要觸發提醒');
  assert.match(ops, /if\(TAB==='pos'&&POS_DATA\?\.sessions\)alertUnsentOrders\(POS_DATA\.sessions\);/, '剛好滿兩分鐘時也要由時計直接觸發，不等下一輪輪詢');
});

test('空間情境（等等空間／約書旅）入場單沒有送單流程，不跳未送單提醒（KK 11/17）', () => {
  const ops = read('public/pos-ops.js');
  assert.match(ops, /if\(typeof posSpaceOn==='function'&&posSpaceOn\(\)\)return null;/, '空間情境不算未送單');
  assert.match(ops, /!l\.placed_at&&!l\.served_at/, '已出餐（入場單）的行不算未送單');
});
