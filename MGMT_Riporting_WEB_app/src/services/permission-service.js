const { ROLE_LEVEL } = require('../constants');
const { db } = require('../db');
const { httpError } = require('../http-utils');
const { requireAuth, isGlobalSaUser, isGlobalSaUsername } = require('./auth-service');
const { listCompanies } = require('./settings-service');
const { logEvent } = require('./log-service');

function nowIso() {
  return new Date().toISOString();
}

const PERMISSION_ACTIONS = [
  { key: 'view', label: 'Megtekintés', companyMode: 'view' },
  { key: 'import', label: 'Import', companyMode: 'manage' },
  { key: 'validate', label: 'Validálás', companyMode: 'view' },
  { key: 'activate', label: 'Aktiválás', companyMode: 'manage' },
  { key: 'edit', label: 'Módosítás', companyMode: 'manage' },
  { key: 'delete', label: 'Törlés', companyMode: 'manage' },
  { key: 'export', label: 'Export', companyMode: 'view' },
  { key: 'admin', label: 'Admin', companyMode: 'manage' },
  { key: 'restore', label: 'Restore', companyMode: 'manage' },
];

const actionMap = new Map(PERMISSION_ACTIONS.map((action) => [action.key, action]));

const PERMISSION_MODULES = [
  { key: 'dashboard', label: 'Áttekintés', area: 'Kezdőlap', actions: { view: 'VIEWER', export: 'VIEWER' } },
  { key: 'report', label: 'Riport', area: 'Kezdőlap', actions: { view: 'VIEWER', export: 'VIEWER' } },
  { key: 'coa', label: 'Számlatükör', area: 'Főkönyv', actions: { view: 'VIEWER', import: 'USER', edit: 'USER', delete: 'ADMIN', export: 'VIEWER' } },
  { key: 'trialbalance', label: 'Főkönyvi kivonat', area: 'Főkönyv', actions: { view: 'VIEWER', validate: 'VIEWER', export: 'VIEWER' } },
  { key: 'fx', label: 'Árfolyamok', area: 'Főkönyv', actions: { view: 'VIEWER', edit: 'USER', export: 'VIEWER' } },
  { key: 'gl', label: 'GL import', area: 'Főkönyv', actions: { view: 'USER', import: 'USER', validate: 'USER', activate: 'USER', edit: 'USER', delete: 'ADMIN', export: 'USER' } },
  { key: 'budget', label: 'Budget / Forecast', area: 'Tervezés', actions: { view: 'USER', import: 'USER', edit: 'USER', delete: 'ADMIN', export: 'USER' } },
  { key: 'companies', label: 'Cégek', area: 'Admin', actions: { view: 'ADMIN', edit: 'ADMIN', delete: 'SA', admin: 'ADMIN' } },
  { key: 'users', label: 'Felhasználók', area: 'Admin', actions: { view: 'ADMIN', edit: 'ADMIN', delete: 'SA', admin: 'ADMIN' } },
  { key: 'sessions', label: 'Munkamenetek', area: 'Admin', actions: { view: 'ADMIN', edit: 'ADMIN', delete: 'ADMIN', admin: 'ADMIN' } },
  { key: 'backup', label: 'Backup', area: 'Admin', actions: { view: 'ADMIN', edit: 'ADMIN', delete: 'SA', export: 'ADMIN', restore: 'SA', admin: 'ADMIN' } },
  { key: 'logs', label: 'Naplók', area: 'Admin', actions: { view: 'USER', delete: 'SA', export: 'ADMIN', admin: 'SA' } },
  { key: 'settings', label: 'Beállítások', area: 'Admin', actions: { view: 'ADMIN', edit: 'ADMIN', admin: 'ADMIN' } },
  { key: 'validationRules', label: 'Validációs szabályok', area: 'Admin', actions: { view: 'ADMIN', edit: 'ADMIN', validate: 'ADMIN', admin: 'ADMIN' } },
  { key: 'license', label: 'Licensz', area: 'Admin', actions: { view: 'ADMIN', edit: 'ADMIN', admin: 'SA' } },
  { key: 'dataadmin', label: 'Adatkarbantartás', area: 'Admin', actions: { view: 'SA', delete: 'SA', admin: 'SA' } },
  { key: 'permissions', label: 'Jogosultságok', area: 'Admin', actions: { view: 'SA', edit: 'SA', admin: 'SA' } },
];

const moduleMap = new Map(PERMISSION_MODULES.map((module) => [module.key, module]));

function bool(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function assertKnownPermission(moduleKey, actionKey) {
  const module = moduleMap.get(String(moduleKey || ''));
  const action = actionMap.get(String(actionKey || ''));
  if (!module || !action) throw httpError(400, 'UNKNOWN_PERMISSION', 'Ismeretlen jogosultsagi elem.');
  return { module, action };
}

function roleAllows(role, minRole) {
  return (ROLE_LEVEL[role] || 0) >= (ROLE_LEVEL[minRole] || 0);
}

function moduleActionMinRole(moduleKey, actionKey) {
  return moduleMap.get(moduleKey)?.actions?.[actionKey] || null;
}

function moduleActionAvailable(moduleKey, actionKey) {
  return Boolean(moduleActionMinRole(moduleKey, actionKey));
}

function roleBaselineAllows(user, moduleKey, actionKey) {
  if (isGlobalSaUser(user)) return true;
  const minRole = moduleActionMinRole(moduleKey, actionKey);
  if (!minRole) return false;
  return roleAllows(user?.role, minRole);
}

function hasUserCompanyPermissionRows(userId) {
  if (!userId) return false;
  return db.prepare('SELECT 1 FROM user_company_permissions WHERE user_id = ? LIMIT 1').get(userId);
}

function hasCompanyAccess(user, companyId, mode = 'view') {
  if (!companyId || isGlobalSaUser(user) || user?.role === 'SA') return true;
  if (!user?.id) return false;
  if (!hasUserCompanyPermissionRows(user.id)) return true;
  const row = db.prepare(`
    SELECT can_view AS canView, can_manage AS canManage
    FROM user_company_permissions
    WHERE user_id = ? AND company_id = ?
  `).get(user.id, Number(companyId));
  if (!row) return false;
  if (mode === 'manage') return Boolean(row.canManage);
  return Boolean(row.canView || row.canManage);
}

function hasPermission(user, moduleKey, actionKey, options = {}) {
  const normalizedModule = String(moduleKey || '');
  const normalizedAction = String(actionKey || '');
  const { action } = assertKnownPermission(normalizedModule, normalizedAction);
  if (isGlobalSaUser(user) || user?.role === 'SA') return true;
  if (options.companyId && !hasCompanyAccess(user, options.companyId, options.companyMode || action.companyMode)) {
    return false;
  }
  if (!user?.id) return false;
  const override = db.prepare(`
    SELECT allowed
    FROM user_module_permissions
    WHERE user_id = ? AND module_key = ? AND action_key = ?
  `).get(user.id, normalizedModule, normalizedAction);
  if (override) return Boolean(override.allowed);
  return roleBaselineAllows(user, normalizedModule, normalizedAction);
}

function requirePermission(req, moduleKey, actionKey, options = {}) {
  const user = requireAuth(req);
  if (!hasPermission(user, moduleKey, actionKey, options)) {
    throw httpError(403, 'FORBIDDEN', 'Ehhez nincs jogosultsagod.');
  }
  return user;
}

function requireCompanyAccess(user, companyId, mode = 'view') {
  if (!hasCompanyAccess(user, companyId, mode)) {
    throw httpError(403, 'FORBIDDEN', 'Ehhez a ceghez nincs jogosultsagod.');
  }
}

function visibleCompaniesForUser(user, activeOnly = false) {
  const companies = listCompanies(activeOnly);
  if (isGlobalSaUser(user) || user?.role === 'SA' || !user?.id || !hasUserCompanyPermissionRows(user.id)) return companies;
  return companies.filter((company) => hasCompanyAccess(user, company.id, 'view'));
}

function effectivePermissionsForUser(user) {
  const modules = {};
  PERMISSION_MODULES.forEach((module) => {
    modules[module.key] = {};
    PERMISSION_ACTIONS.forEach((action) => {
      if (moduleActionAvailable(module.key, action.key)) {
        modules[module.key][action.key] = hasPermission(user, module.key, action.key);
      }
    });
  });
  return {
    actions: PERMISSION_ACTIONS,
    catalog: PERMISSION_MODULES,
    modules,
  };
}

function permissionUsers() {
  return db.prepare(`
    SELECT
      id,
      username,
      display_name AS displayName,
      email,
      role,
      active
    FROM users
    WHERE lower(username) <> ?
    ORDER BY role, username
  `).all(require('../config').GLOBAL_SA_USERNAME).map((row) => ({
    ...row,
    active: Boolean(row.active),
    immutable: row.role === 'SA',
  }));
}

function snapshotForUser(userId) {
  return {
    companyPermissions: db.prepare(`
      SELECT user_id AS userId, company_id AS companyId, can_view AS canView, can_manage AS canManage
      FROM user_company_permissions
      WHERE user_id = ?
      ORDER BY company_id
    `).all(userId).map((row) => ({ ...row, canView: Boolean(row.canView), canManage: Boolean(row.canManage) })),
    modulePermissions: db.prepare(`
      SELECT user_id AS userId, module_key AS moduleKey, action_key AS actionKey, allowed
      FROM user_module_permissions
      WHERE user_id = ?
      ORDER BY module_key, action_key
    `).all(userId).map((row) => ({ ...row, allowed: Boolean(row.allowed) })),
  };
}

function listPermissionMatrix(selectedUserId = null) {
  const users = permissionUsers();
  const fallbackUser = users.find((user) => user.role !== 'SA') || users[0] || null;
  const targetUserId = Number(selectedUserId || fallbackUser?.id || 0) || null;
  const snapshot = targetUserId ? snapshotForUser(targetUserId) : { companyPermissions: [], modulePermissions: [] };
  return {
    actions: PERMISSION_ACTIONS,
    modules: PERMISSION_MODULES,
    users,
    companies: listCompanies(false).map((company) => ({ id: company.id, code: company.code, name: company.name, active: company.active })),
    selectedUserId: targetUserId,
    ...snapshot,
  };
}

function normalizedCompanyRows(rows = []) {
  const knownCompanyIds = new Set(listCompanies(false).map((company) => Number(company.id)));
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      companyId: Number(row.companyId),
      canView: bool(row.canView) || bool(row.canManage),
      canManage: bool(row.canManage),
    }))
    .filter((row) => knownCompanyIds.has(row.companyId));
}

function normalizedModuleRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      moduleKey: String(row.moduleKey || ''),
      actionKey: String(row.actionKey || ''),
      allowed: bool(row.allowed),
    }))
    .filter((row) => moduleActionAvailable(row.moduleKey, row.actionKey));
}

function yesNo(value) {
  return value ? 'igen' : 'nem';
}

function rowMap(rows = [], keyFn) {
  return new Map((rows || []).map((row) => [keyFn(row), row]));
}

function permissionChangeDetails(before = {}, after = {}) {
  const changes = [];
  const companyLabels = new Map(listCompanies(false).map((company) => [
    Number(company.id),
    `${company.code} - ${company.name}`,
  ]));
  const beforeCompanies = rowMap(before.companyPermissions, (row) => Number(row.companyId));
  const afterCompanies = rowMap(after.companyPermissions, (row) => Number(row.companyId));
  const companyIds = [...new Set([...beforeCompanies.keys(), ...afterCompanies.keys()])]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  companyIds.forEach((companyId) => {
    const oldRow = beforeCompanies.get(companyId) || {};
    const newRow = afterCompanies.get(companyId) || {};
    [
      ['canView', 'láthatja'],
      ['canManage', 'kezelheti'],
    ].forEach(([key, label]) => {
      const oldValue = Boolean(oldRow[key]);
      const newValue = Boolean(newRow[key]);
      if (oldValue !== newValue) {
        changes.push(`Cég ${companyLabels.get(companyId) || companyId} / ${label}: ${yesNo(oldValue)} -> ${yesNo(newValue)}`);
      }
    });
  });

  const moduleKey = (row) => `${row.moduleKey}:${row.actionKey}`;
  const beforeModules = rowMap(before.modulePermissions, moduleKey);
  const afterModules = rowMap(after.modulePermissions, moduleKey);
  const moduleKeys = [...new Set([...beforeModules.keys(), ...afterModules.keys()])].sort();
  moduleKeys.forEach((key) => {
    const oldRow = beforeModules.get(key) || {};
    const newRow = afterModules.get(key) || {};
    const oldValue = Boolean(oldRow.allowed);
    const newValue = Boolean(newRow.allowed);
    if (oldValue === newValue) return;
    const [moduleKeyPart, actionKeyPart] = key.split(':');
    const moduleLabel = moduleMap.get(moduleKeyPart)?.label || moduleKeyPart;
    const actionLabel = actionMap.get(actionKeyPart)?.label || actionKeyPart;
    changes.push(`${moduleLabel} / ${actionLabel}: ${yesNo(oldValue)} -> ${yesNo(newValue)}`);
  });

  if (!changes.length) return 'Nincs változás.';
  if (changes.length <= 80) return changes.join('; ');
  return `${changes.slice(0, 80).join('; ')}; további változás: ${changes.length - 80}`;
}

function saveUserPermissions(targetUserId, payload = {}, actor = {}) {
  if (!roleAllows(actor?.role, 'SA') && !isGlobalSaUser(actor)) {
    throw httpError(403, 'FORBIDDEN', 'Jogosultsagokat csak SA kezelhet.');
  }
  const id = Number(targetUserId);
  const target = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(id);
  if (!target || isGlobalSaUsername(target.username)) throw httpError(404, 'USER_NOT_FOUND', 'A felhasznalo nem talalhato.');
  if (Number(actor?.id) && Number(actor.id) === id) {
    throw httpError(400, 'SELF_PERMISSION_EDIT', 'A sajat jogosultsagi matrixodat nem modosithatod.');
  }
  if (target.role === 'SA') {
    throw httpError(400, 'SA_IMMUTABLE', 'Az SA felhasznalok jogosultsaga implicit teljes, a matrix nem szukitheti.');
  }
  const before = snapshotForUser(id);
  const companies = normalizedCompanyRows(payload.companyPermissions);
  const modules = normalizedModuleRows(payload.modulePermissions);
  const now = nowIso();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM user_company_permissions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM user_module_permissions WHERE user_id = ?').run(id);
    const insertCompany = db.prepare(`
      INSERT INTO user_company_permissions (user_id, company_id, can_view, can_manage, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    companies.forEach((row) => insertCompany.run(id, row.companyId, row.canView ? 1 : 0, row.canManage ? 1 : 0, now, actor.username || ''));
    const insertModule = db.prepare(`
      INSERT INTO user_module_permissions (user_id, module_key, action_key, allowed, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    modules.forEach((row) => insertModule.run(id, row.moduleKey, row.actionKey, row.allowed ? 1 : 0, now, actor.username || ''));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  const after = snapshotForUser(id);
  const changeDetails = permissionChangeDetails(before, after);
  logEvent({
    userId: actor.id || null,
    username: actor.username || '',
    severity: 'AUDIT',
    module: 'permissions',
    action: 'matrix_update',
    details: `Felhasználó: ${target.username}; ${changeDetails}`,
  });
  const { sendNotification } = require('./email-service');
  sendNotification('security_event', {
    username: actor.username || '',
    subject: 'MGM Reporting - jogosultság módosítás',
    text: [
      'Jogosultsági mátrix módosítás történt.',
      '',
      `Módosította: ${actor.username || '-'}`,
      `Felhasználó: ${target.username}`,
      `Változás: ${changeDetails}`,
    ].join('\n'),
  }).catch(() => null);
  return listPermissionMatrix(id);
}

module.exports = {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  hasPermission,
  requirePermission,
  requireCompanyAccess,
  visibleCompaniesForUser,
  effectivePermissionsForUser,
  listPermissionMatrix,
  saveUserPermissions,
};
