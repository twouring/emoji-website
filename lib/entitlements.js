'use strict';

const PLAN_DURATION = {
  day_4h: { hours: 4 },
  day_12h: { hours: 12 },
  month: { months: 1 },
  quarter: { months: 3 },
  year: { months: 12 },
  year_promo: { months: 18 },
  founding: null,
};

function addMonthsUTC(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() < day) d.setUTCDate(0); // clamp month-end
  return d;
}

function addMonthsISO(isoDate /* YYYY-MM-DD */, months) {
  return addMonthsUTC(isoDate + 'T00:00:00.000Z', months).toISOString().slice(0, 10);
}

function endsAtAfterActivation(plan, activatedAt) {
  const spec = PLAN_DURATION[plan];
  if (!spec) throw new Error('founding has fixed window');
  const start = new Date(activatedAt);
  if (spec.hours) {
    return new Date(start.getTime() + spec.hours * 3600 * 1000);
  }
  return addMonthsUTC(start, spec.months);
}

function autoActivateAt(purchasedAt) {
  return new Date(new Date(purchasedAt).getTime() + 7 * 24 * 3600 * 1000);
}

function applyLazyAutoActivate(ent, now = new Date()) {
  if (ent.plan === 'founding') return { changed: false, entitlement: ent };
  if (ent.activated_at) return { changed: false, entitlement: ent };
  const due = autoActivateAt(ent.purchased_at);
  if (now < due) return { changed: false, entitlement: ent };
  const activated_at = due;
  const starts_at = activated_at;
  const ends_at = endsAtAfterActivation(ent.plan, activated_at);
  return {
    changed: true,
    entitlement: { ...ent, activated_at, starts_at, ends_at },
  };
}

function isEntitlementActive(ent, now = new Date()) {
  if (!ent.activated_at || !ent.starts_at || !ent.ends_at) return false;
  const t = +now;
  return t >= +new Date(ent.starts_at) && t < +new Date(ent.ends_at);
}

function deriveMemberAccess(ents, now = new Date()) {
  const normalized = ents.map(e => applyLazyAutoActivate(e, now).entitlement);
  const activeEntitlements = normalized.filter(e => isEntitlementActive(e, now));
  const pending = normalized.filter(
    e => e.plan !== 'founding' && !e.activated_at
  );
  return {
    active: activeEntitlements.length > 0,
    activeEntitlements,
    pending,
    entitlements: normalized,
    lazyChanges: ents
      .map((e, i) => ({ before: e, after: applyLazyAutoActivate(e, now) }))
      .filter(x => x.after.changed)
      .map(x => x.after.entitlement),
  };
}

function pickEntitlementForQr(ents, now = new Date()) {
  const d = deriveMemberAccess(ents, now);
  if (d.activeEntitlements.length) return d.activeEntitlements[0];
  if (d.pending.length) return d.pending[0];
  return null;
}

module.exports = {
  PLAN_DURATION, addMonthsISO, endsAtAfterActivation,
  autoActivateAt, applyLazyAutoActivate, isEntitlementActive,
  deriveMemberAccess, pickEntitlementForQr,
};
