// scripts/test-member-ui.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  pickNextEvent,
  membershipStatusTitle,
} = require('../lib/member-ui.js');

const now = new Date('2026-07-12T12:00:00.000Z');

for (const page of ['member.html', 'en/member.html', 'ja/member.html']) {
  test(`${page}: paid return remains retryable until verification succeeds`, async () => {
    const html = fs.readFileSync(new URL('../public/' + page, import.meta.url), 'utf8');
    const start = html.indexOf('  async function fulfillPlanIfNeeded()');
    const end = html.indexOf('  async function regEvent(', start);
    assert.ok(start >= 0 && end > start);
    const changedUrls = [];
    let response;
    const context = {
      URLSearchParams, token: 'member-token', FELLOW: '', showToast() {}, T: { opFail: 'retry', planVerifying: 'verifying', planPaid: 'paid', planCanceled: 'canceled' },
      location: { pathname: '/' + page.replace('.html', ''), search: '?plan_paid=1&s=cs_test&keep=1', hash: '#points' },
      history: { replaceState: (_state, _title, url) => changedUrls.push(url) },
      fetch: async (url, options) => {
        assert.equal(url, '/api/me/plans/verify');
        assert.equal(options.headers.authorization, 'Bearer member-token');
        assert.deepEqual(JSON.parse(options.body), { session_id: 'cs_test' });
        if (response instanceof Error) throw response;
        return response;
      },
    };
    const run = () => vm.runInNewContext(html.slice(start, end) + '\nfulfillPlanIfNeeded()', context);
    for (const failure of [
      { ok: false, json: async () => ({ error: 'temporary failure' }) },
      { ok: true, json: async () => ({}) },
      { ok: true, json: async () => { throw new Error('invalid response'); } },
      new Error('network failure'),
    ]) {
      response = failure;
      await assert.rejects(run);
      assert.deepEqual(changedUrls, []);
    }
    response = { ok: true, json: async () => ({ ok: true, already: true }) };
    await run();
    assert.deepEqual(changedUrls, [context.location.pathname + '?keep=1#points']);

    changedUrls.length = 0;
    response = { ok: false, status: 401, json: async () => ({ error: 'sign in again' }) };
    let loginReturn;
    const removed = [];
    Object.assign(context, {
      KEY: 'tth_token', MEMBER_PATH: context.location.pathname, card: {}, stopQrRefresh() {},
      localStorage: { removeItem: key => removed.push(key) },
      loginBtn: redirect => { loginReturn = redirect; return 'Sign in'; },
    });
    context.location.origin = 'https://www.emoji.tw';
    const loggedOut = html.slice(html.indexOf('  function renderLoggedOut()'), html.indexOf('  function renderFoundingLine('));
    const main = html.slice(html.indexOf('  async function main()'), html.indexOf("  document.addEventListener('visibilitychange'"));
    await vm.runInNewContext(html.slice(start, end) + loggedOut + main + '\nmain()', context);
    assert.deepEqual(removed, ['tth_token', 'tth_name']);
    assert.deepEqual(changedUrls, []);
    assert.equal(loginReturn, context.location.origin + context.location.pathname + context.location.search);

    context.location.hash = '#token=new-token';
    let savedToken;
    context.localStorage = { setItem: (_key, value) => { savedToken = value; }, getItem: () => savedToken };
    const callback = html.slice(html.indexOf('  const hash = new URLSearchParams'), html.indexOf('  const loginBtn ='));
    vm.runInNewContext(callback, { ...context, token: undefined });
    assert.equal(savedToken, 'new-token');
    assert.deepEqual(changedUrls, [context.location.pathname + context.location.search]);
  });

  test(`${page}: admin member view only renders their own membership`, async () => {
    const html = fs.readFileSync(new URL('../public/' + page, import.meta.url), 'utf8');
    const main = html.slice(html.indexOf('  async function main()'), html.indexOf("  document.addEventListener('visibilitychange'"));
    let rendered;
    const data = { role: 'admin', me: { id: 'audit_admin' }, commitments: [
      { id: 'other-membership', user_id: 'audit_other' },
      { id: 'own-membership', user_id: 'audit_admin' },
    ] };
    await vm.runInNewContext(main + '\nmain()', {
      token: 'member-token', FELLOW: '', fulfillPlanIfNeeded: async () => {},
      fetch: async () => ({ ok: true, json: async () => data }),
      renderMember: value => { rendered = value; },
    });
    assert.deepEqual(rendered.commitments, [{ id: 'own-membership', user_id: 'audit_admin' }]);
  });
}

test('pickNextEvent prefers soonest registered future event', () => {
  const events = [
    { id: '1', title: 'A', starts_at: '2026-07-20T00:00:00.000Z', registered: false },
    { id: '2', title: 'B', starts_at: '2026-07-18T00:00:00.000Z', registered: true },
    { id: '3', title: 'C', starts_at: '2026-07-15T00:00:00.000Z', registered: false },
  ];
  assert.equal(pickNextEvent(events, now).id, '2');
});

test('pickNextEvent falls back to soonest upcoming if none registered', () => {
  const events = [
    { id: '1', title: 'A', starts_at: '2026-07-20T00:00:00.000Z', registered: false },
    { id: '3', title: 'C', starts_at: '2026-07-15T00:00:00.000Z', registered: false },
  ];
  assert.equal(pickNextEvent(events, now).id, '3');
});

test('pickNextEvent returns null when empty or all past', () => {
  assert.equal(pickNextEvent([], now), null);
  assert.equal(pickNextEvent([
    { id: '1', starts_at: '2026-07-01T00:00:00.000Z', registered: true },
  ], now), null);
});

test('membershipStatusTitle covers main states', () => {
  const T = {
    statusActive: (plan) => `${plan}進行中`,
    statusPending: '待首次進場啟用',
    statusExpired: '會籍已到期',
    statusNone: '尚未有會籍',
  };
  assert.match(membershipStatusTitle({
    active: true, planLabel: '月票', pending: false, hadEntitlement: true,
  }, T), /月票進行中/);
  assert.equal(membershipStatusTitle({
    active: false, planLabel: '', pending: true, hadEntitlement: true,
  }, T), '待首次進場啟用');
  assert.equal(membershipStatusTitle({
    active: false, planLabel: '', pending: false, hadEntitlement: true,
  }, T), '會籍已到期');
  assert.equal(membershipStatusTitle({
    active: false, planLabel: '', pending: false, hadEntitlement: false,
  }, T), '尚未有會籍');
});
