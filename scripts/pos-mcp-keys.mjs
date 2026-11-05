// 產生各品牌 POS MCP 金鑰（給子租戶 AI 代理用）。金鑰由 APP_SECRET 衍生，必須和正式站同一個 APP_SECRET。
// 用法：APP_SECRET=… [POS_MCP_KEY_VERSION=v1] node scripts/pos-mcp-keys.mjs [CAFE|BAR|STAY|REST]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { keyFor, LABEL } = require('../lib/pos-mcp.js');
const secret = process.env.APP_SECRET;
if (!secret) { console.error('請設定 APP_SECRET（與正式站相同）。'); process.exit(1); }
const ver = process.env.POS_MCP_KEY_VERSION || 'v1';
const want = process.argv[2] ? [process.argv[2].toUpperCase()] : Object.keys(LABEL);
for (const v of want) {
  if (!LABEL[v]) { console.error('未知品牌：' + v); process.exit(1); }
  console.log(`${v}\t${LABEL[v]}\t${keyFor(v, secret, ver)}`);
}
