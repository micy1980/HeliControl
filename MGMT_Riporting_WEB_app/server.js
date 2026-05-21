const http = require('node:http');
const {
  PORT,
  HOST,
} = require('./src/config');
const { db } = require('./src/db');
const { httpError, fail } = require('./src/http-utils');
const { serveStatic } = require('./src/static');
const { getLanUrls } = require('./src/network');
const { logEvent } = require('./src/services/log-service');
const { initDb } = require('./src/services/schema-service');
const { startBackupScheduler } = require('./src/services/backup-service');
const { handleSystemRoutes } = require('./src/routes/system-routes');
const { handleAuthRoutes } = require('./src/routes/auth-routes');
const { handleAdminRoutes } = require('./src/routes/admin-routes');
const { handleSetupRoutes } = require('./src/routes/setup-routes');
const { handleFinanceRoutes } = require('./src/routes/finance-routes');
const { handleCoaRoutes } = require('./src/routes/coa-routes');
const { handleGlRoutes } = require('./src/routes/gl-routes');
const {
  handleBackupRoutes,
  handleLicenseRoutes,
  handleLogRoutes,
  handleSettingsRoutes,
} = require('./src/routes/maintenance-routes');

async function handleModularRoutes(args) {
  const shared = {
    ...args,
  };
  const handlers = [
    handleSystemRoutes,
    handleAuthRoutes,
    handleAdminRoutes,
    handleSetupRoutes,
    handleFinanceRoutes,
    handleCoaRoutes,
    handleGlRoutes,
    handleBackupRoutes,
    handleLogRoutes,
    handleLicenseRoutes,
    handleSettingsRoutes,
  ];
  for (const handler of handlers) {
    if (await handler(shared)) return true;
  }
  return false;
}

async function handleApi(req, res, url) {
  const method = req.method || 'GET';
  const route = url.pathname;

  if (await handleModularRoutes({ req, res, url, method, route })) return;

  throw httpError(404, 'NOT_FOUND', 'Nincs ilyen végpont.');
}

initDb();
startBackupScheduler();

function safeLog(message = '') {
  try {
    process.stdout.write(`${message}\n`);
  } catch {
    // Hidden Windows starts can have a closed stdout; the server must still run.
  }
}

function safeError(error) {
  try {
    process.stderr.write(`${error?.stack || error?.message || error}\n`);
  } catch {
    // Keep startup/shutdown resilient if stderr is unavailable.
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (err) {
    if (!err.status || err.status >= 500) {
      logEvent({ severity: 'ERROR', module: 'server', action: 'error', details: err.stack || err.message });
    }
    if (res.headersSent || res.writableEnded) return;
    fail(res, err);
  }
});

function startServer(port = PORT, host = HOST) {
  return server.listen(port, host, () => {
    safeLog('');
    safeLog('MGM Reporting Codex elindult');
    safeLog(`Helyi gépen: http://localhost:${port}`);
    const urls = getLanUrls();
    if (urls.length) {
      safeLog('Helyi hálózaton:');
      urls.forEach((u) => safeLog(`  ${u.replace(`:${PORT}`, `:${port}`)}`));
    } else {
      safeLog('Helyi hálózati IP nem található.');
    }
    safeLog('');
    safeLog('Alap belépés: admin / Admin123!');
  });
}

if (require.main === module) {
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      safeLog('');
      safeLog(`A ${PORT}-es port már használatban van.`);
      safeLog(`Ha az MGM Reporting Codex már fut, nyisd meg: http://localhost:${PORT}`);
      safeLog('Ha újra akarod indítani, előbb állítsd le a régi példányt.');
      process.exit(0);
    }
    safeError(err);
    process.exit(1);
  });
  startServer();
}

process.on('SIGINT', () => {
  safeLog('\nLeállítás...');
  db.close();
  process.exit(0);
});

module.exports = { appServer: server, db, startServer };
