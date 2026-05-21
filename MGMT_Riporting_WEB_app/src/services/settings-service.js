const { db } = require('../db');
const { asNumber } = require('../http-utils');

function nowIso() {
  return new Date().toISOString();
}

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value), nowIso());
}

function firstCompanyId() {
  return db.prepare('SELECT id FROM companies ORDER BY id LIMIT 1').get()?.id || 1;
}

function activeCompanyId() {
  return Number(getSetting('active_company_id', firstCompanyId()));
}

function listCompanies(activeOnly = false) {
  return db.prepare(`
    SELECT
      id,
      code,
      name,
      fiscal_year_start AS fiscalYearStart,
      base_currency AS baseCurrency,
      logo_file_name AS logoFileName,
      logo_data AS logoData,
      active
    FROM companies
    ${activeOnly ? 'WHERE active = 1' : ''}
    ORDER BY active DESC, name
  `).all().map((row) => ({ ...row, active: Boolean(row.active) }));
}

function getContext(query) {
  const companyId = asNumber(query.get('companyId') || query.get('company_id') || getSetting('active_company_id', ''), 'companyId', firstCompanyId());
  const year = asNumber(query.get('year') || getSetting('active_year'), 'year');
  const period = Math.max(1, Math.min(12, asNumber(query.get('period') || getSetting('active_period'), 'period')));
  const currency = (query.get('currency') || getSetting('active_currency', 'HUF')).toUpperCase();
  const fxMode = (query.get('fxMode') || getSetting('active_fx_mode', 'FX1')).toUpperCase();
  return { companyId, year, period, currency, fxMode };
}

module.exports = {
  getSetting,
  setSetting,
  firstCompanyId,
  activeCompanyId,
  listCompanies,
  getContext,
};
