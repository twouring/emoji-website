'use strict';
/* 桌邊點餐即時同步（SSE）
   寫入路徑很多（加點、刪點、送單、出餐、收款、作廢、清桌…），不一一補通知；
   改由 Postgres 觸發器在 table_sessions／table_orders 異動時 pg_notify('table_session', session_id)，
   server 開一條專用連線 LISTEN，再把該桌最新狀態推給所有訂閱的手機。
   兩個 Cloud Run 服務（www/pos 與 admin）各自 LISTEN，所以不管哪台寫入，客人都收得到。 */

const CHANNEL = 'table_session';
const HEARTBEAT_MS = 25000;   // Cloud Run／代理閒置會斷線；空白註解行當心跳
const RETRY_MS = 2000;        // 告訴瀏覽器斷線後多久重連

const TRIGGER_SQL = `
CREATE OR REPLACE FUNCTION table_session_notify() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('${CHANNEL}', COALESCE(NEW.id, OLD.id));
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION table_order_notify() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('${CHANNEL}', COALESCE(NEW.session_id, OLD.session_id));
  RETURN NULL;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS table_sessions_live ON table_sessions;
CREATE TRIGGER table_sessions_live AFTER INSERT OR UPDATE OR DELETE ON table_sessions
  FOR EACH ROW EXECUTE FUNCTION table_session_notify();
DROP TRIGGER IF EXISTS table_orders_live ON table_orders;
CREATE TRIGGER table_orders_live AFTER INSERT OR UPDATE OR DELETE ON table_orders
  FOR EACH ROW EXECUTE FUNCTION table_order_notify();
`;

/* 訂閱表：session_id → Set<{ res, guest }>；load(id) 回該桌公開狀態（依 guest 標 mine） */
function createHub({ load, log = () => {} } = {}) {
  const subs = new Map();
  const timers = new Set();

  function write(sub, event, data) {
    try { sub.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { unsubscribe(sub); }
  }
  function unsubscribe(sub) {
    const set = subs.get(sub.id);
    if (!set) return;
    set.delete(sub);
    if (!set.size) subs.delete(sub.id);
  }
  function subscribe(id, guest, req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
    });
    res.write(`retry: ${RETRY_MS}\n\n`);
    const sub = { id, guest, res };
    if (!subs.has(id)) subs.set(id, new Set());
    subs.get(id).add(sub);
    req.on('close', () => unsubscribe(sub));
    return sub;
  }
  /* 該桌有異動：每個訂閱者依自己的 guest 拿一份（mine 標記不同，不能共用一份 payload） */
  async function notify(id) {
    const set = subs.get(id);
    if (!set || !set.size) return 0;
    let snapshot;
    try { snapshot = await load(id); } catch (e) { log('[live] load 失敗', e.message); return 0; }
    for (const sub of [...set]) write(sub, 'session', snapshot ? snapshot(sub.guest) : { id, status: 'gone' });
    return set.size;
  }
  function heartbeat() {
    for (const set of subs.values()) for (const sub of [...set]) { try { sub.res.write(': ping\n\n'); } catch { unsubscribe(sub); } }
  }
  function start() { const t = setInterval(heartbeat, HEARTBEAT_MS); t.unref?.(); timers.add(t); return t; }
  function stop() { for (const t of timers) clearInterval(t); timers.clear(); }
  const size = id => (id ? (subs.get(id)?.size || 0) : [...subs.values()].reduce((a, s) => a + s.size, 0));
  return { subscribe, notify, heartbeat, start, stop, size, write };
}

/* 專用 LISTEN 連線：斷線就重連（指數退避到 30 秒），收到 notify 就交給 hub */
function startListener(pool, hub, { log = console.warn } = {}) {
  let stopped = false, client = null, delay = 1000;
  async function connect() {
    if (stopped) return;
    try {
      client = await pool.connect();
      client.on('notification', m => { if (m.channel === CHANNEL && m.payload) hub.notify(m.payload); });
      client.on('error', e => { log('[live] LISTEN 連線中斷：', e.message); reconnect(); });
      await client.query(`LISTEN ${CHANNEL}`);
      delay = 1000;
    } catch (e) { log('[live] LISTEN 失敗：', e.message); reconnect(); }
  }
  function reconnect() {
    if (stopped) return;
    try { client?.release(true); } catch { /* 已關 */ }
    client = null;
    const t = setTimeout(connect, delay); t.unref?.();
    delay = Math.min(delay * 2, 30000);
  }
  connect();
  return { stop() { stopped = true; try { client?.release(true); } catch { /* 已關 */ } } };
}

module.exports = { CHANNEL, HEARTBEAT_MS, RETRY_MS, TRIGGER_SQL, createHub, startListener };
