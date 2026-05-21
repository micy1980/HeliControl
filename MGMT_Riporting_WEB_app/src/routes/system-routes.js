const { DB_PATH } = require('../config');
const { db } = require('../db');
const { sha256 } = require('../security');
const { ok, parseBody } = require('../http-utils');
const { requireAuth, publicUser, parseCookies } = require('../services/auth-service');
const { getSetting, setSetting, getContext } = require('../services/settings-service');
const { logEvent } = require('../services/log-service');
const { getLicense, getLicenseDaysLeft } = require('../services/license-service');
const { buildReport, buildTrialBalance, validateTrialBalance } = require('../services/report-service');
const { loadRealisticSampleData } = require('../services/sample-data-service');
const { appNow, getTimeSettings } = require('../services/time-service');
const {
  requirePermission,
  requireCompanyAccess,
  visibleCompaniesForUser,
  effectivePermissionsForUser,
} = require('../services/permission-service');

function nowIso() {
  return appNow().toISOString();
}

async function handleSystemRoutes({
  req,
  res,
  url,
  method,
  route,
}) {
  if (route === '/api/health') {
    ok(res, {
      status: 'ok',
      app: 'MGM Reporting Codex',
      time: nowIso(),
      db: DB_PATH,
    });
    return true;
  }

  if (route === '/api/bootstrap') {
    const user = requireAuth(req);
    const companies = visibleCompaniesForUser(user, true);
    const storedActiveCompanyId = Number(getSetting('active_company_id', companies[0]?.id || 1));
    const activeCompanyId = companies.some((company) => Number(company.id) === storedActiveCompanyId)
      ? storedActiveCompanyId
      : Number(companies[0]?.id || storedActiveCompanyId || 1);
    ok(res, {
      user: publicUser(user),
      companies,
      settings: {
        activeCompanyId,
        activeYear: Number(getSetting('active_year')),
        activePeriod: Number(getSetting('active_period')),
        activeCurrency: getSetting('active_currency', 'HUF'),
        activeFxMode: getSetting('active_fx_mode', 'FX1'),
        activeDisplayUnit: getSetting('active_display_unit', '1'),
        numberThousandSeparator: getSetting('number_thousand_separator', 'space'),
        numberDecimalSeparator: getSetting('number_decimal_separator', 'comma'),
        numberGlDecimals: getSetting('number_gl_decimals', '2'),
        numberReportDecimals: getSetting('number_report_decimals', '0'),
        numberFxDecimals: getSetting('number_fx_decimals', '4'),
        numberNegativeFormat: getSetting('number_negative_format', 'minus'),
        uiLanguage: getSetting('ui_language', 'hu'),
        uiTheme: getSetting('ui_theme', 'light'),
        timeSettings: getTimeSettings(),
      },
      timeSettings: getTimeSettings(),
      license: getLicense(),
      permissions: effectivePermissionsForUser(user),
    });
    return true;
  }

  if (route === '/api/settings/context' && method === 'POST') {
    const user = requireAuth(req);
    const body = await parseBody(req);
    if (body.active_company_id !== undefined) {
      requireCompanyAccess(user, Number(body.active_company_id), 'view');
    }
    ['active_company_id', 'active_year', 'active_period', 'active_currency', 'active_fx_mode', 'active_display_unit'].forEach((key) => {
      if (body[key] !== undefined) setSetting(key, body[key]);
    });
    if (body.active_company_id !== undefined) {
      const token = parseCookies(req).mgm_session;
      if (token) {
        db.prepare('UPDATE sessions SET company_id = ? WHERE token_hash = ? AND revoked_at IS NULL')
          .run(Number(body.active_company_id), sha256(token));
      }
    }
    logEvent({ companyId: body.active_company_id, userId: user.id, username: user.username, severity: 'INFO', module: 'settings', action: 'context_change', details: JSON.stringify(body) });
    ok(res, {});
    return true;
  }

  if (route === '/api/dashboard') {
    const ctx = getContext(url.searchParams);
    requirePermission(req, 'dashboard', 'view', { companyId: ctx.companyId });
    const report = buildReport(ctx);
    const lastImport = db.prepare('SELECT * FROM import_sessions WHERE company_id = ? ORDER BY imported_at DESC LIMIT 1').get(ctx.companyId);
    const coaCount = db.prepare('SELECT COUNT(*) AS total FROM chart_of_accounts WHERE company_id = ?').get(ctx.companyId).total;
    const glCount = db.prepare('SELECT COUNT(*) AS total FROM gl_data WHERE company_id = ? AND year = ?').get(ctx.companyId, ctx.year).total;
    ok(res, {
      kpis: {
        actYtd: report.totals.actYtd,
        budgetYtd: report.totals.budYtd,
        varianceBudget: report.totals.actYtd - report.totals.budYtd,
        coaCount,
        glCount,
        licenseDaysLeft: getLicenseDaysLeft(),
      },
      lastImport,
      recentLogs: db.prepare(`
        SELECT l.*, c.code AS companyCode
        FROM event_log l
        LEFT JOIN companies c ON c.id = l.company_id
        WHERE l.company_id = ? OR l.company_id IS NULL
        ORDER BY l.created_at DESC
        LIMIT 6
      `).all(ctx.companyId),
    });
    return true;
  }

  if (route === '/api/sample-data/load' && method === 'POST') {
    const user = requirePermission(req, 'settings', 'admin');
    ok(res, loadRealisticSampleData(user));
    return true;
  }

  if (route === '/api/report') {
    const ctx = getContext(url.searchParams);
    requirePermission(req, 'report', 'view', { companyId: ctx.companyId });
    ok(res, buildReport(ctx));
    return true;
  }

  if (route === '/api/trial-balance') {
    const ctx = getContext(url.searchParams);
    requirePermission(req, 'trialbalance', 'view', { companyId: ctx.companyId });
    ok(res, buildTrialBalance(ctx));
    return true;
  }

  if (route === '/api/trial-balance/validation') {
    const ctx = getContext(url.searchParams);
    requirePermission(req, 'trialbalance', 'validate', { companyId: ctx.companyId });
    ok(res, validateTrialBalance(ctx));
    return true;
  }

  return false;
}

module.exports = { handleSystemRoutes };
