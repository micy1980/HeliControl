const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { BACKUP_DIR, DB_PATH, RESTORE_UPLOAD_DIR, ROOT } = require('../config');
const { db, sqliteBackup } = require('../db');
const { getSetting, setSetting } = require('./settings-service');
const { appNow, formatFileStamp, zonedNow } = require('./time-service');

let schedulerTimer = null;
let schedulerRunning = false;

function nowStamp() {
  return formatFileStamp(appNow());
}

function nowIso() {
  return appNow().toISOString();
}

function safePart(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function backupLimit() {
  const raw = Number(getSetting('backup_limit', '30'));
  if (!Number.isFinite(raw)) return 30;
  return Math.max(1, Math.min(365, Math.trunc(raw)));
}

function matchesReplacementPattern(candidate, pattern) {
  if (candidate.length !== pattern.length) return false;
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern[i] !== '\uFFFD' && pattern[i] !== candidate[i]) return false;
  }
  return true;
}

function repairPathReplacementChars(value) {
  let raw = String(value || '').trim().replaceAll('Asztali g\uFFFDp', 'Asztali gép');
  if (!raw.includes('\uFFFD')) return raw;

  const parsed = path.parse(raw);
  const parts = raw.slice(parsed.root.length).split(/[\\/]+/).filter(Boolean);
  let current = parsed.root || '';
  const repaired = [];

  for (const part of parts) {
    let next = part;
    if (part.includes('\uFFFD') && current && fs.existsSync(current)) {
      try {
        const matches = fs.readdirSync(current).filter((entry) => matchesReplacementPattern(entry, part));
        if (matches.length === 1) next = matches[0];
      } catch (_err) {
        // If the parent is not readable, keep the original segment and let validation fail normally.
      }
    }
    repaired.push(next);
    current = current ? path.join(current, next) : next;
  }

  return parsed.root ? path.join(parsed.root, ...repaired) : repaired.join(path.sep);
}

function ensureBackupDirectory(value) {
  const raw = repairPathReplacementChars(value || BACKUP_DIR);
  const resolved = path.resolve(path.isAbsolute(raw) ? raw : path.join(ROOT, raw));
  if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) {
    throw new Error('A backup útvonal nem könyvtár.');
  }
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function configuredBackupDirectory() {
  return ensureBackupDirectory(getSetting('backup_directory', BACKUP_DIR));
}

function autoBackupBeforeDestructive() {
  return String(getSetting('backup_before_destructive', '1')) !== '0';
}

function backupFilePathByName(name) {
  const fileName = path.basename(String(name || ''));
  if (!fileName.endsWith('.db')) return null;
  const backupDir = configuredBackupDirectory();
  const fullPath = path.resolve(backupDir, fileName);
  if (!fullPath.startsWith(path.resolve(backupDir) + path.sep)) return null;
  return fullPath;
}

function backupPathByName(name) {
  const fullPath = backupFilePathByName(name);
  return fullPath && fs.existsSync(fullPath) ? fullPath : null;
}

function sqliteHeaderLooksValid(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  const header = Buffer.alloc(16);
  const fd = fs.openSync(filePath, 'r');
  try {
    const read = fs.readSync(fd, header, 0, 16, 0);
    return read === 16 && header.toString('ascii') === 'SQLite format 3\0';
  } finally {
    fs.closeSync(fd);
  }
}

function backupTypeFromReason(reason, fileName = '') {
  const raw = String(reason || '');
  const name = String(fileName || '');
  if (raw === 'predelete' || raw === 'predelete_company' || name.includes('_predelete_') || name.includes('_predelete_company_')) return 'Törlés előtti';
  if (raw === 'pre_restore' || name.includes('_pre_restore_')) return 'Restore előtti';
  if (raw === 'auto' || name.includes('_auto_')) return 'Automatikus';
  return 'Kézi';
}

function backupCreatedAt(stat) {
  const created = stat.birthtime && stat.birthtime.getTime() > 0 ? stat.birthtime : stat.mtime;
  return created.toISOString();
}

function recordBackupHistory({ file, filePath, reason = 'manual', scope = '' }) {
  const stat = fs.statSync(filePath);
  db.prepare(`
    INSERT INTO backup_history (file_name, type, reason, scope, created_at, size, file_path, deleted_at, deleted_by, delete_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '', '')
    ON CONFLICT(file_name) DO UPDATE SET
      type = excluded.type,
      reason = excluded.reason,
      scope = excluded.scope,
      created_at = excluded.created_at,
      size = excluded.size,
      file_path = excluded.file_path,
      deleted_at = NULL,
      deleted_by = '',
      delete_reason = ''
  `).run(
    file,
    backupTypeFromReason(reason, file),
    reason,
    scope,
    backupCreatedAt(stat),
    stat.size,
    filePath,
  );
}

function registerDirectoryBackups(backupDir) {
  fs.readdirSync(backupDir)
    .filter((name) => name.endsWith('.db'))
    .forEach((name) => {
      const filePath = path.join(backupDir, name);
      const stat = fs.statSync(filePath);
      db.prepare(`
        INSERT OR IGNORE INTO backup_history (file_name, type, reason, scope, created_at, size, file_path)
        VALUES (?, ?, '', '', ?, ?, ?)
      `).run(name, backupTypeFromReason('', name), backupCreatedAt(stat), stat.size, filePath);
      db.prepare(`
        UPDATE backup_history
        SET size = ?, file_path = ?
        WHERE file_name = ? AND deleted_at IS NULL
      `).run(stat.size, filePath, name);
    });
}

function listBackups() {
  const backupDir = configuredBackupDirectory();
  registerDirectoryBackups(backupDir);
  return db.prepare(`
    SELECT file_name, type, reason, scope, created_at, size, file_path
    FROM backup_history
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
  `).all().map((row) => {
    const filePath = backupFilePathByName(row.file_name);
    const exists = Boolean(filePath && fs.existsSync(filePath));
    const stat = exists ? fs.statSync(filePath) : null;
    const valid = exists && sqliteHeaderLooksValid(filePath);
    return {
      name: row.file_name,
      type: row.type || backupTypeFromReason(row.reason, row.file_name),
      size: exists ? stat.size : row.size,
      createdAt: row.created_at,
      modifiedAt: exists ? stat.mtime.toISOString() : '',
      exists,
      missing: !exists,
      valid,
    };
  });
}

function markBackupDeleted(fileName, deletedBy = '', reason = '') {
  db.prepare(`
    UPDATE backup_history
    SET deleted_at = ?, deleted_by = ?, delete_reason = ?
    WHERE file_name = ?
  `).run(nowIso(), deletedBy, reason, fileName);
}

function pruneBackups(limit = backupLimit()) {
  const rows = listBackups().filter((row) => row.exists);
  const excess = rows.slice(limit);
  excess.forEach((row) => {
    const filePath = backupPathByName(row.name);
    if (filePath) fs.unlinkSync(filePath);
    markBackupDeleted(row.name, 'system', 'retention');
  });
  return excess.map((row) => row.name);
}

async function createBackup(reason = 'manual', scope = '') {
  const reasonPart = safePart(reason) || 'manual';
  const scopePart = safePart(scope);
  const file = `mgm_${nowStamp()}_${reasonPart}${scopePart ? `_${scopePart}` : ''}.db`;
  const filePath = path.join(configuredBackupDirectory(), file);
  await sqliteBackup(db, filePath);
  recordBackupHistory({ file, filePath, reason, scope });
  const pruned = pruneBackups();
  setSetting('backup_last_success_at', nowIso());
  setSetting('backup_last_file', file);
  setSetting('backup_last_error', '');
  return { file, filePath, pruned };
}

function deleteBackup(fileName, username = '') {
  const file = path.basename(String(fileName || ''));
  if (!file || !file.endsWith('.db')) {
    throw new Error('Érvénytelen backup fájlnév.');
  }
  const filePath = backupFilePathByName(file);
  const existed = Boolean(filePath && fs.existsSync(filePath));
  if (existed) fs.unlinkSync(filePath);
  markBackupDeleted(file, username, existed ? 'manual' : 'missing_record_cleanup');
  return { file, deletedFile: existed };
}

function scheduleRestoreFromPath(sourcePath, cleanupPath = '') {
  if (!sourcePath || !sqliteHeaderLooksValid(sourcePath)) {
    throw new Error('A backup fájl nem található vagy nem érvényes SQLite mentés.');
  }
  setTimeout(() => {
    const restartHelper = path.join(ROOT, 'scripts', 'restart-server.js');
    db.close();
    fs.copyFileSync(sourcePath, DB_PATH);
    if (cleanupPath && fs.existsSync(cleanupPath)) fs.unlinkSync(cleanupPath);
    if (fs.existsSync(restartHelper)) {
      const child = spawn(process.execPath, [restartHelper, '1800'], {
        cwd: ROOT,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    }
    process.exit(0);
  }, 3500);
}

function scheduleRestoreFromBackup(fileName) {
  scheduleRestoreFromPath(backupPathByName(fileName));
}

function stageUploadedRestoreFile(fileName, fileData) {
  const originalName = path.basename(String(fileName || 'uploaded.db')) || 'uploaded.db';
  const safeName = safePart(originalName.replace(/\.db$/i, '')) || 'uploaded';
  const targetName = `restore_${nowStamp()}_${safeName}.db`;
  fs.mkdirSync(RESTORE_UPLOAD_DIR, { recursive: true });
  const filePath = path.join(RESTORE_UPLOAD_DIR, targetName);
  const buffer = Buffer.from(String(fileData || ''), 'base64');
  if (!buffer.length) throw new Error('A restore fájl üres.');
  fs.writeFileSync(filePath, buffer);
  if (!sqliteHeaderLooksValid(filePath)) {
    fs.unlinkSync(filePath);
    throw new Error('A kiválasztott fájl nem érvényes SQLite mentés.');
  }
  return { originalName, filePath, size: buffer.length };
}

function numberSetting(key, fallback, min = 1, max = 9999) {
  const value = Number(getSetting(key, fallback));
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function csvNumberSet(value, fallback = []) {
  const raw = String(value || '').trim();
  const parts = raw ? raw.split(',') : fallback;
  return new Set(parts.map((part) => Number(part)).filter((n) => Number.isFinite(n)));
}

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseLocalDate(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayIndex(date) {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86400000);
}

function parseTimeMinutes(value) {
  const match = String(value || '23:00').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 23 * 60;
  const h = Math.max(0, Math.min(23, Number(match[1])));
  const m = Math.max(0, Math.min(59, Number(match[2])));
  return h * 60 + m;
}

function currentTimeMinutes(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function jsWeekdayToSetting(date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function isLastDayOfMonth(date) {
  return date.getDate() === new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function scheduledBackupDue(now = zonedNow()) {
  if (String(getSetting('backup_schedule_enabled', '0')) !== '1') return null;
  const type = String(getSetting('backup_schedule_type', 'daily') || 'daily');
  const time = String(getSetting('backup_schedule_time', '23:00') || '23:00');
  if (currentTimeMinutes(now) < parseTimeMinutes(time)) return null;

  const today = localDateKey(now);
  const slot = `${type}:${today}:${time}`;
  if (getSetting('backup_schedule_last_run_slot', '') === slot) return null;

  const startDate = parseLocalDate(getSetting('backup_schedule_start_date', today)) || new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dayIndex(now) < dayIndex(startDate)) return null;

  if (type === 'once') {
    if (today !== localDateKey(startDate)) return null;
    return { slot, type };
  }

  if (type === 'daily') {
    const diff = dayIndex(now) - dayIndex(startDate);
    const interval = numberSetting('backup_schedule_daily_interval', 1, 1, 365);
    return diff % interval === 0 ? { slot, type } : null;
  }

  if (type === 'weekly') {
    const diffWeeks = Math.floor((dayIndex(now) - dayIndex(startDate)) / 7);
    const interval = numberSetting('backup_schedule_weekly_interval', 1, 1, 52);
    const weekdays = csvNumberSet(getSetting('backup_schedule_weekdays', '1'), [1]);
    if (diffWeeks % interval !== 0 || !weekdays.has(jsWeekdayToSetting(now))) return null;
    return { slot, type };
  }

  if (type === 'monthly') {
    const months = csvNumberSet(getSetting('backup_schedule_months', '1,2,3,4,5,6,7,8,9,10,11,12'), [now.getMonth() + 1]);
    if (!months.has(now.getMonth() + 1)) return null;
    const dayTokens = String(getSetting('backup_schedule_month_days', 'last') || 'last')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const dayMatches = dayTokens.includes('last') && isLastDayOfMonth(now);
    const numericMatches = dayTokens.map(Number).some((day) => Number.isFinite(day) && day === now.getDate());
    return dayMatches || numericMatches ? { slot, type } : null;
  }

  return null;
}

async function runScheduledBackup(due) {
  setSetting('backup_schedule_last_run_slot', due.slot);
  try {
    const result = await createBackup('auto', due.type);
    setSetting('backup_last_success_at', nowIso());
    setSetting('backup_last_file', result.file);
    setSetting('backup_last_error', '');
    if (due.type === 'once') setSetting('backup_schedule_enabled', '0');
    const { logEvent } = require('./log-service');
    logEvent({
      severity: 'AUDIT',
      module: 'backup',
      action: 'auto_create',
      details: `${result.file}${result.pruned.length ? `; retention törölte: ${result.pruned.join(', ')}` : ''}`,
    });
  } catch (err) {
    setSetting('backup_last_error', err.message);
    const { logEvent } = require('./log-service');
    logEvent({ severity: 'ERROR', module: 'backup', action: 'auto_create_failed', details: err.stack || err.message });
    const { sendNotification } = require('./email-service');
    await sendNotification('backup_error', {
      subject: 'MGM Reporting - automatikus backup hiba',
      text: [
        'Az automatikus backup nem futott le sikeresen.',
        '',
        `Ütemezés: ${due.type}`,
        `Idősáv: ${due.slot}`,
        `Hiba: ${err.message}`,
      ].join('\n'),
    }).catch(() => null);
  }
}

function startBackupScheduler() {
  if (schedulerTimer) return schedulerTimer;
  const tick = async () => {
    if (schedulerRunning) return;
    const due = scheduledBackupDue();
    if (!due) return;
    schedulerRunning = true;
    try {
      await runScheduledBackup(due);
    } finally {
      schedulerRunning = false;
    }
  };
  schedulerTimer = setInterval(tick, 60 * 1000);
  setTimeout(tick, 5000);
  return schedulerTimer;
}

function getBackupSettings() {
  return {
    backupDirectory: configuredBackupDirectory(),
    backupLimit: Number(getSetting('backup_limit', '30')),
    backupBeforeDestructive: String(getSetting('backup_before_destructive', '1')) !== '0',
    scheduleEnabled: String(getSetting('backup_schedule_enabled', '0')) === '1',
    scheduleType: getSetting('backup_schedule_type', 'daily'),
    scheduleStartDate: getSetting('backup_schedule_start_date', localDateKey(zonedNow())),
    scheduleTime: getSetting('backup_schedule_time', '23:00'),
    scheduleDailyInterval: Number(getSetting('backup_schedule_daily_interval', '1')),
    scheduleWeeklyInterval: Number(getSetting('backup_schedule_weekly_interval', '1')),
    scheduleWeekdays: getSetting('backup_schedule_weekdays', '1,2,3,4,5'),
    scheduleMonths: getSetting('backup_schedule_months', '1,2,3,4,5,6,7,8,9,10,11,12'),
    scheduleMonthDays: getSetting('backup_schedule_month_days', 'last'),
    lastSuccessAt: getSetting('backup_last_success_at', ''),
    lastFile: getSetting('backup_last_file', ''),
    lastError: getSetting('backup_last_error', ''),
  };
}

module.exports = {
  autoBackupBeforeDestructive,
  backupPathByName,
  configuredBackupDirectory,
  ensureBackupDirectory,
  createBackup,
  deleteBackup,
  getBackupSettings,
  listBackups,
  pruneBackups,
  scheduleRestoreFromPath,
  scheduleRestoreFromBackup,
  stageUploadedRestoreFile,
  startBackupScheduler,
  sqliteHeaderLooksValid,
};
