const { db } = require('../db');
const { httpError, ok, parseBody, required, asNumber } = require('../http-utils');
const { getSetting, activeCompanyId } = require('../services/settings-service');
const { logEvent, logAuditChanges } = require('../services/log-service');
const { requirePermission } = require('../services/permission-service');
const {
  getImportTableFromBody,
  parseJsonField,
  buildAutoColumnMapping,
  getSummaryRulesFromBody,
  rowRulesProvided,
  applyColumnMapping,
  isTruthy,
  nextImportBatchId,
} = require('../services/import-service');
const {
  COA_IMPORT_FIELDS,
  coaImportFieldLabel,
  cleanMasterCode,
  normalizeStatementType,
  dbBool,
  normalizeCoaImportRow,
  detectCoaInactive,
  detectCoaSummary,
} = require('../services/coa-service');

function nowIso() {
  return new Date().toISOString();
}

const COA_AUDIT_FIELDS = [
  { key: 'gl_name', label: 'GL név' },
  { key: 'cons_account', label: 'Konszi riport kód' },
  { key: 'reporting_category', label: 'Management riport kód' },
  { key: 'statement_type', label: 'BS/PL' },
  { key: 'is_summary', label: 'Összesítő sor', boolean: true },
  { key: 'is_fx_trans_diff', label: 'FX átértékelés különbség', boolean: true },
];

function coaAuditRowByGl(companyId, glNumber) {
  return db.prepare(`
    SELECT id, gl_number, gl_name, cons_account, reporting_category, statement_type, is_summary, is_fx_trans_diff
    FROM chart_of_accounts
    WHERE company_id = ? AND gl_number = ?
  `).get(companyId, glNumber) || null;
}

function coaAuditRowsByIds(companyId, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`
    SELECT id, gl_number, gl_name, cons_account, reporting_category, statement_type, is_summary, is_fx_trans_diff
    FROM chart_of_accounts
    WHERE company_id = ? AND id IN (${placeholders})
  `).all(companyId, ...ids);
}

function enabledCoaAuditFields(fields) {
  const keys = new Set();
  if (fields.consAccount) keys.add('cons_account');
  if (fields.reportingCategory) keys.add('reporting_category');
  if (fields.statementType) keys.add('statement_type');
  if (fields.isSummary) keys.add('is_summary');
  if (fields.isFxTransDiff) keys.add('is_fx_trans_diff');
  return COA_AUDIT_FIELDS.filter((field) => keys.has(field.key));
}

function coaAuditValueChanged(row, targetValues, field) {
  if (!(field.key in targetValues)) return false;
  if (field.boolean) return Number(row?.[field.key] || 0) !== Number(targetValues[field.key] || 0);
  return String(row?.[field.key] || '') !== String(targetValues[field.key] || '');
}

function validateCoaImportTable({ table, mapping, rowRules, useRuleFallback }) {
  const stats = {
    total: table.rows.length,
    recognized: 0,
    skippedBlank: 0,
    inactive: 0,
    skippedInactive: 0,
    summary: 0,
    skippedSummary: 0,
    importable: 0,
    fileErrors: 0,
    warnings: 0,
  };
  const rows = [];
  const fileErrors = [];
  const warnings = [];
  const seenGl = new Map();
  const names = new Map();

  table.rows.forEach((rawRow, idx) => {
    const sourceRowNo = idx + 2;
    const mappedRow = applyColumnMapping(rawRow, mapping);
    const normalized = normalizeCoaImportRow(mappedRow, idx);
    if (!normalized) {
      stats.skippedBlank += 1;
      return;
    }
    stats.recognized += 1;
    const inactive = detectCoaInactive(mappedRow, rawRow, rowRules, useRuleFallback);
    const summary = detectCoaSummary(mappedRow, rawRow, rowRules, normalized.glNumber, useRuleFallback);
    if (inactive) stats.inactive += 1;
    if (summary) stats.summary += 1;
    if (inactive) {
      stats.skippedInactive += 1;
      return;
    }
    if (summary) {
      stats.skippedSummary += 1;
      return;
    }

    const glKey = String(normalized.glNumber).trim();
    const firstRow = seenGl.get(glKey);
    if (firstRow) {
      fileErrors.push({ row: firstRow.row, glNumber: glKey, glName: firstRow.glName, message: 'Duplikált GL szám az import fájlban.' });
      fileErrors.push({ row: sourceRowNo, glNumber: glKey, glName: normalized.glName, message: 'Duplikált GL szám az import fájlban.' });
    } else {
      seenGl.set(glKey, { row: sourceRowNo, glName: normalized.glName });
    }

    const nameKey = String(normalized.glName || '').trim().toLocaleLowerCase('hu-HU');
    if (nameKey) {
      const existing = names.get(nameKey);
      if (existing && existing.glNumber !== glKey) {
        warnings.push({
          row: sourceRowNo,
          glNumber: glKey,
          glName: normalized.glName,
          message: `Azonos GL név másik számlaszámon is szerepel: ${existing.glNumber}.`,
        });
      } else if (!existing) {
        names.set(nameKey, { glNumber: glKey, row: sourceRowNo });
      }
    }

    rows.push({
      sourceRowNo,
      rawRow,
      mappedRow,
      normalized: normalizeCoaImportRow(mappedRow, idx, summary),
    });
    stats.importable += 1;
  });

  const unique = (items) => {
    const out = [];
    const seen = new Set();
    items.forEach((item) => {
      const key = `${item.row}:${item.glNumber}:${item.message}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    return out;
  };
  const uniqueFileErrors = unique(fileErrors);
  const uniqueWarnings = unique(warnings);
  stats.fileErrors = uniqueFileErrors.length;
  stats.warnings = uniqueWarnings.length;
  return {
    rows,
    stats,
    fileErrors: uniqueFileErrors,
    warnings: uniqueWarnings,
    canImport: uniqueFileErrors.length === 0 && stats.importable > 0,
  };
}

async function handleCoaRoutes({
  req,
  res,
  url,
  method,
  route,
}) {
  if (route === '/api/coa' && method === 'GET') {
    const companyId = asNumber(url.searchParams.get('companyId'), 'companyId');
    requirePermission(req, 'coa', 'view', { companyId });
    const year = asNumber(url.searchParams.get('year') || getSetting('active_year'), 'year');
    const rows = db.prepare(`
      SELECT coa.id, coa.gl_number AS glNumber, coa.gl_name AS glName,
             NULLIF(coa.cons_account, 'UNMAPPED') AS consAccount,
             COALESCE(cons.name, '') AS consAccountName,
             NULLIF(coa.reporting_category, 'UNMAPPED') AS reportingCategory,
             COALESCE(mgmt.name, '') AS reportingCategoryName,
             COALESCE(NULLIF(mgmt.statement_type, ''), NULLIF(cons.statement_type, ''), coa.statement_type) AS statementType,
             COALESCE(mgmt.active, 0) AS managementReportActive,
             COALESCE(cons.active, 0) AS consReportActive,
             EXISTS (
               SELECT 1
               FROM gl_data gd
               WHERE gd.company_id = coa.company_id
                 AND gd.year = ?
                 AND gd.scenario = 'ACT'
                 AND gd.gl_number = coa.gl_number
                 AND ABS(gd.amount) > 0.0000001
             ) AS hasGlValue,
             coa.is_summary AS isSummary,
             coa.is_fx_trans_diff AS isFxTransDiff, coa.source, coa.sort_order AS sortOrder
             ,NULLIF(coa.reporting_category, 'UNMAPPED') AS managementReportCode
             ,COALESCE(mgmt.name, '') AS managementReportName
             ,COALESCE(mgmt.group1_code, '') AS managementGroup1Code
             ,COALESCE(mgmt_g1.name, '') AS managementGroup1Name
             ,COALESCE(mgmt.group2_code, '') AS managementGroup2Code
             ,COALESCE(mgmt_g2.name, '') AS managementGroup2Name
             ,COALESCE(mgmt.group3_code, '') AS managementGroup3Code
             ,COALESCE(mgmt_g3.name, '') AS managementGroup3Name
             ,COALESCE(mgmt.statement_type, '') AS managementStatementType
             ,NULLIF(coa.cons_account, 'UNMAPPED') AS consReportCode
             ,COALESCE(cons.name, '') AS consReportName
             ,COALESCE(cons.group1_code, '') AS consGroup1Code
             ,COALESCE(cons_g1.name, '') AS consGroup1Name
             ,COALESCE(cons.group2_code, '') AS consGroup2Code
             ,COALESCE(cons_g2.name, '') AS consGroup2Name
             ,COALESCE(cons.group3_code, '') AS consGroup3Code
             ,COALESCE(cons_g3.name, '') AS consGroup3Name
             ,COALESCE(cons.statement_type, '') AS consStatementType
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
      ORDER BY coa.sort_order, coa.id
    `).all(year, companyId).map((row) => ({
      ...row,
      isSummary: Boolean(row.isSummary),
      isFxTransDiff: Boolean(row.isFxTransDiff),
      hasGlValue: Boolean(row.hasGlValue),
      managementReportActive: Boolean(row.managementReportActive),
      consReportActive: Boolean(row.consReportActive),
    }));
    return ok(res, { rows });
  }

  if (route === '/api/coa/manual' && method === 'POST') {
    const body = await parseBody(req);
    const companyId = activeCompanyId();
    const user = requirePermission(req, 'coa', 'edit', { companyId, companyMode: 'manage' });
    const glNumber = String(required(body.glNumber || body.gl_number, 'glNumber')).trim();
    const glName = String(required(body.glName || body.gl_name, 'glName')).trim();
    const consAccount = cleanMasterCode(body.consAccount || body.cons_account || body.consReportCode || body.cons_report_code);
    const reportingCategory = cleanMasterCode(body.reportingCategory || body.reporting_category || body.managementReportCode || body.management_report_code);
    const statementType = normalizeStatementType(body.statementType || body.statement_type, glNumber);
    const isSummary = dbBool(body.isSummary ?? body.is_summary, false);
    const isFxTransDiff = dbBool(body.isFxTransDiff ?? body.is_fx_trans_diff, false);
    const before = coaAuditRowByGl(companyId, glNumber);
    db.prepare(`
      INSERT INTO chart_of_accounts
        (company_id, gl_number, gl_name, cons_account, reporting_category, statement_type, is_summary, is_fx_trans_diff, source, sort_order, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Manual', ?, ?)
      ON CONFLICT(company_id, gl_number) DO UPDATE SET
        gl_name = excluded.gl_name,
        cons_account = excluded.cons_account,
        reporting_category = excluded.reporting_category,
        statement_type = excluded.statement_type,
        is_summary = excluded.is_summary,
        is_fx_trans_diff = excluded.is_fx_trans_diff,
        updated_at = excluded.updated_at
    `).run(companyId, glNumber, glName, consAccount, reportingCategory, statementType, isSummary, isFxTransDiff, Number(body.sortOrder || glNumber.replace(/\D/g, '') || 0), nowIso());
    const after = coaAuditRowByGl(companyId, glNumber);
    logAuditChanges({
      companyId,
      user,
      table: 'chart_of_accounts',
      entityKey: glNumber,
      action: before ? 'coa_update' : 'coa_create',
      before,
      after,
      fields: COA_AUDIT_FIELDS,
    });
    return ok(res, { glNumber });
  }

  if (route === '/api/coa/bulk-update' && method === 'POST') {
    const body = await parseBody(req);
    const companyId = activeCompanyId();
    const user = requirePermission(req, 'coa', 'edit', { companyId, companyMode: 'manage' });
    const ids = Array.isArray(body.ids) ? body.ids.map((id) => Number(id)).filter(Number.isFinite) : [];
    if (!ids.length) throw httpError(400, 'VALIDATION_ERROR', 'Nincs kijelölt számlatükör sor.');
    const fields = body.fields || {};
    const updates = [];
    const values = [];
    if (fields.consAccount) {
      updates.push('cons_account = ?');
      values.push(cleanMasterCode(body.consAccount || body.consReportCode));
    }
    if (fields.reportingCategory) {
      updates.push('reporting_category = ?');
      values.push(cleanMasterCode(body.reportingCategory || body.managementReportCode));
    }
    if (fields.statementType) {
      updates.push('statement_type = ?');
      values.push(normalizeStatementType(body.statementType, ''));
    }
    if (fields.isSummary) {
      updates.push('is_summary = ?');
      values.push(dbBool(body.isSummary, false));
    }
    if (fields.isFxTransDiff) {
      updates.push('is_fx_trans_diff = ?');
      values.push(dbBool(body.isFxTransDiff, false));
    }
    if (!updates.length) throw httpError(400, 'VALIDATION_ERROR', 'Nincs kiválasztott módosítandó mező.');
    const beforeRows = coaAuditRowsByIds(companyId, ids);
    const beforeById = new Map(beforeRows.map((row) => [Number(row.id), row]));
    const auditFields = enabledCoaAuditFields(fields);
    const targetValues = {};
    if (fields.consAccount) targetValues.cons_account = cleanMasterCode(body.consAccount || body.consReportCode);
    if (fields.reportingCategory) targetValues.reporting_category = cleanMasterCode(body.reportingCategory || body.managementReportCode);
    if (fields.statementType) targetValues.statement_type = normalizeStatementType(body.statementType, '');
    if (fields.isSummary) targetValues.is_summary = dbBool(body.isSummary, false);
    if (fields.isFxTransDiff) targetValues.is_fx_trans_diff = dbBool(body.isFxTransDiff, false);
    const changedIds = beforeRows
      .filter((row) => auditFields.some((field) => coaAuditValueChanged(row, targetValues, field)))
      .map((row) => Number(row.id));
    if (!changedIds.length) {
      return ok(res, { updated: 0, noChange: true });
    }
    updates.push('updated_at = ?');
    values.push(nowIso());
    const placeholders = changedIds.map(() => '?').join(',');
    const info = db.prepare(`
      UPDATE chart_of_accounts
      SET ${updates.join(', ')}
      WHERE company_id = ? AND id IN (${placeholders})
    `).run(...values, companyId, ...changedIds);
    const afterRows = coaAuditRowsByIds(companyId, changedIds);
    afterRows.forEach((after) => {
      logAuditChanges({
        companyId,
        user,
        table: 'chart_of_accounts',
        entityKey: after.gl_number,
        action: 'coa_bulk_update',
        before: beforeById.get(Number(after.id)),
        after,
        fields: auditFields,
      });
    });
    return ok(res, { updated: info.changes });
  }

  if (route === '/api/import/preview' && method === 'POST') {
    const body = await parseBody(req);
    const companyId = body.companyId ? asNumber(body.companyId, 'companyId') : activeCompanyId();
    const user = requirePermission(req, 'coa', 'import', { companyId, companyMode: 'manage' });
    const importType = String(body.importType || 'coa').toLowerCase();
    if (importType !== 'coa') throw httpError(400, 'UNSUPPORTED_IMPORT_PREVIEW', 'Ehhez az import típushoz még nincs előnézet.');
    const table = getImportTableFromBody(body);
    if (!table.rows.length) throw httpError(400, 'NO_IMPORT_ROWS', 'Nincs beolvasható sor az import fájlban.');
    const explicitMapping = parseJsonField(body.columnMapping, {});
    const autoMapping = buildAutoColumnMapping(table.columns, COA_IMPORT_FIELDS);
    const mapping = Object.keys(explicitMapping).length ? explicitMapping : autoMapping;
    const rowRules = getSummaryRulesFromBody(body);
    const useRuleFallback = !rowRulesProvided(body);
    const validation = validateCoaImportTable({ table, mapping, rowRules, useRuleFallback });
    const stats = validation.stats;
    if (isTruthy(body.logValidation)) {
      logEvent({
        companyId,
        userId: user?.id || null,
        username: user?.username || '',
        severity: stats.fileErrors ? 'WARNING' : 'AUDIT',
        module: 'validation',
        action: 'coa_preview',
        details: `${stats.importable} importálható, ${stats.skippedSummary} összesítő, ${stats.skippedInactive} inaktív, ${stats.skippedBlank} üres/hibás`,
      });
    }
    return ok(res, {
      columns: table.columns,
      fields: COA_IMPORT_FIELDS.map((field) => ({ key: field.key, label: coaImportFieldLabel(field), required: Boolean(field.required) })),
      autoMapping,
      mapping,
      stats,
      fileErrors: validation.fileErrors,
      warnings: validation.warnings,
      canImport: validation.canImport,
      sampleRows: table.rows.slice(0, 10),
    });
  }

  if (route === '/api/coa/import' && method === 'POST') {
    const body = await parseBody(req);
    const companyId = asNumber(body.companyId, 'companyId');
    const user = requirePermission(req, 'coa', 'import', { companyId, companyMode: 'manage' });
    const table = getImportTableFromBody(body);
    const mapping = parseJsonField(body.columnMapping, {});
    const rowRules = getSummaryRulesFromBody(body);
    const useRuleFallback = !rowRulesProvided(body);
    const validation = validateCoaImportTable({ table, mapping, rowRules, useRuleFallback });
    if (validation.fileErrors.length) {
      logEvent({ companyId, userId: user.id, username: user.username, severity: 'WARNING', module: 'coa', action: 'import_rejected', details: `${validation.fileErrors.length} fájlhiba` });
      return ok(res, {
        accepted: false,
        message: 'A számlatükör import fájl hibás, az import nem indult el.',
        stats: validation.stats,
        fileErrors: validation.fileErrors,
        warnings: validation.warnings,
        canImport: false,
      });
    }
    if (!validation.rows.length) {
      return ok(res, {
        accepted: false,
        message: 'Nincs importálható számlatükör sor.',
        stats: validation.stats,
        fileErrors: [],
        warnings: validation.warnings,
        canImport: false,
      });
    }
    const insert = db.prepare(`
      INSERT INTO chart_of_accounts
        (company_id, gl_number, gl_name, cons_account, reporting_category, statement_type, is_summary, is_fx_trans_diff, source, sort_order, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, gl_number) DO UPDATE SET
        gl_name = excluded.gl_name,
        cons_account = excluded.cons_account,
        reporting_category = excluded.reporting_category,
        statement_type = excluded.statement_type,
        is_summary = excluded.is_summary,
        is_fx_trans_diff = excluded.is_fx_trans_diff,
        source = excluded.source,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at
    `);
    let count = 0;
    let skippedInactive = 0;
    let skippedSummary = 0;
    let importedSummary = 0;
    const batchId = nextImportBatchId('COA');
    const importedAt = nowIso();
    skippedInactive = validation.stats.skippedInactive || 0;
    skippedSummary = validation.stats.skippedSummary || 0;
    validation.rows.forEach(({ normalized }) => {
      if (!normalized) return;
      insert.run(
        companyId,
        normalized.glNumber,
        normalized.glName,
        normalized.consAccount,
        normalized.reportingCategory,
        normalized.statementType,
        normalized.isSummary,
        normalized.isFxTransDiff,
        'Imported',
        normalized.sortOrder,
        importedAt
      );
      count += 1;
      if (normalized.isSummary) importedSummary += 1;
    });
    db.prepare(`
      INSERT INTO import_sessions
        (batch_id, company_id, year, month, scenario, import_type, file_name, imported_rows,
         imported_by, imported_at, status, zero_row_count, source_row_count, validation_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      batchId,
      companyId,
      Number(getSetting('active_year', new Date().getFullYear())),
      1,
      'MASTER',
      'COA',
      String(body.fileName || body.file_name || ''),
      count,
      user.id,
      importedAt,
      'ACTIVE',
      0,
      table.rows.length,
      JSON.stringify({ skippedInactive, skippedSummary, importedSummary })
    );
    logEvent({ companyId, userId: user.id, username: user.username, severity: 'AUDIT', module: 'coa', action: 'import', details: `${count} sor, kihagyott inaktív: ${skippedInactive}, kihagyott összesítő: ${skippedSummary}` });
    return ok(res, { accepted: true, batchId, imported: count, skippedInactive, skippedSummary, importedSummary, warnings: validation.warnings });
  }


  return false;
}

module.exports = { handleCoaRoutes };
