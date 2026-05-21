const { db } = require('../db');
const { getSetting, setSetting } = require('./settings-service');
const { logEvent } = require('./log-service');
const { seedMasterData, seedSummaryRules } = require('./seed-service');
const { seedFxRates } = require('./fx-service');

function nowIso() {
  return new Date().toISOString();
}

const SAMPLE_COA_ROWS = [
  ['111000', 'Bankszámla HUF', 'Cash and cash equivalents', 'Current Assets', 'BS', 10],
  ['112000', 'Bankszámla EUR', 'Cash and cash equivalents', 'Current Assets', 'BS', 20],
  ['121000', 'Vevőkövetelések belföld', 'Trade receivables', 'Current Assets', 'BS', 30],
  ['122000', 'Vevőkövetelések külföld', 'Trade receivables', 'Current Assets', 'BS', 40],
  ['131000', 'Készletek', 'Inventories', 'Current Assets', 'BS', 50],
  ['141000', 'Aktív időbeli elhatárolások', 'Prepayments', 'Current Assets', 'BS', 60],
  ['211000', 'Szállítói kötelezettségek', 'Trade payables', 'Current Liabilities', 'BS', 110],
  ['212000', 'Adó- és járulékkötelezettségek', 'Tax liabilities', 'Current Liabilities', 'BS', 120],
  ['221000', 'Rövid lejáratú hitelek', 'Short-term loans', 'Current Liabilities', 'BS', 130],
  ['311000', 'Jegyzett tőke', 'Share capital', 'Equity', 'BS', 210],
  ['321000', 'Eredménytartalék', 'Retained earnings', 'Equity', 'BS', 220],
  ['491000', 'Mérleg szerinti eredmény', 'Current year result', 'Equity', 'BS', 230],
  ['911000', 'Árbevétel - szolgáltatás', 'Service revenue', 'Revenue', 'PL', 310],
  ['912000', 'Árbevétel - termék', 'Product revenue', 'Revenue', 'PL', 320],
  ['931000', 'Egyéb bevételek', 'Other operating income', 'Other Income', 'PL', 330],
  ['511000', 'Anyagköltség', 'Material costs', 'COGS', 'PL', 410],
  ['521000', 'Igénybe vett szolgáltatások', 'External services', 'COGS', 'PL', 420],
  ['541000', 'Bérköltség', 'Payroll expense', 'Operating Expenses', 'PL', 510],
  ['551000', 'Bérjárulékok', 'Payroll taxes', 'Operating Expenses', 'PL', 520],
  ['561000', 'Értékcsökkenés', 'Depreciation', 'Operating Expenses', 'PL', 530],
  ['571000', 'Marketing költségek', 'Marketing expenses', 'Operating Expenses', 'PL', 540],
  ['581000', 'Irodai és admin költségek', 'Office and administration', 'Operating Expenses', 'PL', 550],
  ['871000', 'Fizetett kamatok', 'Interest expense', 'Finance', 'PL', 610],
  ['971000', 'Kapott kamatok', 'Interest income', 'Finance', 'PL', 620],
  ['876000', 'Árfolyamveszteség', 'Foreign exchange loss', 'Finance', 'PL', 630],
  ['976000', 'Árfolyamnyereség', 'Foreign exchange gain', 'Finance', 'PL', 640],
];

function ensureDemoCompany() {
  let company = db.prepare('SELECT id, code, name FROM companies WHERE code = ?').get('DEMO');
  if (!company) {
    db.prepare(`
      INSERT INTO companies (code, name, fiscal_year_start, active, created_at, updated_at)
      VALUES ('DEMO', 'Demo Company', 1, 1, ?, ?)
    `).run(nowIso(), nowIso());
    company = db.prepare('SELECT id, code, name FROM companies WHERE code = ?').get('DEMO');
  }
  setSetting('active_company_id', company.id);
  return company;
}

function loadSampleCoa(companyId) {
  const upsert = db.prepare(`
    INSERT INTO chart_of_accounts
      (company_id, gl_number, gl_name, cons_account, reporting_category, statement_type, source, sort_order, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'Sample', ?, ?)
    ON CONFLICT(company_id, gl_number) DO UPDATE SET
      gl_name = excluded.gl_name,
      cons_account = excluded.cons_account,
      reporting_category = excluded.reporting_category,
      statement_type = excluded.statement_type,
      source = excluded.source,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at
  `);
  SAMPLE_COA_ROWS.forEach((row) => upsert.run(companyId, row[0], row[1], row[2], row[3], row[4], row[5], nowIso()));
  return SAMPLE_COA_ROWS.length;
}

function seasonalFactor(month) {
  const factors = [0.86, 0.91, 0.98, 1.03, 1.06, 1.12, 0.96, 0.97, 1.08, 1.14, 1.18, 1.32];
  return factors[month - 1] || 1;
}

function sampleAmountFor(glNumber, month, scenario) {
  const base = {
    '111000': 18500000,
    '112000': 8200000,
    '121000': 26500000,
    '122000': 11800000,
    '131000': 17400000,
    '141000': 3900000,
    '211000': -21400000,
    '212000': -6200000,
    '221000': -12500000,
    '311000': -30000000,
    '321000': -24800000,
    '491000': -4300000,
    '911000': 62000000,
    '912000': 41500000,
    '931000': 2800000,
    '511000': -26700000,
    '521000': -15400000,
    '541000': -18400000,
    '551000': -3300000,
    '561000': -4100000,
    '571000': -2700000,
    '581000': -5200000,
    '871000': -1100000,
    '971000': 320000,
    '876000': -780000,
    '976000': 440000,
  }[glNumber] || 0;

  const scenarioFactor = {
    ACT: 1,
    PY: 0.91,
    BUD: 0.96,
    FCST: 1.03,
  }[scenario] || 1;

  const drift = 1 + ((month - 6) * 0.012);
  return Math.round(base * seasonalFactor(month) * scenarioFactor * drift);
}

function loadSampleFinancialData(companyId, year, userId) {
  const batchId = `SAMPLE-${year}-${Date.now()}`;
  const insertedAt = nowIso();
  const glInsert = db.prepare(`
    INSERT INTO gl_data (company_id, year, month, scenario, gl_number, gl_name, amount, imported_by, batch_id, imported_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, year, month, scenario, gl_number) DO UPDATE SET
      gl_name = excluded.gl_name,
      amount = excluded.amount,
      imported_by = excluded.imported_by,
      batch_id = excluded.batch_id,
      imported_at = excluded.imported_at
  `);
  const budgetInsert = db.prepare(`
    INSERT INTO budget_data (company_id, year, month, scenario, gl_number, amount, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, year, month, scenario, gl_number) DO UPDATE SET
      amount = excluded.amount,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `);

  let glRows = 0;
  let budgetRows = 0;
  SAMPLE_COA_ROWS.forEach(([glNumber, glName]) => {
    for (let month = 1; month <= 12; month += 1) {
      glInsert.run(companyId, year, month, 'ACT', glNumber, glName, sampleAmountFor(glNumber, month, 'ACT'), userId, batchId, insertedAt);
      glInsert.run(companyId, year, month, 'PY', glNumber, glName, sampleAmountFor(glNumber, month, 'PY'), userId, batchId, insertedAt);
      budgetInsert.run(companyId, year, month, 'BUD', glNumber, sampleAmountFor(glNumber, month, 'BUD'), userId, insertedAt);
      budgetInsert.run(companyId, year, month, 'FCST', glNumber, sampleAmountFor(glNumber, month, 'FCST'), userId, insertedAt);
      glRows += 2;
      budgetRows += 2;
    }
  });

  db.prepare(`
    INSERT OR REPLACE INTO import_sessions
      (batch_id, company_id, year, month, scenario, import_type, file_name, imported_rows, unknown_gl_count, imported_by, imported_at)
    VALUES (?, ?, ?, ?, 'ACT/PY', 'SAMPLE', ?, ?, 0, ?, ?)
  `).run(batchId, companyId, year, 12, 'built-in-sample-data', glRows, userId, insertedAt);

  return { batchId, glRows, budgetRows };
}

function loadRealisticSampleData(user) {
  const year = Number(getSetting('active_year', new Date().getFullYear()));
  const company = ensureDemoCompany();
  seedMasterData(company.id);
  seedSummaryRules(company.id);
  const coaRows = loadSampleCoa(company.id);
  const data = loadSampleFinancialData(company.id, year, user.id);
  seedFxRates(year);
  setSetting('active_period', '12');
  logEvent({
    companyId: company.id,
    userId: user.id,
    username: user.username,
    severity: 'AUDIT',
    module: 'sample',
    action: 'load_realistic_sample',
    details: `${company.code}, ${year}, COA ${coaRows}, GL ${data.glRows}, Budget ${data.budgetRows}`,
  });
  return {
    company,
    year,
    coaRows,
    glRows: data.glRows,
    budgetRows: data.budgetRows,
    batchId: data.batchId,
  };
}

module.exports = { loadRealisticSampleData };
