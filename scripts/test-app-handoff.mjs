// 會員 App（app.emoji.tw）安裝引導與管理入口
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const m = read('public/m.html');
const installKind = vm.runInNewContext(m.slice(m.indexOf('function installKind'), m.indexOf('/* install-end */')) + '\ninstallKind');
const base = { standalone: false, dismissedAt: 0, now: 1e12, hasPrompt: false, ios: false, inApp: false };

test('安裝引導：已安裝不顯示；7 天內按過「稍後」不顯示；之後再顯示', () => {
  assert.equal(installKind({ ...base, hasPrompt: true, standalone: true }), null);
  assert.equal(installKind({ ...base, hasPrompt: true, dismissedAt: 1e12 - 6 * 864e5 }), null);
  assert.equal(installKind({ ...base, hasPrompt: true, dismissedAt: 1e12 - 8 * 864e5 }), 'prompt');
});
test('安裝引導：裝過（記在 m_installed，或系統回報已安裝）就算從瀏覽器開也不再顯示', () => {
  for (const k of [{ hasPrompt: true }, { ios: true }, { inApp: true }]) assert.equal(installKind({ ...base, ...k, installed: true }), null);
  assert.match(m, /if\(isStandalone\(\)\)markInstalled\(\)/);
  assert.match(m, /'appinstalled',\(\)=>\{deferred=null;markInstalled\(\)/);
  assert.match(m, /navigator\.getInstalledRelatedApps/);
  assert.equal(JSON.parse(read('public/m.webmanifest')).related_applications[0].platform, 'webapp');
});
test('安裝引導：Android／桌面用系統安裝視窗，iOS 教學，LINE 等內建瀏覽器要先換瀏覽器', () => {
  assert.equal(installKind({ ...base, hasPrompt: true }), 'prompt');
  assert.equal(installKind({ ...base, ios: true }), 'ios');
  assert.equal(installKind({ ...base, ios: true, inApp: true }), 'inapp');
  assert.equal(installKind({ ...base, hasPrompt: true, inApp: true }), 'inapp');
  assert.equal(installKind(base), null, '不支援也沒有安裝事件就不打擾');
});

test('App「我的」頁：管理員與主辦一樣只有 App「管理我的活動」，不出現「前往後台」；App 讀會員版 state', () => {
  assert.doesNotMatch(m, /https:\/\/admin\.emoji\.tw\/admin/); assert.match(m, /href="\/host"/);
  assert.match(m, /\/api\/state\?view=member&lang=/);
  assert.match(m, /role:s\.role,organizer:!!s\.organizer/);
});
test('官網不再有會員頁：member.html 三語已刪除、App 不再連回「完整會員專區」', () => {
  for (const f of ['public/member.html', 'public/en/member.html', 'public/ja/member.html']) assert.equal(fs.existsSync(new URL('../' + f, import.meta.url)), false, f);
  assert.doesNotMatch(m, /\/member\?web=1|完整會員專區/);
});
test('app 子站收到 #token= 後存起並清掉網址（沿用既有行為）；service worker 版本已更新', () => {
  assert.match(m, /hash\.get\('token'\)/);
  assert.match(read('public/m-sw.js'), /VERSION = 'm-v([5-9]|\d{2,})'/);
});

test('官網導覽「會員登入」連到 App；安裝引導在進入畫面最上方（訪客方案頁、登入頁、首頁），不在最下面', () => {
  for (const [l, label] of [['zh', '會員登入'], ['en', 'Sign in'], ['ja', 'ログイン']]) {
    assert.match(read(`views/partials/header-${l}.html`), new RegExp(`href="https://app\\.emoji\\.tw/[^"]*" id="navMember">${label}</a>`), l);
  }
  assert.match(m, /function guestPlan\(\)\{\n    app\.innerHTML=`\$\{installCard\(\)\}\$\{head\(T\.plan,T\.byPlan/);
  assert.match(m, /app\.innerHTML=`\$\{installCard\(\)\}<div class="login">/);
  const home = m.slice(m.indexOf('  function home(){'), m.indexOf('  function evTile('));
  assert.ok(home.indexOf('${installCard()}') > -1 && home.indexOf('${installCard()}') < home.indexOf('class="hello"'), '首頁安裝卡要在問候列之前');
  assert.equal((home.match(/installCard\(\)/g) || []).length, 1);
});

test('App 每個購買／預約畫面標明品牌：會籍＝等等空間、訂位與取餐＝在咖啡／三點水、商店＝言文字商店', () => {
  const m = fs.readFileSync(new URL('../public/m.html', import.meta.url), 'utf8');
  for (const k of ['byPlan', 'byDine', 'byShop']) assert.equal((m.match(new RegExp(k + ":'", 'g')) || []).length, 3, k + ' 要有中英日三語');
  assert.match(m, /head\(T\.resvTitle,T\.byDine/);
  assert.match(m, /head\(T\.pickupTitle,T\.byDine/);
  assert.match(m, /head\(T\.shopTitle,T\.byShop/);
  assert.equal((m.match(/head\(T\.plan,T\.byPlan/g) || []).length, 2, '會籍頁（訪客與會員）都要標等等空間');
  assert.match(m, /T\.pickupLabel\+/, '取餐卡片'); assert.match(m, /venueName\(venueOfTime\(o\.pickup_time\)\)\+'・'/, '取餐卡片要標店名'); assert.match(m, /venueName\(o\.venue\|\|venueOfTime\(o\.reserve_time\)\)\+'・'/, '訂位卡片要標店名');
  const srv = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(srv, /等等空間 Stay Square 會籍｜/, 'Stripe 會籍品名要寫品牌');
  assert.match(srv, /'言文字商店｜'/, 'Stripe 商店品名要寫品牌');
});

test('品牌館：首頁列出四個品牌，各有品牌頁；會員卡與點數共用', () => {
  const m = fs.readFileSync(new URL('../public/m.html', import.meta.url), 'utf8');
  for (const k of ['cafe', 'bar', 'stay', 'rest']) assert.match(m, new RegExp("\\{k:'" + k + "'"), k);
  assert.match(m, /\$\{brandsSec\(\)\}/, '首頁要有品牌館');
  assert.match(m, /function openBrand\(k\)/);
  for (const k of ['brandsTitle', 'bMenu', 'bMine', 'bCard']) assert.equal((m.match(new RegExp(k + ':', 'g')) || []).length, 3, k + ' 三語');
  for (const z of [...m.matchAll(/tag:\{zh:'([^']*)'/g)].map(x => x[1])) assert.ok(z.length <= 4, '品牌卡短類型中文 ≤4 字：' + z);
  const srv = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(srv, /brand-sites\\\/assets\\\/\[\\w-\]\+-avatar\\\.webp\$/, 'app.emoji.tw 要能讀品牌頭像');
});

test('App 重構（會員視角）：首頁先卡與進出 QR、接下來、品牌館、兌換摘要；預約分頁單一時間線；會籍進出 QR 置頂；我的點數置頂', () => {
  const m = fs.readFileSync(new URL('../public/m.html', import.meta.url), 'utf8');
  const home = m.slice(m.indexOf('  function home(){'), m.indexOf('  function evTile('));
  const order = ['class="pass"', 'id="show"', '${upcomingSec()}', '${brandsSec()}', '${rewardsSec(pts)}'].map(k => home.indexOf(k));
  assert.ok(order.every(i => i > 0) && order.every((v, i) => !i || v > order[i - 1]), '首頁順序：會員卡→出示→接下來→品牌館→兌換');
  assert.doesNotMatch(home, /<nav class="quick"/, '首頁不再重複放快捷鍵（入口在品牌館與預約分頁）');
  assert.match(home, /id="access-open"/, '有會籍時會員卡旁直接開進出 QR');
  assert.match(m, /ok\.slice\(0,4\)/, '首頁兌換只放現在能換的前 4 項');
  assert.match(m, /function openRewards\(pts\)/);
  assert.match(m, /function agendaItems\(\)/); assert.match(m, /function agendaTile\(x,full\)/);
  const book = m.slice(m.indexOf('  function book(){'), m.indexOf('  async function openTicket('));
  assert.match(book, /agendaItems\(\)/); assert.doesNotMatch(book, /T\.myResv|T\.pickupSec|T\.shopSec/, '預約分頁不再分四段');
  assert.match(m, /T\.pickupNo\(o\.table\)/, '商店單顯示取貨單號');
  const plan = m.slice(m.indexOf('  function plan(){'), m.indexOf('  async function buyPlan('));
  assert.ok(plan.indexOf('id="access-qr"') < plan.indexOf('class="panel"'), '會籍：進出 QR 在狀態卡之前');
  assert.match(m, /id="hist-open2"[^`]*class|class="me-pts" id="hist-open2"/);
  for (const k of ['agenda', 'agendaNone', 'seeAll', 'rwNow', 'accessShort', 'pickupNo', 'evMine']) assert.equal((m.match(new RegExp('[,{]' + k + ':', 'g')) || []).length, 3, k + ' 三語');
});
