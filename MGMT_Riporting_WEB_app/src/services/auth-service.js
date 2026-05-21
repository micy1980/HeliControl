const {
  SESSION_DAYS,
  GLOBAL_SA_USERNAME,
  GLOBAL_SA_AUDIT_USERNAME,
  GLOBAL_SA_DISPLAY_NAME,
  GLOBAL_SA_PASSWORD_HASH,
  GLOBAL_SA_TOKEN_PREFIX,
} = require('../config');
const { ROLE_LEVEL } = require('../constants');
const { db } = require('../db');
const { sha256, hmac, safeCompare, verifyPassword } = require('../security');
const { httpError } = require('../http-utils');
const { getSetting } = require('./settings-service');

function nowIso() {
  return new Date().toISOString();
}

function settingNumber(key, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(getSetting(key, fallback));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sessionAbsoluteMs() {
  return settingNumber('session_absolute_hours', SESSION_DAYS * 24, 1, 24 * 30) * 60 * 60 * 1000;
}

function sessionIdleMs() {
  return settingNumber('session_idle_minutes', 60, 1, 24 * 60) * 60 * 1000;
}

function sessionCookieMaxAgeSeconds() {
  return Math.max(60, Math.floor(sessionAbsoluteMs() / 1000));
}

function cleanupStaleSessions() {
  const now = nowIso();
  const idleBefore = new Date(Date.now() - sessionIdleMs()).toISOString();
  const expired = db.prepare(`
    UPDATE sessions
    SET revoked_at = ?, revoke_reason = ?
    WHERE revoked_at IS NULL
      AND expires_at <= ?
  `).run(now, 'expired', now).changes;
  const idle = db.prepare(`
    UPDATE sessions
    SET revoked_at = ?, revoke_reason = ?
    WHERE revoked_at IS NULL
      AND last_seen_at IS NOT NULL
      AND last_seen_at <= ?
  `).run(now, 'idle_timeout', idleBefore).changes;
  return { expired, idle, total: expired + idle, idleBefore };
}

function isGlobalSaUsername(username) {
  return String(username || '').trim().toLowerCase() === GLOBAL_SA_USERNAME;
}

function isGlobalSaUser(user) {
  return Boolean(user?.global_sa || user?.globalSa);
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    globalSa: Boolean(row.global_sa || row.globalSa),
    mustChangePassword: Boolean(row.must_change_password),
    darkMode: Boolean(row.dark_mode),
    active: Boolean(row.active),
  };
}

function globalSaUser() {
  return {
    id: null,
    username: GLOBAL_SA_AUDIT_USERNAME,
    display_name: GLOBAL_SA_DISPLAY_NAME,
    email: '',
    role: 'SA',
    password_hash: '',
    must_change_password: 0,
    dark_mode: 0,
    active: 1,
    global_sa: 1,
  };
}

function verifyGlobalSaPassword(password) {
  return Boolean(GLOBAL_SA_PASSWORD_HASH) && verifyPassword(password, GLOBAL_SA_PASSWORD_HASH);
}

function createGlobalSaToken() {
  const expiresAt = Date.now() + sessionAbsoluteMs();
  const payload = Buffer.from(JSON.stringify({ username: GLOBAL_SA_USERNAME, expiresAt })).toString('base64url');
  return `${GLOBAL_SA_TOKEN_PREFIX}${payload}.${hmac(payload, getSetting('license_secret'))}`;
}

function getGlobalSaFromToken(token) {
  if (!String(token || '').startsWith(GLOBAL_SA_TOKEN_PREFIX)) return null;
  const raw = String(token).slice(GLOBAL_SA_TOKEN_PREFIX.length);
  const [payload, signature] = raw.split('.');
  if (!payload || !signature || !safeCompare(signature, hmac(payload, getSetting('license_secret')))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!isGlobalSaUsername(data.username) || Number(data.expiresAt) <= Date.now()) return null;
    return globalSaUser();
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header.split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf('=');
        return idx === -1 ? [part, ''] : [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
      })
  );
}

function getUserFromRequest(req) {
  const token = parseCookies(req).mgm_session;
  if (!token) return null;
  const globalUser = getGlobalSaFromToken(token);
  if (globalUser) return globalUser;
  const session = db.prepare(`
    SELECT s.token_hash, s.expires_at, s.last_seen_at, s.revoked_at, u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND s.revoked_at IS NULL AND u.active = 1
  `).get(sha256(token), nowIso());
  if (!session) return null;
  const lastSeen = session.last_seen_at ? Date.parse(session.last_seen_at) : 0;
  if (lastSeen && Date.now() - lastSeen > sessionIdleMs()) {
    db.prepare('UPDATE sessions SET revoked_at = ?, revoke_reason = ? WHERE token_hash = ?')
      .run(nowIso(), 'idle_timeout', session.token_hash);
    return null;
  }
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(nowIso(), session.token_hash);
  return session;
}

function requireAuth(req, minRole = 'VIEWER') {
  const user = getUserFromRequest(req);
  if (!user) throw httpError(401, 'AUTH_REQUIRED', 'Bejelentkezés szükséges.');
  if ((ROLE_LEVEL[user.role] || 0) < ROLE_LEVEL[minRole]) {
    throw httpError(403, 'FORBIDDEN', 'Ehhez nincs jogosultságod.');
  }
  return user;
}

module.exports = {
  isGlobalSaUsername,
  isGlobalSaUser,
  publicUser,
  globalSaUser,
  verifyGlobalSaPassword,
  createGlobalSaToken,
  parseCookies,
  getUserFromRequest,
  requireAuth,
  settingNumber,
  sessionAbsoluteMs,
  sessionCookieMaxAgeSeconds,
  cleanupStaleSessions,
};
