const { db } = require('../db');
const { httpError, required, asNumber } = require('../http-utils');
const { cleanMasterCode, dbBool } = require('./coa-service');
const {
  getImportTableFromBody,
  normalizeHeader,
  firstValue,
  isTruthy,
  nextImportBatchId,
} = require('./import-service');

function nowIso() {
  return new Date().toISOString();
}

const REPORT_STRUCTURES = {
  MGMT: { key: 'management', label: 'Management riport' },
  CONS: { key: 'consolidation', label: 'Konszi riport' },
};

function normalizeReportStructure(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (['MGMT', 'MANAGEMENT', 'MANAGEMENT_REPORT'].includes(raw)) return 'MGMT';
  if (['CONS', 'CONSOLIDATION', 'KONSZI', 'KONSZ'].includes(raw)) return 'CONS';
  throw httpError(400, 'VALIDATION_ERROR', 'Érvénytelen riport struktúra.');
}

function reportCodePrefix(structureType, groupLevel = null) {
  const normalized = normalizeReportStructure(structureType);
  if (groupLevel) return `${normalized === 'CONS' ? 'kcs' : 'mcs'}${Number(groupLevel)}_`;
  return normalized === 'CONS' ? 'krk_' : 'mrk_';
}

function normalizePrefixedCode(value, structureType, groupLevel = null) {
  const prefix = reportCodePrefix(structureType, groupLevel);
  const compact = String(required(value, 'code')).replace(/\s+/g, '');
  const lastPrefix = compact.lastIndexOf(prefix);
  const suffix = lastPrefix >= 0 ? compact.slice(lastPrefix + prefix.length) : compact;
  const code = `${prefix}${suffix}`;
  if (code === prefix) throw httpError(400, 'VALIDATION_ERROR', 'A kód prefix után add meg az azonosító részt is.');
  return code;
}

function comparableText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeStoredReportStructureCodes() {
  const groupRows = db.prepare('SELECT id, company_id, structure_type, group_level, code FROM report_groups').all();
  const updateGroupRef = {
    1: db.prepare('UPDATE report_codes SET group1_code = ? WHERE company_id = ? AND structure_type = ? AND group1_code = ?'),
    2: db.prepare('UPDATE report_codes SET group2_code = ? WHERE company_id = ? AND structure_type = ? AND group2_code = ?'),
    3: db.prepare('UPDATE report_codes SET group3_code = ? WHERE company_id = ? AND structure_type = ? AND group3_code = ?'),
  };
  const updateGroupCode = db.prepare('UPDATE report_groups SET code = ?, updated_at = ? WHERE id = ?');
  const deleteGroup = db.prepare('DELETE FROM report_groups WHERE id = ?');
  const findGroup = db.prepare('SELECT id FROM report_groups WHERE company_id = ? AND structure_type = ? AND group_level = ? AND code = ?');
  const reportCodeRows = db.prepare('SELECT id, company_id, structure_type, code FROM report_codes').all();
  const updateReportCode = db.prepare('UPDATE report_codes SET code = ?, updated_at = ? WHERE id = ?');
  const deleteReportCode = db.prepare('DELETE FROM report_codes WHERE id = ?');
  const findReportCode = db.prepare('SELECT id FROM report_codes WHERE company_id = ? AND structure_type = ? AND code = ?');
  const updateCoaMgmt = db.prepare('UPDATE chart_of_accounts SET reporting_category = ? WHERE company_id = ? AND reporting_category = ?');
  const updateCoaCons = db.prepare('UPDATE chart_of_accounts SET cons_account = ? WHERE company_id = ? AND cons_account = ?');

  db.exec('BEGIN');
  try {
    groupRows.forEach((row) => {
      const normalized = normalizePrefixedCode(row.code, row.structure_type, row.group_level);
      if (normalized === row.code) return;
      updateGroupRef[row.group_level].run(normalized, row.company_id, row.structure_type, row.code);
      const existing = findGroup.get(row.company_id, row.structure_type, row.group_level, normalized);
      if (existing && Number(existing.id) !== Number(row.id)) deleteGroup.run(row.id);
      else updateGroupCode.run(normalized, nowIso(), row.id);
    });

    reportCodeRows.forEach((row) => {
      const normalized = normalizePrefixedCode(row.code, row.structure_type);
      if (normalized === row.code) return;
      if (row.structure_type === 'MGMT') updateCoaMgmt.run(normalized, row.company_id, row.code);
      if (row.structure_type === 'CONS') updateCoaCons.run(normalized, row.company_id, row.code);
      const existing = findReportCode.get(row.company_id, row.structure_type, normalized);
      if (existing && Number(existing.id) !== Number(row.id)) deleteReportCode.run(row.id);
      else updateReportCode.run(normalized, nowIso(), row.id);
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function upsertReportGroup(companyId, structureType, groupLevel, code, name, active = true, mode = 'upsert') {
  const normalizedStructure = normalizeReportStructure(structureType);
  const level = asNumber(groupLevel, 'groupLevel');
  if (level < 1 || level > 3) throw httpError(400, 'VALIDATION_ERROR', 'A csoport szintje 1, 2 vagy 3 lehet.');
  const value = normalizePrefixedCode(code, normalizedStructure, level);
  const label = String(required(name, 'name')).trim();
  const existingCode = db.prepare(`
    SELECT id
    FROM report_groups
    WHERE company_id = ? AND structure_type = ? AND group_level = ? AND code = ?
  `).get(companyId, normalizedStructure, level, value);
  if (String(mode || '').toLowerCase() === 'create' && existingCode) {
    throw httpError(409, 'DUPLICATE_CODE', `Ez a kód már létezik: ${value}`);
  }
  const existingName = db.prepare(`
    SELECT code
    FROM report_groups
    WHERE company_id = ? AND structure_type = ? AND group_level = ?
      AND LOWER(TRIM(name)) = LOWER(TRIM(?))
      AND code <> ?
  `).get(companyId, normalizedStructure, level, label, value);
  if (existingName) {
    throw httpError(409, 'DUPLICATE_NAME', `Ez a megnevezés már létezik ennél a kódnál: ${existingName.code}`);
  }
  db.prepare(`
    INSERT INTO report_groups (company_id, structure_type, group_level, code, name, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, structure_type, group_level, code) DO UPDATE SET
      name = excluded.name,
      active = excluded.active,
      updated_at = excluded.updated_at
  `).run(companyId, normalizedStructure, level, value, label, dbBool(active), nowIso(), nowIso());
}

function reportGroupUsageCount(companyId, structureType, groupLevel, code) {
  const normalizedStructure = normalizeReportStructure(structureType);
  const level = asNumber(groupLevel, 'groupLevel');
  return db.prepare(`
    SELECT COUNT(*) AS total
    FROM report_codes
    WHERE company_id = ? AND structure_type = ? AND (
      (? = 1 AND group1_code = ?) OR
      (? = 2 AND group2_code = ?) OR
      (? = 3 AND group3_code = ?)
    )
  `).get(companyId, normalizedStructure, level, code, level, code, level, code).total;
}

function deleteReportGroups(companyId, structureType, groupLevel, codes = []) {
  const normalizedStructure = normalizeReportStructure(structureType);
  const level = asNumber(groupLevel, 'groupLevel');
  if (level < 1 || level > 3) throw httpError(400, 'VALIDATION_ERROR', 'A csoport szintje 1, 2 vagy 3 lehet.');
  const uniqueCodes = [...new Set((Array.isArray(codes) ? codes : []).map((code) => normalizePrefixedCode(code, normalizedStructure, level)))];
  if (!uniqueCodes.length) throw httpError(400, 'VALIDATION_ERROR', 'Nincs kijelölt törölhető csoport.');
  const result = { deleted: 0, blocked: [] };
  const remove = db.prepare('DELETE FROM report_groups WHERE company_id = ? AND structure_type = ? AND group_level = ? AND code = ?');
  db.exec('BEGIN');
  try {
    uniqueCodes.forEach((code) => {
      const usageCount = reportGroupUsageCount(companyId, normalizedStructure, level, code);
      if (usageCount > 0) {
        result.blocked.push({ code, usageCount });
        return;
      }
      result.deleted += remove.run(companyId, normalizedStructure, level, code).changes;
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return result;
}

function reportCodeUsageCount(companyId, structureType, code) {
  const normalizedStructure = normalizeReportStructure(structureType);
  return db.prepare(`
    SELECT COUNT(*) AS total
    FROM chart_of_accounts
    WHERE company_id = ? AND (
      (? = 'MGMT' AND NULLIF(reporting_category, 'UNMAPPED') = ?) OR
      (? = 'CONS' AND NULLIF(cons_account, 'UNMAPPED') = ?)
    )
  `).get(companyId, normalizedStructure, code, normalizedStructure, code).total;
}

function deleteReportCodes(companyId, structureType, codes = []) {
  const normalizedStructure = normalizeReportStructure(structureType);
  const uniqueCodes = [...new Set((Array.isArray(codes) ? codes : []).map((code) => normalizePrefixedCode(code, normalizedStructure)))];
  if (!uniqueCodes.length) throw httpError(400, 'VALIDATION_ERROR', 'Nincs kijelölt törölhető riport kód.');
  const result = { deleted: 0, blocked: [] };
  const remove = db.prepare('DELETE FROM report_codes WHERE company_id = ? AND structure_type = ? AND code = ?');
  db.exec('BEGIN');
  try {
    uniqueCodes.forEach((code) => {
      const usageCount = reportCodeUsageCount(companyId, normalizedStructure, code);
      if (usageCount > 0) {
        result.blocked.push({ code, usageCount });
        return;
      }
      result.deleted += remove.run(companyId, normalizedStructure, code).changes;
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return result;
}

function upsertReportCode(companyId, structureType, body) {
  const normalizedStructure = normalizeReportStructure(structureType);
  const code = normalizePrefixedCode(body.code, normalizedStructure);
  const name = String(required(body.name, 'name')).trim();
  const statementType = String(body.statementType || body.statement_type || '').trim().toUpperCase();
  if (statementType && !['BS', 'PL'].includes(statementType)) {
    throw httpError(400, 'VALIDATION_ERROR', 'A BS/PL mező értéke csak BS vagy PL lehet.');
  }
  const existingCode = db.prepare('SELECT id FROM report_codes WHERE company_id = ? AND structure_type = ? AND code = ?').get(companyId, normalizedStructure, code);
  if (String(body.mode || '').toLowerCase() === 'create' && existingCode) {
    throw httpError(409, 'DUPLICATE_CODE', `Ez a riport kód már létezik: ${code}`);
  }
  const existingName = db.prepare(`
    SELECT code
    FROM report_codes
    WHERE company_id = ? AND structure_type = ?
      AND LOWER(TRIM(name)) = LOWER(TRIM(?))
      AND code <> ?
  `).get(companyId, normalizedStructure, name, code);
  if (existingName) {
    throw httpError(409, 'DUPLICATE_NAME', `Ez a riport kód elnevezés már létezik ennél a kódnál: ${existingName.code}`);
  }
  const group1Code = cleanMasterCode(body.group1Code || body.group1_code);
  const group2Code = cleanMasterCode(body.group2Code || body.group2_code);
  const group3Code = cleanMasterCode(body.group3Code || body.group3_code);
  db.prepare(`
    INSERT INTO report_codes
      (company_id, structure_type, code, name, group1_code, group1_required, group2_code, group2_required,
       group3_code, group3_required, statement_type, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, structure_type, code) DO UPDATE SET
      name = excluded.name,
      group1_code = excluded.group1_code,
      group1_required = excluded.group1_required,
      group2_code = excluded.group2_code,
      group2_required = excluded.group2_required,
      group3_code = excluded.group3_code,
      group3_required = excluded.group3_required,
      statement_type = excluded.statement_type,
      active = excluded.active,
      updated_at = excluded.updated_at
  `).run(
    companyId,
    normalizedStructure,
    code,
    name,
    group1Code,
    dbBool(body.group1Required ?? body.group1_required, true),
    group2Code,
    dbBool(body.group2Required ?? body.group2_required, true),
    group3Code,
    dbBool(body.group3Required ?? body.group3_required, false),
    statementType,
    dbBool(body.active, true),
    nowIso(),
    nowIso()
  );
}

function listReportGroups(companyId, structureType, groupLevel) {
  return db.prepare(`
    SELECT rg.id, rg.structure_type AS structureType, rg.group_level AS groupLevel, rg.code, rg.name, rg.active,
           (
             SELECT COUNT(*)
             FROM report_codes rc
             WHERE rc.company_id = rg.company_id AND rc.structure_type = rg.structure_type AND (
               (rg.group_level = 1 AND rc.group1_code = rg.code) OR
               (rg.group_level = 2 AND rc.group2_code = rg.code) OR
               (rg.group_level = 3 AND rc.group3_code = rg.code)
             )
           ) AS usageCount
    FROM report_groups rg
    WHERE rg.company_id = ? AND rg.structure_type = ? AND rg.group_level = ?
    ORDER BY code
  `).all(companyId, structureType, groupLevel).map((row) => ({ ...row, active: Boolean(row.active), usageCount: Number(row.usageCount || 0) }));
}

function listReportCodes(companyId, structureType) {
  return db.prepare(`
    SELECT rc.id, rc.structure_type AS structureType, rc.code, rc.name,
           rc.group1_code AS group1Code, COALESCE(g1.name, '') AS group1Name, rc.group1_required AS group1Required,
           rc.group2_code AS group2Code, COALESCE(g2.name, '') AS group2Name, rc.group2_required AS group2Required,
           rc.group3_code AS group3Code, COALESCE(g3.name, '') AS group3Name, rc.group3_required AS group3Required,
           rc.statement_type AS statementType, rc.active,
           (
             SELECT COUNT(*)
             FROM chart_of_accounts coa
             WHERE coa.company_id = rc.company_id AND (
               (rc.structure_type = 'MGMT' AND NULLIF(coa.reporting_category, 'UNMAPPED') = rc.code) OR
               (rc.structure_type = 'CONS' AND NULLIF(coa.cons_account, 'UNMAPPED') = rc.code)
             )
           ) AS usageCount
    FROM report_codes rc
    LEFT JOIN report_groups g1 ON g1.company_id = rc.company_id AND g1.structure_type = rc.structure_type AND g1.group_level = 1 AND g1.code = rc.group1_code
    LEFT JOIN report_groups g2 ON g2.company_id = rc.company_id AND g2.structure_type = rc.structure_type AND g2.group_level = 2 AND g2.code = rc.group2_code
    LEFT JOIN report_groups g3 ON g3.company_id = rc.company_id AND g3.structure_type = rc.structure_type AND g3.group_level = 3 AND g3.code = rc.group3_code
    WHERE rc.company_id = ? AND rc.structure_type = ?
    ORDER BY rc.code
  `).all(companyId, structureType).map((row) => ({
    ...row,
    group1Required: Boolean(row.group1Required),
    group2Required: Boolean(row.group2Required),
    group3Required: Boolean(row.group3Required),
    active: Boolean(row.active),
    usageCount: Number(row.usageCount || 0),
  }));
}

function reportStructurePayload(companyId, structureType) {
  return {
    groups1: listReportGroups(companyId, structureType, 1),
    groups2: listReportGroups(companyId, structureType, 2),
    groups3: listReportGroups(companyId, structureType, 3),
    reportCodes: listReportCodes(companyId, structureType),
  };
}

function normalizedImportRow(row) {
  const out = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    const target = normalizeHeader(key);
    if (target) out[target] = value;
  });
  return out;
}

function textValue(row, keys) {
  return String(firstValue(row, keys, '') ?? '').trim();
}

function boolValue(value, fallback = true) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const text = String(value).trim().toLowerCase();
  if (['0', 'false', 'nem', 'no', 'n', 'inactive', 'inaktiv'].includes(text)) return false;
  return isTruthy(value) || ['1', 'true', 'igen', 'yes', 'y', 'active', 'aktiv'].includes(text);
}

function existingReportGroupName(companyId, structureType, level, code) {
  return db.prepare(`
    SELECT name
    FROM report_groups
    WHERE company_id = ? AND structure_type = ? AND group_level = ? AND code = ?
  `).get(companyId, structureType, level, code)?.name || '';
}

function existingReportGroupNameConflict(companyId, structureType, level, name, code) {
  return db.prepare(`
    SELECT code
    FROM report_groups
    WHERE company_id = ? AND structure_type = ? AND group_level = ?
      AND LOWER(TRIM(name)) = LOWER(TRIM(?))
      AND code <> ?
  `).get(companyId, structureType, level, name, code)?.code || '';
}

function existingReportCodeNameConflict(companyId, structureType, name, code) {
  return db.prepare(`
    SELECT code
    FROM report_codes
    WHERE company_id = ? AND structure_type = ?
      AND LOWER(TRIM(name)) = LOWER(TRIM(?))
      AND code <> ?
  `).get(companyId, structureType, name, code)?.code || '';
}

function validateReportStructureImportRows(companyId, structureType, table) {
  const normalizedStructure = normalizeReportStructure(structureType);
  const rows = [];
  const errors = [];
  const seenCodes = new Map();
  const seenNames = new Map();
  const seenGroups = new Map();
  const seenGroupNames = new Map();
  table.rows.forEach((raw, idx) => {
    const sourceRowNo = idx + 2;
    const row = normalizedImportRow(raw);
    const rawHasValue = Object.values(row).some((value) => String(value ?? '').trim() !== '');
    if (!rawHasValue) return;

    let code = '';
    try {
      code = normalizePrefixedCode(textValue(row, ['report_code', 'code']), normalizedStructure);
    } catch (err) {
      errors.push({ row: sourceRowNo, message: err.message || 'Hiányzó riport kód.' });
      return;
    }
    const name = textValue(row, ['report_code_name', 'gl_name', 'name', 'megnevezes']);
    const statementType = textValue(row, ['statement_type']).toUpperCase();
    if (!name) errors.push({ row: sourceRowNo, code, message: 'Hiányzó riport kód elnevezés.' });
    if (!['BS', 'PL'].includes(statementType)) errors.push({ row: sourceRowNo, code, message: 'A BS/PL mező értéke BS vagy PL lehet.' });
    if (seenCodes.has(code)) {
      errors.push({ row: seenCodes.get(code), code, message: 'Duplikált riport kód a fájlban.' });
      errors.push({ row: sourceRowNo, code, message: 'Duplikált riport kód a fájlban.' });
      return;
    }
    seenCodes.set(code, sourceRowNo);
    if (name) {
      const nameKey = comparableText(name);
      const duplicateName = seenNames.get(nameKey);
      if (duplicateName && duplicateName.code !== code) {
        errors.push({ row: duplicateName.row, code: duplicateName.code, message: `Duplikált riport kód elnevezés a fájlban: ${code}.` });
        errors.push({ row: sourceRowNo, code, message: `Duplikált riport kód elnevezés a fájlban: ${duplicateName.code}.` });
      } else {
        seenNames.set(nameKey, { row: sourceRowNo, code });
      }
      const existingNameCode = existingReportCodeNameConflict(companyId, normalizedStructure, name, code);
      if (existingNameCode) {
        errors.push({ row: sourceRowNo, code, message: `Ez a riport kód elnevezés már létezik ennél a kódnál: ${existingNameCode}.` });
      }
    }

    const groups = {};
    [1, 2, 3].forEach((level) => {
      const groupCodeRaw = textValue(row, [`group${level}_code`]);
      const groupName = textValue(row, [`group${level}_name`]);
      let groupCode = '';
      if (groupCodeRaw) {
        try {
          groupCode = normalizePrefixedCode(groupCodeRaw, normalizedStructure, level);
        } catch (err) {
          errors.push({ row: sourceRowNo, code, message: err.message || `Érvénytelen Csoport${level} kód.` });
        }
      }
      if (groupName && !groupCode) {
        errors.push({ row: sourceRowNo, code, message: `Csoport${level} megnevezéshez kód is kell.` });
      }
      if (groupCode && !groupName && !existingReportGroupName(companyId, normalizedStructure, level, groupCode)) {
        errors.push({ row: sourceRowNo, code, message: `A Csoport${level} kód még nincs törzsben, ezért megnevezés is kell.` });
      }
      if (groupCode && groupName) {
        const groupKey = `${level}:${groupCode}`;
        const previousGroup = seenGroups.get(groupKey);
        if (previousGroup && comparableText(previousGroup.name) !== comparableText(groupName)) {
          errors.push({ row: previousGroup.row, code, message: `A ${groupCode} csoport több megnevezéssel szerepel a fájlban.` });
          errors.push({ row: sourceRowNo, code, message: `A ${groupCode} csoport több megnevezéssel szerepel a fájlban.` });
        } else {
          seenGroups.set(groupKey, { row: sourceRowNo, name: groupName });
        }
        const groupNameKey = `${level}:${comparableText(groupName)}`;
        const duplicateGroupName = seenGroupNames.get(groupNameKey);
        if (duplicateGroupName && duplicateGroupName.code !== groupCode) {
          errors.push({ row: duplicateGroupName.row, code, message: `Duplikált Csoport${level} megnevezés a fájlban: ${groupCode}.` });
          errors.push({ row: sourceRowNo, code, message: `Duplikált Csoport${level} megnevezés a fájlban: ${duplicateGroupName.code}.` });
        } else {
          seenGroupNames.set(groupNameKey, { row: sourceRowNo, code: groupCode });
        }
        const existingGroupNameCode = existingReportGroupNameConflict(companyId, normalizedStructure, level, groupName, groupCode);
        if (existingGroupNameCode) {
          errors.push({ row: sourceRowNo, code, message: `Ez a Csoport${level} megnevezés már létezik ennél a kódnál: ${existingGroupNameCode}.` });
        }
      }
      groups[level] = {
        code: groupCode,
        name: groupName,
        required: boolValue(row[`group${level}_required`], level < 3),
      };
    });

    rows.push({
      sourceRowNo,
      code,
      name,
      statementType,
      active: boolValue(row.active, true),
      groups,
    });
  });
  return { rows, errors };
}

function importReportStructure(companyId, structureType, body, user) {
  const normalizedStructure = normalizeReportStructure(structureType);
  const table = getImportTableFromBody(body);
  const validation = validateReportStructureImportRows(companyId, normalizedStructure, table);
  if (validation.errors.length) {
    return {
      accepted: false,
      imported: 0,
      errors: validation.errors,
      stats: { sourceRows: table.rows.length, validRows: validation.rows.length, errors: validation.errors.length },
    };
  }
  const batchId = nextImportBatchId(normalizedStructure === 'CONS' ? 'CONS_MASTER' : 'MGMT_MASTER');
  const fileName = String(body.fileName || body.file_name || 'riport_torzs_import').trim();
  const year = Number(body.year || new Date().getFullYear());
  const touchedGroups = new Set();
  db.exec('BEGIN');
  try {
    validation.rows.forEach((row) => {
      [1, 2, 3].forEach((level) => {
        const group = row.groups[level];
        if (!group.code) return;
        const name = group.name || existingReportGroupName(companyId, normalizedStructure, level, group.code);
        upsertReportGroup(companyId, normalizedStructure, level, group.code, name, true, 'upsert');
        touchedGroups.add(`${level}:${group.code}`);
      });
      upsertReportCode(companyId, normalizedStructure, {
        code: row.code,
        name: row.name,
        statementType: row.statementType,
        group1Code: row.groups[1].code,
        group1Required: row.groups[1].required,
        group2Code: row.groups[2].code,
        group2Required: row.groups[2].required,
        group3Code: row.groups[3].code,
        group3Required: row.groups[3].required,
        active: row.active,
      });
    });
    db.prepare(`
      INSERT INTO import_sessions
        (batch_id, company_id, year, month, scenario, import_type, file_name, imported_rows, imported_by, imported_at, status, validation_json)
      VALUES (?, ?, ?, 1, 'ACT', ?, ?, ?, ?, ?, 'ACTIVE', ?)
    `).run(
      batchId,
      companyId,
      year,
      normalizedStructure === 'CONS' ? 'REPORT_CONS' : 'REPORT_MGMT',
      fileName,
      validation.rows.length,
      user?.id || null,
      nowIso(),
      JSON.stringify({ imported: validation.rows.length, groups: touchedGroups.size })
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return {
    accepted: true,
    batchId,
    imported: validation.rows.length,
    groups: touchedGroups.size,
    errors: [],
  };
}

module.exports = {
  REPORT_STRUCTURES,
  normalizeReportStructure,
  reportCodePrefix,
  normalizePrefixedCode,
  normalizeStoredReportStructureCodes,
  upsertReportGroup,
  deleteReportGroups,
  upsertReportCode,
  deleteReportCodes,
  listReportGroups,
  listReportCodes,
  reportStructurePayload,
  validateReportStructureImportRows,
  importReportStructure,
};
