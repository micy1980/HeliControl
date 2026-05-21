const { db } = require('../db');
const { httpError } = require('../http-utils');

function nowIso() {
  return new Date().toISOString();
}

const VALIDATION_SEVERITIES = ['ERROR', 'WARNING', 'INFO'];

const VALIDATION_SCOPES = {
  GL_IMPORT: {
    label: 'GL import',
    description: 'Import előtti alapmezők és számadat forrás ellenőrzése.',
    fields: [
      { key: 'gl_number', label: 'GL szám', defaultEnabled: true, defaultSeverity: 'ERROR' },
      { key: 'gl_name', label: 'GL megnevezés', defaultEnabled: true, defaultSeverity: 'WARNING' },
      { key: 'amount_source', label: 'Számadat forrás (T/K vagy Balance)', defaultEnabled: true, defaultSeverity: 'ERROR' },
      { key: 'debit_credit', label: 'Tartozik + Követel páros', defaultEnabled: false, defaultSeverity: 'WARNING' },
      { key: 'amount', label: 'Balance / egyenleg', defaultEnabled: false, defaultSeverity: 'WARNING' },
    ],
  },
  LEDGER_REPORT: {
    label: 'Főkönyvi kivonat / riport',
    description: 'Aktív GL adatok riportképességi ellenőrzése.',
    fields: [
      { key: 'managementReportCode', label: 'Management riport kód', defaultEnabled: true, defaultSeverity: 'ERROR' },
      { key: 'consReportCode', label: 'Konszi riport kód', defaultEnabled: true, defaultSeverity: 'ERROR' },
      { key: 'managementStatementType', label: 'Management BS/PL', defaultEnabled: true, defaultSeverity: 'ERROR' },
      { key: 'consStatementType', label: 'Konszi BS/PL', defaultEnabled: true, defaultSeverity: 'ERROR' },
      { key: 'managementGroup1Code', label: 'Management Csoport1', defaultEnabled: false, defaultSeverity: 'WARNING' },
      { key: 'managementGroup2Code', label: 'Management Csoport2', defaultEnabled: false, defaultSeverity: 'WARNING' },
      { key: 'managementGroup3Code', label: 'Management Csoport3', defaultEnabled: false, defaultSeverity: 'WARNING' },
      { key: 'consGroup1Code', label: 'Konszi Csoport1', defaultEnabled: false, defaultSeverity: 'WARNING' },
      { key: 'consGroup2Code', label: 'Konszi Csoport2', defaultEnabled: false, defaultSeverity: 'WARNING' },
      { key: 'consGroup3Code', label: 'Konszi Csoport3', defaultEnabled: false, defaultSeverity: 'WARNING' },
    ],
  },
};

function normalizeScope(scope) {
  const key = String(scope || '').trim().toUpperCase();
  if (!VALIDATION_SCOPES[key]) throw httpError(400, 'VALIDATION_SCOPE', 'Érvénytelen validációs kör.');
  return key;
}

function normalizeSeverity(severity) {
  const key = String(severity || '').trim().toUpperCase();
  if (!VALIDATION_SEVERITIES.includes(key)) throw httpError(400, 'VALIDATION_SEVERITY', 'Érvénytelen validációs szint.');
  return key;
}

function fieldDef(scope, fieldKey) {
  const normalizedScope = normalizeScope(scope);
  const def = VALIDATION_SCOPES[normalizedScope].fields.find((field) => field.key === fieldKey);
  if (!def) throw httpError(400, 'VALIDATION_FIELD', 'Érvénytelen validációs mező.');
  return def;
}

function seedValidationRules(companyId) {
  const insert = db.prepare(`
    INSERT INTO validation_rules (company_id, scope, field_key, enabled, severity, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, scope, field_key) DO NOTHING
  `);
  Object.entries(VALIDATION_SCOPES).forEach(([scope, scopeDef]) => {
    scopeDef.fields.forEach((field) => {
      insert.run(
        companyId,
        scope,
        field.key,
        field.defaultEnabled ? 1 : 0,
        field.defaultSeverity,
        nowIso(),
        nowIso()
      );
    });
  });
}

function listValidationRules(companyId) {
  seedValidationRules(companyId);
  const rows = db.prepare(`
    SELECT id, scope, field_key AS fieldKey, enabled, severity, updated_at AS updatedAt
    FROM validation_rules
    WHERE company_id = ?
    ORDER BY scope, field_key
  `).all(companyId);
  const byKey = new Map(rows.map((row) => [`${row.scope}:${row.fieldKey}`, row]));
  const scopes = {};
  Object.entries(VALIDATION_SCOPES).forEach(([scope, scopeDef]) => {
    scopes[scope] = {
      label: scopeDef.label,
      description: scopeDef.description,
      fields: scopeDef.fields.map((field) => {
        const row = byKey.get(`${scope}:${field.key}`);
        return {
          ...field,
          enabled: row ? Boolean(row.enabled) : Boolean(field.defaultEnabled),
          severity: row?.severity || field.defaultSeverity,
          updatedAt: row?.updatedAt || '',
        };
      }),
    };
  });
  return { severities: VALIDATION_SEVERITIES, scopes };
}

function ruleMap(companyId, scope) {
  const normalizedScope = normalizeScope(scope);
  seedValidationRules(companyId);
  const rows = db.prepare(`
    SELECT field_key AS fieldKey, enabled, severity
    FROM validation_rules
    WHERE company_id = ? AND scope = ?
  `).all(companyId, normalizedScope);
  return new Map(rows.map((row) => [row.fieldKey, {
    enabled: Boolean(row.enabled),
    severity: row.severity,
  }]));
}

function saveValidationRules(companyId, rules = [], userId = null) {
  if (!Array.isArray(rules)) throw httpError(400, 'VALIDATION_ERROR', 'A szabalylista ervenytelen.');
  const update = db.prepare(`
    INSERT INTO validation_rules (company_id, scope, field_key, enabled, severity, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, scope, field_key) DO UPDATE SET
      enabled = excluded.enabled,
      severity = excluded.severity,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `);
  db.exec('BEGIN');
  try {
    rules.forEach((rule) => {
      const scope = normalizeScope(rule.scope);
      const field = fieldDef(scope, String(rule.fieldKey || rule.field_key || '').trim());
      update.run(
        companyId,
        scope,
        field.key,
        rule.enabled === false || rule.enabled === 'false' ? 0 : 1,
        normalizeSeverity(rule.severity),
        userId,
        nowIso(),
        nowIso()
      );
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return listValidationRules(companyId);
}

module.exports = {
  VALIDATION_SCOPES,
  VALIDATION_SEVERITIES,
  seedValidationRules,
  listValidationRules,
  ruleMap,
  saveValidationRules,
};
