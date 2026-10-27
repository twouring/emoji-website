/* POS／KDS 即時同步：訂閱 /api/admin/orders/live（SSE）。
   EventSource 帶不了 Authorization，改用 fetch 讀串流；收到 changed（某桌異動）就在 300ms 內重拉目前分頁。
   連線正常時 loadPos／loadOrders 的輪詢放慢到 60 秒當保險；斷線退回原本 10／15 秒並自動重連。 */
var POS_LIVE_OK = false, POS_LIVE_CTRL = null, POS_LIVE_DEBOUNCE = null, POS_LIVE_DELAY = 2000;

function posLiveRefresh() {
  clearTimeout(POS_LIVE_DEBOUNCE);
  POS_LIVE_DEBOUNCE = setTimeout(() => {
    if (document.hidden) return;
    if (TAB === 'pos' && document.getElementById('pos-body')) loadPos();
    else if (TAB === 'orders' && document.getElementById('orders-body')) loadOrders();
  }, 300);
}

// 解析 SSE 文字：以空行分隔事件，回傳 [{event, data}]，剩餘未完的片段留給下一塊
function posLiveParse(buf) {
  const out = [], parts = buf.split(/\r?\n\r?\n/), rest = parts.pop();
  for (const block of parts) {
    let event = 'message', data = '';
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (data || event !== 'message') out.push({ event, data });
  }
  return { events: out, rest };
}

async function posLiveConnect() {
  if (!token || typeof fetch !== 'function') return;
  POS_LIVE_CTRL?.abort();
  const ctrl = POS_LIVE_CTRL = new AbortController();
  try {
    const res = await fetch('/api/admin/orders/live', { headers: { Authorization: 'Bearer ' + token, Accept: 'text/event-stream' }, signal: ctrl.signal, cache: 'no-store' });
    if (res.status === 401 || res.status === 403) { POS_LIVE_OK = false; return; }   // 登入過期由 api() 處理，不重連
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    POS_LIVE_OK = true; POS_LIVE_DELAY = 2000;
    posLiveRefresh();                       // 斷線期間可能漏事件：一連上就補拉一次
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const p = posLiveParse(buf + dec.decode(value, { stream: true }));
      buf = p.rest;
      if (p.events.some(e => e.event === 'changed')) posLiveRefresh();
    }
  } catch (e) {
    if (ctrl.signal.aborted) return;
  }
  if (ctrl !== POS_LIVE_CTRL) return;
  POS_LIVE_OK = false;                      // Cloud Run 逾時或網路斷：退回快速輪詢並重連（2 秒起、最多 30 秒）
  setTimeout(posLiveConnect, POS_LIVE_DELAY);
  POS_LIVE_DELAY = Math.min(POS_LIVE_DELAY * 2, 30000);
}

function posLiveBoot() {
  if (globalThis.__posLiveBooted) return;
  globalThis.__posLiveBooted = true;
  posLiveConnect();
  // 平板休眠喚醒後連線多半已死：回到前景若沒連上就立刻重連
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !POS_LIVE_OK) { POS_LIVE_DELAY = 2000; posLiveConnect(); } });
}

if (typeof module !== 'undefined') module.exports = { posLiveParse };
