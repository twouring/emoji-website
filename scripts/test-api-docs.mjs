// scripts/test-api-docs.mjs
// docs/API.md 與 server.js 的端點必須一一對應——文件漂移即測試失敗。
// 這是 API 目錄「固定維護」的機制：新增端點就得寫文件，否則 npm test 擋下。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = readFileSync(join(ROOT, 'server.js'), 'utf8');
const docs = readFileSync(join(ROOT, 'docs/API.md'), 'utf8');

// server.js：app.get('/api/…')、app.post('/auth/…') → "GET /api/…"
function routesInServer(source = server) {
  const re = /app\.(get|post|put|patch|delete)\(\s*('[^']*'|\[[^\]]*\])/g;
  const out = new Set();
  for (const m of source.matchAll(re)) {
    for (const path of m[2].matchAll(/'((?:\/api|\/auth)[^']*)'/g)) out.add(`${m[1].toUpperCase()} ${path[1]}`);
  }
  return out;
}

// docs/API.md：「### GET /api/…」標題
function routesInDocs() {
  const re = /^### (GET|POST|PUT|PATCH|DELETE) ((?:\/api|\/auth)\S*)$/gm;
  const out = new Set();
  for (const m of docs.matchAll(re)) out.add(`${m[1]} ${m[2]}`);
  return out;
}

const inServer = routesInServer();
const inDocs = routesInDocs();

test('抓得到端點——正則沒被程式碼風格改動弄壞', () => {
  assert.ok(inServer.size > 20, `server.js 只找到 ${inServer.size} 個端點，正則可能失效`);
  assert.ok(inDocs.size > 20, `docs/API.md 只找到 ${inDocs.size} 個端點，格式可能跑掉`);
});

test('server.js 的每個端點都要有文件', () => {
  const missing = [...inServer].filter(r => !inDocs.has(r)).sort();
  assert.deepEqual(missing, [], `以下端點缺 docs/API.md 說明（請補「### ${'{METHOD}'} ${'{path}'}」段落）：\n  ${missing.join('\n  ')}`);
});

test('docs/API.md 不得記錄不存在的端點', () => {
  const stale = [...inDocs].filter(r => !inServer.has(r)).sort();
  assert.deepEqual(stale, [], `以下端點已從 server.js 移除，請一併刪除文件：\n  ${stale.join('\n  ')}`);
});

test('AI agent 認證方式有寫進文件', () => {
  assert.match(docs, /ADMIN_API_KEY/, 'docs/API.md 必須說明 agent 如何認證');
});

test('Express 路徑陣列的每個 API 都納入文件對照',()=>{
 const routes=routesInServer("app.get(['/api/one','/api/two'],handler);app.post('/auth/login',handler);app.get('/page',handler);");
 assert.deepEqual([...routes],['GET /api/one','GET /api/two','POST /auth/login']);
});
