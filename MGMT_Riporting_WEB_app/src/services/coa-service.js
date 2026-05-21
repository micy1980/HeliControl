const {
  firstValue,
  cleanImportedText,
  isTruthy,
  rulesForType,
  summaryRulesMatch,
} = require('./import-service');

function isInactiveCoaRow(row) {
  const raw = firstValue(row, ['active', 'active_name'], '');
  if (raw === '') return false;
  const value = String(raw).trim().toLowerCase();
  return ['n', 'nem', 'false', '0', 'no'].includes(value);
}

function isSummaryCoaRow(row, glNumber) {
  const explicit = firstValue(row, ['is_summary'], '');
  if (explicit !== '') return Boolean(Number(explicit));
  const type = String(firstValue(row, ['account_type', 'account_type_name'], '')).toLowerCase();
  if (type === 'c' || type.includes('csoport')) return true;
  return String(glNumber).length <= 2;
}

function inferStatementType(glNumber) {
  const first = String(glNumber || '').trim()[0];
  if (['5', '6', '7', '8', '9'].includes(first)) return 'PL';
  return 'BS';
}

function inferReportingCategory(glNumber) {
  const account = String(glNumber || '').trim();
  if (/^\d/.test(account)) return account[0];
  return '';
}

function normalizeStatementType(value, glNumber) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'BS' || normalized === 'PL') return normalized;
  return inferStatementType(glNumber);
}

function cleanMasterCode(value) {
  const text = cleanImportedText(value);
  return text === 'UNMAPPED' ? '' : text;
}

function dbBool(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback ? 1 : 0;
  return isTruthy(value) ? 1 : 0;
}

function detectCoaSummary(mappedRow, rawRow, rules, glNumber, useFallback = true) {
  const typedRules = rulesForType(rules, 'summary');
  const ruleResult = summaryRulesMatch(rawRow, mappedRow, typedRules);
  if (ruleResult !== null) return ruleResult;
  if (!useFallback) return false;
  return isSummaryCoaRow(mappedRow, glNumber);
}

function detectCoaInactive(mappedRow, rawRow, rules, useFallback = true) {
  const typedRules = rulesForType(rules, 'inactive');
  const ruleResult = summaryRulesMatch(rawRow, mappedRow, typedRules);
  if (ruleResult !== null) return ruleResult;
  if (!useFallback) return false;
  return isInactiveCoaRow(mappedRow);
}

function normalizeCoaImportRow(row, idx, forcedSummary = null) {
  const glNumber = String(firstValue(row, ['gl_number', 'gl', 'glnumber', 'account', 'account_number'])).trim();
  if (!glNumber) return null;
  const glName = cleanImportedText(firstValue(row, ['gl_name', 'name'], glNumber));
  const consAccount = cleanMasterCode(firstValue(row, ['cons_account', 'consaccount', 'consolidated_account'], ''));
  const consAccountName = cleanImportedText(firstValue(row, ['cons_account_name', 'consolidated_account_name'], ''));
  const reportingCategory = cleanMasterCode(firstValue(row, ['reporting_category', 'category'], ''));
  const reportingCategoryName = cleanImportedText(firstValue(row, ['reporting_category_name', 'category_name'], ''));
  const statementType = normalizeStatementType(firstValue(row, ['statement_type', 'statement'], ''), glNumber);
  const isSummary = forcedSummary === null ? isSummaryCoaRow(row, glNumber) : Boolean(forcedSummary);
  return {
    glNumber,
    glName,
    consAccount,
    consAccountName,
    reportingCategory,
    reportingCategoryName,
    statementType,
    isSummary: isSummary ? 1 : 0,
    isFxTransDiff: Number(firstValue(row, ['is_fx_trans_diff'], 0) || 0),
    sortOrder: idx + 1,
  };
}

const COA_IMPORT_FIELDS = [
  { key: 'gl_number', label: 'GL szám', required: true, candidates: ['gl_number'] },
  { key: 'gl_name', label: 'GL név', required: true, candidates: ['gl_name'] },
  { key: 'cons_account', label: 'Konszolidált kontó', candidates: ['cons_account'] },
  { key: 'cons_account_name', label: 'Konszolidált kontó megnevezés', candidates: ['cons_account_name'] },
  { key: 'reporting_category', label: 'Riport kategória', candidates: ['reporting_category'] },
  { key: 'reporting_category_name', label: 'Riport kategória megnevezés', candidates: ['reporting_category_name'] },
  { key: 'statement_type', label: 'BS / PL', candidates: ['statement_type'] },
  { key: 'account_type', label: 'Típus / összesítő jel', candidates: ['account_type'] },
  { key: 'account_type_name', label: 'Típus név', candidates: ['account_type_name'] },
  { key: 'active', label: 'Aktív jel', candidates: ['active'] },
  { key: 'active_name', label: 'Aktív név', candidates: ['active_name'] },
  { key: 'is_summary', label: 'Összesítő külön oszlop', candidates: ['is_summary'] },
];

function coaImportFieldLabel(field) {
  return {
    gl_number: 'GL szám',
    gl_name: 'GL név',
    cons_account: 'Konszi riport kód',
    cons_account_name: 'Konszi riport kód megnevezés',
    reporting_category: 'Management riport kód',
    reporting_category_name: 'Management riport kód megnevezés',
    statement_type: 'BS / PL',
    account_type: 'Típus / összesítő jel',
    account_type_name: 'Típus név',
    active: 'Aktív jel',
    active_name: 'Aktív név',
    is_summary: 'Összesítő külön oszlop',
  }[field.key] || field.label;
}

module.exports = {
  COA_IMPORT_FIELDS,
  coaImportFieldLabel,
  isInactiveCoaRow,
  isSummaryCoaRow,
  inferStatementType,
  inferReportingCategory,
  normalizeStatementType,
  cleanMasterCode,
  dbBool,
  detectCoaSummary,
  detectCoaInactive,
  normalizeCoaImportRow,
};
