function httpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function sendJson(res, status, payload) {
  if (res.headersSent || res.writableEnded) return false;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
  return true;
}

function ok(res, data = {}) {
  return sendJson(res, 200, { success: true, data });
}

function fail(res, err) {
  const status = err.status || 500;
  return sendJson(res, status, {
    success: false,
    code: err.code || 'SERVER_ERROR',
    message: status === 500 ? 'Váratlan szerverhiba történt.' : err.message,
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 250 * 1024 * 1024) {
        reject(httpError(413, 'PAYLOAD_TOO_LARGE', 'Túl nagy kérés.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(httpError(400, 'BAD_JSON', 'Hibás JSON kérés.'));
      }
    });
    req.on('error', reject);
  });
}

function required(value, name) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw httpError(400, 'VALIDATION_ERROR', `Hiányzó mező: ${name}`);
  }
  return value;
}

function asNumber(value, name, fallback = undefined) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw httpError(400, 'VALIDATION_ERROR', `Hiányzó mező: ${name}`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw httpError(400, 'VALIDATION_ERROR', `Érvénytelen szám: ${name}`);
  return n;
}

module.exports = {
  httpError,
  sendJson,
  ok,
  fail,
  parseBody,
  required,
  asNumber,
};
