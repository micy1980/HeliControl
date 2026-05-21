const { ROLE_LEVEL } = require('../constants');
const { db } = require('../db');
const { activeCompanyId } = require('./settings-service');

function nowIso() {
  return new Date().toISOString();
}

function isGlobalSaUser(user) {
  return Boolean(user?.global_sa || user?.globalSa);
}

function logEvent({ companyId = null, userId = null, username = '', severity = 'INFO', module = 'app', action = '', details = '' }) {
  const scopedCompanyId = companyId === undefined || companyId === null || companyId === '' ? null : Number(companyId);
  db.prepare(`
    INSERT INTO event_log (created_at, company_id, user_id, username, severity, module, action, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(nowIso(), Number.isFinite(scopedCompanyId) ? scopedCompanyId : null, userId, username, severity, module, action, details);
}

function auditValue(value, field = {}) {
  if (field.boolean) return Number(value) ? 'Igen' : 'Nem';
  if (field.secret) return value === undefined || value === null || value === '' ? '' : '***';
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, 500);
}

function auditCompareValue(value, field = {}) {
  if (field.boolean) return Number(value) ? '1' : '0';
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function logAuditChanges({
  companyId,
  user = {},
  table,
  entityKey,
  action = 'update',
  module = 'master_data',
  before = {},
  after = {},
  fields = [],
}) {
  let count = 0;
  fields.forEach((field) => {
    const oldValue = before ? before[field.key] : undefined;
    const newValue = after ? after[field.key] : undefined;
    if (auditCompareValue(oldValue, field) === auditCompareValue(newValue, field)) return;
    logEvent({
      companyId,
      userId: user?.id || null,
      username: user?.username || '',
      severity: 'AUDIT',
      module,
      action,
      details: `Tábla: ${table}; Kulcs: ${entityKey}; Mező: ${field.label || field.key}; Régi: "${auditValue(oldValue, field)}"; Új: "${auditValue(newValue, field)}"`,
    });
    count += 1;
  });
  return count;
}

function logTypeFor(module, action, severity = 'INFO') {
  if (severity === 'ERROR' || module === 'server' || module === 'backup') return 'system';
  if (module === 'auth' || module === 'license' || module === 'security' || module === 'notifications') return 'security';
  if (module === 'validation') return 'validation';
  if (['coa', 'gl', 'budget', 'templates'].includes(module) || action === 'import') return 'import';
  if (['master_data', 'summary_rules'].includes(module)) return 'master';
  if (['admin', 'users', 'companies', 'settings', 'permissions'].includes(module)) return 'admin';
  return 'system';
}

function canViewAllCompanyLogs(user) {
  return isGlobalSaUser(user) || (ROLE_LEVEL[user?.role] || 0) >= ROLE_LEVEL.SA;
}

function visibleLogRowsFor(user, { type = 'all', scope = 'company', companyId = activeCompanyId(), limit = null } = {}) {
  const isAdmin = (ROLE_LEVEL[user?.role] || 0) >= ROLE_LEVEL.ADMIN;
  const allCompanies = scope === 'all' && canViewAllCompanyLogs(user);
  const limitSql = limit ? `LIMIT ${Number(limit)}` : '';
  let rows;
  if (allCompanies) {
    rows = db.prepare(`
      SELECT l.*, COALESCE(c.code, '') AS companyCode
      FROM event_log l
      LEFT JOIN companies c ON c.id = l.company_id
      ORDER BY l.created_at DESC
      ${limitSql}
    `).all();
  } else if (isAdmin) {
    rows = db.prepare(`
      SELECT l.*, COALESCE(c.code, '') AS companyCode
      FROM event_log l
      LEFT JOIN companies c ON c.id = l.company_id
      WHERE l.company_id = ? OR l.company_id IS NULL
      ORDER BY l.created_at DESC
      ${limitSql}
    `).all(companyId);
  } else {
    rows = db.prepare(`
      SELECT l.*, COALESCE(c.code, '') AS companyCode
      FROM event_log l
      LEFT JOIN companies c ON c.id = l.company_id
      WHERE l.user_id = ? AND (l.company_id = ? OR l.company_id IS NULL)
      ORDER BY l.created_at DESC
      ${limitSql}
    `).all(user.id, companyId);
  }
  rows = rows.map((row) => ({ ...row, logType: logTypeFor(row.module, row.action, row.severity) }));
  if (type !== 'all') rows = rows.filter((row) => row.logType === type);
  return { rows, scope: allCompanies ? 'all' : 'company', canViewAllCompanies: canViewAllCompanyLogs(user) };
}

module.exports = {
  logEvent,
  logAuditChanges,
  logTypeFor,
  canViewAllCompanyLogs,
  visibleLogRowsFor,
};
