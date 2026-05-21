const { db } = require('../db');

function nowIso() {
  return new Date().toISOString();
}

function seedFxRates(year) {
  const rates = {
    EUR: 390,
    USD: 360,
    CHF: 405,
    GBP: 455,
  };
  const insert = db.prepare(`
    INSERT INTO fx_rates (year, month, currency, average_rate, month_end_rate, manual, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(year, month, currency) DO NOTHING
  `);
  Object.entries(rates).forEach(([currency, base]) => {
    for (let month = 1; month <= 12; month += 1) {
      insert.run(year, month, currency, base + month * 0.7, base + month, nowIso());
    }
  });
}


module.exports = { seedFxRates };
