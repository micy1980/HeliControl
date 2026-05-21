const { db } = require('../db');
const { hmac } = require('../security');
const { httpError } = require('../http-utils');
const { getSetting } = require('./settings-service');

function getLicense() {
  const row = db.prepare('SELECT * FROM license WHERE id = 1').get();
  if (!row) return { status: 'missing', companyName: '', expiresAt: '', daysLeft: null };
  return {
    status: row.status,
    companyName: row.company_name,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    daysLeft: Math.ceil((new Date(row.expires_at).getTime() - Date.now()) / 86400000),
  };
}

function getLicenseDaysLeft() {
  const license = getLicense();
  return license.daysLeft;
}

function parseLicense(key) {
  if (!key.startsWith('MGM-') || !key.includes('.')) {
    throw httpError(400, 'BAD_LICENSE', 'Érvénytelen licenszkulcs formátum.');
  }
  const raw = key.slice(4);
  const [payload, sig] = raw.split('.');
  const expected = hmac(payload, getSetting('license_secret')).slice(0, 32);
  if (sig !== expected) throw httpError(400, 'BAD_LICENSE', 'Érvénytelen licensz aláírás.');
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw httpError(400, 'BAD_LICENSE', 'Érvénytelen licensz tartalom.');
  }
  const expired = new Date(decoded.expiresAt).getTime() < Date.now();
  return {
    companyName: decoded.companyName,
    issuedAt: decoded.issuedAt,
    expiresAt: decoded.expiresAt,
    status: expired ? 'expired' : 'valid',
  };
}

module.exports = {
  getLicense,
  getLicenseDaysLeft,
  parseLicense,
};
