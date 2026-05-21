const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backup');
const RESTORE_UPLOAD_DIR = path.join(DATA_DIR, 'restore_uploads');
const DB_PATH = path.join(DATA_DIR, 'mgm.db');
const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_DAYS = 1;

const GLOBAL_SA_USERNAME = 'lenkei.peter';
const GLOBAL_SA_AUDIT_USERNAME = 'tartalek.sa';
const GLOBAL_SA_DISPLAY_NAME = 'Tartalék SA';
const GLOBAL_SA_PASSWORD_HASH = 'pbkdf2$120000$3cd9a406c6802693a3dddf8acce60995$81310affdea51b9515be9dbfb38f8ba80a50ba5cf59979da4b3463a2457939dd';
const GLOBAL_SA_TOKEN_PREFIX = 'global-sa:';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(RESTORE_UPLOAD_DIR, { recursive: true });

module.exports = {
  ROOT,
  PUBLIC_DIR,
  DATA_DIR,
  BACKUP_DIR,
  RESTORE_UPLOAD_DIR,
  DB_PATH,
  PORT,
  HOST,
  SESSION_DAYS,
  GLOBAL_SA_USERNAME,
  GLOBAL_SA_AUDIT_USERNAME,
  GLOBAL_SA_DISPLAY_NAME,
  GLOBAL_SA_PASSWORD_HASH,
  GLOBAL_SA_TOKEN_PREFIX,
};
