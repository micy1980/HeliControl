const { ROLE_LEVEL } = require('../constants');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { db } = require('../db');
const { randomId, hmac } = require('../security');
const { httpError, ok, parseBody, required, asNumber } = require('../http-utils');
const { getSetting, setSetting, activeCompanyId } = require('../services/settings-service');
const { logEvent, logAuditChanges, visibleLogRowsFor, canViewAllCompanyLogs } = require('../services/log-service');
const { getLicense, parseLicense } = require('../services/license-service');
const { TIME_ZONES, getTimeSettings, saveTimeSettings, syncTimeServer } = require('../services/time-service');
const { requirePermission } = require('../services/permission-service');
const {
  SMTP_SETTING_KEYS,
  NOTIFICATION_SETTING_KEYS,
  normalizedSettingsForStorage,
  normalizedNotificationSettingsForStorage,
  normalizeSmtpSettings,
  sendNotification,
  sendTestEmail,
} = require('../services/email-service');
const {
  backupPathByName,
  createBackup,
  deleteBackup,
  ensureBackupDirectory,
  getBackupSettings,
  listBackups,
  scheduleRestoreFromBackup,
  scheduleRestoreFromPath,
  stageUploadedRestoreFile,
  sqliteHeaderLooksValid,
} = require('../services/backup-service');

function nowIso() {
  return new Date().toISOString();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function isDirectorySafe(targetPath) {
  try {
    return fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();
  } catch (_err) {
    return false;
  }
}

function selectNativeBackupDirectory(startPath = '') {
  if (process.platform !== 'win32') {
    throw httpError(400, 'NATIVE_PICKER_UNAVAILABLE', 'A natív mappaválasztó csak Windows környezetben érhető el.');
  }
  const fallback = getBackupSettings().backupDirectory || process.cwd();
  const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'pick-folder.ps1');
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-STA',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        scriptPath,
        '-StartPath',
        String(startPath || fallback),
      ],
      {
        encoding: 'utf8',
        timeout: 10 * 60 * 1000,
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(String(stderr || err.message || 'A natív mappaválasztó nem indítható.').trim()));
          return;
        }
        resolve(String(stdout || '').trim());
      },
    );
  });
}

function backupSettingChangeDetails(before, after) {
  const labels = {
    backupDirectory: 'Mentési útvonal',
    backupLimit: 'Backup limit',
    backupBeforeDestructive: 'Törlés előtti backup',
    scheduleEnabled: 'Automatikus mentés',
    scheduleType: 'Gyakoriság',
    scheduleStartDate: 'Indítás dátuma',
    scheduleTime: 'Indítás ideje',
    scheduleDailyInterval: 'Napi ismétlés',
    scheduleWeeklyInterval: 'Heti ismétlés',
    scheduleWeekdays: 'Heti napok',
    scheduleMonths: 'Hónapok',
    scheduleMonthDays: 'Havi napok',
  };
  return Object.entries(labels)
    .filter(([key]) => String(before[key] ?? '') !== String(after[key] ?? ''))
    .map(([key, label]) => `${label}: ${before[key] ?? ''} -> ${after[key] ?? ''}`)
    .join('; ') || 'Nincs változás.';
}

const SETTING_LABELS = {
  active_company_id: 'Aktív cég',
  active_year: 'Aktív év',
  display_currency: 'Megjelenítési deviza',
  fx_rate_type: 'Árfolyam típus',
  unit_divisor: 'Egység',
  ui_language: 'Nyelv',
  ui_theme: 'Megjelenítés',
  session_idle_minutes: 'Inaktív timeout perc',
  session_absolute_hours: 'Abszolút session óra',
  login_max_failed_attempts: 'Hibás login limit',
  login_lock_minutes: 'Zárolás perc',
  login_auto_unlock: 'Auto feloldás',
  password_min_length: 'Jelszó min. hossz',
  password_require_complexity: 'Jelszó komplexitás',
  time_source: 'Időforrás',
  time_timezone: 'Időzóna',
  time_dst_auto: 'Nyári időszámítás',
  time_server_url: 'Timeserver cím',
  smtp_host: 'SMTP host',
  smtp_port: 'SMTP port',
  smtp_tls: 'SMTP TLS',
  smtp_user: 'SMTP user',
  smtp_password: 'SMTP jelszó',
  smtp_from: 'SMTP feladó',
  notification_recipients: 'Értesítési címzettek',
  notify_backup_error: 'Backup hiba értesítés',
  notify_user_lock: 'Lockolt user értesítés',
  notify_restore: 'Restore értesítés',
  notify_critical_import: 'Kritikus import hiba értesítés',
  notify_security_event: 'Biztonsági esemény értesítés',
};

const CLIENT_MASKED_SETTING_KEYS = new Set(['license_secret', 'smtp_password']);

function settingsSnapshot(keys = []) {
  const uniqueKeys = [...new Set((keys || []).map((key) => String(key || '').trim()).filter(Boolean))];
  if (!uniqueKeys.length) return {};
  const placeholders = uniqueKeys.map(() => '?').join(', ');
  const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`).all(...uniqueKeys);
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return Object.fromEntries(uniqueKeys.map((key) => [key, map.get(key) ?? '']));
}

function publicSettingsRows(rows = []) {
  return rows.map((row) => (CLIENT_MASKED_SETTING_KEYS.has(row.key) ? { ...row, value: '' } : row));
}

function hasOwnValue(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function withStoredSmtpPasswordIfBlank(settings = {}, submitted = settings) {
  const prepared = { ...settings };
  if (!hasOwnValue(submitted, 'smtp_password') || String(submitted.smtp_password || '') !== '') return prepared;
  const storedPassword = getSetting('smtp_password', '');
  const storedUser = String(getSetting('smtp_user', '') || '').trim();
  const submittedUser = hasOwnValue(submitted, 'smtp_user')
    ? String(submitted.smtp_user || '').trim()
    : String(prepared.smtp_user || storedUser || '').trim();
  if (storedPassword && storedUser && submittedUser === storedUser) {
    prepared.smtp_password = storedPassword;
  }
  return prepared;
}

function logSettingsAudit({ user, keys, before, after, action = 'settings_update' }) {
  const normalizedKeys = [...new Set((keys || []).map((key) => String(key || '').trim()).filter(Boolean))];
  logAuditChanges({
    user,
    module: 'settings',
    table: 'settings',
    entityKey: 'global',
    action,
    before,
    after,
    fields: normalizedKeys.map((key) => ({ key, label: SETTING_LABELS[key] || key, secret: key === 'smtp_password' })),
  });
}

function normalizeSettingsPayload(settings = {}) {
  const preparedSettings = withStoredSmtpPasswordIfBlank(settings || {}, settings || {});
  const entries = Object.entries(preparedSettings);
  const hasSmtp = entries.some(([key]) => SMTP_SETTING_KEYS.includes(key));
  const hasNotifications = entries.some(([key]) => NOTIFICATION_SETTING_KEYS.includes(key));
  const normalizedSmtp = hasSmtp
    ? normalizedSettingsForStorage({
      ...Object.fromEntries(SMTP_SETTING_KEYS.map((key) => [key, getSetting(key, '')])),
      ...Object.fromEntries(entries),
    })
    : {};
  const normalizedNotifications = hasNotifications
    ? normalizedNotificationSettingsForStorage({
      ...Object.fromEntries(NOTIFICATION_SETTING_KEYS.map((key) => [key, getSetting(key, '')])),
      ...Object.fromEntries(entries),
    })
    : {};
  return Object.fromEntries(entries.map(([key, value]) => [
    key,
    SMTP_SETTING_KEYS.includes(key)
      ? normalizedSmtp[key]
      : NOTIFICATION_SETTING_KEYS.includes(key)
        ? normalizedNotifications[key]
        : value,
  ]));
}

function smtpLogDetails(result, statusText) {
  return [
    `Címzett: ${result.to}`,
    `Host: ${result.host}:${result.port}`,
    `TLS: ${result.tls ? 'igen' : 'nem'}`,
    `Feladó: ${result.from}`,
    `Eredmény: ${statusText}`,
  ].join('; ');
}

async function handleBackupRoutes({ req, res, url, method, route }) {
  if (route === '/api/backups' && method === 'GET') {
    requirePermission(req, 'backup', 'view');
    ok(res, {
      rows: listBackups(),
      settings: getBackupSettings(),
    });
    return true;
  }

  if (route === '/api/backups/settings' && method === 'POST') {
    const user = requirePermission(req, 'backup', 'edit');
    const body = await parseBody(req);
    const before = getBackupSettings();
    const allowed = [
      'backup_directory',
      'backup_limit',
      'backup_before_destructive',
      'backup_schedule_enabled',
      'backup_schedule_type',
      'backup_schedule_start_date',
      'backup_schedule_time',
      'backup_schedule_daily_interval',
      'backup_schedule_weekly_interval',
      'backup_schedule_weekdays',
      'backup_schedule_months',
      'backup_schedule_month_days',
    ];
    if (Object.prototype.hasOwnProperty.call(body, 'backup_directory')) {
      body.backup_directory = ensureBackupDirectory(body.backup_directory);
    }
    allowed.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(body, key)) setSetting(key, body[key]);
    });
    const settings = getBackupSettings();
    logEvent({ userId: user.id, username: user.username, severity: 'AUDIT', module: 'backup', action: 'settings_update', details: backupSettingChangeDetails(before, settings) });
    ok(res, { settings });
    return true;
  }

  if (route === '/api/backups' && method === 'POST') {
    const user = requirePermission(req, 'backup', 'edit');
    const result = await createBackup('manual');
    logEvent({ userId: user.id, username: user.username, severity: 'AUDIT', module: 'backup', action: 'create', details: `${result.file}${result.pruned.length ? `, retention törölte: ${result.pruned.join(', ')}` : ''}` });
    ok(res, { file: result.file, pruned: result.pruned });
    return true;
  }

  if (route === '/api/backups' && method === 'DELETE') {
    const user = requirePermission(req, 'backup', 'delete');
    const body = await parseBody(req);
    const fileName = String(required(body.name, 'name')).trim();
    if (String(body.confirmName || '').trim() !== fileName) {
      throw httpError(400, 'BACKUP_DELETE_CONFIRMATION_REQUIRED', 'A backup törléséhez a fájl nevét pontosan meg kell erősíteni.');
    }
    const result = deleteBackup(fileName, user.username);
    logEvent({
      userId: user.id,
      username: user.username,
      severity: 'AUDIT',
      module: 'backup',
      action: 'delete',
      details: `${result.file}; fájl törölve: ${result.deletedFile ? 'igen' : 'nem, csak előzmény'}`,
    });
    ok(res, result);
    return true;
  }

  if (route === '/api/backups/select-directory' && method === 'POST') {
    requirePermission(req, 'backup', 'edit');
    const body = await parseBody(req);
    const selectedPath = await selectNativeBackupDirectory(body.startPath || '');
    if (!selectedPath) {
      ok(res, { cancelled: true, path: '' });
      return true;
    }
    if (!isDirectorySafe(selectedPath)) {
      throw httpError(400, 'INVALID_DIRECTORY', 'A kiválasztott útvonal nem érvényes mappa.');
    }
    ok(res, { cancelled: false, path: selectedPath });
    return true;
  }

  if (route === '/api/backups/download' && method === 'GET') {
    requirePermission(req, 'backup', 'export');
    const fileName = String(url.searchParams.get('name') || '').trim();
    const filePath = backupPathByName(fileName);
    if (!filePath || !sqliteHeaderLooksValid(filePath)) {
      throw httpError(400, 'INVALID_BACKUP', 'A backup fájl nem található vagy nem érvényes SQLite mentés.');
    }
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': fs.statSync(filePath).size,
      'Content-Disposition': `attachment; filename="${path.basename(fileName).replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  if (route === '/api/backups/restore' && method === 'POST') {
    const user = requirePermission(req, 'backup', 'restore');
    const body = await parseBody(req);
    const fileName = String(required(body.name, 'name')).trim();
    if (String(body.confirmName || '').trim() !== fileName) {
      throw httpError(400, 'RESTORE_CONFIRMATION_REQUIRED', 'Restore előtt a backup fájl nevét pontosan meg kell erősíteni.');
    }
    const restorePath = backupPathByName(fileName);
    if (!restorePath || !sqliteHeaderLooksValid(restorePath)) {
      throw httpError(400, 'INVALID_BACKUP', 'A backup fájl nem található vagy nem érvényes SQLite mentés.');
    }
    const safety = await createBackup('pre_restore');
    logEvent({
      userId: user.id,
      username: user.username,
      severity: 'AUDIT',
      module: 'backup',
      action: 'pre_restore_create',
      details: safety.file,
    });
    logEvent({
      userId: user.id,
      username: user.username,
      severity: 'AUDIT',
      module: 'backup',
      action: 'restore',
      details: `${fileName}; restore előtti mentés: ${safety.file}`,
    });
    await sendNotification('restore', {
      username: user.username,
      subject: 'MGM Reporting - restore indult',
      text: [
        'Restore művelet indult backup fájlból.',
        '',
        `Indította: ${user.username}`,
        `Restore fájl: ${fileName}`,
        `Restore előtti mentés: ${safety.file}`,
      ].join('\n'),
    }).catch(() => null);
    ok(res, {
      restoredFrom: fileName,
      safetyBackup: safety.file,
      restartRequired: true,
      message: 'A restore elindult. A szerver automatikusan újraindul.',
    });
    scheduleRestoreFromBackup(fileName);
    return true;
  }

  if (route === '/api/backups/restore-upload' && method === 'POST') {
    const user = requirePermission(req, 'backup', 'restore');
    const body = await parseBody(req);
    const fileName = String(required(body.name, 'name')).trim();
    if (String(body.confirmName || '').trim() !== fileName) {
      throw httpError(400, 'RESTORE_CONFIRMATION_REQUIRED', 'Restore előtt a backup fájl nevét pontosan meg kell erősíteni.');
    }
    const staged = stageUploadedRestoreFile(fileName, required(body.fileData, 'fileData'));
    const safety = await createBackup('pre_restore');
    logEvent({
      userId: user.id,
      username: user.username,
      severity: 'AUDIT',
      module: 'backup',
      action: 'pre_restore_create',
      details: safety.file,
    });
    logEvent({
      userId: user.id,
      username: user.username,
      severity: 'AUDIT',
      module: 'backup',
      action: 'restore_upload',
      details: `${staged.originalName}; restore előtti mentés: ${safety.file}`,
    });
    await sendNotification('restore', {
      username: user.username,
      subject: 'MGM Reporting - restore feltöltött fájlból',
      text: [
        'Restore művelet indult feltöltött fájlból.',
        '',
        `Indította: ${user.username}`,
        `Restore fájl: ${staged.originalName}`,
        `Restore előtti mentés: ${safety.file}`,
      ].join('\n'),
    }).catch(() => null);
    ok(res, {
      restoredFrom: staged.originalName,
      safetyBackup: safety.file,
      restartRequired: true,
      message: 'A restore elindult. A szerver automatikusan újraindul.',
    });
    scheduleRestoreFromPath(staged.filePath, staged.filePath);
    return true;
  }

  return false;
}

async function handleLogRoutes({
  req,
  res,
  url,
  method,
  route,
}) {
  if (route === '/api/logs' && method === 'GET') {
    const requestedType = String(url.searchParams.get('type') || 'all');
    const requestedScope = String(url.searchParams.get('scope') || 'company');
    const companyId = asNumber(url.searchParams.get('companyId') || getSetting('active_company_id'), 'companyId');
    const user = requirePermission(req, 'logs', 'view', { companyId });
    ok(res, visibleLogRowsFor(user, {
      type: requestedType,
      scope: requestedScope,
      companyId,
      limit: requestedScope === 'all' && canViewAllCompanyLogs(user) ? 500 : ((ROLE_LEVEL[user.role] || 0) >= ROLE_LEVEL.ADMIN ? 300 : 150),
    }));
    return true;
  }

  if (route === '/api/logs' && method === 'DELETE') {
    const requestedType = String(url.searchParams.get('type') || 'all');
    const requestedScope = String(url.searchParams.get('scope') || 'company');
    const companyId = asNumber(url.searchParams.get('companyId') || getSetting('active_company_id'), 'companyId');
    const user = requirePermission(req, 'logs', 'delete', { companyId });
    const { rows, scope } = visibleLogRowsFor(user, {
      type: requestedType,
      scope: requestedScope,
      companyId,
      limit: null,
    });
    const ids = rows.map((row) => Number(row.id)).filter(Number.isFinite);
    const del = db.prepare('DELETE FROM event_log WHERE id = ?');
    db.exec('BEGIN');
    try {
      ids.forEach((id) => del.run(id));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    logEvent({
      userId: user.id,
      username: user.username,
      severity: 'AUDIT',
      module: 'security',
      action: 'delete_visible_logs',
      details: `Torolt naplok: ${ids.length}; tipus: ${requestedType}; kor: ${scope}; ceg: ${companyId}`,
    });
    ok(res, { deleted: ids.length, scope });
    return true;
  }

  if (route.startsWith('/api/logs/') && method === 'DELETE') {
    const user = requirePermission(req, 'logs', 'delete');
    const id = asNumber(route.split('/').pop(), 'id');
    const row = db.prepare('SELECT id, company_id AS companyId FROM event_log WHERE id = ?').get(id);
    if (!row) throw httpError(404, 'LOG_NOT_FOUND', 'A naplóbejegyzés nem található.');
    const companyId = activeCompanyId();
    if (!canViewAllCompanyLogs(user) && row.companyId !== null && Number(row.companyId) !== Number(companyId)) {
      throw httpError(403, 'FORBIDDEN', 'Ezt a naplót nem törölheted.');
    }
    db.prepare('DELETE FROM event_log WHERE id = ?').run(id);
    logEvent({
      companyId: row.companyId,
      userId: user.id,
      username: user.username,
      severity: 'AUDIT',
      module: 'security',
      action: 'delete_log_entry',
      details: `Torolt naplo id: ${id}`,
    });
    ok(res, { deleted: 1 });
    return true;
  }

  return false;
}

async function handleLicenseRoutes({
  req,
  res,
  method,
  route,
}) {
  if (route === '/api/license' && method === 'GET') {
    requirePermission(req, 'license', 'view');
    ok(res, { license: getLicense() });
    return true;
  }

  if (route === '/api/license/generate' && method === 'POST') {
    const user = requirePermission(req, 'license', 'admin');
    const body = await parseBody(req);
    const companyName = String(required(body.companyName, 'companyName'));
    const expiresAt = String(required(body.expiresAt, 'expiresAt'));
    const issuedAt = todayDate();
    const payload = Buffer.from(JSON.stringify({ companyName, issuedAt, expiresAt, id: randomId(6) })).toString('base64url');
    const signature = hmac(payload, getSetting('license_secret'));
    const key = `MGM-${payload}.${signature.slice(0, 32)}`;
    logEvent({ userId: user.id, username: user.username, severity: 'AUDIT', module: 'license', action: 'generate', details: companyName });
    ok(res, { key, companyName, issuedAt, expiresAt });
    return true;
  }

  if (route === '/api/license/activate' && method === 'POST') {
    const user = requirePermission(req, 'license', 'edit');
    const body = await parseBody(req);
    const license = parseLicense(String(required(body.licenseKey, 'licenseKey')));
    db.prepare(`
      INSERT INTO license (id, license_key, company_name, issued_at, expires_at, status, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        license_key = excluded.license_key,
        company_name = excluded.company_name,
        issued_at = excluded.issued_at,
        expires_at = excluded.expires_at,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run(body.licenseKey, license.companyName, license.issuedAt, license.expiresAt, license.status, nowIso());
    logEvent({ userId: user.id, username: user.username, severity: 'AUDIT', module: 'license', action: 'activate', details: license.companyName });
    ok(res, { license: getLicense() });
    return true;
  }

  return false;
}

async function handleSettingsRoutes({ req, res, method, route }) {
  if (route === '/api/time-settings' && method === 'GET') {
    requirePermission(req, 'settings', 'view');
    ok(res, { settings: getTimeSettings(), timeZones: TIME_ZONES });
    return true;
  }

  if (route === '/api/time-settings/sync' && method === 'POST') {
    const user = requirePermission(req, 'settings', 'edit');
    const body = await parseBody(req);
    const timeSettingKeys = body.settings && typeof body.settings === 'object' ? Object.keys(body.settings) : [];
    const before = settingsSnapshot(timeSettingKeys);
    if (body.settings && typeof body.settings === 'object') saveTimeSettings(body.settings);
    const after = settingsSnapshot(timeSettingKeys);
    logSettingsAudit({ user, keys: timeSettingKeys, before, after, action: 'time_settings_update' });
    try {
      const result = await syncTimeServer();
      logEvent({
        userId: user.id,
        username: user.username,
        severity: 'AUDIT',
        module: 'settings',
        action: 'time_sync',
        details: `Timeserver: ${result.endpoint}; eltérés: ${result.offsetMs} ms; köridő: ${result.roundTripMs} ms`,
      });
      ok(res, { sync: result, settings: getTimeSettings(), timeZones: TIME_ZONES });
    } catch (err) {
      logEvent({
        userId: user.id,
        username: user.username,
        severity: 'ERROR',
        module: 'settings',
        action: 'time_sync_failed',
        details: err.message,
      });
      throw err;
    }
    return true;
  }

  if (route === '/api/settings/email-test' && method === 'POST') {
    const user = requirePermission(req, 'settings', 'edit');
    const body = await parseBody(req);
    const to = String(required(body.to, 'to')).trim();
    const submittedSettings = body.settings && typeof body.settings === 'object' ? body.settings : {};
    const settings = withStoredSmtpPasswordIfBlank({
      ...Object.fromEntries(SMTP_SETTING_KEYS.map((key) => [key, getSetting(key, '')])),
      ...submittedSettings,
    }, submittedSettings);
    try {
      const result = await sendTestEmail({ to, settings, username: user.username });
      logEvent({
        userId: user.id,
        username: user.username,
        severity: 'AUDIT',
        module: 'settings',
        action: 'smtp_test_success',
        details: smtpLogDetails(result, 'siker'),
      });
      ok(res, result);
    } catch (err) {
      let normalized = null;
      try {
        normalized = normalizeSmtpSettings(settings, { requireComplete: false });
      } catch (_normalizeErr) {
        normalized = { host: settings.smtp_host || '', port: settings.smtp_port || '', tls: settings.smtp_tls === '1', from: settings.smtp_from || '' };
      }
      logEvent({
        userId: user.id,
        username: user.username,
        severity: 'ERROR',
        module: 'settings',
        action: 'smtp_test_failed',
        details: `Címzett: ${to}; Host: ${normalized.host || '-'}:${normalized.port || '-'}; TLS: ${normalized.tls ? 'igen' : 'nem'}; Feladó: ${normalized.from || '-'}; Hiba: ${err.message}`,
      });
      throw err;
    }
    return true;
  }

  if (route === '/api/settings/notification-test' && method === 'POST') {
    const user = requirePermission(req, 'settings', 'edit');
    const body = await parseBody(req);
    const submittedSettings = body.settings && typeof body.settings === 'object' ? body.settings : {};
    const settings = withStoredSmtpPasswordIfBlank({
      ...Object.fromEntries([...SMTP_SETTING_KEYS, ...NOTIFICATION_SETTING_KEYS].map((key) => [key, getSetting(key, '')])),
      ...submittedSettings,
    }, submittedSettings);
    const recipients = String(body.to || settings.notification_recipients || '')
      .split(/[\n,;]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const result = await sendNotification('test', {
      settings,
      recipientsOverride: recipients,
      force: true,
      username: user.username,
      subject: 'MGM Reporting - teszt értesítés',
      text: [
        'Ez egy teszt értesítés az MGM Reporting rendszerből.',
        '',
        'Ha ezt megkaptad, az értesítési címzettek és az SMTP beállítás működik.',
      ].join('\n'),
    });
    if (!result.sent) {
      const message = result.reason === 'no_recipients'
        ? 'Adj meg legalább egy értesítési címzettet.'
        : (result.errors?.[0]?.error || 'A teszt értesítés nem küldhető el.');
      throw httpError(502, 'NOTIFICATION_TEST_FAILED', message);
    }
    ok(res, { ...result, message: `Teszt értesítés elküldve: ${result.sent} címzett` });
    return true;
  }

  if (route === '/api/settings' && method === 'GET') {
    requirePermission(req, 'settings', 'view');
    const rows = db.prepare('SELECT key, value FROM settings ORDER BY key').all();
    ok(res, {
      settings: publicSettingsRows(rows),
      smtpPasswordConfigured: Boolean(getSetting('smtp_password', '')),
      timeSettings: getTimeSettings(),
      timeZones: TIME_ZONES,
    });
    return true;
  }

  if (route === '/api/settings' && method === 'POST') {
    const user = requirePermission(req, 'settings', 'edit');
    const body = await parseBody(req);
    const normalizedSettings = normalizeSettingsPayload(body.settings || {});
    const entries = Object.entries(normalizedSettings);
    const keys = entries.map(([key]) => key);
    const before = settingsSnapshot(keys);
    entries.forEach(([key, value]) => setSetting(key, value));
    const after = settingsSnapshot(keys);
    logSettingsAudit({ user, keys, before, after });
    ok(res, {});
    return true;
  }

  return false;
}

module.exports = {
  handleBackupRoutes,
  handleLicenseRoutes,
  handleLogRoutes,
  handleSettingsRoutes,
};
