/* POS 操作紀錄：把 /api/admin 的寫入請求對應成現場看得懂的中文動作；不屬於 POS 的路徑回 null（不進 POS 紀錄分頁） */
const RULES = [
  ['POST', /^\/orders\/sessions$/, '開桌／開單'],
  ['POST', /^\/orders\/sessions\/[^/]+\/items$/, '加點品項'],
  ['POST', /^\/orders\/sessions\/[^/]+\/place$/, '送單'],
  ['DELETE', /^\/orders\/sessions\/[^/]+\/items\/[^/]+$/, '刪除品項'],
  ['PATCH', /^\/orders\/sessions\/[^/]+\/items\/[^/]+$/, '修改品項（數量／備註／贈送）'],
  ['POST', /^\/orders\/sessions\/[^/]+\/move$/, '轉桌／併桌'],
  ['DELETE', /^\/orders\/sessions\/[^/]+\/pay-requests\/[^/]+$/, '取消結帳請求'],
  ['POST', /^\/orders\/sessions\/[^/]+\/linepay\/(prepare|pay|check|cancel)$/, 'LINE Pay 操作'],
  ['POST', /^\/orders\/sessions\/[^/]+\/checkout$/, '結帳收款'],
  ['POST', /^\/orders\/sessions\/[^/]+\/tickets\/[^/]+\/serve$/, '出餐'],
  ['POST', /^\/orders\/sessions\/[^/]+\/close$/, '關桌'],
  ['POST', /^\/orders\/kitchen-print-jobs\/[^/]+\/claim$/, '出餐單列印'],
  ['POST', /^\/orders\/[^/]+\/invoice\/issue$/, '補開發票'],
  ['POST', /^\/orders\/[^/]+\/void$/, '作廢整張單'],
  ['POST', /^\/orders\/[^/]+\/pay-method$/, '更正付款方式'],
  ['POST', /^\/orders\/[^/]+\/items\/[^/]+\/void$/, '作廢單一品項'],
  ['POST', /^\/orders\/[^/]+\/status$/, '更改出餐狀態'],
  ['POST', /^\/orders\/table-layout$/, '調整桌位配置'],
  ['POST', /^\/orders\/pause$/, '暫停／恢復點餐'],
  ['POST', /^\/orders\/songs\/settings$/, '點歌設定（開關／價格／常態歌單）'],
  ['POST', /^\/orders\/songs\/player$/, '指定點歌播放裝置'],
  ['POST', /^\/orders\/songs\/queue$/, '櫃檯代點歌'],
  ['DELETE', /^\/orders\/songs\/queue\/[^/]+$/, '移除待播歌曲'],
  ['POST', /^\/orders\/songs\/queue\/[^/]+\/top$/, '待播歌曲移到最前'],
  ['POST', /^\/orders\/songs\/playlist\/import$/, '匯入常態歌單'],
  ['POST', /^\/orders\/songs\/youtube\/connect$/, '綁定 YouTube 帳號'],
  ['DELETE', /^\/orders\/songs\/youtube$/, '解除綁定 YouTube 帳號'],
  ['POST', /^\/orders\/service-calls\/[^/]+\/done$/, '處理客人呼叫服務'],
  ['POST', /^\/orders\/tips\/settings$/, '打賞設定（開關／表演者／金額）'],
  ['POST', /^\/orders\/tips\/payouts$/, '支付打賞給表演者'],
  ['POST', /^\/menu\/sold-out$/, '估清／恢復供應'],
  ['POST', /^\/menu\/stock$/, '設定剩餘份數'],
  ['POST', /^\/inventory\/items$/, '新增庫存品項'],
  ['PATCH', /^\/inventory\/items\/[^/]+$/, '修改庫存品項'],
  ['POST', /^\/inventory\/items\/[^/]+\/moves$/, '庫存異動（進貨／製作／耗用／報廢／盤點）'],
  ['PUT', /^\/inventory\/recipes\/[^/]+$/, '修改菜單配方'],
  ['POST', /^\/inventory\/items\/[^/]+\/convert$/, '換算庫存單位'],
  ['POST', /^\/pos\/drawer-events$/, '開錢櫃'],
  ['POST', /^\/registers\/open$/, '開帳'],
  ['POST', /^\/registers\/[^/]+\/cash$/, '錢櫃現金進出'],
  ['POST', /^\/registers\/[^/]+\/count$/, '盤點現金'],
  ['POST', /^\/registers\/[^/]+\/close$/, '關帳'],
  ['POST', /^\/registers\/[^/]+\/reopen$/, '重開帳'],
  ['POST', /^\/sales\/taishin$/, '登錄台新實收'],
  ['POST', /^\/sales\/linepay\/(sync|import)$/, 'LINE Pay 帳務同步'],
  ['POST', /^\/payment-methods$/, '新增收款帳戶'],
  ['PATCH', /^\/payment-methods\/[^/]+$/, '修改收款帳戶（改名／停用）'],
  ['POST', /^\/pos-devices\/bind$/, '綁定 POS 裝置'],
  ['DELETE', /^\/pos-devices\/[^/]+$/, '解除 POS 裝置'],
  ['POST', /^\/staff\/verify$/, '確認操作人員'],
  ['POST', /^\/staff$/, '新增員工'],
  ['PATCH', /^\/staff\/[^/]+$/, '修改員工'],
  ['POST', /^\/shifts(\/auto|\/days-off)?$/, '排班'],
  ['DELETE', /^\/shifts(\/days-off)?\/[^/]+$/, '刪除排班'],
  ['PUT', /^\/shifts\/staffing$/, '調整排班人力'],
  ['POST', /^\/attendance\/punch$/, '打卡'],
  ['POST', /^\/attendance\/makeup$/, '補打卡'],
  ['PATCH', /^\/attendance\/[^/]+$/, '修正出勤'],
  ['DELETE', /^\/attendance\/[^/]+$/, '刪除出勤'],
  ['POST', /^\/reservations$/, '新增訂位'],
  ['POST', /^\/reservations\/[^/]+\/status$/, '更改訂位狀態'],
  ['PATCH', /^\/reservations\/[^/]+$/, '修改訂位'],
  ['DELETE', /^\/reservations\/[^/]+$/, '刪除訂位'],
  ['PUT', /^\/reservation-hours$/, '修改可訂位時間'],
  ['POST', /^\/yan\/activate-membership$/, '手動開通會籍'],
  ['POST', /^\/yan\/grant$/, '手動給點'],
  ['POST', /^\/yan\/redeem-space$/, '兌換空間時數'],
];
const SENSITIVE = /token|secret|password|key|pin|card|prime/i;

/* path 為去掉 /api/admin 的部分，例如 /orders/123/void */
function describe(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '').split('?')[0].replace(/\/+$/, '') || '/';
  for (const [rm, re, label] of RULES) if (rm === m && re.test(p)) return label;
  return null;
}
function summarize(body) {
  const b = body && typeof body === 'object' ? body : {};
  return Object.entries(b)
    .filter(([k]) => !SENSITIVE.test(k) && k !== 'operator_id')
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 60) : JSON.stringify(v)?.slice(0, 60)}`)
    .join(' ').slice(0, 500);
}
module.exports = { describe, summarize, SENSITIVE };
