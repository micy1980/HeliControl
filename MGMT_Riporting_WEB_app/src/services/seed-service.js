const { db } = require('../db');

function nowIso() {
  return new Date().toISOString();
}

function firstCompanyId() {
  return db.prepare('SELECT id FROM companies ORDER BY id LIMIT 1').get()?.id || 1;
}

function activeCompanyId() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'active_company_id'").get();
  return Number(row?.value || firstCompanyId());
}

function seedSummaryRules(companyId = activeCompanyId()) {
  const cleanupRuleName = (ruleType, columnName, matchValue, name) => {
    db.prepare(`
      DELETE FROM summary_rules
      WHERE company_id = ? AND rule_type = ? AND column_name = ? AND match_value = ? AND name <> ?
        AND EXISTS (SELECT 1 FROM summary_rules WHERE company_id = ? AND name = ?)
    `).run(companyId, ruleType, columnName, matchValue, name, companyId, name);
    db.prepare(`
      UPDATE summary_rules
      SET name = ?, updated_at = ?
      WHERE company_id = ? AND rule_type = ? AND column_name = ? AND match_value = ?
        AND NOT EXISTS (SELECT 1 FROM summary_rules WHERE company_id = ? AND name = ?)
    `).run(name, nowIso(), companyId, ruleType, columnName, matchValue, companyId, name);
  };
  cleanupRuleName('summary', 'TIPUS', 'C', 'TIPUS = C összesítő sor');
  cleanupRuleName('inactive', 'ERVENYES', 'N', 'ERVENYES = N inaktív sor');

  const upsert = db.prepare(`
    INSERT INTO summary_rules (company_id, name, rule_type, column_name, operator, match_value, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(company_id, name) DO UPDATE SET
      rule_type = excluded.rule_type,
      column_name = excluded.column_name,
      operator = excluded.operator,
      match_value = excluded.match_value,
      active = excluded.active,
      updated_at = excluded.updated_at
  `);
  upsert.run(companyId, 'TIPUS = C összesítő sor', 'summary', 'TIPUS', 'equals', 'C', nowIso(), nowIso());
  upsert.run(companyId, 'ERVENYES = N inaktív sor', 'inactive', 'ERVENYES', 'equals', 'N', nowIso(), nowIso());
}

function seedMasterData(companyId = activeCompanyId()) {
  db.prepare("UPDATE chart_of_accounts SET cons_account = '' WHERE company_id = ? AND cons_account = 'UNMAPPED'").run(companyId);
  db.prepare("UPDATE chart_of_accounts SET reporting_category = '' WHERE company_id = ? AND reporting_category = 'UNMAPPED'").run(companyId);
  db.prepare("DELETE FROM cons_accounts WHERE company_id = ? AND code = 'UNMAPPED'").run(companyId);
  db.prepare("DELETE FROM reporting_categories WHERE company_id = ? AND code = 'UNMAPPED'").run(companyId);
}

module.exports = {
  seedSummaryRules,
  seedMasterData,
};
