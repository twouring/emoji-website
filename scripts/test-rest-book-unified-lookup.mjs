import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { lookupBookWithStores } = require('../lib/book-stores.js');
const ISBN = '9789861755267';
const offers = [{ name: '誠品', offers: [
  { format: 'paper', title: '原子習慣', author: '詹姆斯', publisher: '方智', pub_date: '2019-06', binding: '平裝', list_price: 330, price: 260 },
  { format: 'ebook', title: '電子書', list_price: 231, price: 203 },
] }];
const stores = { isbn: ISBN, stores: offers, list_price: 330, best: { price: 260 } };

test('同一次查書回應附八家書店資料；國圖定價優先，不用書店促銷價', async () => {
  let queryTitle;
  const result = await lookupBookWithStores(ISBN, {
    lookupBook: async () => ({ title: '原子習慣', list_price: 350, source: 'ncl' }),
    lookupOffers: async (_, { title }) => { queryTitle = title; return stores; },
  });
  assert.equal(queryTitle, '原子習慣');
  assert.equal(result.book.list_price, 350);
  assert.equal(result.retail.stores[0].offers[0].price, 260);
  assert.equal(result.book.source, 'ncl');
});

test('書目查不到時，只從紙本補書名與定價，不拿電子書或最低售價當定價', async () => {
  const result = await lookupBookWithStores(ISBN, {
    lookupBook: async () => ({ isbn: ISBN, found: false }),
    lookupOffers: async () => ({ ...stores, stores: [{ name: '讀墨', offers: [{ format: 'ebook', title: '電子書', list_price: 200 }] }, ...offers] }),
  });
  assert.equal(result.book.title, '原子習慣');
  assert.equal(result.book.author, '詹姆斯');
  assert.equal(result.book.source, 'store');
  assert.equal(result.book.source_name, '誠品');
  assert.equal(result.book.list_price, 330);
});

test('現有書目不重查國圖，仍帶回書店資料', async () => {
  const existing = { isbn: ISBN, zh: '原子習慣', price: 330 };
  const result = await lookupBookWithStores(ISBN, { existing,
    lookupBook: async () => { throw Error('不應查國圖'); },
    lookupOffers: async (_, { title }) => { assert.equal(title, '原子習慣'); return stores; },
  });
  assert.equal(result.existing, existing);
  assert.equal(result.book, null);
  assert.equal(result.retail.list_price, 330);
});

test('國圖無臺幣定價時補書店紙本定價，外幣不換算；書店失效不阻斷書目', async () => {
  const query = { lookupBook: async () => ({ title: '原子習慣', list_price: 0, source: 'google' }), lookupOffers: async () => stores };
  const result = await lookupBookWithStores(ISBN, query);
  assert.equal(result.book.list_price, 330);
  assert.equal(result.book.price_source, 'stores');
  const jp = await lookupBookWithStores(ISBN, { ...query, lookupBook: async () => ({ title: '日文書', list_price: 0, reference_currency: 'JPY', reference_price: 500 }) });
  assert.equal(jp.book.list_price, 0);
  const failure = await lookupBookWithStores(ISBN, { ...query, lookupOffers: async () => { throw Error('網路錯誤'); } });
  assert.equal(failure.book.title, '原子習慣');
  assert.deepEqual(failure.retail.stores, []);
  assert.equal(failure.retail.error, '網路錯誤');
});

test('無紙本資料時不採用電子書價，查書鏈失敗但書店成功仍補紙本', async () => {
  const ebookOnly = await lookupBookWithStores(ISBN, { lookupBook: async () => ({ found: false }), lookupOffers: async () => ({ stores: [{ name: '讀墨', offers: [{ format: 'ebook', title: '電子書', list_price: 231 }] }], list_price: 0 }) });
  assert.equal(ebookOnly.book.found, false);
  const fallback = await lookupBookWithStores(ISBN, { lookupBook: async () => { throw Error('國圖離線'); }, lookupOffers: async () => stores });
  assert.equal(fallback.book.title, '原子習慣');
});

test('後台查書只打一支 API，直接渲染同筆書店資料', () => {
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../public/rest-book-admin.html', import.meta.url), 'utf8');
  assert.match(server, /app\.get\('\/api\/admin\/menu\/books\/lookup'[\s\S]*?lookupBookWithStores\(isbn/);
  assert.match(page, /\/admin\/menu\/books\/lookup\?isbn=/);
  assert.match(page, /paintDraft\(\);\s*paintStores\(d\.retail\);/);
  assert.doesNotMatch(page, /paintDraft\(\);\s*loadStores\(isbn, DRAFT\.title\)/);
  assert.doesNotMatch(page, /id="use-best"/);
});
