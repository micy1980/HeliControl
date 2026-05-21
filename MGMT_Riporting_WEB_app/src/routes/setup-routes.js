const { db } = require('../db');
const { ok, parseBody, required, asNumber } = require('../http-utils');
const { getSetting, setSetting, activeCompanyId } = require('../services/settings-service');
const { logEvent, logAuditChanges } = require('../services/log-service');
const { parseJsonField, isTruthy, getImportTableFromBody } = require('../services/import-service');
const { listImportTemplates, listSummaryRules } = require('../services/import-setup-service');
const { requirePermission } = require('../services/permission-service');
const {
  reportStructurePayload,
  normalizeReportStructure,
  normalizePrefixedCode,
  upsertReportGroup,
  deleteReportGroups,
  upsertReportCode,
  deleteReportCodes,
  importReportStructure,
} = require('../services/report-structure-service');
const { listValidationRules, saveValidationRules } = require('../services/validation-rule-service');

function nowIso() {
  return new Date().toISOString();
}

function importPermissionModule(importType = 'coa') {
  return String(importType || '').toLowerCase() === 'gl' ? 'gl' : 'coa';
}

const DEFAULT_UI_LABELS = [
  ['Közös', 'Műveletek', 'common.save', 'Mentés', 'Save'],
  ['Közös', 'Műveletek', 'common.create', 'Létrehozás', 'Create'],
  ['Közös', 'Műveletek', 'common.delete', 'Törlés', 'Delete'],
  ['Közös', 'Műveletek', 'common.refresh', 'Frissítés', 'Refresh'],
  ['Közös', 'Műveletek', 'common.import', 'Import', 'Import'],
  ['Közös', 'Műveletek', 'common.export', 'Export', 'Export'],
  ['Közös', 'Műveletek', 'common.open', 'Megnyitás', 'Open'],
  ['Közös', 'Műveletek', 'common.close', 'Bezárás', 'Close'],
  ['Közös', 'Műveletek', 'common.cancel', 'Mégse', 'Cancel'],
  ['Közös', 'Műveletek', 'common.search', 'Keresés', 'Search'],
  ['Közös', 'Állapot', 'common.active', 'Aktív', 'Active'],
  ['Közös', 'Állapot', 'common.inactive', 'Inaktív', 'Inactive'],
  ['Közös', 'Állapot', 'common.locked', 'Zárolt', 'Locked'],
  ['Közös', 'Állapot', 'common.ok', 'OK', 'OK'],
  ['Közös', 'Állapot', 'common.error', 'Hiba', 'Error'],
  ['Közös', 'Állapot', 'common.warning', 'Figyelmeztetés', 'Warning'],
  ['Közös', 'Állapot', 'common.info', 'Információ', 'Information'],
  ['Belépés', 'Bejelentkezés', 'login.title', 'MGM Reporting', 'MGM Reporting'],
  ['Belépés', 'Bejelentkezés', 'login.subtitle', 'Helyi hálózaton futó konszolidációs és riportáló rendszer.', 'Consolidation and reporting system running on a local network.'],
  ['Belépés', 'Bejelentkezés', 'login.username', 'Felhasználónév', 'Username'],
  ['Belépés', 'Bejelentkezés', 'login.password', 'Jelszó', 'Password'],
  ['Belépés', 'Bejelentkezés', 'login.submit', 'Belépés', 'Log in'],
  ['Belépés', 'Bejelentkezés', 'login.defaultAccess', 'Első indításkor az alap belépés', 'Default access on first start'],
  ['Kezdőlap', 'Áttekintés', 'dashboard.title', 'Áttekintés', 'Overview'],
  ['Kezdőlap', 'Környezet', 'dashboard.environment', 'Környezet', 'Environment'],
  ['Kezdőlap', 'Környezet', 'dashboard.company', 'Cég', 'Company'],
  ['Kezdőlap', 'Környezet', 'dashboard.currency', 'Deviza', 'Currency'],
  ['Kezdőlap', 'Környezet', 'dashboard.fx', 'FX', 'FX'],
  ['Kezdőlap', 'Környezet', 'dashboard.unit', 'Egység', 'Unit'],
  ['Navigáció', 'Főkönyv', 'nav.ledger', 'Főkönyv', 'Ledger'],
  ['Navigáció', 'Tervezés', 'nav.planning', 'Tervezés', 'Planning'],
  ['Navigáció', 'Adminisztráció', 'nav.admin', 'Adminisztráció', 'Administration'],
  ['Navigáció', 'Saját fiók', 'nav.account', 'Saját fiók', 'My account'],
  ['Ribbon', 'Kezdőlap', 'ribbon.home', 'Kezdőlap', 'Home'],
  ['Ribbon', 'Kezdőlap', 'ribbon.report', 'Riport', 'Report'],
  ['Ribbon', 'Kezdőlap', 'ribbon.glImport', 'GL import', 'GL import'],
  ['Ribbon', 'Kezdőlap', 'ribbon.trialBalance', 'Főkönyvi kivonat', 'Trial balance'],
  ['Ribbon', 'Kezdőlap', 'ribbon.excelExport', 'Excel export', 'Excel export'],
  ['Ribbon', 'Kezdőlap', 'ribbon.fileChoose', 'Fájl választás', 'Choose file'],
  ['Ribbon', 'Kezdőlap', 'ribbon.validation', 'Validáció', 'Validation'],
  ['Ribbon', 'Kezdőlap', 'ribbon.imports', 'Importok', 'Imports'],
  ['Ribbon', 'Kezdőlap', 'ribbon.masterData', 'Törzsadatok', 'Master data'],
  ['Ribbon', 'Kezdőlap', 'ribbon.dataMaintenance', 'Adatkarbantartás', 'Data maintenance'],
  ['Főkönyv', 'Számlatükör', 'coa.title', 'Számlatükör', 'Chart of accounts'],
  ['Főkönyv', 'Számlatükör', 'coa.accountNumber', 'GL szám', 'GL account'],
  ['Főkönyv', 'Számlatükör', 'coa.accountName', 'GL megnevezés', 'GL name'],
  ['Főkönyv', 'Számlatükör', 'coa.reportCode', 'Riport kód', 'Report code'],
  ['Főkönyv', 'Számlatükör', 'coa.bspl', 'BS/PL', 'BS/PL'],
  ['Főkönyv', 'Számlatükör', 'coa.consAccount', 'Konsz. kontó', 'Consolidation account'],
  ['Főkönyv', 'Számlatükör', 'coa.description', 'Leírás', 'Description'],
  ['Főkönyv', 'GL import', 'glImport.title', 'GL import', 'GL import'],
  ['Főkönyv', 'GL import', 'glImport.upload', 'Fájl feltöltése', 'Upload file'],
  ['Főkönyv', 'GL import', 'glImport.mapping', 'Oszlop-hozzárendelés', 'Column mapping'],
  ['Főkönyv', 'GL import', 'glImport.preview', 'Előnézet', 'Preview'],
  ['Főkönyv', 'GL import', 'glImport.run', 'Import indítása', 'Run import'],
  ['Főkönyv', 'Főkönyvi kivonat', 'trialBalance.title', 'Főkönyvi kivonat', 'Trial balance'],
  ['Főkönyv', 'Főkönyvi kivonat', 'trialBalance.period', 'Időszak', 'Period'],
  ['Főkönyv', 'Főkönyvi kivonat', 'trialBalance.opening', 'Nyitó', 'Opening'],
  ['Főkönyv', 'Főkönyvi kivonat', 'trialBalance.debit', 'Tartozik', 'Debit'],
  ['Főkönyv', 'Főkönyvi kivonat', 'trialBalance.credit', 'Követel', 'Credit'],
  ['Főkönyv', 'Főkönyvi kivonat', 'trialBalance.closing', 'Záró', 'Closing'],
  ['Főkönyv', 'Árfolyamok', 'fx.title', 'Árfolyamok', 'Exchange rates'],
  ['Főkönyv', 'Árfolyamok', 'fx.currency', 'Deviza', 'Currency'],
  ['Főkönyv', 'Árfolyamok', 'fx.rate', 'Árfolyam', 'Exchange rate'],
  ['Főkönyv', 'Árfolyamok', 'fx.validFrom', 'Érvényesség kezdete', 'Valid from'],
  ['Tervezés', 'Budget / Forecast', 'budget.title', 'Budget / Forecast', 'Budget / Forecast'],
  ['Tervezés', 'Budget / Forecast', 'budget.scenario', 'Scenario', 'Scenario'],
  ['Tervezés', 'Budget / Forecast', 'budget.amount', 'Összeg', 'Amount'],
  ['Tervezés', 'Budget / Forecast', 'budget.month', 'Hó', 'Month'],
  ['Tervezés', 'Riport', 'report.title', 'Riport', 'Report'],
  ['Tervezés', 'Riport', 'report.structure', 'Riport struktúra', 'Report structure'],
  ['Tervezés', 'Riport', 'report.group', 'Csoport', 'Group'],
  ['Tervezés', 'Riport', 'report.code', 'Riport kód', 'Report code'],
  ['Tervezés', 'Riport', 'report.amount', 'Összeg', 'Amount'],
  ['Adminisztráció', 'Cégek', 'companies.title', 'Cégek', 'Companies'],
  ['Adminisztráció', 'Cégek', 'companies.new', 'Új vállalat', 'New company'],
  ['Adminisztráció', 'Cégek', 'companies.code', 'Kód', 'Code'],
  ['Adminisztráció', 'Cégek', 'companies.name', 'Név', 'Name'],
  ['Adminisztráció', 'Cégek', 'companies.fiscalYearStart', 'Pénzügyi év kezdőhónap', 'Fiscal year start month'],
  ['Adminisztráció', 'Cégek', 'companies.baseCurrency', 'Alapdeviza', 'Base currency'],
  ['Adminisztráció', 'Cégek', 'companies.logo', 'Logo', 'Logo'],
  ['Adminisztráció', 'Cégek', 'companies.delete', 'Cég törlése', 'Delete company'],
  ['Adminisztráció', 'Felhasználók', 'users.title', 'Felhasználók', 'Users'],
  ['Adminisztráció', 'Felhasználók', 'users.new', 'Új felhasználó', 'New user'],
  ['Adminisztráció', 'Felhasználók', 'users.username', 'Felhasználónév', 'Username'],
  ['Adminisztráció', 'Felhasználók', 'users.displayName', 'Név', 'Name'],
  ['Adminisztráció', 'Felhasználók', 'users.email', 'Email', 'Email'],
  ['Adminisztráció', 'Felhasználók', 'users.role', 'Szerepkör', 'Role'],
  ['Adminisztráció', 'Felhasználók', 'users.tempPassword', 'Ideiglenes jelszó', 'Temporary password'],
  ['Adminisztráció', 'Felhasználók', 'users.passwordReset', 'Jelszó reset', 'Password reset'],
  ['Adminisztráció', 'Felhasználók', 'users.unlock', 'Feloldás', 'Unlock'],
  ['Adminisztráció', 'Felhasználók', 'users.revokeSessions', 'Session zárás', 'Revoke sessions'],
  ['Adminisztráció', 'Felhasználók', 'users.mustChangePassword', 'Jelszócsere', 'Password change'],
  ['Adminisztráció', 'Felhasználók', 'users.failedLogin', 'Hibás login', 'Failed login'],
  ['Adminisztráció', 'Felhasználók', 'users.lastLogin', 'Utolsó login', 'Last login'],
  ['Adminisztráció', 'Munkamenetek', 'sessions.title', 'Munkamenetek', 'Sessions'],
  ['Adminisztráció', 'Munkamenetek', 'sessions.createdAt', 'Belépés', 'Login'],
  ['Adminisztráció', 'Munkamenetek', 'sessions.lastSeenAt', 'Utolsó aktivitás', 'Last activity'],
  ['Adminisztráció', 'Munkamenetek', 'sessions.expiresAt', 'Lejárat', 'Expires'],
  ['Adminisztráció', 'Munkamenetek', 'sessions.ipAddress', 'IP', 'IP'],
  ['Adminisztráció', 'Munkamenetek', 'sessions.browser', 'Böngésző', 'Browser'],
  ['Adminisztráció', 'Naplók', 'logs.title', 'Naplók', 'Logs'],
  ['Adminisztráció', 'Naplók', 'logs.subtitle', 'Események és audit műveletek.', 'Events and audit actions.'],
  ['Adminisztráció', 'Naplók', 'logs.activeCompany', 'Aktív cég naplói', 'Active company logs'],
  ['Adminisztráció', 'Naplók', 'logs.allCompanies', 'Összes cég összes napló', 'All logs of all companies'],
  ['Adminisztráció', 'Naplók', 'logs.deleteVisible', 'Látható naplók törlése', 'Delete visible logs'],
  ['Adminisztráció', 'Naplók', 'logs.time', 'Idő', 'Time'],
  ['Adminisztráció', 'Naplók', 'logs.type', 'Típus', 'Type'],
  ['Adminisztráció', 'Naplók', 'logs.company', 'Cég', 'Company'],
  ['Adminisztráció', 'Naplók', 'logs.severity', 'Szint', 'Severity'],
  ['Adminisztráció', 'Naplók', 'logs.user', 'User', 'User'],
  ['Adminisztráció', 'Naplók', 'logs.module', 'Modul', 'Module'],
  ['Adminisztráció', 'Naplók', 'logs.action', 'Művelet', 'Action'],
  ['Adminisztráció', 'Naplók', 'logs.details', 'Részlet', 'Details'],
  ['Adminisztráció', 'Beállítások', 'settings.title', 'Beállítások', 'Settings'],
  ['Adminisztráció', 'Beállítások', 'settings.system', 'Rendszer', 'System'],
  ['Adminisztráció', 'Beállítások', 'settings.email', 'Email beállításai', 'Email settings'],
  ['Adminisztráció', 'Beállítások', 'settings.smtpConnection', 'SMTP kapcsolat', 'SMTP connection'],
  ['Adminisztráció', 'Beállítások', 'settings.smtpHost', 'SMTP host', 'SMTP host'],
  ['Adminisztráció', 'Beállítások', 'settings.smtpPort', 'SMTP port', 'SMTP port'],
  ['Adminisztráció', 'Beállítások', 'settings.smtpTls', 'SMTP TLS', 'SMTP TLS'],
  ['Adminisztráció', 'Beállítások', 'settings.smtpUser', 'SMTP user', 'SMTP user'],
  ['Adminisztráció', 'Beállítások', 'settings.smtpPassword', 'SMTP jelszó', 'SMTP password'],
  ['Adminisztráció', 'Beállítások', 'settings.smtpFrom', 'SMTP feladó', 'SMTP sender'],
  ['Adminisztráció', 'Beállítások', 'settings.smtpTest', 'Teszt email', 'Test email'],
  ['Adminisztráció', 'Beállítások', 'settings.smtpTestTo', 'Teszt címzett', 'Test recipient'],
  ['Adminisztráció', 'Beállítások', 'settings.smtpSendTest', 'Teszt email küldése', 'Send test email'],
  ['Adminisztráció', 'Beállítások', 'settings.emailNotifications', 'Email értesítések', 'Email notifications'],
  ['Adminisztráció', 'Beállítások', 'settings.notificationRecipients', 'Értesítési címzettek', 'Notification recipients'],
  ['Adminisztráció', 'Beállítások', 'settings.notifyBackupError', 'Backup hiba', 'Backup error'],
  ['Adminisztráció', 'Beállítások', 'settings.notifyUserLock', 'Lockolt user', 'Locked user'],
  ['Adminisztráció', 'Beállítások', 'settings.notifyRestore', 'Restore', 'Restore'],
  ['Adminisztráció', 'Beállítások', 'settings.notifyCriticalImport', 'Kritikus import hiba', 'Critical import error'],
  ['Adminisztráció', 'Beállítások', 'settings.notifySecurityEvent', 'Biztonsági esemény', 'Security event'],
  ['Adminisztráció', 'Beállítások', 'settings.notificationTest', 'Teszt értesítés küldése', 'Send test notification'],
  ['Adminisztráció', 'Beállítások', 'settings.masters', 'Törzsadatok', 'Master data'],
  ['Adminisztráció', 'Beállítások', 'settings.labels', 'Címkék és nyelv', 'Labels and language'],
  ['Adminisztráció', 'Beállítások', 'settings.branding', 'Arculat', 'Branding'],
  ['Adminisztráció', 'Beállítások', 'settings.security', 'Biztonság és munkamenet', 'Security and session'],
  ['Adminisztráció', 'Beállítások', 'settings.programTime', 'Programidő', 'Program time'],
  ['Adminisztráció', 'Beállítások', 'settings.numberFormat', 'Számformátum', 'Number format'],
  ['Adminisztráció', 'Beállítások', 'settings.idleTimeout', 'Inaktív timeout perc', 'Idle timeout minutes'],
  ['Adminisztráció', 'Beállítások', 'settings.absoluteSession', 'Abszolút session óra', 'Absolute session hours'],
  ['Adminisztráció', 'Beállítások', 'settings.failedLoginLimit', 'Hibás login limit', 'Failed login limit'],
  ['Adminisztráció', 'Beállítások', 'settings.lockMinutes', 'Zárolás perc', 'Lock minutes'],
  ['Adminisztráció', 'Beállítások', 'settings.autoUnlock', 'Auto feloldás', 'Auto unlock'],
  ['Adminisztráció', 'Beállítások', 'settings.passwordMinLength', 'Jelszó min. hossz', 'Password min. length'],
  ['Adminisztráció', 'Beállítások', 'settings.passwordComplexity', 'Jelszó komplexitás', 'Password complexity'],
  ['Adminisztráció', 'Beállítások', 'settings.timeSource', 'Időforrás', 'Time source'],
  ['Adminisztráció', 'Beállítások', 'settings.timezone', 'Időzóna', 'Time zone'],
  ['Adminisztráció', 'Beállítások', 'settings.dst', 'Nyári időszámítás', 'Daylight saving time'],
  ['Adminisztráció', 'Beállítások', 'settings.timeServerUrl', 'Timeserver cím', 'Time server URL'],
  ['Adminisztráció', 'Beállítások', 'settings.syncTimeServer', 'Idő szinkronizálása', 'Synchronize time'],
  ['Adminisztráció', 'Beállítások', 'settings.thousandSeparator', 'Ezres elválasztó', 'Thousand separator'],
  ['Adminisztráció', 'Beállítások', 'settings.decimalSeparator', 'Tizedesjel', 'Decimal separator'],
  ['Adminisztráció', 'Beállítások', 'settings.negativeNumber', 'Negatív szám', 'Negative number'],
  ['Adminisztráció', 'Beállítások', 'settings.language', 'Nyelv', 'Language'],
  ['Adminisztráció', 'Beállítások', 'settings.theme', 'Megjelenítés', 'Appearance'],
  ['Adminisztráció', 'Beállítások', 'settings.lightTheme', 'Nappali mód', 'Light mode'],
  ['Adminisztráció', 'Beállítások', 'settings.darkTheme', 'Éjszakai mód', 'Dark mode'],
  ['Adminisztráció', 'Beállítások', 'settings.labelExport', 'Címkék export', 'Labels export'],
  ['Adminisztráció', 'Beállítások', 'settings.labelImport', 'Címkék import', 'Labels import'],
  ['Adminisztráció', 'Beállítások', 'settings.labelModule', 'Modul', 'Module'],
  ['Adminisztráció', 'Beállítások', 'settings.labelMenu', 'Menü', 'Menu'],
  ['Adminisztráció', 'Beállítások', 'settings.labelKey', 'Kulcs', 'Key'],
  ['Adminisztráció', 'Beállítások', 'settings.labelHu', 'Magyar címke', 'Hungarian label'],
  ['Adminisztráció', 'Beállítások', 'settings.labelEn', 'Angol címke', 'English label'],
  ['Adminisztráció', 'Validációs szabályok', 'validationRules.title', 'Validációs szabályok', 'Validation rules'],
  ['Adminisztráció', 'Validációs szabályok', 'validationRules.glImport', 'GL import', 'GL import'],
  ['Adminisztráció', 'Validációs szabályok', 'validationRules.trialBalance', 'Főkönyvi kivonat / riport', 'Trial balance / report'],
  ['Adminisztráció', 'Validációs szabályok', 'validationRules.field', 'Mező', 'Field'],
  ['Adminisztráció', 'Validációs szabályok', 'validationRules.level', 'Szint', 'Level'],
  ['Adminisztráció', 'Validációs szabályok', 'validationRules.managementReportCode', 'Management riport kód', 'Management report code'],
  ['Adminisztráció', 'Validációs szabályok', 'validationRules.consReportCode', 'Konszi riport kód', 'Consolidation report code'],
  ['Adminisztráció', 'Validációs szabályok', 'validationRules.bsplManagement', 'Management BS/PL', 'Management BS/PL'],
  ['Adminisztráció', 'Validációs szabályok', 'validationRules.bsplCons', 'Konszi BS/PL', 'Consolidation BS/PL'],
  ['Adminisztráció', 'Backup', 'backup.title', 'Backup', 'Backup'],
  ['Adminisztráció', 'Backup', 'backup.manual', 'Kézi mentés', 'Manual backup'],
  ['Adminisztráció', 'Backup', 'backup.automatic', 'Automatikus mentés', 'Automatic backup'],
  ['Adminisztráció', 'Backup', 'backup.path', 'Mentési útvonal', 'Backup path'],
  ['Adminisztráció', 'Backup', 'backup.chooseFolder', 'Mappa választása', 'Choose folder'],
  ['Adminisztráció', 'Backup', 'backup.restore', 'Visszaállítás', 'Restore'],
  ['Adminisztráció', 'Backup', 'backup.delete', 'Backup törlése', 'Delete backup'],
  ['Adminisztráció', 'Adatkarbantartás', 'dataAdmin.title', 'Adatkarbantartás', 'Data maintenance'],
  ['Adminisztráció', 'Adatkarbantartás', 'dataAdmin.clearData', 'Kijelölt adatok törlése', 'Delete selected data'],
  ['Adminisztráció', 'Adatkarbantartás', 'dataAdmin.importSessions', 'Import sessionök', 'Import sessions'],
  ['Adminisztráció', 'Adatkarbantartás', 'dataAdmin.logs', 'Naplók', 'Logs'],
  ['Adminisztráció', 'Adatkarbantartás', 'dataAdmin.masterData', 'Törzsadatok', 'Master data'],
  ['Adminisztráció', 'Licensz', 'license.title', 'Licensz', 'License'],
  ['Adminisztráció', 'Licensz', 'license.current', 'Aktuális licensz', 'Current license'],
  ['Adminisztráció', 'Licensz', 'license.activate', 'Aktiválás', 'Activation'],
  ['Adminisztráció', 'Licensz', 'license.generate', 'Licensz generálás', 'License generation'],
  ['Adminisztráció', 'Licensz', 'license.key', 'Licenszkulcs', 'License key'],
  ['Adminisztráció', 'Licensz', 'license.status', 'Státusz', 'Status'],
  ['Adminisztráció', 'Licensz', 'license.expiresAt', 'Lejárat', 'Expires at'],
  ['Saját fiók', 'Profil', 'profile.title', 'Profil', 'Profile'],
  ['Saját fiók', 'Profil', 'profile.passwordChange', 'Jelszócsere', 'Password change'],
  ['Saját fiók', 'Profil', 'profile.currentPassword', 'Jelenlegi jelszó', 'Current password'],
  ['Saját fiók', 'Profil', 'profile.newPassword', 'Új jelszó', 'New password'],
  ['Saját fiók', 'Kilépés', 'logout.title', 'Kilépés', 'Logout'],
];

function seedUiLabels(updatedBy = 'system') {
  const now = nowIso();
  const stmt = db.prepare(`
    INSERT INTO ui_labels (module, menu, label_key, hu, en, active, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(label_key) DO NOTHING
  `);
  DEFAULT_UI_LABELS.forEach(([module, menu, labelKey, hu, en]) => {
    stmt.run(module, menu, labelKey, hu, en, now, updatedBy);
  });
}

function listUiLabels() {
  seedUiLabels();
  return db.prepare(`
    SELECT id, module, menu, label_key AS labelKey, hu, en, active, updated_at AS updatedAt, updated_by AS updatedBy
    FROM ui_labels
    ORDER BY module COLLATE NOCASE, menu COLLATE NOCASE, label_key COLLATE NOCASE
  `).all();
}

function saveUiLabels(labels, username) {
  seedUiLabels(username);
  const rows = (Array.isArray(labels) ? labels : [])
    .map((row) => ({
      module: String(row.module || '').trim(),
      menu: String(row.menu || '').trim(),
      labelKey: String(row.labelKey || row.label_key || '').trim(),
      hu: String(row.hu || '').trim(),
      en: String(row.en || '').trim(),
      active: row.active === 0 || row.active === false || row.active === '0' ? 0 : 1,
    }))
    .filter((row) => row.labelKey && (row.module || row.menu || row.hu || row.en));
  const now = nowIso();
  const stmt = db.prepare(`
    INSERT INTO ui_labels (module, menu, label_key, hu, en, active, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(label_key) DO UPDATE SET
      module = excluded.module,
      menu = excluded.menu,
      hu = excluded.hu,
      en = excluded.en,
      active = excluded.active,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `);
  db.exec('BEGIN');
  try {
    rows.forEach((row) => stmt.run(row.module, row.menu, row.labelKey, row.hu, row.en, row.active, now, username || ''));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return listUiLabels();
}

function stringValue(value) {
  return String(value ?? '').trim();
}

function importValue(row, names) {
  const entries = Object.entries(row || {});
  const normalizedNames = names.map((name) => String(name).trim().toLowerCase());
  for (const [key, value] of entries) {
    if (normalizedNames.includes(String(key).trim().toLowerCase())) return value;
  }
  return '';
}

function importedUiLabelsFromRows(rows) {
  return (rows || []).map((row) => ({
    module: stringValue(importValue(row, ['Modul', 'Module', 'module'])),
    menu: stringValue(importValue(row, ['Menü', 'Menu', 'menu'])),
    labelKey: stringValue(importValue(row, ['Kulcs', 'Key', 'Label key', 'labelKey', 'label_key'])),
    hu: stringValue(importValue(row, ['Magyar', 'Hungarian', 'hu'])),
    en: stringValue(importValue(row, ['Angol', 'English', 'English label', 'en'])),
    active: ['0', 'nem', 'false', 'no'].includes(String(importValue(row, ['Aktív', 'Active', 'active']) || '1').trim().toLowerCase()) ? 0 : 1,
  })).filter((row) => row.labelKey);
}

const UI_SETTING_AUDIT_FIELDS = [
  { key: 'uiLanguage', label: 'Nyelv' },
  { key: 'uiTheme', label: 'Megjelenítés' },
];

const UI_LABEL_AUDIT_FIELDS = [
  { key: 'module', label: 'Modul' },
  { key: 'menu', label: 'Menü' },
  { key: 'hu', label: 'Magyar címke' },
  { key: 'en', label: 'Angol címke' },
  { key: 'active', label: 'Aktív', boolean: true },
];

const VALIDATION_RULE_AUDIT_FIELDS = [
  { key: 'enabled', label: 'Aktív', boolean: true },
  { key: 'severity', label: 'Szint' },
];

const REPORT_GROUP_AUDIT_FIELDS = [
  { key: 'name', label: 'Megnevezés' },
  { key: 'active', label: 'Aktív', boolean: true },
];

const REPORT_CODE_AUDIT_FIELDS = [
  { key: 'name', label: 'Riport kód elnevezés' },
  { key: 'statement_type', label: 'BS/PL' },
  { key: 'group1_code', label: 'Csoport1' },
  { key: 'group1_required', label: 'Csoport1 kötelező', boolean: true },
  { key: 'group2_code', label: 'Csoport2' },
  { key: 'group2_required', label: 'Csoport2 kötelező', boolean: true },
  { key: 'group3_code', label: 'Csoport3' },
  { key: 'group3_required', label: 'Csoport3 kötelező', boolean: true },
  { key: 'active', label: 'Aktív', boolean: true },
];

const SUMMARY_RULE_AUDIT_FIELDS = [
  { key: 'name', label: 'Név' },
  { key: 'rule_type', label: 'Szabály típusa' },
  { key: 'column_name', label: 'Oszlop' },
  { key: 'operator', label: 'Operátor' },
  { key: 'match_value', label: 'Érték' },
  { key: 'active', label: 'Aktív', boolean: true },
];

function uiLabelMap(rows = []) {
  return new Map((rows || []).map((row) => [row.labelKey, row]));
}

function logUiLabelAudits({ companyId, user, beforeRows, afterRows, labelKeys, action }) {
  const beforeMap = uiLabelMap(beforeRows);
  const afterMap = uiLabelMap(afterRows);
  [...new Set((labelKeys || []).filter(Boolean))].forEach((labelKey) => {
    logAuditChanges({
      companyId,
      user,
      module: 'settings',
      table: 'ui_labels',
      entityKey: labelKey,
      action,
      before: beforeMap.get(labelKey) || {},
      after: afterMap.get(labelKey) || {},
      fields: UI_LABEL_AUDIT_FIELDS,
    });
  });
}

function validationRuleAuditMap(payload = {}) {
  const map = new Map();
  Object.entries(payload.scopes || {}).forEach(([scope, scopeData]) => {
    (scopeData.fields || []).forEach((field) => {
      map.set(`${scope}:${field.key}`, {
        scope,
        fieldKey: field.key,
        enabled: field.enabled ? 1 : 0,
        severity: field.severity,
      });
    });
  });
  return map;
}

function summaryRuleAuditRow(companyId, value, by = 'id') {
  const column = by === 'name' ? 'name' : 'id';
  return db.prepare(`
    SELECT id, name, rule_type, column_name, operator, match_value, active
    FROM summary_rules
    WHERE company_id = ? AND ${column} = ?
  `).get(companyId, value) || null;
}

function reportGroupAuditRow(companyId, structureType, groupLevel, code) {
  return db.prepare(`
    SELECT id, structure_type, group_level, code, name, active
    FROM report_groups
    WHERE company_id = ? AND structure_type = ? AND group_level = ? AND code = ?
  `).get(companyId, structureType, groupLevel, code) || null;
}

function reportCodeAuditRow(companyId, structureType, code) {
  return db.prepare(`
    SELECT id, structure_type, code, name, statement_type, group1_code, group1_required,
           group2_code, group2_required, group3_code, group3_required, active
    FROM report_codes
    WHERE company_id = ? AND structure_type = ? AND code = ?
  `).get(companyId, structureType, code) || null;
}

async function handleSetupRoutes({
  req,
  res,
  url,
  method,
  route,
}) {
  if (route === '/api/import/templates' && method === 'GET') {
    const importType = String(url.searchParams.get('importType') || 'coa').toLowerCase();
    const companyId = activeCompanyId();
    requirePermission(req, importPermissionModule(importType), 'import', { companyId, companyMode: 'manage' });
    ok(res, { templates: listImportTemplates(importType, companyId) });
    return true;
  }

  if (route === '/api/import/templates' && method === 'POST') {
    const body = await parseBody(req);
    const importType = String(body.importType || 'coa').toLowerCase();
    const companyId = activeCompanyId();
    const user = requirePermission(req, importPermissionModule(importType), 'import', { companyId, companyMode: 'manage' });
    const name = String(required(body.name, 'name')).trim();
    const mapping = parseJsonField(body.mapping || body.columnMapping, {});
    const selectedRuleIds = parseJsonField(body.selectedRuleIds, []);
    db.prepare(`
      INSERT INTO import_templates
        (company_id, import_type, name, mapping_json, selected_rule_ids_json, include_summary_rows, include_inactive, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, import_type, name) DO UPDATE SET
        mapping_json = excluded.mapping_json,
        selected_rule_ids_json = excluded.selected_rule_ids_json,
        include_summary_rows = excluded.include_summary_rows,
        include_inactive = excluded.include_inactive,
        updated_at = excluded.updated_at
    `).run(
      companyId,
      importType,
      name,
      JSON.stringify(mapping),
      JSON.stringify(selectedRuleIds),
      isTruthy(body.includeSummaryRows) ? 1 : 0,
      isTruthy(body.includeInactive) ? 1 : 0,
      user.id,
      nowIso(),
      nowIso()
    );
    logEvent({ companyId, userId: user.id, username: user.username, severity: 'AUDIT', module: 'templates', action: 'save', details: `${importType}: ${name}` });
    ok(res, { templates: listImportTemplates(importType, companyId) });
    return true;
  }

  if (route.startsWith('/api/import/templates/') && method === 'DELETE') {
    const id = asNumber(route.split('/').pop(), 'id');
    const companyId = activeCompanyId();
    const template = db.prepare('SELECT import_type AS importType FROM import_templates WHERE id = ? AND company_id = ?').get(id, companyId);
    const user = requirePermission(req, importPermissionModule(template?.importType || 'coa'), 'import', { companyId, companyMode: 'manage' });
    db.prepare('DELETE FROM import_templates WHERE id = ? AND company_id = ?').run(id, companyId);
    logEvent({ companyId, userId: user.id, username: user.username, severity: 'AUDIT', module: 'templates', action: 'delete', details: String(id) });
    ok(res, {});
    return true;
  }

  if (route === '/api/summary-rules' && method === 'GET') {
    const companyId = activeCompanyId();
    requirePermission(req, 'coa', 'edit', { companyId, companyMode: 'manage' });
    ok(res, { rules: listSummaryRules(false, companyId) });
    return true;
  }

  if (route === '/api/summary-rules' && method === 'POST') {
    const body = await parseBody(req);
    const name = String(required(body.name, 'name')).trim();
    const companyId = activeCompanyId();
    const user = requirePermission(req, 'coa', 'edit', { companyId, companyMode: 'manage' });
    const before = summaryRuleAuditRow(companyId, name, 'name');
    db.prepare(`
      INSERT INTO summary_rules (company_id, name, rule_type, column_name, operator, match_value, active, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, name) DO UPDATE SET
        rule_type = excluded.rule_type,
        column_name = excluded.column_name,
        operator = excluded.operator,
        match_value = excluded.match_value,
        active = excluded.active,
        updated_at = excluded.updated_at
    `).run(
      companyId,
      name,
      String(body.ruleType || body.rule_type || 'summary').trim(),
      String(required(body.column || body.columnName, 'column')).trim(),
      String(body.operator || 'equals').trim(),
      String(required(body.value ?? body.matchValue, 'value')).trim(),
      body.active === false || body.enabled === false || body.active === 'false' ? 0 : 1,
      user.id,
      nowIso(),
      nowIso()
    );
    const after = summaryRuleAuditRow(companyId, name, 'name');
    logAuditChanges({
      companyId,
      user,
      module: 'summary_rules',
      table: 'summary_rules',
      entityKey: name,
      action: before ? 'summary_rule_update' : 'summary_rule_create',
      before,
      after,
      fields: SUMMARY_RULE_AUDIT_FIELDS,
    });
    ok(res, { rules: listSummaryRules(false, companyId) });
    return true;
  }

  if (route.startsWith('/api/summary-rules/') && method === 'DELETE') {
    const id = asNumber(route.split('/').pop(), 'id');
    const companyId = activeCompanyId();
    const user = requirePermission(req, 'coa', 'delete', { companyId, companyMode: 'manage' });
    const before = summaryRuleAuditRow(companyId, id);
    db.prepare('DELETE FROM summary_rules WHERE id = ? AND company_id = ?').run(id, companyId);
    logAuditChanges({
      companyId,
      user,
      module: 'summary_rules',
      table: 'summary_rules',
      entityKey: before?.name || String(id),
      action: 'summary_rule_delete',
      before,
      after: {},
      fields: SUMMARY_RULE_AUDIT_FIELDS,
    });
    ok(res, { rules: listSummaryRules(false, companyId) });
    return true;
  }

  if (route === '/api/ui-labels' && method === 'GET') {
    requirePermission(req, 'settings', 'view');
    ok(res, {
      labels: listUiLabels(),
      settings: {
        uiLanguage: getSetting('ui_language', 'hu'),
        uiTheme: getSetting('ui_theme', 'light'),
      },
    });
    return true;
  }

  if (route === '/api/ui-labels' && method === 'POST') {
    const user = requirePermission(req, 'settings', 'edit');
    const body = await parseBody(req);
    const companyId = activeCompanyId();
    const beforeSettings = {
      uiLanguage: getSetting('ui_language', 'hu'),
      uiTheme: getSetting('ui_theme', 'light'),
    };
    const beforeLabels = listUiLabels();
    if (body.settings) {
      if (body.settings.uiLanguage !== undefined) setSetting('ui_language', body.settings.uiLanguage === 'en' ? 'en' : 'hu');
      if (body.settings.uiTheme !== undefined) setSetting('ui_theme', body.settings.uiTheme === 'dark' ? 'dark' : 'light');
    }
    const labels = saveUiLabels(body.labels || [], user.username);
    const afterSettings = {
      uiLanguage: getSetting('ui_language', 'hu'),
      uiTheme: getSetting('ui_theme', 'light'),
    };
    logAuditChanges({
      companyId,
      user,
      module: 'settings',
      table: 'settings',
      entityKey: 'ui',
      action: 'ui_settings_update',
      before: beforeSettings,
      after: afterSettings,
      fields: UI_SETTING_AUDIT_FIELDS,
    });
    logUiLabelAudits({
      companyId,
      user,
      beforeRows: beforeLabels,
      afterRows: labels,
      labelKeys: (Array.isArray(body.labels) ? body.labels : []).map((row) => String(row.labelKey || row.label_key || '').trim()),
      action: 'ui_label_update',
    });
    logEvent({
      companyId,
      userId: user.id,
      username: user.username,
      severity: 'AUDIT',
      module: 'settings',
      action: 'ui_labels_save',
      details: `${labels.length} címke`,
    });
    ok(res, {
      labels,
      settings: {
        uiLanguage: getSetting('ui_language', 'hu'),
        uiTheme: getSetting('ui_theme', 'light'),
      },
    });
    return true;
  }

  if (route === '/api/ui-labels/import' && method === 'POST') {
    const user = requirePermission(req, 'settings', 'edit');
    const body = await parseBody(req);
    const companyId = activeCompanyId();
    const beforeLabels = listUiLabels();
    const importTable = getImportTableFromBody(body);
    const imported = importedUiLabelsFromRows(importTable.rows || []);
    const labels = saveUiLabels(imported, user.username);
    logUiLabelAudits({
      companyId,
      user,
      beforeRows: beforeLabels,
      afterRows: labels,
      labelKeys: imported.map((row) => row.labelKey),
      action: 'ui_label_import',
    });
    logEvent({
      companyId,
      userId: user.id,
      username: user.username,
      severity: 'AUDIT',
      module: 'settings',
      action: 'ui_labels_import',
      details: `${imported.length} címke importálva`,
    });
    ok(res, { labels, imported: imported.length });
    return true;
  }

  if (route === '/api/master-data' && method === 'GET') {
    const companyId = asNumber(url.searchParams.get('companyId') || getSetting('active_company_id'), 'companyId');
    requirePermission(req, 'coa', 'view', { companyId });
    ok(res, {
      structures: {
        management: reportStructurePayload(companyId, 'MGMT'),
        consolidation: reportStructurePayload(companyId, 'CONS'),
      },
    });
    return true;
  }

  if (route === '/api/validation-rules' && method === 'GET') {
    requirePermission(req, 'validationRules', 'view', { companyId: activeCompanyId() });
    ok(res, listValidationRules(activeCompanyId()));
    return true;
  }

  if (route === '/api/validation-rules' && method === 'POST') {
    const body = await parseBody(req);
    const companyId = activeCompanyId();
    const user = requirePermission(req, 'validationRules', 'edit', { companyId });
    const before = listValidationRules(companyId);
    const result = saveValidationRules(companyId, body.rules || [], user.id);
    const beforeMap = validationRuleAuditMap(before);
    const afterMap = validationRuleAuditMap(result);
    [...new Set((body.rules || []).map((rule) => `${String(rule.scope || '').trim().toUpperCase()}:${String(rule.fieldKey || rule.field_key || '').trim()}`))].forEach((key) => {
      logAuditChanges({
        companyId,
        user,
        module: 'validation',
        table: 'validation_rules',
        entityKey: key,
        action: 'validation_rule_update',
        before: beforeMap.get(key) || {},
        after: afterMap.get(key) || {},
        fields: VALIDATION_RULE_AUDIT_FIELDS,
      });
    });
    logEvent({ companyId, userId: user.id, username: user.username, severity: 'AUDIT', module: 'validation', action: 'save_rules', details: `${(body.rules || []).length} szabaly` });
    ok(res, result);
    return true;
  }

  if (route === '/api/master-data/report-groups' && method === 'POST') {
    const body = await parseBody(req);
    const companyId = activeCompanyId();
    const user = requirePermission(req, 'coa', 'edit', { companyId, companyMode: 'manage' });
    const structureType = normalizeReportStructure(body.structureType || body.structure_type);
    const groupLevel = asNumber(body.groupLevel || body.group_level, 'groupLevel');
    const code = normalizePrefixedCode(required(body.code, 'code'), structureType, groupLevel);
    const before = reportGroupAuditRow(companyId, structureType, groupLevel, code);
    upsertReportGroup(companyId, structureType, groupLevel, code, required(body.name, 'name'), body.active, body.mode);
    const after = reportGroupAuditRow(companyId, structureType, groupLevel, code);
    logAuditChanges({
      companyId,
      user,
      table: 'report_groups',
      entityKey: `${structureType}/${groupLevel}/${code}`,
      action: before ? 'report_group_update' : 'report_group_create',
      before,
      after,
      fields: REPORT_GROUP_AUDIT_FIELDS,
    });
    ok(res, {});
    return true;
  }

  if (route === '/api/master-data/report-groups' && method === 'DELETE') {
    const body = await parseBody(req);
    const companyId = activeCompanyId();
    const user = requirePermission(req, 'coa', 'delete', { companyId, companyMode: 'manage' });
    const structureType = normalizeReportStructure(body.structureType || body.structure_type);
    const groupLevel = asNumber(body.groupLevel || body.group_level, 'groupLevel');
    const codes = [...new Set((Array.isArray(body.codes) ? body.codes : []).map((code) => normalizePrefixedCode(code, structureType, groupLevel)))];
    const beforeRows = codes.map((code) => reportGroupAuditRow(companyId, structureType, groupLevel, code)).filter(Boolean);
    const result = deleteReportGroups(companyId, structureType, groupLevel, codes);
    beforeRows.forEach((before) => {
      if (reportGroupAuditRow(companyId, structureType, groupLevel, before.code)) return;
      logAuditChanges({
        companyId,
        user,
        table: 'report_groups',
        entityKey: `${structureType}/${groupLevel}/${before.code}`,
        action: 'report_group_delete',
        before,
        after: {},
        fields: REPORT_GROUP_AUDIT_FIELDS,
      });
    });
    ok(res, result);
    return true;
  }

  if (route === '/api/master-data/report-codes' && method === 'POST') {
    const body = await parseBody(req);
    const companyId = activeCompanyId();
    const user = requirePermission(req, 'coa', 'edit', { companyId, companyMode: 'manage' });
    const structureType = normalizeReportStructure(body.structureType || body.structure_type);
    const code = normalizePrefixedCode(required(body.code, 'code'), structureType);
    const before = reportCodeAuditRow(companyId, structureType, code);
    upsertReportCode(companyId, structureType, { ...body, code });
    const after = reportCodeAuditRow(companyId, structureType, code);
    logAuditChanges({
      companyId,
      user,
      table: 'report_codes',
      entityKey: `${structureType}/${code}`,
      action: before ? 'report_code_update' : 'report_code_create',
      before,
      after,
      fields: REPORT_CODE_AUDIT_FIELDS,
    });
    ok(res, {});
    return true;
  }

  if (route === '/api/master-data/report-codes' && method === 'DELETE') {
    const body = await parseBody(req);
    const companyId = activeCompanyId();
    const user = requirePermission(req, 'coa', 'delete', { companyId, companyMode: 'manage' });
    const structureType = normalizeReportStructure(body.structureType || body.structure_type);
    const codes = [...new Set((Array.isArray(body.codes) ? body.codes : []).map((code) => normalizePrefixedCode(code, structureType)))];
    const beforeRows = codes.map((code) => reportCodeAuditRow(companyId, structureType, code)).filter(Boolean);
    const result = deleteReportCodes(companyId, structureType, codes);
    beforeRows.forEach((before) => {
      if (reportCodeAuditRow(companyId, structureType, before.code)) return;
      logAuditChanges({
        companyId,
        user,
        table: 'report_codes',
        entityKey: `${structureType}/${before.code}`,
        action: 'report_code_delete',
        before,
        after: {},
        fields: REPORT_CODE_AUDIT_FIELDS,
      });
    });
    ok(res, result);
    return true;
  }

  if (route === '/api/master-data/report-codes/import' && method === 'POST') {
    const body = await parseBody(req);
    const companyId = activeCompanyId();
    const user = requirePermission(req, 'coa', 'import', { companyId, companyMode: 'manage' });
    const result = importReportStructure(companyId, body.structureType || body.structure_type, body, user);
    logEvent({
      companyId,
      userId: user.id,
      username: user.username,
      severity: result.accepted ? 'AUDIT' : 'WARNING',
      module: 'master_data',
      action: 'import_report_structure',
      details: `${body.structureType || body.structure_type}: ${result.batchId || 'rejected'} / ${result.imported || 0}`,
    });
    ok(res, result);
    return true;
  }

  return false;
}

module.exports = { handleSetupRoutes };
