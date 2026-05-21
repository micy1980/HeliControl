const { db } = require('../db');
const { ok, parseBody, required, asNumber } = require('../http-utils');
const { getSetting } = require('../services/settings-service');
const { logEvent } = require('../services/log-service');
const { getRowsFromBody, normalizeAmount } = require('../services/import-service');
const { seedFxRates } = require('../services/fx-service');
const { requirePermission } = require('../services/permission-service');

function nowIso() {
  return new Date().toISOString();
}

async function handleFinanceRoutes({
  req,
  res,
  url,
  method,
  route,
}) {
  if (route === '/api/fx' && method === 'GET') {
    requirePermission(req, 'fx', 'view');
    const year = asNumber(url.searchParams.get('year') || getSetting('active_year'), 'year');
    seedFxRates(year);
    const rows = db.prepare('SELECT * FROM fx_rates WHERE year = ? ORDER BY currency, month').all(year);
    ok(res, { rows });
    return true;
  }

  if (route === '/api/fx' && method === 'POST') {
    const user = requirePermission(req, 'fx', 'edit');
    const body = await parseBody(req);
    db.prepare(`
      INSERT INTO fx_rates (year, month, currency, average_rate, month_end_rate, manual, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(year, month, currency) DO UPDATE SET
        average_rate = excluded.average_rate,
        month_end_rate = excluded.month_end_rate,
        manual = 1,
        updated_at = excluded.updated_at
    `).run(
      asNumber(body.year, 'year'),
      asNumber(body.month, 'month'),
      String(required(body.currency, 'currency')).toUpperCase(),
      asNumber(body.averageRate, 'averageRate'),
      asNumber(body.monthEndRate, 'monthEndRate'),
      nowIso()
    );
    logEvent({ userId: user.id, username: user.username, severity: 'AUDIT', module: 'fx', action: 'manual_rate', details: JSON.stringify(body) });
    ok(res, {});
    return true;
  }

  if (route === '/api/budget' && method === 'GET') {
    const companyId = asNumber(url.searchParams.get('companyId'), 'companyId');
    requirePermission(req, 'budget', 'view', { companyId });
    const year = asNumber(url.searchParams.get('year') || getSetting('active_year'), 'year');
    const scenario = String(url.searchParams.get('scenario') || 'BUD').toUpperCase();
    const rows = db.prepare(`
      SELECT b.*, coa.gl_name AS glName, coa.cons_account AS consAccount
      FROM budget_data b
      LEFT JOIN chart_of_accounts coa ON coa.company_id = b.company_id AND coa.gl_number = b.gl_number
      WHERE b.company_id = ? AND b.year = ? AND b.scenario = ?
      ORDER BY b.month, b.gl_number
    `).all(companyId, year, scenario);
    ok(res, { rows });
    return true;
  }

  if (route === '/api/budget/import' && method === 'POST') {
    const body = await parseBody(req);
    const companyId = asNumber(body.companyId, 'companyId');
    const user = requirePermission(req, 'budget', 'import', { companyId, companyMode: 'manage' });
    const year = asNumber(body.year, 'year');
    const scenario = String(body.scenario || 'BUD').toUpperCase() === 'FCST' ? 'FCST' : 'BUD';
    const rows = getRowsFromBody(body);
    const insert = db.prepare(`
      INSERT INTO budget_data (company_id, year, month, scenario, gl_number, amount, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, year, month, scenario, gl_number) DO UPDATE SET
        amount = excluded.amount,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `);
    let count = 0;
    rows.forEach((row) => {
      const gl = row.gl_number || row.gl || row.account || row.account_number;
      const month = Number(row.month || body.month);
      if (!gl || !month) return;
      insert.run(companyId, year, month, scenario, String(gl).trim(), normalizeAmount(row.amount || row.value || row.balance), user.id, nowIso());
      count += 1;
    });
    logEvent({ companyId, userId: user.id, username: user.username, severity: 'AUDIT', module: 'budget', action: 'import', details: `${scenario}: ${count} sor` });
    ok(res, { imported: count });
    return true;
  }

  return false;
}

module.exports = { handleFinanceRoutes };
