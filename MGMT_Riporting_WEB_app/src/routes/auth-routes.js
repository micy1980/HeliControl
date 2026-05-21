const { GLOBAL_SA_AUDIT_USERNAME, GLOBAL_SA_TOKEN_PREFIX } = require('../config');
const { db } = require('../db');
const { randomToken, sha256, hashPassword, verifyPassword } = require('../security');
const { httpError, ok, parseBody, required } = require('../http-utils');
const { activeCompanyId } = require('../services/settings-service');
const {
  isGlobalSaUsername,
  verifyGlobalSaPassword,
  globalSaUser,
  createGlobalSaToken,
  publicUser,
  parseCookies,
  getUserFromRequest,
  requireAuth,
  isGlobalSaUser,
  settingNumber,
  sessionAbsoluteMs,
  sessionCookieMaxAgeSeconds,
} = require('../services/auth-service');
const { logEvent } = require('../services/log-service');

function nowIso() {
  return new Date().toISOString();
}

function requestMeta(req) {
  return {
    ip: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim(),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
  };
}

function isLocked(user) {
  if (!user?.locked_until) return false;
  const autoUnlock = settingNumber('login_auto_unlock', 1, 0, 1) === 1;
  const until = Date.parse(user.locked_until);
  if (Number.isFinite(until) && until > Date.now()) return true;
  if (!autoUnlock) return true;
  db.prepare('UPDATE users SET locked_until = NULL, failed_attempts = 0, updated_at = ? WHERE id = ?').run(nowIso(), user.id);
  return false;
}

function registerFailedLogin(user, username) {
  const maxAttempts = settingNumber('login_max_failed_attempts', 5, 1, 100);
  const lockMinutes = settingNumber('login_lock_minutes', 15, 1, 60 * 24 * 30);
  if (!user) {
    logEvent({ severity: 'WARNING', module: 'auth', action: 'login_failed', details: username });
    return;
  }
  const attempts = Number(user.failed_attempts || 0) + 1;
  const lockedUntil = attempts >= maxAttempts
    ? new Date(Date.now() + lockMinutes * 60 * 1000).toISOString()
    : null;
  db.prepare(`
    UPDATE users
    SET failed_attempts = ?, locked_until = COALESCE(?, locked_until), last_failed_login_at = ?, updated_at = ?
    WHERE id = ?
  `).run(attempts, lockedUntil, nowIso(), nowIso(), user.id);
  logEvent({
    userId: user.id,
    username: user.username,
    severity: 'WARNING',
    module: 'auth',
    action: lockedUntil ? 'account_locked' : 'login_failed',
    details: lockedUntil ? `Sikertelen belépések: ${attempts}. Zárolva eddig: ${lockedUntil}` : `Sikertelen belépések: ${attempts}`,
  });
  if (lockedUntil) {
    const { sendNotification } = require('../services/email-service');
    sendNotification('user_lock', {
      username: user.username,
      subject: 'MGM Reporting - felhasználó zárolva',
      text: [
        'Felhasználói fiók zárolva sikertelen belépési kísérletek miatt.',
        '',
        `Felhasználó: ${user.username}`,
        `Sikertelen belépések: ${attempts}`,
        `Zárolva eddig: ${lockedUntil}`,
      ].join('\n'),
    }).catch(() => null);
  }
}

function validatePasswordPolicy(password) {
  const minLength = settingNumber('password_min_length', 8, 6, 128);
  if (String(password || '').length < minLength) {
    throw httpError(400, 'WEAK_PASSWORD', `Az uj jelszo legalabb ${minLength} karakter legyen.`);
  }
  const requireComplexity = settingNumber('password_require_complexity', 0, 0, 1) === 1;
  if (requireComplexity && !(/[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password))) {
    throw httpError(400, 'WEAK_PASSWORD', 'Az új jelszó tartalmazzon kisbetűt, nagybetűt, számot és speciális karaktert.');
  }
}

async function handleAuthRoutes({
  req,
  res,
  method,
  route,
}) {
  if (route === '/api/auth/login' && method === 'POST') {
    const body = await parseBody(req);
    const username = String(required(body.username, 'username')).trim();
    const password = String(required(body.password, 'password'));
    if (isGlobalSaUsername(username)) {
      if (!verifyGlobalSaPassword(password)) {
        logEvent({ severity: 'WARNING', module: 'auth', action: 'global_sa_login_failed', details: GLOBAL_SA_AUDIT_USERNAME });
        throw httpError(401, 'BAD_LOGIN', 'Hibás felhasználónév vagy jelszó.');
      }
      const globalUser = globalSaUser();
      res.setHeader('Set-Cookie', `mgm_session=${encodeURIComponent(createGlobalSaToken())}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionCookieMaxAgeSeconds()}`);
      logEvent({ username: GLOBAL_SA_AUDIT_USERNAME, severity: 'INFO', module: 'auth', action: 'global_sa_login', details: 'Tartalek SA bejelentkezes' });
      ok(res, { user: publicUser(globalUser) });
      return true;
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
    if (user && isLocked(user)) {
      logEvent({ userId: user.id, username: user.username, severity: 'WARNING', module: 'auth', action: 'login_blocked_locked', details: user.locked_until || 'manual' });
      throw httpError(423, 'ACCOUNT_LOCKED', 'A fiok zarolva van. Admin feloldas vagy automatikus feloldas szukseges.');
    }
    if (!user || !verifyPassword(password, user.password_hash)) {
      registerFailedLogin(user, username);
      throw httpError(401, 'BAD_LOGIN', 'Hibás felhasználónév vagy jelszó.');
    }
    const token = randomToken();
    const now = nowIso();
    const expires = new Date(Date.now() + sessionAbsoluteMs()).toISOString();
    const meta = requestMeta(req);
    db.prepare(`
      INSERT INTO sessions (token_hash, user_id, company_id, expires_at, created_at, last_seen_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sha256(token), user.id, activeCompanyId(), expires, now, now, meta.ip, meta.userAgent);
    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?').run(now, now, user.id);
    res.setHeader('Set-Cookie', `mgm_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionCookieMaxAgeSeconds()}`);
    logEvent({ userId: user.id, username: user.username, severity: 'INFO', module: 'auth', action: 'login', details: 'Sikeres bejelentkezes' });
    ok(res, { user: publicUser(user) });
    return true;
  }

  if (route === '/api/auth/logout' && method === 'POST') {
    const token = parseCookies(req).mgm_session;
    if (token && !String(token).startsWith(GLOBAL_SA_TOKEN_PREFIX)) {
      db.prepare('UPDATE sessions SET revoked_at = ?, revoke_reason = ? WHERE token_hash = ?')
        .run(nowIso(), 'logout', sha256(token));
    }
    res.setHeader('Set-Cookie', 'mgm_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    ok(res, {});
    return true;
  }

  if (route === '/api/auth/me') {
    const user = getUserFromRequest(req);
    ok(res, { user: publicUser(user) });
    return true;
  }

  if (route === '/api/profile/password' && method === 'POST') {
    const user = requireAuth(req);
    if (isGlobalSaUser(user)) throw httpError(400, 'GLOBAL_SA_PASSWORD_LOCKED', 'A tartalek SA jelszava nem modosithato a feluletrol.');
    const body = await parseBody(req);
    if (!verifyPassword(String(body.currentPassword || ''), user.password_hash)) {
      throw httpError(400, 'BAD_PASSWORD', 'A jelenlegi jelszo nem jo.');
    }
    const next = String(required(body.newPassword, 'newPassword'));
    validatePasswordPolicy(next);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(next), nowIso(), nowIso(), user.id);
    logEvent({ userId: user.id, username: user.username, severity: 'AUDIT', module: 'profile', action: 'password_change', details: 'Jelszo modositva' });
    ok(res, {});
    return true;
  }

  return false;
}

module.exports = { handleAuthRoutes, validatePasswordPolicy };
