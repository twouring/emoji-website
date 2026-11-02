'use strict';
/* 會員 App「歷史紀錄」：消費紀錄（table_orders.user_id）＋點數明細（yan_ledger）。純函式，不碰 DB。 */

const VENUE_ZH = { CAFE: '在咖啡', BAR: '三點水', SPACE: '等等空間' };

/* 把一張訂單整理成 App 顯示用：店別、品項（排除點歌、打賞、取消行）、實付、這張單的點數增減 */
function orderView(o, ledger = []) {
  const lines = (Array.isArray(o.items) ? o.items : []).filter(l => l && !l.cancelled && !l.song && !l.tip && !l.credit_of);
  const venue = (lines.find(l => l.venue) || {}).venue || '';
  const items = lines.map(l => ({ zh: l.zh || l.name || '', en: l.en || '', ja: l.ja || '', ko: l.ko || '', qty: Number(l.qty) || 1, price: Number(l.price) || 0 }));
  const pts = ledger.filter(r => r.ref_id === o.id);
  const earned = pts.filter(r => r.kind === 'earn' || r.kind === 'void_earn').reduce((s, r) => s + Number(r.delta || 0), 0);
  const redeemed = -pts.filter(r => r.kind === 'redeem' || r.kind === 'void_redeem').reduce((s, r) => s + Number(r.delta || 0), 0);
  return {
    id: o.id, at: o.paid_at, venue, venue_zh: VENUE_ZH[venue] || '', amount: Number(o.amount) || 0,
    void: o.status === 'void', online: !!(o.payer && o.payer.online), items, earned, redeemed,
  };
}

/* 點數明細：每筆帳本列成一行，新的在前。type 給前端選文案：earn 消費累點、redeem 兌換、grant 贈點、review 評論、void 沖回 */
function ledgerView(rows = []) {
  return [...rows]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || String(b.id).localeCompare(String(a.id)))
    .map(r => {
      const type = r.kind === 'void_earn' || r.kind === 'void_redeem' ? 'void'
        : r.kind === 'grant' ? (r.ref_type === 'review' ? 'review' : 'grant')
        : r.kind;
      return { id: r.id, at: r.created_at, type, delta: Number(r.delta) || 0, brand: r.brand || '', brand_zh: VENUE_ZH[r.brand] || '',
        reason: r.kind === 'grant' && r.ref_type === 'manual' ? String(r.reason || '') : '', expires_at: r.expires_at || null,
        ref: r.ref_type === 'order' || !r.ref_type ? r.ref_id : '' };
    });
}

module.exports = { orderView, ledgerView, VENUE_ZH };
