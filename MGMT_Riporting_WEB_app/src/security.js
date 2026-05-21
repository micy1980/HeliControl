const crypto = require('node:crypto');

function randomId(size = 16) {
  return crypto.randomBytes(size).toString('hex');
}

function randomToken(size = 32) {
  return crypto.randomBytes(size).toString('base64url');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function safeCompare(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function hashPassword(password, salt = randomId(16), iterations = 120000) {
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [algo, rawIterations, salt, hash] = String(stored || '').split('$');
  if (algo !== 'pbkdf2' || !rawIterations || !salt || !hash) return false;
  const next = hashPassword(password, salt, Number(rawIterations));
  return crypto.timingSafeEqual(Buffer.from(next), Buffer.from(stored));
}

module.exports = {
  randomId,
  randomToken,
  sha256,
  hmac,
  safeCompare,
  hashPassword,
  verifyPassword,
};
