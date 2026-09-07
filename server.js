/* =========================================================================
   言文字｜台灣人才聚落・創始會員計畫 — backend
   Express 同時提供前端靜態檔與 /api REST API；資料存 Postgres。
   開機自動建表 + （可選）種子；DB 未設定時優雅降級（API 回 503，前端照常）。
   ========================================================================= */
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const Stripe = require('stripe');
const {
  endsAtAfterActivation, deriveMemberAccess, pickEntitlementForQr,
  applyLazyAutoActivate,
} = require('./lib/entitlements');
const { signAccessToken, verifyAccessToken } = require('./lib/access-token');
const { isAdminApiKey, ADMIN_API_KEY_MIN } = require('./lib/admin-key');
const { safeEqual, signToken: signSession, verifyToken: verifySession, matchesPointCheckout,
  PUBLIC_CONTENT_KEYS, rateLimit } = require('./lib/security');
const {embedOrigins}=require('./lib/event-embed');
const {richText,contentFileType}=require('./lib/event-rich-text');
const {normalizeBlast,blastAudienceSQL}=require('./lib/event-mailer');
const {normalizeTickets,selectTicket,ticketPrice,publicTickets,normalizeCoupons,discountPrice} = require('./lib/event-tickets');
const {eventCalendar,googleCalendarUrl} = require('./lib/event-calendar');
const {refundTotals}=require('./lib/event-refunds');
const eventQuestions = require('./lib/event-questions');
const { eventSlug, normalizeEventInput, localizeEvent, normalizeAttribution } = require('./lib/events');
const { normalizeEventApplication } = require('./lib/event-applications');
const { sendMail, sendMailQuietly, NOTIFY_EMAIL } = require('./lib/mail');
const {
  POINT_PRICE_TWD, PACKS, MEMBERSHIP_GIFT_POINTS, PLAN_PRICE_TWD,
  addYears, isLotAvailable, availableBalance, planDebit, planRefund, redeemPointsFor,
} = require('./lib/points');
const { FEATURED_ID, eventPage, featuredEvent } = require('./lib/event-page');
const { sendPage, layoutMiddleware, composeEventMeta } = require('./lib/layout');
const { SPACE_SEED, missingSpaceSeedKeys } = require('./lib/space-content');
const { assertSpaceImageFile, buildSafeSpaceFilename } = require('./lib/space-upload');
const { assertSocialImageFile, buildSafeSocialFilename, sniffImageType } = require('./lib/social-upload');
const { loadSocialSeedPosts } = require('./lib/social-seed');
const {
  MENU_CONTENT_KEY,
  loadMenuSeedRows,
  buildMenuSeedDoc,
  validateMenuSeedDoc,
  shouldWriteMenuSeed,
  stringifyMenuDoc,
} = require('./lib/menu-seed');

const PORT = process.env.PORT || 8080;
const PRICE = 35000;                    // 創始會費（固定）
const TARGET = 3500000;                 // 預收會費總額（100 名 × NT$35,000）
const MIN_TERM = 18, MAX_TERM = 18;     // 會籍期間固定 18 個月（term 以月計）
// 超級管理員：以 Google 帳號（email）認定，非代碼。超管可於後台指派其他管理員（users.is_admin）。
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'us@twouring.com').toLowerCase();
const SECRET = process.env.APP_SECRET || 'dev-insecure-secret-change-me';
const ACCESS_QR_SECRET = process.env.ACCESS_QR_SECRET || '';
const ACCESS_DOOR_SECRET = process.env.ACCESS_DOOR_SECRET || '';
const EVENT_QR_SECRET = process.env.EVENT_QR_SECRET || ACCESS_QR_SECRET;
// AI agent 管理金鑰：以 Authorization: Bearer <key> 取得超級管理員權限打 /api/admin/*。
// 等同超管密碼，僅存於環境變數、勿寫入前端；外洩即全後台淪陷，換金鑰即撤銷。
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
// 會籍預售：限量 100 名，售罄不補
const MAX_PARTICIPANTS = Number(process.env.MAX_PARTICIPANTS || 100);
// 個資加密金鑰（身分證字號等敏感欄位 at-rest 加密）；建議獨立設 PII_KEY，預設沿用 APP_SECRET 衍生
const PII_KEY = require('crypto').createHash('sha256').update(process.env.PII_KEY || SECRET).digest();

if (SECRET === 'dev-insecure-secret-change-me') {
  // 正式環境 fail closed：session 簽章與 PII 加密金鑰皆由 APP_SECRET 衍生，預設值等同無保護
  if (process.env.NODE_ENV === 'production') { console.error('[fatal] APP_SECRET 未設定，正式環境拒絕啟動。'); process.exit(1); }
  console.warn('[warn] APP_SECRET 未設定，使用不安全的預設值，請於 Zeabur 設定 APP_SECRET。');
}
if (!ACCESS_QR_SECRET) console.warn('[warn] ACCESS_QR_SECRET 未設定，進出 QR 停用。');
if (!ACCESS_DOOR_SECRET) console.warn('[warn] ACCESS_DOOR_SECRET 未設定，access/scan 停用。');
if (!ADMIN_API_KEY) console.warn('[warn] ADMIN_API_KEY 未設定，AI agent 管理 API 停用（後台 Google 登入不受影響）。');
else if (ADMIN_API_KEY.length < ADMIN_API_KEY_MIN)
  console.warn(`[warn] ADMIN_API_KEY 長度不足 ${ADMIN_API_KEY_MIN} 字元，已忽略；請改用 openssl rand -hex 32 產生。`);

/* ---------- Stripe（開放購買；未設金鑰時 /api/checkout 回 503） ---------- */
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 15000, maxNetworkRetries: 1 }) : null;
if (!stripe) console.warn('[warn] STRIPE_SECRET_KEY 未設定，購買功能停用（/api/checkout 回 503）。');
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
if (stripe && !STRIPE_WEBHOOK_SECRET) console.warn('[warn] STRIPE_WEBHOOK_SECRET 未設定，付費活動停用。');
if (!EVENT_QR_SECRET) console.warn('[warn] EVENT_QR_SECRET／ACCESS_QR_SECRET 未設定，活動票券 QR 停用。');
const MEMBERSHIP_START = process.env.MEMBERSHIP_START || '2026-11-01'; // 會籍起算＝開幕日（/api/commitments 與 Stripe 共用此單一來源）
const SALE_END = process.env.SALE_END || '2026-12-31'; // 創始會員售止日（含當日；須與 fellow 頁面三語同步）

/* ---------- Google 登入（官網會員專區用；未設 GOOGLE_CLIENT_ID 時 /auth/google 回 503） ---------- */
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
// 站台對外網址，供 Google 導回 callback；本地測試設 PUBLIC_ORIGIN=http://localhost:8080
const SITE_BASE = (process.env.PUBLIC_ORIGIN || 'https://www.emoji.tw').replace(/\/$/, '');
const GOOGLE_REDIRECT_URI = SITE_BASE + '/auth/google/callback';
if (!GOOGLE_CLIENT_ID) console.warn('[warn] GOOGLE_CLIENT_ID 未設定，Google 登入停用（/auth/google 回 503）。');
// 允許的登入完成導回目標與 CORS 來源（官網子網域），防 open redirect；逗號分隔可覆寫
const WEB_ORIGINS = (process.env.WEB_ORIGINS ||
  'https://www.emoji.tw,https://emoji.tw,http://localhost:5500,http://127.0.0.1:5500')
  .split(',').map(s => s.trim()).filter(Boolean);
const DEFAULT_MEMBER_URL = (process.env.MEMBER_URL || WEB_ORIGINS[0] + '/member');
function safeRedirect(u) {
  try { return WEB_ORIGINS.includes(new URL(u).origin) ? u : null; } catch { return null; }
}

/* ---------- DB ---------- */
const connStr = process.env.DATABASE_URL || process.env.POSTGRES_CONNECTION_STRING || '';
function poolConfig() {
  // SSL：Zeabur 內網 Postgres 不需 SSL（預設關閉，不會停用任何驗證）。
  // 託管型外部 DB 需要 SSL 時：設 PGSSL=true（完整驗證憑證）；
  // 僅當憑證鏈無法驗證、且你信任該網路時，才用 PGSSL=relax（放寬驗證）。
  let ssl = false;
  if (process.env.PGSSL === 'true') ssl = true;
  else if (process.env.PGSSL === 'relax') ssl = { rejectUnauthorized: false };
  if (connStr) return { connectionString: connStr, ssl };
  // 退而求其次：用個別環境變數組裝（相容 Zeabur POSTGRES_* 與標準 PG*）
  const host = process.env.POSTGRES_HOST || process.env.PGHOST;
  if (!host) return null;
  return {
    host,
    port: Number(process.env.POSTGRES_PORT || process.env.PGPORT || 5432),
    user: process.env.POSTGRES_USERNAME || process.env.POSTGRES_USER || process.env.PGUSER,
    password: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD,
    database: process.env.POSTGRES_DATABASE || process.env.POSTGRES_DB || process.env.PGDATABASE,
    ssl,
  };
}
const cfg = poolConfig();
const pool = cfg ? new Pool({ ...cfg, connectionTimeoutMillis: 5000, statement_timeout: 15000 }) : null;
let dbReady = false;
const q = (text, params) => pool.query(text, params);

/* ---------- 日期工具 ---------- */
function addMonthsISO(iso, m) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.toISOString().slice(0, 10);
}
const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = (p = '') => p + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const certNo = seq => 'TTHM-2026-' + String(seq).padStart(3, '0');

/* ---------- 敏感個資 at-rest 加密（AES-256-GCM） ---------- */
function decPII(v) {
  if (!v || typeof v !== 'string' || !v.startsWith('enc:')) return v;
  try {
    const raw = Buffer.from(v.slice(4), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', PII_KEY, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch (e) { return '***'; }
}
const pubUser = u => u ? { ...u, id_no: decPII(u.id_no) } : u;

/* ---------- migrate + seed ---------- */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bonds (
  id TEXT PRIMARY KEY,
  project_name TEXT,
  target_amount BIGINT,
  interest_rate NUMERIC,
  min_term INT, max_term INT,
  status TEXT,
  progress INT
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT, email TEXT, phone TEXT,
  invite_code TEXT UNIQUE,
  id_no TEXT, address TEXT, bank TEXT,
  status TEXT, can_view BOOLEAN DEFAULT true,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS commitments (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  amount BIGINT, interest_rate NUMERIC, term_years INT,
  start_date DATE, maturity_date DATE,
  contract_status TEXT, payment_status TEXT, membership_status TEXT,
  cert_no TEXT UNIQUE, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  commitment_id TEXT REFERENCES commitments(id) ON DELETE CASCADE,
  type TEXT, amount BIGINT,
  due_date DATE, paid_date DATE, status TEXT
);
CREATE TABLE IF NOT EXISTS updates (
  id TEXT PRIMARY KEY,
  title TEXT, content TEXT, type TEXT,
  visible_to TEXT DEFAULT 'all',
  published_at DATE
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  slug TEXT,
  title TEXT, description TEXT, location TEXT,
  starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
  capacity INT DEFAULT 0,               -- 0 = 不限名額
  price_twd INT NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'public', -- public / private（private = 不列出、持連結可看）
  status TEXT DEFAULT '報名中',          -- 草稿 / 報名中 / 已結束
  checkin_mode TEXT NOT NULL DEFAULT 'standard',
  checkin_mode_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS event_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  request_hash TEXT NOT NULL,
  community_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
  attendees INT NOT NULL CHECK (attendees BETWEEN 1 AND 10000),
  requirements TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'community' CHECK (kind IN ('community','business')),
  venue TEXT NOT NULL DEFAULT '3F' CHECK (venue IN ('2F','3F')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  consent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS event_applications_created_idx ON event_applications(created_at DESC);
CREATE TABLE IF NOT EXISTS admin_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  status INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_logs_created_idx ON admin_logs(created_at DESC);
CREATE TABLE IF NOT EXISTS event_regs (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  note TEXT,
  entry_source TEXT NOT NULL DEFAULT 'self_service',
  status TEXT NOT NULL DEFAULT 'registered', -- pending_payment / registered / refunded / cancelled / expired
  amount_due INT NOT NULL DEFAULT 0,
  amount_paid INT NOT NULL DEFAULT 0,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  checkout_expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  stripe_refund_id TEXT,
  checked_in_at TIMESTAMPTZ,
  checked_in_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  source TEXT,
  source_id TEXT,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements(user_id);
CREATE TABLE IF NOT EXISTS access_scans (
  id TEXT PRIMARY KEY,
  entitlement_id TEXT REFERENCES entitlements(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  token_iat INT,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entitlement_id, token_iat)
);
CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS point_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL,
  principal INT NOT NULL,
  bonus INT NOT NULL DEFAULT 0,
  pay_twd INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_session_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS point_orders_stripe_session_uidx
  ON point_orders(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS point_lots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  original_amount INT NOT NULL,
  remaining INT NOT NULL,
  expires_at TIMESTAMPTZ,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, type, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS point_lots_user_idx ON point_lots(user_id);
CREATE TABLE IF NOT EXISTS point_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lot_id TEXT REFERENCES point_lots(id),
  delta INT NOT NULL,
  reason TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  actor TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS point_ledger_user_idx ON point_ledger(user_id);
CREATE TABLE IF NOT EXISTS point_redemptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  points INT NOT NULL,
  hours INT,
  status TEXT NOT NULL DEFAULT 'paid',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS point_refunds (
  id TEXT PRIMARY KEY,
  point_order_id TEXT NOT NULL REFERENCES point_orders(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  principal_points INT NOT NULL,
  refund_twd INT NOT NULL,
  bonus_voided INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  stripe_refund_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'ig',
  post_type TEXT NOT NULL DEFAULT 'image',
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  caption_en TEXT NOT NULL DEFAULT '',
  caption_ja TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '',
  pages JSONB NOT NULL DEFAULT '[]',
  images JSONB NOT NULL DEFAULT '[]',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  external_url TEXT NOT NULL DEFAULT '',
  series TEXT NOT NULL DEFAULT '',
  phase TEXT NOT NULL DEFAULT '',
  cta TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  metrics JSONB NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS social_posts_sched_idx ON social_posts(scheduled_at);
CREATE TABLE IF NOT EXISTS ig_assets (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  used_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL DEFAULT '',
  layer TEXT NOT NULL DEFAULT 'awareness',
  status TEXT NOT NULL DEFAULT 'planned',
  start_date DATE,
  end_date DATE,
  budget INT NOT NULL DEFAULT 0,
  spent INT NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function migrate() {
  await q(SCHEMA_SQL);
  // 既有 DB 補欄位：管理員旗標（超管以 Google email 認定，其餘管理員存此旗標）
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false`);
  await q(`CREATE TABLE IF NOT EXISTS email_login_tokens (
    token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,name TEXT NOT NULL,redirect TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),expires_at TIMESTAMPTZ NOT NULL,used_at TIMESTAMPTZ)`);
  await q(`CREATE INDEX IF NOT EXISTS email_login_recent ON email_login_tokens(email,created_at)`);
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_event_organizer BOOLEAN NOT NULL DEFAULT false`);
  await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id) ON DELETE SET NULL`);
  await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS checkin_mode TEXT NOT NULL DEFAULT 'standard'`);
  await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS checkin_mode_locked BOOLEAN NOT NULL DEFAULT false`);
  await q(`ALTER TABLE events DROP CONSTRAINT IF EXISTS events_checkin_mode_check`);
  await q(`ALTER TABLE events ADD CONSTRAINT events_checkin_mode_check CHECK(checkin_mode IN ('standard','express'))`);
  await q(`CREATE TABLE IF NOT EXISTS event_hosts (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
    is_visible BOOLEAN NOT NULL DEFAULT false, can_manage BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY(event_id,email))`);
  await q(`ALTER TABLE event_hosts ADD COLUMN IF NOT EXISTS can_checkin BOOLEAN NOT NULL DEFAULT false`);
  await q(`ALTER TABLE event_hosts ADD COLUMN IF NOT EXISTS checkin_ticket_ids JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await q(`CREATE INDEX IF NOT EXISTS event_hosts_email_idx ON event_hosts(email) WHERE can_manage=true`);
  await q(`CREATE TABLE IF NOT EXISTS event_notification_preferences (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 blasts BOOLEAN NOT NULL DEFAULT true,reminders BOOLEAN NOT NULL DEFAULT true,feedback BOOLEAN NOT NULL DEFAULT true,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(event_id,user_id))`);
  await q(`CREATE TABLE IF NOT EXISTS event_feedback (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),comment TEXT NOT NULL DEFAULT '',updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(event_id,user_id))`);
  await q(`CREATE TABLE IF NOT EXISTS event_messages (
    id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,body TEXT NOT NULL,audience TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'draft',
    send_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS event_deliveries (
    id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES event_messages(id) ON DELETE CASCADE,
    email TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued',
    provider_id TEXT,next_attempt_at TIMESTAMPTZ NOT NULL,first_attempt_at TIMESTAMPTZ,last_error TEXT,
    UNIQUE(message_id,email))`);
  await q(`CREATE TABLE IF NOT EXISTS event_delivery_events (
    id TEXT PRIMARY KEY,provider_id TEXT NOT NULL,event_type TEXT NOT NULL,occurred_at TIMESTAMPTZ NOT NULL)`);
  await q(`CREATE INDEX IF NOT EXISTS event_delivery_events_provider ON event_delivery_events(provider_id,occurred_at)`);
  await q(`CREATE TABLE IF NOT EXISTS event_views (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,day DATE NOT NULL,
    source TEXT NOT NULL DEFAULT '',campaign TEXT NOT NULL DEFAULT '',views INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(event_id,day,source,campaign))`);
  await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS coupons JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS coupon_snapshot JSONB`);
  await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS event_details JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS tickets JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1`);
  // Existing bookings must not receive surprise confirmation emails after deployment.
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS confirmation_queued BOOLEAN NOT NULL DEFAULT true`);
  await q(`ALTER TABLE event_regs ALTER COLUMN confirmation_queued SET DEFAULT false`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'zh'`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS attribution JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS capture_required BOOLEAN NOT NULL DEFAULT false`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS authorization_expires_at TIMESTAMPTZ`);
  await q(`CREATE TABLE IF NOT EXISTS event_online_joins (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first_joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),last_joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),clicks INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY(event_id,user_id))`);
  await q(`CREATE TABLE IF NOT EXISTS event_visitors (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,visitor_hash TEXT NOT NULL,day DATE NOT NULL,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(event_id,visitor_hash,day))`);
  await q(`ALTER TABLE event_deliveries ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await q(`ALTER TABLE event_messages ADD COLUMN IF NOT EXISTS registration_id TEXT`);
  await q(`ALTER TABLE event_messages ADD COLUMN IF NOT EXISTS ticket_version INTEGER`);
  await q(`ALTER TABLE event_messages ADD COLUMN IF NOT EXISTS expected_status TEXT`);
  await q(`ALTER TABLE event_messages ADD COLUMN IF NOT EXISTS body_html TEXT NOT NULL DEFAULT ''`);
  await q(`ALTER TABLE event_deliveries ADD COLUMN IF NOT EXISTS body_html TEXT NOT NULL DEFAULT ''`);
  await q(`ALTER TABLE event_messages ADD COLUMN IF NOT EXISTS audiences JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await q(`ALTER TABLE event_messages ADD COLUMN IF NOT EXISTS ticket_ids JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await q(`CREATE TABLE IF NOT EXISTS event_attendees (
    id TEXT PRIMARY KEY,registration_id TEXT NOT NULL REFERENCES event_regs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,email TEXT NOT NULL,ordinal INTEGER NOT NULL DEFAULT 0,
    checked_in_at TIMESTAMPTZ,checked_in_by TEXT)`);
  await q(`ALTER TABLE event_attendees ADD COLUMN IF NOT EXISTS show_name BOOLEAN NOT NULL DEFAULT false`);
  await q(`CREATE TABLE IF NOT EXISTS event_ticket_orders (
    id TEXT PRIMARY KEY,registration_id TEXT NOT NULL REFERENCES event_regs(id),ticket_version INTEGER NOT NULL,
    ticket_snapshot JSONB,quantity INTEGER NOT NULL,attendees JSONB NOT NULL DEFAULT '[]'::jsonb,
    amount_due INTEGER NOT NULL,amount_paid INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL,
    stripe_session_id TEXT,stripe_payment_intent_id TEXT,expires_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`ALTER TABLE event_attendees ADD COLUMN IF NOT EXISTS order_id TEXT REFERENCES event_ticket_orders(id)`);
  await q(`ALTER TABLE event_ticket_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`);

  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS refund_status TEXT`);
  await q(`CREATE TABLE IF NOT EXISTS event_refunds (
    id TEXT PRIMARY KEY,registration_id TEXT NOT NULL REFERENCES event_regs(id),payment_intent TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount>0),status TEXT NOT NULL,request_id TEXT UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS event_settlements (
    id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    amount_twd INTEGER NOT NULL CHECK(amount_twd>0),status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','paid','cancelled')),
    due_on DATE NOT NULL,reference TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',created_by TEXT,
    paid_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE INDEX IF NOT EXISTS event_settlements_event_idx ON event_settlements(event_id,created_at DESC)`);
  await q(`INSERT INTO event_refunds(id,registration_id,payment_intent,amount,status)
    SELECT stripe_refund_id,id,stripe_payment_intent_id,amount_paid*100,COALESCE(refund_status,'succeeded') FROM event_regs
    WHERE stripe_refund_id IS NOT NULL AND stripe_payment_intent_id IS NOT NULL AND amount_paid>0
    AND NOT EXISTS(SELECT 1 FROM event_refunds f WHERE f.payment_intent=event_regs.stripe_payment_intent_id) ON CONFLICT DO NOTHING`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS ticket_version INTEGER NOT NULL DEFAULT 1`);
  await q(`CREATE TABLE IF NOT EXISTS event_registration_history (
    id BIGSERIAL PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    registration_id TEXT NOT NULL,user_id TEXT NOT NULL,snapshot JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS ticket_snapshot JSONB`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_settings JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await q(`CREATE TABLE IF NOT EXISTS event_activity (
    id BIGSERIAL PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    registration_id TEXT,actor_id TEXT,action TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS entry_source TEXT NOT NULL DEFAULT 'self_service'`);
  await q(`UPDATE event_regs r SET entry_source='imported'
    WHERE entry_source='self_service' AND COALESCE((SELECT a.action LIKE 'guest_imported:%'
      FROM event_activity a WHERE a.registration_id=r.id AND
      (a.action LIKE 'guest_imported:%' OR (a.actor_id=r.user_id AND a.action IN ('registered','pending_approval','waitlisted','capture_pending')))
      ORDER BY a.id DESC LIMIT 1),false)`);
  // 活動模組：由既有免費報名原地升級；舊活動網址先沿用 id，避免資料遺失。
  await q(`ALTER TABLE event_applications ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'community'`);
  await q(`ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ`);
  await q(`ALTER TABLE event_applications ADD COLUMN IF NOT EXISTS venue TEXT NOT NULL DEFAULT '3F'`);
  await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS embed_origins JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS rich_content JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS slug TEXT`);
  await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ`);
  await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS price_twd INT NOT NULL DEFAULT 0`);
  await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'`);
  await q(`UPDATE events SET slug=id WHERE slug IS NULL OR slug=''`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS events_slug_uidx ON events(slug)`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'registered'`);
  const halloween = require('./lib/halloween-seed.json');
  await q(`INSERT INTO events (id,slug,title,description,location,starts_at,ends_at,status,translations)
    VALUES ($1,'halloween-2026',$2,$3,$4,'2026-10-31T18:00:00+08:00','2026-11-01T00:00:00+08:00','預告',$5)
    ON CONFLICT DO NOTHING`, [FEATURED_ID,halloween.zh.title,halloween.zh.description,halloween.zh.location,JSON.stringify(halloween)]);

  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS amount_due INT NOT NULL DEFAULT 0`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS amount_paid INT NOT NULL DEFAULT 0`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS stripe_session_id TEXT`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS checkout_expires_at TIMESTAMPTZ`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ`);
  await q(`ALTER TABLE event_regs ADD COLUMN IF NOT EXISTS checked_in_by TEXT`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS event_regs_stripe_session_uidx ON event_regs(stripe_session_id) WHERE stripe_session_id IS NOT NULL`);
  // 一次性：ig_assets 首批 4 筆由容器 uploads（rebuild 即蒸發）遷至 MinIO（冪等，可於 2026-09 後清除）
  await q(`UPDATE ig_assets SET url='https://emoji-minio.zeabur.app/ig-media/assets/260708_survey_009.jpg' WHERE url='/uploads/social/social-msx84m3a-3056807d.jpg'`);
  await q(`UPDATE ig_assets SET url='https://emoji-minio.zeabur.app/ig-media/assets/260720_demolition_009.jpg' WHERE url='/uploads/social/social-msx84no8-ae03ef4a.jpg'`);
  await q(`UPDATE ig_assets SET url='https://emoji-minio.zeabur.app/ig-media/assets/260815_plumbing_012.jpg' WHERE url='/uploads/social/social-msx84p7h-1f493f24.jpg'`);
  await q(`UPDATE ig_assets SET url='https://emoji-minio.zeabur.app/ig-media/assets/260806_render_1f_bar_night.png' WHERE url='/uploads/social/social-msx84qrt-b5a05a4e.png'`);
  // 一次性：首批素材已人工織入排程（2026-08-18），標記 used_by 防補產器重複選用（冪等）
  await q(`UPDATE ig_assets SET used_by = CASE
    WHEN url LIKE '%demolition%' THEN 'sp_seed_ig_s01'
    WHEN url LIKE '%survey%' THEN 'sp_seed_ig_w02'
    WHEN url LIKE '%plumbing%' THEN 'sp_seed_ig_w06'
    WHEN url LIKE '%render_1f%' THEN 'sp_seed_ig_w05'
    ELSE used_by END WHERE used_by=''`);
  // 社群貼文雙語欄位（IG 中英、X 中日）
  await q(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS caption_en TEXT NOT NULL DEFAULT ''`);
  await q(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS caption_ja TEXT NOT NULL DEFAULT ''`);
  // Founding rebrand：既有資料的舊編號一次改過（冪等，無舊資料時不影響）
  await q(`UPDATE commitments SET cert_no = replace(replace(cert_no,'TTHB-','TTHM-'),'TTHF-','TTHM-') WHERE cert_no LIKE 'TTHB-%' OR cert_no LIKE 'TTHF-%'`);
  // 創始會員計畫改版：舊版專案參數一次改過（冪等）
  await q(`UPDATE bonds SET target_amount=$1, interest_rate=0, min_term=$2, max_term=$3, status='預售中' WHERE id='b1' AND target_amount=10000000`,
    [TARGET, MIN_TERM, MAX_TERM]);
  // 正式上線：下架示範資料（僅刪固定示範 id，真實資料不受影響；冪等）
  await q(`DELETE FROM users WHERE id IN ('u_demo','u_invite','u2','u3','u4','u5','u6','u7')`);
  await q(`DELETE FROM updates WHERE id IN ('up1','up2','up3')`);
  const { rows } = await q('SELECT COUNT(*)::int AS n FROM bonds');
  if (rows[0].n === 0) await seedBond();
  const paid = (await q(`SELECT ${SEL_C} FROM commitments WHERE payment_status='已付款'`)).rows;
  for (const c of paid) await ensureFoundingEntitlement(c);
  await seedSpaceContent();
  await seedMenuContent();
  await seedSocialPosts();
}

async function seedBond() {
  await q(
    `INSERT INTO bonds (id,project_name,target_amount,interest_rate,min_term,max_term,status,progress)
     VALUES ('b1','Taiwan Talent Hub',$1,0,$2,$3,'預售中',42) ON CONFLICT (id) DO NOTHING`,
    [TARGET, MIN_TERM, MAX_TERM]
  );
}

// 空間介紹（menu 頁四樓文案）：既有內容不覆蓋，僅補缺漏的語系鍵值
async function seedSpaceContent() {
  const content = await readContent();
  const miss = missingSpaceSeedKeys(content);
  for (const key of miss) {
    const value = SPACE_SEED[key];
    if (!value) continue;
    await q(
      `INSERT INTO site_content (key,value,updated_at) VALUES ($1,$2,now())
       ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }
}

// 社群貼文：依固定 id 補缺（不覆蓋後台編輯）；FORCE_SOCIAL_SEED=1 時覆寫內容欄位
async function seedSocialPosts() {
  const force = process.env.FORCE_SOCIAL_SEED === '1' || process.env.FORCE_SOCIAL_SEED === 'true';
  let posts;
  try {
    posts = loadSocialSeedPosts();
  } catch (e) {
    console.warn('[social-seed] 讀取 seed 失敗，略過：', e && e.message);
    return;
  }
  // 墓碑：後台刪除過的種子 id 不再復活（FORCE_SOCIAL_SEED=1 無視墓碑重灌）
  let dead = [];
  if (!force) {
    const row = (await q(`SELECT value FROM site_content WHERE key='social_seed_deleted'`)).rows[0];
    try { dead = JSON.parse((row && row.value) || '[]'); } catch (_) { dead = []; }
    if (!Array.isArray(dead)) dead = [];
  }
  for (const p of posts) {
    if (dead.includes(p.id)) continue;
    const scheduledAt = parseTaipei(p.scheduled_at);   // seed 排程以台北時間解讀（function 宣告有 hoisting，先用後定義無妨）
    if (scheduledAt && isNaN(scheduledAt.getTime())) {
      console.warn('[social-seed] 排程時間格式錯誤，略過：', p.id, p.scheduled_at);
      continue;
    }
    const vals = [
      p.id, p.platform, p.post_type, p.status, p.title, p.caption, p.caption_en || '', p.caption_ja || '', p.hashtags,
      JSON.stringify(p.pages || []), JSON.stringify(p.images || []),
      scheduledAt,
      p.external_url || '', p.series || '', p.phase || '', p.cta || '', p.audience || '', p.notes || '',
    ];
    try {
      if (force) {
        await q(
          `INSERT INTO social_posts (id,platform,post_type,status,title,caption,caption_en,caption_ja,hashtags,pages,images,scheduled_at,external_url,series,phase,cta,audience,notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
           ON CONFLICT (id) DO UPDATE SET platform=EXCLUDED.platform, post_type=EXCLUDED.post_type,
             title=EXCLUDED.title, caption=EXCLUDED.caption, caption_en=EXCLUDED.caption_en, caption_ja=EXCLUDED.caption_ja,
             hashtags=EXCLUDED.hashtags, pages=EXCLUDED.pages,
             scheduled_at=EXCLUDED.scheduled_at, series=EXCLUDED.series, phase=EXCLUDED.phase,
             cta=EXCLUDED.cta, audience=EXCLUDED.audience, notes=EXCLUDED.notes, updated_at=now()`,
          vals
        );
      } else {
        await q(
          `INSERT INTO social_posts (id,platform,post_type,status,title,caption,caption_en,caption_ja,hashtags,pages,images,scheduled_at,external_url,series,phase,cta,audience,notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
           ON CONFLICT (id) DO NOTHING`,
          vals
        );
      }
    } catch (e) {
      // 單筆匯入失敗不擋 migrate（否則整站 API 會因 dbReady=false 全回 503）
      console.warn('[social-seed] 匯入失敗，略過：', p.id, e && e.message);
    }
  }
  if (force) console.warn('[social-seed] FORCE_SOCIAL_SEED=1：已覆寫種子貼文內容。請勿長期開啟此旗標。');
}

// 菜單：缺鍵時灌入 seed（全部 published:true）；FORCE_MENU_SEED=1 時覆寫
async function seedMenuContent() {
  const force = process.env.FORCE_MENU_SEED === '1' || process.env.FORCE_MENU_SEED === 'true';
  const content = await readContent();
  if (!shouldWriteMenuSeed(content, force)) return;
  let rows;
  try {
    rows = loadMenuSeedRows();
  } catch (e) {
    console.warn('[menu-seed] 讀取 seed 失敗，略過：', e && e.message);
    return;
  }
  const doc = buildMenuSeedDoc(rows);
  const v = validateMenuSeedDoc(doc);
  if (!v.ok) {
    console.warn('[menu-seed] 驗證失敗，略過：', v.error);
    return;
  }
  const value = stringifyMenuDoc(doc);
  await q(
    `INSERT INTO site_content (key,value,updated_at) VALUES ($1,$2,now())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [MENU_CONTENT_KEY, value]
  );
  if (force) {
    console.warn('[menu-seed] FORCE_MENU_SEED=1：已覆寫 site_content.menu（全部已發布）。請勿長期開啟此旗標。');
  } else {
    console.log('[menu-seed] 已灌入 site_content.menu（全部已發布）。');
  }
}

/* ---------- token (HMAC) ---------- */
const signToken = (payload, options) => signSession(payload, SECRET, options);
const verifyToken = (token, options) => verifySession(token, SECRET, options);

/* ---------- SELECT 片段（日期格式化成 YYYY/MM/DD） ---------- */
const SEL_USER = `id,name,email,phone,invite_code,id_no,address,bank,status,can_view,is_admin,is_event_organizer,to_char(created_at,'YYYY/MM/DD') AS created_at`;
const SEL_C = `id,user_id,amount::bigint,interest_rate,term_years,
  to_char(start_date,'YYYY/MM/DD') AS start_date,
  to_char(maturity_date,'YYYY/MM/DD') AS maturity_date,
  contract_status,payment_status,membership_status,cert_no`;
const SEL_UPD = `id,title,content,type,to_char(published_at,'YYYY/MM/DD') AS published_at`;
const SEL_EVENT = `e.id,e.slug,e.title,e.description,e.location,e.translations,e.rich_content,e.event_details,e.tickets,e.registration_settings,e.owner_id,(SELECT name FROM users WHERE id=e.owner_id) AS organizer_name,COALESCE((SELECT jsonb_agg(h.name ORDER BY h.name) FROM event_hosts h WHERE h.event_id=e.id AND h.is_visible=true),'[]'::jsonb) AS host_names,e.capacity,e.price_twd,e.visibility,e.status,
  to_char(e.starts_at AT TIME ZONE 'Asia/Taipei','YYYY/MM/DD HH24:MI') AS starts_at,
  to_char(e.starts_at AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD"T"HH24:MI') AS starts_at_iso,
  to_char(e.ends_at AT TIME ZONE 'Asia/Taipei','YYYY/MM/DD HH24:MI') AS ends_at,
  to_char(e.ends_at AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD"T"HH24:MI') AS ends_at_iso`;
const SEL_ENT = `id,user_id,plan,source,source_id,
  purchased_at, activated_at, starts_at, ends_at`;
const numify = rows => rows.map(r => ({ ...r, amount: r.amount != null ? Number(r.amount) : r.amount }));
const FLOOR_PLANS = ['day_4h', 'day_12h', 'month', 'quarter', 'year'];

function rowToEnt(r) {
  if (!r) return null;
  return {
    ...r,
    purchased_at: r.purchased_at ? new Date(r.purchased_at) : null,
    activated_at: r.activated_at ? new Date(r.activated_at) : null,
    starts_at: r.starts_at ? new Date(r.starts_at) : null,
    ends_at: r.ends_at ? new Date(r.ends_at) : null,
  };
}

async function loadEntitlements(userId) {
  return (await q(
    `SELECT ${SEL_ENT} FROM entitlements WHERE user_id=$1 ORDER BY purchased_at`,
    [userId]
  )).rows.map(rowToEnt);
}

async function persistLazyActivations(ents, now = new Date()) {
  const out = [];
  for (const e of ents) {
    const { changed, entitlement } = applyLazyAutoActivate(e, now);
    if (!changed) { out.push(e); continue; }
    const r = await q(
      `UPDATE entitlements SET activated_at=$2, starts_at=$3, ends_at=$4
       WHERE id=$1 AND activated_at IS NULL
       RETURNING ${SEL_ENT}`,
      [e.id, entitlement.activated_at, entitlement.starts_at, entitlement.ends_at]
    );
    out.push(r.rows[0] ? rowToEnt(r.rows[0]) : (await loadEntitlements(e.user_id)).find(x => x.id === e.id) || entitlement);
  }
  return out;
}

async function memberAccessFor(userId, now = new Date()) {
  let ents = await loadEntitlements(userId);
  ents = await persistLazyActivations(ents, now);
  return deriveMemberAccess(ents, now);
}

function accessSummary(access) {
  return [
    ...(access.activeEntitlements || []).map(e => e.plan),
    ...(access.pending || []).map(e => e.plan + '（待啟用）'),
  ].join('、') || '—';
}

async function ensureFoundingEntitlement(commitment) {
  // commitment: { id, user_id, start_date, maturity_date, payment_status, membership_status }
  if (commitment.payment_status !== '已付款') return null;
  const starts = new Date(String(commitment.start_date).replace(/\//g, '-') + 'T00:00:00.000Z');
  const maturityDay = String(commitment.maturity_date).replace(/\//g, '-');
  const maturityStart = new Date(maturityDay + 'T00:00:00.000Z');
  // maturity_date 是會籍末日；ends_at 為末日次日 00:00 UTC，採半開區間 [starts, ends)。
  const endsExclusive = new Date(maturityStart.getTime() + 24 * 3600 * 1000);
  const id = uid('en_');
  const r = await q(
    `INSERT INTO entitlements
      (id,user_id,plan,source,source_id,purchased_at,activated_at,starts_at,ends_at)
     VALUES ($1,$2,'founding','commitment',$3,now(),$4,$4,$5)
     ON CONFLICT (source, source_id) DO UPDATE SET
       starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at,
       activated_at=COALESCE(entitlements.activated_at, EXCLUDED.activated_at)
     RETURNING ${SEL_ENT}`,
    [id, commitment.user_id, commitment.id, starts, endsExclusive]
  );
  return rowToEnt(r.rows[0]);
}

function rowToLot(r) {
  if (!r) return null;
  return {
    ...r,
    original_amount: Number(r.original_amount),
    remaining: Number(r.remaining),
    expires_at: r.expires_at ? new Date(r.expires_at) : null,
    created_at: r.created_at ? new Date(r.created_at) : null,
  };
}

async function expireLotsForUser(userId, now = new Date()) {
  const due = await q(
    `SELECT id, remaining FROM point_lots
     WHERE user_id=$1 AND remaining > 0 AND expires_at IS NOT NULL AND expires_at <= $2`,
    [userId, now]
  );
  for (const row of due.rows) {
    const rem = Number(row.remaining);
    const u = await q(
      `UPDATE point_lots SET remaining=0 WHERE id=$1 AND remaining=$2 RETURNING id`,
      [row.id, rem]
    );
    if (!u.rowCount) continue;
    await q(
      `INSERT INTO point_ledger (id, user_id, lot_id, delta, reason, actor)
       VALUES ($1,$2,$3,$4,'expire','system')`,
      [uid('ldg_'), userId, row.id, -rem]
    );
  }
}

async function loadPointLots(userId, client) {
  await expireLotsForUser(userId);
  const run = client ? (t, p) => client.query(t, p) : q;
  const r = await run(
    `SELECT id, user_id, type, original_amount, remaining, expires_at, source_type, source_id, created_at
     FROM point_lots WHERE user_id=$1 ORDER BY created_at`,
    [userId]
  );
  return r.rows.map(rowToLot);
}

async function creditLot(client, {
  userId, type, amount, expiresAt, sourceType, sourceId, reason, actor, note,
}) {
  const id = uid('pl_');
  const ins = await client.query(
    `INSERT INTO point_lots
       (id, user_id, type, original_amount, remaining, expires_at, source_type, source_id)
     VALUES ($1,$2,$3,$4,$4,$5,$6,$7)
     ON CONFLICT (user_id, type, source_type, source_id) DO NOTHING
     RETURNING *`,
    [id, userId, type, amount, expiresAt, sourceType, sourceId]
  );
  let row = ins.rows[0];
  if (!row) {
    row = (await client.query(
      `SELECT * FROM point_lots WHERE user_id=$1 AND type=$2 AND source_type=$3 AND source_id=$4`,
      [userId, type, sourceType, sourceId]
    )).rows[0];
    return { lot: rowToLot(row), created: false };
  }
  await client.query(
    `INSERT INTO point_ledger (id, user_id, lot_id, delta, reason, ref_type, ref_id, actor, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [uid('ldg_'), userId, row.id, amount, reason, sourceType, sourceId, actor || 'system', note || null]
  );
  return { lot: rowToLot(row), created: true };
}

async function fulfillPointOrder(client, order, now = new Date()) {
  if (order.status === 'paid') return { already: true };
  const upd = await client.query(
    `UPDATE point_orders SET status='paid', paid_at=$2 WHERE id=$1 AND status='pending' RETURNING *`,
    [order.id, now]
  );
  if (!upd.rows[0]) {
    const cur = (await client.query(`SELECT * FROM point_orders WHERE id=$1`, [order.id])).rows[0];
    return { already: cur && cur.status === 'paid' };
  }
  await creditLot(client, {
    userId: order.user_id, type: 'purchase', amount: Number(order.principal),
    expiresAt: null, sourceType: 'point_order', sourceId: order.id,
    reason: 'purchase', actor: 'system',
  });
  if (Number(order.bonus) > 0) {
    await creditLot(client, {
      userId: order.user_id, type: 'bonus', amount: Number(order.bonus),
      expiresAt: addYears(now, 1), sourceType: 'point_order', sourceId: order.id,
      reason: 'bonus', actor: 'system',
    });
  }
  return { already: false };
}

async function grantMembershipGift(client, userId, plan, sourceId, now = new Date()) {
  const amount = MEMBERSHIP_GIFT_POINTS[plan];
  if (amount == null) throw new Error('unknown plan');
  if (amount <= 0) return { skipped: true };
  return creditLot(client, {
    userId, type: 'membership_gift', amount,
    expiresAt: addYears(now, 1),
    sourceType: 'commitment', sourceId,
    reason: 'membership_gift', actor: 'system',
  });
}

async function applyDebit(client, userId, allocations, reason, refType, refId, actor) {
  for (const a of allocations) {
    const u = await client.query(
      `UPDATE point_lots SET remaining = remaining - $2
       WHERE id=$1 AND remaining >= $2
         AND (expires_at IS NULL OR expires_at > now())
       RETURNING id`,
      [a.lot_id, a.amount]
    );
    if (!u.rowCount) {
      const err = new Error('lot_debit_conflict');
      err.status = 409;
      throw err;
    }
    await client.query(
      `INSERT INTO point_ledger (id, user_id, lot_id, delta, reason, ref_type, ref_id, actor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [uid('ldg_'), userId, a.lot_id, -a.amount, reason, refType, refId, actor]
    );
  }
}

async function pointsSummaryFor(userId) {
  const lots = await loadPointLots(userId);
  const now = new Date();
  return {
    balance: availableBalance(lots, now),
    lots: lots.map(l => ({
      id: l.id,
      type: l.type,
      remaining: l.remaining,
      expires_at: l.expires_at,
      source_type: l.source_type,
      source_id: l.source_id,
      available: isLotAvailable(l, now),
    })),
  };
}

/* ---------- 活動付款核銷（webhook 與成功頁共用；冪等） ---------- */
async function activateAdditionalOrder(client,order,reg){
 if(!(await client.query('SELECT 1 FROM event_attendees WHERE registration_id=$1 LIMIT 1',[reg.id])).rowCount){const buyer=(await client.query('SELECT name,email FROM users WHERE id=$1',[reg.user_id])).rows[0];for(let i=0;i<reg.quantity;i++)await client.query('INSERT INTO event_attendees(id,registration_id,name,email,ordinal) VALUES($1,$2,$3,$4,$5)',[uid('att_'),reg.id,buyer.name,buyer.email,i]);}

 for(const [i,a] of order.attendees.entries())await client.query('INSERT INTO event_attendees(id,registration_id,name,email,ordinal,order_id) VALUES($1,$2,$3,$4,$5,$6)',[uid('att_'),reg.id,a.name,a.email,reg.quantity+i,order.id]);
 await client.query("UPDATE event_ticket_orders SET status='registered',amount_paid=amount_due,paid_at=CASE WHEN amount_due>0 THEN now() ELSE NULL END WHERE id=$1",[order.id]);
 await client.query('UPDATE event_regs SET quantity=quantity+$2,checked_in_at=NULL WHERE id=$1',[reg.id,order.quantity]);
 await client.query("INSERT INTO event_activity(event_id,registration_id,actor_id,action) VALUES($1,$2,$3,'additional_registered')",[reg.event_id,reg.id,reg.user_id]);
}
async function fulfillAdditionalCheckout(session){
 const meta=session?.metadata;if(meta?.kind!=='event-additional-tickets'||session.payment_status!=='paid')return {ignored:true};
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT id FROM events WHERE id=$1 FOR UPDATE',[meta.event_id]);
 const reg=(await client.query('SELECT * FROM event_regs WHERE id=$1 FOR UPDATE',[meta.registration_id])).rows[0];
 const order=(await client.query('SELECT * FROM event_ticket_orders WHERE id=$1 FOR UPDATE',[meta.order_id])).rows[0];
 if(!reg||!order||reg.user_id!==meta.user_id||reg.event_id!==meta.event_id||order.registration_id!==reg.id||order.ticket_version!==reg.ticket_version||order.stripe_session_id!==session.id)return {ignored:true};
 if(order.status==='registered'){await client.query('COMMIT');return {already:true};}
 if(order.status!=='pending_payment'||reg.status!=='registered')return {ignored:true};
 if(session.currency!=='twd'||session.amount_total!==order.amount_due*100)throw new Error('加購付款金額與訂單不符');
 await client.query('UPDATE event_ticket_orders SET stripe_payment_intent_id=$2 WHERE id=$1',[order.id,typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id]);
 await activateAdditionalOrder(client,order,reg);await client.query('COMMIT');return {paid:true};
 }finally{await client.query('ROLLBACK');client.release();}
}

async function fulfillEventCheckout(session) {
  const meta = session && session.metadata;
  if(!meta||meta.kind!=='event-registration')return {ignored:true};
  const authorization=meta.capture_required==='true'&&session.payment_status!=='paid';
  if(!authorization&&session.payment_status!=='paid')return {ignored:true};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reg = (await client.query(`SELECT * FROM event_regs WHERE id=$1 FOR UPDATE`, [meta.registration_id])).rows[0];
    if (!reg || reg.event_id !== meta.event_id || reg.user_id !== meta.user_id || reg.stripe_session_id !== session.id) {
      await client.query('ROLLBACK');
      return { ignored: true };
    }
    if (reg.status === 'registered') {
      await client.query('COMMIT');
      return { already: true, registrationId: reg.id };
    }
    if (reg.status !== 'pending_payment') {
      await client.query('ROLLBACK');
      return { ignored: true };
    }
    if (session.currency !== 'twd' || !Number.isSafeInteger(session.amount_total) || session.amount_total !== Number(reg.amount_due) * 100)
      throw new Error('活動付款金額或幣別與報名快照不符');
    if(authorization){
      const intent=await stripe.paymentIntents.retrieve(typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id,{expand:['latest_charge']});
      if(intent.status!=='requires_capture'||intent.amount!==reg.amount_due*100||intent.currency!=='twd'){await client.query('ROLLBACK');return {ignored:true};}
      const deadline=intent.latest_charge?.payment_method_details?.card?.capture_before;
      const expires=new Date(Math.min(deadline?deadline*1000:Infinity,Date.now()+24*3600000));
      await client.query("UPDATE event_regs SET status='pending_approval',stripe_payment_intent_id=$2,authorization_expires_at=$3,checkout_expires_at=NULL WHERE id=$1",[reg.id,intent.id,expires]);
      await client.query('COMMIT');return {authorized:true,registrationId:reg.id};
    }
    const paidTwd = session.amount_total / 100;
    const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    await client.query(
      `UPDATE event_regs SET status='registered',amount_paid=$2,stripe_payment_intent_id=$3,paid_at=now()
       WHERE id=$1`,
      [reg.id, paidTwd, paymentIntent || null]
    );
    await client.query('COMMIT');
    notifyRegistration(reg.user_id, reg.event_id);
    return { already: false, registrationId: reg.id };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function expireEventCheckout(session) {
  const meta = session && session.metadata;
  if (!meta || meta.kind !== 'event-registration') return;
  await q(
    `UPDATE event_regs SET status='expired'
     WHERE id=$1 AND stripe_session_id=$2 AND status='pending_payment'`,
    [meta.registration_id, session.id]
  );
}

async function fulfillPointsCheckout(session) {
  if (session?.metadata?.kind !== 'point_pack' || session.payment_status !== 'paid') return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = (await client.query(`SELECT * FROM point_orders WHERE id=$1 FOR UPDATE`, [session.metadata.point_order_id])).rows[0];
    if (!matchesPointCheckout(session, order)) throw new Error('購點付款與訂單快照不符');
    await fulfillPointOrder(client, order);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

/* ---------- 一般會籍線上購買：Stripe 結帳完成後開通 ---------- */
async function fulfillPlanCheckout(session) {
  const meta = session && session.metadata;
  if (!meta || meta.kind !== 'plan' || session.payment_status !== 'paid') return { ignored: true };
  if (!FLOOR_PLANS.includes(meta.plan) || !meta.user_id) return { ignored: true };
  if (session.currency !== 'twd' || session.amount_total !== PLAN_PRICE_TWD[meta.plan] * 100) throw new Error('會籍付款金額與方案不符');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = uid('en_');
    const inserted = (await client.query(
      `INSERT INTO entitlements (id,user_id,plan,source,source_id,purchased_at)
       VALUES ($1,$2,$3,'stripe',$4,now()) ON CONFLICT (source,source_id) DO NOTHING RETURNING id`,
      [id, meta.user_id, meta.plan, session.id])).rows[0];
    if (!inserted) { await client.query('COMMIT'); return { already: true }; }
    await grantMembershipGift(client, meta.user_id, meta.plan, id);
    await client.query('COMMIT');
    notifyPlanPurchased(meta.user_id, meta.plan);
    return { already: false, entitlementId: id };
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

/* ---------- 交易通知信（失敗只記 log） ---------- */
const PLAN_LABEL = { day_4h: '單日 4 小時', day_12h: '單日 12 小時', month: '月會員', quarter: '季會員', year: '年會員', founding: '創始會員' };
const fmtTaipei = d => d ? new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(d)) : '';
const fmtTaipeiDate = d => d ? new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d)) : '';
const appKind = a => a.kind === 'business' ? '企業包場' : '社群活動';
const appVenue = a => a.venue === '2F' ? '二樓交誼廳' : '三樓共享空間';
async function userContact(userId) {
  return (await q(`SELECT name,email FROM users WHERE id=$1`, [userId])).rows[0] || null;
}
function notifyApplicationCreated(a) {
  const text = `${a.contact_name} 您好，\n\n我們已收到您的${appKind(a)}申請「${a.title}」。\n場地：${appVenue(a)}\n時段：${fmtTaipei(a.starts_at)} – ${fmtTaipei(a.ends_at)}（台灣時間）\n申請編號：${a.id}\n\n送出申請不代表場地已保留；檔期、費用與使用條件將另行書面確認。審核結果會以 Email 通知，也可登入 ${SITE_BASE}/event-application 查看。\n\nWe have received your venue application. This does not reserve the venue; dates, fees and terms will be confirmed in writing.\n\n言文字｜台灣人才聚落\nus@emoji.tw · +886 921 102 067`;
  sendMailQuietly({ to: a.contact_email, subject: `[言文字] ${appKind(a)}申請已收到 · ${a.title}`, text, replyTo: NOTIFY_EMAIL });
  sendMailQuietly({ to: NOTIFY_EMAIL, subject: `[後台] 新${appKind(a)}申請：${a.title}（${appVenue(a)}）`,
    text: `${appKind(a)}｜${appVenue(a)}\n單位：${a.community_name}\n聯絡：${a.contact_name} ${a.contact_email} ${a.contact_phone || ''}\n時段：${fmtTaipei(a.starts_at)} – ${fmtTaipei(a.ends_at)}\n人數：${a.attendees}\n\n${a.description}\n\n需求：${a.requirements || '—'}\n\n審核：${SITE_BASE}/admin/applications`, replyTo: a.contact_email });
}
function notifyApplicationReviewed(a) {
  const result = a.status === 'approved' ? '初步通過（場地尚未保留）' : '未通過';
  const text = `${a.contact_name} 您好，\n\n您的${appKind(a)}申請「${a.title}」審核結果：${result}\n\n回覆：\n${a.review_note}\n\n${a.status === 'approved' ? '初步通過不代表場地已保留，我們會再與您確認檔期、費用與使用條件並完成書面確認。' : '如有疑問可直接回覆此信。'}\n\n言文字｜台灣人才聚落\nus@emoji.tw · +886 921 102 067`;
  sendMailQuietly({ to: a.contact_email, subject: `[言文字] ${appKind(a)}申請審核結果：${result} · ${a.title}`, text, replyTo: NOTIFY_EMAIL });
}
async function expireEventAuthorizations(){
 const expired=(await q("SELECT id FROM event_regs WHERE capture_required=true AND status='pending_approval' AND authorization_expires_at<=now() AND stripe_payment_intent_id IS NOT NULL LIMIT 50")).rows;
 for(const row of expired){const client=await pool.connect();try{await client.query('BEGIN');const reg=(await client.query("SELECT * FROM event_regs WHERE id=$1 AND status='pending_approval' FOR UPDATE",[row.id])).rows[0];
  if(reg){let intent=await stripe.paymentIntents.retrieve(reg.stripe_payment_intent_id);if(intent.status==='requires_capture')intent=await stripe.paymentIntents.cancel(intent.id);
   if(intent.status==='canceled')await client.query("UPDATE event_regs SET status='expired' WHERE id=$1",[reg.id]);
  }await client.query('COMMIT');
 }finally{await client.query('ROLLBACK');client.release();}}
}
async function notifyRegistration(userId,eventId){
 try{
 const row=(await q(`SELECT r.id AS booking_id,r.ticket_version,r.language,r.confirmation_queued,u.email,u.name,e.* FROM event_regs r JOIN users u ON u.id=r.user_id JOIN events e ON e.id=r.event_id WHERE r.user_id=$1 AND r.event_id=$2 AND r.status='registered' AND e.status<>'已取消'`,[userId,eventId])).rows[0];
 if(!row||row.confirmation_queued)return;
 const reg={id:row.booking_id,ticket_version:row.ticket_version};
 const lang=['en','ja'].includes(row.language)?row.language:'zh',event=localizeEvent({...row,registered:true},lang),url=SITE_BASE+(lang==='zh'?'':'/'+lang)+'/events/'+encodeURIComponent(event.slug);
 const text={zh:['報名成功','請登入活動頁查看個人票券與活動資訊。'],en:['Registration confirmed','Sign in to the event page for your tickets and event details.'],ja:['申込完了','イベントページにログインしてチケットと詳細をご確認ください。']}[lang];
 const attachments=event.starts_at?[{filename:'event.ics',content:Buffer.from(eventCalendar(event,SITE_BASE)).toString('base64')}]:[];
 await require('./lib/event-mailer').queueEventMail(q,{id:'confirmation_'+reg.id+'_'+reg.ticket_version,eventId,registrationId:reg.id,ticketVersion:reg.ticket_version,email:row.email,subject:text[0]+' · '+event.title,body:(row.name||'')+'\n\n'+event.title+'\n'+text[1]+'\n'+url,attachments});
 await q('UPDATE event_regs SET confirmation_queued=true WHERE id=$1 AND ticket_version=$2',[reg.id,reg.ticket_version]);
 }catch(e){console.error('[event-confirmation]',e.message);}
}
async function notifyPlanPurchased(userId, plan) {
  try {
    const u = await userContact(userId); if (!u || !u.email) return;
    const gift = MEMBERSHIP_GIFT_POINTS[plan] || 0;
    const text = `${u.name || ''} 您好，\n\n您已購買「${PLAN_LABEL[plan] || plan}」（NT$${PLAN_PRICE_TWD[plan].toLocaleString('en-US')}）。${gift ? `已贈送 ${gift.toLocaleString('en-US')} 點（一年效期）。` : ''}\n\n會籍會在您第一次以會員專區的進出 QR 進場時啟用；若 7 天內未進場，將自第 7 天起自動起算。\n會員專區：${SITE_BASE}/member\n\n言文字｜台灣人才聚落`;
    await sendMailQuietly({ to: u.email, subject: `[言文字] 會籍已購買：${PLAN_LABEL[plan] || plan}`, text, replyTo: NOTIFY_EMAIL });
  } catch (e) { console.error('[mail] 會籍通知失敗：', e.message); }
}
/* 會籍到期前 7 天提醒（每日一次；只寄月／季／年會籍，各寄一次） */
async function remindExpiringMemberships() {
  if (!pool || !dbReady) return;
  const rows = (await q(
    `SELECT e.id,e.plan,e.ends_at,u.email,u.name FROM entitlements e JOIN users u ON u.id=e.user_id
     WHERE e.plan IN ('month','quarter','year') AND e.reminded_at IS NULL
       AND e.ends_at IS NOT NULL AND e.ends_at > now() AND e.ends_at <= now() + interval '7 days'`)).rows;
  for (const r of rows) {
    if (!r.email) continue;
    const text = `${r.name || ''} 您好，\n\n您的「${PLAN_LABEL[r.plan]}」會籍將於 ${fmtTaipeiDate(r.ends_at)} 到期。\n要續約或升級，可到會員專區線上購買，或到現場辦理：${SITE_BASE}/member\n\n言文字｜台灣人才聚落`;
    await sendMailQuietly({ to: r.email, subject: `[言文字] 會籍將於 ${fmtTaipeiDate(r.ends_at)} 到期`, text, replyTo: NOTIFY_EMAIL });
    await q(`UPDATE entitlements SET reminded_at=now() WHERE id=$1`, [r.id]);
  }
  if (rows.length) console.log(`[remind] 會籍到期提醒 ${rows.length} 封`);
}

/* ---------- app ---------- */
const app = express();
app.disable('x-powered-by');
// 僅信任指定代理；預設信任一層部署 ingress，不採信攻擊者自填的 X-Forwarded-For 最左值。
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self' https://checkout.stripe.com",
  });
  if (SITE_BASE.startsWith('https://')) res.set('Strict-Transport-Security', 'max-age=31536000');
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) res.set('Cache-Control', 'no-store');
  next();
});
app.use('/auth', rateLimit({ max: 30 }));
app.use('/api', (req, res, next) => req.path === '/stripe/webhook' ? next() : apiLimit(req, res, next));
const apiLimit = rateLimit({ max: 240 });
app.use('/api/checkout', rateLimit({ max: 20 }));
// Stripe 簽章必須驗證原始 body；此路由需在 express.json() 之前。
app.post('/api/email/webhook',express.raw({type:'application/json',limit:'256kb'}),async(req,res)=>{
 if(!process.env.RESEND_WEBHOOK_SECRET)return res.status(503).send('webhook not configured');
 if(!pool||!dbReady)return res.status(503).send('database not ready');
 let event;try{event=require('./lib/mail').verifyMailWebhook(req.body,req.headers,process.env.RESEND_WEBHOOK_SECRET);}catch{return res.status(400).send('invalid webhook');}
 if(!['email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.opened','email.clicked'].includes(event.type))return res.json({received:true});
 const providerId=event.data?.email_id,at=new Date(event.created_at);
 if(typeof providerId!=='string'||providerId.length>200||!Number.isFinite(+at))return res.status(400).send('invalid event');
 try{await q('INSERT INTO event_delivery_events(id,provider_id,event_type,occurred_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[req.headers['svix-id'],providerId,event.type,at]);res.json({received:true});}
 catch(e){console.error('[email-webhook]',e.message);res.status(503).send('retry later');}
});
app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(503).send('webhook not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (!pool || !dbReady) return res.status(503).send('database not ready');
      await fulfillEventCheckout(event.data.object);
      await fulfillAdditionalCheckout(event.data.object);
      await fulfillPointsCheckout(event.data.object);
      await fulfillPlanCheckout(event.data.object);
    } else if (['refund.created','refund.updated','refund.failed'].includes(event.type)) {
      if(!pool||!dbReady)return res.status(503).send('database not ready');
      // Read the current provider state: webhook events may arrive out of order.
      const refund=await stripe.refunds.retrieve(event.data.object.id),intent=typeof refund.payment_intent==='string'?refund.payment_intent:refund.payment_intent?.id;
      const client=await pool.connect();try{await client.query('BEGIN');
       const reg=(await client.query('SELECT * FROM event_regs WHERE stripe_payment_intent_id=$1 FOR UPDATE',[intent])).rows[0];
       if(reg&&refund.currency==='twd')await saveEventRefund(client,reg,refund);
       else{
        const parent=(await client.query('SELECT r.id FROM event_regs r JOIN event_ticket_orders o ON o.registration_id=r.id WHERE o.stripe_payment_intent_id=$1 FOR UPDATE OF r',[intent])).rows[0];
        const order=parent&&(await client.query('SELECT * FROM event_ticket_orders WHERE stripe_payment_intent_id=$1 FOR UPDATE',[intent])).rows[0];
        if(order&&refund.currency==='twd')await saveAdditionalRefund(client,order,refund);
        else await client.query('UPDATE event_refunds SET status=$2 WHERE id=$1 AND payment_intent=$3',[refund.id,refund.status,intent]);
       }
       await client.query('COMMIT');
      }finally{await client.query('ROLLBACK');client.release();}
    } else if(['payment_intent.succeeded','payment_intent.canceled','payment_intent.payment_failed'].includes(event.type)){
      if(!pool||!dbReady)return res.status(503).send('database not ready');
      const intent=await stripe.paymentIntents.retrieve(event.data.object.id),client=await pool.connect();
      try{await client.query('BEGIN');const reg=(await client.query('SELECT * FROM event_regs WHERE stripe_payment_intent_id=$1 AND capture_required=true FOR UPDATE',[intent.id])).rows[0];
       if(reg&&['capture_pending','pending_approval'].includes(reg.status)){
        if(intent.status==='succeeded'&&intent.currency==='twd'&&intent.amount_received===reg.amount_due*100)await client.query("UPDATE event_regs SET amount_paid=amount_due,paid_at=now(),status=CASE WHEN status='capture_pending' THEN 'registered' ELSE status END WHERE id=$1",[reg.id]);
        else if(['canceled','requires_payment_method'].includes(intent.status))await client.query("UPDATE event_regs SET status='expired' WHERE id=$1",[reg.id]);
       }await client.query('COMMIT');if(reg)notifyRegistration(reg.user_id,reg.event_id);
      }finally{await client.query('ROLLBACK');client.release();}
    } else if (event.type === 'checkout.session.expired') {
      if (!pool || !dbReady) return res.status(503).send('database not ready');
      await expireEventCheckout(event.data.object);
      if(event.data.object.metadata?.kind==='event-additional-tickets')await q("UPDATE event_ticket_orders SET status='expired' WHERE id=$1 AND stripe_session_id=$2 AND status='pending_payment'",[event.data.object.metadata.order_id,event.data.object.id]);
    }
    res.json({ received: true });
  } catch (e) {
    console.error('[stripe webhook]', e.message);
    res.status(400).send('invalid webhook');
  }
});
app.use(express.json({ limit: '256kb' }));

// 後台操作紀錄：/api/admin 的寫入（成功者）記 actor／路徑／摘要；GET 不記。
app.use('/api/admin', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'OPTIONS') return next();
  res.on('finish', () => {
    if (!pool || !dbReady || !req.auth || res.statusCode >= 400) return;
    const actor = req.auth.agent ? 'admin-api-key' : (req.auth.email || req.auth.sub || 'unknown');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const summary = Object.entries(body)
      .filter(([k]) => !/token|secret|password|key/i.test(k))
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 60) : JSON.stringify(v)?.slice(0, 60)}`)
      .join(' ').slice(0, 500);
    q(`INSERT INTO admin_logs (id,actor,method,path,summary,status) VALUES ($1,$2,$3,$4,$5,$6)`,
      [uid('log_'), actor, req.method, '/api/admin' + req.path, summary, res.statusCode])
      .catch(e => console.error('[admin-log]', e.message));
  });
  next();
});

// CORS：官網（www.emoji.tw）會員專區以 Bearer token 跨網域打 /api；只放行白名單來源
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && WEB_ORIGINS.includes(o)) {
    res.set('Access-Control-Allow-Origin', o);
    res.vary('Origin');
    res.set('Access-Control-Allow-Headers', 'authorization, content-type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 503 if DB not ready（讓前端照常運作，但 API 明確回報）
function requireDb(req, res, next) {
  if (!pool) return res.status(503).json({ error: '尚未設定資料庫連線（DATABASE_URL）。' });
  if (!dbReady) return res.status(503).json({ error: '資料庫尚未就緒，請稍候再試。' });
  next();
}
async function sessionAuth(t) {
  const p = verifyToken(t);
  if (!p || !pool || !dbReady) return p;
  const user = (await q(`SELECT id,email,is_admin,is_event_organizer FROM users WHERE id=$1`, [p.sub])).rows[0];
  if (!user) return null;
  const isSuper = String(user.email || '').toLowerCase() === SUPER_ADMIN_EMAIL;
  const host = !isSuper && !user.is_admin && !user.is_event_organizer
    ? (await q(`SELECT EXISTS(SELECT 1 FROM event_hosts WHERE email=lower($1) AND can_manage=true) AS allowed`,[user.email])).rows[0]?.allowed : false;
  return { ...p, email: user.email, super: isSuper, can_create_events:isSuper || user.is_admin === true || user.is_event_organizer === true,
    role: isSuper || user.is_admin === true ? 'admin' : (user.is_event_organizer === true || host) ? 'organizer' : ['admin','organizer'].includes(p.role) ? 'invited' : p.role };
}
async function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  // AI agent：金鑰即超管身分，sub 為 null（不綁任何會員，故 /api/me/* 一律拒絕）
  if (isAdminApiKey(t, ADMIN_API_KEY)) {
    req.auth = { role: 'admin', super: true, sub: null, agent: true };
    return next();
  }
  try {
    const p = await sessionAuth(t);
    if (!p) return res.status(401).json({ error: '請先登入。' });
    if (!pool || !dbReady) return requireDb(req, res, next);
    req.auth = p; next();
  } catch (e) { next(e); }
}
async function optionalAuth(req, _res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  try { req.auth = await sessionAuth(t); next(); } catch (e) { next(e); }
}
function doorAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!ACCESS_DOOR_SECRET || !safeEqual(t, ACCESS_DOOR_SECRET))
    return res.status(401).json({ error: '門禁憑證無效。' });
  next();
}
function adminOnly(req, res, next) {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: '需要後台權限。' });
  next();
}
async function eventEditor(req, res, next) {
  if (req.auth.role === 'admin') return next();
  if (req.auth.role !== 'organizer' || !req.auth.sub) return res.status(403).json({error:'需要活動主權限，請聯絡言文字授權。'});
  const id = req.params.id || req.body?.id;
  if (!id) return next();
  try {
    const row = (await q(`SELECT owner_id,EXISTS(SELECT 1 FROM event_hosts h WHERE h.event_id=events.id AND h.email=lower($2) AND h.can_manage=true) AS shared FROM events WHERE id=$1`,[id,req.auth.email])).rows[0];
    if(!row || row.owner_id !== req.auth.sub && !row.shared) return res.status(404).json({error:'找不到可管理的活動。'});
    next();
  } catch(error) { next(error); }
}

async function eventCheckinAccess(req,res,next){
 if(req.auth.role==='admin'){req.eventCheckin={can_manage:true,ticket_ids:[]};return next();}
 try{
  const row=(await q(`SELECT e.owner_id,h.can_manage,h.can_checkin,h.checkin_ticket_ids FROM events e LEFT JOIN event_hosts h ON h.event_id=e.id AND h.email=lower($2) WHERE e.id=$1`,[req.params.id,req.auth.email])).rows[0];
  if(!row||row.owner_id!==req.auth.sub&&!row.can_manage&&!row.can_checkin)return res.status(404).json({error:'找不到可簽到的活動。'});
  const canManage=row.owner_id===req.auth.sub||row.can_manage===true;
  req.eventCheckin={can_manage:canManage,ticket_ids:canManage?[]:(Array.isArray(row.checkin_ticket_ids)?row.checkin_ticket_ids.filter(id=>typeof id==='string'):[])};
  next();
 }catch(e){next(e);}
}

function superOnly(req, res, next) {
  if (req.auth.super !== true) return res.status(403).json({ error: '需要超級管理員權限。' });
  next();
}
const wrap = fn => (req, res) => fn(req, res).catch(e => {
  const paymentUnavailable = e && (e.code === 'api_key_expired' ||
    ['StripeAuthenticationError', 'StripePermissionError', 'StripeConnectionError', 'StripeRateLimitError', 'StripeAPIError'].includes(e.type));
  console.error('[api error]', paymentUnavailable
    ? [e.type, e.code, e.requestId].filter(Boolean).join(' ')
    : e.message);
  res.status(paymentUnavailable ? 503 : 500).json(paymentUnavailable
    ? { error: '付款服務暫時無法使用，請稍後再試。', code: 'PAYMENT_UNAVAILABLE' }
    : { error: '伺服器處理失敗。' });
});

app.get('/api/health', (req, res) =>
  res.json({ ok: true, db: dbReady, dbConfigured: !!pool }));

async function accountByEmail(client,email,name,fillName=false){
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[email]);
  const accounts=(await client.query('SELECT id, name FROM users WHERE lower(email)=$1 LIMIT 2',[email])).rows;
  if(accounts.length>1){const error=new Error('此信箱存在重複帳號，請聯絡管理員確認身分。');error.code='AMBIGUOUS_EMAIL';throw error;}
  let user=accounts[0];
  if(!user){user={id:uid('u_'),name};await client.query("INSERT INTO users(id,name,email,status) VALUES($1,$2,$3,'已查看')",[user.id,name,email]);}
  else if(fillName&&!user.name){await client.query("UPDATE users SET name=$2 WHERE id=$1 AND (name IS NULL OR name='')",[user.id,name]);user.name=name;}
  return user;
}

app.post('/api/auth/email/start',rateLimit({max:10}),requireDb,wrap(async(req,res)=>{
 if(!process.env.RESEND_API_KEY)return res.status(503).json({error:'Email 登入尚未開通，請使用 Google 登入。'});
 const email=String(req.body?.email||'').trim().toLowerCase(),name=String(req.body?.name||'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!name||name.length>120)return res.status(400).json({error:'請填寫姓名與有效 Email。'});
 const redirect=safeRedirect(req.body?.redirect)||DEFAULT_MEMBER_URL,code=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(code).digest('hex');
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[email]);
 const recent=(await client.query("SELECT COUNT(*)::int AS n,MAX(created_at) AS latest FROM email_login_tokens WHERE email=$1 AND created_at>now()-interval '1 hour'",[email])).rows[0];
 if(recent.n>=6||recent.latest&&Date.now()-+new Date(recent.latest)<60000)return res.status(429).json({error:'寄送過於頻繁，請稍後再試。'});
 await client.query("INSERT INTO email_login_tokens(token_hash,email,name,redirect,expires_at) VALUES($1,$2,$3,$4,now()+interval '20 minutes')",[hash,email,name,redirect]);await client.query('COMMIT');
 }finally{await client.query('ROLLBACK');client.release();}
 const lang=['en','ja'].includes(req.body?.lang)?req.body.lang:'zh',url=SITE_BASE+'/event-login.html?lang='+lang+'#code='+code;
 const copy={zh:['言文字登入連結','請開啟以下連結並按「確認登入」。連結 20 分鐘內有效，僅可使用一次。若不是您提出的請求，請忽略此信。'],en:['Sign in to emoji','Open the link and select Confirm sign-in. It expires in 20 minutes and can be used once. Ignore this email if you did not request it.'],ja:['言文字へのログイン','リンクを開き「ログインを確認」を押してください。有効期限は20分、1回限り使用できます。心当たりがなければ無視してください。']}[lang];
 await sendMail({to:email,subject:copy[0],text:copy[1]+'\n\n'+url,idempotencyKey:'email-login/'+hash});res.json({ok:true});
}));
app.get('/api/auth/session',auth,requireDb,(req,res)=>req.auth.sub?res.json({authenticated:true,user_id:req.auth.sub}):res.status(403).json({error:'請以會員身分登入。'}));

app.post('/api/auth/email/verify',rateLimit({max:20}),requireDb,wrap(async(req,res)=>{
 const code=req.body?.code;if(typeof code!=='string'||!/^[a-f0-9]{64}$/.test(code))return res.status(400).json({error:'登入連結無效或已過期。'});
 const hash=crypto.createHash('sha256').update(code).digest('hex'),client=await pool.connect();
 try{await client.query('BEGIN');const login=(await client.query('SELECT * FROM email_login_tokens WHERE token_hash=$1 FOR UPDATE',[hash])).rows[0];
 if(!login||login.used_at||+new Date(login.expires_at)<=Date.now())return res.status(400).json({error:'登入連結無效或已過期。'});
 const user=await accountByEmail(client,login.email,login.name,true);await client.query('UPDATE email_login_tokens SET used_at=now() WHERE token_hash=$1',[hash]);await client.query('COMMIT');
 res.set('Cache-Control','no-store');res.json({token:signToken({role:'invited',sub:user.id,name:user.name}),redirect:safeRedirect(login.redirect)||DEFAULT_MEMBER_URL});
 }catch(e){if(e.code==='AMBIGUOUS_EMAIL')return res.status(409).json({error:e.message});throw e;}finally{await client.query('ROLLBACK');client.release();}
}));

/* ---- Google 登入（OAuth 2.0 授權碼流程；重用既有 signToken 與 users 表） ---- */
app.get('/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).send('Google 登入尚未開通（未設定 GOOGLE_CLIENT_ID）。');
  const redirect = safeRedirect(req.query.redirect) || DEFAULT_MEMBER_URL;
  // state：HMAC 簽章保護導回目標並帶 nonce（CSRF 防護），callback 端驗章與時效
  const state = signToken({ r: redirect, n: crypto.randomBytes(24).toString('hex') }, { purpose: 'oauth' });
  res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: SITE_BASE.startsWith('https://'),
    path: '/auth/google', maxAge: 10 * 60 * 1000 });
  const p = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account',
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + p);
});

app.get('/auth/google/callback', wrap(async (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).send('Google 登入尚未開通。');
  const state = String(req.query.state || '');
  const st = verifyToken(state, { purpose: 'oauth' });
  const cookieState = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('oauth_state='))?.slice(12);
  res.clearCookie('oauth_state', { path: '/auth/google', httpOnly: true, sameSite: 'lax', secure: SITE_BASE.startsWith('https://') });
  if (!st || !st.r || !safeEqual(state, cookieState))
    return res.status(400).send('登入連結已失效，請重新登入。');
  const redirect = safeRedirect(st.r) || DEFAULT_MEMBER_URL;
  if (!req.query.code) return res.status(400).send('登入未完成。');
  // 以授權碼換 access_token（後端持 client_secret）
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    signal: AbortSignal.timeout(10000),
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(req.query.code), client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  }).then(r => r.json()).catch(() => ({}));
  if (!tok.access_token) return res.status(400).send('Google 驗證失敗，請重試。');
  const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    signal: AbortSignal.timeout(10000),
    headers: { authorization: 'Bearer ' + tok.access_token },
  }).then(r => r.json()).catch(() => ({}));
  if (typeof info.email !== 'string' || info.email_verified !== true)
    return res.status(400).send('無法取得已驗證的 Google Email。');
  if (!pool || !dbReady) return res.status(503).send('資料庫尚未就緒，請稍後再試。');
  // upsert：以已驗證 email 為鍵（Google 保證 email_verified 時為本人所有）
  const email = String(info.email).toLowerCase();
  const accountClient=await pool.connect();let u;
  try{await accountClient.query('BEGIN');u=await accountByEmail(accountClient,email,info.name||info.email,true);await accountClient.query('COMMIT');}
  catch(e){await accountClient.query('ROLLBACK');if(e.code==='AMBIGUOUS_EMAIL')return res.status(409).send(e.message);throw e;}
  finally{accountClient.release();}
  // 管理權限：超管以 email 認定；其餘管理員讀 users.is_admin（由超管指派）
  const isSuper = email === SUPER_ADMIN_EMAIL;
  const isAdmin = isSuper || (await q(`SELECT is_admin FROM users WHERE id=$1`, [u.id])).rows[0]?.is_admin === true;
  const n = (await q(`SELECT COUNT(*)::int AS n FROM commitments WHERE user_id=$1`, [u.id])).rows[0].n;
  const role = isAdmin ? 'admin' : (n > 0 ? 'participant' : 'invited');
  const token = signToken({ role, sub: u.id, super: isSuper, name: u.name || info.name || '' });
  // token 以 URL fragment 帶回官網（不進伺服器存取記錄）；官網讀取後即從網址移除
  const sep = redirect.includes('#') ? '&' : '#';
  res.redirect(redirect + sep + 'token=' + encodeURIComponent(token));
}));

// 網站內容（首頁公告等）：讀成 { key: value } 物件
async function readContent() {
  const rows = (await q(`SELECT key, value FROM site_content WHERE key = ANY($1::text[])`, [PUBLIC_CONTENT_KEYS])).rows;
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

app.get('/api/state', auth, requireDb, wrap(async (req, res) => {
  const raised = Number((await q(`SELECT COALESCE(SUM(amount),0)::bigint AS s FROM commitments WHERE payment_status='已付款'`)).rows[0].s);
  const bond = { target_amount: TARGET, raised };
  const updates = numify((await q(`SELECT ${SEL_UPD} FROM updates ORDER BY published_at DESC`)).rows);

  if (req.auth.role === 'admin') {
    const users = (await q(`SELECT ${SEL_USER} FROM users ORDER BY created_at`)).rows.map(pubUser);
    const commitments = numify((await q(`SELECT ${SEL_C} FROM commitments ORDER BY created_at`)).rows);
    const now = new Date();
    const entitlements = await persistLazyActivations((await q(`SELECT ${SEL_ENT} FROM entitlements`)).rows.map(rowToEnt), now);
    const byUser = new Map();
    for (const entitlement of entitlements) {
      if (!byUser.has(entitlement.user_id)) byUser.set(entitlement.user_id, []);
      byUser.get(entitlement.user_id).push(entitlement);
    }
    const balances = new Map((await q(`SELECT user_id,SUM(remaining)::bigint AS balance FROM point_lots
      WHERE remaining>0 AND (expires_at IS NULL OR expires_at>now()) GROUP BY user_id`)).rows
      .map(r => [r.user_id, Number(r.balance)]));
    for (const u of users) {
      const access = deriveMemberAccess(byUser.get(u.id) || [], now);
      u.access_active = access.active;
      u.access_summary = accessSummary(access);
      u.points_balance = balances.get(u.id) || 0;
    }
    // 活動 + 每場報名人數（後台總覽用）
    const events = (await q(
      `SELECT ${SEL_EVENT},
         (SELECT COALESCE(SUM(r.quantity),0)::int FROM event_regs r WHERE r.event_id=e.id AND r.status='registered') AS reg_count,
         (SELECT COALESCE(SUM(CASE WHEN r.quantity>1 THEN (SELECT COUNT(*) FROM event_attendees a WHERE a.registration_id=r.id AND a.checked_in_at IS NOT NULL) ELSE (r.checked_in_at IS NOT NULL)::int END),0)::int FROM event_regs r WHERE r.event_id=e.id AND r.status='registered') AS checkin_count
       FROM events e ORDER BY starts_at DESC NULLS LAST, created_at DESC`)).rows;
    const content = await readContent();
    const me = users.find(u => u.id === req.auth.sub) || null;  // 管理員自己：供會員頁顯示姓名
    const self = {};
    if (me) {
      self.access = deriveMemberAccess(byUser.get(me.id) || [], now);
      self.points = await pointsSummaryFor(me.id);
      self.point_orders = (await q(`SELECT id,pack_id,principal,bonus,pay_twd,status,paid_at,created_at
        FROM point_orders WHERE user_id=$1 ORDER BY created_at DESC`, [me.id])).rows;
      self.point_refunds = (await q(`SELECT id,point_order_id,principal_points,refund_twd,status,stripe_refund_id
        FROM point_refunds WHERE user_id=$1 AND status='pending' ORDER BY created_at`, [me.id])).rows;
    }
    return res.json({ role: 'admin', super: req.auth.super === true, me, bond, users, commitments, entitlements, events, content, updates, ...self });
  }
  const me = pubUser((await q(`SELECT ${SEL_USER} FROM users WHERE id=$1`, [req.auth.sub])).rows[0]);
  if (!me) return res.status(401).json({ error: '帳號不存在，請重新登入。' });
  const commitments = numify((await q(`SELECT ${SEL_C} FROM commitments WHERE user_id=$1 ORDER BY created_at`, [me.id])).rows);
  const access = await memberAccessFor(me.id);
  const points = await pointsSummaryFor(me.id);
  const pointOrders = (await q(
    `SELECT id, pack_id, principal, bonus, pay_twd, status, paid_at, created_at
     FROM point_orders WHERE user_id=$1 ORDER BY created_at DESC`, [me.id]
  )).rows;
  const pointRefunds = (await q(`SELECT id,point_order_id,principal_points,refund_twd,status,stripe_refund_id
    FROM point_refunds WHERE user_id=$1 AND status='pending' ORDER BY created_at`, [me.id])).rows;
  // 會員專區：報名中的活動 + 我是否已報名（供報名/取消按鈕）
  const events = (await q(
    `SELECT ${SEL_EVENT},
       (SELECT COALESCE(SUM(r.quantity),0)::int FROM event_regs r WHERE r.event_id=e.id AND r.status='registered') AS reg_count,
       mine.id AS registration_id, mine.status AS registration_status,
       mine.checked_in_at, mine.amount_paid,
       (mine.status='registered') AS registered
     FROM events e
     LEFT JOIN event_regs mine ON mine.event_id=e.id AND mine.user_id=$1
     WHERE e.status='報名中' AND (e.visibility='public' OR mine.id IS NOT NULL)
     ORDER BY e.starts_at ASC NULLS LAST`, [me.id])).rows;
  res.json({
    role: commitments.length ? 'participant' : 'invited',
    me, bond, users: [me], commitments, events:events.map(e=>localizeEvent(e,'zh')), updates,
    access: {
      active: access.active,
      entitlements: access.entitlements,
      pending: access.pending,
      activeEntitlements: access.activeEntitlements,
    },
    points,
    point_orders: pointOrders,
    point_refunds: pointRefunds,
  });
}));

app.get('/api/me/access-qr', auth, requireDb, wrap(async (req, res) => {
  if (!ACCESS_QR_SECRET) return res.status(503).json({ error: '進出 QR 尚未開通（未設定 ACCESS_QR_SECRET）。' });
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  const now = new Date();
  let ents = await persistLazyActivations(await loadEntitlements(req.auth.sub), now);
  const pick = pickEntitlementForQr(ents, now);
  if (!pick) return res.status(403).json({ error: '目前無法進出二三樓（無有效或待啟用權益）。', code: 'NO_ENTITLEMENT' });
  const pending = !pick.activated_at;
  const token = signAccessToken({
    sub: req.auth.sub,
    ent: pick.id,
    plan: pick.plan,
    floors: ['2', '3'],
    pending_activation: pending,
  }, ACCESS_QR_SECRET, { ttlSec: 45 });
  const payload = verifyAccessToken(token, ACCESS_QR_SECRET);
  res.json({
    token,
    exp: payload.exp,
    pending_activation: pending,
    plan: pick.plan,
    entitlement_id: pick.id,
  });
}));

app.post('/api/access/verify', wrap(async (req, res) => {
  if (!ACCESS_QR_SECRET) return res.status(503).json({ error: '未設定 ACCESS_QR_SECRET。' });
  const token = String((req.body && req.body.token) || '');
  const p = verifyAccessToken(token, ACCESS_QR_SECRET);
  if (!p) return res.status(401).json({ ok: false, error: '無效或過期的 QR。' });
  res.json({ ok: true, claims: p });
}));

app.post('/api/access/scan', doorAuth, requireDb, wrap(async (req, res) => {
  if (!ACCESS_QR_SECRET) return res.status(503).json({ error: '未設定 ACCESS_QR_SECRET。' });
  const token = String((req.body && req.body.token) || '');
  const p = verifyAccessToken(token, ACCESS_QR_SECRET);
  if (!p) return res.status(401).json({ ok: false, error: '無效或過期的 QR。' });

  const ent = rowToEnt((await q(`SELECT ${SEL_ENT} FROM entitlements WHERE id=$1`, [p.ent])).rows[0]);
  if (!ent || ent.user_id !== p.sub)
    return res.status(400).json({ ok: false, error: '權益不符。' });

  const now = new Date();
  if (p.plan !== ent.plan || !pickEntitlementForQr([ent], now))
    return res.status(403).json({ ok: false, error: '權益已失效，無法開門。' });
  // 冪等：同一 token_iat + entitlement 只記一次
  const scanId = uid('as_');
  const ins = await q(
    `INSERT INTO access_scans (id,entitlement_id,user_id,token_iat,scanned_at)
     VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (entitlement_id, token_iat) DO NOTHING
     RETURNING id`,
    [scanId, ent.id, ent.user_id, p.iat]
  );

  let activated = false;
  if (!ent.activated_at && ent.plan !== 'founding') {
    const ends = endsAtAfterActivation(ent.plan, now);
    const upd = await q(
      `UPDATE entitlements SET activated_at=$2, starts_at=$2, ends_at=$3
       WHERE id=$1 AND activated_at IS NULL
       RETURNING ${SEL_ENT}`,
      [ent.id, now, ends]
    );
    activated = !!upd.rows[0];
  }

  res.json({
    ok: true,
    door: 'open',
    activated,
    duplicate: !ins.rows[0],
    access: await memberAccessFor(ent.user_id, now),
  });
}));

// 公開唯讀：進度、專案更新、報名中活動、首頁公告（無 PII，供未登入者瀏覽）
app.get('/api/public', requireDb, wrap(async (req, res) => {
  const raised = Number((await q(`SELECT COALESCE(SUM(amount),0)::bigint AS s FROM commitments WHERE payment_status='已付款'`)).rows[0].s);
  const updates = numify((await q(`SELECT ${SEL_UPD} FROM updates ORDER BY published_at DESC`)).rows);
  const events = (await q(
    `SELECT ${SEL_EVENT},
       (SELECT COALESCE(SUM(r.quantity),0)::int FROM event_regs r WHERE r.event_id=e.id AND r.status='registered') AS reg_count
     FROM events e WHERE status IN ('預告','報名中') AND visibility='public' ORDER BY starts_at ASC NULLS LAST`)).rows;
  const content = await readContent();
  res.json({ raised, updates, events, content });
}));

app.post('/api/commitments', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '後台無法以參與者身分送出。' });
  const b = req.body || {};
  const amount = Number(b.amount || 0);
  const term = Number(b.term || 0);
  if (amount !== PRICE) return res.status(400).json({ error: '創始會費為固定 NT$35,000。' });
  if (!(term >= MIN_TERM && term <= MAX_TERM)) return res.status(400).json({ error: '會籍期間為固定 18 個月。' });
  if (!b.name || !b.email || !b.phone)
    return res.status(400).json({ error: '請填寫姓名、電話與 Email。' });
  if (typeof b.name !== 'string' || typeof b.email !== 'string' || typeof b.phone !== 'string' ||
      b.name.length > 200 || b.phone.length > 80 || b.email.length > 320)
    return res.status(400).json({ error: '姓名、電話與 Email 格式不正確。' });
  if (b.email.trim().toLowerCase() !== String(req.auth.email || '').toLowerCase())
    return res.status(400).json({ error: '請使用目前 Google 登入帳號的 Email，登入信箱不能由表單變更。' });

  // 名額上限：限量 100 名、售罄不補
  const agg = (await q(`SELECT COALESCE(SUM(amount),0)::bigint AS s, COUNT(DISTINCT user_id)::int AS p FROM commitments`)).rows[0];
  const isExisting = (await q(`SELECT 1 FROM commitments WHERE user_id=$1 LIMIT 1`, [req.auth.sub])).rowCount > 0;
  if (!isExisting && agg.p >= MAX_PARTICIPANTS)
    return res.status(400).json({ error: '創始名額已滿（限量 100 名，售罄不補），請與發起方聯繫。' });
  if (Number(agg.s) + amount > TARGET)
    return res.status(400).json({ error: '創始名額已售罄，請與發起方聯繫。' });

  await q(`UPDATE users SET name=$2,phone=$3,status='已參與' WHERE id=$1`,
    [req.auth.sub, b.name.trim(), b.phone.trim()]);

  const seq = (await q(`SELECT COUNT(*)::int AS n FROM commitments`)).rows[0].n + 1;
  const id = uid('c_');
  // 會籍起訖：以正式開幕日起算 18 個月；開幕延後時改 MEMBERSHIP_START 環境變數即可
  const start = MEMBERSHIP_START;
  const maturity = addMonthsISO(start, term);
  await q(
    `INSERT INTO commitments
       (id,user_id,amount,interest_rate,term_years,start_date,maturity_date,contract_status,payment_status,membership_status,cert_no,created_at)
     VALUES ($1,$2,$3,0,$4,$5,$6,'已簽','未付款',$7,$8,now())`,
    [id, req.auth.sub, amount, term, start, maturity, b.agree_member ? '待啟用' : '未啟用', certNo(seq)]);

  const row = numify((await q(`SELECT ${SEL_C} FROM commitments WHERE id=$1`, [id])).rows)[0];
  res.json({ commitment: row });
}));

app.get('/api/organizer/state', auth, requireDb, eventEditor, wrap(async (req,res) => {
  const me = (await q(`SELECT id,name,email FROM users WHERE id=$1`,[req.auth.sub])).rows[0] || null;
  const events = (await q(`SELECT ${SEL_EVENT},
    (SELECT COALESCE(SUM(r.quantity),0)::int FROM event_regs r WHERE r.event_id=e.id AND r.status='registered') AS reg_count,
    (SELECT COALESCE(SUM(CASE WHEN r.quantity>1 THEN (SELECT COUNT(*) FROM event_attendees a WHERE a.registration_id=r.id AND a.checked_in_at IS NOT NULL) ELSE (r.checked_in_at IS NOT NULL)::int END),0)::int FROM event_regs r WHERE r.event_id=e.id AND r.status='registered') AS checkin_count
    FROM events e WHERE e.owner_id=$1 OR EXISTS(SELECT 1 FROM event_hosts h WHERE h.event_id=e.id AND h.email=lower($2) AND h.can_manage=true) ORDER BY e.created_at DESC`,[req.auth.sub,req.auth.email])).rows;
  res.json({role:req.auth.role,organizer:true,can_create_events:req.auth.can_create_events,me,events,users:[],commitments:[],updates:[],content:{}});
}));
app.post('/api/admin/users/:id/organizer', auth, adminOnly, requireDb, wrap(async (req,res) => {
  if(typeof req.body.organizer !== 'boolean') return res.status(400).json({error:'請指定活動主權限。'});
  const result = await q(`UPDATE users SET is_event_organizer=$2 WHERE id=$1 RETURNING id,is_event_organizer`,[req.params.id,req.body.organizer]);
  if(!result.rows[0]) return res.status(404).json({error:'找不到使用者。'});
  res.json({ok:true,...result.rows[0]});
}));

/* ---- 超管：指派／取消其他管理員（以 user id；對象需已於系統有帳號，通常先以 Google 登入過） ---- */
app.post('/api/admin/users/:id/admin', auth, adminOnly, superOnly, requireDb, wrap(async (req, res) => {
  const makeAdmin = req.body.admin === true;
  const r = await q(`UPDATE users SET is_admin=$2 WHERE id=$1 RETURNING id,email`, [req.params.id, makeAdmin]);
  if (!r.rows[0]) return res.status(404).json({ error: '找不到使用者。' });
  res.json({ ok: true, id: r.rows[0].id, is_admin: makeAdmin });
}));

app.post('/api/admin/commitments/:id/confirm', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE commitments SET payment_status='已付款', membership_status='已啟用' WHERE id=$1 RETURNING user_id`,
      [req.params.id]
    );
    if (!r.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '找不到參與紀錄。' });
    }
    await client.query(`UPDATE users SET status='已參與' WHERE id=$1`, [r.rows[0].user_id]);
    const c = (await client.query(`SELECT ${SEL_C} FROM commitments WHERE id=$1`, [req.params.id])).rows[0];
    // ensureFoundingEntitlement 用全域 q；此處先 commit 後再呼叫會失去交易——改為交易外既有函式 + gift 同連線
    await client.query('COMMIT');
    await ensureFoundingEntitlement(c);
    const gClient = await pool.connect();
    try {
      await gClient.query('BEGIN');
      await grantMembershipGift(gClient, c.user_id, 'founding', c.id);
      await gClient.query('COMMIT');
    } catch (e) {
      await gClient.query('ROLLBACK');
      throw e;
    } finally {
      gClient.release();
    }
    res.json({ ok: true });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}));

app.post('/api/admin/entitlements', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const userId = (req.body.user_id || '').trim();
  const plan = req.body.plan;
  if (!userId || !FLOOR_PLANS.includes(plan))
    return res.status(400).json({ error: '需要 user_id 與合法 plan（day_4h／day_12h／month／quarter／year）。' });
  const u = (await q(`SELECT id FROM users WHERE id=$1`, [userId])).rows[0];
  if (!u) return res.status(404).json({ error: '找不到使用者。' });
  const id = uid('en_');
  const sourceId = req.body.source_id || id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO entitlements (id,user_id,plan,source,source_id,purchased_at)
       VALUES ($1,$2,$3,'admin',$4,now())`,
      [id, userId, plan, sourceId]
    );
    await grantMembershipGift(client, userId, plan, id);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  const row = rowToEnt((await q(`SELECT ${SEL_ENT} FROM entitlements WHERE id=$1`, [id])).rows[0]);
  res.json({ entitlement: row });
}));

/* ---- 點數：方案／餘額／購點／兌換／退款／後台發點 ---- */
app.get('/api/points/packs', (req, res) => {
  res.json({ price_twd: POINT_PRICE_TWD, packs: Object.values(PACKS) });
});

app.get('/api/me/points', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  res.json(await pointsSummaryFor(req.auth.sub));
}));

app.post('/api/admin/points/grants', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const userId = (req.body.user_id || '').trim();
  const amount = Number(req.body.amount);
  const note = (req.body.note || '').trim();
  if (!userId || !Number.isInteger(amount) || amount < 1) {
    return res.status(400).json({ error: 'user_id 與正整數 amount 必填。' });
  }
  if (!note) return res.status(400).json({ error: '備註必填。' });
  const u = (await q(`SELECT id FROM users WHERE id=$1`, [userId])).rows[0];
  if (!u) return res.status(404).json({ error: '找不到使用者。' });
  const now = new Date();
  let expiresAt = addYears(now, 1);
  if (req.body.expires_at) {
    const d = new Date(req.body.expires_at);
    if (Number.isNaN(+d)) return res.status(400).json({ error: 'expires_at 無效。' });
    expiresAt = d;
  }
  const grantId = uid('pg_');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { lot } = await creditLot(client, {
      userId, type: 'admin', amount, expiresAt,
      sourceType: 'admin_grant', sourceId: grantId,
      reason: 'admin', actor: req.auth.sub || 'agent', note,   // agent 無會員 id，軌跡仍留名
    });
    await client.query('COMMIT');
    res.json({ lot, grant_id: grantId, note });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.get('/api/admin/users/:id/points', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const summary = await pointsSummaryFor(req.params.id);
  const ledger = (await q(
    `SELECT id, lot_id, delta, reason, ref_type, ref_id, actor, note, created_at
     FROM point_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
    [req.params.id]
  )).rows;
  const orders = (await q(
    `SELECT * FROM point_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [req.params.id]
  )).rows;
  res.json({ ...summary, ledger, orders });
}));

app.post('/api/me/points/redeem', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  const access = await memberAccessFor(req.auth.sub);
  if (!access.active) {
    return res.status(403).json({ error: '需要 active 會員才能兌換二樓服務。', code: 'not_active' });
  }
  const service = (req.body.service || '').trim();
  let hours = req.body.hours;
  if (service === 'shower' || service === 'laundry') hours = 1;
  else {
    hours = Number(hours);
    if (!Number.isInteger(hours) || hours < 1) return res.status(400).json({ error: 'hours 須為正整數。' });
  }
  let points;
  try { points = redeemPointsFor(service, hours); }
  catch { return res.status(400).json({ error: '不支援的服務。' }); }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await expireLotsForUser(req.auth.sub);
    const lots = (await client.query(
      `SELECT * FROM point_lots WHERE user_id=$1 FOR UPDATE`, [req.auth.sub]
    )).rows.map(rowToLot);
    const plan = planDebit(lots, points, new Date());
    if (!plan.ok) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '點數不足。', code: plan.error });
    }
    const rid = uid('pr_');
    await client.query(
      `INSERT INTO point_redemptions (id, user_id, service, points, hours, status)
       VALUES ($1,$2,$3,$4,$5,'paid')`,
      [rid, req.auth.sub, service, points, (service === 'shower' || service === 'laundry') ? null : hours]
    );
    await applyDebit(client, req.auth.sub, plan.allocations, 'redeem', 'point_redemption', rid, req.auth.sub);
    await client.query('COMMIT');
    res.json({
      redemption: { id: rid, service, points, hours: (service === 'shower' || service === 'laundry') ? null : hours, status: 'paid' },
      balance: (await pointsSummaryFor(req.auth.sub)).balance,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.status === 409) return res.status(409).json({ error: '扣點衝突，請重試。' });
    throw e;
  } finally {
    client.release();
  }
}));

app.post('/api/me/points/orders', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  if (!stripe) return res.status(503).json({ error: '購買功能尚未開通（未設定 Stripe）。' });
  const pack = PACKS[(req.body.pack_id || '').trim()];
  if (!pack) return res.status(400).json({ error: '未知方案。' });

  const id = uid('po_');
  await q(
    `INSERT INTO point_orders (id, user_id, pack_id, principal, bonus, pay_twd, status)
     VALUES ($1,$2,$3,$4,$5,$6,'pending')`,
    [id, req.auth.sub, pack.id, pack.principal, pack.bonus, pack.pay_twd]
  );

  const origin = SITE_BASE;
  const lang = String((req.body && req.body.lang) || 'zh').toLowerCase();
  const memberBase = lang === 'en' ? '/en/member' : lang === 'ja' ? '/ja/member' : '/member';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'], // 帳戶未對 TWD 啟用預設付款方式時 Stripe 會拒建 session，明示 card 即可
    line_items: [{
      price_data: {
        currency: 'twd',
        product_data: {
          name: `言文字點數方案 ${pack.id}`,
          description: `本金 ${pack.principal} 點` + (pack.bonus ? `＋加贈 ${pack.bonus} 點（一年效期）` : '') + '・每點 NT$1',
        },
        unit_amount: pack.pay_twd * 100,
      },
      quantity: 1,
    }],
    success_url: `${origin}${memberBase}?points_paid=1&oid=${id}&s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${memberBase}?points_canceled=1`,
    client_reference_id: id,
    metadata: { kind: 'point_pack', point_order_id: id, user_id: req.auth.sub, pack_id: pack.id },
  });
  await q(`UPDATE point_orders SET stripe_session_id=$2 WHERE id=$1`, [id, session.id]);
  res.json({ order_id: id, url: session.url });
}));

app.post('/api/me/points/orders/:id/fulfill', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  if (!stripe) return res.status(503).json({ error: 'Stripe 未設定。' });
  const order = (await q(`SELECT * FROM point_orders WHERE id=$1`, [req.params.id])).rows[0];
  if (!order || order.user_id !== req.auth.sub) return res.status(404).json({ error: '找不到訂單。' });
  if (order.status === 'paid') {
    return res.json({ ok: true, already: true, balance: (await pointsSummaryFor(req.auth.sub)).balance });
  }

  const sessionId = String(req.body.session_id || order.stripe_session_id || '');
  if (!sessionId || sessionId !== order.stripe_session_id)
    return res.status(400).json({ error: 'session 與訂單不符。' });
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== 'paid') return res.status(402).json({ error: '尚未付款。' });
  if (!matchesPointCheckout(session, order)) {
    return res.status(400).json({ error: 'session 與訂單不符。' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = (await client.query(`SELECT * FROM point_orders WHERE id=$1 FOR UPDATE`, [order.id])).rows[0];
    if (!matchesPointCheckout(session, locked)) throw new Error('付款快照已變更');
    await fulfillPointOrder(client, locked);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.json({ ok: true, balance: (await pointsSummaryFor(req.auth.sub)).balance });
}));

app.post('/api/admin/points/orders/:id/fulfill', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const order = (await q(`SELECT * FROM point_orders WHERE id=$1`, [req.params.id])).rows[0];
  if (!order) return res.status(404).json({ error: '找不到訂單。' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = (await client.query(`SELECT * FROM point_orders WHERE id=$1 FOR UPDATE`, [order.id])).rows[0];
    const out = await fulfillPointOrder(client, locked);
    await client.query('COMMIT');
    res.json({ ok: true, already: !!out.already, balance: (await pointsSummaryFor(order.user_id)).balance });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.post('/api/me/points/refunds', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  const orderId = (req.body.point_order_id || '').trim();
  const principalPoints = Number(req.body.principal_points);
  if (!orderId || !Number.isInteger(principalPoints) || principalPoints < 1) {
    return res.status(400).json({ error: 'point_order_id 與 principal_points 必填。' });
  }
  const order = (await q(`SELECT * FROM point_orders WHERE id=$1`, [orderId])).rows[0];
  if (!order || order.user_id !== req.auth.sub) return res.status(404).json({ error: '找不到訂單。' });
  if (order.status !== 'paid') return res.status(400).json({ error: '訂單未付款。' });
  if (!stripe || !order.stripe_session_id)
    return res.status(503).json({ error: '此訂單需由管理員辦理退款，目前未執行退款或扣點。' });
  const paidSession = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
  const paymentIntentId = typeof paidSession.payment_intent === 'string' ? paidSession.payment_intent : paidSession.payment_intent?.id;
  if (!matchesPointCheckout(paidSession, order) || !paymentIntentId)
    return res.status(409).json({ error: '訂單付款資料不符，尚未扣點，請聯絡管理員。' });

  const client = await pool.connect();
  let refundRow;
  try {
    await client.query('BEGIN');
    await client.query(`SELECT id FROM point_orders WHERE id=$1 FOR UPDATE`, [orderId]);
    refundRow = (await client.query(`SELECT * FROM point_refunds WHERE point_order_id=$1 AND status='pending' ORDER BY created_at LIMIT 1`, [orderId])).rows[0];
    if (!refundRow) {
      await expireLotsForUser(req.auth.sub);
      const lots = (await client.query(
        `SELECT * FROM point_lots WHERE user_id=$1 FOR UPDATE`, [req.auth.sub]
      )).rows.map(rowToLot);
      const plan = planRefund(lots, orderId, principalPoints);
      if (!plan.ok) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '無法退款。', code: plan.error });
      }
      const rid = uid('prf_');
      const bonusVoided = plan.void_bonus.reduce((s, x) => s + x.amount, 0);
      await applyDebit(client, req.auth.sub, plan.debit_principal, 'refund', 'point_refund', rid, req.auth.sub);
      for (const v of plan.void_bonus) {
        const u = await client.query(
          `UPDATE point_lots SET remaining = 0 WHERE id=$1 AND remaining=$2 RETURNING id`,
          [v.lot_id, v.amount]
        );
        if (!u.rowCount) continue;
        await client.query(
          `INSERT INTO point_ledger (id, user_id, lot_id, delta, reason, ref_type, ref_id, actor)
           VALUES ($1,$2,$3,$4,'void_bonus','point_refund',$5,$6)`,
          [uid('ldg_'), req.auth.sub, v.lot_id, -v.amount, rid, req.auth.sub]
        );
      }

      await client.query(
        `INSERT INTO point_refunds
           (id, point_order_id, user_id, principal_points, refund_twd, bonus_voided, status, stripe_refund_id)
         VALUES ($1,$2,$3,$4,$5,$6,'pending',NULL)`,
        [rid, orderId, req.auth.sub, principalPoints, plan.refund_twd, bonusVoided]
      );
      refundRow = {
        id: rid,
        principal_points: principalPoints,
        refund_twd: plan.refund_twd,
        bonus_voided: bonusVoided,
        stripe_refund_id: null, status: 'pending',
      };
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.status === 409) return res.status(409).json({ error: '退款衝突，請重試。' });
    throw e;
  } finally {
    client.release();
  }
  // 扣點與 pending intent 已持久化，外部成功後 DB 失敗也可用同一 intent 重試。
  try {
    let rf;
    for await (const existing of stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 })) {
      if (existing.metadata?.point_refund_id === refundRow.id) { rf = existing; break; }
    }
    if (!rf) rf = await stripe.refunds.create({ payment_intent: paymentIntentId, amount: Number(refundRow.refund_twd) * 100,
      metadata: { point_refund_id: refundRow.id } }, { idempotencyKey: `points-refund-${refundRow.id}` });
    if (rf.status === 'failed' || rf.status === 'canceled') {
      const restore = await pool.connect();
      try {
        await restore.query('BEGIN');
        const pending = (await restore.query(`SELECT id FROM point_refunds WHERE id=$1 AND status='pending' FOR UPDATE`, [refundRow.id])).rows[0];
        if (pending) {
          const debits = (await restore.query(`SELECT lot_id,delta FROM point_ledger WHERE ref_type='point_refund' AND ref_id=$1 AND delta<0`, [refundRow.id])).rows;
          for (const debit of debits) {
            await restore.query(`UPDATE point_lots SET remaining=remaining-$2 WHERE id=$1`, [debit.lot_id, debit.delta]);
            await restore.query(`INSERT INTO point_ledger (id,user_id,lot_id,delta,reason,ref_type,ref_id,actor)
              VALUES ($1,$2,$3,$4,'refund_failed','point_refund',$5,'system')`,
              [uid('ldg_'), req.auth.sub, debit.lot_id, -Number(debit.delta), refundRow.id]);
          }
          await restore.query(`UPDATE point_refunds SET status='failed',stripe_refund_id=$2 WHERE id=$1`, [refundRow.id, rf.id]);
        }
        await restore.query('COMMIT');
      } catch (e) { await restore.query('ROLLBACK'); throw e; }
      finally { restore.release(); }
      return res.status(409).json({ error: '退款未成功，已恢復原點數與贈點，請聯絡管理員。', refund_id: refundRow.id });
    }
    if (rf.status !== 'succeeded') throw new Error('Stripe 退款尚未完成');
    await q(`UPDATE point_refunds SET status='completed',stripe_refund_id=$2 WHERE id=$1`, [refundRow.id, rf.id]);
    refundRow = { ...refundRow, status: 'completed', stripe_refund_id: rf.id };
  } catch (e) {
    console.error('[point refund pending]', e.message);
    return res.status(502).json({ error: '退款仍在處理中；點數已保留，再次送出將重試同一筆退款。', refund_id: refundRow.id });
  }
  res.json({ refund: refundRow, balance: (await pointsSummaryFor(req.auth.sub)).balance });
}));

// 帶 id＝改寫既有消息，否則新增（同 events／social posts 的 upsert 慣例）
app.post('/api/admin/updates', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: '請輸入標題。' });
  const types = ['月報', '季報', '重大事項', '活動通知', '財務摘要'];
  const type = types.includes(req.body.type) ? req.body.type : '重大事項';
  const content = (req.body.content || '').trim();
  const date = req.body.date || todayISO();
  if (req.body.id) {
    const r = await q(`UPDATE updates SET title=$2,content=$3,type=$4,published_at=$5 WHERE id=$1 RETURNING id`,
      [req.body.id, title, content, type, date]);
    if (!r.rows[0]) return res.status(404).json({ error: '找不到最新消息。' });
    return res.json({ ok: true, id: req.body.id });
  }
  const id = uid('up_');
  await q(`INSERT INTO updates (id,title,content,type,published_at) VALUES ($1,$2,$3,$4,$5)`,
    [id, title, content, type, date]);
  res.json({ ok: true, id });
}));

app.delete('/api/admin/updates/:id', auth, adminOnly, requireDb, wrap(async (req, res) => {
  await q(`DELETE FROM updates WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

/* ---- 社群場地申請：個案審核，不建立場地預訂或公開活動 ---- */
const APPLICATION_FIELDS = `id,user_id,kind,venue,community_name,contact_name,contact_email,contact_phone,
  title,description,starts_at,ends_at,attendees,requirements,status,review_note,created_at,reviewed_at`;

app.post('/api/event-applications', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請使用個人帳號登入後申請。' });
  const requestId = req.body?.request_id;
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))
    return res.status(400).json({ error: '申請識別碼不正確，請重新載入頁面。' });
  const parsed = normalizeEventApplication(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const v = parsed.value;
  if(v.status==='已取消')return res.status(400).json({error:'請使用取消活動功能，以關閉待付款結帳。'});
  const hash = crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 同一帳號的申請序列化，讓重試與頻率限制在多個服務程序間一致。
    const user = (await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.auth.sub])).rows[0];
    if (!user) { await client.query('ROLLBACK'); return res.status(401).json({ error: '登入已失效，請重新登入。' }); }
    const old = (await client.query(
      `SELECT ${APPLICATION_FIELDS},request_hash FROM event_applications WHERE user_id=$1 AND request_id=$2`,
      [req.auth.sub, requestId])).rows[0];
    if (old) {
      await client.query('COMMIT');
      if (old.request_hash !== hash) return res.status(409).json({ error: '這筆申請已送出，請重新整理查看原申請。' });
      delete old.request_hash;
      return res.json({ ok: true, application: old });
    }
    if (new Date(v.starts_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '請選擇未來的時間。' });
    }
    const recent = (await client.query(
      `SELECT COUNT(*)::int AS n FROM event_applications WHERE user_id=$1 AND created_at>now()-interval '1 hour'`,
      [req.auth.sub])).rows[0].n;
    if (recent >= 10) {
      await client.query('ROLLBACK');
      return res.status(429).json({ error: '申請送出過於頻繁，請稍後再試。' });
    }
    const application = (await client.query(
      `INSERT INTO event_applications
       (id,user_id,request_id,request_hash,community_name,contact_name,contact_email,contact_phone,
        title,description,starts_at,ends_at,attendees,requirements,kind,venue)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING ${APPLICATION_FIELDS}`,
      [uid('ea_'),req.auth.sub,requestId,hash,v.community_name,v.contact_name,v.contact_email,v.contact_phone,
        v.title,v.description,v.starts_at,v.ends_at,v.attendees,v.requirements,v.kind,v.venue])).rows[0];
    await client.query('COMMIT');
    notifyApplicationCreated(application);
    res.status(201).json({ ok: true, application });
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}));

app.get('/api/me/event-applications', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請使用個人帳號登入。' });
  res.set('Cache-Control', 'no-store');
  const applications = (await q(
    `SELECT ${APPLICATION_FIELDS} FROM event_applications WHERE user_id=$1 ORDER BY created_at DESC`,
    [req.auth.sub])).rows;
  res.json({ applications });
}));

app.get('/api/admin/event-applications', auth, adminOnly, requireDb, wrap(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const applications = (await q(`SELECT ${APPLICATION_FIELDS} FROM event_applications ORDER BY created_at DESC`)).rows;
  res.json({ applications });
}));

app.post('/api/admin/event-applications/:id/review', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const b = req.body || {};
  if (!['approved','rejected'].includes(b.status) || b.expected_status !== 'pending')
    return res.status(400).json({ error: '請選擇通過或未通過，且只可審核待審申請。' });
  if (typeof b.review_note !== 'string' || b.review_note.includes('\0') || !b.review_note.trim() || b.review_note.trim().length > 2000)
    return res.status(400).json({ error: '請填寫給申請人的審核回覆（2000 字以內）。' });
  const application = (await q(
    `UPDATE event_applications SET status=$2,review_note=$3,reviewed_at=now(),reviewed_by=$4
     WHERE id=$1 AND status='pending' RETURNING ${APPLICATION_FIELDS}`,
    [req.params.id,b.status,b.review_note.trim(),req.auth.agent ? 'admin-api-key' : req.auth.sub])).rows[0];
  if (!application) {
    const exists = (await q('SELECT id FROM event_applications WHERE id=$1', [req.params.id])).rows.length;
    return res.status(exists ? 409 : 404).json({ error: exists ? '此申請已完成審核，請重新載入。' : '找不到這筆申請。' });
  }
  notifyApplicationReviewed(application);
  res.json({ ok: true, application });
}));

/* ---- 活動管理：建/改/刪、名單、退款與簽到 ---- */
async function reconcileExpiredEventCheckouts(){
 // Release inventory only after Stripe confirms expiry; delayed paid webhooks must not cause overselling.
 const rows=(await q("SELECT stripe_session_id FROM event_regs WHERE status='pending_payment' AND checkout_expires_at<=now() AND stripe_session_id IS NOT NULL UNION ALL SELECT stripe_session_id FROM event_ticket_orders WHERE status='pending_payment' AND expires_at<=now() AND stripe_session_id IS NOT NULL LIMIT 100")).rows;
 for(const row of rows){try{const session=await stripe.checkout.sessions.retrieve(row.stripe_session_id);if(session.payment_status==='paid'||session.status==='complete'){await fulfillEventCheckout(session);await fulfillAdditionalCheckout(session);}else if(session.status==='expired'){await q("UPDATE event_regs SET status='expired' WHERE stripe_session_id=$1 AND status='pending_payment'",[session.id]);await q("UPDATE event_ticket_orders SET status='expired' WHERE stripe_session_id=$1 AND status='pending_payment'",[session.id]);}}catch(e){console.error('[event-checkout-reconcile]',e.message);}}
}

async function reservedEventSeats(client,eventId,ticketId=null,excludeUser=null){
 const result=await client.query(`WITH active AS (
 SELECT * FROM event_regs WHERE event_id=$1 AND ($3::text IS NULL OR user_id<>$3) AND
 (status IN ('registered','capture_pending','pending_payment','refund_pending') OR (status='approved' AND checkout_expires_at>now()))),
 extras AS (SELECT o.* FROM event_ticket_orders o JOIN active r ON r.id=o.registration_id AND r.ticket_version=o.ticket_version
 WHERE o.status IN ('registered','refund_pending') OR o.status='pending_payment')
 SELECT (COALESCE((SELECT SUM(CASE WHEN $2::text IS NULL THEN r.quantity WHEN r.ticket_snapshot->>'id'=$2 THEN r.quantity-COALESCE((SELECT SUM(o.quantity) FROM extras o WHERE o.registration_id=r.id AND o.status IN ('registered','refund_pending')),0) ELSE 0 END) FROM active r),0)+
 COALESCE((SELECT SUM(quantity) FROM extras WHERE ($2::text IS NULL AND status='pending_payment') OR ($2::text IS NOT NULL AND ticket_snapshot->>'id'=$2)),0))::int AS n`,[eventId,ticketId,excludeUser]);return result.rows[0].n;
}

async function changeRegistrationTicket(client,event,reg,ticket){
 if(event.status==='已取消')return {error:'活動已取消，不能變更票種。'};
 if(['cancelled','refunded','expired'].includes(reg.status))return {error:'此報名已失效，不能變更票種。'};
 if(['pending_payment','capture_pending','refund_pending','approved'].includes(reg.status))return {error:'票款仍在處理中，請完成付款、退款或審核後再變更票種。'};
 if(reg.checked_in_at||(await client.query('SELECT 1 FROM event_attendees WHERE registration_id=$1 AND checked_in_at IS NOT NULL LIMIT 1',[reg.id])).rowCount)return {error:'請先撤銷簽到，再變更票種。'};
 if(reg.ticket_snapshot?.id===ticket.id)return {changed:false};
 const baseCount=(await client.query('SELECT COUNT(*)::int AS n FROM event_attendees WHERE registration_id=$1 AND order_id IS NULL',[reg.id])).rows[0].n||reg.quantity;
 if(reg.status==='registered'&&ticket.capacity>0&&(await reservedEventSeats(client,event.id,ticket.id))+baseCount>ticket.capacity)return {error:'目標票種的剩餘名額不足。'};
 await client.query('UPDATE event_regs SET ticket_snapshot=$2,ticket_version=ticket_version+1 WHERE id=$1',[reg.id,JSON.stringify({...ticket,administrative_change:true,previous_ticket_id:reg.ticket_snapshot?.id||null})]);
 return {changed:true,base_count:baseCount};
}

async function eventMutation(req,eventId,action,sql,args){
 const client=await pool.connect();try{await client.query('BEGIN');
 const result=await client.query(sql,args);
 if(result.rowCount)await client.query('INSERT INTO event_activity(event_id,actor_id,action) VALUES($1,$2,$3)',[eventId,req.auth.sub||null,action]);
 await client.query('COMMIT');return result;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

app.post('/api/admin/events', auth, requireDb, eventEditor, wrap(async (req, res) => {
  const b = req.body || {};
  if(!b.id && req.auth.role !== 'admin' && !req.auth.can_create_events) return res.status(403).json({error:'你只能管理受邀活動；建立新活動需要平台授權。'});
  const parsed = normalizeEventInput(b);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const v = parsed.value;
  // Ownership is assigned by the platform, never trusted from an organizer payload.
  let owner = req.auth.role === 'organizer' ? (b.id ? undefined : req.auth.sub) : (b.owner_id === undefined ? undefined : b.owner_id || null);
  if (req.auth.role === 'admin' && owner) {
    const user = (await q(`SELECT id FROM users WHERE id=$1 AND is_event_organizer=true`,[owner])).rows[0];
    if(!user) return res.status(400).json({error:'活動負責人必須是已授權活動主。'});
  }
  try {
    if (b.id) {
      const old = (await q(`SELECT slug FROM events WHERE id=$1`, [b.id])).rows[0];
      if (!old) return res.status(404).json({ error: '找不到活動。' });
      const slug = v.slug || old.slug;
      const updated = await eventMutation(req,b.id,'event_updated',
        `UPDATE events SET slug=$2,title=$3,description=$4,location=$5,starts_at=$6,ends_at=$7,
           capacity=$8,price_twd=$9,visibility=$10,status=$11,rich_content=COALESCE((SELECT jsonb_object_agg(key,value) FROM jsonb_each(rich_content) WHERE CASE WHEN key='zh' THEN description IS NOT DISTINCT FROM $4 ELSE $12::jsonb IS NULL OR translations->key->>'description' IS NOT DISTINCT FROM $12::jsonb->key->>'description' END),'{}'::jsonb),translations=COALESCE($12::jsonb,translations),owner_id=CASE WHEN $13 THEN $14::text ELSE owner_id END WHERE id=$1 AND ($15::text IS NULL OR owner_id=$15 OR EXISTS(SELECT 1 FROM event_hosts h WHERE h.event_id=events.id AND h.email=lower($16) AND h.can_manage=true))`,
        [b.id, slug, v.title, v.description, v.location, v.startsAt, v.endsAt,
          v.capacity, v.priceTwd, v.visibility, v.status, v.translations ? JSON.stringify(v.translations) : null, owner !== undefined, owner ?? null, req.auth.role === 'organizer' ? req.auth.sub : null, req.auth.email || null]
      );
      if(!updated.rowCount) return res.status(404).json({error:'找不到可管理的活動。'});
      return res.json({ ok: true, id: b.id, slug });
    }
    const id = uid('e_');
    const slug = v.slug || `${eventSlug(v.title) || 'event'}-${crypto.randomBytes(3).toString('hex')}`;
    await eventMutation(req,id,'event_created',
      `INSERT INTO events (id,slug,title,description,location,starts_at,ends_at,capacity,price_twd,visibility,status,translations,owner_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, slug, v.title, v.description, v.location, v.startsAt, v.endsAt,
        v.capacity, v.priceTwd, v.visibility, v.status, JSON.stringify(v.translations || {}), owner === undefined ? req.auth.sub : owner]
    );
    res.json({ ok: true, id, slug });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: '活動網址代稱已被使用。' });
    throw e;
  }
}));

async function eventSettlementSummary(client,eventId){
 const row=(await client.query(`WITH payment_rows AS (
   SELECT stripe_payment_intent_id AS payment_intent,amount_paid FROM event_regs WHERE event_id=$1 AND amount_paid>0
   UNION ALL SELECT snapshot->>'stripe_payment_intent_id',CASE WHEN snapshot->>'amount_paid' ~ '^[0-9]+$' THEN (snapshot->>'amount_paid')::integer ELSE 0 END FROM event_registration_history WHERE event_id=$1
   UNION ALL SELECT o.stripe_payment_intent_id,o.amount_paid FROM event_ticket_orders o JOIN event_regs r ON r.id=o.registration_id WHERE r.event_id=$1 AND o.amount_paid>0
  ),paid AS (SELECT payment_intent,MAX(amount_paid)::integer AS amount_paid FROM payment_rows WHERE payment_intent IS NOT NULL GROUP BY payment_intent)
  SELECT COALESCE((SELECT SUM(amount_paid) FROM paid),0)::bigint AS gross_twd,
   COALESCE((SELECT SUM(f.amount)/100 FROM event_refunds f JOIN paid p ON p.payment_intent=f.payment_intent WHERE f.status='succeeded'),0)::bigint AS refunded_twd,
   COALESCE((SELECT SUM(amount_twd) FROM event_settlements WHERE event_id=$1 AND status='scheduled'),0)::bigint AS scheduled_twd,
   COALESCE((SELECT SUM(amount_twd) FROM event_settlements WHERE event_id=$1 AND status='paid'),0)::bigint AS settled_twd`,[eventId])).rows[0];
 const summary=Object.fromEntries(Object.entries(row).map(([key,value])=>[key,Number(value)]));
 summary.net_collected_twd=summary.gross_twd-summary.refunded_twd;
 summary.available_twd=summary.net_collected_twd-summary.scheduled_twd-summary.settled_twd;
 return summary;
}

app.get('/api/admin/events/:id/payments',auth,requireDb,eventEditor,wrap(async(req,res)=>{
  const payments=(await q(`SELECT r.id AS registration_id,u.name,u.email,r.status,r.amount_due,r.amount_paid,
    r.stripe_payment_intent_id,r.stripe_refund_id,r.refund_status,r.paid_at,r.refunded_at,COALESCE((SELECT jsonb_agg(f ORDER BY f.created_at) FROM event_refunds f WHERE f.payment_intent=r.stripe_payment_intent_id),'[]') AS refunds
    FROM event_regs r JOIN users u ON u.id=r.user_id
    WHERE r.event_id=$1 AND (r.amount_due>0 OR r.amount_paid>0)
    ORDER BY r.created_at DESC`,[req.params.id])).rows;
  const historical=(await q(`SELECT h.snapshot,u.name,u.email,COALESCE((SELECT jsonb_agg(f ORDER BY f.created_at) FROM event_refunds f WHERE f.payment_intent=h.snapshot->>'stripe_payment_intent_id'),'[]') AS refunds FROM event_registration_history h JOIN users u ON u.id=h.user_id WHERE h.event_id=$1 AND ((h.snapshot->>'amount_paid')::integer>0 OR (h.snapshot->>'amount_due')::integer>0) ORDER BY h.id DESC`,[req.params.id])).rows.map(h=>({...h.snapshot,registration_id:h.snapshot.id,name:h.name,email:h.email,refunds:h.refunds,historical:true}));
  const additional=(await q(`SELECT r.id AS registration_id,o.id AS order_id,u.name,u.email,o.status,o.amount_due,o.amount_paid,o.stripe_payment_intent_id,o.paid_at,COALESCE((SELECT jsonb_agg(f ORDER BY f.created_at) FROM event_refunds f WHERE f.payment_intent=o.stripe_payment_intent_id),'[]') AS refunds FROM event_ticket_orders o JOIN event_regs r ON r.id=o.registration_id JOIN users u ON u.id=r.user_id WHERE r.event_id=$1 ORDER BY o.created_at DESC`,[req.params.id])).rows;
  const settlements=(await q(`SELECT id,amount_twd,status,due_on::text AS due_on,reference,note,paid_at,created_at,updated_at FROM event_settlements WHERE event_id=$1 ORDER BY created_at DESC`,[req.params.id])).rows;
  const settlement_summary=await eventSettlementSummary({query:q},req.params.id);
  res.json({collector:'言文字',currency:'TWD',can_refund:req.auth.role==='admin',can_manage_settlement:req.auth.role==='admin',settlement_status:settlements.some(row=>row.status==='scheduled')?'scheduled':settlements.some(row=>row.status==='paid')?'paid':'none',settlement_summary,settlements,payments:[...payments,...historical,...additional]});
}));

app.post('/api/admin/events/:id/settlements',auth,adminOnly,requireDb,wrap(async(req,res)=>{
 const amount=Number(req.body?.amount_twd),due=String(req.body?.due_on||''),note=String(req.body?.note||'').trim();
 const dueDate=new Date(due+'T00:00:00Z');if(!Number.isSafeInteger(amount)||amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(+dueDate)||dueDate.toISOString().slice(0,10)!==due||note.length>1000)return res.status(400).json({error:'請填寫正整數結算金額、有效日期與 1000 字內備註。'});
 const client=await pool.connect();try{await client.query('BEGIN');
  if(!(await client.query('SELECT id FROM events WHERE id=$1 FOR UPDATE',[req.params.id])).rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'找不到活動。'});}
  const summary=await eventSettlementSummary(client,req.params.id);if(amount>summary.available_twd){await client.query('ROLLBACK');return res.status(409).json({error:'結算金額超過目前可結算票款。',available_twd:summary.available_twd});}
  const id=uid('settlement_');await client.query("INSERT INTO event_settlements(id,event_id,amount_twd,due_on,note,created_by) VALUES($1,$2,$3,$4,$5,$6)",[id,req.params.id,amount,due,note,req.auth.sub||null]);
  await client.query("INSERT INTO event_activity(event_id,actor_id,action) VALUES($1,$2,'settlement_scheduled')",[req.params.id,req.auth.sub||null]);await client.query('COMMIT');res.json({ok:true,id,status:'scheduled'});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));

app.patch('/api/admin/events/:id/settlements/:settlementId',auth,adminOnly,requireDb,wrap(async(req,res)=>{
 const status=req.body?.status,reference=String(req.body?.reference||'').trim();if(!['paid','cancelled'].includes(status)||reference.length>200||status==='paid'&&!reference)return res.status(400).json({error:'結算只能標記為已撥款或取消；已撥款須填交易參考。'});
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT id FROM events WHERE id=$1 FOR UPDATE',[req.params.id]);
  const current=(await client.query('SELECT * FROM event_settlements WHERE id=$1 AND event_id=$2 FOR UPDATE',[req.params.settlementId,req.params.id])).rows[0];if(!current){await client.query('ROLLBACK');return res.status(404).json({error:'找不到結算紀錄。'});}
  if(current.status!== 'scheduled'){await client.query('ROLLBACK');return res.status(409).json({error:'只有待結算紀錄可以核銷或取消。'});}
  await client.query("UPDATE event_settlements SET status=$3,reference=$4,paid_at=CASE WHEN $3='paid' THEN now() ELSE NULL END,updated_at=now() WHERE id=$1 AND event_id=$2",[current.id,req.params.id,status,reference]);
  await client.query('INSERT INTO event_activity(event_id,actor_id,action) VALUES($1,$2,$3)',[req.params.id,req.auth.sub||null,'settlement_'+status]);await client.query('COMMIT');res.json({ok:true,status});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));

app.get('/api/admin/events/:id/feedback',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const feedback=(await q(`SELECT f.rating,f.comment,f.updated_at,u.name,u.email FROM event_feedback f JOIN users u ON u.id=f.user_id WHERE f.event_id=$1 ORDER BY f.updated_at DESC`,[req.params.id])).rows;
 res.json({feedback});
}));

app.get('/api/admin/events/:id/coupons',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const event=(await q('SELECT coupons FROM events WHERE id=$1',[req.params.id])).rows[0];if(!event)return res.status(404).json({error:'找不到活動。'});res.json({coupons:event.coupons});
}));
app.post('/api/admin/events/:id/coupons',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 let coupons;try{coupons=normalizeCoupons(req.body?.coupons);}catch(e){return res.status(400).json({error:e.message});}
 await eventMutation(req,req.params.id,'coupons_updated','UPDATE events SET coupons=$2 WHERE id=$1',[req.params.id,JSON.stringify(coupons)]);res.json({ok:true,coupons});
}));

const UPLOAD_EVENT_DIR=path.join(__dirname,'uploads','events');fs.mkdirSync(UPLOAD_EVENT_DIR,{recursive:true});
const eventCoverUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:0,parts:2}});
app.post('/api/admin/events/:id/cover',auth,requireDb,eventEditor,(req,res)=>{
 eventCoverUpload.single('file')(req,res,async err=>{
  if(err)return res.status(400).json({error:err.message});
  try{
   if(!(await q('SELECT id FROM events WHERE id=$1',[req.params.id])).rowCount)return res.status(404).json({error:'找不到活動。'});
   const file=req.file,invalid=file?assertSocialImageFile({mimetype:file.mimetype,size:file.size}):'請選擇圖片。';
   if(invalid||sniffImageType(file.buffer.subarray(0,12))!==file.mimetype)return res.status(400).json({error:invalid||'圖片內容與格式不符。'});
   const filename='event-'+buildSafeSocialFilename(file.originalname,file.mimetype);let url=await igPublisher.uploadAsset(file.buffer,filename,file.mimetype);
   if(!url){fs.writeFileSync(path.join(UPLOAD_EVENT_DIR,filename),file.buffer);url='/uploads/events/'+filename;}
   await eventMutation(req,req.params.id,'cover_updated',"UPDATE events SET event_details=event_details || jsonb_build_object('cover_url',$2::text) WHERE id=$1",[req.params.id,url]);res.json({url});
  }catch(e){console.error('[event-cover]',e.message);res.status(500).json({error:'封面上傳失敗，請稍後再試。'});}
 });
});

const eventContentUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:0,parts:2}});
app.post('/api/admin/events/:id/content/upload',auth,requireDb,eventEditor,(req,res)=>{
 eventContentUpload.single('file')(req,res,async err=>{
  if(err)return res.status(400).json({error:err.code==='LIMIT_FILE_SIZE'?'檔案上限為 10 MB。':'請選擇一個圖片或 PDF 檔案。'});
  let fileType;try{fileType=contentFileType(req.file);}catch(e){return res.status(400).json({error:e.message});}
  try{
   if(!(await q('SELECT id FROM events WHERE id=$1',[req.params.id])).rowCount)return res.status(404).json({error:'找不到活動。'});
   const filename='content-'+crypto.randomBytes(16).toString('hex')+fileType.extension;
   let url=await igPublisher.uploadAsset(req.file.buffer,filename,fileType.contentType);
   if(!url){await fs.promises.writeFile(path.join(UPLOAD_EVENT_DIR,filename),req.file.buffer,{flag:'wx'});url='/uploads/events/'+filename;}
   res.json({url,type:fileType.type,name:String(req.file.originalname||'附件').slice(0,200),size:req.file.size});
  }catch(e){console.error('[event-content-upload]',e.message);res.status(500).json({error:'附件上傳失敗，請稍後再試。'});}
 });
});

app.get('/api/admin/events/:id/embed',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const event=(await q('SELECT embed_origins FROM events WHERE id=$1',[req.params.id])).rows[0];if(!event)return res.status(404).json({error:'找不到活動。'});res.json({origins:event.embed_origins});
}));
app.put('/api/admin/events/:id/embed',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 let origins;try{origins=embedOrigins(req.body?.origins,/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(SITE_BASE));}catch(e){return res.status(400).json({error:e.message});}
 const result=await eventMutation(req,req.params.id,'embed_updated','UPDATE events SET embed_origins=$2 WHERE id=$1',[req.params.id,JSON.stringify(origins)]);if(!result.rowCount)return res.status(404).json({error:'找不到活動。'});res.json({ok:true,origins});
}));

app.get('/api/admin/events/:id/content',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const event=(await q('SELECT rich_content,description,translations FROM events WHERE id=$1',[req.params.id])).rows[0];if(!event)return res.status(404).json({error:'找不到活動。'});res.json(event);
}));
app.post('/api/admin/events/:id/content/preview',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 try{res.json({html:richText(req.body?.html,req.body?.pasted_text)});}catch(e){res.status(400).json({error:e.message});}
}));
app.put('/api/admin/events/:id/content',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const lang=req.body?.lang,text=req.body?.text;if(!['zh','en','ja'].includes(lang)||typeof text!=='string'||text.length>10000)return res.status(400).json({error:'請選擇語系，純文字摘要最多 10000 字。'});
 let html;try{html=richText(req.body?.html);}catch(e){return res.status(400).json({error:e.message});}
 await eventMutation(req,req.params.id,'rich_content_updated',`UPDATE events SET rich_content=rich_content || jsonb_build_object($2::text,$3::text),description=CASE WHEN $2='zh' THEN $4 ELSE description END,translations=translations || jsonb_build_object($2::text,COALESCE(translations->$2,'{}'::jsonb)||jsonb_build_object('description',$4::text)) WHERE id=$1`,[req.params.id,lang,html,text.trim()]);res.json({ok:true,html});
}));
app.post('/api/admin/events/:id/details',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const b=req.body||{},details={};
 if(!['offline','online','hybrid'].includes(b.mode)||typeof b.hide_location!=='boolean')return res.status(400).json({error:'活動形式或地點設定不正確。'});
 details.mode=b.mode;details.hide_location=b.hide_location;
 const theme=b.theme||'minimal',appearance=b.appearance||'light',accent=b.accent||'#FFDE34';
 if(!['minimal','gradient','dots','grid','confetti','emoji','seasonal','polaroid'].includes(theme)||!['light','dark'].includes(appearance)||!/^#[0-9a-fA-F]{6}$/.test(accent))return res.status(400).json({error:'主題或色彩格式不正確。'});
 if(b.show_guest_list!==undefined&&typeof b.show_guest_list!=='boolean')return res.status(400).json({error:'來賓名單開關格式錯誤。'});
 Object.assign(details,{theme,appearance,accent,show_guest_list:b.show_guest_list===true});

 for(const key of ['cover_url','online_url']){
  const value=String(b[key]||'').trim();if(value.length>2000)return res.status(400).json({error:'網址過長。'});
  if(value){let url;try{url=new URL(value,SITE_BASE);}catch{}if(!url||url.protocol!=='https:'&&!(key==='cover_url'&&value.startsWith('/uploads/')))return res.status(400).json({error:'請使用有效 https 網址，或已上傳的封面圖片。'});}
  details[key]=value;
 }
 const email=String(b.contact_email||'').trim();if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254))return res.status(400).json({error:'聯絡 Email 格式不正確。'});details.contact_email=email;
 await eventMutation(req,req.params.id,'details_updated','UPDATE events SET event_details=$2 WHERE id=$1',[req.params.id,JSON.stringify(details)]);res.json({ok:true,details});
}));
app.post('/api/admin/events/:id/cancel',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 if(req.body?.notify!==undefined&&typeof req.body.notify!=='boolean')return res.status(400).json({error:'通知選項格式不正確。'});
 if(req.body?.refund_paid!==undefined&&typeof req.body.refund_paid!=='boolean')return res.status(400).json({error:'退款選項格式不正確。'});
 if(req.body?.notify&&!process.env.RESEND_API_KEY)return res.status(503).json({error:'寄信服務尚未設定；取消勾選通知後可取消活動。'});
 if(req.body?.refund_paid&&req.auth.role!=='admin')return res.status(403).json({error:'僅言文字平台管理員可從統一收款帳戶退款。'});
 if(req.body?.refund_paid&&!stripe)return res.status(503).json({error:'Stripe 尚未設定，不能自動退款。'});
 const reason=String(req.body?.reason||'').trim();if(!reason||reason.length>1000)return res.status(400).json({error:'請填寫取消原因（最多 1000 字）。'});
 const translations=req.body?.reason_translations??{};if(typeof translations!=='object'||Array.isArray(translations)||Object.keys(translations).some(lang=>!['en','ja'].includes(lang)||typeof translations[lang]!=='string'||translations[lang].length>1000))return res.status(400).json({error:'取消原因翻譯僅支援 en／ja，各最多 1000 字。'});
 const client=await pool.connect();try{await client.query('BEGIN');
 const event=(await client.query('SELECT * FROM events WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
 if(!event){await client.query('ROLLBACK');return res.status(404).json({error:'找不到活動。'});}
 if(event.status==='已取消'){await client.query('COMMIT');return res.json({ok:true,already:true});}
 const open=(await client.query("SELECT stripe_session_id FROM event_regs WHERE event_id=$1 AND status='pending_payment' AND stripe_session_id IS NOT NULL UNION ALL SELECT o.stripe_session_id FROM event_ticket_orders o JOIN event_regs r ON r.id=o.registration_id WHERE r.event_id=$1 AND o.status='pending_payment' AND o.stripe_session_id IS NOT NULL",[event.id])).rows;
 if(open.length&&!stripe){await client.query('ROLLBACK');return res.status(503).json({error:'須先連線 Stripe 關閉待付款結帳，再取消活動。'});}
 for(const row of open){const session=await stripe.checkout.sessions.retrieve(row.stripe_session_id);if(session.status==='open')await stripe.checkout.sessions.expire(session.id);}
 const held=(await client.query("SELECT stripe_payment_intent_id FROM event_regs WHERE event_id=$1 AND capture_required=true AND status='pending_approval' AND stripe_payment_intent_id IS NOT NULL FOR UPDATE",[event.id])).rows;
 if(held.length&&!stripe){await client.query('ROLLBACK');return res.status(503).json({error:'須連線 Stripe 解除預授權，再取消活動。'});}
 for(const r of held){const intent=await stripe.paymentIntents.retrieve(r.stripe_payment_intent_id);if(intent.status==='requires_capture')await stripe.paymentIntents.cancel(intent.id);}

 const queued=req.body?.notify?await require('./lib/event-mailer').queueCancellation((sql,args)=>client.query(sql,args),event,reason,SITE_BASE,translations):0;
 let refunds=0;
 if(req.body?.refund_paid){
  const regs=(await client.query('SELECT * FROM event_regs WHERE event_id=$1 AND stripe_payment_intent_id IS NOT NULL AND amount_paid>0 FOR UPDATE',[event.id])).rows;
  for(const reg of regs){const previous=(await client.query('SELECT * FROM event_refunds WHERE payment_intent=$1',[reg.stripe_payment_intent_id])).rows,amount=refundTotals(reg.amount_paid*100,previous).remaining;if(amount<=0)continue;const key=reg.stripe_payment_intent_id+':cancel-'+event.id,refund=await stripe.refunds.create({payment_intent:reg.stripe_payment_intent_id,amount,metadata:{kind:'event-registration',registration_id:reg.id,event_cancelled:'true'}},{idempotencyKey:'event-refund-'+key});await saveEventRefund(client,reg,refund,key);refunds++;}
  const orders=(await client.query('SELECT o.* FROM event_ticket_orders o JOIN event_regs r ON r.id=o.registration_id WHERE r.event_id=$1 AND o.stripe_payment_intent_id IS NOT NULL AND o.amount_paid>0 FOR UPDATE OF o',[event.id])).rows;
  for(const order of orders){const previous=(await client.query('SELECT * FROM event_refunds WHERE payment_intent=$1',[order.stripe_payment_intent_id])).rows,amount=refundTotals(order.amount_paid*100,previous).remaining;if(amount<=0)continue;const key=order.stripe_payment_intent_id+':cancel-'+event.id,refund=await stripe.refunds.create({payment_intent:order.stripe_payment_intent_id,amount,metadata:{kind:'event-additional-tickets',order_id:order.id,event_cancelled:'true'}},{idempotencyKey:'event-refund-'+key});await saveAdditionalRefund(client,order,refund,key);refunds++;}
 }
 await client.query("UPDATE events SET status='已取消',event_details=event_details || jsonb_build_object('cancellation_reason',$2::text,'cancelled_at',now(),'cancellation_translations',$3::jsonb) WHERE id=$1",[event.id,reason,JSON.stringify(translations)]);
 await client.query('INSERT INTO event_activity(event_id,actor_id,action) VALUES($1,$2,$3)',[event.id,req.auth.sub||null,'event_cancelled']);
 await client.query('COMMIT');res.json({ok:true,notifications_queued:queued,refunds_requested:refunds,notice:'活動已取消。'+(req.body?.refund_paid?'已送出 '+refunds+' 筆可退款餘額；請在票款紀錄確認最終狀態。':'已付款票款尚未退款，請由言文字平台辦理。')+(req.body?.notify?'取消通知已排入佇列 '+queued+' 封，寄送狀態請見來賓通知。':'本次未發送取消通知。')});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));

app.get('/api/admin/events/:id/messages',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const messages=(await q(`SELECT m.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('state',d.state,'email',d.email,'error',d.last_error,'events',COALESCE((SELECT jsonb_agg(jsonb_build_object('type',x.event_type,'at',x.occurred_at) ORDER BY x.occurred_at) FROM event_delivery_events x WHERE x.provider_id=d.provider_id),'[]'::jsonb))) FROM event_deliveries d WHERE d.message_id=m.id),'[]') AS deliveries FROM event_messages m WHERE event_id=$1 ORDER BY created_at DESC`,[req.params.id])).rows;
 const tickets=(await q('SELECT tickets FROM events WHERE id=$1',[req.params.id])).rows[0]?.tickets||[];
 res.json({messages,tickets:tickets.map(t=>({id:t.id,name:t.name})),configured:!!process.env.RESEND_API_KEY});
}));
app.post('/api/admin/events/:id/messages',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 let value;try{value=normalizeBlast(req.body);}catch(e){return res.status(400).json({error:e.message});}
 const id=uid('msg_');await eventMutation(req,req.params.id,'message_drafted','INSERT INTO event_messages(id,event_id,subject,body,audience,audiences,ticket_ids,body_html) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,req.params.id,value.subject,value.body,value.audiences[0],JSON.stringify(value.audiences),JSON.stringify(value.ticketIds),value.bodyHtml||'']);res.json({ok:true,id});
}));
app.patch('/api/admin/events/:id/messages/:messageId',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 let value;try{value=normalizeBlast(req.body);}catch(e){return res.status(400).json({error:e.message});}
 const result=await eventMutation(req,req.params.id,'message_edited',"UPDATE event_messages SET subject=$3,body=$4,audience=$5,audiences=$6,ticket_ids=$7,body_html=CASE WHEN $8::text IS NOT NULL THEN $8 WHEN body=$4 THEN body_html ELSE '' END WHERE id=$1 AND event_id=$2 AND state='draft' AND registration_id IS NULL RETURNING id",[req.params.messageId,req.params.id,value.subject,value.body,value.audiences[0],JSON.stringify(value.audiences),JSON.stringify(value.ticketIds),value.bodyHtml??null]);
 if(!result.rowCount)return res.status(409).json({error:'僅能編輯此活動尚未發布的草稿。'});res.json({ok:true,html:value.bodyHtml||''});
}));
app.get('/api/admin/events/:id/messages/:messageId/preview',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const message=(await q('SELECT id,subject,body,body_html,audiences,ticket_ids,state FROM event_messages WHERE id=$1 AND event_id=$2',[req.params.messageId,req.params.id])).rows[0];
 if(!message)return res.status(404).json({error:'找不到訊息。'});
 const recipients=(await q(`SELECT DISTINCT u.email FROM event_regs r JOIN users u ON u.id=r.user_id JOIN event_messages m ON m.event_id=r.event_id WHERE r.event_id=$1 AND m.id=$2 AND ${blastAudienceSQL} AND NOT EXISTS(SELECT 1 FROM event_notification_preferences p WHERE p.event_id=r.event_id AND p.user_id=r.user_id AND NOT p.blasts) ORDER BY u.email`,[req.params.id,message.id])).rows;
 res.json({message,count:recipients.length,recipients});
}));
app.post('/api/admin/events/:id/messages/:messageId/publish',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const result=await eventMutation(req,req.params.id,'message_published',"UPDATE event_messages SET state='published',send_at=now() WHERE id=$1 AND event_id=$2 AND state='draft' AND registration_id IS NULL RETURNING id",[req.params.messageId,req.params.id]);
 if(!result.rowCount)return res.status(409).json({error:'此草稿已發布或取消。'});res.json({ok:true,email_sent:false});
}));
app.post('/api/events/unsubscribe',rateLimit({max:30,windowMs:60000}),requireDb,wrap(async(req,res)=>{
 const {verifyUnsubscribe,notificationCategory}=require('./lib/event-mailer'),id=verifyUnsubscribe(req.body?.token,SECRET);
 if(!id)return res.status(400).json({error:'退訂連結無效。'});
 const row=(await q(`SELECT d.id,d.email,m.event_id,e.title,jsonb_build_object('registration_id',m.registration_id) AS context FROM event_deliveries d JOIN event_messages m ON m.id=d.message_id JOIN events e ON e.id=m.event_id WHERE d.id=$1`,[id])).rows[0];
 const category=row&&notificationCategory(row);if(!category)return res.status(400).json({error:'此連結不能用於退訂。'});
 if(req.body.action==='preview')return res.json({event:row.title,category});
 if(req.body.action!=='unsubscribe')return res.status(400).json({error:'請確認是否退訂。'});
 await q(`INSERT INTO event_notification_preferences(event_id,user_id,blasts,reminders,feedback)
 SELECT $1,id,$3<>'blasts',$3<>'reminders',$3<>'feedback' FROM users WHERE lower(email)=lower($2)
 ON CONFLICT(event_id,user_id) DO UPDATE SET blasts=CASE WHEN $3='blasts' THEN false ELSE event_notification_preferences.blasts END,reminders=CASE WHEN $3='reminders' THEN false ELSE event_notification_preferences.reminders END,feedback=CASE WHEN $3='feedback' THEN false ELSE event_notification_preferences.feedback END,updated_at=now()`,[row.event_id,row.email,category]);
 res.json({ok:true,category});
}));

async function eventParticipant(req,res,next){
 try{const found=await q(`SELECT 1 FROM events e JOIN event_regs r ON r.event_id=e.id WHERE e.id=$1 AND e.status<>'草稿' AND (r.user_id=$2 OR EXISTS(SELECT 1 FROM event_attendees a WHERE a.registration_id=r.id AND a.email=lower($3))) LIMIT 1`,[req.params.id,req.auth.sub,req.auth.email||'']);if(!found.rowCount)return res.status(404).json({error:'找不到你的活動報名。'});next();}catch(e){next(e);}
}
app.post('/api/events/:id/join-online',auth,requireDb,wrap(async(req,res)=>{
 const event=(await q(`SELECT e.event_details FROM events e WHERE e.id=$1 AND e.status NOT IN ('草稿','預告','已取消') AND EXISTS(
 SELECT 1 FROM event_regs r WHERE r.event_id=e.id AND r.status='registered' AND (r.user_id=$2 OR EXISTS(
 SELECT 1 FROM event_attendees a LEFT JOIN event_ticket_orders o ON o.id=a.order_id WHERE a.registration_id=r.id AND a.email=lower($3) AND (a.order_id IS NULL OR o.status='registered'))))`,[req.params.id,req.auth.sub,req.auth.email||''])).rows[0];
 if(!event)return res.status(404).json({error:'找不到有效的活動報名。'});
 let url;try{url=new URL(event.event_details?.online_url);if(url.protocol!=='https:'||url.username||url.password)throw Error();}catch{return res.status(409).json({error:'主辦人尚未提供有效的線上活動連結。'});}
 await q(`INSERT INTO event_online_joins(event_id,user_id) VALUES($1,$2) ON CONFLICT(event_id,user_id) DO UPDATE SET last_joined_at=now(),clicks=event_online_joins.clicks+1`,[req.params.id,req.auth.sub]);
 res.json({url:url.href});
}));
app.get('/api/events/:id/notification-settings',auth,requireDb,eventParticipant,wrap(async(req,res)=>{
 const settings=(await q('SELECT blasts,reminders,feedback FROM event_notification_preferences WHERE event_id=$1 AND user_id=$2',[req.params.id,req.auth.sub])).rows[0]||{blasts:true,reminders:true,feedback:true};res.json({settings});
}));
app.put('/api/events/:id/notification-settings',auth,requireDb,eventParticipant,wrap(async(req,res)=>{
 const b=req.body||{};if(['blasts','reminders','feedback'].some(k=>typeof b[k]!=='boolean'))return res.status(400).json({error:'通知設定必須為開啟或關閉。'});
 await q(`INSERT INTO event_notification_preferences(event_id,user_id,blasts,reminders,feedback) VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_id,user_id) DO UPDATE SET blasts=$3,reminders=$4,feedback=$5,updated_at=now()`,[req.params.id,req.auth.sub,b.blasts,b.reminders,b.feedback]);res.json({ok:true});
}));
app.get('/api/events/:id/messages',auth,requireDb,wrap(async(req,res)=>{
 const messages=(await q(`SELECT DISTINCT m.id,m.subject,m.body,m.body_html,m.send_at FROM event_messages m JOIN events e ON e.id=m.event_id JOIN event_regs r ON r.event_id=m.event_id
 WHERE m.event_id=$1 AND e.status<>'草稿' AND m.registration_id IS NULL AND m.state IN ('published','scheduled') AND m.send_at<=now()
 AND (r.user_id=$2 OR EXISTS(SELECT 1 FROM event_attendees a LEFT JOIN event_ticket_orders o ON o.id=a.order_id WHERE a.registration_id=r.id AND a.email=lower($3)
 AND (a.order_id IS NULL OR o.status='registered')
 AND (jsonb_array_length(m.ticket_ids)=0 OR m.ticket_ids ? (CASE WHEN a.order_id IS NULL THEN r.ticket_snapshot->>'id' ELSE o.ticket_snapshot->>'id' END))
 AND ((CASE WHEN jsonb_array_length(m.audiences)>0 THEN m.audiences ELSE jsonb_build_array(m.audience) END) ? r.status OR a.checked_in_at IS NOT NULL))) AND ${blastAudienceSQL}
 ORDER BY m.send_at DESC,m.id DESC LIMIT 100`,[req.params.id,req.auth.sub,req.auth.email||''])).rows;
 res.json({messages});
}));
app.post('/api/admin/events/:id/messages/:messageId/schedule',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 if(!process.env.RESEND_API_KEY)return res.status(503).json({error:'寄信服務尚未設定，草稿已保留，未寄送。'});
 const sendAt=req.body?.send_at?new Date(req.body.send_at):new Date();
 if(!Number.isFinite(+sendAt)||+sendAt<Date.now()-60000)return res.status(400).json({error:'請選擇有效的未來時間。'});
 const client=await pool.connect();try{await client.query('BEGIN');
 const message=(await client.query('SELECT * FROM event_messages WHERE id=$1 AND event_id=$2 FOR UPDATE',[req.params.messageId,req.params.id])).rows[0];
 if(!message){await client.query('ROLLBACK');return res.status(404).json({error:'找不到訊息。'});}
 if(message.state!=='draft'){await client.query('ROLLBACK');return res.status(409).json({error:'訊息已排程或取消，請勿重複寄送。'});}
 const recipients=(await client.query(`SELECT DISTINCT u.email FROM event_regs r JOIN users u ON u.id=r.user_id JOIN event_messages m ON m.event_id=r.event_id WHERE r.event_id=$1 AND m.id=$2 AND ${blastAudienceSQL} AND NOT EXISTS(SELECT 1 FROM event_notification_preferences p WHERE p.event_id=r.event_id AND p.user_id=r.user_id AND NOT p.blasts)`,[req.params.id,message.id])).rows;
 if(!recipients.length){await client.query('ROLLBACK');return res.status(409).json({error:'此分眾目前沒有收件人。'});}
 for(const r of recipients)await client.query('INSERT INTO event_deliveries(id,message_id,email,subject,body,next_attempt_at,body_html) VALUES($1,$2,$3,$4,$5,$6,$7)',[uid('mail_'),message.id,r.email,message.subject,message.body,sendAt,message.body_html]);
 await client.query("UPDATE event_messages SET state='scheduled',send_at=$2 WHERE id=$1",[message.id,sendAt]);await client.query('COMMIT');res.json({ok:true,recipients:recipients.length,send_at:sendAt});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.post('/api/admin/events/:id/messages/:messageId/cancel',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const client=await pool.connect();try{await client.query('BEGIN');
 const m=(await client.query('SELECT * FROM event_messages WHERE id=$1 AND event_id=$2 FOR UPDATE',[req.params.messageId,req.params.id])).rows[0];
 if(!m){await client.query('ROLLBACK');return res.status(404).json({error:'找不到訊息。'});}
 const cancelled=await client.query("UPDATE event_deliveries SET state='cancelled' WHERE message_id=$1 AND state='queued' AND first_attempt_at IS NULL RETURNING id",[m.id]);
 await client.query("UPDATE event_messages SET state='cancelled' WHERE id=$1",[m.id]);await client.query('COMMIT');res.json({ok:true,cancelled:cancelled.rowCount});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));

app.get('/api/admin/events/:id/insights',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const days=Number(req.query.days||30);if(![1,7,30,90].includes(days))return res.status(400).json({error:'可查詢 1、7、30 或 90 天。'});
 const views=(await q(`SELECT day::text AS day,source,campaign,views FROM event_views WHERE event_id=$1 AND day>=(now() AT TIME ZONE 'Asia/Taipei')::date-$2::int ORDER BY day DESC,views DESC`,[req.params.id,days-1])).rows;
 const guests=(await q(`SELECT status,COALESCE(SUM(quantity),0)::int AS count,COALESCE(SUM(CASE WHEN quantity>1 THEN (SELECT COUNT(*) FROM event_attendees a WHERE a.registration_id=event_regs.id AND a.checked_in_at IS NOT NULL) ELSE (checked_in_at IS NOT NULL)::int END),0)::int AS checked_in FROM event_regs WHERE event_id=$1 GROUP BY status`,[req.params.id])).rows;
 const visitors=(await q(`SELECT COUNT(DISTINCT visitor_hash)::int AS unique_sessions,COUNT(DISTINCT visitor_hash) FILTER(WHERE last_seen>now()-interval '5 minutes')::int AS active_sessions FROM event_visitors WHERE event_id=$1 AND day>=(now() AT TIME ZONE 'Asia/Taipei')::date-$2::int`,[req.params.id,days-1])).rows[0];
 const attribution=(await q(`SELECT COALESCE(NULLIF(attribution->>'source',''),'direct') AS source,COALESCE(attribution->>'campaign','') AS campaign,COALESCE(attribution->>'referral','') AS referral,COUNT(*)::int AS bookings,COALESCE(SUM(quantity) FILTER(WHERE status='registered'),0)::int AS registered FROM event_regs WHERE event_id=$1 AND created_at>=((now() AT TIME ZONE 'Asia/Taipei')::date-$2::int) AT TIME ZONE 'Asia/Taipei' GROUP BY 1,2,3 ORDER BY bookings DESC`,[req.params.id,days-1])).rows;
 const online=(await q('SELECT COUNT(*)::int AS participants,COALESCE(SUM(clicks),0)::int AS clicks FROM event_online_joins WHERE event_id=$1',[req.params.id])).rows[0];
 const registrations=(await q(`SELECT (created_at AT TIME ZONE 'Asia/Taipei')::date::text AS day,
   COUNT(*)::int AS bookings,
   COUNT(*) FILTER(WHERE entry_source='self_service')::int AS self_service_bookings,
   COALESCE(SUM(quantity) FILTER(WHERE status='registered'),0)::int AS registered,
   COALESCE(SUM(quantity) FILTER(WHERE entry_source='self_service' AND status='registered'),0)::int AS self_service_registered,
   COALESCE(SUM(CASE WHEN entry_source='self_service' AND status='registered' THEN CASE WHEN quantity>1 THEN (SELECT COUNT(*) FROM event_attendees a WHERE a.registration_id=event_regs.id AND a.checked_in_at IS NOT NULL) ELSE (checked_in_at IS NOT NULL)::int END ELSE 0 END),0)::int AS self_service_checked_in
   FROM event_regs WHERE event_id=$1 AND created_at>=((now() AT TIME ZONE 'Asia/Taipei')::date-$2::int) AT TIME ZONE 'Asia/Taipei' GROUP BY 1 ORDER BY 1 DESC`,[req.params.id,days-1])).rows;
 res.json({days,views,guests,visitors,attribution,online,registrations});
}));

app.post('/api/admin/events/:id/tickets',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 let tickets;try{tickets=normalizeTickets(req.body?.tickets);}catch(e){return res.status(400).json({error:e.message});}
 await eventMutation(req,req.params.id,'tickets_updated','UPDATE events SET tickets=$2 WHERE id=$1',[req.params.id,JSON.stringify(tickets)]);
 res.json({ok:true,tickets});
}));

app.post('/api/admin/events/:id/questions',auth,requireDb,eventEditor,wrap(async(req,res)=>{
  let questions;try{questions=eventQuestions.questions(req.body?.questions);}catch(e){return res.status(400).json({error:e.message});}
  await eventMutation(req,req.params.id,'questions_updated',`UPDATE events SET registration_settings=jsonb_set(registration_settings,'{questions}',$2::jsonb) WHERE id=$1`,[req.params.id,JSON.stringify(questions)]);
  res.json({ok:true,questions});
}));

app.post('/api/admin/events/:id/registration-settings', auth, requireDb, eventEditor, wrap(async(req,res)=>{
  const b=req.body || {};
  if(typeof b.requires_approval!=='boolean'||typeof b.waitlist!=='boolean')return res.status(400).json({error:'審核與候補設定格式不正確。'});
  const settings={requires_approval:b.requires_approval,waitlist:b.waitlist};
  if(b.group_registration!==undefined){if(typeof b.group_registration!=='boolean')return res.status(400).json({error:'團體報名設定格式不正確。'});settings.group_registration=b.group_registration;}
  if(b.payment_approval!==undefined){if(!['after_approval','authorize'].includes(b.payment_approval))return res.status(400).json({error:'付費審核方式無效。'});settings.payment_approval=b.payment_approval;}
  if(b.feedback!==undefined){const f=b.feedback;if(!f||typeof f.enabled!=='boolean'||!Number.isInteger(f.delay_hours)||f.delay_hours<0||f.delay_hours>168||typeof f.subject!=='string'||f.subject.length>160||typeof f.body!=='string'||f.body.length>5000)return res.status(400).json({error:'回饋邀請需設定開關、活動結束後 0–168 小時、有效主旨與內容。'});settings.feedback={enabled:f.enabled,delay_hours:f.delay_hours,subject:f.subject.trim(),body:f.body.trim()};}
  if(b.reminders!==undefined){if(!Array.isArray(b.reminders)||b.reminders.some(h=>![1,24].includes(h)))return res.status(400).json({error:'提醒時間只可選活動前 24 小時或 1 小時。'});settings.reminders=[...new Set(b.reminders)];}
  for(const key of ['opens_at','closes_at']){
    if(b[key] && (typeof b[key]!=='string'||!Number.isFinite(Date.parse(b[key]))))return res.status(400).json({error:'報名時間格式不正確。'});
    settings[key]=b[key]?new Date(b[key]).toISOString():null;
  }
  if(settings.opens_at&&settings.closes_at&&settings.opens_at>=settings.closes_at)return res.status(400).json({error:'截止時間必須晚於開放時間。'});
  await eventMutation(req,req.params.id,'registration_settings_updated','UPDATE events SET registration_settings=registration_settings || $2::jsonb WHERE id=$1',[req.params.id,JSON.stringify(settings)]);
  res.json({ok:true,settings});
}));
app.get('/api/admin/events/:id/activity',auth,requireDb,eventEditor,wrap(async(req,res)=>{
  const activity=(await q(`SELECT a.id,a.registration_id,a.actor_id,u.name AS actor_name,a.action,a.created_at FROM event_activity a LEFT JOIN users u ON u.id=a.actor_id WHERE a.event_id=$1 AND ($2::bigint IS NULL OR a.id<$2) ORDER BY a.id DESC LIMIT 100`,[req.params.id,/^[0-9]{1,18}$/.test(req.query.before||'')?req.query.before:null])).rows;
  res.json({activity,next:activity.length===100?activity.at(-1).id:null});
}));
app.post('/api/admin/events/:id/regs/:registrationId/status',auth,requireDb,eventEditor,wrap(async(req,res)=>{
  let status=req.body?.status;
  if(!['registered','declined','pending_approval','waitlisted'].includes(status))return res.status(400).json({error:'請選擇有效報名狀態。'});
  if(req.body?.notify!==undefined&&typeof req.body.notify!=='boolean'||req.body?.message!==undefined&&(typeof req.body.message!=='string'||req.body.message.length>5000))return res.status(400).json({error:'通知設定格式不正確。'});
  if(req.body?.notify&&!process.env.RESEND_API_KEY)return res.status(503).json({error:'寄信服務尚未設定；可取消通知後更新狀態。'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const ev=(await client.query('SELECT * FROM events WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
    const reg=(await client.query('SELECT * FROM event_regs WHERE event_id=$1 AND id=$2 FOR UPDATE',[req.params.id,req.params.registrationId])).rows[0];
    if(!reg){await client.query('ROLLBACK');return res.status(404).json({error:'找不到報名。'});}
    if(reg.status===status){await client.query('COMMIT');return res.json({ok:true,status});}
    if(!['registered','pending_approval','waitlisted','declined','cancelled'].includes(reg.status)){await client.query('ROLLBACK');return res.status(409).json({error:'這筆報名目前有付款處理中或已退款，請先完成款項處理。'});}
    if(reg.checked_in_at||(await client.query('SELECT 1 FROM event_attendees WHERE registration_id=$1 AND checked_in_at IS NOT NULL LIMIT 1',[reg.id])).rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'請先撤銷簽到，再變更報名狀態。'});}
    if(status!=='registered'&&(reg.amount_paid>0||(await client.query("SELECT 1 FROM event_ticket_orders WHERE registration_id=$1 AND ticket_version=$2 AND status IN ('registered','pending_payment','refund_pending') AND amount_due>0 LIMIT 1",[reg.id,reg.ticket_version])).rowCount)){await client.query('ROLLBACK');return res.status(409).json({error:'此報名尚有票款，請先由言文字處理退款。'});}
    if(['pending_approval','waitlisted'].includes(status)&&reg.capture_required&&reg.stripe_payment_intent_id){await client.query('ROLLBACK');return res.status(409).json({error:'預授權報名請先完成核准請款或拒絕解除。'});}
    if(status==='registered'){
      if(ev.status!=='報名中'){await client.query('ROLLBACK');return res.status(409).json({error:'活動目前未開放報名。'});}
      const count=await reservedEventSeats(client,ev.id);
      if(ev.capacity>0&&count+reg.quantity>ev.capacity){await client.query('ROLLBACK');return res.status(409).json({error:'名額已滿，請先釋出名額。'});}
      const additional=(await client.query("SELECT quantity,ticket_snapshot FROM event_ticket_orders WHERE registration_id=$1 AND ticket_version=$2 AND status IN ('registered','refund_pending')",[reg.id,reg.ticket_version])).rows;
      const quantities=new Map();if(reg.ticket_snapshot?.id)quantities.set(reg.ticket_snapshot.id,reg.quantity-additional.reduce((n,o)=>n+o.quantity,0));
      for(const order of additional)if(order.ticket_snapshot?.id)quantities.set(order.ticket_snapshot.id,(quantities.get(order.ticket_snapshot.id)||0)+order.quantity);
      for(const [ticketId,quantity] of quantities){if(quantity<=0)continue;
        const ticket=(ev.tickets||[]).find(t=>t.id===ticketId);
        if(!ticket||!ticket.active){await client.query('ROLLBACK');return res.status(409).json({error:'此報名包含已停用票種。'});}
        const used=await reservedEventSeats(client,ev.id,ticket.id);
        if(ticket.capacity>0&&used+quantity>ticket.capacity){await client.query('ROLLBACK');return res.status(409).json({error:'此票種名額已滿。'});}
      }
      if(reg.amount_due>reg.amount_paid&&!reg.capture_required)status='approved';
    }
    if(reg.capture_required&&reg.stripe_payment_intent_id){
      if(!stripe){await client.query('ROLLBACK');return res.status(503).json({error:'須連線 Stripe 核對預授權。'});}
      let intent=await stripe.paymentIntents.retrieve(reg.stripe_payment_intent_id);
      if(status==='declined'){
        if(intent.status==='requires_capture')intent=await stripe.paymentIntents.cancel(intent.id);
        if(intent.status!=='canceled'){await client.query('ROLLBACK');return res.status(409).json({error:'此款項已請款或處理中，請由言文字核對並退款。'});}
      }else{
        if(intent.status==='requires_capture'&&reg.authorization_expires_at&&+new Date(reg.authorization_expires_at)<=Date.now())intent=await stripe.paymentIntents.cancel(intent.id);
        if(intent.status==='canceled'){await client.query("UPDATE event_regs SET status='expired' WHERE id=$1",[reg.id]);await client.query('COMMIT');return res.status(409).json({error:'信用卡預授權已失效，請參加者重新報名。'});}
        if(intent.status==='requires_capture')intent=await stripe.paymentIntents.capture(intent.id,{amount_to_capture:reg.amount_due*100},{idempotencyKey:'event-capture-'+intent.id});
        if(intent.status==='succeeded'&&intent.currency==='twd'&&intent.amount_received===reg.amount_due*100){status='registered';await client.query('UPDATE event_regs SET amount_paid=amount_due,paid_at=now() WHERE id=$1',[reg.id]);}
        else if(intent.status==='processing')status='capture_pending';
        else throw new Error('信用卡請款結果與報名資料不符，請在 Stripe 核對');
      }
    }
    await client.query("UPDATE event_regs SET status=$2,checkout_expires_at=CASE WHEN $2='approved' THEN now()+interval '24 hours' ELSE NULL END WHERE id=$1",[reg.id,status]);
    await client.query('INSERT INTO event_activity(event_id,registration_id,actor_id,action) VALUES($1,$2,$3,$4)',[ev.id,reg.id,req.auth.sub||null,status]);
    if(req.body?.notify){
      const user=(await client.query('SELECT email FROM users WHERE id=$1',[reg.user_id])).rows[0];
      const lang=['en','ja'].includes(reg.language)?reg.language:'zh',title=ev.translations?.[lang]?.title||ev.title;
      const labels={registered:['已核准','Approved','承認済み'],approved:['已核准，請於 24 小時內付款','Approved — pay within 24 hours','承認済み：24時間以内にお支払いください'],declined:['未獲核准','Not approved','承認されませんでした'],waitlisted:['候補中','Waitlisted','キャンセル待ち'],pending_approval:['待審核','Pending approval','承認待ち'],capture_pending:['請款處理中','Payment processing','決済処理中']};
      const label=labels[status]?.[['zh','en','ja'].indexOf(lang)]||status;
      await require('./lib/event-mailer').queueEventMail((sql,args)=>client.query(sql,args),{id:uid('status_'),eventId:ev.id,registrationId:reg.id,ticketVersion:reg.ticket_version,expectedStatus:status,email:user.email,subject:title+' · '+label,body:label+'\n\n'+(req.body.message||'')+'\n\n'+SITE_BASE+(lang==='zh'?'':'/'+lang)+'/events/'+encodeURIComponent(ev.slug)});
    }
    await client.query('COMMIT');res.json({ok:true,status});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));

app.post('/api/admin/events/:id/duplicate', auth, requireDb, eventEditor, wrap(async (req,res) => {
  if(req.auth.role !== 'admin' && !req.auth.can_create_events) return res.status(403).json({error:'建立活動需要平台授權。'});
  const id=uid('e_'), slug='event-'+crypto.randomBytes(8).toString('hex');
  const result=await eventMutation(req,id,'event_duplicated',`INSERT INTO events(id,slug,title,description,location,starts_at,ends_at,capacity,price_twd,visibility,status,translations,owner_id,registration_settings,tickets,event_details,coupons,rich_content)
    SELECT $2,$3,title || '（副本）',description,location,starts_at,ends_at,capacity,price_twd,visibility,'草稿',translations,$4,registration_settings,tickets,event_details-'cancellation_reason',coupons,rich_content
    FROM events WHERE id=$1 RETURNING id`,[req.params.id,id,slug,req.auth.sub || null]);
  if(!result.rowCount)return res.status(404).json({error:'找不到活動。'});
  res.json({ok:true,id,slug});
}));

app.get('/api/admin/events/:id/hosts', auth, requireDb, eventEditor, wrap(async (req,res) => {
  const owner = (await q(`SELECT u.name,u.email FROM events e JOIN users u ON u.id=e.owner_id WHERE e.id=$1`,[req.params.id])).rows[0] || null;
  const event = (await q(`SELECT title,tickets,checkin_mode,checkin_mode_locked FROM events WHERE id=$1`,[req.params.id])).rows[0];
  const hosts = (await q(`SELECT email,name,is_visible,can_manage,can_checkin,checkin_ticket_ids FROM event_hosts WHERE event_id=$1 ORDER BY name,email`,[req.params.id])).rows;
  res.json({owner,hosts,tickets:event?.tickets||[],checkin:{mode:event?.checkin_mode||'standard',locked:event?.checkin_mode_locked===true}});
}));
app.post('/api/admin/events/:id/hosts', auth, requireDb, eventEditor, wrap(async (req,res) => {
  const b=req.body || {}, email=String(b.email || '').trim().toLowerCase(), name=String(b.name || '').trim();
  const ticketIds=Array.isArray(b.checkin_ticket_ids)?[...new Set(b.checkin_ticket_ids.map(String))]:[];
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || !name || name.length>120 || typeof b.is_visible!=='boolean' || typeof b.can_manage!=='boolean' || (b.can_checkin!==undefined&&typeof b.can_checkin!=='boolean')) return res.status(400).json({error:'請填寫姓名、有效 Email 與權限。'});
  const tickets=(await q('SELECT tickets FROM events WHERE id=$1',[req.params.id])).rows[0]?.tickets||[],validIds=new Set(tickets.map(ticket=>ticket.id));
  if(ticketIds.length>30||ticketIds.some(id=>!validIds.has(id)))return res.status(400).json({error:'簽到票種範圍不正確。'});
  await eventMutation(req,req.params.id,'host_updated',`INSERT INTO event_hosts(event_id,email,name,is_visible,can_manage,can_checkin,checkin_ticket_ids) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(event_id,email) DO UPDATE SET name=$3,is_visible=$4,can_manage=$5,can_checkin=$6,checkin_ticket_ids=$7`,[req.params.id,email,name,b.is_visible,b.can_manage,b.can_checkin===true,JSON.stringify(b.can_checkin===true&&!b.can_manage?ticketIds:[])]);
  res.json({ok:true});
}));
app.post('/api/admin/events/:id/check-in/settings',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const mode=req.body?.mode,locked=req.body?.locked;if(!['standard','express'].includes(mode)||typeof locked!=='boolean')return res.status(400).json({error:'簽到模式設定不正確。'});
 await eventMutation(req,req.params.id,'checkin_settings_updated','UPDATE events SET checkin_mode=$2,checkin_mode_locked=$3 WHERE id=$1',[req.params.id,mode,locked]);
 res.json({ok:true,mode,locked});
}));
app.delete('/api/admin/events/:id/hosts', auth, requireDb, eventEditor, wrap(async (req,res) => {
  const email=String(req.body?.email || '').trim().toLowerCase();
  const owner=(await q(`SELECT u.email FROM events e JOIN users u ON u.id=e.owner_id WHERE e.id=$1`,[req.params.id])).rows[0];
  if(owner?.email.toLowerCase()===email) return res.status(409).json({error:'建立者的管理權限不可移除；活動負責人只能由平台調整。'});
  await eventMutation(req,req.params.id,'host_removed',`DELETE FROM event_hosts WHERE event_id=$1 AND email=$2`,[req.params.id,email]);
  res.json({ok:true});
}));

app.delete('/api/admin/events/:id', auth, requireDb, eventEditor, wrap(async (req, res) => {
  if(req.params.id === FEATURED_ID) return res.status(409).json({error:'專屬活動請設為草稿以取消公開，或設為已結束以保留紀錄。'});
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT id FROM events WHERE id=$1 FOR UPDATE`, [req.params.id]);
    const n = (await client.query(`SELECT COALESCE(SUM(quantity),0)::int AS n FROM event_regs WHERE event_id=$1`, [req.params.id])).rows[0].n;
    if (n) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: '已有報名紀錄，請改為「已結束」以保留付款與簽到稽核。' });
    }
    await client.query(`DELETE FROM events WHERE id=$1`, [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}));

app.post('/api/admin/events/:id/guests/import',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const b=req.body||{},status=b.status||'invited';
 if(!['invited','registered','pending_approval','waitlisted'].includes(status)||!Array.isArray(b.guests)||!b.guests.length||b.guests.length>500)return res.status(400).json({error:'每次可匯入 1–500 位來賓，請選擇有效狀態。'});
 if(b.update_existing!==undefined&&typeof b.update_existing!=='boolean')return res.status(400).json({error:'更新既有來賓設定格式不正確。'});
 const seen=new Set(),guests=[];
 for(const g of b.guests){const email=String(g?.email||'').trim().toLowerCase(),name=String(g?.name||'').trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!name||name.length>120)return res.status(400).json({error:'每位來賓都需有效姓名與 Email。'});if(!seen.has(email)){seen.add(email);guests.push({email,name});}}
 const client=await pool.connect();try{await client.query('BEGIN');
 const event=(await client.query('SELECT * FROM events WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
 if(!event){await client.query('ROLLBACK');return res.status(404).json({error:'找不到活動。'});}
 if(event.status==='已取消'||status==='registered'&&event.status!=='報名中'){await client.query('ROLLBACK');return res.status(409).json({error:'活動未開放報名或已取消。'});}
 let ticket=null;try{if(event.tickets.length&&status!=='invited')ticket=selectTicket(event.tickets,b.ticket_id,Date.now(),b.unlock_code);}catch(e){await client.query('ROLLBACK');return res.status(400).json({error:e.message});}
 const price=ticket?.price_twd??event.price_twd;
 if(status==='registered'&&price>0){await client.query('ROLLBACK');return res.status(409).json({error:'付費票不能以匯入標記為已付款；請先邀請來賓自行付款。'});}
 let added=0,updated=0,skipped=0;
 for(const guest of guests.sort((a,b)=>a.email.localeCompare(b.email))){
  const user=await accountByEmail(client,guest.email,guest.name);
  const existing=(await client.query('SELECT * FROM event_regs WHERE event_id=$1 AND user_id=$2 FOR UPDATE',[event.id,user.id])).rows[0];
  if(existing){if(b.update_existing&&ticket){const changed=await changeRegistrationTicket(client,event,existing,ticket);if(changed.error){await client.query('ROLLBACK');return res.status(409).json({error:changed.error});}if(changed.changed){await client.query('INSERT INTO event_activity(event_id,registration_id,actor_id,action) VALUES($1,$2,$3,$4)',[event.id,existing.id,req.auth.sub||null,'guest_ticket_updated']);updated++;continue;}}skipped++;continue;}
  if(status==='registered'){
   const used=await reservedEventSeats(client,event.id);
   if(event.capacity>0&&used>=event.capacity){await client.query('ROLLBACK');return res.status(409).json({error:'名額不足，整批未匯入。'});}
   if(ticket?.capacity>0){const count=await reservedEventSeats(client,event.id,ticket.id);if(count>=ticket.capacity){await client.query('ROLLBACK');return res.status(409).json({error:'票種名額不足，整批未匯入。'});}}
  }
  const regId=uid('r_');await client.query("INSERT INTO event_regs(id,event_id,user_id,status,amount_due,amount_paid,ticket_snapshot,note,entry_source) VALUES($1,$2,$3,$4,$5,0,$6,$7,'imported')",[regId,event.id,user.id,status,status==='invited'?0:price,ticket?JSON.stringify(ticket):null,'主辦人手動匯入']);
  await client.query('INSERT INTO event_activity(event_id,registration_id,actor_id,action) VALUES($1,$2,$3,$4)',[event.id,regId,req.auth.sub||null,'guest_imported:'+status]);added++;
 }
 await client.query('COMMIT');res.json({ok:true,added,updated,skipped,notice:'已匯入，未寄送任何通知。'});
 }catch(e){await client.query('ROLLBACK');if(e.code==='AMBIGUOUS_EMAIL')return res.status(409).json({error:e.message});throw e;}finally{client.release();}
}));

app.patch('/api/admin/events/:id/regs/:registrationId/ticket',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const client=await pool.connect();try{await client.query('BEGIN');
 const event=(await client.query('SELECT * FROM events WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0],reg=(await client.query('SELECT * FROM event_regs WHERE id=$1 AND event_id=$2 FOR UPDATE',[req.params.registrationId,req.params.id])).rows[0];
 if(!event||!reg){await client.query('ROLLBACK');return res.status(404).json({error:'找不到報名。'});}
 const ticket=event.tickets.find(item=>item.id===req.body?.ticket_id&&item.active);if(!ticket){await client.query('ROLLBACK');return res.status(400).json({error:'請選擇有效票種。'});}
 const changed=await changeRegistrationTicket(client,event,reg,ticket);if(changed.error){await client.query('ROLLBACK');return res.status(409).json({error:changed.error});}
 if(changed.changed)await client.query("INSERT INTO event_activity(event_id,registration_id,actor_id,action) VALUES($1,$2,$3,'guest_ticket_updated')",[event.id,reg.id,req.auth.sub||null]);
 await client.query('COMMIT');res.json({ok:true,changed:changed.changed,ticket_id:ticket.id,notice:'票種已更新；原票款與退款紀錄不變。'});
 }finally{await client.query('ROLLBACK');client.release();}
}));

app.get('/api/admin/events/:id/regs/:registrationId/history',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const history=(await q('SELECT snapshot,created_at FROM event_registration_history WHERE event_id=$1 AND registration_id=$2 ORDER BY id DESC',[req.params.id,req.params.registrationId])).rows;
 res.json({history});
}));
app.get('/api/admin/events/:id/regs/:registrationId/timeline',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const reg=(await q('SELECT id,created_at,status,ticket_version FROM event_regs WHERE event_id=$1 AND id=$2',[req.params.id,req.params.registrationId])).rows[0];
 if(!reg)return res.status(404).json({error:'找不到報名。'});
 const activity=(await q(`SELECT a.id,a.action,a.created_at,u.name AS actor_name FROM event_activity a LEFT JOIN users u ON u.id=a.actor_id WHERE a.event_id=$1 AND a.registration_id=$2 ORDER BY a.id DESC LIMIT 200`,[req.params.id,reg.id])).rows;
 const mail=(await q(`SELECT d.id,d.subject,d.state,m.created_at,d.provider_id,COALESCE((SELECT jsonb_agg(jsonb_build_object('type',x.event_type,'created_at',x.occurred_at) ORDER BY x.occurred_at) FROM event_delivery_events x WHERE x.provider_id=d.provider_id),'[]') AS events FROM event_deliveries d JOIN event_messages m ON m.id=d.message_id WHERE m.event_id=$1 AND m.registration_id=$2 ORDER BY m.created_at DESC LIMIT 100`,[req.params.id,reg.id])).rows;
 res.json({registration:reg,activity,mail});
}));
app.post('/api/admin/events/:id/regs/:registrationId/tickets',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const quantity=Number(req.body?.quantity);if(!Number.isInteger(quantity)||quantity<1||quantity>10)return res.status(400).json({error:'每次可贈送 1–10 張票。'});
 const client=await pool.connect();try{await client.query('BEGIN');
 const event=(await client.query('SELECT * FROM events WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
 const reg=(await client.query('SELECT r.*,u.name,u.email FROM event_regs r JOIN users u ON u.id=r.user_id WHERE r.id=$1 AND r.event_id=$2 FOR UPDATE OF r',[req.params.registrationId,req.params.id])).rows[0];
 if(!event||!reg)return res.status(404).json({error:'找不到報名。'});
 if(event.status!=='報名中'||reg.status!=='registered')return res.status(409).json({error:'僅可調整開放中活動的有效報名；請先處理審核與款項。'});
 const ticket=event.tickets.length?event.tickets.find(t=>t.id===req.body?.ticket_id&&t.active):null;
 if(event.tickets.length&&!ticket)return res.status(400).json({error:'請選擇有效票種。'});
 if(event.capacity>0&&(await reservedEventSeats(client,event.id))+quantity>event.capacity||ticket?.capacity>0&&(await reservedEventSeats(client,event.id,ticket.id))+quantity>ticket.capacity)return res.status(409).json({error:'剩餘名額不足。'});
 const order={id:uid('order_'),quantity,attendees:Array.from({length:quantity},()=>({name:reg.name,email:reg.email}))};
 await client.query("INSERT INTO event_ticket_orders(id,registration_id,ticket_version,ticket_snapshot,quantity,attendees,amount_due,status) VALUES($1,$2,$3,$4,$5,$6,0,'registered')",[order.id,reg.id,reg.ticket_version,JSON.stringify({...ticket,administrative_grant:true}),quantity,JSON.stringify(order.attendees)]);
 await activateAdditionalOrder(client,order,reg);
 await client.query("INSERT INTO event_activity(event_id,registration_id,actor_id,action) VALUES($1,$2,$3,'tickets_granted')",[event.id,reg.id,req.auth.sub||null]);
 await client.query('COMMIT');res.json({ok:true,order_id:order.id});
 }finally{await client.query('ROLLBACK');client.release();}
}));
app.delete('/api/admin/events/:id/regs/:registrationId/tickets/:attendeeId',auth,requireDb,eventEditor,wrap(async(req,res)=>{
 const client=await pool.connect();try{await client.query('BEGIN');
 await client.query('SELECT id FROM events WHERE id=$1 FOR UPDATE',[req.params.id]);
 const reg=(await client.query('SELECT * FROM event_regs WHERE id=$1 AND event_id=$2 FOR UPDATE',[req.params.registrationId,req.params.id])).rows[0];
 if(!reg)return res.status(404).json({error:'找不到報名。'});
 if(reg.status!=='registered'||reg.quantity<=1)return res.status(409).json({error:'僅可調整有效報名，且至少需保留一張票。'});
 const attendee=(await client.query('SELECT * FROM event_attendees WHERE id=$1 AND registration_id=$2 FOR UPDATE',[req.params.attendeeId,reg.id])).rows[0];
 if(!attendee)return res.status(404).json({error:'找不到票券。'});
 if(attendee.checked_in_at)return res.status(409).json({error:'已簽到的票券須先撤銷簽到。'});
 if(attendee.order_id){const order=(await client.query('SELECT * FROM event_ticket_orders WHERE id=$1 FOR UPDATE',[attendee.order_id])).rows[0];if(order.status!=='registered')return res.status(409).json({error:'此票款仍在處理中。'});await client.query('UPDATE event_ticket_orders SET quantity=quantity-1 WHERE id=$1',[order.id]);}
 await client.query('DELETE FROM event_attendees WHERE id=$1',[attendee.id]);
 await client.query('UPDATE event_regs SET quantity=quantity-1 WHERE id=$1',[reg.id]);
 await client.query("INSERT INTO event_activity(event_id,registration_id,actor_id,action) VALUES($1,$2,$3,'ticket_removed_without_refund')",[req.params.id,reg.id,req.auth.sub||null]);
 await client.query('COMMIT');res.json({ok:true,refunded:false});
 }finally{await client.query('ROLLBACK');client.release();}
}));

app.get('/api/admin/events/:id/regs', auth, requireDb, eventEditor, wrap(async (req, res) => {
  const rows = (await q(
    `SELECT r.id,u.name,u.email,u.phone,r.note,r.answers,r.capture_required,r.authorization_expires_at,r.ticket_snapshot,(SELECT COALESCE(SUM(f.amount),0)/100.0 FROM event_refunds f WHERE f.payment_intent=r.stripe_payment_intent_id AND f.status NOT IN ('failed','canceled')) AS amount_refunded,r.quantity,COALESCE((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('ticket_id',COALESCE(o.ticket_snapshot->>'id',r.ticket_snapshot->>'id'),'ticket_name',COALESCE(o.ticket_snapshot->>'name',r.ticket_snapshot->>'name'),'is_additional',a.order_id IS NOT NULL) ORDER BY a.ordinal,a.id) FROM event_attendees a LEFT JOIN event_ticket_orders o ON o.id=a.order_id WHERE a.registration_id=r.id),'[]') AS attendees,r.status,r.amount_due,r.amount_paid,
       to_char(r.created_at,'YYYY/MM/DD HH24:MI') AS created_at,
       to_char(r.paid_at,'YYYY/MM/DD HH24:MI') AS paid_at,
       to_char(r.checked_in_at,'YYYY/MM/DD HH24:MI') AS checked_in_at
     FROM event_regs r JOIN users u ON u.id=r.user_id
     WHERE r.event_id=$1 ORDER BY r.created_at`, [req.params.id])).rows;
  res.json({ regs: rows });
}));

app.get('/api/admin/events/:id/check-in',auth,requireDb,eventCheckinAccess,wrap(async(req,res)=>{
 const event=(await q('SELECT title,status,tickets,checkin_mode,checkin_mode_locked FROM events WHERE id=$1',[req.params.id])).rows[0];
 if(!event)return res.status(404).json({error:'找不到活動。'});
 const rows=(await q(`SELECT r.id AS registration_id,NULL::text AS attendee_id,u.name,u.email,u.phone,u.name AS buyer_name,u.email AS buyer_email,
   r.status,r.checked_in_at,r.created_at,r.amount_due,r.amount_paid,r.answers,r.coupon_snapshot->>'code' AS coupon_code,r.ticket_snapshot->>'id' AS ticket_id,r.ticket_snapshot->>'name' AS ticket_name
   FROM event_regs r JOIN users u ON u.id=r.user_id WHERE r.event_id=$1 AND r.quantity=1
   UNION ALL
   SELECT r.id,a.id,a.name,a.email,u.phone,u.name,u.email,r.status,a.checked_in_at,r.created_at,r.amount_due,r.amount_paid,r.answers,r.coupon_snapshot->>'code',
   COALESCE(o.ticket_snapshot->>'id',r.ticket_snapshot->>'id'),COALESCE(o.ticket_snapshot->>'name',r.ticket_snapshot->>'name')
   FROM event_regs r JOIN users u ON u.id=r.user_id JOIN event_attendees a ON a.registration_id=r.id LEFT JOIN event_ticket_orders o ON o.id=a.order_id
   WHERE r.event_id=$1 AND r.quantity>1 ORDER BY created_at DESC,name`,[req.params.id])).rows;
 const allowed=req.eventCheckin.ticket_ids;
 res.json({event:{title:event.title,status:event.status},mode:event.checkin_mode,locked:event.checkin_mode_locked,can_manage:req.eventCheckin.can_manage,
   management_url:req.eventCheckin.can_manage?(req.auth.role==='admin'?'/admin/events/':'/organizer/events/')+encodeURIComponent(req.params.id):null,
   tickets:(event.tickets||[]).map(ticket=>({id:ticket.id,name:ticket.name})),allowed_ticket_ids:allowed,
   guests:rows.map(row=>({...row,can_checkin:allowed.length===0||allowed.includes(row.ticket_id)}))});
}));

app.post('/api/admin/events/:id/check-in', auth, requireDb, eventCheckinAccess, wrap(async (req, res) => {
  const client=await pool.connect();try{await client.query('BEGIN');const q=(sql,args)=>client.query(sql,args);await q('SELECT id FROM events WHERE id=$1 FOR UPDATE',[req.params.id]);
  const b = req.body || {};
  let registrationId = String(b.registration_id || ''),ticketVersion,attendeeId=b.attendee_id;
  if (b.token) {
    const ticket = verifyAccessToken(String(b.token), EVENT_QR_SECRET);
    if (!ticket || ticket.plan !== 'event-ticket' || ticket.event !== req.params.id)
      return res.status(400).json({ error: '活動票券無效或已過期。' });
    registrationId = ticket.ent;ticketVersion=ticket.version??1;attendeeId=ticket.attendee;
  }
  if (!registrationId) return res.status(400).json({ error: '請掃描票券或選擇報名者。' });
  const reg = (await q(
    `SELECT r.id,r.status,r.quantity,r.ticket_version,r.checked_in_at,r.ticket_snapshot->>'id' AS ticket_id,u.name,u.email,e.status AS event_status
     FROM event_regs r JOIN users u ON u.id=r.user_id JOIN events e ON e.id=r.event_id
     WHERE r.id=$1 AND r.event_id=$2 FOR UPDATE OF r`,
    [registrationId, req.params.id]
  )).rows[0];
  if (!reg) return res.status(404).json({ error: '找不到這張活動票。' });
  if(reg.event_status==='已取消')return res.status(409).json({error:'活動已取消，票券無法使用。'});
  if (reg.status !== 'registered') return res.status(409).json({ error: '票券尚未成立、已取消或已退款。' });
  if(ticketVersion!==undefined&&ticketVersion!==reg.ticket_version)return res.status(409).json({error:'這是已失效的舊票券，請使用最新票券。'});
  if(reg.quantity>1&&!attendeeId)return res.status(400).json({error:'請選擇一位參加者或掃描個人票券。'});
  const attendee=(await q(`SELECT a.*,COALESCE(o.ticket_snapshot->>'id',r.ticket_snapshot->>'id') AS ticket_id FROM event_attendees a JOIN event_regs r ON r.id=a.registration_id LEFT JOIN event_ticket_orders o ON o.id=a.order_id WHERE a.registration_id=$1 AND ($2::text IS NULL OR a.id=$2) ORDER BY a.ordinal LIMIT 1`,[reg.id,attendeeId||null])).rows[0];
  if(attendeeId&&!attendee)return res.status(404).json({error:'找不到此參加者的票券。'});
  if(req.eventCheckin.ticket_ids.length&&!req.eventCheckin.ticket_ids.includes(attendee?.ticket_id||reg.ticket_id))return res.status(403).json({error:'此簽到入口不接受這個票種。'});
  if(attendee?.order_id&&!(await q("SELECT 1 FROM event_ticket_orders WHERE id=$1 AND status='registered'",[attendee.order_id])).rowCount)return res.status(409).json({error:'此加購票尚未成立或已退款。'});
  let duplicate;
  if(attendee){
    const changed=await q('UPDATE event_attendees SET checked_in_at=now(),checked_in_by=$2 WHERE id=$1 AND checked_in_at IS NULL RETURNING id',[attendee.id,req.auth.sub||'agent']);duplicate=!changed.rowCount;
    await q(`UPDATE event_regs SET checked_in_at=CASE WHEN NOT EXISTS(SELECT 1 FROM event_attendees WHERE registration_id=$1 AND checked_in_at IS NULL) THEN now() ELSE NULL END,checked_in_by=$2 WHERE id=$1`,[reg.id,req.auth.sub||'agent']);
  }else{const changed=await q('UPDATE event_regs SET checked_in_at=now(),checked_in_by=$2 WHERE id=$1 AND checked_in_at IS NULL RETURNING id',[reg.id,req.auth.sub||'agent']);duplicate=!changed.rowCount;}
  await q('INSERT INTO event_activity(event_id,registration_id,actor_id,action) VALUES($1,$2,$3,$4)',[req.params.id,reg.id,req.auth.sub||null,duplicate?'checkin_repeated':'checked_in']);await client.query('COMMIT');res.json({ok:true,duplicate,guest:{id:reg.id,attendee_id:attendee?.id,name:attendee?.name||reg.name,email:attendee?.email||reg.email}});
  }finally{await client.query('ROLLBACK');client.release();}
}));

app.delete('/api/admin/events/:id/check-in/:registrationId', auth, requireDb, eventCheckinAccess, wrap(async (req, res) => {
  const client=await pool.connect();try{await client.query('BEGIN');const q=(sql,args)=>client.query(sql,args);await q('SELECT id FROM events WHERE id=$1 FOR UPDATE',[req.params.id]);
  const reg=(await q("SELECT id,quantity,ticket_snapshot->>'id' AS ticket_id FROM event_regs WHERE id=$1 AND event_id=$2",[req.params.registrationId,req.params.id])).rows[0];
  if(!reg)return res.status(404).json({error:'找不到這張活動票。'});
  const attendeeId=req.query.attendee_id;
  if(reg.quantity>1&&!attendeeId)return res.status(400).json({error:'請選擇一位參加者。'});
  const attendee=attendeeId?(await q(`SELECT COALESCE(o.ticket_snapshot->>'id',r.ticket_snapshot->>'id') AS ticket_id FROM event_attendees a JOIN event_regs r ON r.id=a.registration_id LEFT JOIN event_ticket_orders o ON o.id=a.order_id WHERE a.registration_id=$1 AND a.id=$2`,[reg.id,attendeeId])).rows[0]:null;
  if(attendeeId&&!attendee)return res.status(404).json({error:'找不到此參加者。'});
  if(req.eventCheckin.ticket_ids.length&&!req.eventCheckin.ticket_ids.includes(attendee?.ticket_id||reg.ticket_id))return res.status(403).json({error:'此簽到入口不接受這個票種。'});
  const result=await q('UPDATE event_attendees SET checked_in_at=NULL,checked_in_by=NULL WHERE registration_id=$1 AND ($2::text IS NULL OR id=$2) RETURNING id',[reg.id,attendeeId||null]);
  if(attendeeId&&!result.rowCount)return res.status(404).json({error:'找不到此參加者。'});
  await q('UPDATE event_regs SET checked_in_at=NULL,checked_in_by=NULL WHERE id=$1',[reg.id]);await q('INSERT INTO event_activity(event_id,registration_id,actor_id,action) VALUES($1,$2,$3,$4)',[req.params.id,reg.id,req.auth.sub||null,'checkin_undone']);await client.query('COMMIT');res.json({ok:true});
  }finally{await client.query('ROLLBACK');client.release();}
}));

async function saveAdditionalRefund(client,order,refund,requestId=null){
 await client.query(`INSERT INTO event_refunds(id,registration_id,payment_intent,amount,status,request_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,request_id=COALESCE(event_refunds.request_id,EXCLUDED.request_id)`,[refund.id,order.registration_id,order.stripe_payment_intent_id,refund.amount,refund.status,requestId]);
 const totals=refundTotals(order.amount_paid*100,(await client.query('SELECT amount,status FROM event_refunds WHERE payment_intent=$1',[order.stripe_payment_intent_id])).rows);
 if(totals.status==='refunded'&&order.status!=='refunded'){
  await client.query('DELETE FROM event_attendees WHERE order_id=$1',[order.id]);
  await client.query('UPDATE event_regs SET quantity=quantity-$2 WHERE id=$1 AND ticket_version=$3',[order.registration_id,order.quantity,order.ticket_version]);
 }
 await client.query('UPDATE event_ticket_orders SET status=$2 WHERE id=$1',[order.id,totals.status]);return totals;
}
app.post('/api/admin/events/:id/orders/:orderId/refund',auth,adminOnly,requireDb,wrap(async(req,res)=>{
 if(!stripe)return res.status(503).json({error:'Stripe 尚未設定。'});
 const requestId=req.body?.request_id;if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId))return res.status(400).json({error:'請提供有效退款識別碼。'});
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT id FROM events WHERE id=$1 FOR UPDATE',[req.params.id]);
 const reg=(await client.query('SELECT r.* FROM event_regs r JOIN event_ticket_orders o ON o.registration_id=r.id WHERE o.id=$1 AND r.event_id=$2 FOR UPDATE OF r',[req.params.orderId,req.params.id])).rows[0];
 if(!reg)return res.status(404).json({error:'找不到加購訂單。'});
 const order=(await client.query('SELECT * FROM event_ticket_orders WHERE id=$1 FOR UPDATE',[req.params.orderId])).rows[0];
 if(!order.stripe_payment_intent_id||order.amount_paid<=0)return res.status(409).json({error:'這筆加購沒有可退票款。'});
 const key=order.stripe_payment_intent_id+':'+requestId,previous=(await client.query('SELECT * FROM event_refunds WHERE payment_intent=$1',[order.stripe_payment_intent_id])).rows,existing=previous.find(r=>r.request_id===key),amount=Number(req.body.amount_twd);
 if(existing){if(amount*100!==existing.amount)return res.status(409).json({error:'同一退款請求不可變更金額。'});await client.query('COMMIT');return res.json({ok:existing.status==='succeeded',already:true,status:existing.status,amount_twd:amount});}
 const totals=refundTotals(order.amount_paid*100,previous);if(!Number.isSafeInteger(amount)||amount<=0||amount*100>totals.remaining)return res.status(409).json({error:'退款金額超過剩餘可退額度或格式不正確。'});
 const refund=await stripe.refunds.create({payment_intent:order.stripe_payment_intent_id,amount:amount*100,metadata:{kind:'event-additional-tickets',order_id:order.id}},{idempotencyKey:'event-refund-'+key});
 const out=await saveAdditionalRefund(client,order,refund,key);await client.query('INSERT INTO event_activity(event_id,registration_id,actor_id,action) VALUES($1,$2,$3,$4)',[req.params.id,reg.id,req.auth.sub||null,'additional_refund_'+refund.status]);await client.query('COMMIT');res.json({ok:refund.status==='succeeded',status:refund.status,amount_twd:amount,remaining_twd:out.remaining/100});
 }finally{await client.query('ROLLBACK');client.release();}
}));

async function saveEventRefund(client,reg,refund,requestId=null){
 await client.query(`INSERT INTO event_refunds(id,registration_id,payment_intent,amount,status,request_id) VALUES($1,$2,$3,$4,$5,$6)
 ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,request_id=COALESCE(event_refunds.request_id,EXCLUDED.request_id)`,[refund.id,reg.id,reg.stripe_payment_intent_id,refund.amount,refund.status,requestId]);
 const rows=(await client.query('SELECT amount,status FROM event_refunds WHERE payment_intent=$1',[reg.stripe_payment_intent_id])).rows;
 const totals=refundTotals(reg.amount_paid*100,rows);
 if(totals.status==='registered'&&!['registered','refund_pending','refunded'].includes(reg.status))totals.status=reg.status;
 await client.query('UPDATE event_regs SET status=$2,refunded_at=now(),stripe_refund_id=$3,refund_status=$4 WHERE id=$1 AND stripe_payment_intent_id=$5',[reg.id,totals.status,refund.id,refund.status,reg.stripe_payment_intent_id]);
 return totals;
}
app.post('/api/admin/events/:id/regs/:registrationId/refund',auth,adminOnly,requireDb,wrap(async(req,res)=>{
 if(!stripe)return res.status(503).json({error:'Stripe 尚未設定。'});
 const requestId=req.body?.request_id;
 if(requestId!==undefined&&(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)))return res.status(400).json({error:'退款請求識別碼無效。'});
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT id FROM events WHERE id=$1 FOR UPDATE',[req.params.id]);
 const reg=(await client.query('SELECT * FROM event_regs WHERE id=$1 AND event_id=$2 FOR UPDATE',[req.params.registrationId,req.params.id])).rows[0];
 if(!reg)return res.status(404).json({error:'找不到報名紀錄。'});
 if(!reg.stripe_payment_intent_id||reg.amount_paid<=0||!['registered','refund_pending','refunded','pending_approval'].includes(reg.status))return res.status(409).json({error:'沒有可退款的已付款票券。'});
 if((await client.query("SELECT 1 FROM event_ticket_orders WHERE registration_id=$1 AND ticket_version=$2 AND status IN ('registered','pending_payment','refund_pending') AND amount_due>0 LIMIT 1",[reg.id,reg.ticket_version])).rowCount)return res.status(409).json({error:'請先處理加購票退款，再退回原始票款。'});
 const previous=(await client.query('SELECT * FROM event_refunds WHERE payment_intent=$1',[reg.stripe_payment_intent_id])).rows;
 const existing=requestId&&previous.find(r=>r.request_id===reg.stripe_payment_intent_id+':'+requestId);
 if(existing){if(req.body.amount_twd!==undefined&&Number(req.body.amount_twd)*100!==existing.amount)return res.status(409).json({error:'同一退款識別碼不可變更金額。'});await client.query('COMMIT');return res.json({ok:existing.status==='succeeded',already:true,refund_id:existing.id,status:existing.status,amount_twd:existing.amount/100});}
 const totals=refundTotals(reg.amount_paid*100,previous),amount=req.body?.amount_twd===undefined?totals.remaining:Number(req.body.amount_twd)*100;
 if(req.body.amount_twd!==undefined&&!Number.isSafeInteger(Number(req.body.amount_twd)))return res.status(400).json({error:'請輸入整數新台幣金額。'});
 if(!Number.isSafeInteger(amount)||amount<=0||amount>totals.remaining)return res.status(409).json({error:'退款金額須大於 0，且不可超過目前可退金額。',remaining_twd:totals.remaining/100});
 if(req.body.amount_twd!==undefined&&!requestId)return res.status(400).json({error:'部分退款需提供請求識別碼以防重複。'});
 const key=reg.stripe_payment_intent_id+':'+(requestId||`full-${previous.length}`);
 const refund=await stripe.refunds.create({payment_intent:reg.stripe_payment_intent_id,amount,metadata:{kind:'event-registration',registration_id:reg.id}},{idempotencyKey:'event-refund-'+key});
 const updated=await saveEventRefund(client,reg,refund,key);
 await client.query('INSERT INTO event_activity(event_id,registration_id,actor_id,action) VALUES($1,$2,$3,$4)',[req.params.id,reg.id,req.auth.sub||null,'refund_'+refund.status+':'+amount]);
 await client.query('COMMIT');res.json({ok:refund.status==='succeeded',refund_id:refund.id,status:refund.status,amount_twd:amount/100,remaining_twd:updated.remaining/100,ticket_status:updated.status});
 }finally{await client.query('ROLLBACK');client.release();}
}));

/* ---- 前台管理：空間介紹圖片上傳（menu 頁四樓照片） ---- */
const UPLOAD_SPACE_DIR = path.join(__dirname, 'uploads', 'space');
fs.mkdirSync(UPLOAD_SPACE_DIR, { recursive: true });
const spaceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_SPACE_DIR),
    filename: (req, file, cb) => cb(null, buildSafeSpaceFilename(file.originalname, file.mimetype)),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
  fileFilter: (_req, file, cb) => {
    const err = assertSpaceImageFile({ mimetype: file.mimetype, size: 0 });
    cb(err ? new Error(err) : null, !err);
  },
});
app.post('/api/admin/upload/space', auth, adminOnly, (req, res) => {
  spaceUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const sizeErr = assertSpaceImageFile({ mimetype: req.file.mimetype, size: req.file.size });
    if (sizeErr) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ error: sizeErr });
    }
    const head = fs.readFileSync(req.file.path).subarray(0, 12);
    if (sniffImageType(head) !== req.file.mimetype) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '檔案內容不是有效的圖片。' });
    }
    return res.json({ url: `/uploads/space/${req.file.filename}` });
  });
});

/* ---- 前台管理：網站內容（首頁公告等 key-value） ---- */
app.post('/api/admin/content', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const key = (req.body.key || '').trim();
  if (!PUBLIC_CONTENT_KEYS.includes(key)) return res.status(400).json({ error: '不允許的公開內容鍵值。' });
  await q(`INSERT INTO site_content (key,value,updated_at) VALUES ($1,$2,now())
           ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [key, String(req.body.value ?? '')]);
  res.json({ ok: true });
}));

/* ---- 前台管理：社群經營（IG/X 貼文規劃；不串接平台 API，僅供內容管理與排程） ---- */
const SOCIAL_PLATFORMS = ['ig', 'x'];
const SOCIAL_STATUS = ['draft', 'ready', 'scheduled', 'publishing', 'published', 'error', 'archived'];
// 排程時間一律以台北時間讀寫（與部署環境時區脫鉤）
const SEL_POST = `id,platform,post_type,status,title,caption,caption_en,caption_ja,hashtags,pages,images,
  to_char(scheduled_at AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD"T"HH24:MI') AS scheduled_at,
  to_char(published_at AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD"T"HH24:MI') AS published_at,
  external_url,series,phase,cta,audience,metrics,notes`;
// 'YYYY-MM-DDTHH:mm'（datetime-local）→ 以台北時間解讀為絕對時刻；空值回 null、無效回 NaN Date
function parseTaipei(s) {
  if (!s) return null;
  return new Date(String(s).trim().replace(' ', 'T').slice(0, 16) + ':00+08:00');
}

app.get('/api/admin/social/posts', auth, adminOnly, requireDb, wrap(async (_req, res) => {
  const rows = (await q(`SELECT ${SEL_POST} FROM social_posts ORDER BY scheduled_at NULLS LAST, id`)).rows;
  res.json({ posts: rows });
}));

app.post('/api/admin/social/posts', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const b = req.body || {};
  const title = (b.title || '').trim();
  if (!title) return res.status(400).json({ error: '請輸入貼文標題。' });
  const platform = SOCIAL_PLATFORMS.includes(b.platform) ? b.platform : 'ig';
  const status = SOCIAL_STATUS.includes(b.status) ? b.status : 'draft';
  // 類型依平台白名單校驗（IG↔X 切換時避免殘留不合法類型）
  const TYPE_BY_PLATFORM = { ig: ['carousel', 'image'], x: ['text', 'image'] };
  const postType = TYPE_BY_PLATFORM[platform].includes(b.post_type) ? b.post_type : TYPE_BY_PLATFORM[platform][0];
  const scheduledAt = parseTaipei(b.scheduled_at);
  if (scheduledAt && isNaN(scheduledAt.getTime())) return res.status(400).json({ error: '排程時間格式不正確。' });
  const publishedAt = parseTaipei(b.published_at);
  if (publishedAt && isNaN(publishedAt.getTime())) return res.status(400).json({ error: '發布時間格式不正確。' });
  const externalUrl = (b.external_url || '').trim();
  if (externalUrl && !/^https?:\/\//i.test(externalUrl)) return res.status(400).json({ error: '連結僅接受 http(s) 網址。' });
  const pages = platform === 'x' ? [] : (Array.isArray(b.pages) ? b.pages : []);   // X 貼文不留頁面殘骸
  const images = Array.isArray(b.images) ? b.images : [];
  const metrics = (b.metrics && typeof b.metrics === 'object' && !Array.isArray(b.metrics)) ? b.metrics : {};
  const vals = [
    title, platform, postType, status, String(b.caption ?? ''), String(b.caption_en ?? ''), String(b.caption_ja ?? ''), (b.hashtags || '').trim(),
    JSON.stringify(pages), JSON.stringify(images), scheduledAt, publishedAt,
    externalUrl, (b.series || '').trim(), (b.phase || '').trim(),
    (b.cta || '').trim(), (b.audience || '').trim(), JSON.stringify(metrics), String(b.notes ?? ''),
  ];
  if (b.id) {
    const r = await q(
      `UPDATE social_posts SET title=$2,platform=$3,post_type=$4,status=$5,caption=$6,caption_en=$7,caption_ja=$8,hashtags=$9,pages=$10,images=$11,
         scheduled_at=$12,published_at=$13,external_url=$14,series=$15,phase=$16,cta=$17,audience=$18,metrics=$19,notes=$20,updated_at=now()
       WHERE id=$1 RETURNING id`, [b.id, ...vals]);
    if (!r.rows[0]) return res.status(404).json({ error: '找不到貼文。' });
    return res.json({ ok: true, id: b.id });
  }
  const id = uid('sp_');
  await q(
    `INSERT INTO social_posts (id,title,platform,post_type,status,caption,caption_en,caption_ja,hashtags,pages,images,scheduled_at,published_at,external_url,series,phase,cta,audience,metrics,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`, [id, ...vals]);
  res.json({ ok: true, id });
}));

app.delete('/api/admin/social/posts/:id', auth, adminOnly, requireDb, wrap(async (req, res) => {
  await q(`DELETE FROM social_posts WHERE id=$1`, [req.params.id]);
  // 墓碑：刪除種子貼文要記下來，否則下次部署 seed 會復活
  if (/^sp_seed_/.test(req.params.id)) {
    const row = (await q(`SELECT value FROM site_content WHERE key='social_seed_deleted'`)).rows[0];
    let dead = [];
    try { dead = JSON.parse((row && row.value) || '[]'); } catch (_) { dead = []; }
    if (!Array.isArray(dead)) dead = [];
    if (!dead.includes(req.params.id)) dead.push(req.params.id);
    await q(`INSERT INTO site_content (key,value,updated_at) VALUES ('social_seed_deleted',$1,now())
             ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify(dead)]);
  }
  res.json({ ok: true });
}));

/* ---- 廣告總覽：投放紀錄（實際投放於 Meta 廣告管理員操作，此處記錄與追蹤） ---- */
const AD_LAYERS = ['awareness', 'retarget', 'action'];
const AD_STATUS = ['planned', 'running', 'done'];

app.get('/api/admin/ads/campaigns', auth, adminOnly, requireDb, wrap(async (_req, res) => {
  const rows = (await q(`SELECT id,post_id,layer,status,
      to_char(start_date,'YYYY-MM-DD') AS start_date, to_char(end_date,'YYYY-MM-DD') AS end_date,
      budget,spent,metrics,notes FROM ad_campaigns ORDER BY start_date NULLS LAST, created_at DESC`)).rows;
  res.json({ campaigns: rows });
}));

app.post('/api/admin/ads/campaigns', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const b = req.body || {};
  const layer = AD_LAYERS.includes(b.layer) ? b.layer : 'awareness';
  const status = AD_STATUS.includes(b.status) ? b.status : 'planned';
  const D = /^\d{4}-\d{2}-\d{2}$/;
  const start = String(b.start_date || '').trim() || null;
  const end = String(b.end_date || '').trim() || null;
  if ((start && !D.test(start)) || (end && !D.test(end))) return res.status(400).json({ error: '日期格式須為 YYYY-MM-DD。' });
  if (start && end && end < start) return res.status(400).json({ error: '結束日不可早於開始日。' });
  const budget = Math.max(0, Math.round(Number(b.budget) || 0));
  const spent = Math.max(0, Math.round(Number(b.spent) || 0));
  const postId = String(b.post_id || '').trim();
  if (postId && !(await q(`SELECT 1 FROM social_posts WHERE id=$1`, [postId])).rows[0]) return res.status(400).json({ error: '關聯貼文不存在。' });
  const metrics = (b.metrics && typeof b.metrics === 'object' && !Array.isArray(b.metrics)) ? b.metrics : {};
  const vals = [postId, layer, status, start, end, budget, spent, JSON.stringify(metrics), String(b.notes ?? '')];
  if (b.id) {
    const r = await q(`UPDATE ad_campaigns SET post_id=$2,layer=$3,status=$4,start_date=$5,end_date=$6,budget=$7,spent=$8,metrics=$9,notes=$10,updated_at=now()
       WHERE id=$1 RETURNING id`, [b.id, ...vals]);
    if (!r.rows[0]) return res.status(404).json({ error: '找不到投放紀錄。' });
    return res.json({ ok: true, id: b.id });
  }
  const id = uid('adc_');
  await q(`INSERT INTO ad_campaigns (id,post_id,layer,status,start_date,end_date,budget,spent,metrics,notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, ...vals]);
  res.json({ ok: true, id });
}));

app.delete('/api/admin/ads/campaigns/:id', auth, adminOnly, requireDb, wrap(async (req, res) => {
  await q(`DELETE FROM ad_campaigns WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

/* ---- 前台管理：社群貼文圖片上傳 ---- */
const UPLOAD_SOCIAL_DIR = path.join(__dirname, 'uploads', 'social');
fs.mkdirSync(UPLOAD_SOCIAL_DIR, { recursive: true });
const socialUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_SOCIAL_DIR),
    filename: (req, file, cb) => cb(null, buildSafeSocialFilename(file.originalname, file.mimetype)),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
  fileFilter: (_req, file, cb) => {
    const err = assertSocialImageFile({ mimetype: file.mimetype, size: 0 });
    cb(err ? new Error(err) : null, !err);
  },
});
app.post('/api/admin/upload/social', auth, adminOnly, (req, res) => {
  socialUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const sizeErr = assertSocialImageFile({ mimetype: req.file.mimetype, size: req.file.size });
    if (sizeErr) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ error: sizeErr });
    }
    // 用戶端 MIME 可偽造：讀檔頭驗 magic bytes，內容與宣告不符即拒收
    let sniffed = null;
    try {
      const fd = fs.openSync(req.file.path, 'r');
      const head = Buffer.alloc(12);
      fs.readSync(fd, head, 0, 12, 0);
      fs.closeSync(fd);
      sniffed = sniffImageType(head);
    } catch (_) {}
    if (sniffed !== req.file.mimetype) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ error: '檔案內容不是有效的圖片。' });
    }
    return res.json({ url: `/uploads/social/${req.file.filename}` });
  });
});

/* ---- IG 自動發佈（spec：docs/superpowers/specs/2026-08-17-ig-autopublish-design.md） ---- */
const igPublisher = require('./lib/ig-publisher');
const igDeps = () => ({ q, port: PORT, siteBase: SITE_BASE, uploadDir: UPLOAD_SOCIAL_DIR });

// 手動即發單篇（測試／補發用）；不看 scheduled_at，但仍走禁用字＋render 守門
app.post('/api/admin/social/:id/publish-ig', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const post = (await q(`SELECT * FROM social_posts WHERE id=$1`, [req.params.id])).rows[0];
  if (!post) return res.status(404).json({ error: '找不到貼文。' });
  if (post.platform !== 'ig') return res.status(400).json({ error: '僅 IG 貼文可發佈。' });
  if (post.status === 'published') return res.status(400).json({ error: '此貼文已發佈過。' });
  try {
    const r = await igPublisher.publishPost(post, igDeps());
    await q(`UPDATE social_posts SET status='published', published_at=now(), external_url=$2, images=$3, updated_at=now() WHERE id=$1`,
      [post.id, r.externalUrl, JSON.stringify(r.images)]);
    res.json({ ok: true, url: r.externalUrl, images: r.images });
  } catch (e) {
    await q(`UPDATE social_posts SET status='error', notes=left(concat('[ig-publish] ', $2::text, E'\n', notes), 2000), updated_at=now() WHERE id=$1`,
      [post.id, e.message]);
    res.status(502).json({ error: e.message });
  }
}));

// AI 補產：手動觸發（測試／立即補檔）；正常由每週日 cron 執行
const igComposer = require('./lib/ig-composer');
app.post('/api/admin/ig/compose', auth, adminOnly, requireDb, wrap(async (_req, res) => {
  try { res.json({ ok: true, made: await igComposer.composeWeek(igDeps()) }); }
  catch (e) { res.status(502).json({ error: e.message }); }
}));

// X 貼文 AI 起草：主題 → 中日雙語推文草稿（沿用 IG 補產的品牌鐵律與禁用字守門；需 ANTHROPIC_API_KEY）
app.post('/api/admin/x/compose', auth, adminOnly, wrap(async (req, res) => {
  const topic = String((req.body || {}).topic || '').trim();
  if (!topic) return res.status(400).json({ error: '請輸入主題或想講的事。' });
  const t = new Date(Date.now() + 8 * 3600e3), p2 = n => String(n).padStart(2, '0');
  const today = `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
  const { BRAND, milestone } = igComposer;
  const system = `你是「${BRAND.name}」的 X(Twitter) 文案主筆。位置：${BRAND.address}（${BRAND.mrt}）。
營業：${BRAND.hours}。空間：${BRAND.floors}。時程：${BRAND.nodes}。
今天是 ${today}。目前階段：${milestone(today)}。

鐵律：
1. 內容必須對應目前階段的真實狀態，絕不超前或虛構進度。
2. 嚴禁任何住宿類表述（住宿、床位、過夜、hotel、宿泊…）；床位一律稱「席位」；二樓口徑＝「24 小時看書休憩」。
3. 品牌英文名一律「emoji」、帳號一律「@emoji0701」；嚴禁出現「yanwenzi」任何形式。
4. 不用 AI 味用語（賦能、沉浸式、一站式、無縫、極致、快來、別錯過、讓我們一起…）。表情符號最多 1 個，可以不用。
5. 語氣：內斂、誠實、短句、像人寫的。不油、不喊口號。不提任何價格數字。
6. 中文版與日文版各自道地改寫，不逐字翻譯；各不超過 X 字數上限（中日字元以 2 計，約 140 字）。

只輸出一個 JSON 物件，不要 code fence、不要任何其他文字。`;
  const user = `任務：依主題寫一則 X 推文。主題：${topic}
輸出 JSON 格式：
{"title":"後台管理用標題，15 字內，格式：X｜主題","caption":"中文推文","caption_ja":"日文版推文"}`;
  try {
    const out = await igComposer.askClaude(system, user);
    const draft = { title: String(out.title || '').trim(), caption: String(out.caption || '').trim(), caption_ja: String(out.caption_ja || '').trim() };
    if (!draft.caption) return res.status(502).json({ error: 'AI 回應缺 caption，請再試一次。' });
    const banned = igPublisher.checkBanned({ caption: [draft.title, draft.caption, draft.caption_ja].join('\n') });
    if (banned.length) return res.status(502).json({ error: `AI 產文含禁用字（${banned.join('、')}），請再試一次。` });
    res.json({ ok: true, draft });
  } catch (e) { res.status(502).json({ error: e.message }); }
}));

// 素材庫：KK 丟素材到專案資料夾 → 上傳（既有 /api/admin/upload/social）→ 在此登記；補產器優先取用
app.post('/api/admin/ig/assets', auth, adminOnly, requireDb, wrap(async (req, res) => {
  const url = String((req.body || {}).url || '').trim();
  const note = String((req.body || {}).note || '').trim();
  // MinIO 物件儲存 URL 或站內上傳路徑皆可；https 禁引號空白（photo 會內插 style 屬性）
  if (!/^(\/uploads\/social\/|https:\/\/[^'"\s]+$)/.test(url)) return res.status(400).json({ error: '素材 url 須為 /uploads/social/ 路徑或 https URL。' });
  if (!note) return res.status(400).json({ error: '請附素材說明（AI 產文要呼應照片內容）。' });
  const id = uid('iga_');
  await q(`INSERT INTO ig_assets (id,url,note) VALUES ($1,$2,$3)`, [id, url, note]);
  res.json({ ok: true, id });
}));

// 素材檔案直傳：multipart file＋note → MinIO assets/（未設 S3 則落 uploads/social）→ 登記 ig_assets
const assetUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, parts: 4 } });
app.post('/api/admin/ig/assets/upload', auth, adminOnly, requireDb, (req, res) => {
  assetUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    try {
      const f = req.file;
      if (!f) return res.status(400).json({ error: 'file required' });
      const sizeErr = assertSocialImageFile({ mimetype: f.mimetype, size: f.size });
      if (sizeErr) return res.status(400).json({ error: sizeErr });
      if (sniffImageType(f.buffer.subarray(0, 12)) !== f.mimetype) return res.status(400).json({ error: '檔案內容不是有效的圖片。' });
      const note = String((req.body || {}).note || '').trim();
      if (!note) return res.status(400).json({ error: '請附素材說明（AI 產文要呼應照片內容）。' });
      const filename = buildSafeSocialFilename(f.originalname, f.mimetype);
      let url = await igPublisher.uploadAsset(f.buffer, filename, f.mimetype);
      if (!url) { fs.writeFileSync(path.join(UPLOAD_SOCIAL_DIR, filename), f.buffer); url = `/uploads/social/${filename}`; }
      const id = uid('iga_');
      await q(`INSERT INTO ig_assets (id,url,note) VALUES ($1,$2,$3)`, [id, url, note]);
      res.json({ ok: true, id, url });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

// 菜單品項圖片：MinIO assets/menu-*（未設 S3 則落 uploads/menu）。回 { url }
const UPLOAD_MENU_DIR = path.join(__dirname, 'uploads', 'menu');
fs.mkdirSync(UPLOAD_MENU_DIR, { recursive: true });
const menuUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 } });
app.post('/api/admin/upload/menu', auth, adminOnly, (req, res) => {
  menuUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    try {
      const f = req.file;
      if (!f) return res.status(400).json({ error: 'file required' });
      const sizeErr = assertSocialImageFile({ mimetype: f.mimetype, size: f.size });
      if (sizeErr) return res.status(400).json({ error: sizeErr });
      if (sniffImageType(f.buffer.subarray(0, 12)) !== f.mimetype) return res.status(400).json({ error: '檔案內容不是有效的圖片。' });
      const filename = 'menu-' + buildSafeSocialFilename(f.originalname, f.mimetype);
      let url = await igPublisher.uploadAsset(f.buffer, filename, f.mimetype);
      if (!url) { fs.writeFileSync(path.join(UPLOAD_MENU_DIR, filename), f.buffer); url = `/uploads/menu/${filename}`; }
      res.json({ url });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

app.get('/api/admin/ig/assets', auth, adminOnly, requireDb, wrap(async (_req, res) => {
  res.json({ assets: (await q(`SELECT * FROM ig_assets ORDER BY created_at DESC LIMIT 100`)).rows });
}));

app.get('/api/admin/ig/status', auth, adminOnly, requireDb, wrap(async (_req, res) => {
  const token = await igPublisher.getToken(igDeps());
  const nextUp = (await q(`SELECT id,title,to_char(scheduled_at AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD HH24:MI') AS at
    FROM social_posts WHERE platform='ig' AND status='scheduled' AND scheduled_at IS NOT NULL ORDER BY scheduled_at LIMIT 5`)).rows;
  const errors = (await q(`SELECT id,title FROM social_posts WHERE platform='ig' AND status='error' ORDER BY updated_at DESC LIMIT 5`)).rows;
  // 過期逾 24h 的排程不會自動補發（見 ig-publisher.publishDue），列出供後台改期
  const stale = (await q(`SELECT id,title,to_char(scheduled_at AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD HH24:MI') AS at
    FROM social_posts WHERE platform='ig' AND status='scheduled' AND scheduled_at <= now() - interval '24 hours' ORDER BY scheduled_at`)).rows;
  const assetStats = (await q(`SELECT count(*)::int AS total, count(*) FILTER (WHERE used_by='')::int AS unused FROM ig_assets`)).rows[0];
  const recentPublished = (await q(`SELECT id,title,external_url,to_char(published_at AT TIME ZONE 'Asia/Taipei','MM-DD HH24:MI') AS at
    FROM social_posts WHERE platform='ig' AND status='published' ORDER BY published_at DESC NULLS LAST LIMIT 5`)).rows;
  res.json({
    autopublish: process.env.IG_AUTOPUBLISH === '1',
    igUserId: process.env.IG_USER_ID || 'me',
    hasToken: !!token,
    hasAiKey: !!process.env.ANTHROPIC_API_KEY,
    s3: !!(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY),
    assets: assetStats,
    banned: igPublisher.bannedList(),
    next: nextUp, errors, stale, recentPublished,
  });
}));

/* ---- 活動前台：公開列表、私人連結、報名付款與票券 ---- */
app.get('/api/events', requireDb, wrap(async (req, res) => {
  const events = (await q(
    `SELECT ${SEL_EVENT},
       (SELECT COALESCE(SUM(r.quantity),0)::int FROM event_regs r WHERE r.event_id=e.id AND r.status='registered') AS reg_count
     FROM events e WHERE status IN ('預告','報名中') AND visibility='public'
     ORDER BY starts_at ASC NULLS LAST`
  )).rows;
  res.json({ events: events.map(e => localizeEvent(e, req.query.lang)) });
}));

app.post('/api/events/checkout/verify', auth, requireDb, wrap(async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe 尚未設定。' });
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  const id = String(req.body?.session_id || '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: '付款識別碼格式不正確。' });
  const session = await stripe.checkout.sessions.retrieve(id);
  if (!['event-registration','event-additional-tickets'].includes(session.metadata?.kind) || session.metadata.user_id !== req.auth.sub)
    return res.status(403).json({ error: '付款資料不屬於目前帳號。' });
  await fulfillEventCheckout(session);
  await fulfillAdditionalCheckout(session);
  const reg = (await q(`SELECT id,status,event_id FROM event_regs WHERE id=$1`, [session.metadata.registration_id])).rows[0];
  const additional=session.metadata.kind==='event-additional-tickets'?(await q('SELECT status FROM event_ticket_orders WHERE id=$1 AND registration_id=$2',[session.metadata.order_id,reg?.id])).rows[0]:null;
  res.json({ paid: session.payment_status==='paid'&&reg?.status === 'registered'&&(session.metadata.kind!=='event-additional-tickets'||additional?.status==='registered'), registration_id: reg?.id, event_id: reg?.event_id, status:reg?.status, order_status:additional?.status });
}));

app.get('/api/events/:id/orders',auth,requireDb,wrap(async(req,res)=>{
 const orders=(await q(`SELECT o.id,o.quantity,o.amount_due,o.amount_paid,o.status,o.ticket_snapshot-'unlock_code' AS ticket_snapshot FROM event_ticket_orders o JOIN event_regs r ON r.id=o.registration_id AND r.ticket_version=o.ticket_version WHERE r.event_id=$1 AND r.user_id=$2 ORDER BY o.created_at`,[req.params.id,req.auth.sub])).rows;res.json({orders});
}));
app.delete('/api/events/:id/orders/:orderId',auth,requireDb,wrap(async(req,res)=>{
 const client=await pool.connect();try{await client.query('BEGIN');
 await client.query('SELECT id FROM events WHERE id=$1 FOR UPDATE',[req.params.id]);
 const reg=(await client.query('SELECT * FROM event_regs WHERE event_id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.auth.sub])).rows[0];
 const order=reg&&(await client.query('SELECT * FROM event_ticket_orders WHERE id=$1 AND registration_id=$2 AND ticket_version=$3 FOR UPDATE',[req.params.orderId,reg.id,reg.ticket_version])).rows[0];
 if(!order)return res.status(404).json({error:'找不到此加購訂單。'});
 if(order.status==='cancelled')return res.json({ok:true});
 if(reg.status!=='registered'||order.status!=='registered'||order.amount_due>0)return res.status(409).json({error:'僅可自行取消已成立的免費加購，付費票請聯絡言文字退款。'});
 if((await client.query('SELECT 1 FROM event_attendees WHERE order_id=$1 AND checked_in_at IS NOT NULL',[order.id])).rowCount)return res.status(409).json({error:'已使用的票券不可取消。'});
 await client.query('DELETE FROM event_attendees WHERE order_id=$1',[order.id]);
 await client.query('UPDATE event_regs SET quantity=quantity-$2 WHERE id=$1',[reg.id,order.quantity]);
 await client.query("UPDATE event_ticket_orders SET status='cancelled' WHERE id=$1",[order.id]);
 await client.query("INSERT INTO event_activity(event_id,registration_id,actor_id,action) VALUES($1,$2,$3,'additional_cancelled')",[req.params.id,reg.id,req.auth.sub]);
 await client.query('COMMIT');res.json({ok:true});
 }finally{await client.query('ROLLBACK');client.release();}
}));
app.post('/api/events/:id/additional-tickets',auth,requireDb,wrap(async(req,res)=>{
 const quantity=Number(req.body?.quantity||1);if(!Number.isInteger(quantity)||quantity<1||quantity>10||req.body?.coupon_code)return res.status(400).json({error:'每次加購 1–10 張票，加購不適用優惠碼。'});
 const client=await pool.connect();try{await client.query('BEGIN');const event=(await client.query('SELECT * FROM events WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
 const reg=(await client.query('SELECT r.*,u.name,u.email FROM event_regs r JOIN users u ON u.id=r.user_id WHERE event_id=$1 AND user_id=$2 FOR UPDATE OF r',[req.params.id,req.auth.sub])).rows[0];
 if(!event||event.status!=='報名中'||!reg||reg.status!=='registered')return res.status(409).json({error:'僅有效報名的購買者可加購開放中的活動。'});
 const settings=event.registration_settings||{};
 if(settings.group_registration===false||settings.requires_approval||settings.opens_at&&Date.parse(settings.opens_at)>Date.now()||settings.closes_at&&Date.parse(settings.closes_at)<=Date.now())return res.status(409).json({error:'目前不開放加購，審核制活動請聯絡主辦人。'});
 const pending=(await client.query("SELECT * FROM event_ticket_orders WHERE registration_id=$1 AND ticket_version=$2 AND status='pending_payment' ORDER BY created_at DESC LIMIT 1",[reg.id,reg.ticket_version])).rows[0];
 if(pending){if(!stripe)return res.status(503).json({error:'須先核對上一筆加購付款。'});const session=await stripe.checkout.sessions.retrieve(pending.stripe_session_id);
  if(session.payment_status==='paid'){await client.query('COMMIT');await fulfillAdditionalCheckout(session);return res.json({ok:true,already:true});}
  if(session.status==='open'&&session.expires_at>Date.now()/1000){await client.query('COMMIT');return res.json({url:session.url,pending:true,session_id:session.id,order_id:pending.id});}
  if(session.status!=='expired')return res.status(409).json({error:'上一筆付款仍在處理中。'});
  await client.query("UPDATE event_ticket_orders SET status='expired' WHERE id=$1",[pending.id]);
 }
 let ticket=null,price;try{ticket=event.tickets.length?selectTicket(event.tickets,req.body?.ticket_id,Date.now(),req.body?.unlock_code):null;if(ticket?.requires_approval)throw Error('需審核票种不可自行加購，請聯絡主辦人。');price=(ticket?ticketPrice(ticket,req.body?.amount_twd):event.price_twd)*quantity;}catch(e){return res.status(400).json({error:e.message});}
 if(event.capacity>0&&(await reservedEventSeats(client,event.id))+quantity>event.capacity)return res.status(409).json({error:'剩餘名額不足。'});
 if(ticket?.capacity>0&&(await reservedEventSeats(client,event.id,ticket.id))+quantity>ticket.capacity)return res.status(409).json({error:'此票種剩餘名額不足。'});
 if(price>0&&(!stripe||!STRIPE_WEBHOOK_SECRET))return res.status(503).json({error:'付款服務尚未設定。'});
 const id=uid('order_'),attendees=Array.from({length:quantity},()=>({name:reg.name,email:reg.email}));
 await client.query('INSERT INTO event_ticket_orders(id,registration_id,ticket_version,ticket_snapshot,quantity,attendees,amount_due,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,reg.id,reg.ticket_version,ticket?JSON.stringify(ticket):null,quantity,JSON.stringify(attendees),price,price?'pending_payment':'registered']);
 if(!price){await activateAdditionalOrder(client,{id,quantity,attendees},reg);await client.query('COMMIT');return res.json({ok:true});}
 const lang=['en','ja'].includes(req.body?.lang)?'/'+req.body.lang:'',url=SITE_BASE+lang+'/events/'+encodeURIComponent(event.slug);
 const session=await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],customer_email:reg.email,expires_at:Math.floor(Date.now()/1000)+1800,
 line_items:[{price_data:{currency:'twd',unit_amount:price*100,product_data:{name:event.title+' · 加購 '+quantity+' 張票'}},quantity:1}],success_url:url+'?paid=1&s={CHECKOUT_SESSION_ID}',cancel_url:url+'?canceled=1',metadata:{kind:'event-additional-tickets',order_id:id,registration_id:reg.id,event_id:event.id,user_id:req.auth.sub}});
 await client.query('UPDATE event_ticket_orders SET stripe_session_id=$2,expires_at=to_timestamp($3) WHERE id=$1',[id,session.id,session.expires_at]);await client.query('COMMIT');res.json({url:session.url,session_id:session.id,order_id:id});
 }finally{await client.query('ROLLBACK');client.release();}
}));

app.get('/api/events/:id/guests',requireDb,wrap(async(req,res)=>{
 const event=(await q("SELECT id FROM events WHERE id=$1 AND status<>'草稿' AND event_details->>'show_guest_list'='true'",[req.params.id])).rows[0];
 if(!event)return res.status(404).json({error:'此活動未公開來賓名單。'});
 const after=req.query.after;if(after!==undefined&&(typeof after!=='string'||after.length>500))return res.status(400).json({error:'名單分頁格式錯誤。'});
 const rows=(await q("SELECT DISTINCT a.name FROM event_attendees a JOIN event_regs r ON r.id=a.registration_id WHERE r.event_id=$1 AND r.status='registered' AND a.show_name=true AND ($2::text IS NULL OR a.name>$2) ORDER BY a.name LIMIT 101",[event.id,after??null])).rows;
 const guests=rows.slice(0,100);res.json({guests,next:rows.length>100?guests[99].name:null});
}));
app.patch('/api/events/:id/profile',auth,requireDb,wrap(async(req,res)=>{
 if(typeof req.body?.visible!=='boolean')return res.status(400).json({error:'公開設定格式錯誤。'});
 const result=await q(`UPDATE event_attendees a SET show_name=$3 FROM event_regs r WHERE a.registration_id=r.id AND r.event_id=$1 AND r.status='registered' AND a.email=lower($2) RETURNING a.id`,[req.params.id,req.auth.email||'',req.body.visible]);
 if(!result.rowCount)return res.status(404).json({error:'找不到自己的有效票券。'});res.json({ok:true});
}));

app.get('/api/events/:id/receipt',auth,requireDb,wrap(async(req,res)=>{
 if(!stripe)return res.status(503).json({error:'收據服務尚未開通。'});
 const reg=req.query.order?(await q('SELECT o.stripe_payment_intent_id FROM event_ticket_orders o JOIN event_regs r ON r.id=o.registration_id WHERE r.event_id=$1 AND r.user_id=$2 AND o.id=$3 AND o.amount_paid>0',[req.params.id,req.auth.sub,req.query.order])).rows[0]:(await q('SELECT stripe_payment_intent_id FROM event_regs WHERE event_id=$1 AND user_id=$2 AND amount_paid>0',[req.params.id,req.auth.sub])).rows[0];
 if(!reg?.stripe_payment_intent_id)return res.status(404).json({error:'找不到付款收據。'});
 const intent=await stripe.paymentIntents.retrieve(reg.stripe_payment_intent_id,{expand:['latest_charge']}),url=intent.latest_charge?.receipt_url;
 if(!url||!url.startsWith('https://'))return res.status(404).json({error:'收據尚未產生，請稍後再試。'});
 res.set('Cache-Control','no-store');res.json({url});
}));

app.get('/api/events/:id/ticket',auth,requireDb,wrap(async(req,res)=>{
 if(!EVENT_QR_SECRET)return res.status(503).json({error:'活動票券 QR 尚未開通。'});
 if(!req.auth.sub)return res.status(403).json({error:'請以會員身分登入。'});
 const rows=(await q(`SELECT r.id,r.user_id,r.ticket_version,r.checked_in_at AS booking_checked_in,e.id AS event_id,e.starts_at,e.ends_at,
 a.id AS attendee_id,a.name,a.email,a.show_name,a.checked_in_at FROM event_regs r JOIN events e ON e.id=r.event_id LEFT JOIN event_attendees a ON a.registration_id=r.id LEFT JOIN event_ticket_orders o ON o.id=a.order_id
 WHERE (a.order_id IS NULL OR o.status='registered') AND e.id=$1 AND r.status='registered' AND e.status<>'已取消' AND (r.user_id=$2 OR a.email=lower($3)) ORDER BY r.created_at,a.ordinal`,[req.params.id,req.auth.sub,req.auth.email||''])).rows;
 if(!rows.length)return res.status(404).json({error:'找不到有效活動票券。'});
 const tickets=rows.map(a=>{const end=a.ends_at||a.starts_at,ttlSec=end?Math.max(3600,Math.floor((+new Date(end)-Date.now())/1000)+7*86400):366*86400;
 return {name:a.name,email:a.email,attendee_id:a.attendee_id,can_edit:a.user_id===req.auth.sub,can_share:a.email===String(req.auth.email||'').toLowerCase(),show_name:a.show_name,checked_in_at:a.checked_in_at||a.booking_checked_in,
 token:signAccessToken({sub:req.auth.sub,ent:a.id,plan:'event-ticket',event:a.event_id,version:a.ticket_version,...(a.attendee_id?{attendee:a.attendee_id}:{})},EVENT_QR_SECRET,{ttlSec})};});
 res.json({token:tickets[0].token,tickets,registration_id:rows[0].id,checked_in_at:rows[0].booking_checked_in});
}));

// Changing the attendee id revokes that person's old QR without invalidating the other tickets.
app.patch('/api/events/:id/attendees/:attendeeId',auth,requireDb,wrap(async(req,res)=>{
 const name=String(req.body?.name||'').trim(),email=String(req.body?.email||'').trim().toLowerCase();
 if(!name||name.length>120||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:'請提供有效姓名與 Email。'});
 const client=await pool.connect();try{await client.query('BEGIN');
 const event=(await client.query('SELECT status,ends_at FROM events WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
 if(!event||event.status!=='報名中'||event.ends_at&&+new Date(event.ends_at)<=Date.now())return res.status(409).json({error:'活動已關閉，無法修改參加者。'});
 const attendee=(await client.query(`SELECT a.*,r.status FROM event_attendees a JOIN event_regs r ON r.id=a.registration_id WHERE a.id=$1 AND r.event_id=$2 AND r.user_id=$3 FOR UPDATE OF r`,[req.params.attendeeId,req.params.id,req.auth.sub])).rows[0];
 if(!attendee)return res.status(404).json({error:'找不到可修改的票券。'});
 if(attendee.status!=='registered'||attendee.checked_in_at)return res.status(409).json({error:'僅可修改尚未簽到的有效票券。'});
 const id=uid('ea_');await client.query('UPDATE event_attendees SET id=$2,name=$3,email=$4,show_name=false WHERE id=$1',[attendee.id,id,name,email]);
 await client.query('INSERT INTO event_activity(event_id,registration_id,actor_id,action) VALUES($1,$2,$3,$4)',[req.params.id,attendee.registration_id,req.auth.sub,'attendee_updated']);
 await client.query('COMMIT');res.json({ok:true,attendee_id:id});
 }finally{await client.query('ROLLBACK');client.release();}
}));

app.post('/api/events/:id/feedback',auth,requireDb,wrap(async(req,res)=>{
 const rating=req.body?.rating,comment=req.body?.comment||'';
 if(!Number.isInteger(rating)||rating<1||rating>5||typeof comment!=='string'||comment.length>5000)return res.status(400).json({error:'請提供 1–5 分評分，文字最多 5000 字。'});
 const result=await q(`INSERT INTO event_feedback(event_id,user_id,rating,comment)
 SELECT DISTINCT e.id,$2::text,$3::int,$4::text FROM events e JOIN event_regs r ON r.event_id=e.id AND (r.user_id=$2 OR EXISTS(SELECT 1 FROM event_attendees a WHERE a.registration_id=r.id AND a.email=lower($5)))
 WHERE e.id=$1 AND r.status='registered' AND e.status<>'已取消' AND COALESCE(e.ends_at,e.starts_at)<=now()
 ON CONFLICT(event_id,user_id) DO UPDATE SET rating=$3,comment=$4,updated_at=now() RETURNING event_id`,[req.params.id,req.auth.sub,rating,comment.trim(),req.auth.email||'']);
 if(!result.rowCount)return res.status(403).json({error:'活動結束後，有效報名者才可提交回饋。'});res.json({ok:true});
}));

app.post('/api/events/:id/quote',requireDb,wrap(async(req,res)=>{
 const event=(await q("SELECT * FROM events WHERE id=$1 AND status='報名中'",[req.params.id])).rows[0];if(!event)return res.status(404).json({error:'找不到開放報名的活動。'});
 try{const quantity=Number(req.body?.quantity??1);if(!Number.isInteger(quantity)||quantity<1||quantity>10)throw new Error('每筆可購買 1–10 張票');const ticket=event.tickets.length?selectTicket(event.tickets,req.body?.ticket_id,Date.now(),req.body?.unlock_code):null,price=(ticket?ticketPrice(ticket,req.body?.amount_twd):event.price_twd)*quantity;
 const result=discountPrice(event.coupons,req.body?.coupon_code,price);res.json({price_twd:result.price,discount_twd:result.coupon?.discount_twd||0,notice:'此報價不保留名額，實際報名仍會檢查優惠碼使用上限。'});}catch(e){res.status(400).json({error:e.message});}
}));

app.post('/api/events/:id/ticket-options',requireDb,wrap(async(req,res)=>{
 const event=(await q("SELECT tickets FROM events WHERE id=$1 AND status<>'草稿'",[req.params.id])).rows[0];
 if(!event)return res.status(404).json({error:'找不到活動。'});
 res.json({tickets:publicTickets(event.tickets,req.body?.unlock_code)});
}));

app.get(['/api/events/:slug/calendar.ics','/api/events/:slug/calendar/google'],requireDb,wrap(async(req,res)=>{
 const event=(await q("SELECT * FROM events WHERE slug=$1 AND status<>'草稿'",[req.params.slug])).rows[0];
 if(!event)return res.status(404).json({error:'找不到活動。'});
 const localized=localizeEvent(event,['en','ja'].includes(req.query.lang)?req.query.lang:'zh');
 if(req.path.endsWith('/google')){try{return res.redirect(googleCalendarUrl(localized,SITE_BASE));}catch(e){return res.status(409).json({error:e.message});}}
 let calendar;try{calendar=eventCalendar(localized,SITE_BASE);}catch(e){return res.status(409).json({error:e.message});}
 res.set({'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="event.ics"'}).send(calendar);
}));
app.post('/api/events/:id/view',requireDb,wrap(async(req,res)=>{
 const event=(await q("SELECT id FROM events WHERE id=$1 AND status IN ('預告','報名中')",[req.params.id])).rows[0];
 if(!event)return res.status(404).json({error:'找不到活動。'});
 const visitor=req.body?.visitor_id;if(visitor!==undefined&&(typeof visitor!=='string'||!/^[a-f0-9-]{36}$/.test(visitor)))return res.status(400).json({error:'瀏覽識別碼格式錯誤。'});
 const source=String(req.body?.source||'direct').slice(0,120),campaign=String(req.body?.campaign||'').slice(0,120);
 await q(`INSERT INTO event_views(event_id,day,source,campaign,views) VALUES($1,(now() AT TIME ZONE 'Asia/Taipei')::date,$2,$3,1)
 ON CONFLICT(event_id,day,source,campaign) DO UPDATE SET views=event_views.views+1`,[event.id,source,campaign]);
 if(visitor)await q(`INSERT INTO event_visitors(event_id,visitor_hash,day) VALUES($1,$2,(now() AT TIME ZONE 'Asia/Taipei')::date) ON CONFLICT(event_id,visitor_hash,day) DO UPDATE SET last_seen=now()`,[event.id,crypto.createHash('sha256').update(event.id+':'+visitor).digest('hex')]);
 res.json({ok:true});
}));

app.get('/api/events/:slug', optionalAuth, requireDb, wrap(async (req, res) => {
  const userId = req.auth?.sub || null;
  const ev = (await q(
    `SELECT ${SEL_EVENT},
       (SELECT COALESCE(SUM(r.quantity),0)::int FROM event_regs r WHERE r.event_id=e.id AND r.status='registered') AS reg_count,
       mine.id AS registration_id,mine.status AS registration_status,mine.quantity,mine.amount_due,mine.amount_paid,mine.checkout_expires_at,mine.ticket_snapshot,mine.checked_in_at,mine.capture_required,mine.authorization_expires_at,
       (mine.status='registered') AS registered
     FROM events e
     LEFT JOIN event_regs mine ON mine.event_id=e.id AND mine.user_id=$2
     WHERE e.slug=$1 AND (e.status<>'草稿' OR $3='admin')`,
    [req.params.slug, userId, req.auth?.role || null]
  )).rows[0];
  if (!ev) return res.status(404).json({ error: '找不到活動。' });
  if(!ev.registered&&req.auth?.email){const recipient=(await q(`SELECT 1 FROM event_attendees a JOIN event_regs r ON r.id=a.registration_id LEFT JOIN event_ticket_orders o ON o.id=a.order_id WHERE r.event_id=$1 AND r.status='registered' AND a.email=lower($2) AND (a.order_id IS NULL OR o.status='registered') LIMIT 1`,[ev.id,req.auth.email])).rowCount;
   if(recipient){ev.registered=true;ev.recipient_only=true;}}
  res.json({ event: localizeEvent(ev, req.query.lang) });
}));

app.post('/api/events/:id/register', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入後報名。' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // ponytail: 每場活動用單列鎖防超賣；流量真的需要時再拆 ticket inventory／reservation table。
    const ev = (await client.query(`SELECT * FROM events WHERE id=$1 FOR UPDATE`, [req.params.id])).rows[0];
    if (!ev) { await client.query('ROLLBACK'); return res.status(404).json({ error: '找不到活動。' }); }
    if (ev.status !== '報名中') { await client.query('ROLLBACK'); return res.status(400).json({ error: '此活動目前不開放報名。' }); }
    const mine = (await client.query(
      `SELECT * FROM event_regs WHERE event_id=$1 AND user_id=$2 FOR UPDATE`,
      [ev.id, req.auth.sub]
    )).rows[0];
    if(mine?.status==='capture_pending'){await client.query('ROLLBACK');return res.status(409).json({error:'信用卡請款處理中，請稍後再試。'});}
    if(mine?.status==='refund_pending'){await client.query('ROLLBACK');return res.status(409).json({error:'退款處理中，請待退款結果確認後再報名。'});}
    if(['pending_approval','waitlisted','declined'].includes(mine?.status)){
      await client.query('COMMIT');return res.json({ok:true,already:true,status:mine.status});
    }
    let waitlisted=false;
    if (mine?.status === 'registered') {
      await client.query('COMMIT');
      return res.json({ ok: true, already: true });
    }
    if(mine?.status==='pending_payment'&&mine.stripe_session_id){
      if(!stripe){await client.query('ROLLBACK');return res.status(503).json({error:'付款服務暫時無法核對，請稍後再試。'});}
      const session=await stripe.checkout.sessions.retrieve(mine.stripe_session_id);
      if(session.payment_status==='paid'){await client.query('COMMIT');await fulfillEventCheckout(session);return res.json({ok:true,already:true});}
      if(session.status==='open'&&session.expires_at>Date.now()/1000){await client.query('COMMIT');return res.json({ok:true,pending:true,url:session.url,session_id:session.id});}
      if(session.status==='complete'&&session.metadata?.capture_required==='true'){await client.query('COMMIT');await fulfillEventCheckout(session);return res.json({ok:true,status:'pending_approval'});}
      if(session.status==='complete'){await client.query('ROLLBACK');return res.status(409).json({error:'付款仍在核對中，請稍後重新整理。'});}
    }

    const approved=mine?.status==='approved'&&mine.checkout_expires_at>new Date();
    if(mine?.status==='approved'&&!approved){await client.query("UPDATE event_regs SET status='pending_approval',checkout_expires_at=NULL WHERE id=$1",[mine.id]);await client.query('COMMIT');return res.status(409).json({error:'付款保留時間已到期，已轉回待審核，請聯絡主辦人。'});}
    const quantity=approved?mine.quantity:Number(req.body?.quantity??1);
    if(!Number.isInteger(quantity)||quantity<1||quantity>10){await client.query('ROLLBACK');return res.status(400).json({error:'每筆報名可購買 1–10 張票。'});}
    if(!approved&&quantity>1&&ev.registration_settings?.group_registration===false){await client.query('ROLLBACK');return res.status(400).json({error:'此活動僅開放單人報名。'});}
    let attendees;
    if(!approved){
      const buyer=(await client.query('SELECT name,email FROM users WHERE id=$1',[req.auth.sub])).rows[0];
      attendees=req.body?.attendees??(quantity===1?[buyer]:null);
      if(!Array.isArray(attendees)||attendees.length!==quantity||attendees.some(a=>!a||typeof a.name!=='string'||!a.name.trim()||a.name.length>120||typeof a.email!=='string'||a.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email))){await client.query('ROLLBACK');return res.status(400).json({error:'請填寫每位參加者的姓名與 Email，票數需與參加者人數一致。'});}
      attendees=attendees.map(a=>({name:a.name.trim(),email:a.email.trim().toLowerCase()}));
    }
    let selectedTicket=approved?mine.ticket_snapshot:null;
    if(!approved&&ev.tickets?.length){try{selectedTicket=selectTicket(ev.tickets,req.body?.ticket_id,Date.now(),req.body?.unlock_code);}catch(e){await client.query('ROLLBACK');return res.status(400).json({error:e.message});}}
    let price;try{price=approved?Number(mine.amount_due):(selectedTicket?ticketPrice(selectedTicket,req.body?.amount_twd):Number(ev.price_twd))*quantity;}catch(e){await client.query('ROLLBACK');return res.status(400).json({error:e.message});}
    let couponSnapshot=approved?mine.coupon_snapshot:null;
    if(!approved){try{const discounted=discountPrice(ev.coupons||[],req.body?.coupon_code,price);price=discounted.price;couponSnapshot=discounted.coupon;}catch(e){await client.query('ROLLBACK');return res.status(400).json({error:e.message});}
      if(couponSnapshot?.max_uses>0){
        const usage=(await client.query(`SELECT ((SELECT COUNT(*) FROM event_regs WHERE event_id=$1 AND coupon_snapshot->>'code'=$2 AND (status IN ('registered','refunded','refund_pending','pending_approval','waitlisted') OR (status IN ('approved','pending_payment') AND checkout_expires_at>now())))+(SELECT COUNT(*) FROM event_registration_history WHERE event_id=$1 AND snapshot->'coupon_snapshot'->>'code'=$2 AND snapshot->>'status' IN ('registered','refunded','refund_pending')))::int AS n`,[ev.id,couponSnapshot.code])).rows[0].n;
        if(usage>=couponSnapshot.max_uses){await client.query('ROLLBACK');return res.status(409).json({error:'優惠碼使用次數已達上限。'});}
      }
    }
    const settings=ev.registration_settings || {};
    const requiresApproval=settings.requires_approval||selectedTicket?.requires_approval;
    let captureRequired=!approved&&price>0&&requiresApproval&&settings.payment_approval==='authorize';
    if((settings.opens_at&&Date.now()<Date.parse(settings.opens_at))||(settings.closes_at&&Date.now()>=Date.parse(settings.closes_at))){
      await client.query('ROLLBACK');return res.status(409).json({error:'目前不在報名期間。'});
    }

    if (Number(ev.capacity) > 0) {
      const n=await reservedEventSeats(client,ev.id,null,req.auth.sub);
      if (n+quantity > Number(ev.capacity) && (!settings.waitlist||approved)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: '此活動名額已滿。' });
      }
      waitlisted=n+quantity>Number(ev.capacity);
    }

    let answerSnapshot;try{answerSnapshot=approved?mine.answers:eventQuestions.answers(settings.questions||[],req.body?.answers||{});}catch(e){await client.query('ROLLBACK');return res.status(400).json({error:e.message});}
    const currentTicket=selectedTicket?(ev.tickets||[]).find(t=>t.id===selectedTicket.id):null;
    if(approved&&selectedTicket&&!currentTicket?.active){await client.query('ROLLBACK');return res.status(409).json({error:'此票種已停售，請聯絡主辦人。'});}
    if(currentTicket?.capacity>0){
      const used=await reservedEventSeats(client,ev.id,selectedTicket.id,req.auth.sub);
      if(used+quantity>currentTicket.capacity){if(settings.waitlist&&!approved)waitlisted=true;else{await client.query('ROLLBACK');return res.status(409).json({error:'這個票種已售完。'});}}
    }
    if(mine&&['cancelled','refunded','expired','pending_payment'].includes(mine.status)){
      await client.query('INSERT INTO event_registration_history(event_id,registration_id,user_id,snapshot) VALUES($1,$2,$3,$4)',[ev.id,mine.id,req.auth.sub,JSON.stringify({...mine,attendees:(await client.query('SELECT * FROM event_attendees WHERE registration_id=$1 ORDER BY ordinal',[mine.id])).rows})]);
      await client.query('UPDATE event_regs SET ticket_version=ticket_version+1,created_at=now(),stripe_session_id=NULL,stripe_payment_intent_id=NULL,stripe_refund_id=NULL,refund_status=NULL,paid_at=NULL,refunded_at=NULL,checkout_expires_at=NULL WHERE id=$1',[mine.id]);
    }
    const regId = mine?.id || uid('r_');
    const note = String(req.body?.note || '').trim();
    async function saveDetails(){
      await client.query("UPDATE event_regs SET answers=$2,ticket_snapshot=$3,coupon_snapshot=$4,quantity=$5,confirmation_queued=false,language=$6,attribution=$7,capture_required=$8,authorization_expires_at=NULL,entry_source='self_service' WHERE id=$1",[regId,JSON.stringify(answerSnapshot),selectedTicket?JSON.stringify(selectedTicket):null,couponSnapshot?JSON.stringify(couponSnapshot):null,quantity,['en','ja'].includes(req.body?.lang)?req.body.lang:'zh',JSON.stringify(approved?mine.attribution:normalizeAttribution(req.body?.attribution)),captureRequired]);
      if(!approved){await client.query('DELETE FROM event_attendees WHERE registration_id=$1',[regId]);for(const [i,a] of attendees.entries())await client.query('INSERT INTO event_attendees(id,registration_id,name,email,ordinal) VALUES($1,$2,$3,$4,$5)',[uid('att_'),regId,a.name,a.email,i]);}
    }

    if(waitlisted)captureRequired=false;
    if(!approved&&(waitlisted||requiresApproval&&!captureRequired||mine?.status==='approved')){
      const status=waitlisted?'waitlisted':'pending_approval';
      await client.query(`INSERT INTO event_regs(id,event_id,user_id,note,status,amount_due,amount_paid) VALUES($1,$2,$3,$4,$5,$6,0)
        ON CONFLICT(event_id,user_id) DO UPDATE SET note=EXCLUDED.note,status=EXCLUDED.status,amount_due=EXCLUDED.amount_due,amount_paid=0,checked_in_at=NULL,checked_in_by=NULL`,[regId,ev.id,req.auth.sub,note,status,price]);
      await client.query('INSERT INTO event_activity(event_id,registration_id,actor_id,action) VALUES($1,$2,$3,$4)',[ev.id,regId,req.auth.sub,status]);
      await saveDetails();
      await client.query('COMMIT');return res.json({ok:true,registration_id:regId,status});
    }
    if (price === 0) {
      await client.query(
        `INSERT INTO event_regs (id,event_id,user_id,note,status,amount_due,amount_paid)
         VALUES ($1,$2,$3,$4,'registered',0,0)
         ON CONFLICT (event_id,user_id) DO UPDATE SET note=EXCLUDED.note,status='registered',
           amount_due=0,amount_paid=0,stripe_session_id=NULL,stripe_payment_intent_id=NULL,
           checkout_expires_at=NULL,paid_at=NULL,refunded_at=NULL,stripe_refund_id=NULL,refund_status=NULL,checked_in_at=NULL,checked_in_by=NULL`,
        [regId, ev.id, req.auth.sub, note]
      );
      await saveDetails();
      await client.query('COMMIT');
      notifyRegistration(req.auth.sub, ev.id);
      return res.json({ ok: true, registration_id: regId });
    }

    if (price > 0 && (!stripe || !STRIPE_WEBHOOK_SECRET)) {
      await client.query('ROLLBACK');
      return res.status(503).json({ error: '付費活動尚未完成 Stripe webhook 設定。' });
    }
    await client.query(
      `INSERT INTO event_regs (id,event_id,user_id,note,status,amount_due,amount_paid)
       VALUES ($1,$2,$3,$4,'pending_payment',$5,0)
       ON CONFLICT (event_id,user_id) DO UPDATE SET note=EXCLUDED.note,status='pending_payment',
         amount_due=EXCLUDED.amount_due,amount_paid=0,stripe_session_id=NULL,stripe_payment_intent_id=NULL,
         checkout_expires_at=NULL,paid_at=NULL,refunded_at=NULL,stripe_refund_id=NULL,refund_status=NULL,checked_in_at=NULL,checked_in_by=NULL`,
      [regId, ev.id, req.auth.sub, note, price]
    );
    const user = (await client.query(`SELECT email FROM users WHERE id=$1`, [req.auth.sub])).rows[0];
    const langPrefix = ['en', 'ja'].includes(req.body?.lang) ? `/${req.body.lang}` : '';
    const detailUrl = `${SITE_BASE}${langPrefix}/events/${encodeURIComponent(ev.slug)}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: user?.email || undefined,
      client_reference_id: regId,
      line_items: [{
        price_data: {
          currency: 'twd',
          product_data: { name: ev.title+(selectedTicket?' · '+selectedTicket.name:'')+(quantity>1?' · '+quantity+' 張票':''), description: ev.description || undefined },
          unit_amount: price * 100,
        },
        quantity: 1,
      }],
      success_url: `${detailUrl}?paid=1&s={CHECKOUT_SESSION_ID}`,
      cancel_url: `${detailUrl}?canceled=1`,
      metadata: { kind: 'event-registration', registration_id: regId, event_id: ev.id, user_id: req.auth.sub,capture_required:String(captureRequired) },
      ...(captureRequired?{custom_text:{submit:{message:'信用卡先預授權，主辦人核准後才請款。Card authorization only; charged after approval.'}},payment_intent_data:{capture_method:'manual',metadata:{kind:'event-registration',registration_id:regId,event_id:ev.id,user_id:req.auth.sub}}}:{}),
    });
    await client.query(
      `UPDATE event_regs SET stripe_session_id=$2,checkout_expires_at=to_timestamp($3) WHERE id=$1`,
      [regId, session.id, session.expires_at]
    );
    await saveDetails();
      await client.query('COMMIT');
    res.json({ ok: true, pending: true, registration_id: regId, url: session.url, session_id:session.id });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.delete('/api/events/:id/register', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  const client=await pool.connect();try{await client.query('BEGIN');const q=(sql,args)=>client.query(sql,args);await q('SELECT id FROM events WHERE id=$1 FOR UPDATE',[req.params.id]);
  const reg = (await q(`SELECT * FROM event_regs WHERE event_id=$1 AND user_id=$2 FOR UPDATE`, [req.params.id, req.auth.sub])).rows[0];
  if (!reg) return res.json({ ok: true, already: true });
  if((await q("SELECT 1 FROM event_ticket_orders WHERE registration_id=$1 AND ticket_version=$2 AND (status IN ('pending_payment','refund_pending') OR (status='registered' AND amount_paid>0)) LIMIT 1",[reg.id,reg.ticket_version])).rowCount)return res.status(409).json({error:'尚有加購付款或付費票，請先由言文字處理加購退款。'});
  if (reg.status==='declined') return res.status(409).json({error:'此報名未獲核准，請聯絡主辦人。'});
  if (reg.checked_in_at||(await q('SELECT 1 FROM event_attendees WHERE registration_id=$1 AND checked_in_at IS NOT NULL LIMIT 1',[reg.id])).rowCount) return res.status(409).json({ error: '已有參加者完成簽到，請聯絡主辦單位處理。' });
  if (Number(reg.amount_paid) > 0 || (Number(reg.amount_due) > 0 && !['pending_approval','waitlisted','approved'].includes(reg.status)))
    return res.status(409).json({ error: '付費票請聯絡主辦單位辦理退款。' });
  if(reg.capture_required&&reg.stripe_payment_intent_id){
    if(!stripe)return res.status(503).json({error:'須連線 Stripe 解除預授權，請稍後再試。'});
    let intent=await stripe.paymentIntents.retrieve(reg.stripe_payment_intent_id);if(intent.status==='requires_capture')intent=await stripe.paymentIntents.cancel(intent.id);
    if(intent.status!=='canceled')return res.status(409).json({error:'款項已請款或處理中，請聯絡言文字辦理退款。'});
  }
  await q(`UPDATE event_regs SET status='cancelled' WHERE id=$1`, [reg.id]);
  await client.query('COMMIT');res.json({ ok: true });
  }finally{await client.query('ROLLBACK');client.release();}
}));

/* ---- Stripe Checkout（開放任何人購買，無需登入；Stripe 為訂單真相來源） ---- */
// 已付款與仍可付款的 checkout 皆占名額；Stripe 為真相來源。
const FOUNDING_SALE_START_TS = Math.floor(Date.parse('2026-07-11T00:00:00+08:00') / 1000);
async function reservedFoundingCount() {
  const ids = new Set();
  // 先 open 再 complete，掃描中完成付款的 session 只會重複，不能漏計。
  for (const status of ['open', 'complete']) {
    for await (const s of stripe.checkout.sessions.list({ status, limit: 100, created: { gte: FOUNDING_SALE_START_TS } })) {
      if (s.metadata?.plan === 'founding-member' &&
          (s.payment_status === 'paid' || (status === 'open' && s.expires_at > Date.now() / 1000))) ids.add(s.id);
      if (ids.size >= MAX_PARTICIPANTS) return ids.size;
    }
  }
  return ids.size;
}
const todayTaipei = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

app.post('/api/checkout', requireDb, wrap(async (req, res) => {
  if (!stripe) return res.status(503).json({ error: '購買功能尚未開通（未設定 Stripe）。' });
  if (todayTaipei() > SALE_END) return res.status(410).json({ error: `創始會員已於 ${SALE_END} 截止販售。`, code: 'SALE_ENDED' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 所有 instance 共用 Postgres 鎖，盤點＋建立 checkout 保留名額不可併行。
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('founding-checkout'))`);
    if (await reservedFoundingCount() >= MAX_PARTICIPANTS) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `創始名額已滿或正在結帳中（限量 ${MAX_PARTICIPANTS} 名），請稍後再試。`, code: 'SOLD_OUT' });
    }
    // 不信任 Origin header（避免 open redirect）；導向目標一律用伺服器端常數，本地測試以 PUBLIC_ORIGIN 覆蓋
    const origin = SITE_BASE;
    // 結帳完成後導回購買者所在語系頁（僅允許 en/ja 前綴，其餘回中文 /fellow）
    const langPrefix = ['en', 'ja'].includes(req.body && req.body.lang) ? '/' + req.body.lang : '';
    // 會籍：自開幕日起算 18 個月（起訖明確帶入商品說明與 metadata）
    const end = addMonthsISO(addMonthsISO(MEMBERSHIP_START, MAX_TERM), 0);
    const endMinus1 = (() => { const d = new Date(end + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      payment_method_types: ['card'], // 同上：明示 card，避免帳戶未啟用 TWD 預設付款方式時回 500
      line_items: [{
        price_data: {
          currency: 'twd',
          product_data: {
            name: '言文字創始會員',
            description: `18 個月會籍（${MEMBERSHIP_START} 起算至 ${endMinus1}）＋贈點 20,000（一年效期）・限量 100 名`,
          },
          unit_amount: PRICE * 100, // TWD 為 2 位小數幣別：NT$35,000 → 3,500,000
        },
        quantity: 1,
      }],
      success_url: `${origin}${langPrefix}/fellow?paid=1&s={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${langPrefix}/fellow?canceled=1`,
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
      metadata: { plan: 'founding-member', term_months: String(MAX_TERM), start_date: MEMBERSHIP_START, end_date: endMinus1 },
    });
    await client.query('COMMIT');
    res.json({ url: session.url });
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}));

// 付款成功頁驗證：前端只憑 ?paid=1 不足採信，須以 session id 向 Stripe 確認已付款
app.get('/api/checkout/verify', wrap(async (req, res) => {
  if (!stripe) return res.status(503).json({ paid: false });
  const id = String(req.query.s || '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ paid: false });
  const s = await stripe.checkout.sessions.retrieve(id);
  res.json({ paid: s.payment_status === 'paid' && !!s.metadata && s.metadata.plan === 'founding-member' });
}));

/* ---- 會員資料、一般會籍線上購買、場地檔期、後台操作紀錄 ---- */
app.post('/api/me/profile', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  const name = String(req.body?.name ?? '').trim();
  const phone = String(req.body?.phone ?? '').trim();
  if (!name || name.length > 80 || name.includes('\0')) return res.status(400).json({ error: '請填寫姓名（80 字以內）。' });
  if (phone.length > 40 || phone.includes('\0')) return res.status(400).json({ error: '電話格式不正確（40 字以內）。' });
  const row = (await q(`UPDATE users SET name=$2, phone=$3 WHERE id=$1 RETURNING id,name,email,phone`, [req.auth.sub, name, phone])).rows[0];
  if (!row) return res.status(404).json({ error: '找不到帳號。' });
  res.json({ ok: true, me: row });
}));

app.post('/api/me/plans/checkout', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  if (!stripe) return res.status(503).json({ error: '購買功能尚未開通（未設定 Stripe）。' });
  const plan = String(req.body?.plan || '');
  if (!FLOOR_PLANS.includes(plan)) return res.status(400).json({ error: '未知方案。' });
  const user = (await q(`SELECT email FROM users WHERE id=$1`, [req.auth.sub])).rows[0];
  const lang = String(req.body?.lang || 'zh').toLowerCase();
  const memberBase = lang === 'en' ? '/en/member' : lang === 'ja' ? '/ja/member' : '/member';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: user?.email || undefined,
    line_items: [{
      price_data: {
        currency: 'twd',
        product_data: { name: `言文字會籍 ${PLAN_LABEL[plan]}`, description: MEMBERSHIP_GIFT_POINTS[plan] ? `含贈點 ${MEMBERSHIP_GIFT_POINTS[plan]} 點（一年效期）` : '單日方案，首次進場啟用' },
        unit_amount: PLAN_PRICE_TWD[plan] * 100,
      },
      quantity: 1,
    }],
    success_url: `${SITE_BASE}${memberBase}?plan_paid=1&s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_BASE}${memberBase}?plan_canceled=1`,
    metadata: { kind: 'plan', plan, user_id: req.auth.sub },
  });
  res.json({ url: session.url });
}));

app.post('/api/me/plans/verify', auth, requireDb, wrap(async (req, res) => {
  if (!req.auth.sub) return res.status(403).json({ error: '請以會員身分登入。' });
  if (!stripe) return res.status(503).json({ error: 'Stripe 未設定。' });
  const sessionId = String(req.body?.session_id || '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return res.status(400).json({ error: 'session 不正確。' });
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.kind !== 'plan' || session.metadata.user_id !== req.auth.sub) return res.status(404).json({ error: '找不到這筆會籍付款。' });
  if (session.payment_status !== 'paid') return res.status(402).json({ error: '尚未付款。' });
  const result = await fulfillPlanCheckout(session);
  res.json({ ok: true, already: result.already === true, plan: session.metadata.plan });
}));

// 公開：未來 90 天已排定的場地時段（僅時段與樓層，不含申請人資料）與公開活動
app.get('/api/venue/schedule', requireDb, wrap(async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  const bookings = (await q(
    `SELECT venue,kind,starts_at,ends_at FROM event_applications
     WHERE status='approved' AND ends_at > now() - interval '1 day' AND starts_at < now() + interval '90 days'
     ORDER BY starts_at`)).rows;
  const events = (await q(
    `SELECT title,slug,location,starts_at,ends_at FROM events
     WHERE status='報名中' AND visibility='public' AND starts_at IS NOT NULL
       AND starts_at > now() - interval '1 day' AND starts_at < now() + interval '90 days'
     ORDER BY starts_at`)).rows;
  res.json({ bookings, events });
}));

app.get('/api/admin/logs', auth, adminOnly, requireDb, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const logs = (await q(`SELECT id,actor,method,path,summary,status,created_at FROM admin_logs ORDER BY created_at DESC LIMIT $1`, [limit])).rows;
  res.json({ logs });
}));

/* ---- 前端靜態檔（官網掛 /、fellow 一頁式掛 /fellow；伺服器源碼不外露） ---- */
const PUB = path.join(__dirname, 'public');
// 各計畫一頁式：fellow／startup × 中/en/ja。
// 精確路由先於 static，讓無斜線路徑（/partner、/en/startup…）直接回 200 不轉址；
// 資產（styles/app/kk）皆共用 /fellow/*，各語系計畫頁以絕對路徑引用。
// HTML 經 layout 組裝 header／footer（SEO／GEO：回應已含完整 markup）。
// 活動場地已併入活動頁：舊 /partner 三語 301 至 /events#venue
for (const pre of ['', '/en', '/ja']) app.get(pre + '/partner', (req, res) => res.redirect(301, pre + '/events#venue'));
const PROGRAMS = ['fellow', 'startup'];
for (const prog of PROGRAMS) {
  for (const pre of ['', 'en', 'ja']) {
    const parts = pre ? [pre, prog] : [prog];
    const route = '/' + parts.join('/');
    const file = path.join(PUB, ...parts, 'index.html');
    app.get(route, (req, res) => sendPage(res, file, req.path));
  }
}
// CIS 品牌識別頁（中/en/ja）；無斜線路徑直接 200
for (const pre of ['', 'en', 'ja']) {
  const parts = pre ? [pre, 'cis'] : ['cis'];
  const route = '/' + parts.join('/');
  const file = path.join(PUB, ...parts, 'index.html');
  app.get(route, (req, res) => sendPage(res, file, req.path));
}
// 活動列表與詳情共用單一前端；詳情由 API 依 slug 讀取。私人連結不會出現在列表。
const EVENTS_PAGE = path.join(PUB, 'events.html');
app.get(['/event-application', '/en/event-application', '/ja/event-application'], (req, res) =>
  sendPage(res, path.join(PUB, 'event-application.html'), req.path));
async function featuredRow() {
  if (!dbReady) return null;
  return (await q(`SELECT ${SEL_EVENT} FROM events e WHERE e.id=$1`, [FEATURED_ID])).rows[0] || null;
}
app.get(['/halloween-2026','/en/halloween-2026','/ja/halloween-2026'], wrap(async (req,res) => {
  res.set('Cache-Control','no-store');
  if (!dbReady) return res.status(503).send('活動暫時無法載入 / Event temporarily unavailable / ただいま準備中');
  const event = await featuredRow();
  if (!event || event.status === '草稿') return res.status(404).send('活動尚未公開 / Event not published / 公開前のイベントです');
  if(event.visibility !== 'public') res.set('X-Robots-Tag','noindex');
  const pre = /^\/(en|ja)(?:\/|$)/.exec(req.path)?.[1];
  sendPage(res,path.join(PUB,pre || '', 'halloween-2026.html'),req.path,html => eventPage(html,event,req.path));
}));
app.get(['/halloween-2026.html','/en/halloween-2026.html','/ja/halloween-2026.html'], (req,res) => res.redirect(301,req.path.replace(/\.html$/,'')));
app.get(['/', '/en', '/ja', '/en/', '/ja/', '/events', '/en/events', '/ja/events'], wrap(async (req,res) => {
  const event = await featuredRow();
  const pre = /^\/(en|ja)(?:\/|$)/.exec(req.path)?.[1];
  const file = req.path.endsWith('/events') ? EVENTS_PAGE : path.join(PUB,pre || '', 'index.html');
  res.set('Cache-Control','no-store');
  sendPage(res,file,req.path,html => featuredEvent(html,event,req.path));
}));
app.get(['/embed/events/:slug','/en/embed/events/:slug','/ja/embed/events/:slug'],requireDb,wrap(async(req,res)=>{
 const event=(await q("SELECT embed_origins FROM events WHERE slug=$1 AND status<>'草稿'",[req.params.slug])).rows[0];
 if(!event||!event.embed_origins?.length)return res.status(404).send('此活動尚未開放嵌入 / Event embedding is not enabled / 埋め込みは無効です');
 const origins=embedOrigins(event.embed_origins,/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(SITE_BASE));
 res.removeHeader('X-Frame-Options');res.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex','Content-Security-Policy':"object-src 'none'; base-uri 'self'; frame-ancestors 'self' "+origins.join(' ')+"; form-action 'self' https://checkout.stripe.com"});
 sendPage(res,EVENTS_PAGE,req.path,html=>html.replace('<body','<body data-event-embed="true"').replace('</head>','<style>body[data-event-embed] #nav,body[data-event-embed] footer,body[data-event-embed] .ev-back{display:none!important}body[data-event-embed] main{padding-top:24px!important}body[data-event-embed] .ev-detail{gap:24px}</style></head>'));
}));
app.get(['/events/:slug', '/en/events/:slug', '/ja/events/:slug'], async (req, res) => {
  let event = null;
  if (dbReady) {
    try {
      event = (await q(
        `SELECT ${SEL_EVENT} FROM events e WHERE e.slug=$1 AND e.status<>'草稿' LIMIT 1`,
        [req.params.slug]
      )).rows[0] || null;
    } catch (error) {
      console.warn('[event-meta] 無法讀取活動公開狀態：', error?.message || 'unknown error');
    }
  }
  if (!event || event.visibility !== 'public') res.set('X-Robots-Tag', 'noindex');
  sendPage(res, EVENTS_PAGE, req.path, event ? html => composeEventMeta(html, localizeEvent(event, req.path.split('/')[1]), req.path) : null);
});
app.get('/', (req, res) => sendPage(res, path.join(PUB, 'index.html'), '/'));
// /menu 舊頁改版為空間介紹：301 導至 /space（保留語系前綴），需先於 static 攔截
function menuToSpace(req, res) {
  const lang = req.path.startsWith('/en/') ? 'en' : req.path.startsWith('/ja/') ? 'ja' : 'zh';
  const base = lang === 'zh' ? '/space' : `/${lang}/space`;
  res.redirect(301, `${base}#menu`);
}
app.get(['/menu', '/menu/', '/en/menu', '/en/menu/', '/ja/menu', '/ja/menu/'], menuToSpace);
// 後台 SPA：一般路徑路由（/admin/members、/admin/social/edit/:id…）皆回同一頁，前端依 pathname 切換分頁；
// 舊 /admin.html 轉 301 至 /admin（瀏覽器保留 #hash，前端再轉為路徑）
const ADMIN_PAGE = path.join(PUB, 'admin.html');
app.get('/admin.html', (_req, res) => res.redirect(301, '/admin'));
app.get(['/admin', '/admin/*', '/organizer', '/organizer/*'], (_req, res) => { res.set('X-Robots-Tag', 'noindex'); res.sendFile(ADMIN_PAGE); });
// 含 <!--SITE_HEADER--> 的 HTML（member、menu、語系首頁…）在 static 前組裝
app.use(layoutMiddleware(PUB));
app.use('/fellow', express.static(path.join(PUB, 'fellow'), { extensions: ['html'] }));
// 空間介紹圖片上傳檔（管理後台上傳，需先於 static 掛載）
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res,file) => {res.set('X-Content-Type-Options', 'nosniff');if(file.endsWith('.pdf'))res.set({'Content-Disposition':'attachment','Content-Security-Policy':"sandbox; default-src 'none'"});},   // 上傳目錄防內容嗅探
}));
// 靜態官網（無標記 HTML／資產）
app.use(express.static(PUB, { extensions: ['html'] }));
// JSON/parser/路由錯誤不可回傳 Express 預設的 stack trace 或伺服器路徑。
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error('[request error]', err.message);
  res.status(status).json({ error: status === 413 ? '請求內容過大。' : status < 500 ? '請求格式不正確。' : '伺服器處理失敗。' });
});

/* ---------- 啟動 ---------- */
async function boot() {
  if (pool) {
    try { await migrate(); dbReady = true; console.log('[db] 連線並完成 migrate'); }
    catch (e) { console.error('[db] migrate 失敗（前端仍會運作，API 回 503）：', e.message); }
  } else {
    console.warn('[db] 未設定 DATABASE_URL / POSTGRES_*，API 將回 503；請於 Zeabur 設定資料庫連線。');
  }
  app.listen(PORT, () => console.log(`[server] listening on ${PORT}`));

  // 會籍到期前 7 天提醒：每日 09:00（台北）
  if (dbReady) {
    if(stripe){let expiring=false;require('node-cron').schedule('* * * * *',async()=>{if(expiring)return;expiring=true;try{await expireEventAuthorizations();await reconcileExpiredEventCheckouts();}catch(e){console.error('[authorization-expiry]',e.message);}finally{expiring=false;}});}
    if(process.env.RESEND_API_KEY){
      let running=false;
      require('node-cron').schedule('* * * * *',async()=>{
        if(running)return;running=true;
        try{const pending=(await q("SELECT r.user_id,r.event_id FROM event_regs r JOIN events e ON e.id=r.event_id WHERE r.status='registered' AND e.status<>'已取消' AND r.confirmation_queued=false LIMIT 100")).rows;for(const r of pending)await notifyRegistration(r.user_id,r.event_id);await require('./lib/event-mailer').queueReminders(q,SITE_BASE);await require('./lib/event-mailer').queueFeedbackRequests(q,SITE_BASE);for(let i=0;i<30;i++){if(!await require('./lib/event-mailer').deliverDue(q,sendMail,SITE_BASE,SECRET))break;}}
        catch(e){console.error('[event-mail]',e.message);}finally{running=false;}
      });
    }
    require('node-cron').schedule('0 9 * * *', () => remindExpiringMemberships()
      .catch(e => console.error('[remind] 失敗：', e.message)), { timezone: 'Asia/Taipei' });
  }

  // IG 自動發佈 cron：env IG_AUTOPUBLISH=1 才啟用（本機開發預設不跑，避免誤發）
  if (process.env.IG_AUTOPUBLISH === '1' && dbReady) {
    const cron = require('node-cron');
    cron.schedule('*/5 * * * *', () => igPublisher.publishDue(igDeps())
      .catch(e => console.error('[ig-publish] cron 失敗：', e.message)));
    // 長期 token 60 天效期，每日續期一次（台北 04:10 離峰）
    cron.schedule('10 4 * * *', () => igPublisher.refreshToken(igDeps())
      .then(sec => sec && console.log(`[ig-publish] token 已續期，效期 ${Math.round(sec / 86400)} 天`))
      .catch(e => console.error('[ig-publish] token 續期失敗：', e.message)), { timezone: 'Asia/Taipei' });
    // AI 補產：每週日 20:00 檢查未來 7 天排程，不足補滿（需 ANTHROPIC_API_KEY）
    cron.schedule('0 20 * * 0', () => igComposer.composeWeek(igDeps())
      .catch(e => console.error('[ig-compose] cron 失敗：', e.message)), { timezone: 'Asia/Taipei' });
    console.log('[ig-publish] 自動發佈已啟用（每 5 分掃描；週日 20:00 AI 補產）');
  } else {
    console.log('[ig-publish] 自動發佈未啟用（IG_AUTOPUBLISH!=1 或無資料庫）');
  }
}
if (require.main === module) boot();
module.exports = { app };
