// lib/member-ui.js
'use strict';

function parseTime(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(+d) ? null : d;
}

function pickNextEvent(events, now = new Date()) {
  const list = Array.isArray(events) ? events : [];
  const upcoming = list
    .map((e) => ({ e, t: parseTime(e.starts_at) }))
    .filter((x) => x.t && x.t > now)
    .sort((a, b) => a.t - b.t);
  const registered = upcoming.find((x) => x.e.registered);
  if (registered) return registered.e;
  return upcoming.length ? upcoming[0].e : null;
}

/** @param {{ active: boolean, planLabel: string, pending: boolean, hadEntitlement: boolean }} s */
function membershipStatusTitle(s, T) {
  if (s.active) return T.statusActive(s.planLabel || T.plansFallback || '');
  if (s.pending) return T.statusPending;
  if (s.hadEntitlement) return T.statusExpired;
  return T.statusNone;
}

module.exports = {
  pickNextEvent,
  membershipStatusTitle,
};
