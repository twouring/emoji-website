// 產生 lib/pos-mcp-catalog.json：POS API（FOOD_API）的說明，取自 docs/API.md（docs 不進 image，所以先轉成 JSON）。
// POS 新增／改 API 後：補 docs/API.md → node scripts/build-pos-mcp-catalog.mjs → commit。test-pos-mcp 會檢查是否同步。
import fs from 'node:fs';
const root = new URL('..', import.meta.url);
const read = f => fs.readFileSync(new URL(f, root), 'utf8');

export function buildCatalog() {
  const server = read('server.js'), docs = read('docs/API.md');
  const lit = server.match(/const FOOD_API = \/(.*)\/;/)[1];   // 取正則字面的內容，不執行程式
  const food = new RegExp(lit);
  const isPos = p => food.test(p) || p === '/api/admin/pos/drawer-events';
  const routes = new Set();
  for (const m of server.matchAll(/app\.(get|post|put|patch|delete)\(\s*('[^']*'|\[[^\]]*\])/g))
    for (const p of m[2].matchAll(/'(\/api\/admin\/[^']*)'/g)) if (isPos(p[1])) routes.add(`${m[1].toUpperCase()} ${p[1]}`);
  routes.delete('GET /api/admin/orders/live');   // SSE，MCP 不支援
  const doc = {};
  const parts = docs.split(/^### /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n'), head = part.slice(0, nl).trim();
    if (!/^(GET|POST|PUT|PATCH|DELETE) \//.test(head)) continue;
    doc[head] = part.slice(nl + 1).split(/^## /m)[0].trim().replace(/\n{2,}/g, '\n').slice(0, 1500);
  }
  const out = {};
  for (const k of [...routes].sort()) out[k] = doc[k] || '';
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const c = buildCatalog();
  fs.writeFileSync(new URL('lib/pos-mcp-catalog.json', root), JSON.stringify(c, null, 1) + '\n');
  console.log(`lib/pos-mcp-catalog.json：${Object.keys(c).length} 支 POS API，缺說明 ${Object.values(c).filter(v => !v).length} 支`);
}
