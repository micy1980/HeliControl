const { GLOBAL_SA_USERNAME } = require('../config');
const { ROLE_LEVEL } = require('../constants');
const { db } = require('../db');
const { hashPassword } = require('../security');
const { sha256 } = require('../security');
const { httpError, ok, parseBody, required, asNumber } = require('../http-utils');
const { isGlobalSaUsername, parseCookies, settingNumber, cleanupStaleSessions } = require('../services/auth-service');
const { getSetting, setSetting } = require('../services/settings-service');
const { logEvent, logAuditChanges } = require('../services/log-service');
const { clearCompanyYearData, dataCounts, companyDeleteCounts } = require('../services/admin-maintenance-service');
const { seedMasterData, seedSummaryRules } = require('../services/seed-service');
const { seedValidationRules } = require('../services/validation-rule-service');
const { autoBackupBeforeDestructive, createBackup } = require('../services/backup-service');
const {
  requirePermission,
  requireCompanyAccess,
  visibleCompaniesForUser,
  listPermissionMatrix,
  saveUserPermissions,
} = require('../services/permission-service');

function nowIso() {
  return new Date().toISOString();
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

function canManageTargetUser(currentUser, targetUser, requestedRole = targetUser?.role) {
  const currentLevel = ROLE_LEVEL[currentUser?.role] || 0;
  const targetLevel = ROLE_LEVEL[targetUser?.role] || 0;
  const requestedLevel = ROLE_LEVEL[requestedRole] || 0;
  if (!requestedLevel) throw httpError(400, 'VALIDATION_ERROR', 'Érvénytelen szerepkör.');
  if (targetLevel >= ROLE_LEVEL.SA && currentLevel < ROLE_LEVEL.SA) return false;
  if (requestedLevel >= ROLE_LEVEL.SA && currentLevel < ROLE_LEVEL.SA) return false;
  return currentLevel >= ROLE_LEVEL.ADMIN;
}

function currentTokenHash(req) {
  const token = parseCookies(req).mgm_session;
  return token ? sha256(token) : '';
}

const COMPANY_AUDIT_FIELDS = [
  { key: 'code', label: 'Kód' },
  { key: 'name', label: 'Név' },
  { key: 'fiscal_year_start', label: 'Pénzügyi év kezdőhónap' },
  { key: 'base_currency', label: 'Alapdeviza' },
  { key: 'logo_file_name', label: 'Logo fájl' },
  { key: 'active', label: 'Aktív', boolean: true },
];

const USER_AUDIT_FIELDS = [
  { key: 'username', label: 'Felhasználónév' },
  { key: 'display_name', label: 'Név' },
  { key: 'email', label: 'Email' },
  { key: 'role', label: 'Szerepkör' },
  { key: 'active', label: 'Aktív', boolean: true },
  { key: 'must_change_password', label: 'Jelszócsere kötelező', boolean: true },
  { key: 'failed_attempts', label: 'Hibás login' },
  { key: 'locked_until', label: 'Zárolva eddig' },
  { key: 'password_changed_at', label: 'Jelszó módosítva' },
];

const USER_UNLOCK_AUDIT_FIELDS = USER_AUDIT_FIELDS.filter((field) => ['failed_attempts', 'locked_until'].includes(field.key));
const USER_PASSWORD_AUDIT_FIELDS = USER_AUDIT_FIELDS.filter((field) => ['must_change_password', 'failed_attempts', 'locked_until', 'password_changed_at'].includes(field.key));

function companyAuditRow(id) {
  return db.prepare(`
    SELECT id, code, name, fiscal_year_start, base_currency, logo_file_name, active
    FROM companies
    WHERE id = ?
  `).get(id) || null;
}

function userAuditRow(id) {
  return db.prepare(`
    SELECT id, username, display_name, email, role, active, must_change_password, failed_attempts, locked_until, password_changed_at
    FROM users
    WHERE id = ?
  `).get(id) || null;
}

async function handleAdminRoutes({
  req,
  res,
  url,
  method,
  route,
}) {
  if (route === '/api/admin/permissions' && method === 'GET') {
    requirePermission(req, 'permissions', 'view');
    ok(res, listPermissionMatrix(url?.searchParams?.get('userId')));
    return true;
  }

  if (route === '/api/admin/permissions' && method === 'POST') {
    const user = requirePermission(req, 'permissions', 'edit');
    const body = await parseBody(req);
    ok(res, saveUserPermissions(asNumber(body.userId, 'userId'), body, user));
    return true;
  }

  if (route === '/api/admin/clear-company-data' && method === 'POST') {
    const user = requirePermission(req, 'dataadmin', 'delete');
    const body = await parseBody(req);
    const companyId = asNumber(getSetting('active_company_id'), 'companyId');
    requireCompanyAccess(user, companyId, 'manage');
    const year = asNumber(getSetting('active_year'), 'year');
    const company = db.prepare('SELECT id, code FROM companies WHERE id = ?').get(companyId);
    if (!company) throw httpError(404, 'COMPANY_NOT_FOUND', 'A kiválasztott cég nem található.');
    const clearCoa = body.clearCoa === true || body.clearCoa === 'true';
    if (clearCoa && String(body.confirmCoaCode || '').trim() !== company.code) {
      throw httpError(400, 'COA_CONFIRMATION_REQUIRED', 'A számlatükör törléséhez a cégkód pontos megerősítése szükséges.');
    }
    const clearMasterData = body.clearMasterData === true || body.clearMasterData === 'true';
    if (clearMasterData && String(body.confirmMasterDataCode || '').trim() !== company.code) {
      throw httpError(400, 'MASTER_DATA_CONFIRMATION_REQUIRED', 'A törzsadatok törléséhez a cégkód pontos megerősítése szükséges.');
    }
    const safetyBackup = autoBackupBeforeDestructive()
      ? await createBackup('predelete', `${company.code}_${year}`)
      : null;
    if (safetyBackup) {
      logEvent({ companyId, userId: user.id, username: user.username, severity: 'AUDIT', module: 'backup', action: 'predelete_create', details: safetyBackup.file });
    }
    const result = clearCompanyYearData(companyId, year, {
      clearCoa,
      clearMasterData,
      clearGl: body.clearGl !== false && body.clearGl !== 'false',
      clearBudget: body.clearBudget !== false && body.clearBudget !== 'false',
      clearImports: body.clearImports !== false && body.clearImports !== 'false',
      clearEventLog: body.clearEventLog !== false && body.clearEventLog !== 'false',
    });
    if (safetyBackup) result.safetyBackup = safetyBackup.file;
    logEvent({
      companyId,
      userId: user.id,
      username: user.username,
      severity: 'AUDIT',
      module: 'admin',
      action: 'clear_company_year_data',
      details: `${company.code}/${year}: ${JSON.stringify(result)}`,
    });
    ok(res, result);
    return true;
  }

  if (route === '/api/admin/data-counts' && method === 'GET') {
    const user = requirePermission(req, 'dataadmin', 'view');
    const companyId = asNumber(getSetting('active_company_id'), 'companyId');
    requireCompanyAccess(user, companyId, 'view');
    const year = asNumber(getSetting('active_year'), 'year');
    ok(res, dataCounts(companyId, year));
    return true;
  }

  if (route === '/api/companies' && method === 'GET') {
    const user = requirePermission(req, 'companies', 'view');
    ok(res, { companies: visibleCompaniesForUser(user, false) });
    return true;
  }

  if (route === '/api/companies' && method === 'POST') {
    const user = requirePermission(req, 'companies', 'edit');
    const body = await parseBody(req);
    const info = db.prepare(`
      INSERT INTO companies (code, name, fiscal_year_start, base_currency, logo_file_name, logo_data, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(required(body.code, 'code')).trim().toUpperCase(),
      String(required(body.name, 'name')).trim(),
      asNumber(body.fiscalYearStart, 'fiscalYearStart', 1),
      String(body.baseCurrency || 'HUF').trim().toUpperCase(),
      String(body.logoFileName || '').trim(),
      String(body.logoData || ''),
      body.active === false ? 0 : 1,
      nowIso(),
      nowIso()
    );
    seedMasterData(info.lastInsertRowid);
    seedSummaryRules(info.lastInsertRowid);
    seedValidationRules(info.lastInsertRowid);
    const after = companyAuditRow(info.lastInsertRowid);
    logAuditChanges({
      companyId: info.lastInsertRowid,
      user,
      module: 'companies',
      table: 'companies',
      entityKey: after?.code || body.code,
      action: 'company_create',
      before: {},
      after,
      fields: COMPANY_AUDIT_FIELDS,
    });
    ok(res, { companies: visibleCompaniesForUser(user, false) });
    return true;
  }

  if (route.startsWith('/api/companies/') && method === 'PATCH') {
    const id = asNumber(route.split('/').pop(), 'id');
    const user = requirePermission(req, 'companies', 'edit', { companyId: id });
    const body = await parseBody(req);
    const before = companyAuditRow(id);
    db.prepare(`
      UPDATE companies
      SET code = ?, name = ?, fiscal_year_start = ?, base_currency = ?, logo_file_name = ?, logo_data = ?, active = ?, updated_at = ?
      WHERE id = ?
    `).run(
      String(required(body.code, 'code')).trim().toUpperCase(),
      String(required(body.name, 'name')).trim(),
      asNumber(body.fiscalYearStart, 'fiscalYearStart', 1),
      String(body.baseCurrency || 'HUF').trim().toUpperCase(),
      String(body.logoFileName || '').trim(),
      String(body.logoData || ''),
      body.active === false ? 0 : 1,
      nowIso(),
      id
    );
    const after = companyAuditRow(id);
    logAuditChanges({
      companyId: id,
      user,
      module: 'companies',
      table: 'companies',
      entityKey: before?.code || after?.code || String(id),
      action: 'company_update',
      before,
      after,
      fields: COMPANY_AUDIT_FIELDS,
    });
    ok(res, { companies: visibleCompaniesForUser(user, false) });
    return true;
  }

  if (route.startsWith('/api/companies/') && method === 'DELETE') {
    const id = asNumber(route.split('/').pop(), 'id');
    const user = requirePermission(req, 'companies', 'delete', { companyId: id });
    const company = db.prepare('SELECT id, code, name FROM companies WHERE id = ?').get(id);
    if (!company) throw httpError(404, 'COMPANY_NOT_FOUND', 'A kiválasztott cég nem található.');
    const before = companyAuditRow(id);
    const companyCount = db.prepare('SELECT COUNT(*) AS total FROM companies').get().total;
    if (companyCount <= 1) throw httpError(400, 'LAST_COMPANY', 'Az utolsó cég nem törölhető.');
    const counts = companyDeleteCounts(id);
    const safetyBackup = autoBackupBeforeDestructive()
      ? await createBackup('predelete_company', company.code)
      : null;
    if (safetyBackup) {
      logEvent({ companyId: id, userId: user.id, username: user.username, severity: 'AUDIT', module: 'backup', action: 'predelete_company_create', details: safetyBackup.file });
    }
    const activeCompanyId = Number(getSetting('active_company_id'));
    const nextCompany = activeCompanyId === id
      ? db.prepare('SELECT id FROM companies WHERE id <> ? ORDER BY active DESC, name LIMIT 1').get(id)
      : null;
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM event_log WHERE company_id = ?').run(id);
      db.prepare('DELETE FROM companies WHERE id = ?').run(id);
      if (nextCompany?.id) {
        db.prepare('UPDATE companies SET active = 1, updated_at = ? WHERE id = ?').run(nowIso(), nextCompany.id);
        setSetting('active_company_id', nextCompany.id);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    logEvent({
      userId: user.id,
      username: user.username,
      severity: 'AUDIT',
      module: 'companies',
      action: 'delete',
      details: `${company.code}: ${JSON.stringify(counts)}`,
    });
    logAuditChanges({
      companyId: null,
      user,
      module: 'companies',
      table: 'companies',
      entityKey: company.code,
      action: 'company_delete',
      before,
      after: {},
      fields: COMPANY_AUDIT_FIELDS,
    });
    ok(res, { deleted: true, company, counts, safetyBackup: safetyBackup?.file || '', activeCompanyId: nextCompany?.id || activeCompanyId, companies: visibleCompaniesForUser(user, false) });
    return true;
  }

  if (route === '/api/users' && method === 'GET') {
    requirePermission(req, 'users', 'view');
    const users = db.prepare(`
      SELECT
        id,
        username,
        display_name AS displayName,
        email,
        role,
        active,
        must_change_password AS mustChangePassword,
        failed_attempts AS failedAttempts,
        locked_until AS lockedUntil,
        last_login_at AS lastLoginAt,
        last_failed_login_at AS lastFailedLoginAt,
        created_at AS createdAt
      FROM users
      WHERE lower(username) <> ?
      ORDER BY role, username
    `).all(GLOBAL_SA_USERNAME).map((row) => ({
      ...row,
      active: Boolean(row.active),
      mustChangePassword: Boolean(row.mustChangePassword),
      locked: Boolean(row.lockedUntil && Date.parse(row.lockedUntil) > Date.now()),
    }));
    ok(res, { users });
    return true;
  }

  if (route === '/api/users' && method === 'POST') {
    const user = requirePermission(req, 'users', 'edit');
    const body = await parseBody(req);
    const username = String(required(body.username, 'username')).trim();
    const requestedRole = String(body.role || 'USER').toUpperCase();
    if (isGlobalSaUsername(username)) throw httpError(400, 'RESERVED_USERNAME', 'Ez a felhasználónév rendszer szinten foglalt.');
    if (!ROLE_LEVEL[requestedRole]) throw httpError(400, 'VALIDATION_ERROR', 'Érvénytelen szerepkör.');
    if (requestedRole === 'SA' && (ROLE_LEVEL[user.role] || 0) < ROLE_LEVEL.SA) {
      throw httpError(403, 'FORBIDDEN', 'SA felhasználót csak SA hozhat létre.');
    }
    const password = String(body.password || 'Temp1234!');
    validatePasswordPolicy(password);
    const info = db.prepare(`
      INSERT INTO users (username, display_name, email, role, password_hash, must_change_password, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      username,
      String(required(body.displayName, 'displayName')).trim(),
      String(body.email || ''),
      requestedRole,
      hashPassword(password),
      body.active === false ? 0 : 1,
      nowIso(),
      nowIso()
    );
    const after = userAuditRow(info.lastInsertRowid);
    logAuditChanges({
      user,
      module: 'users',
      table: 'users',
      entityKey: after?.username || username,
      action: 'user_create',
      before: {},
      after,
      fields: USER_AUDIT_FIELDS,
    });
    ok(res, {});
    return true;
  }

  if (route.startsWith('/api/users/') && method === 'PATCH') {
    const user = requirePermission(req, 'users', 'edit');
    const id = asNumber(route.split('/').pop(), 'id');
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target || isGlobalSaUsername(target.username)) throw httpError(404, 'USER_NOT_FOUND', 'A felhasznalo nem talalhato.');
    const body = await parseBody(req);
    const requestedRole = String(body.role || target.role).toUpperCase();
    if (!canManageTargetUser(user, target, requestedRole)) throw httpError(403, 'FORBIDDEN', 'Ehhez nincs jogosultsagod.');
    const active = body.active === false || body.active === 'false' || body.active === '0' ? 0 : 1;
    if (!active && Number(user.id) === Number(id)) throw httpError(400, 'SELF_DISABLE', 'A saját fiókodat nem inaktiválhatod.');
    const before = userAuditRow(id);
    db.prepare(`
      UPDATE users
      SET display_name = ?, email = ?, role = ?, active = ?, must_change_password = ?, updated_at = ?
      WHERE id = ?
    `).run(
      String(required(body.displayName, 'displayName')).trim(),
      String(body.email || '').trim(),
      requestedRole,
      active,
      body.mustChangePassword === true || body.mustChangePassword === 'true' || body.mustChangePassword === '1' ? 1 : 0,
      nowIso(),
      id
    );
    const after = userAuditRow(id);
    logAuditChanges({
      user,
      module: 'users',
      table: 'users',
      entityKey: target.username,
      action: 'user_update',
      before,
      after,
      fields: USER_AUDIT_FIELDS,
    });
    ok(res, {});
    return true;
  }

  if (route.startsWith('/api/users/') && route.endsWith('/unlock') && method === 'POST') {
    const user = requirePermission(req, 'users', 'edit');
    const id = asNumber(route.split('/')[3], 'id');
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target || isGlobalSaUsername(target.username)) throw httpError(404, 'USER_NOT_FOUND', 'A felhasznalo nem talalhato.');
    if (!canManageTargetUser(user, target)) throw httpError(403, 'FORBIDDEN', 'Ehhez nincs jogosultsagod.');
    const before = userAuditRow(id);
    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?').run(nowIso(), id);
    const after = userAuditRow(id);
    logAuditChanges({
      user,
      module: 'users',
      table: 'users',
      entityKey: target.username,
      action: 'user_unlock',
      before,
      after,
      fields: USER_UNLOCK_AUDIT_FIELDS,
    });
    ok(res, {});
    return true;
  }

  if (route.startsWith('/api/users/') && route.endsWith('/reset-password') && method === 'POST') {
    const user = requirePermission(req, 'users', 'edit');
    const id = asNumber(route.split('/')[3], 'id');
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target || isGlobalSaUsername(target.username)) throw httpError(404, 'USER_NOT_FOUND', 'A felhasznalo nem talalhato.');
    if (!canManageTargetUser(user, target)) throw httpError(403, 'FORBIDDEN', 'Ehhez nincs jogosultsagod.');
    const body = await parseBody(req);
    const next = String(required(body.password, 'password'));
    validatePasswordPolicy(next);
    const before = userAuditRow(id);
    db.prepare(`
      UPDATE users
      SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL, password_changed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(hashPassword(next), nowIso(), nowIso(), id);
    const revoked = db.prepare('UPDATE sessions SET revoked_at = ?, revoked_by = ?, revoke_reason = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(nowIso(), user.id || null, 'password_reset', id);
    const after = userAuditRow(id);
    logAuditChanges({
      user,
      module: 'users',
      table: 'users',
      entityKey: target.username,
      action: 'password_reset',
      before,
      after,
      fields: USER_PASSWORD_AUDIT_FIELDS,
    });
    logEvent({ userId: user.id, username: user.username, severity: 'AUDIT', module: 'users', action: 'reset_password_sessions', details: `Felhasználó: ${target.username}; lezárt session: ${revoked.changes}` });
    ok(res, {});
    return true;
  }

  if (route.startsWith('/api/users/') && route.endsWith('/revoke-sessions') && method === 'POST') {
    const user = requirePermission(req, 'users', 'admin');
    const id = asNumber(route.split('/')[3], 'id');
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target || isGlobalSaUsername(target.username)) throw httpError(404, 'USER_NOT_FOUND', 'A felhasznalo nem talalhato.');
    if (!canManageTargetUser(user, target)) throw httpError(403, 'FORBIDDEN', 'Ehhez nincs jogosultsagod.');
    const result = db.prepare('UPDATE sessions SET revoked_at = ?, revoked_by = ?, revoke_reason = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(nowIso(), user.id || null, 'admin_user_revoke', id);
    logEvent({ userId: user.id, username: user.username, severity: 'AUDIT', module: 'auth', action: 'revoke_user_sessions', details: `Felhasználó: ${target.username}; role: ${target.role}; lezárt session: ${result.changes}` });
    ok(res, { revoked: result.changes });
    return true;
  }

  if (route === '/api/admin/sessions' && method === 'GET') {
    const user = requirePermission(req, 'sessions', 'view');
    const currentHash = currentTokenHash(req);
    const cleanup = cleanupStaleSessions();
    if (cleanup.total) {
      logEvent({
        userId: user.id,
        username: user.username,
        severity: 'AUDIT',
        module: 'auth',
        action: 'session_cleanup',
        details: `Lezart munkamenetek: ${cleanup.total} (lejart: ${cleanup.expired}, inaktiv: ${cleanup.idle})`,
      });
    }
    const rows = db.prepare(`
      SELECT
        s.token_hash AS id,
        s.user_id AS userId,
        s.company_id AS companyId,
        s.expires_at AS expiresAt,
        s.created_at AS createdAt,
        s.last_seen_at AS lastSeenAt,
        s.ip_address AS ipAddress,
        s.user_agent AS userAgent,
        u.username,
        u.display_name AS displayName,
        u.role,
        c.code AS companyCode,
        c.name AS companyName
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN companies c ON c.id = s.company_id
      WHERE s.revoked_at IS NULL AND s.expires_at > ?
      ORDER BY COALESCE(s.last_seen_at, s.created_at) DESC
      LIMIT 300
    `).all(nowIso()).map((row) => ({
      ...row,
      current: row.id === currentHash,
      userAgentShort: String(row.userAgent || '').slice(0, 90),
    }));
    ok(res, { sessions: rows, cleanup });
    return true;
  }

  if (route.startsWith('/api/admin/sessions/') && route.endsWith('/revoke') && method === 'POST') {
    const user = requirePermission(req, 'sessions', 'admin');
    const tokenHash = decodeURIComponent(route.slice('/api/admin/sessions/'.length, -'/revoke'.length));
    const session = db.prepare(`
      SELECT s.*, u.username, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `).get(tokenHash);
    if (!session) throw httpError(404, 'SESSION_NOT_FOUND', 'A munkamenet nem talalhato.');
    if ((ROLE_LEVEL[session.role] || 0) >= ROLE_LEVEL.SA && (ROLE_LEVEL[user.role] || 0) < ROLE_LEVEL.SA) {
      throw httpError(403, 'FORBIDDEN', 'SA munkamenetet csak SA zarhat le.');
    }
    db.prepare('UPDATE sessions SET revoked_at = ?, revoked_by = ?, revoke_reason = ? WHERE token_hash = ?')
      .run(nowIso(), user.id || null, 'admin_revoke', tokenHash);
    logEvent({
      userId: user.id,
      username: user.username,
      severity: 'AUDIT',
      module: 'auth',
      action: 'revoke_session',
      details: `Felhasználó: ${session.username}; role: ${session.role}; IP: ${session.ip_address || '-'}; lejárat: ${session.expires_at || '-'}`,
    });
    ok(res, { revoked: 1 });
    return true;
  }

  return false;
}

module.exports = { handleAdminRoutes };
