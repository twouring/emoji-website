// IG 發佈守門：禁用字（母檔 07 §5）、作廢時段（§2）、media_publish 重試、防重發
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const ig = createRequire(import.meta.url)('../lib/ig-publisher.js');
const hits = caption => ig.checkBanned({ caption, pages: [] });

test('禁用字：舊名、夜間業態、作廢時段要擋', () => {
  for (const s of ['二樓可以居住', 'Emoji Cafe & Bar', 'Talent Lounge', '三點水是酒吧', 'meet at the bar', 'バーで一杯',
    '在咖啡 08:00–17:30', '三點水 18:00–翌日 03:00', '每日 11:00 ~ 03:00']) {
    assert.ok(hits(s).length, `應擋：${s}`);
  }
});

test('禁用字：合法寫法不誤擋', () => {
  for (const s of ['メンバー限定', 'カバーする', 'bars need company', 'our barista', '吧檯小酌',
    '在咖啡 08:00–17:00・三點水 17:00–27:00', 'open overnight']) {
    assert.deepEqual(hits(s), [], `不應擋：${s}`);
  }
});

function mockFetch(responses) {
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    const body = responses.shift();
    return { ok: !body.error, json: async () => body };
  };
  return calls;
}

test('media_publish 遇 2207027 重試，其他錯誤不重試', async () => {
  process.env.IG_PUBLISH_RETRY_MS = '1';
  const notReady = { error: { code: 9007, error_subcode: 2207027, message: 'Media ID is not available' } };
  let calls = mockFetch([notReady, notReady, { id: 'm1' }]);
  assert.deepEqual(await ig.mediaPublish('me', 'c1', 't'), { id: 'm1' });
  assert.equal(calls.length, 3);

  calls = mockFetch([notReady, notReady, notReady]);
  await assert.rejects(ig.mediaPublish('me', 'c1', 't'), /2207027/);
  assert.equal(calls.length, 3);

  calls = mockFetch([{ error: { code: 190, message: 'token expired' } }]);
  await assert.rejects(ig.mediaPublish('me', 'c1', 't'), /token expired/);
  assert.equal(calls.length, 1);
});

test('防重發：最近貼文同文（忽略空白差異）即回既有媒體；查詢失敗不擋', async () => {
  mockFetch([{ data: [{ id: 'x', caption: '別篇' }, { id: 'm9', caption: '第一行\n\n第二行 ', permalink: 'https://www.instagram.com/p/AAA/' }] }]);
  assert.deepEqual(await ig.findDuplicate('me', '第一行\n第二行', 't'), { mediaId: 'm9', externalUrl: 'https://www.instagram.com/p/AAA/' });
  mockFetch([{ data: [{ id: 'x', caption: '別篇' }] }]);
  assert.equal(await ig.findDuplicate('me', '第一行', 't'), null);
  mockFetch([{ error: { message: 'down' } }]);
  assert.equal(await ig.findDuplicate('me', '第一行', 't'), null);
});
