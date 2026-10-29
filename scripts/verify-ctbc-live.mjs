// scripts/verify-ctbc-live.mjs [start] [end] — 用環境變數帳密實際登入中信 mPOS 商店管理平台並查交易（唯讀），印出筆數與前幾筆。
// 例：CTBC_PROXY=http://172.22.0.1:3128 PUPPETEER_EXECUTABLE_PATH=… node scripts/verify-ctbc-live.mjs 2026-10-01 2026-10-29
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../lib/ctbc.js');
const cfg = C.config();
if (!cfg) { console.error('缺 CTBC_MPOS_MERCHANT_ID／CTBC_MPOS_USER／CTBC_MPOS_PASSWORD'); process.exit(2); }
const [start, end] = process.argv[2] ? [process.argv[2], process.argv[3] || process.argv[2]] : C.syncWindow();
const t0 = Date.now();
const rows = await C.fetchTransactions(cfg, start, end, { log: m => console.log('[ctbc]', m) });
console.log(`區間 ${start}~${end}：${rows.length} 筆，${Math.round((Date.now() - t0) / 1000)} 秒`);
for (const r of rows.slice(0, 5)) { const { raw, ...x } = r; console.log(JSON.stringify(x)); }
