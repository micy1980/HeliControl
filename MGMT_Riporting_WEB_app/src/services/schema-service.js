const { db } = require('../db');
const { BACKUP_DIR } = require('../config');
const { randomId, hashPassword } = require('../security');
const { getSetting, setSetting, activeCompanyId } = require('./settings-service');
const { seedFxRates } = require('./fx-service');
const { normalizeStoredReportStructureCodes } = require('./report-structure-service');
const { seedMasterData, seedSummaryRules } = require('./seed-service');
const { seedValidationRules } = require('./validation-rule-service');

function nowIso() {
  return new Date().toISOString();
}

function ensureColumn(table, column, alterSql) {
  const columns = tableColumns(table);
  if (!columns.includes(column)) db.exec(alterSql);
}

function tableColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

function migrateCompanyScopedMasterData() {
  const companyId = activeCompanyId();
  if (!tableColumns('reporting_categories').includes('company_id')) {
    db.exec(`
      ALTER TABLE reporting_categories RENAME TO reporting_categories_old;
      CREATE TABLE reporting_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(company_id, code)
      );
    `);
    db.prepare(`
      INSERT INTO reporting_categories (company_id, code, name, active, created_at, updated_at)
      SELECT ?, code, name, active, created_at, updated_at
      FROM reporting_categories_old
    `).run(companyId);
    db.exec('DROP TABLE reporting_categories_old;');
  }

  if (!tableColumns('cons_accounts').includes('company_id')) {
    db.exec(`
      ALTER TABLE cons_accounts RENAME TO cons_accounts_old;
      CREATE TABLE cons_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        reporting_category_code TEXT NOT NULL DEFAULT '',
        statement_type TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(company_id, code)
      );
    `);
    db.prepare(`
      INSERT INTO cons_accounts (company_id, code, name, reporting_category_code, statement_type, active, created_at, updated_at)
      SELECT ?, code, name, reporting_category_code, statement_type, active, created_at, updated_at
      FROM cons_accounts_old
    `).run(companyId);
    db.exec('DROP TABLE cons_accounts_old;');
  }
}

function migrateReportStructures() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS report_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      structure_type TEXT NOT NULL CHECK(structure_type IN ('MGMT','CONS')),
      group_level INTEGER NOT NULL CHECK(group_level BETWEEN 1 AND 3),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(company_id, structure_type, group_level, code)
    );

    CREATE TABLE IF NOT EXISTS report_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      structure_type TEXT NOT NULL CHECK(structure_type IN ('MGMT','CONS')),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      group1_code TEXT NOT NULL DEFAULT '',
      group1_required INTEGER NOT NULL DEFAULT 1,
      group2_code TEXT NOT NULL DEFAULT '',
      group2_required INTEGER NOT NULL DEFAULT 1,
      group3_code TEXT NOT NULL DEFAULT '',
      group3_required INTEGER NOT NULL DEFAULT 0,
      statement_type TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(company_id, structure_type, code)
    );

    CREATE INDEX IF NOT EXISTS idx_report_groups_scope ON report_groups(company_id, structure_type, group_level);
    CREATE INDEX IF NOT EXISTS idx_report_codes_scope ON report_codes(company_id, structure_type);
  `);

  const cleanupCompanyIds = db.prepare('SELECT id FROM companies').all().map((row) => row.id);
  cleanupCompanyIds.forEach((companyId) => {
    db.prepare("UPDATE chart_of_accounts SET cons_account = '' WHERE company_id = ? AND cons_account = 'UNMAPPED'").run(companyId);
    db.prepare("UPDATE chart_of_accounts SET reporting_category = '' WHERE company_id = ? AND reporting_category = 'UNMAPPED'").run(companyId);
    db.prepare("DELETE FROM cons_accounts WHERE company_id = ? AND code = 'UNMAPPED'").run(companyId);
    db.prepare("DELETE FROM reporting_categories WHERE company_id = ? AND code = 'UNMAPPED'").run(companyId);
  });
  normalizeStoredReportStructureCodes();
}

function migrateCompanyScopedImportSetup() {
  const companyId = activeCompanyId();
  if (!tableColumns('import_templates').includes('company_id')) {
    db.exec(`
      ALTER TABLE import_templates RENAME TO import_templates_old;
      CREATE TABLE import_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        import_type TEXT NOT NULL,
        name TEXT NOT NULL,
        mapping_json TEXT NOT NULL,
        selected_rule_ids_json TEXT NOT NULL DEFAULT '[]',
        include_summary_rows INTEGER NOT NULL DEFAULT 0,
        include_inactive INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(company_id, import_type, name)
      );
    `);
    db.prepare(`
      INSERT INTO import_templates
        (id, company_id, import_type, name, mapping_json, selected_rule_ids_json, include_summary_rows, include_inactive, created_by, created_at, updated_at)
      SELECT id, ?, import_type, name, mapping_json, selected_rule_ids_json, include_summary_rows, include_inactive, created_by, created_at, updated_at
      FROM import_templates_old
    `).run(companyId);
    db.exec('DROP TABLE import_templates_old;');
  }

  if (!tableColumns('summary_rules').includes('company_id')) {
    db.exec(`
      ALTER TABLE summary_rules RENAME TO summary_rules_old;
      CREATE TABLE summary_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        rule_type TEXT NOT NULL DEFAULT 'summary',
        column_name TEXT NOT NULL,
        operator TEXT NOT NULL DEFAULT 'equals',
        match_value TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(company_id, name)
      );
    `);
    db.prepare(`
      INSERT INTO summary_rules
        (id, company_id, name, rule_type, column_name, operator, match_value, active, created_by, created_at, updated_at)
      SELECT id, ?, name, rule_type, column_name, operator, match_value, active, created_by, created_at, updated_at
      FROM summary_rules_old
    `).run(companyId);
    db.exec('DROP TABLE summary_rules_old;');
  }
}

function initDb() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ui_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module TEXT NOT NULL DEFAULT '',
      menu TEXT NOT NULL DEFAULT '',
      label_key TEXT NOT NULL UNIQUE,
      hu TEXT NOT NULL DEFAULT '',
      en TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('SA','ADMIN','USER','VIEWER')),
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      dark_mode INTEGER NOT NULL DEFAULT 0,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      revoked_at TEXT,
      revoked_by INTEGER REFERENCES users(id),
      revoke_reason TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      fiscal_year_start INTEGER NOT NULL DEFAULT 1,
      base_currency TEXT NOT NULL DEFAULT 'HUF',
      logo_file_name TEXT NOT NULL DEFAULT '',
      logo_data TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_company_permissions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      can_view INTEGER NOT NULL DEFAULT 1,
      can_manage INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (user_id, company_id)
    );

    CREATE TABLE IF NOT EXISTS user_module_permissions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      module_key TEXT NOT NULL,
      action_key TEXT NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (user_id, module_key, action_key)
    );

    CREATE TABLE IF NOT EXISTS chart_of_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      gl_number TEXT NOT NULL,
      gl_name TEXT NOT NULL DEFAULT '',
      cons_account TEXT NOT NULL,
      reporting_category TEXT NOT NULL,
      statement_type TEXT NOT NULL CHECK(statement_type IN ('BS','PL')),
      is_summary INTEGER NOT NULL DEFAULT 0,
      is_fx_trans_diff INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'Manual',
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(company_id, gl_number)
    );

    CREATE TABLE IF NOT EXISTS gl_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
      scenario TEXT NOT NULL CHECK(scenario IN ('ACT','PY','BUD','FCST')),
      gl_number TEXT NOT NULL,
      gl_name TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      imported_by INTEGER REFERENCES users(id),
      batch_id TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      UNIQUE(company_id, year, month, scenario, gl_number)
    );

    CREATE TABLE IF NOT EXISTS budget_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
      scenario TEXT NOT NULL CHECK(scenario IN ('BUD','FCST')),
      gl_number TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      updated_by INTEGER REFERENCES users(id),
      updated_at TEXT NOT NULL,
      UNIQUE(company_id, year, month, scenario, gl_number)
    );

    CREATE TABLE IF NOT EXISTS fx_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
      currency TEXT NOT NULL,
      average_rate REAL NOT NULL,
      month_end_rate REAL NOT NULL,
      manual INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      UNIQUE(year, month, currency)
    );

    CREATE TABLE IF NOT EXISTS import_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL UNIQUE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      scenario TEXT NOT NULL,
      import_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      imported_rows INTEGER NOT NULL,
      unknown_gl_count INTEGER NOT NULL DEFAULT 0,
      imported_by INTEGER REFERENCES users(id),
      imported_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      overwrite_status TEXT NOT NULL DEFAULT 'NORMAL',
      zero_row_count INTEGER NOT NULL DEFAULT 0,
      source_row_count INTEGER NOT NULL DEFAULT 0,
      hard_error_count INTEGER NOT NULL DEFAULT 0,
      business_error_count INTEGER NOT NULL DEFAULT 0,
      soft_error_count INTEGER NOT NULL DEFAULT 0,
      soft_ok_count INTEGER NOT NULL DEFAULT 0,
      validation_json TEXT NOT NULL DEFAULT '{}',
      activated_by INTEGER REFERENCES users(id),
      activated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS gl_import_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES import_sessions(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
      scenario TEXT NOT NULL DEFAULT 'ACT',
      source_row_no INTEGER NOT NULL,
      gl_number TEXT NOT NULL,
      imported_gl_name TEXT NOT NULL DEFAULT '',
      coa_gl_name TEXT NOT NULL DEFAULT '',
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      validation_status TEXT NOT NULL DEFAULT 'OK',
      business_errors_json TEXT NOT NULL DEFAULT '[]',
      soft_errors_json TEXT NOT NULL DEFAULT '[]',
      soft_ok INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      import_type TEXT NOT NULL,
      name TEXT NOT NULL,
      mapping_json TEXT NOT NULL,
      selected_rule_ids_json TEXT NOT NULL DEFAULT '[]',
      include_summary_rows INTEGER NOT NULL DEFAULT 0,
      include_inactive INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(company_id, import_type, name)
    );

    CREATE TABLE IF NOT EXISTS summary_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      rule_type TEXT NOT NULL DEFAULT 'summary',
      column_name TEXT NOT NULL,
      operator TEXT NOT NULL DEFAULT 'equals',
      match_value TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(company_id, name)
    );

    CREATE TABLE IF NOT EXISTS reporting_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(company_id, code)
    );

    CREATE TABLE IF NOT EXISTS cons_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      reporting_category_code TEXT NOT NULL DEFAULT '',
      statement_type TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(company_id, code)
    );

    CREATE TABLE IF NOT EXISTS event_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      user_id INTEGER,
      username TEXT NOT NULL DEFAULT '',
      severity TEXT NOT NULL CHECK(severity IN ('INFO','AUDIT','WARNING','ERROR')),
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS backup_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'Kézi',
      reason TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      file_path TEXT NOT NULL DEFAULT '',
      deleted_at TEXT,
      deleted_by TEXT NOT NULL DEFAULT '',
      delete_reason TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS license (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      license_key TEXT NOT NULL,
      company_name TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS validation_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      scope TEXT NOT NULL CHECK(scope IN ('GL_IMPORT','LEDGER_REPORT')),
      field_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      severity TEXT NOT NULL CHECK(severity IN ('ERROR','WARNING','INFO')),
      updated_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(company_id, scope, field_key)
    );
  `);

  ensureColumn('summary_rules', 'rule_type', "ALTER TABLE summary_rules ADD COLUMN rule_type TEXT NOT NULL DEFAULT 'summary'");
  ensureColumn('companies', 'base_currency', "ALTER TABLE companies ADD COLUMN base_currency TEXT NOT NULL DEFAULT 'HUF'");
  ensureColumn('companies', 'logo_file_name', "ALTER TABLE companies ADD COLUMN logo_file_name TEXT NOT NULL DEFAULT ''");
  ensureColumn('companies', 'logo_data', "ALTER TABLE companies ADD COLUMN logo_data TEXT NOT NULL DEFAULT ''");
  ensureColumn('users', 'last_login_at', "ALTER TABLE users ADD COLUMN last_login_at TEXT");
  ensureColumn('users', 'last_failed_login_at', "ALTER TABLE users ADD COLUMN last_failed_login_at TEXT");
  ensureColumn('users', 'password_changed_at', "ALTER TABLE users ADD COLUMN password_changed_at TEXT");
  ensureColumn('sessions', 'company_id', "ALTER TABLE sessions ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL");
  ensureColumn('sessions', 'last_seen_at', "ALTER TABLE sessions ADD COLUMN last_seen_at TEXT");
  ensureColumn('sessions', 'ip_address', "ALTER TABLE sessions ADD COLUMN ip_address TEXT NOT NULL DEFAULT ''");
  ensureColumn('sessions', 'user_agent', "ALTER TABLE sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT ''");
  ensureColumn('sessions', 'revoked_at', "ALTER TABLE sessions ADD COLUMN revoked_at TEXT");
  ensureColumn('sessions', 'revoked_by', "ALTER TABLE sessions ADD COLUMN revoked_by INTEGER REFERENCES users(id)");
  ensureColumn('sessions', 'revoke_reason', "ALTER TABLE sessions ADD COLUMN revoke_reason TEXT NOT NULL DEFAULT ''");
  ensureColumn('event_log', 'company_id', "ALTER TABLE event_log ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL");
  ensureColumn('import_sessions', 'status', "ALTER TABLE import_sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'");
  ensureColumn('import_sessions', 'overwrite_status', "ALTER TABLE import_sessions ADD COLUMN overwrite_status TEXT NOT NULL DEFAULT 'NORMAL'");
  ensureColumn('import_sessions', 'zero_row_count', "ALTER TABLE import_sessions ADD COLUMN zero_row_count INTEGER NOT NULL DEFAULT 0");
  ensureColumn('import_sessions', 'source_row_count', "ALTER TABLE import_sessions ADD COLUMN source_row_count INTEGER NOT NULL DEFAULT 0");
  ensureColumn('import_sessions', 'hard_error_count', "ALTER TABLE import_sessions ADD COLUMN hard_error_count INTEGER NOT NULL DEFAULT 0");
  ensureColumn('import_sessions', 'business_error_count', "ALTER TABLE import_sessions ADD COLUMN business_error_count INTEGER NOT NULL DEFAULT 0");
  ensureColumn('import_sessions', 'soft_error_count', "ALTER TABLE import_sessions ADD COLUMN soft_error_count INTEGER NOT NULL DEFAULT 0");
  ensureColumn('import_sessions', 'soft_ok_count', "ALTER TABLE import_sessions ADD COLUMN soft_ok_count INTEGER NOT NULL DEFAULT 0");
  ensureColumn('import_sessions', 'validation_json', "ALTER TABLE import_sessions ADD COLUMN validation_json TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('import_sessions', 'activated_by', "ALTER TABLE import_sessions ADD COLUMN activated_by INTEGER REFERENCES users(id)");
  ensureColumn('import_sessions', 'activated_at', "ALTER TABLE import_sessions ADD COLUMN activated_at TEXT");
  db.exec(`
    UPDATE event_log
    SET company_id = (
      SELECT c.id
      FROM companies c
      JOIN settings s ON s.key = 'active_company_id' AND c.id = CAST(s.value AS INTEGER)
    )
    WHERE company_id IS NULL
      AND module IN ('sample','validation','coa','gl','budget','companies','settings','admin','templates','summary_rules','master_data');

    CREATE INDEX IF NOT EXISTS idx_event_log_company_created ON event_log(company_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_backup_history_deleted ON backup_history(deleted_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_revoked ON sessions(revoked_at, expires_at);
    CREATE INDEX IF NOT EXISTS idx_import_sessions_company_date ON import_sessions(company_id, imported_at);
    CREATE INDEX IF NOT EXISTS idx_import_sessions_gl_scope ON import_sessions(company_id, year, month, scenario, import_type, status, overwrite_status);
    CREATE INDEX IF NOT EXISTS idx_gl_import_rows_session ON gl_import_rows(session_id, gl_number);
    CREATE INDEX IF NOT EXISTS idx_ui_labels_module ON ui_labels(module, menu);
    CREATE INDEX IF NOT EXISTS idx_user_company_permissions_user ON user_company_permissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_module_permissions_user ON user_module_permissions(user_id);
  `);

  const userCount = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
  if (userCount === 0) {
    db.prepare(`
      INSERT INTO users (username, display_name, email, role, password_hash, must_change_password, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('admin', 'Rendszer admin', 'admin@local', 'SA', hashPassword('Admin123!'), 1, nowIso(), nowIso());
  }

  const companyCount = db.prepare('SELECT COUNT(*) AS total FROM companies').get().total;
  if (companyCount === 0) {
    db.prepare(`
      INSERT INTO companies (code, name, fiscal_year_start, active, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `).run('DEMO', 'Demo Company', 1, nowIso(), nowIso());
  }

  const defaults = {
    active_year: String(new Date().getFullYear()),
    active_period: String(new Date().getMonth() + 1),
    active_currency: 'HUF',
    active_fx_mode: 'FX1',
    active_display_unit: '1',
    license_secret: randomId(32),
    smtp_host: '',
    smtp_port: '587',
    smtp_tls: '1',
    smtp_user: '',
    smtp_password: '',
    smtp_from: '',
    notification_recipients: '',
    notify_backup_error: '0',
    notify_user_lock: '0',
    notify_restore: '0',
    notify_critical_import: '0',
    notify_security_event: '0',
    backup_directory: BACKUP_DIR,
    backup_limit: '30',
    backup_before_destructive: '1',
    backup_schedule_enabled: '0',
    backup_schedule_type: 'daily',
    backup_schedule_start_date: new Date().toISOString().slice(0, 10),
    backup_schedule_time: '23:00',
    backup_schedule_daily_interval: '1',
    backup_schedule_weekly_interval: '1',
    backup_schedule_weekdays: '1,2,3,4,5',
    backup_schedule_months: '1,2,3,4,5,6,7,8,9,10,11,12',
    backup_schedule_month_days: 'last',
    backup_schedule_last_run_slot: '',
    backup_last_success_at: '',
    backup_last_file: '',
    backup_last_error: '',
    time_source: 'system',
    time_timezone: 'Europe/Budapest',
    time_dst_auto: '1',
    time_server_url: 'https://worldtimeapi.org/api/timezone/{timezone}',
    time_server_offset_ms: '0',
    time_last_sync_at: '',
    time_last_server_time: '',
    time_last_sync_error: '',
    session_idle_minutes: '60',
    session_absolute_hours: '24',
    login_max_failed_attempts: '5',
    login_lock_minutes: '15',
    login_auto_unlock: '1',
    password_min_length: '8',
    password_require_complexity: '0',
    number_thousand_separator: 'space',
    number_decimal_separator: 'comma',
    number_gl_decimals: '2',
    number_report_decimals: '0',
    number_fx_decimals: '4',
    number_negative_format: 'minus',
    ui_language: 'hu',
    ui_theme: 'light',
  };
  Object.entries(defaults).forEach(([key, value]) => {
    if (!db.prepare('SELECT key FROM settings WHERE key = ?').get(key)) setSetting(key, value);
  });
  const storedBackupDirectory = getSetting('backup_directory', BACKUP_DIR);
  if (String(storedBackupDirectory || '').includes('\uFFFD')) {
    setSetting('backup_directory', BACKUP_DIR);
  }

  migrateCompanyScopedMasterData();
  migrateReportStructures();
  migrateCompanyScopedImportSetup();
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_import_templates_company_type ON import_templates(company_id, import_type);
    CREATE INDEX IF NOT EXISTS idx_summary_rules_company_type ON summary_rules(company_id, rule_type);
    CREATE INDEX IF NOT EXISTS idx_validation_rules_company_scope ON validation_rules(company_id, scope);
  `);
  seedMasterData(activeCompanyId());
  seedSummaryRules(activeCompanyId());
  seedValidationRules(activeCompanyId());
  seedFxRates(Number(getSetting('active_year', new Date().getFullYear())));
}

module.exports = { initDb };
