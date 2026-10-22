'use strict';
/* 可訂位時間：客人端（/reserve、會員 App）可選的 30 分鐘時段。
 * 存在 site_content.reservation_hours：{ weekly:{ "0".."6": ["08:00",…] }, dates:{ "YYYY-MM-DD": […] } }
 * 規則：該日期有設定 → 用它（空陣列＝公休）；否則該星期有設定 → 用它；都沒有 → 全部時段開放（預設）。
 * 櫃檯登記（staff）不受限。凌晨 00:00–02:30 屬於「所選日期」的清晨，跟現有 SLOTS 一致。 */
const { SLOTS } = require('./reservations');

const ALL = [...SLOTS.keys()];
const weekdayOf = date => new Date(date + 'T12:00:00Z').getUTCDay();   // 0=日

function cleanList(list) {
  const s = new Set(Array.isArray(list) ? list.filter(t => SLOTS.has(t)) : []);
  return ALL.filter(t => s.has(t));
}

function parse(raw) {
  let o = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { o = {}; } }
  if (!o || typeof o !== 'object') o = {};
  const weekly = {}, dates = {};
  for (let d = 0; d < 7; d++) if (Array.isArray(o.weekly?.[d])) weekly[d] = cleanList(o.weekly[d]);
  for (const [k, v] of Object.entries(o.dates || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Array.isArray(v)) dates[k] = cleanList(v);
  return { weekly, dates };
}

/* 儲存前整理：過期的日期例外丟掉（today 以前）、與預設相同的星期不存，避免設定無限長大 */
function normalize(input, today) {
  const c = parse(input);
  for (const k of Object.keys(c.dates)) if (today && k < today) delete c.dates[k];
  if (Object.keys(c.dates).length > 400) { const e = new Error('特定日期設定太多（上限 400 天）。'); e.status = 400; throw e; }
  for (const k of Object.keys(c.weekly)) if (c.weekly[k].length === ALL.length) delete c.weekly[k];
  return c;
}

function slotsFor(cfg, date) {
  const c = cfg && cfg.weekly ? cfg : parse(cfg);
  if (Array.isArray(c.dates[date])) return c.dates[date];
  const w = c.weekly[weekdayOf(date)];
  return Array.isArray(w) ? w : ALL;
}

const isOpen = (cfg, date, time) => slotsFor(cfg, date).includes(time);

/* 關閉一段時間的訂位（一樓包場審核通過時用）：startsAt～endsAt（ISO／Date）以台北時間切成 30 分鐘時段，
 * 從對應日期的可訂位清單移除；凌晨 00:00–02:30 屬於前一天的「所選日期」，與 SLOTS 一致。回新設定與受影響的 { date: [時段] }。 */
function closeRange(cfg, startsAt, endsAt) {
  const c = cfg && cfg.weekly ? { weekly: { ...cfg.weekly }, dates: { ...cfg.dates } } : parse(cfg);
  const start = +new Date(startsAt), end = +new Date(endsAt), closed = {};
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { cfg: c, closed };
  // 從開始時間所在的 30 分鐘格開始（例如 19:10 開始也關 19:00 那格）
  for (let t = Math.floor(start / 1800e3) * 1800e3; t < end; t += 1800e3) {
    const local = new Date(t + 8 * 3600e3), time = local.toISOString().slice(11, 16);
    if (!SLOTS.has(time)) continue;
    let date = local.toISOString().slice(0, 10);
    if (time < '03:00') date = new Date(Date.parse(date + 'T00:00:00Z') - 86400e3).toISOString().slice(0, 10);
    const open = slotsFor(c, date);
    if (!open.includes(time)) continue;
    c.dates[date] = open.filter(x => x !== time);
    (closed[date] ||= []).push(time);
  }
  return { cfg: c, closed };
}

module.exports = { ALL, parse, normalize, slotsFor, isOpen, weekdayOf, closeRange };
