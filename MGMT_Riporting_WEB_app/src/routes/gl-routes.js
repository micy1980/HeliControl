const { db } = require('../db');
const { httpError, ok, parseBody, asNumber } = require('../http-utils');
const { getSetting, activeCompanyId } = require('../services/settings-service');
const { logEvent } = require('../services/log-service');
const { requirePermission, requireCompanyAccess } = require('../services/permission-service');
const {
  getImportTableFromBody,
  parseJsonField,
  buildAutoColumnMapping,
  isTruthy,
  nextImportBatchId,
} = require('../services/import-service');
const {
  GL_IMPORT_FIELDS,
  validateGlTable,
  glValidationSummary,
  hasActivationBlockingBusinessErrors,
  updateGlSessionValidation,
} = require('../services/gl-service');

function nowIso() {
  return new Date().toISOString();
}

function glSessionCompanyId(id) {
  return db.prepare("SELECT company_id AS companyId FROM import_sessions WHERE id = ? AND import_type = 'GL'").get(id)?.companyId;
}

async function handleGlRoutes({
  req,
  res,
  url,
  method,
  route,
}) {
  if (route === '/api/gl/preview' && method === 'POST') {
    const companyId = activeCompanyId();
    const user = requirePermission(req, 'gl', 'import', { companyId, companyMode: 'manage' });
    const body = await parseBody(req);
    const table = getImportTableFromBody(body);
    const explicitMapping = parseJsonField(body.columnMapping || body.mapping, {});
    const autoMapping = buildAutoColumnMapping(table.columns, GL_IMPORT_FIELDS);
    const mapping = Object.keys(explicitMapping).length ? explicitMapping : autoMapping;
    const validation = validateGlTable({ table, mapping, companyId });
    if (isTruthy(body.logValidation)) {
      logEvent({ companyId, userId: user.id, username: user.username, severity: validation.fileErrors.length || validation.mappingErrors.length ? 'WARNING' : 'AUDIT', module: 'validation', action: 'gl_preview', details: `${validation.stats.importable || 0} sor, ${validation.stats.fileErrors || 0} fájlhiba, ${validation.stats.businessErrors || 0} kezelendő, ${validation.stats.softErrors || 0} soft` });
    }
    return ok(res, {
      columns: table.columns,
      fields: GL_IMPORT_FIELDS.map(({ key, label, required }) => ({ key, label, required: Boolean(required) })),
      autoMapping,
      mapping,
      sampleRows: table.rows.slice(0, 10),
      ...glValidationSummary(validation),
      status: validation.status,
      canCreateImport: validation.canCreateImport,
    });
  }

  if (route === '/api/gl/import' && method === 'POST') {
    const companyId = activeCompanyId();
    const user = requirePermission(req, 'gl', 'import', { companyId, companyMode: 'manage' });
    const body = await parseBody(req);
    const year = asNumber(body.year || getSetting('active_year'), 'year');
    const month = asNumber(body.month || getSetting('active_period'), 'month');
    const scenario = 'ACT';
    const table = getImportTableFromBody(body);
    const mapping = parseJsonField(body.columnMapping || body.mapping, {});
    const validation = validateGlTable({ table, mapping, companyId });
    if (validation.mappingErrors.length) {
      return ok(res, { accepted: false, stage: 'mapping', message: 'Hiányos megfeleltetés.', ...glValidationSummary(validation) });
    }
    if (validation.fileErrors.length) {
      logEvent({ companyId, userId: user.id, username: user.username, severity: 'WARNING', module: 'gl', action: 'import_rejected', details: `${validation.fileErrors.length} fájlhiba` });
      return ok(res, { accepted: false, stage: 'file', message: 'A fájl hibás, az import nem jött létre.', ...glValidationSummary(validation) });
    }
    const batchId = nextImportBatchId('GL');
    const unresolvedBusiness = validation.rows.filter(hasActivationBlockingBusinessErrors).length;
    const unresolvedSoft = validation.rows.filter((row) => row.softErrors.length && !row.softOk).length;
    const status = unresolvedBusiness || unresolvedSoft ? 'INACTIVE' : 'READY';
    let sessionId;
    db.exec('BEGIN');
    try {
      const insertedAt = nowIso();
      const info = db.prepare(`
        INSERT INTO import_sessions
          (batch_id, company_id, year, month, scenario, import_type, file_name, imported_rows, unknown_gl_count,
           imported_by, imported_at, status, overwrite_status, zero_row_count, source_row_count,
           hard_error_count, business_error_count, soft_error_count, soft_ok_count, validation_json)
        VALUES (?, ?, ?, ?, ?, 'GL', ?, ?, ?, ?, ?, ?, 'NORMAL', ?, ?, 0, ?, ?, 0, ?)
      `).run(
        batchId,
        companyId,
        year,
        month,
        scenario,
        String(body.fileName || 'gl_import'),
        validation.rows.length,
        validation.stats.unknownGl || 0,
        user.id,
        insertedAt,
        status,
        validation.stats.skippedZero || 0,
        table.rows.length,
        unresolvedBusiness,
        unresolvedSoft,
        JSON.stringify(glValidationSummary(validation))
      );
      sessionId = info.lastInsertRowid;
      const rowInsert = db.prepare(`
        INSERT INTO gl_import_rows
          (session_id, company_id, year, month, scenario, source_row_no, gl_number, imported_gl_name,
           coa_gl_name, debit, credit, amount, validation_status, business_errors_json, soft_errors_json,
           soft_ok, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      validation.rows.forEach((row) => {
        rowInsert.run(
          sessionId,
          companyId,
          year,
          month,
          scenario,
          row.sourceRowNo,
          row.glNumber,
          row.importedGlName,
          row.coaGlName,
          row.debit,
          row.credit,
          row.amount,
          row.validationStatus,
          JSON.stringify(row.businessErrors),
          JSON.stringify(row.softErrors),
          row.softOk ? 1 : 0,
          insertedAt,
          insertedAt
        );
      });
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    logEvent({ companyId, userId: user.id, username: user.username, severity: status === 'READY' ? 'AUDIT' : 'WARNING', module: 'gl', action: 'import_stage', details: `${validation.rows.length} sor, státusz: ${status}, ismeretlen GL: ${validation.stats.unknownGl || 0}` });
    return ok(res, {
      accepted: true,
      sessionId,
      batchId,
      status,
      imported: validation.rows.length,
      zeroRows: validation.stats.skippedZero || 0,
      unknown: validation.stats.unknownGl || 0,
      ...glValidationSummary(validation),
    });
  }

  if (route.startsWith('/api/gl/import-sessions/') && method === 'GET') {
    const user = requirePermission(req, 'gl', 'view');
    const id = asNumber(route.split('/').pop(), 'id');
    const session = db.prepare(`
      SELECT s.*, c.code AS companyCode, c.name AS companyName, u.username AS importedByName, au.username AS activatedByName,
             (
               SELECT COUNT(*)
               FROM gl_data gd
               WHERE gd.company_id = s.company_id
                 AND gd.year = s.year
                 AND gd.month = s.month
                 AND gd.scenario = s.scenario
                 AND gd.batch_id = s.batch_id
             ) AS ledgerRows
      FROM import_sessions s
      JOIN companies c ON c.id = s.company_id
      LEFT JOIN users u ON u.id = s.imported_by
      LEFT JOIN users au ON au.id = s.activated_by
      WHERE s.id = ? AND s.import_type = 'GL'
    `).get(id);
    if (!session) throw httpError(404, 'IMPORT_NOT_FOUND', 'Az import nem található.');
    requireCompanyAccess(user, session.company_id, 'view');
    const rows = db.prepare(`
      SELECT *
      FROM gl_import_rows
      WHERE session_id = ?
      ORDER BY source_row_no, gl_number
    `).all(id).map((row) => ({
      ...row,
      businessErrors: parseJsonField(row.business_errors_json, []),
      softErrors: parseJsonField(row.soft_errors_json, []),
      softOk: Boolean(row.soft_ok),
    }));
    session.inLedger = Number(session.ledgerRows || 0) > 0;
    return ok(res, { session, rows });
  }

  if (route.startsWith('/api/gl/import-sessions/') && route.endsWith('/validate') && method === 'POST') {
    const id = asNumber(route.split('/').at(-2), 'id');
    const user = requirePermission(req, 'gl', 'validate', { companyId: glSessionCompanyId(id), companyMode: 'manage' });
    const result = updateGlSessionValidation(id);
    logEvent({ companyId: result.session.company_id, userId: user.id, username: user.username, severity: result.status === 'READY' || result.status === 'ACTIVE' || result.status === 'GL_DELETED' ? 'AUDIT' : 'WARNING', module: 'validation', action: 'gl_revalidate', details: `${result.session.batch_id}: ${result.status}` });
    return ok(res, { status: result.status, ...glValidationSummary(result) });
  }

  if (route.startsWith('/api/gl/import-sessions/') && route.endsWith('/refresh-names') && method === 'POST') {
    const id = asNumber(route.split('/').at(-2), 'id');
    const user = requirePermission(req, 'gl', 'edit', { companyId: glSessionCompanyId(id), companyMode: 'manage' });
    const body = await parseBody(req);
    const session = db.prepare('SELECT * FROM import_sessions WHERE id = ? AND import_type = ?').get(id, 'GL');
    if (!session) throw httpError(404, 'IMPORT_NOT_FOUND', 'Az import nem található.');
    const company = db.prepare('SELECT code FROM companies WHERE id = ?').get(session.company_id);
    if (String(body.confirmCompanyCode || '') !== String(company?.code || '')) {
      throw httpError(400, 'BAD_CONFIRMATION', 'A cégkódos megerősítés nem egyezik.');
    }
    const info = db.prepare(`
      UPDATE gl_import_rows
      SET imported_gl_name = (
            SELECT coa.gl_name FROM chart_of_accounts coa
            WHERE coa.company_id = gl_import_rows.company_id AND coa.gl_number = gl_import_rows.gl_number
          ),
          soft_ok = 0,
          updated_at = ?
      WHERE session_id = ?
        AND EXISTS (
          SELECT 1 FROM chart_of_accounts coa
          WHERE coa.company_id = gl_import_rows.company_id AND coa.gl_number = gl_import_rows.gl_number
        )
    `).run(nowIso(), id);
    const result = updateGlSessionValidation(id);
    logEvent({ companyId: session.company_id, userId: user.id, username: user.username, severity: 'AUDIT', module: 'gl', action: 'refresh_names_from_coa', details: `${session.batch_id}: ${info.changes} sor` });
    return ok(res, { updated: info.changes, status: result.status, ...glValidationSummary(result) });
  }

  if (route.startsWith('/api/gl/import-sessions/') && route.endsWith('/activate') && method === 'POST') {
    const id = asNumber(route.split('/').at(-2), 'id');
    const user = requirePermission(req, 'gl', 'activate', { companyId: glSessionCompanyId(id), companyMode: 'manage' });
    const body = await parseBody(req);
    const validation = updateGlSessionValidation(id);
    const session = validation.session;
    if (validation.status !== 'READY' && validation.status !== 'ACTIVE' && validation.status !== 'GL_DELETED') {
      logEvent({ companyId: session.company_id, userId: user.id, username: user.username, severity: 'WARNING', module: 'gl', action: 'activate_failed', details: `${session.batch_id}: ${validation.status}` });
      return ok(res, { activated: false, status: validation.status, message: 'Az import még nem aktiválható.', ...glValidationSummary(validation) });
    }
    const isReactivation = validation.status === 'GL_DELETED';
    const company = db.prepare('SELECT code FROM companies WHERE id = ?').get(session.company_id);
    const existingActiveRows = db.prepare(`
      SELECT COUNT(*) AS total
      FROM gl_data
      WHERE company_id = ? AND year = ? AND month = ? AND scenario = 'ACT'
    `).get(session.company_id, session.year, session.month).total;
    if (existingActiveRows > 0 && String(body.confirmCompanyCode || '') !== String(company?.code || '')) {
      return ok(res, { activated: false, needsConfirmation: true, existingActiveRows, companyCode: company?.code || '', message: 'Már van aktív GL adat erre a hónapra.' });
    }
    db.exec('BEGIN');
    try {
      db.prepare(`
        UPDATE import_sessions
        SET overwrite_status = 'OVERWRITTEN'
        WHERE company_id = ? AND year = ? AND month = ? AND scenario = 'ACT'
          AND import_type = 'GL' AND status = 'ACTIVE' AND overwrite_status <> 'OVERWRITTEN'
      `).run(session.company_id, session.year, session.month);
      db.prepare("DELETE FROM gl_data WHERE company_id = ? AND year = ? AND month = ? AND scenario = 'ACT'")
        .run(session.company_id, session.year, session.month);
      db.prepare(`
        INSERT INTO gl_data (company_id, year, month, scenario, gl_number, gl_name, amount, imported_by, batch_id, imported_at)
        SELECT company_id, year, month, scenario, gl_number, imported_gl_name, amount, ?, ?, ?
        FROM gl_import_rows
        WHERE session_id = ?
      `).run(user.id, session.batch_id, nowIso(), id);
      db.prepare(`
        UPDATE import_sessions
        SET status = 'ACTIVE', overwrite_status = 'NORMAL', activated_by = ?, activated_at = ?
        WHERE id = ?
      `).run(user.id, nowIso(), id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    logEvent({ companyId: session.company_id, userId: user.id, username: user.username, severity: 'AUDIT', module: 'gl', action: isReactivation ? 'reactivate' : 'activate', details: `${session.batch_id}: ${session.year}/${session.month}` });
    return ok(res, { activated: true, reactivated: isReactivation, overwrittenRows: existingActiveRows, status: 'ACTIVE' });
  }

  if (route.startsWith('/api/gl/import-sessions/') && route.endsWith('/soft-ok') && method === 'POST') {
    const id = asNumber(route.split('/').at(-2), 'id');
    const user = requirePermission(req, 'gl', 'validate', { companyId: glSessionCompanyId(id), companyMode: 'manage' });
    const session = db.prepare('SELECT * FROM import_sessions WHERE id = ? AND import_type = ?').get(id, 'GL');
    if (!session) throw httpError(404, 'IMPORT_NOT_FOUND', 'Az import nem található.');
    const info = db.prepare(`
      UPDATE gl_import_rows
      SET soft_ok = 1, updated_at = ?
      WHERE session_id = ?
        AND COALESCE(soft_errors_json, '[]') <> '[]'
        AND COALESCE(soft_ok, 0) = 0
    `).run(nowIso(), id);
    const result = updateGlSessionValidation(id);
    logEvent({ companyId: session.company_id, userId: user.id, username: user.username, severity: 'AUDIT', module: 'gl', action: 'soft_error_ok_all', details: `${session.batch_id}: ${info.changes} sor` });
    return ok(res, { updated: info.changes, status: result.status, ...glValidationSummary(result) });
  }

  if (route.startsWith('/api/gl/import-rows/') && route.endsWith('/soft-ok') && method === 'POST') {
    let user;
    const id = asNumber(route.split('/').at(-2), 'id');
    const row = db.prepare('SELECT * FROM gl_import_rows WHERE id = ?').get(id);
    if (row) user = requirePermission(req, 'gl', 'validate', { companyId: row.company_id, companyMode: 'manage' });
    if (!row) throw httpError(404, 'ROW_NOT_FOUND', 'Az import sor nem található.');
    db.prepare('UPDATE gl_import_rows SET soft_ok = 1, updated_at = ? WHERE id = ?').run(nowIso(), id);
    const result = updateGlSessionValidation(row.session_id);
    logEvent({ companyId: row.company_id, userId: user.id, username: user.username, severity: 'AUDIT', module: 'gl', action: 'soft_error_ok', details: `${row.gl_number}` });
    return ok(res, { status: result.status, ...glValidationSummary(result) });
  }

  if (route.startsWith('/api/gl/import-rows/') && route.endsWith('/refresh-name') && method === 'POST') {
    let user;
    const id = asNumber(route.split('/').at(-2), 'id');
    const row = db.prepare('SELECT * FROM gl_import_rows WHERE id = ?').get(id);
    if (row) user = requirePermission(req, 'gl', 'edit', { companyId: row.company_id, companyMode: 'manage' });
    if (!row) throw httpError(404, 'ROW_NOT_FOUND', 'Az import sor nem talalhato.');
    const coa = db.prepare(`
      SELECT gl_name
      FROM chart_of_accounts
      WHERE company_id = ? AND gl_number = ?
    `).get(row.company_id, row.gl_number);
    if (!coa) throw httpError(404, 'COA_ROW_NOT_FOUND', 'A GL szám nincs a számlatükörben.');
    db.prepare(`
      UPDATE gl_import_rows
      SET imported_gl_name = ?, soft_ok = 0, updated_at = ?
      WHERE id = ?
    `).run(coa.gl_name || '', nowIso(), id);
    const result = updateGlSessionValidation(row.session_id);
    logEvent({ companyId: row.company_id, userId: user.id, username: user.username, severity: 'AUDIT', module: 'gl', action: 'refresh_row_name_from_coa', details: `${row.gl_number}: ${row.imported_gl_name || ''} -> ${coa.gl_name || ''}` });
    return ok(res, { updated: 1, status: result.status, ...glValidationSummary(result) });
  }

  if (route === '/api/import-sessions') {
    const companyId = asNumber(url.searchParams.get('companyId') || getSetting('active_company_id'), 'companyId');
    requirePermission(req, 'gl', 'view', { companyId });
    const importType = String(url.searchParams.get('importType') || '').trim().toUpperCase();
    const typeFilter = importType ? 'AND s.import_type = ?' : '';
    const params = importType ? [companyId, importType] : [companyId];
    const rows = db.prepare(`
      SELECT s.*, c.code AS companyCode, u.username,
             (
               SELECT COUNT(*)
               FROM gl_data gd
               WHERE gd.company_id = s.company_id
                 AND gd.year = s.year
                 AND gd.month = s.month
                 AND gd.scenario = s.scenario
                 AND gd.batch_id = s.batch_id
             ) AS ledgerRows
      FROM import_sessions s
      JOIN companies c ON c.id = s.company_id
      LEFT JOIN users u ON u.id = s.imported_by
      WHERE s.company_id = ?
        ${typeFilter}
      ORDER BY s.imported_at DESC
      LIMIT 200
    `).all(...params).map((row) => {
      const summary = parseJsonField(row.validation_json, {});
      const stats = summary.stats || {};
      const issueCount = Number(row.hard_error_count || 0)
        + Number(row.business_error_count || 0)
        + Number(row.soft_error_count || 0)
        + Number(stats.fileErrors || 0)
        + Number(stats.reportReferenceErrors || 0);
      return {
        ...row,
        issueCount,
        inLedger: Number(row.ledgerRows || 0) > 0,
      };
    });
    return ok(res, { rows });
  }


  return false;
}

module.exports = { handleGlRoutes };
