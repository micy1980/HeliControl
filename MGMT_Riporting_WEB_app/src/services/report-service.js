const { db } = require('../db');
const { ruleMap } = require('./validation-rule-service');

function getFxRate(year, month, currency, statementType, fxMode) {
  if (currency === 'HUF') return 1;
  const row = db.prepare(`
    SELECT average_rate, month_end_rate FROM fx_rates
    WHERE year = ? AND month = ? AND currency = ?
  `).get(year, month, currency);
  const fallback = { EUR: 390, USD: 360, CHF: 405, GBP: 455 }[currency] || 1;
  if (!row) return fallback;
  if (fxMode === 'FX2' && statementType === 'PL') return row.average_rate || fallback;
  return row.month_end_rate || fallback;
}

function convertAmount(amount, year, month, currency, statementType, fxMode) {
  if (currency === 'HUF') return amount;
  const rate = getFxRate(year, month, currency, statementType, fxMode);
  return rate ? amount / rate : amount;
}

function buildReport({ companyId, year, period, currency, fxMode }) {
  const coa = db.prepare(`
    SELECT coa.*,
           COALESCE(NULLIF(mgmt.statement_type, ''), NULLIF(cons.statement_type, ''), coa.statement_type) AS effective_statement_type,
           NULLIF(coa.reporting_category, 'UNMAPPED') AS management_report_code,
           NULLIF(coa.cons_account, 'UNMAPPED') AS cons_report_code
    FROM chart_of_accounts coa
    LEFT JOIN report_codes mgmt ON mgmt.company_id = coa.company_id AND mgmt.structure_type = 'MGMT' AND mgmt.code = NULLIF(coa.reporting_category, 'UNMAPPED')
    LEFT JOIN report_codes cons ON cons.company_id = coa.company_id AND cons.structure_type = 'CONS' AND cons.code = NULLIF(coa.cons_account, 'UNMAPPED')
    WHERE coa.company_id = ?
    ORDER BY coa.sort_order, coa.id
  `).all(companyId);

  const glRows = db.prepare(`
    SELECT gl_number, scenario, month, amount FROM gl_data
    WHERE company_id = ? AND year = ? AND month <= ?
  `).all(companyId, year, period);

  const budgetRows = db.prepare(`
    SELECT gl_number, scenario, month, amount FROM budget_data
    WHERE company_id = ? AND year = ? AND month <= ?
  `).all(companyId, year, period);

  const buckets = new Map();
  const ensure = (glNumber) => {
    if (!buckets.has(glNumber)) {
      buckets.set(glNumber, { ACT: {}, PY: {}, BUD: {}, FCST: {} });
    }
    return buckets.get(glNumber);
  };
  glRows.forEach((row) => {
    const bucket = ensure(row.gl_number);
    bucket[row.scenario][row.month] = (bucket[row.scenario][row.month] || 0) + row.amount;
  });
  budgetRows.forEach((row) => {
    const bucket = ensure(row.gl_number);
    bucket[row.scenario][row.month] = (bucket[row.scenario][row.month] || 0) + row.amount;
  });

  const result = coa.map((item) => {
    const bucket = buckets.get(item.gl_number) || { ACT: {}, PY: {}, BUD: {}, FCST: {} };
    const sumScenario = (scenario) => {
      let ytd = 0;
      let current = 0;
      for (let m = 1; m <= period; m += 1) {
        const raw = bucket[scenario][m] || 0;
        const converted = convertAmount(raw, year, m, currency, item.statement_type, fxMode);
        ytd += converted;
        if (m === period) current = converted;
      }
      return { current, ytd };
    };
    const act = sumScenario('ACT');
    const py = sumScenario('PY');
    const bud = sumScenario('BUD');
    const fcst = sumScenario('FCST');
    return {
      glNumber: item.gl_number,
      glName: item.gl_name,
      consAccount: item.cons_report_code || '',
      reportingCategory: item.management_report_code || '',
      statementType: item.effective_statement_type || item.statement_type,
      currentMonth: act.current,
      actYtd: act.ytd,
      pyYtd: py.ytd,
      budYtd: bud.ytd,
      fcstYtd: fcst.ytd,
      vsPy: act.ytd - py.ytd,
      vsBud: act.ytd - bud.ytd,
      vsFcst: act.ytd - fcst.ytd,
    };
  });

  const totals = result.reduce((acc, row) => {
    const sign = row.statementType === 'PL' && ['COGS', 'Operating Expenses'].includes(row.reportingCategory) ? -1 : 1;
    acc.actYtd += row.actYtd * sign;
    acc.pyYtd += row.pyYtd * sign;
    acc.budYtd += row.budYtd * sign;
    acc.fcstYtd += row.fcstYtd * sign;
    return acc;
  }, { actYtd: 0, pyYtd: 0, budYtd: 0, fcstYtd: 0 });

  return { rows: result, totals, currency, fxMode, period, year };
}

function emptyMonthlyValues() {
  return Object.fromEntries(Array.from({ length: 12 }, (_unused, idx) => [String(idx + 1), 0]));
}

function buildTrialBalance({ companyId, year }) {
  const coa = db.prepare(`
    SELECT coa.gl_number AS glNumber, coa.gl_name AS glName,
           NULLIF(coa.cons_account, 'UNMAPPED') AS consAccount,
           COALESCE(cons.name, '') AS consAccountName,
           NULLIF(coa.reporting_category, 'UNMAPPED') AS reportingCategory,
           COALESCE(mgmt.name, '') AS reportingCategoryName,
           COALESCE(NULLIF(mgmt.statement_type, ''), NULLIF(cons.statement_type, ''), coa.statement_type) AS statementType,
           coa.sort_order AS sortOrder,
           NULLIF(coa.reporting_category, 'UNMAPPED') AS managementReportCode,
           COALESCE(mgmt.name, '') AS managementReportName,
           mgmt.id AS managementReportExists,
           COALESCE(mgmt.active, 0) AS managementReportActive,
           COALESCE(mgmt.group1_code, '') AS managementGroup1Code,
           COALESCE(mgmt_g1.name, '') AS managementGroup1Name,
           mgmt_g1.id AS managementGroup1Exists,
           COALESCE(mgmt_g1.active, 0) AS managementGroup1Active,
           COALESCE(mgmt.group2_code, '') AS managementGroup2Code,
           COALESCE(mgmt_g2.name, '') AS managementGroup2Name,
           mgmt_g2.id AS managementGroup2Exists,
           COALESCE(mgmt_g2.active, 0) AS managementGroup2Active,
           COALESCE(mgmt.group3_code, '') AS managementGroup3Code,
           COALESCE(mgmt_g3.name, '') AS managementGroup3Name,
           mgmt_g3.id AS managementGroup3Exists,
           COALESCE(mgmt_g3.active, 0) AS managementGroup3Active,
           COALESCE(mgmt.statement_type, '') AS managementStatementType,
           NULLIF(coa.cons_account, 'UNMAPPED') AS consReportCode,
           COALESCE(cons.name, '') AS consReportName,
           cons.id AS consReportExists,
           COALESCE(cons.active, 0) AS consReportActive,
           COALESCE(cons.group1_code, '') AS consGroup1Code,
           COALESCE(cons_g1.name, '') AS consGroup1Name,
           cons_g1.id AS consGroup1Exists,
           COALESCE(cons_g1.active, 0) AS consGroup1Active,
           COALESCE(cons.group2_code, '') AS consGroup2Code,
           COALESCE(cons_g2.name, '') AS consGroup2Name,
           cons_g2.id AS consGroup2Exists,
           COALESCE(cons_g2.active, 0) AS consGroup2Active,
           COALESCE(cons.group3_code, '') AS consGroup3Code,
           COALESCE(cons_g3.name, '') AS consGroup3Name,
           cons_g3.id AS consGroup3Exists,
           COALESCE(cons_g3.active, 0) AS consGroup3Active,
           COALESCE(cons.statement_type, '') AS consStatementType
    FROM chart_of_accounts coa
    LEFT JOIN report_codes mgmt ON mgmt.company_id = coa.company_id AND mgmt.structure_type = 'MGMT' AND mgmt.code = NULLIF(coa.reporting_category, 'UNMAPPED')
    LEFT JOIN report_groups mgmt_g1 ON mgmt_g1.company_id = coa.company_id AND mgmt_g1.structure_type = 'MGMT' AND mgmt_g1.group_level = 1 AND mgmt_g1.code = mgmt.group1_code
    LEFT JOIN report_groups mgmt_g2 ON mgmt_g2.company_id = coa.company_id AND mgmt_g2.structure_type = 'MGMT' AND mgmt_g2.group_level = 2 AND mgmt_g2.code = mgmt.group2_code
    LEFT JOIN report_groups mgmt_g3 ON mgmt_g3.company_id = coa.company_id AND mgmt_g3.structure_type = 'MGMT' AND mgmt_g3.group_level = 3 AND mgmt_g3.code = mgmt.group3_code
    LEFT JOIN report_codes cons ON cons.company_id = coa.company_id AND cons.structure_type = 'CONS' AND cons.code = NULLIF(coa.cons_account, 'UNMAPPED')
    LEFT JOIN report_groups cons_g1 ON cons_g1.company_id = coa.company_id AND cons_g1.structure_type = 'CONS' AND cons_g1.group_level = 1 AND cons_g1.code = cons.group1_code
    LEFT JOIN report_groups cons_g2 ON cons_g2.company_id = coa.company_id AND cons_g2.structure_type = 'CONS' AND cons_g2.group_level = 2 AND cons_g2.code = cons.group2_code
    LEFT JOIN report_groups cons_g3 ON cons_g3.company_id = coa.company_id AND cons_g3.structure_type = 'CONS' AND cons_g3.group_level = 3 AND cons_g3.code = cons.group3_code
    WHERE coa.company_id = ? AND coa.is_summary = 0
    ORDER BY coa.sort_order, coa.id
  `).all(companyId);
  const glRows = db.prepare(`
    SELECT gl_number AS glNumber, month, SUM(amount) AS amount
    FROM gl_data
    WHERE company_id = ? AND year = ? AND scenario = 'ACT'
    GROUP BY gl_number, month
  `).all(companyId, year);
  const valuesByGl = new Map();
  glRows.forEach((row) => {
    if (!valuesByGl.has(row.glNumber)) valuesByGl.set(row.glNumber, emptyMonthlyValues());
    valuesByGl.get(row.glNumber)[String(row.month)] = Number(row.amount || 0);
  });
  const rows = coa.map((item) => {
    const months = valuesByGl.get(item.glNumber) || emptyMonthlyValues();
    const total = Object.values(months).reduce((sum, value) => sum + Number(value || 0), 0);
    return { ...item, months, total };
  });
  const importsByMonth = {};
  db.prepare(`
    SELECT s.month, s.batch_id AS batchId, s.file_name AS fileName, s.imported_rows AS importedRows,
           s.activated_at AS activatedAt, COALESCE(u.username, '') AS activatedBy
    FROM import_sessions s
    LEFT JOIN users u ON u.id = s.activated_by
    WHERE s.company_id = ? AND s.year = ? AND s.import_type = 'GL'
      AND s.status = 'ACTIVE' AND s.overwrite_status <> 'OVERWRITTEN'
      AND EXISTS (
        SELECT 1
        FROM gl_data gd
        WHERE gd.company_id = s.company_id
          AND gd.year = s.year
          AND gd.month = s.month
          AND gd.scenario = 'ACT'
          AND gd.batch_id = s.batch_id
      )
    ORDER BY s.month
  `).all(companyId, year).forEach((row) => {
    importsByMonth[String(row.month)] = row;
  });
  return {
    year,
    rows,
    importsByMonth,
  };
}

function rowHasAnyValue(row) {
  return Object.values(row.months || {}).some((value) => Math.abs(Number(value || 0)) > 0.000001);
}

function validationRule(rules, key) {
  const rule = rules.get(key);
  if (!rule?.enabled) return null;
  return rule;
}

function pushIssue(issues, rule, row, fieldKey, fieldLabel, message) {
  issues.push({
    severity: rule.severity,
    fieldKey,
    fieldLabel,
    glNumber: row.glNumber,
    glName: row.glName,
    message,
  });
}

function validateTrialBalance({ companyId, year }) {
  const data = buildTrialBalance({ companyId, year });
  const rules = ruleMap(companyId, 'LEDGER_REPORT');
  const issues = [];
  const checkReportCode = (row, prefix, fieldKey, label) => {
    const rule = validationRule(rules, fieldKey);
    if (!rule) return;
    const code = row[fieldKey] || '';
    if (!code) {
      pushIssue(issues, rule, row, fieldKey, label, `Hiányzó ${label}.`);
      return;
    }
    if (!row[`${prefix}ReportExists`]) {
      pushIssue(issues, rule, row, fieldKey, label, `Nem létező ${label}: ${code}.`);
      return;
    }
    if (!row[`${prefix}ReportActive`]) {
      pushIssue(issues, rule, row, fieldKey, label, `Inaktív ${label}: ${code}.`);
    }
  };
  const checkStatement = (row, prefix, fieldKey, label) => {
    const rule = validationRule(rules, fieldKey);
    if (!rule) return;
    if (!row[fieldKey]) pushIssue(issues, rule, row, fieldKey, label, `Hiányzó ${label}.`);
  };
  const checkGroup = (row, prefix, level, fieldKey, label) => {
    const rule = validationRule(rules, fieldKey);
    if (!rule) return;
    const code = row[fieldKey] || '';
    if (!code) {
      pushIssue(issues, rule, row, fieldKey, label, `Hiányzó ${label}.`);
      return;
    }
    if (!row[`${prefix}Group${level}Exists`]) {
      pushIssue(issues, rule, row, fieldKey, label, `Nem létező ${label}: ${code}.`);
      return;
    }
    if (!row[`${prefix}Group${level}Active`]) {
      pushIssue(issues, rule, row, fieldKey, label, `Inaktív ${label}: ${code}.`);
    }
  };

  data.rows.filter(rowHasAnyValue).forEach((row) => {
    checkReportCode(row, 'management', 'managementReportCode', 'Management riport kód');
    checkReportCode(row, 'cons', 'consReportCode', 'Konszi riport kód');
    checkStatement(row, 'management', 'managementStatementType', 'Management BS/PL');
    checkStatement(row, 'cons', 'consStatementType', 'Konszi BS/PL');
    checkGroup(row, 'management', 1, 'managementGroup1Code', 'Management Csoport1');
    checkGroup(row, 'management', 2, 'managementGroup2Code', 'Management Csoport2');
    checkGroup(row, 'management', 3, 'managementGroup3Code', 'Management Csoport3');
    checkGroup(row, 'cons', 1, 'consGroup1Code', 'Konszi Csoport1');
    checkGroup(row, 'cons', 2, 'consGroup2Code', 'Konszi Csoport2');
    checkGroup(row, 'cons', 3, 'consGroup3Code', 'Konszi Csoport3');
  });

  return {
    year,
    checkedRows: data.rows.filter(rowHasAnyValue).length,
    issueCount: issues.length,
    errorCount: issues.filter((issue) => issue.severity === 'ERROR').length,
    warningCount: issues.filter((issue) => issue.severity === 'WARNING').length,
    issues,
  };
}

module.exports = {
  getFxRate,
  convertAmount,
  buildReport,
  buildTrialBalance,
  validateTrialBalance,
};
