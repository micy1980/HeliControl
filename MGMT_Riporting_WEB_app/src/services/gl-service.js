const { db } = require('../db');
const { httpError } = require('../http-utils');
const {
  parseLedgerNumber,
  applyColumnMapping,
  cleanImportedText,
  comparableName,
} = require('./import-service');
const { cleanMasterCode } = require('./coa-service');
const { ruleMap } = require('./validation-rule-service');

function nowIso() {
  return new Date().toISOString();
}

const GL_IMPORT_FIELDS = [
  { key: 'gl_number', label: 'GL szám', required: true, candidates: ['gl_number'] },
  { key: 'gl_name', label: 'GL megnevezés', candidates: ['gl_name'] },
  { key: 'debit', label: 'Tartozik', candidates: ['debit'] },
  { key: 'credit', label: 'Követel', candidates: ['credit'] },
  { key: 'amount', label: 'Balance / egyenleg', candidates: ['amount'] },
];

function defaultGlMappingIssues(mapping) {
  const issues = [];
  if (!mapping?.gl_number) issues.push('Hiányzik a GL szám megfeleltetése.');
  if (!((mapping?.debit && mapping?.credit) || mapping?.amount)) {
    issues.push('Hiányzik a számadat-forrás: Tartozik + Követel vagy Balance / egyenleg.');
  }
  return issues;
}

function glMappingIssues(mapping, companyId = null) {
  const rules = companyId ? ruleMap(companyId, 'GL_IMPORT') : null;
  if (!rules) return defaultGlMappingIssues(mapping);
  const issues = [];
  const needsError = (fieldKey, fallback = true) => {
    const rule = rules.get(fieldKey);
    return rule ? rule.enabled && rule.severity === 'ERROR' : fallback;
  };
  if (needsError('gl_number') && !mapping?.gl_number) issues.push('Hiányzik a GL szám megfeleltetése.');
  if (needsError('gl_name', false) && !mapping?.gl_name) issues.push('Hiányzik a GL megnevezés megfeleltetése.');
  if (needsError('amount_source') && !((mapping?.debit && mapping?.credit) || mapping?.amount)) {
    issues.push('Hiányzik a számadat-forrás: Tartozik + Követel vagy Balance / egyenleg.');
  }
  return issues;
}

function roundMoney(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatLedgerErrorNumber(value) {
  return new Intl.NumberFormat('hu-HU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(value));
}

function calculateGlAmounts(rawRow, mappedRow, mapping) {
  const result = { debit: 0, credit: 0, amount: 0, errors: [] };
  const hasDebitCredit = Boolean(mapping.debit && mapping.credit);
  const hasBalance = Boolean(mapping.amount);
  if (hasDebitCredit) {
    const debitParsed = parseLedgerNumber(mappedRow.debit);
    const creditParsed = parseLedgerNumber(mappedRow.credit);
    if (!debitParsed.ok) result.errors.push(debitParsed.message);
    if (!creditParsed.ok) result.errors.push(creditParsed.message);
    result.debit = roundMoney(Math.abs(debitParsed.value || 0));
    result.credit = roundMoney(-Math.abs(creditParsed.value || 0));
    const calculatedAmount = roundMoney(result.debit + result.credit);
    if (result.debit === 0 && result.credit === 0 && hasBalance) {
      const balanceParsed = parseLedgerNumber(mappedRow.amount);
      if (!balanceParsed.ok) result.errors.push(balanceParsed.message);
      result.amount = roundMoney(balanceParsed.value || 0);
      result.debit = result.amount > 0 ? result.amount : 0;
      result.credit = result.amount < 0 ? result.amount : 0;
    } else {
      result.amount = calculatedAmount;
      if (hasBalance) {
        const balanceParsed = parseLedgerNumber(mappedRow.amount);
        if (!balanceParsed.ok) {
          result.errors.push(balanceParsed.message);
        } else {
          const balanceAmount = roundMoney(balanceParsed.value || 0);
          if (Math.abs(calculatedAmount - balanceAmount) > 0.005) {
            result.errors.push(`A Tartozik/Követel egyenlege (${formatLedgerErrorNumber(calculatedAmount)}) nem egyezik a Balance értékkel (${formatLedgerErrorNumber(balanceAmount)}).`);
          }
        }
      }
    }
    return result;
  }
  const balanceParsed = parseLedgerNumber(mappedRow.amount);
  if (!balanceParsed.ok) result.errors.push(balanceParsed.message);
  result.amount = roundMoney(balanceParsed.value || 0);
  result.debit = result.amount > 0 ? result.amount : 0;
  result.credit = result.amount < 0 ? result.amount : 0;
  return result;
}

function validateCoaReportReference(coa, structureType) {
  const prefix = structureType === 'CONS' ? 'cons' : 'management';
  const code = cleanMasterCode(coa?.[`${prefix}ReportCode`]);
  const active = coa?.[`${prefix}ReportActive`];
  const statementType = String(coa?.[`${prefix}StatementType`] || '').trim();
  const errors = [];
  if (!code) {
    errors.push(structureType === 'CONS' ? 'MISSING_CONS_REPORT_CODE' : 'MISSING_MANAGEMENT_REPORT_CODE');
    return errors;
  }
  if (!coa?.[`${prefix}ReportExists`]) {
    errors.push(structureType === 'CONS' ? 'INVALID_CONS_REPORT_CODE' : 'INVALID_MANAGEMENT_REPORT_CODE');
    return errors;
  }
  if (!active) errors.push(structureType === 'CONS' ? 'INACTIVE_CONS_REPORT_CODE' : 'INACTIVE_MANAGEMENT_REPORT_CODE');
  if (!statementType) errors.push(structureType === 'CONS' ? 'MISSING_CONS_BSPL' : 'MISSING_MANAGEMENT_BSPL');
  [1, 2, 3].forEach((level) => {
    const requiredKey = `${prefix}Group${level}Required`;
    const codeKey = `${prefix}Group${level}Code`;
    const existsKey = `${prefix}Group${level}Exists`;
    const activeKey = `${prefix}Group${level}Active`;
    const groupCode = cleanMasterCode(coa?.[codeKey]);
    if (coa?.[requiredKey] && !groupCode) {
      errors.push(`${structureType === 'CONS' ? 'CONS' : 'MANAGEMENT'}_GROUP${level}_MISSING`);
    }
    if (groupCode && !coa?.[existsKey]) {
      errors.push(`${structureType === 'CONS' ? 'CONS' : 'MANAGEMENT'}_GROUP${level}_INVALID`);
    }
    if (groupCode && coa?.[existsKey] && !coa?.[activeKey]) {
      errors.push(`${structureType === 'CONS' ? 'CONS' : 'MANAGEMENT'}_GROUP${level}_INACTIVE`);
    }
  });
  return errors;
}

const ACTIVATION_BLOCKING_BUSINESS_ERRORS = new Set([
  'UNKNOWN_GL',
  'SUMMARY_GL',
]);

function isActivationBlockingBusinessError(errorCode) {
  return ACTIVATION_BLOCKING_BUSINESS_ERRORS.has(errorCode);
}

function hasActivationBlockingBusinessErrors(row) {
  return (row.businessErrors || []).some(isActivationBlockingBusinessError);
}

function validateGlTable({ table, mapping, companyId, existingRows = null }) {
  const stats = {
    total: table.rows.length,
    importable: 0,
    skippedZero: 0,
    fileErrors: 0,
    businessErrors: 0,
    reportReferenceErrors: 0,
    softErrors: 0,
    unknownGl: 0,
  };
  const mappingErrors = glMappingIssues(mapping, companyId);
  if (mappingErrors.length) {
    return { stats, mappingErrors, fileErrors: [], rows: [], canCreateImport: false, status: 'MAPPING_ERROR' };
  }
  const coaRows = db.prepare(`
    SELECT coa.gl_number AS glNumber, coa.gl_name AS glName, coa.is_summary AS isSummary,
           NULLIF(coa.reporting_category, 'UNMAPPED') AS managementReportCode,
           mgmt.id AS managementReportExists, mgmt.active AS managementReportActive,
           mgmt.statement_type AS managementStatementType,
           mgmt.group1_code AS managementGroup1Code, mgmt.group1_required AS managementGroup1Required, mgmt_g1.id AS managementGroup1Exists, mgmt_g1.active AS managementGroup1Active,
           mgmt.group2_code AS managementGroup2Code, mgmt.group2_required AS managementGroup2Required, mgmt_g2.id AS managementGroup2Exists, mgmt_g2.active AS managementGroup2Active,
           mgmt.group3_code AS managementGroup3Code, mgmt.group3_required AS managementGroup3Required, mgmt_g3.id AS managementGroup3Exists, mgmt_g3.active AS managementGroup3Active,
           NULLIF(coa.cons_account, 'UNMAPPED') AS consReportCode,
           cons.id AS consReportExists, cons.active AS consReportActive,
           cons.statement_type AS consStatementType,
           cons.group1_code AS consGroup1Code, cons.group1_required AS consGroup1Required, cons_g1.id AS consGroup1Exists, cons_g1.active AS consGroup1Active,
           cons.group2_code AS consGroup2Code, cons.group2_required AS consGroup2Required, cons_g2.id AS consGroup2Exists, cons_g2.active AS consGroup2Active,
           cons.group3_code AS consGroup3Code, cons.group3_required AS consGroup3Required, cons_g3.id AS consGroup3Exists, cons_g3.active AS consGroup3Active
    FROM chart_of_accounts coa
    LEFT JOIN report_codes mgmt ON mgmt.company_id = coa.company_id AND mgmt.structure_type = 'MGMT' AND mgmt.code = NULLIF(coa.reporting_category, 'UNMAPPED')
    LEFT JOIN report_groups mgmt_g1 ON mgmt_g1.company_id = coa.company_id AND mgmt_g1.structure_type = 'MGMT' AND mgmt_g1.group_level = 1 AND mgmt_g1.code = mgmt.group1_code
    LEFT JOIN report_groups mgmt_g2 ON mgmt_g2.company_id = coa.company_id AND mgmt_g2.structure_type = 'MGMT' AND mgmt_g2.group_level = 2 AND mgmt_g2.code = mgmt.group2_code
    LEFT JOIN report_groups mgmt_g3 ON mgmt_g3.company_id = coa.company_id AND mgmt_g3.structure_type = 'MGMT' AND mgmt_g3.group_level = 3 AND mgmt_g3.code = mgmt.group3_code
    LEFT JOIN report_codes cons ON cons.company_id = coa.company_id AND cons.structure_type = 'CONS' AND cons.code = NULLIF(coa.cons_account, 'UNMAPPED')
    LEFT JOIN report_groups cons_g1 ON cons_g1.company_id = coa.company_id AND cons_g1.structure_type = 'CONS' AND cons_g1.group_level = 1 AND cons_g1.code = cons.group1_code
    LEFT JOIN report_groups cons_g2 ON cons_g2.company_id = coa.company_id AND cons_g2.structure_type = 'CONS' AND cons_g2.group_level = 2 AND cons_g2.code = cons.group2_code
    LEFT JOIN report_groups cons_g3 ON cons_g3.company_id = coa.company_id AND cons_g3.structure_type = 'CONS' AND cons_g3.group_level = 3 AND cons_g3.code = cons.group3_code
    WHERE coa.company_id = ?
  `).all(companyId);
  const coaByGl = new Map(coaRows.map((row) => [String(row.glNumber), row]));
  const rows = [];
  const fileErrors = [];
  const seen = new Map();
  table.rows.forEach((rawRow, idx) => {
    const sourceRowNo = idx + 2;
    const mappedRow = applyColumnMapping(rawRow, mapping);
    const rawLineHasValue = Object.values(rawRow || {}).some((value) => String(value ?? '').trim() !== '');
    if (!rawLineHasValue) return;
    const glNumber = String(mappedRow.gl_number ?? '').trim();
    const importedGlName = cleanImportedText(mappedRow.gl_name);
    const amountResult = calculateGlAmounts(rawRow, mappedRow, mapping);
    if (amountResult.errors.length) {
      amountResult.errors.forEach((message) => fileErrors.push({ row: sourceRowNo, glNumber, glName: importedGlName, message }));
      return;
    }
    if (amountResult.amount === 0) {
      stats.skippedZero += 1;
      return;
    }
    if (!glNumber) {
      fileErrors.push({ row: sourceRowNo, glNumber: '', glName: importedGlName, message: 'Hiányzik a GL szám.' });
      return;
    }
    const duplicate = seen.get(glNumber);
    if (duplicate) {
      fileErrors.push({ row: duplicate.row, glNumber, glName: duplicate.glName, message: 'Duplikált GL szám a fájlban.' });
      fileErrors.push({ row: sourceRowNo, glNumber, glName: importedGlName, message: 'Duplikált GL szám a fájlban.' });
      return;
    }
    seen.set(glNumber, { row: sourceRowNo, glName: importedGlName });
    const coa = coaByGl.get(glNumber);
    const businessErrors = [];
    const softErrors = [];
    if (!coa) {
      businessErrors.push('UNKNOWN_GL');
      stats.unknownGl += 1;
    } else if (Number(coa.isSummary)) {
      businessErrors.push('SUMMARY_GL');
    }
    const coaName = coa?.glName || '';
    if (!importedGlName) {
      softErrors.push('MISSING_NAME');
    } else if (coaName && comparableName(importedGlName) !== comparableName(coaName)) {
      softErrors.push('NAME_MISMATCH');
    }
    const blockingBusinessErrors = businessErrors.filter(isActivationBlockingBusinessError);
    const reportReferenceErrors = businessErrors.filter((errorCode) => !isActivationBlockingBusinessError(errorCode));
    stats.businessErrors += blockingBusinessErrors.length ? 1 : 0;
    stats.reportReferenceErrors += reportReferenceErrors.length ? 1 : 0;
    stats.softErrors += softErrors.length ? 1 : 0;
    stats.importable += 1;
    const existing = existingRows?.get(glNumber);
    const softOk = existing?.soft_ok ? 1 : 0;
    rows.push({
      id: existing?.id || null,
      sourceRowNo,
      glNumber,
      importedGlName,
      coaGlName: coaName,
      debit: amountResult.debit,
      credit: amountResult.credit,
      amount: amountResult.amount,
      businessErrors,
      blockingBusinessErrors,
      softErrors,
      softOk,
      validationStatus: blockingBusinessErrors.length ? 'BUSINESS_ERROR' : (softErrors.length && !softOk ? 'SOFT_ERROR' : 'OK'),
    });
  });
  const uniqueFileErrors = [];
  const seenFileErrors = new Set();
  fileErrors.forEach((err) => {
    const key = `${err.row}:${err.glNumber}:${err.message}`;
    if (!seenFileErrors.has(key)) {
      seenFileErrors.add(key);
      uniqueFileErrors.push(err);
    }
  });
  stats.fileErrors = uniqueFileErrors.length;
  const unresolvedBusiness = rows.filter(hasActivationBlockingBusinessErrors).length;
  const unresolvedSoft = rows.filter((row) => row.softErrors.length && !row.softOk).length;
  const status = uniqueFileErrors.length ? 'FILE_ERROR' : (unresolvedBusiness || unresolvedSoft ? 'INACTIVE' : 'READY');
  return {
    stats,
    mappingErrors: [],
    fileErrors: uniqueFileErrors,
    rows,
    canCreateImport: !uniqueFileErrors.length,
    status,
  };
}

function glValidationSummary(validation) {
  return {
    mappingErrors: validation.mappingErrors || [],
    fileErrors: validation.fileErrors || [],
    stats: validation.stats || {},
  };
}

function updateGlSessionValidation(sessionId) {
  const session = db.prepare('SELECT * FROM import_sessions WHERE id = ? AND import_type = ?').get(sessionId, 'GL');
  if (!session) throw httpError(404, 'IMPORT_NOT_FOUND', 'Az import nem található.');
  const storedRows = db.prepare('SELECT * FROM gl_import_rows WHERE session_id = ? ORDER BY source_row_no').all(sessionId);
  const existingRows = new Map(storedRows.map((row) => [String(row.gl_number), row]));
  const table = {
    columns: GL_IMPORT_FIELDS.map((field) => field.key),
    rows: storedRows.map((row) => ({
      gl_number: row.gl_number,
      gl_name: row.imported_gl_name,
      debit: row.debit,
      credit: row.credit,
      amount: row.amount,
    })),
  };
  const mapping = { gl_number: 'gl_number', gl_name: 'gl_name', debit: 'debit', credit: 'credit' };
  const validation = validateGlTable({ table, mapping, companyId: session.company_id, existingRows });
  const updateRow = db.prepare(`
    UPDATE gl_import_rows
    SET coa_gl_name = ?, business_errors_json = ?, soft_errors_json = ?,
        validation_status = ?, updated_at = ?
    WHERE id = ?
  `);
  validation.rows.forEach((row) => {
    if (!row.id) return;
    updateRow.run(
      row.coaGlName,
      JSON.stringify(row.businessErrors),
      JSON.stringify(row.softErrors),
      row.validationStatus,
      nowIso(),
      row.id
    );
  });
  const unresolvedBusiness = validation.rows.filter(hasActivationBlockingBusinessErrors).length;
  const unresolvedSoft = validation.rows.filter((row) => row.softErrors.length && !row.softOk).length;
  let status = 'READY';
  if (unresolvedBusiness || unresolvedSoft) {
    status = 'INACTIVE';
  } else if (session.status === 'ACTIVE') {
    status = 'ACTIVE';
  } else if (session.status === 'GL_DELETED') {
    status = 'GL_DELETED';
  }
  db.prepare(`
    UPDATE import_sessions
    SET status = ?, unknown_gl_count = ?, business_error_count = ?, soft_error_count = ?,
        soft_ok_count = ?, validation_json = ?
    WHERE id = ?
  `).run(
    status,
    validation.stats.unknownGl || 0,
    unresolvedBusiness,
    unresolvedSoft,
    validation.rows.filter((row) => row.softOk).length,
    JSON.stringify(glValidationSummary(validation)),
    sessionId
  );
  return { ...validation, session: db.prepare('SELECT * FROM import_sessions WHERE id = ?').get(sessionId), status };
}


module.exports = {
  GL_IMPORT_FIELDS,
  glMappingIssues,
  calculateGlAmounts,
  validateCoaReportReference,
  isActivationBlockingBusinessError,
  hasActivationBlockingBusinessErrors,
  validateGlTable,
  glValidationSummary,
  updateGlSessionValidation,
};
