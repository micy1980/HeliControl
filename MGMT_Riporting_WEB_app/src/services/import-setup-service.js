const { db } = require('../db');
const { parseJsonField } = require('./import-service');

function firstCompanyId() {
  return db.prepare('SELECT id FROM companies ORDER BY id LIMIT 1').get()?.id || 1;
}

function activeCompanyId() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'active_company_id'").get();
  return Number(row?.value || firstCompanyId());
}

function listImportTemplates(importType = 'coa', companyId = activeCompanyId()) {
  return db.prepare(`
    SELECT id, import_type AS importType, name, mapping_json AS mappingJson,
           selected_rule_ids_json AS selectedRuleIdsJson,
           include_summary_rows AS includeSummaryRows,
           include_inactive AS includeInactive,
           updated_at AS updatedAt
    FROM import_templates
    WHERE company_id = ? AND import_type = ?
    ORDER BY name
  `).all(companyId, importType).map((row) => ({
    id: row.id,
    importType: row.importType,
    name: row.name,
    mapping: parseJsonField(row.mappingJson, {}),
    selectedRuleIds: parseJsonField(row.selectedRuleIdsJson, []),
    includeSummaryRows: Boolean(row.includeSummaryRows),
    includeInactive: Boolean(row.includeInactive),
    updatedAt: row.updatedAt,
  }));
}

function listSummaryRules(activeOnly = false, companyId = activeCompanyId()) {
  const sql = `
    SELECT id, name, rule_type, column_name, operator, match_value,
           active, updated_at
    FROM summary_rules
    WHERE company_id = ?
      ${activeOnly ? 'AND active = 1' : ''}
    ORDER BY rule_type, name
  `;
  return db.prepare(sql).all(companyId).map((row) => ({
    id: row.id,
    name: row.name,
    ruleType: row.rule_type,
    column: row.column_name,
    columnName: row.column_name,
    operator: row.operator,
    value: row.match_value,
    matchValue: row.match_value,
    enabled: Boolean(row.active),
    active: Boolean(row.active),
    updatedAt: row.updated_at,
  }));
}

module.exports = {
  listImportTemplates,
  listSummaryRules,
};
