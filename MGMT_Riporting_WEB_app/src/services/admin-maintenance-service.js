const { db } = require('../db');

function clearCompanyYearData(companyId, year, options = {}) {
  const clearCoa = options.clearCoa === true;
  const clearMasterData = options.clearMasterData === true;
  const clearGl = options.clearGl !== false;
  const clearBudget = options.clearBudget !== false;
  const clearImports = options.clearImports !== false;
  const clearEventLog = options.clearEventLog !== false;
  const yearText = String(year);
  const result = {
    chartOfAccounts: clearCoa ? db.prepare('SELECT COUNT(*) AS total FROM chart_of_accounts WHERE company_id = ?').get(companyId).total : 0,
    summaryRules: clearCoa ? db.prepare('SELECT COUNT(*) AS total FROM summary_rules WHERE company_id = ?').get(companyId).total : 0,
    masterData: clearMasterData
      ? db.prepare('SELECT (SELECT COUNT(*) FROM reporting_categories WHERE company_id = ?) + (SELECT COUNT(*) FROM cons_accounts WHERE company_id = ?) + (SELECT COUNT(*) FROM report_groups WHERE company_id = ?) + (SELECT COUNT(*) FROM report_codes WHERE company_id = ?) AS total').get(companyId, companyId, companyId, companyId).total
      : 0,
    glRows: clearGl ? db.prepare('SELECT COUNT(*) AS total FROM gl_data WHERE company_id = ? AND year = ?').get(companyId, year).total : 0,
    budgetRows: clearBudget ? db.prepare('SELECT COUNT(*) AS total FROM budget_data WHERE company_id = ? AND year = ?').get(companyId, year).total : 0,
    importSessions: clearImports ? db.prepare('SELECT COUNT(*) AS total FROM import_sessions WHERE company_id = ? AND year = ?').get(companyId, year).total : 0,
    glDeletedImportSessions: clearGl && !clearImports ? db.prepare(`
      SELECT COUNT(*) AS total
      FROM import_sessions
      WHERE company_id = ? AND year = ? AND import_type = 'GL'
        AND status = 'ACTIVE' AND overwrite_status <> 'OVERWRITTEN'
    `).get(companyId, year).total : 0,
    eventLog: clearEventLog ? db.prepare("SELECT COUNT(*) AS total FROM event_log WHERE company_id = ? AND substr(created_at, 1, 4) = ?").get(companyId, yearText).total : 0,
  };
  db.exec('BEGIN');
  try {
    if (clearGl && !clearImports) {
      db.prepare(`
        UPDATE import_sessions
        SET status = 'GL_DELETED'
        WHERE company_id = ? AND year = ? AND import_type = 'GL'
          AND status = 'ACTIVE' AND overwrite_status <> 'OVERWRITTEN'
      `).run(companyId, year);
    }
    if (clearGl) db.prepare('DELETE FROM gl_data WHERE company_id = ? AND year = ?').run(companyId, year);
    if (clearBudget) db.prepare('DELETE FROM budget_data WHERE company_id = ? AND year = ?').run(companyId, year);
    if (clearImports) db.prepare('DELETE FROM import_sessions WHERE company_id = ? AND year = ?').run(companyId, year);
    if (clearEventLog) db.prepare("DELETE FROM event_log WHERE company_id = ? AND substr(created_at, 1, 4) = ?").run(companyId, yearText);
    if (clearCoa) {
      db.prepare('DELETE FROM chart_of_accounts WHERE company_id = ?').run(companyId);
      db.prepare('DELETE FROM summary_rules WHERE company_id = ?').run(companyId);
    }
    if (clearMasterData) {
      db.prepare('DELETE FROM cons_accounts WHERE company_id = ?').run(companyId);
      db.prepare('DELETE FROM reporting_categories WHERE company_id = ?').run(companyId);
      db.prepare('DELETE FROM report_groups WHERE company_id = ?').run(companyId);
      db.prepare('DELETE FROM report_codes WHERE company_id = ?').run(companyId);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return result;
}

function companyDeleteCounts(companyId) {
  return {
    chartOfAccounts: db.prepare('SELECT COUNT(*) AS total FROM chart_of_accounts WHERE company_id = ?').get(companyId).total,
    glRows: db.prepare('SELECT COUNT(*) AS total FROM gl_data WHERE company_id = ?').get(companyId).total,
    budgetRows: db.prepare('SELECT COUNT(*) AS total FROM budget_data WHERE company_id = ?').get(companyId).total,
    importSessions: db.prepare('SELECT COUNT(*) AS total FROM import_sessions WHERE company_id = ?').get(companyId).total,
    importTemplates: db.prepare('SELECT COUNT(*) AS total FROM import_templates WHERE company_id = ?').get(companyId).total,
    summaryRules: db.prepare('SELECT COUNT(*) AS total FROM summary_rules WHERE company_id = ?').get(companyId).total,
    masterData: db.prepare('SELECT (SELECT COUNT(*) FROM reporting_categories WHERE company_id = ?) + (SELECT COUNT(*) FROM cons_accounts WHERE company_id = ?) + (SELECT COUNT(*) FROM report_groups WHERE company_id = ?) + (SELECT COUNT(*) FROM report_codes WHERE company_id = ?) AS total').get(companyId, companyId, companyId, companyId).total,
    eventLog: db.prepare('SELECT COUNT(*) AS total FROM event_log WHERE company_id = ?').get(companyId).total,
  };
}

function dataCounts(companyId, year) {
  const yearText = String(year);
  return {
    companyId,
    year,
    chartOfAccounts: db.prepare('SELECT COUNT(*) AS total FROM chart_of_accounts WHERE company_id = ?').get(companyId).total,
    summaryRules: db.prepare('SELECT COUNT(*) AS total FROM summary_rules WHERE company_id = ?').get(companyId).total,
    templates: db.prepare('SELECT COUNT(*) AS total FROM import_templates WHERE company_id = ?').get(companyId).total,
    masterData: db.prepare('SELECT (SELECT COUNT(*) FROM reporting_categories WHERE company_id = ?) + (SELECT COUNT(*) FROM cons_accounts WHERE company_id = ?) + (SELECT COUNT(*) FROM report_groups WHERE company_id = ?) + (SELECT COUNT(*) FROM report_codes WHERE company_id = ?) AS total').get(companyId, companyId, companyId, companyId).total,
    glRows: db.prepare('SELECT COUNT(*) AS total FROM gl_data WHERE company_id = ? AND year = ?').get(companyId, year).total,
    budgetRows: db.prepare('SELECT COUNT(*) AS total FROM budget_data WHERE company_id = ? AND year = ?').get(companyId, year).total,
    importSessions: db.prepare('SELECT COUNT(*) AS total FROM import_sessions WHERE company_id = ? AND year = ?').get(companyId, year).total,
    eventLog: db.prepare("SELECT COUNT(*) AS total FROM event_log WHERE company_id = ? AND substr(created_at, 1, 4) = ?").get(companyId, yearText).total,
  };
}

module.exports = {
  clearCompanyYearData,
  companyDeleteCounts,
  dataCounts,
};
