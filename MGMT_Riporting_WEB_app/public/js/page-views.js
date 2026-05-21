(function () {
  function createPageViews(deps) {
    const {
      state,
      api,
      esc,
      fmt,
      fmtFx,
      isoDate,
      table,
      resizableTh,
      applyColumnOrder,
      colGroup,
      fixedTableStyle,
      can,
      canPermission,
      pageHead,
      contextQuery,
      content,
      displayUnitLabel,
      displayAmount,
      fmtAmount,
      renderGlUploadPanel,
      glStatusLabel,
      glOverwriteLabel,
      wildcardMatch,
    } = deps;

function yearOptions() {
  const activeYear = Number(state.settings.activeYear) || new Date().getFullYear();
  return Array.from({ length: 11 }, (_, index) => activeYear - 5 + index)
    .map((year) => `<option value="${year}" ${Number(state.settings.activeYear) === year ? 'selected' : ''}>${year}</option>`)
    .join('');
}

function monthOptions() {
  return Array.from({ length: 12 }, (_, index) => index + 1)
    .map((month) => `<option value="${month}" ${Number(state.settings.activePeriod) === month ? 'selected' : ''}>${month}. hó</option>`)
    .join('');
}

function periodActions({ month = true, extra = '' } = {}) {
  return `
    <div class="inline-context-actions">
      <label>Év <select data-context="activeYear">${yearOptions()}</select></label>
      ${month ? `<label>Hó <select data-context="activePeriod">${monthOptions()}</select></label>` : ''}
      ${extra}
    </div>
  `;
}

function glImportFiltersFromDom(source = document) {
  const root = source?.closest?.('[data-gl-import-root]') || document.querySelector('[data-gl-import-root]') || document;
  return {
    year: String(root.querySelector('[data-gl-import-list-filter="year"]')?.value || ''),
    month: String(root.querySelector('[data-gl-import-list-filter="month"]')?.value || ''),
    status: String(root.querySelector('[data-gl-import-list-filter="status"]')?.value || ''),
    ledger: String(root.querySelector('[data-gl-import-list-filter="ledger"]')?.value || ''),
    file: String(root.querySelector('[data-gl-import-list-filter="file"]')?.value || '').trim().toLowerCase(),
    onlyIssues: Boolean(root.querySelector('[data-gl-import-list-filter="onlyIssues"]')?.checked),
  };
}

function glImportSessionVisible(row, filters = {}) {
  if (filters.year && String(row.year) !== filters.year) return false;
  if (filters.month && String(row.month) !== filters.month) return false;
  if (filters.status && String(row.status) !== filters.status) return false;
  if (filters.ledger === 'yes' && !row.inLedger) return false;
  if (filters.ledger === 'no' && row.inLedger) return false;
  if (filters.file && !wildcardMatch(String(row.file_name || ''), filters.file)) return false;
  if (filters.onlyIssues && Number(row.issueCount || 0) <= 0) return false;
  return true;
}

function renderGlImportSessionsTable(rows = [], filters = {}) {
  const visibleRows = rows.filter((row) => glImportSessionVisible(row, filters));
  return table([
    { label: 'Import azonosító', key: 'batch_id' },
    { label: 'Idő', key: 'imported_at', render: (r) => esc(isoDate(r.imported_at)) },
    { label: 'Cég', key: 'companyCode' },
    { label: 'Év/Hó', key: 'year', render: (r) => `${esc(r.year)} / ${esc(r.month)}` },
    { label: 'Scenario', key: 'scenario' },
    { label: 'Fájl', key: 'file_name' },
    { label: 'Státusz', key: 'status', render: (r) => esc(glStatusLabel(r.status)) },
    { label: 'Felülírás', key: 'overwrite_status', render: (r) => esc(glOverwriteLabel(r.overwrite_status)) },
    { label: 'Sor', key: 'imported_rows', num: true },
    { label: 'Hiba/Figy.', key: 'issueCount', num: true, render: (r) => fmt(r.issueCount || 0) },
    { label: 'Főkönyvben', key: 'inLedger', render: (r) => r.inLedger ? 'Igen' : 'Nem' },
    { label: '', key: 'id', render: (r) => r.import_type === 'GL' ? `<button type="button" class="secondary slim" data-action="open-gl-import-detail" data-session-id="${r.id}">Részletek</button>` : '' },
  ], visibleRows, 'Nincs megjeleníthető import session.');
}

function refreshGlImportSessionsTable(source = document) {
  const root = source?.closest?.('[data-gl-import-root]') || document.querySelector('[data-gl-import-root]');
  const slot = root?.querySelector('[data-gl-import-sessions-table]');
  if (!slot) return;
  const filters = glImportFiltersFromDom(root);
  state.glImportFilters = filters;
  slot.innerHTML = renderGlImportSessionsTable(window.__glImportSessions || [], filters);
}

function settingsMainTab() {
  const allowed = new Set(['general', 'companies', 'accounts']);
  if (!allowed.has(state.settingsMainTab)) state.settingsMainTab = 'general';
  return state.settingsMainTab;
}

function settingsGeneralTab() {
  const allowed = new Set(['system', 'email', 'masters', 'labels']);
  if (!allowed.has(state.settingsGeneralTab)) state.settingsGeneralTab = 'system';
  return state.settingsGeneralTab;
}

function settingsAccountsTab() {
  const allowed = new Set(['profile', 'users', 'sessions', 'locked', 'logins']);
  if (!allowed.has(state.settingsAccountsTab)) state.settingsAccountsTab = 'profile';
  return state.settingsAccountsTab;
}

function settingsTabButton(label, tab, active, attrs = '') {
  return `<button type="button" class="settings-tab ${active ? 'active' : ''}" data-action="settings-tab" ${attrs} data-settings-tab="${esc(tab)}">${esc(label)}</button>`;
}

function settingsTabs() {
  const general = settingsGeneralTab();
  const generalTabs = [
    ['system', 'Rendszer'],
    ['email', 'Email beállításai'],
    ['masters', 'Törzsadatok'],
    ['labels', 'Címkék és nyelv'],
  ];
  return `
    <div class="settings-subtabs settings-subtabs-only">
      ${generalTabs.map(([tab, label]) => settingsTabButton(label, tab, general === tab, 'data-settings-level="general"')).join('')}
    </div>
  `;
}

function settingsHero(title, subtitle) {
  return '';
}

function currencyOptions(selected) {
  return ['HUF', 'EUR', 'USD', 'CHF', 'GBP']
    .map((currency) => `<option value="${currency}" ${String(selected || 'HUF').toUpperCase() === currency ? 'selected' : ''}>${currency}</option>`)
    .join('');
}

async function companiesBody() {
  const data = await api('/api/companies');
  const rows = data.companies || [];
  const canEditCompanies = canPermission('companies', 'edit');
  const canDeleteCompanies = canPermission('companies', 'delete');
  const companyEditAttr = canEditCompanies ? '' : 'disabled';
  const headers = [
    { label: 'Kód', key: 'code', width: 150, render: (row) => `<input form="companyForm${row.id}" name="code" value="${esc(row.code)}" required ${companyEditAttr}>` },
    { label: 'Név', key: 'name', width: 260, render: (row) => `<input form="companyForm${row.id}" name="name" value="${esc(row.name)}" required ${companyEditAttr}>` },
    { label: 'Év kezdete', key: 'fiscalYearStart', width: 120, num: true, render: (row) => `<input form="companyForm${row.id}" name="fiscalYearStart" type="number" min="1" max="12" value="${esc(row.fiscalYearStart || 1)}" ${companyEditAttr}>` },
    { label: 'Alapdeviza', key: 'baseCurrency', width: 150, render: (row) => `<select form="companyForm${row.id}" name="baseCurrency" ${companyEditAttr}>${currencyOptions(row.baseCurrency)}</select>` },
    { label: 'Aktív', key: 'active', width: 70, className: 'center checkbox-cell', render: (row) => `<input form="companyForm${row.id}" name="active" type="checkbox" value="1" ${row.active ? 'checked' : ''} ${companyEditAttr}>` },
    {
      label: 'Művelet',
      key: 'actions',
      width: 430,
      render: (row) => `
        <form id="companyForm${row.id}" data-form="company-update" data-company-id="${row.id}" class="button-row compact-actions company-row-actions">
          <input type="hidden" name="logoFileName" value="${esc(row.logoFileName || '')}">
          <input type="hidden" name="logoData" value="${esc(row.logoData || '')}">
          ${canEditCompanies ? `
          <label class="file-button secondary slim">
            Logo
            <input type="file" accept="image/png,image/jpeg,image/svg+xml" data-company-logo-file data-company-form="companyForm${row.id}">
          </label>
          <span class="muted company-logo-name" data-company-logo-name>${esc(row.logoFileName || '')}</span>
          <button type="submit" class="secondary slim">Mentés</button>
          ` : ''}
          ${canDeleteCompanies ? `<button type="button" class="danger slim" data-action="delete-company" data-company-id="${row.id}" data-company-code="${esc(row.code)}" data-company-name="${esc(row.name)}">Cég törlése</button>` : ''}
        </form>
      `,
    },
  ];
  return `
    ${settingsHero('Vállalatok', 'Rendszerben lévő vállalatok és aktív riport környezet kezelése.')}
    ${canEditCompanies ? `
    <section class="panel">
      <h2>Új vállalat</h2>
      <form data-form="company-create" class="form-row compact company-create-form">
        <label>Kód <input name="code" required placeholder="HU01"></label>
        <label>Név <input name="name" required placeholder="Minta Kft."></label>
        <label>Pénzügyi év kezdőhónap <input name="fiscalYearStart" type="number" min="1" max="12" value="1"></label>
        <label>Alapdeviza
          <select name="baseCurrency">${currencyOptions('HUF')}</select>
        </label>
        <button type="submit">Létrehozás</button>
      </form>
      <div id="companyMessage" class="error-text"></div>
    </section>
    ` : ''}
    <section class="panel settings-data-panel">
      <h2>Vállalatok</h2>
      ${table(headers, rows, 'Nincs vállalat.', { scope: 'companies', reorder: true, className: 'stable-edit-table companies-table' })}
    </section>
  `;
}

async function usersBody({ lockedOnly = false } = {}) {
  const data = await api('/api/users');
  const users = lockedOnly ? data.users.filter((row) => row.locked) : data.users;
  const canEditUsers = canPermission('users', 'edit');
  const canAdminSessions = canPermission('sessions', 'admin');
  const userEditAttr = canEditUsers ? '' : 'disabled';
  const roleOptions = (selected) => ['VIEWER', 'USER', 'ADMIN', 'SA']
    .map((role) => `<option value="${role}" ${role === selected ? 'selected' : ''}>${role}</option>`)
    .join('');
  const headers = [
    { label: 'User', key: 'username', width: 140, render: (row) => esc(row.username) },
    { label: 'Név', key: 'displayName', width: 240, render: (row) => `<input form="userForm${row.id}" name="displayName" value="${esc(row.displayName)}" required ${userEditAttr}>` },
    { label: 'Email', key: 'email', width: 240, render: (row) => `<input form="userForm${row.id}" name="email" type="email" value="${esc(row.email)}" ${userEditAttr}>` },
    { label: 'Role', key: 'role', width: 120, render: (row) => `<select form="userForm${row.id}" name="role" ${userEditAttr}>${roleOptions(row.role)}</select>` },
    { label: 'Aktív', key: 'active', width: 80, className: 'center checkbox-cell', render: (row) => `<input form="userForm${row.id}" name="active" type="checkbox" value="1" ${row.active ? 'checked' : ''} ${userEditAttr}>` },
    { label: 'Jelszócsere', key: 'mustChangePassword', width: 115, className: 'center checkbox-cell', render: (row) => `<input form="userForm${row.id}" name="mustChangePassword" type="checkbox" value="1" ${row.mustChangePassword ? 'checked' : ''} ${userEditAttr}>` },
    { label: 'Hibás login', key: 'failedAttempts', width: 115, num: true, render: (row) => fmt(row.failedAttempts || 0) },
    { label: 'Zárolás', key: 'locked', width: 160, render: (row) => row.locked ? `<span class="pill warn">Zárolt</span><br><small>${esc(isoDate(row.lockedUntil))}</small>` : '<span class="pill ok">OK</span>' },
    { label: 'Utolsó login', key: 'lastLoginAt', width: 170, render: (row) => esc(isoDate(row.lastLoginAt)) },
    {
      label: 'Művelet',
      key: 'actions',
      width: 420,
      render: (row) => `
        <form id="userForm${row.id}" data-form="user-update" data-user-id="${row.id}" class="button-row compact-actions user-row-actions">
          ${canEditUsers ? '<button type="submit" class="secondary slim">Mentés</button>' : ''}
          ${canEditUsers ? `<button type="button" class="secondary slim" data-action="unlock-user" data-user-id="${row.id}">Feloldás</button>` : ''}
          ${canEditUsers ? `<button type="button" class="secondary slim" data-action="reset-user-password" data-user-id="${row.id}" data-username="${esc(row.username)}">Jelszó reset</button>` : ''}
          ${canAdminSessions ? `<button type="button" class="danger slim" data-action="revoke-user-sessions" data-user-id="${row.id}" data-username="${esc(row.username)}">Session zárás</button>` : ''}
        </form>
      `,
    },
  ];
  return `
    ${settingsHero(lockedOnly ? 'Zárolt fiókok' : 'Felhasználók', lockedOnly ? 'Aktív zárolások feloldása és ellenőrzése.' : 'Felhasználók, szerepkörök és hozzáférések kezelése.')}
    ${!lockedOnly && canEditUsers ? `
      <section class="panel">
        <h2>Új felhasználó</h2>
        <form data-form="user-create" class="form-row compact">
          <label>Felhasználónév <input name="username" required></label>
          <label>Név <input name="displayName" required></label>
          <label>Email <input name="email" type="email"></label>
          <label>Szerepkör
            <select name="role"><option>USER</option><option>VIEWER</option><option>ADMIN</option><option>SA</option></select>
          </label>
          <label>Ideiglenes jelszó <input name="password" value="Temp1234!"></label>
          <button type="submit">Létrehozás</button>
        </form>
        <div id="userMessage" class="error-text"></div>
      </section>
    ` : ''}
    <section class="panel settings-data-panel">
      <h2>${lockedOnly ? 'Aktív zárolások' : 'Felhasználó kezelés'}</h2>
      ${table(headers, users, lockedOnly ? 'Nincs aktív zárolás.' : 'Nincs felhasználó.', { scope: lockedOnly ? 'locked-users' : 'users', reorder: true, className: 'stable-edit-table users-table' })}
      <div id="userMessage" class="error-text"></div>
    </section>
  `;
}

async function sessionsBody() {
  const data = await api('/api/admin/sessions');
  const cleanup = data.cleanup || {};
  const canAdminSessions = canPermission('sessions', 'admin');
  const headers = [
    { label: 'User', key: 'username', width: 140, render: (row) => `${esc(row.username)} ${row.current ? '<span class="pill ok">ez</span>' : ''}` },
    { label: 'Név', key: 'displayName', width: 190 },
    { label: 'Role', key: 'role', width: 95, render: (row) => `<span class="badge ${esc(String(row.role || '').toLowerCase())}">${esc(row.role)}</span>` },
    { label: 'Cég', key: 'companyCode', width: 90 },
    { label: 'Belépés', key: 'createdAt', width: 160, render: (row) => esc(isoDate(row.createdAt)) },
    { label: 'Utolsó aktivitás', key: 'lastSeenAt', width: 160, render: (row) => esc(isoDate(row.lastSeenAt)) },
    { label: 'Lejárat', key: 'expiresAt', width: 160, render: (row) => esc(isoDate(row.expiresAt)) },
    { label: 'IP', key: 'ipAddress', width: 130 },
    { label: 'Böngésző', key: 'userAgentShort', width: 260, render: (row) => `<span title="${esc(row.userAgent || '')}">${esc(row.userAgentShort || '')}</span>` },
    ...(canAdminSessions ? [{ label: 'Művelet', key: 'actions', width: 115, render: (row) => `<button type="button" class="danger slim" data-action="revoke-session" data-session-id="${encodeURIComponent(row.id)}" ${row.current ? 'disabled' : ''}>Kiléptetés</button>` }] : []),
  ];
  return `
    ${settingsHero('Aktív sessionök', 'Jelenlegi aktív belépések és admin kiléptetés.')}
    <div class="toolbar settings-toolbar">
      <button type="button" data-action="reload-page">Frissítés</button>
    </div>
    ${cleanup.total ? `<div class="notice">Lezárt inaktív vagy lejárt munkamenetek: <strong>${fmt(cleanup.total)}</strong> (lejárt: ${fmt(cleanup.expired || 0)}, inaktív: ${fmt(cleanup.idle || 0)}).</div>` : ''}
    <section class="panel settings-data-panel">
      <h2>Munkamenetek</h2>
      ${table(headers, data.sessions || [], 'Nincs aktív munkamenet.', { scope: 'sessions', reorder: true, className: 'stable-edit-table sessions-table' })}
    </section>
  `;
}

function profileBody() {
  return `
    ${settingsHero('Saját profil', 'Saját fiókadatok és jelszócsere.')}
    <div class="grid two">
      <section class="panel">
        <h2>Fiók</h2>
        <p><strong>${esc(state.user.displayName)}</strong></p>
        <p class="muted">${esc(state.user.username)} - ${esc(state.user.role)}</p>
      </section>
      <section class="panel">
        <h2>Jelszócsere</h2>
        <form data-form="password-change" class="grid">
          <label>Jelenlegi jelszó <input name="currentPassword" type="password" required></label>
          <label>Új jelszó <input name="newPassword" type="password" minlength="8" required></label>
          <button type="submit">Jelszó mentése</button>
        </form>
        <div id="profileMessage" class="error-text"></div>
      </section>
    </div>
  `;
}

async function loginAttemptsBody() {
  const data = await api(`/api/logs?type=security&scope=all&companyId=${encodeURIComponent(state.settings.activeCompanyId)}`);
  const rows = (data.rows || [])
    .filter((row) => row.module === 'auth' || String(row.action || '').includes('login') || String(row.action || '').includes('locked'));
  const successful = rows.filter((row) => ['login', 'global_sa_login'].includes(row.action)).length;
  const failed = rows.filter((row) => String(row.action || '').includes('failed') || String(row.action || '').includes('locked')).length;
  const uniqueUsers = new Set(rows.map((row) => row.username).filter(Boolean)).size;
  const uniqueCompanies = new Set(rows.map((row) => row.companyCode).filter(Boolean)).size;
  return `
    ${settingsHero('Login kísérletek', 'Sikeres és sikertelen bejelentkezési események napló alapján.')}
    <div class="grid four settings-metrics">
      <div class="metric good"><span>Sikeres</span><strong>${fmt(successful)}</strong></div>
      <div class="metric bad"><span>Sikertelen / zárolás</span><strong>${fmt(failed)}</strong></div>
      <div class="metric"><span>Érintett user</span><strong>${fmt(uniqueUsers)}</strong></div>
      <div class="metric"><span>Érintett cég</span><strong>${fmt(uniqueCompanies)}</strong></div>
    </div>
    <section class="panel settings-data-panel">
      <h2>Bejelentkezési események</h2>
      ${table([
        { label: 'Időpont', key: 'created_at', render: (r) => esc(isoDate(r.created_at)) },
        { label: 'User', key: 'username' },
        { label: 'Cég', key: 'companyCode', render: (r) => esc(r.companyCode || 'Globális') },
        { label: 'Szint', key: 'severity' },
        { label: 'Művelet', key: 'action' },
        { label: 'Részlet', key: 'details' },
      ], rows, 'Nincs megjeleníthető login esemény.')}
    </section>
  `;
}

async function renderDashboard() {
  const data = await api(`/api/dashboard?${contextQuery()}`);
  const license = state.license || {};
  content(`
    ${pageHead('Áttekintés', 'Gyors állapotkép az aktív cégről, évről és periódusról.', periodActions())}
    ${state.user.mustChangePassword ? '<div class="notice warn">Az alap jelszó még aktív. A Profil oldalon érdemes azonnal lecserélni.</div>' : ''}
    ${license.status === 'missing' ? '<div class="notice warn">Nincs aktivált licensz. A rendszer ettől még v0.1 módban használható.</div>' : ''}
    <div class="grid four">
      <div class="metric good"><span>ACT YTD (${esc(displayUnitLabel())})</span><strong>${fmtAmount(data.kpis.actYtd)}</strong></div>
      <div class="metric"><span>BUD YTD</span><strong>${fmtAmount(data.kpis.budgetYtd)}</strong></div>
      <div class="metric ${data.kpis.varianceBudget >= 0 ? 'good' : 'bad'}"><span>ACT vs BUD</span><strong>${fmtAmount(data.kpis.varianceBudget)}</strong></div>
      <div class="metric warn"><span>GL sor / COA sor</span><strong>${fmt(data.kpis.glCount)} / ${fmt(data.kpis.coaCount)}</strong></div>
    </div>
    <div class="grid two" style="margin-top:14px">
      ${canPermission('settings', 'admin') || canPermission('dataadmin', 'view') ? `
        <section class="panel">
          <h2>Mintaadat betöltés</h2>
          <p class="muted">Valószerű magyar COA, 12 havi ACT/PY főkönyv, valamint BUD/FCST tervadatok az aktív évre.</p>
          <div class="actions" style="justify-content:flex-start;margin-top:10px">
            ${canPermission('settings', 'admin') ? '<button data-action="load-sample-data">Mintaadat betöltése</button>' : ''}
            ${canPermission('dataadmin', 'view') ? '<button class="secondary" data-action="open-data-admin-window">Adatkarbantartás</button>' : ''}
          </div>
          <div id="sampleMessage" class="success-text"></div>
        </section>
      ` : ''}
      <section class="panel">
        <h2>Utolsó import</h2>
        ${data.lastImport ? `
          <p><strong>${esc(data.lastImport.file_name)}</strong></p>
          <p class="muted">${esc(data.lastImport.scenario)} - ${esc(data.lastImport.year)} / ${esc(data.lastImport.month)}. hó - ${fmt(data.lastImport.imported_rows)} sor</p>
          <p class="muted">${isoDate(data.lastImport.imported_at)}</p>
        ` : '<p class="muted">Még nincs importált adat.</p>'}
      </section>
      <section class="panel">
        <h2>Friss események</h2>
        ${table([
          { label: 'Idő', key: 'created_at', render: (r) => esc(isoDate(r.created_at)) },
          { label: 'Szint', key: 'severity' },
          { label: 'Modul', key: 'module' },
          { label: 'Művelet', key: 'action' },
        ], data.recentLogs || [], 'Még nincs naplóbejegyzés.')}
      </section>
    </div>
  `);
}

async function renderReport() {
  const data = await api(`/api/report?${contextQuery()}`);
  window.__lastReport = data.rows.map((row) => ({
    ...row,
    currentMonth: displayAmount(row.currentMonth),
    actYtd: displayAmount(row.actYtd),
    pyYtd: displayAmount(row.pyYtd),
    budYtd: displayAmount(row.budYtd),
    fcstYtd: displayAmount(row.fcstYtd),
    vsPy: displayAmount(row.vsPy),
    vsBud: displayAmount(row.vsBud),
    vsFcst: displayAmount(row.vsFcst),
  }));
  content(`
    ${pageHead('Riport', `BS és PL sorok, YTD, terv és variancia. Egység: ${displayUnitLabel()}.`, periodActions({ extra: '<button data-action="export-report">CSV export</button>' }))}
    <div class="grid four">
      <div class="metric good"><span>ACT YTD (${esc(data.currency)})</span><strong>${fmtAmount(data.totals.actYtd)}</strong></div>
      <div class="metric"><span>PY YTD</span><strong>${fmtAmount(data.totals.pyYtd)}</strong></div>
      <div class="metric"><span>BUD YTD</span><strong>${fmtAmount(data.totals.budYtd)}</strong></div>
      <div class="metric"><span>FCST YTD</span><strong>${fmtAmount(data.totals.fcstYtd)}</strong></div>
    </div>
    <div style="margin-top:14px">
      ${table([
        { label: 'Típus', key: 'statementType' },
        { label: 'GL', key: 'glNumber' },
        { label: 'Konsz. kontó', key: 'consAccount' },
        { label: 'Kategória', key: 'reportingCategory' },
        { label: 'Havi ACT', key: 'currentMonth', num: true, render: (r) => fmtAmount(r.currentMonth) },
        { label: 'ACT YTD', key: 'actYtd', num: true, render: (r) => fmtAmount(r.actYtd) },
        { label: 'PY YTD', key: 'pyYtd', num: true, render: (r) => fmtAmount(r.pyYtd) },
        { label: 'BUD YTD', key: 'budYtd', num: true, render: (r) => fmtAmount(r.budYtd) },
        { label: 'ACT-BUD', key: 'vsBud', num: true, render: (r) => fmtAmount(r.vsBud) },
      ], data.rows)}
    </div>
  `);
}

async function renderGlImport() {
  const sessions = await api(`/api/import-sessions?companyId=${encodeURIComponent(state.settings.activeCompanyId)}&importType=GL`);
  const rows = sessions.rows || [];
  window.__glImportSessions = rows;
  const filters = state.glImportFilters || {};
  const years = [...new Set(rows.map((row) => row.year).filter(Boolean))].sort((a, b) => b - a);
  content(`
    <div data-gl-import-root>
    ${pageHead('GL Import', 'Havi ACT főkönyvi kivonat betöltése aktiválás előtti ellenőrzéssel.')}
    ${canPermission('gl', 'import') ? `
    <section class="panel">
      <h2>Import</h2>
      ${renderGlUploadPanel()}
    </section>
    ` : ''}
    <section class="panel" style="margin-top:14px">
      <h2>Import előzmények</h2>
      <div class="form-row compact">
        <label>Év
          <select data-gl-import-list-filter="year">
            <option value="">Mind</option>
            ${years.map((year) => `<option value="${esc(year)}" ${String(filters.year || '') === String(year) ? 'selected' : ''}>${esc(year)}</option>`).join('')}
          </select>
        </label>
        <label>Hónap
          <select data-gl-import-list-filter="month">
            <option value="">Mind</option>
            ${Array.from({ length: 12 }, (_unused, idx) => idx + 1).map((month) => `<option value="${month}" ${String(filters.month || '') === String(month) ? 'selected' : ''}>${month}. hó</option>`).join('')}
          </select>
        </label>
        <label>Státusz
          <select data-gl-import-list-filter="status">
            <option value="">Mind</option>
            ${['ACTIVE', 'READY', 'INACTIVE', 'GL_DELETED'].map((status) => `<option value="${status}" ${filters.status === status ? 'selected' : ''}>${esc(glStatusLabel(status))}</option>`).join('')}
          </select>
        </label>
        <label>Főkönyvben
          <select data-gl-import-list-filter="ledger">
            <option value="">Mind</option>
            <option value="yes" ${filters.ledger === 'yes' ? 'selected' : ''}>Igen</option>
            <option value="no" ${filters.ledger === 'no' ? 'selected' : ''}>Nem</option>
          </select>
        </label>
        <label>Fájlnév <input data-gl-import-list-filter="file" value="${esc(filters.file || '')}" placeholder="keresés fájlnévre"></label>
        <label class="checkline"><input type="checkbox" data-gl-import-list-filter="onlyIssues" ${filters.onlyIssues ? 'checked' : ''}> Csak hibás/figyelmeztetéses</label>
      </div>
      <div style="margin-top:10px" data-gl-import-sessions-table>
        ${renderGlImportSessionsTable(rows, filters)}
      </div>
    </section>
    </div>
  `);
}

async function renderFx() {
  const data = await api(`/api/fx?year=${state.settings.activeYear}`);
  content(`
    ${pageHead('Árfolyamok', 'Havi átlag és hóvégi árfolyamok. Az MNB letöltés későbbi fázisban kapcsolható rá.', periodActions({ month: false }))}
    ${canPermission('fx', 'edit') ? `
      <section class="panel">
        <h2>Manuális árfolyam</h2>
        <form data-form="fx-save" class="form-row compact">
          <label>Év <input name="year" type="number" value="${esc(state.settings.activeYear)}"></label>
          <label>Hó <input name="month" type="number" min="1" max="12" value="${esc(state.settings.activePeriod)}"></label>
          <label>Deviza <select name="currency"><option>EUR</option><option>USD</option><option>CHF</option><option>GBP</option></select></label>
          <label>Havi átlag <input name="averageRate" type="number" step="0.0001" required></label>
          <label>Hóvégi <input name="monthEndRate" type="number" step="0.0001" required></label>
          <button type="submit">Mentés</button>
        </form>
        <div id="fxMessage" class="error-text"></div>
      </section>
    ` : ''}
    <div style="margin-top:14px">
      ${table([
        { label: 'Deviza', key: 'currency' },
        { label: 'Hó', key: 'month', num: true },
        { label: 'Havi átlag', key: 'average_rate', num: true, render: (r) => fmtFx ? fmtFx(r.average_rate) : fmt(r.average_rate, 4) },
        { label: 'Hóvégi', key: 'month_end_rate', num: true, render: (r) => fmtFx ? fmtFx(r.month_end_rate) : fmt(r.month_end_rate, 4) },
        { label: 'Forrás', key: 'manual', render: (r) => r.manual ? 'Manuális' : 'Seed' },
      ], data.rows)}
    </div>
  `);
}

async function renderBudget() {
  const data = await api(`/api/budget?companyId=${state.settings.activeCompanyId}&year=${state.settings.activeYear}&scenario=BUD`);
  content(`
    ${pageHead('Budget / Forecast', 'Terv és előrejelzés adatok importálása GL szinten.', periodActions({ month: false }))}
    ${canPermission('budget', 'import') ? `
    <section class="panel">
      <h2>Import</h2>
      <form data-form="budget-import" class="grid">
        <div class="form-row compact">
          <label>Év <input name="year" type="number" value="${esc(state.settings.activeYear)}"></label>
          <label>Scenario <select name="scenario"><option>BUD</option><option>FCST</option></select></label>
        </div>
        <input type="hidden" id="budgetFileName" name="fileName">
        <input type="hidden" id="budgetFileType" name="fileType">
        <input type="hidden" id="budgetFileData" name="fileData">
        <label>Excel / CSV / TXT fájl <input type="file" accept=".xlsx,.csv,.txt" data-file-target="budgetCsv" data-file-name-target="budgetFileName" data-file-type-target="budgetFileType" data-file-data-target="budgetFileData"></label>
        <label>CSV tartalom / Excel státusz
          <textarea id="budgetCsv" name="csvText" placeholder="month;gl_number;amount&#10;1;4000;1000000&#10;1;6000;-350000"></textarea>
        </label>
        <div class="actions"><button type="submit">Tervadat import</button></div>
        <div id="budgetMessage" class="error-text"></div>
      </form>
    </section>
    ` : ''}
    <div style="margin-top:14px">
      ${table([
        { label: 'Hó', key: 'month', num: true },
        { label: 'GL', key: 'gl_number' },
        { label: 'Konsz. kontó', key: 'consAccount' },
        { label: 'Scenario', key: 'scenario' },
        { label: 'Összeg', key: 'amount', num: true, render: (r) => fmtAmount(r.amount) },
      ], data.rows)}
    </div>
  `);
}

async function renderCompanies() {
  content(await companiesBody());
}

async function renderUsers() {
  content(await usersBody());
}

async function renderSessions() {
  content(await sessionsBody());
}

async function renderBackup() {
  const data = await api('/api/backups');
  const settings = data.settings || {};
  const rows = data.rows || [];
  const canEditBackup = canPermission('backup', 'edit');
  const canRestoreBackup = canPermission('backup', 'restore');
  const canDeleteBackup = canPermission('backup', 'delete');
  const canExportBackup = canPermission('backup', 'export');
  const scheduleType = settings.scheduleType || 'daily';
  const scheduleTypeLabel = {
    once: 'Egyszer',
    daily: 'Naponta',
    weekly: 'Hetente',
    monthly: 'Havonta',
  }[scheduleType] || scheduleType;
  const weekdayValues = new Set(String(settings.scheduleWeekdays || '').split(',').filter(Boolean));
  const monthValues = new Set(String(settings.scheduleMonths || '').split(',').filter(Boolean));
  const monthDayValues = new Set(String(settings.scheduleMonthDays || '').split(',').filter(Boolean));
  const days = [
    ['1', 'Hétfő'],
    ['2', 'Kedd'],
    ['3', 'Szerda'],
    ['4', 'Csütörtök'],
    ['5', 'Péntek'],
    ['6', 'Szombat'],
    ['7', 'Vasárnap'],
  ];
  const months = [
    ['1', 'Jan'],
    ['2', 'Feb'],
    ['3', 'Már'],
    ['4', 'Ápr'],
    ['5', 'Máj'],
    ['6', 'Jún'],
    ['7', 'Júl'],
    ['8', 'Aug'],
    ['9', 'Szep'],
    ['10', 'Okt'],
    ['11', 'Nov'],
    ['12', 'Dec'],
  ];
  const dayChecks = Array.from({ length: 31 }, (_, i) => String(i + 1));
  const lastBackupTime = settings.lastSuccessAt ? Date.parse(settings.lastSuccessAt) : 0;
  const staleBackup = lastBackupTime && (Date.now() - lastBackupTime > 7 * 24 * 60 * 60 * 1000);
  const backupFreshnessNotice = !lastBackupTime
    ? '<div class="notice warn">Még nincs sikeres backup rögzítve. Érdemes most kézi mentést készíteni.</div>'
    : staleBackup
      ? '<div class="notice warn">Az utolsó sikeres backup több mint 7 napos. Ellenőrizd az automatikus mentést.</div>'
      : '';
  content(`
    ${pageHead('Backup', 'SQLite adatbázis biztonsági mentése.', `
      ${canEditBackup ? '<button data-action="create-backup">Backup készítése</button>' : ''}
    `)}
    ${canEditBackup ? `
    <form data-form="backup-settings-save" class="backup-settings-form">
      <section class="panel backup-panel">
        <h2>Mentés beállítások</h2>
        <div class="backup-path-row">
          <label>Mentési útvonal
            <input name="backup_directory" data-backup-directory-input value="${esc(settings.backupDirectory || '')}">
          </label>
          <button type="button" class="secondary" data-action="browse-backup-directory">Tallózás</button>
          <button type="button" class="secondary" data-action="copy-backup-directory" data-backup-directory="${esc(settings.backupDirectory || '')}">Útvonal másolása</button>
        </div>
        <div class="form-row compact backup-settings-row">
          <label>Megőrzött mentések (db) <input name="backup_limit" type="number" min="1" max="365" value="${esc(settings.backupLimit || 30)}"></label>
          <label>Törlés előtti backup
            <select name="backup_before_destructive">
              <option value="1" ${settings.backupBeforeDestructive ? 'selected' : ''}>Bekapcsolva</option>
              <option value="0" ${!settings.backupBeforeDestructive ? 'selected' : ''}>Kikapcsolva</option>
            </select>
          </label>
        </div>
        <div class="backup-inline-status">
          <span>Utolsó sikeres mentés: <strong>${settings.lastSuccessAt ? esc(isoDate(settings.lastSuccessAt)) : '-'}</strong></span>
          <span>Utolsó fájl: <strong>${esc(settings.lastFile || '-')}</strong></span>
          <span>Automatikus mentés: <strong>${settings.scheduleEnabled ? 'Bekapcsolva' : 'Kikapcsolva'}${settings.scheduleEnabled ? ` / ${esc(scheduleTypeLabel)}` : ''}</strong></span>
        </div>
        ${backupFreshnessNotice}
        ${settings.lastError ? `<div class="notice bad">Utolsó automatikus mentési hiba: ${esc(settings.lastError)}</div>` : ''}
      </section>
      <section class="panel backup-panel">
        <h2>Automatikus mentés</h2>
        <div class="form-row compact backup-schedule-row">
          <label>Automatikus mentés
            <select name="backup_schedule_enabled">
              <option value="1" ${settings.scheduleEnabled ? 'selected' : ''}>Engedélyezve</option>
              <option value="0" ${!settings.scheduleEnabled ? 'selected' : ''}>Kikapcsolva</option>
            </select>
          </label>
          <label>Gyakoriság
            <select name="backup_schedule_type" data-backup-schedule-type>
              <option value="once" ${scheduleType === 'once' ? 'selected' : ''}>Egyszer</option>
              <option value="daily" ${scheduleType === 'daily' ? 'selected' : ''}>Naponta</option>
              <option value="weekly" ${scheduleType === 'weekly' ? 'selected' : ''}>Hetente</option>
              <option value="monthly" ${scheduleType === 'monthly' ? 'selected' : ''}>Havonta</option>
            </select>
          </label>
          <label>Indítás dátuma <input name="backup_schedule_start_date" type="date" value="${esc(settings.scheduleStartDate || '')}"></label>
          <label>Indítás ideje <input name="backup_schedule_time" type="time" value="${esc(settings.scheduleTime || '23:00')}"></label>
          <label data-backup-schedule-section="daily">Napi ismétlés <input name="backup_schedule_daily_interval" type="number" min="1" max="365" value="${esc(settings.scheduleDailyInterval || 1)}"></label>
          <label data-backup-schedule-section="weekly">Heti ismétlés <input name="backup_schedule_weekly_interval" type="number" min="1" max="52" value="${esc(settings.scheduleWeeklyInterval || 1)}"></label>
        </div>
        <div class="backup-schedule-block" data-backup-schedule-section="weekly">
          <strong>Heti napok</strong>
          <div class="check-grid">
            ${days.map(([value, label]) => `<label><input type="checkbox" name="backup_schedule_weekdays" value="${value}" ${weekdayValues.has(value) ? 'checked' : ''}> ${label}</label>`).join('')}
          </div>
        </div>
        <div class="backup-schedule-block" data-backup-schedule-section="monthly">
          <strong>Hónapok</strong>
          <div class="check-grid months">
            ${months.map(([value, label]) => `<label><input type="checkbox" name="backup_schedule_months" value="${value}" ${monthValues.has(value) ? 'checked' : ''}> ${label}</label>`).join('')}
          </div>
          <strong>Napok</strong>
          <div class="check-grid month-days">
            ${dayChecks.map((value) => `<label><input type="checkbox" name="backup_schedule_month_days" value="${value}" ${monthDayValues.has(value) ? 'checked' : ''}> ${value}</label>`).join('')}
            <label><input type="checkbox" name="backup_schedule_month_days" value="last" ${monthDayValues.has('last') ? 'checked' : ''}> utolsó nap</label>
          </div>
        </div>
      </section>
      <div class="backup-form-footer">
        <div id="backupSettingsMessage" class="success-text"></div>
        <button type="submit">Beállítások mentése</button>
      </div>
    </form>
    ` : ''}
    ${canRestoreBackup ? `
    <section class="panel backup-panel">
      <h2>Kézi restore fájlból</h2>
      <div class="backup-restore-row">
        <label>Backup fájl <input type="file" accept=".db" data-backup-restore-file></label>
        <button type="button" class="danger" data-action="restore-uploaded-backup">Tallózott fájl restore</button>
      </div>
      <p class="muted">Restore előtt a rendszer automatikusan külön mentést készít, majd újraindítja a szervert.</p>
    </section>
    ` : ''}
    <section class="panel backup-panel">
      <h2>Mentések</h2>
      ${table([
        { label: 'Fájl', key: 'name' },
        { label: 'Típus', key: 'type' },
        { label: 'Méret', key: 'size', num: true, render: (r) => `${fmt(r.size / 1024, 1)} KB` },
        { label: 'Dátum', key: 'createdAt', render: (r) => esc(isoDate(r.createdAt)) },
        { label: 'Állapot', key: 'valid', render: (r) => r.missing ? '<span class="pill bad">Hiányzik</span>' : (r.valid ? '<span class="pill ok">OK</span>' : '<span class="pill bad">Hibás</span>') },
        ...(canExportBackup ? [{ label: '', key: 'download', render: (r) => `<button type="button" class="secondary slim" data-action="download-backup" data-backup-name="${esc(r.name)}" ${r.valid && !r.missing ? '' : 'disabled'}>Letöltés</button>` }] : []),
        ...(canRestoreBackup ? [
          { label: '', key: 'name', render: (r) => `<button type="button" class="danger slim" data-action="restore-backup" data-backup-name="${esc(r.name)}" ${r.valid && !r.missing ? '' : 'disabled'}>Restore</button>` },
        ] : []),
        ...(canDeleteBackup ? [
          { label: '', key: 'delete', render: (r) => `<button type="button" class="danger slim" data-action="delete-backup" data-backup-name="${esc(r.name)}">Törlés</button>` },
        ] : []),
      ], rows)}
    </section>
    <div id="backupMessage" class="error-text"></div>
  `);
  document.querySelectorAll('[data-backup-schedule-type]').forEach((select) => {
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function logTypeLabel(type) {
  return {
    system: 'Rendszer',
    import: 'Import',
    validation: 'Validáció',
    master: 'Törzsadat',
    admin: 'Admin',
    security: 'Biztonság',
  }[type] || type || '';
}

function logFilterText(row, key) {
  if (key === 'created_at') return isoDate(row.created_at);
  if (key === 'logType') return logTypeLabel(row.logType);
  if (key === 'companyCode') return row.companyCode || 'Globális';
  return row[key] ?? '';
}

function normalizeLogFilterText(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('hu-HU')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function logWildcardMatch(value, pattern) {
  const text = normalizeLogFilterText(value);
  const raw = normalizeLogFilterText(pattern);
  if (!raw) return true;
  if (!/[*?]/.test(raw)) return text.includes(raw);
  const escaped = raw
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i').test(text);
}

function logRowsVisible(row, filters = {}) {
  return Object.entries(filters || {}).every(([key, value]) => {
    const needle = String(value || '').trim();
    if (!needle) return true;
    return logWildcardMatch(logFilterText(row, key), needle);
  });
}

function renderLogsTable(rows = [], filters = {}) {
  const visible = rows.filter((row) => logRowsVisible(row, filters));
  const logScope = 'logs';
  const columns = applyColumnOrder(logScope, window.__logTableHeaders || []);
  const filterableColumns = new Set(['created_at', 'logType', 'companyCode', 'severity', 'username', 'module', 'action', 'details']);
  const emptyRow = `<tr><td colspan="${columns.length || 1}" class="empty">Nincs megjeleníthető napló.</td></tr>`;
  return `
    <div class="table-wrap">
      <table class="mgm-data-table stable-edit-table logs-table" data-column-scope="${logScope}" ${fixedTableStyle(columns, logScope)}>
        ${colGroup(columns, logScope)}
        <thead>
          <tr>${columns.map((column) => resizableTh(column.label, column.className || (column.num ? 'num' : ''), { scope: logScope, key: column.key, width: column.width, reorder: true })).join('')}</tr>
          <tr class="table-filter-row">
            ${columns.map((column) => {
              if (!filterableColumns.has(column.key)) return `<th class="${esc(column.className || '')}"></th>`;
              return `<th class="${esc(column.className || '')}"><input data-log-filter="${esc(column.key)}" value="${esc(filters[column.key] || '')}" placeholder="${esc(column.label)}" title="Szűrés: részlet vagy wildcard, pl. *admin*"></th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>
          ${visible.map((row) => `<tr>${columns.map((column) => `<td class="${column.num ? 'num' : (column.className || '')}">${column.render ? column.render(row) : esc(row[column.key] ?? '')}</td>`).join('')}</tr>`).join('') || emptyRow}
        </tbody>
      </table>
    </div>
  `;
}

function refreshLogsTable(source = document) {
  const root = source?.closest?.('.logs-page, .window-page, .mgm-window-content, #content') || document;
  const activeFilter = source?.matches?.('[data-log-filter]') ? source.dataset.logFilter : '';
  const selectionStart = Number.isFinite(source?.selectionStart) ? source.selectionStart : null;
  const selectionEnd = Number.isFinite(source?.selectionEnd) ? source.selectionEnd : selectionStart;
  const filters = {};
  root.querySelectorAll('[data-log-filter]').forEach((input) => {
    filters[input.dataset.logFilter] = input.value || '';
  });
  state.logFilters = filters;
  const slot = root.querySelector('[data-log-table]');
  if (slot) {
    slot.innerHTML = renderLogsTable(window.__logRows || [], filters);
    if (activeFilter) {
      const nextInput = root.querySelector(`[data-log-filter="${activeFilter}"]`);
      nextInput?.focus();
      if (Number.isFinite(selectionStart) && nextInput?.setSelectionRange) {
        nextInput.setSelectionRange(selectionStart, selectionEnd);
      }
    }
  }
}

async function renderLogs() {
  const logTypes = [
    ['all', 'Összes'],
    ['system', 'Rendszer'],
    ['import', 'Import'],
    ['validation', 'Validáció'],
    ['master', 'Törzsadat'],
    ['admin', 'Admin'],
    ['security', 'Biztonság'],
  ];
  const data = await api(`/api/logs?type=${encodeURIComponent(state.logType)}&scope=${encodeURIComponent(state.logScope)}&companyId=${encodeURIComponent(state.settings.activeCompanyId)}`);
  state.logScope = data.scope || 'company';
  const deleteToolbar = canPermission('logs', 'delete') ? `
    <div class="toolbar danger-toolbar">
      <button type="button" class="danger" data-action="delete-visible-logs">Látható naplók törlése</button>
    </div>
  ` : '';
  const scopeButtons = data.canViewAllCompanies ? `
    <div class="toolbar">
      <button type="button" class="${state.logScope === 'company' ? '' : 'secondary'}" data-log-scope="company">Aktív cég naplói</button>
      <button type="button" class="${state.logScope === 'all' ? '' : 'secondary'}" data-log-scope="all">Összes cég összes napló</button>
    </div>
  ` : '';
  const filters = state.logFilters || {};
  window.__logRows = data.rows || [];
  const logTableHeaders = [
    { label: 'Idő', key: 'created_at', width: 170, render: (r) => esc(isoDate(r.created_at)) },
    { label: 'Típus', key: 'logType', width: 130, render: (r) => esc(logTypeLabel(r.logType)) },
    { label: 'Cég', key: 'companyCode', width: 110, render: (r) => esc(r.companyCode || 'Globális') },
    { label: 'Szint', key: 'severity', width: 90 },
    { label: 'User', key: 'username', width: 120 },
    { label: 'Modul', key: 'module', width: 140 },
    { label: 'Művelet', key: 'action', width: 170 },
    { label: 'Részlet', key: 'details', width: 520 },
    ...(canPermission('logs', 'delete') ? [{ label: '', key: 'id', width: 90, render: (r) => `<button type="button" class="danger slim" data-action="delete-log-entry" data-log-id="${r.id}">Törlés</button>` }] : []),
  ];
  window.__logTableHeaders = logTableHeaders;
  content(`
    <section class="window-page logs-page">
      ${pageHead('Naplók', 'Események és audit műveletek.')}
      ${scopeButtons}
      <div class="toolbar">
        ${logTypes.map(([type, label]) => `<button type="button" class="${state.logType === type ? '' : 'secondary'}" data-log-type="${type}">${label}</button>`).join('')}
      </div>
      ${deleteToolbar}
      <div data-log-table>${renderLogsTable(window.__logRows, filters)}</div>
    </section>
  `);
}

const permissionRoleLevel = { VIEWER: 1, USER: 2, ADMIN: 3, SA: 4 };
const permissionActionLabels = {
  view: 'Megtekintés',
  import: 'Import',
  validate: 'Validálás',
  activate: 'Aktiválás',
  edit: 'Módosítás',
  delete: 'Törlés',
  export: 'Export',
  admin: 'Admin',
  restore: 'Restore',
};

function permissionRoleAllows(role, minRole) {
  return (permissionRoleLevel[role] || 0) >= (permissionRoleLevel[minRole] || 0);
}

function permissionMap(rows = [], keyFn) {
  const map = new Map();
  rows.forEach((row) => map.set(keyFn(row), row));
  return map;
}

async function renderPermissions() {
  const query = state.permissionUserId ? `?userId=${encodeURIComponent(state.permissionUserId)}` : '';
  const data = await api(`/api/admin/permissions${query}`);
  state.permissionUserId = String(data.selectedUserId || '');
  const users = data.users || [];
  const companies = data.companies || [];
  const modules = data.modules || [];
  const actions = data.actions || [];
  const selectedUser = users.find((user) => Number(user.id) === Number(data.selectedUserId)) || users[0] || {};
  const canManagePermissionMatrix = can('SA') && canPermission('permissions', 'edit');
  const readOnly = selectedUser.role === 'SA' || Number(selectedUser.id) === Number(state.user?.id) || !canManagePermissionMatrix;
  const canGrantElevated = canManagePermissionMatrix && !readOnly;
  const companyRowsSaved = (data.companyPermissions || []).length > 0;
  const companyMap = permissionMap(data.companyPermissions || [], (row) => String(row.companyId));
  const moduleMap = permissionMap(data.modulePermissions || [], (row) => `${row.moduleKey}:${row.actionKey}`);
  const userOptions = users.map((user) => `
    <option value="${esc(user.id)}" ${Number(user.id) === Number(data.selectedUserId) ? 'selected' : ''}>
      ${esc(user.displayName || user.username)} / ${esc(user.role)}
    </option>
  `).join('');
  const companyHeaders = [
    { label: 'Kód', key: 'code', width: 100 },
    { label: 'Cég', key: 'name', width: 260 },
    {
      label: 'Láthatja',
      key: 'canView',
      width: 110,
      className: 'center checkbox-cell',
      render: (company) => {
        const saved = companyMap.get(String(company.id));
        const checked = selectedUser.role === 'SA' || (!companyRowsSaved ? true : Boolean(saved?.canView || saved?.canManage));
        return `<input type="checkbox" data-company-permission="canView" ${checked ? 'checked' : ''} ${readOnly ? 'disabled' : ''}>`;
      },
    },
    {
      label: 'Kezelheti',
      key: 'canManage',
      width: 110,
      className: 'center checkbox-cell',
      render: (company) => {
        const saved = companyMap.get(String(company.id));
        const checked = selectedUser.role === 'SA' || (!companyRowsSaved ? true : Boolean(saved?.canManage));
        return `<input type="checkbox" data-company-permission="canManage" ${checked ? 'checked' : ''} ${readOnly ? 'disabled' : ''}>`;
      },
    },
  ];
  const companyRows = companies.map((company) => ({ ...company, rowAttrs: `data-permission-company data-company-id="${esc(company.id)}"` }));
  const matrixHeaders = [
    { label: 'Modul', key: 'module', width: 230, render: (module) => `<strong>${esc(module.label || module.key)}</strong><br><span class="muted">${esc(module.area || '')}</span>` },
    ...actions.map((action) => ({
      label: permissionActionLabels[action.key] || action.label || action.key,
      key: action.key,
      width: 104,
      className: 'center checkbox-cell',
      render: (module) => {
        const minRole = module.actions?.[action.key] || '';
        const available = Boolean(minRole);
        if (!available) {
          return '<span class="permission-na" title="Ez a művelet ennél a modulnál nem értelmezett">-</span>';
        }
        const roleAllowed = selectedUser.role === 'SA' || permissionRoleAllows(selectedUser.role, minRole);
        if (!roleAllowed && !canGrantElevated) {
          return `<span class="permission-role-limit" title="Minimum szerepkör: ${esc(minRole)}">${esc(minRole)}</span>`;
        }
        const saved = moduleMap.get(`${module.key}:${action.key}`);
        const checked = selectedUser.role === 'SA' || (saved ? Boolean(saved.allowed) : roleAllowed);
        const disabled = readOnly;
        const title = readOnly ? `Minimum szerepkör: ${minRole}; nem szerkeszthető ennél a felhasználónál` : `Alap minimum szerepkör: ${minRole}`;
        const input = `<input type="checkbox" data-module-permission data-module-key="${esc(module.key)}" data-action-key="${esc(action.key)}" title="${esc(title)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>`;
        if (!roleAllowed) {
          return `<span class="permission-elevated" title="${esc(title)}">${input}<span>${esc(minRole)}</span></span>`;
        }
        return input;
      },
    })),
  ];
  const note = selectedUser.role === 'SA'
    ? '<div class="notice warn">Az SA felhasználó teljes jogosultságú, a mátrix nem szűkíti.</div>'
    : (Number(selectedUser.id) === Number(state.user?.id)
      ? '<div class="notice warn">A saját jogosultsági mátrixod nem módosítható.</div>'
      : (!canManagePermissionMatrix ? '<div class="notice warn">A jogosultsági mátrix szerkesztését csak SA végezheti.</div>' : ''));
  content(`
    ${pageHead('Jogosultságok', 'Felhasználói modul- és cégjogok.')}
    <section class="panel permissions-panel">
      <form data-form="permissions-save" class="grid">
        <div class="permissions-toolbar">
          <label>Felhasználó
            <select name="permissionUserId" data-permission-user>${userOptions}</select>
          </label>
          <button type="submit" ${readOnly ? 'disabled' : ''}>Mentés</button>
        </div>
        ${note}
        <div class="permissions-grid">
          <section class="flat-panel">
            <h2>Cégszintű jogok</h2>
            ${table(companyHeaders, companyRows, 'Nincs vállalat.', { scope: 'permissions-companies', reorder: true, className: 'stable-edit-table permissions-company-table' })}
          </section>
          <section class="flat-panel">
            <h2>Modul műveletek</h2>
            ${table(matrixHeaders, modules, 'Nincs modul.', { scope: 'permissions-modules', reorder: true, className: 'stable-edit-table permissions-matrix-table' })}
          </section>
        </div>
        <div id="permissionsMessage" class="success-text"></div>
      </form>
    </section>
  `);
  document.querySelectorAll('.permissions-company-table tbody tr').forEach((row, index) => {
    const company = companies[index];
    if (!company) return;
    row.dataset.permissionCompany = '1';
    row.dataset.companyId = String(company.id);
  });
}

async function renderSettings() {
  const data = await api('/api/settings');
  const editable = Object.fromEntries(data.settings.map((row) => [row.key, row.value]));
  const timeSettings = data.timeSettings || {};
  const timeZones = data.timeZones || [];
  const smtpPasswordConfigured = Boolean(data.smtpPasswordConfigured);
  const setting = (key, fallback = '') => editable[key] ?? fallback;
  const selected = (key, value, fallback = '') => String(setting(key, fallback)) === String(value) ? 'selected' : '';
  const timeZoneOptions = timeZones
    .map((zone) => `<option value="${esc(zone.value)}" ${selected('time_timezone', zone.value, timeSettings.timezone || 'Europe/Budapest')}>${esc(zone.label)}</option>`)
    .join('');
  const general = settingsGeneralTab();
  const activeCompany = state.companies.find((company) => Number(company.id) === Number(state.settings.activeCompanyId));
  const logoPreview = activeCompany?.logoData
    ? `<img src="${esc(activeCompany.logoData)}" alt="">`
    : `<span>${esc(activeCompany?.code || 'MGM')}</span>`;
  const systemBody = `
    ${settingsHero('Rendszer', 'Globális rendszer-, biztonsági, idő- és megjelenítési beállítások.')}
    <section class="panel settings-card">
      <form data-form="settings-save" class="grid">
        <div class="settings-form-section">
          <h2>Arculat</h2>
          <div class="settings-logo-row">
            <div class="settings-logo-preview">${logoPreview}</div>
            <div>
              <p><strong>${esc(activeCompany ? `${activeCompany.code} - ${activeCompany.name}` : 'Nincs aktív vállalat')}</strong></p>
              <p class="muted">A vállalati logó és cégadatok a Vállalatok ablakban módosíthatók.</p>
              ${canPermission('companies', 'view') ? '<button type="button" class="secondary" data-page="companies">Vállalatok megnyitása</button>' : ''}
            </div>
          </div>
        </div>

        <div class="settings-form-section">
          <h2>Biztonság és munkamenet</h2>
          <div class="form-row compact">
            <label>Inaktív timeout perc <input name="session_idle_minutes" type="number" min="1" max="1440" value="${esc(editable.session_idle_minutes || 60)}"></label>
            <label>Abszolút session óra <input name="session_absolute_hours" type="number" min="1" max="720" value="${esc(editable.session_absolute_hours || 24)}"></label>
            <label>Hibás login limit <input name="login_max_failed_attempts" type="number" min="1" max="100" value="${esc(editable.login_max_failed_attempts || 5)}"></label>
            <label>Zárolás perc <input name="login_lock_minutes" type="number" min="1" max="43200" value="${esc(editable.login_lock_minutes || 15)}"></label>
            <label>Auto feloldás
              <select name="login_auto_unlock">
                <option value="1" ${selected('login_auto_unlock', '1')}>Igen</option>
                <option value="0" ${selected('login_auto_unlock', '0')}>Nem</option>
              </select>
            </label>
            <label>Jelszó min. hossz <input name="password_min_length" type="number" min="6" max="128" value="${esc(editable.password_min_length || 8)}"></label>
            <label>Jelszó komplexitás
              <select name="password_require_complexity">
                <option value="0" ${selected('password_require_complexity', '0')}>Nem kötelező</option>
                <option value="1" ${selected('password_require_complexity', '1')}>Kötelező</option>
              </select>
            </label>
          </div>
        </div>

        <div class="settings-form-section">
          <h2>Programidő</h2>
          <div class="notice">
            Programidő: <strong>${esc(timeSettings.currentDisplay || '-')}</strong>
            <span class="muted">Forrás: ${timeSettings.source === 'timeserver' ? 'Timeserver' : 'Gép órája'}; időzóna: ${esc(timeSettings.timezoneLabel || timeSettings.timezone || '-')}</span>
          </div>
          <p class="muted">A listában a Windows alapértelmezett időzónái szerepelnek. Automatikus nyári időszámításnál a rendszer a kiválasztott régió szabályait használja.</p>
          ${timeSettings.lastSyncError ? `<div class="notice bad">Utolsó timeserver hiba: ${esc(timeSettings.lastSyncError)}</div>` : ''}
          <div class="form-row compact">
            <label>Időforrás
              <select name="time_source">
                <option value="system" ${selected('time_source', 'system', 'system')}>Gép órája</option>
                <option value="timeserver" ${selected('time_source', 'timeserver', 'system')}>Timeserver</option>
              </select>
            </label>
            <label>Időzóna
              <select name="time_timezone">
                ${timeZoneOptions}
              </select>
            </label>
            <label>Nyári időszámítás
              <select name="time_dst_auto">
                <option value="1" ${selected('time_dst_auto', '1', '1')}>Automatikus</option>
                <option value="0" ${selected('time_dst_auto', '0', '1')}>Kikapcsolva</option>
              </select>
            </label>
            <label>Timeserver cím <input name="time_server_url" value="${esc(setting('time_server_url', 'https://worldtimeapi.org/api/timezone/{timezone}'))}"></label>
          </div>
          <div class="toolbar">
            <button type="button" class="secondary" data-action="sync-time-server">Idő szinkronizálása</button>
            <span class="muted">HTTP(S) idő API URL vagy NTP hostnév is megadható, például <code>0.pool.ntp.org</code>. HTTP URL-ben a <code>{timezone}</code> helyére a kiválasztott időzóna kerül. A rendszer a gép óráját nem állítja át.</span>
          </div>
          <div class="import-summary">
            <span>Utolsó szinkron: <strong>${timeSettings.lastSyncAt ? esc(isoDate(timeSettings.lastSyncAt)) : '-'}</strong></span>
            <span>Timeserver idő: <strong>${timeSettings.lastServerTime ? esc(isoDate(timeSettings.lastServerTime)) : '-'}</strong></span>
            <span>Eltérés: <strong>${fmt(Number(timeSettings.offsetMs || 0) / 1000, 3)} mp</strong></span>
          </div>
          <div id="timeSettingsMessage" class="error-text"></div>
        </div>

        <div class="settings-form-section">
          <h2>Számformátum</h2>
          <div class="form-row compact">
            <label>Ezres elválasztó
              <select name="number_thousand_separator">
                <option value="space" ${selected('number_thousand_separator', 'space')}>Szóköz</option>
                <option value="dot" ${selected('number_thousand_separator', 'dot')}>Pont</option>
                <option value="none" ${selected('number_thousand_separator', 'none')}>Nincs</option>
              </select>
            </label>
            <label>Tizedesjel
              <select name="number_decimal_separator">
                <option value="comma" ${selected('number_decimal_separator', 'comma')}>Vessző</option>
                <option value="dot" ${selected('number_decimal_separator', 'dot')}>Pont</option>
              </select>
            </label>
            <label>GL tizedes <input name="number_gl_decimals" type="number" min="0" max="6" value="${esc(editable.number_gl_decimals || 2)}"></label>
            <label>Riport tizedes <input name="number_report_decimals" type="number" min="0" max="6" value="${esc(editable.number_report_decimals || 0)}"></label>
            <label>Árfolyam tizedes <input name="number_fx_decimals" type="number" min="0" max="8" value="${esc(editable.number_fx_decimals || 4)}"></label>
            <label>Negatív szám
              <select name="number_negative_format">
                <option value="minus" ${selected('number_negative_format', 'minus')}>-1 000</option>
                <option value="parentheses" ${selected('number_negative_format', 'parentheses')}>(1 000)</option>
              </select>
            </label>
          </div>
        </div>

        <div class="toolbar">
          <button type="submit">Mentés</button>
        </div>
      </form>
      <div id="settingsMessage" class="error-text"></div>
    </section>
  `;
  const emailBody = `
    ${settingsHero('Email beállításai', 'SMTP kapcsolat és rendszerüzenetek feladója.')}
    <section class="panel settings-card">
      <form data-form="settings-save" class="grid">
        <div class="settings-form-section">
          <h2>SMTP kapcsolat</h2>
          <div class="form-row compact">
            <label>SMTP host <input name="smtp_host" value="${esc(setting('smtp_host'))}" autocomplete="off"></label>
            <label>SMTP port <input name="smtp_port" type="number" min="1" max="65535" value="${esc(setting('smtp_port', '587'))}"></label>
            <label>SMTP TLS
              <select name="smtp_tls">
                <option value="0" ${selected('smtp_tls', '0')}>Nem</option>
                <option value="1" ${selected('smtp_tls', '1')}>Igen</option>
              </select>
            </label>
            <label>SMTP user <input name="smtp_user" value="${esc(setting('smtp_user'))}" autocomplete="off"></label>
            <label>SMTP jelszó <input name="smtp_password" type="password" value="" placeholder="${esc(smtpPasswordConfigured ? 'Mentett jelszó megmarad' : 'Új SMTP jelszó')}" autocomplete="new-password"></label>
            <label>SMTP feladó <input name="smtp_from" type="email" value="${esc(setting('smtp_from'))}" autocomplete="off"></label>
          </div>
          <span class="muted">${smtpPasswordConfigured ? 'SMTP jelszó mentve; üres mezővel a mentett jelszó marad.' : 'Nincs mentett SMTP jelszó.'}</span>
        </div>
        <div class="settings-form-section">
          <h2>Email értesítések</h2>
          <label>Értesítési címzettek
            <textarea name="notification_recipients" rows="3" placeholder="email1@example.com; email2@example.com">${esc(setting('notification_recipients'))}</textarea>
          </label>
          <div class="notification-toggle-grid">
            ${[
              ['notify_backup_error', 'Backup hiba'],
              ['notify_user_lock', 'Lockolt user'],
              ['notify_restore', 'Restore'],
              ['notify_critical_import', 'Kritikus import hiba'],
              ['notify_security_event', 'Biztonsági esemény'],
            ].map(([key, label]) => `
              <label class="notification-toggle">
                <input type="hidden" name="${key}" value="0">
                <input type="checkbox" name="${key}" value="1" ${String(setting(key, '0')) === '1' ? 'checked' : ''}>
                <span>${label}</span>
              </label>
            `).join('')}
          </div>
          <div class="toolbar">
            <button type="button" class="secondary" data-action="test-notification-settings">Teszt értesítés küldése</button>
            <span class="muted">A teszt az aktuális mezőértékekkel fut, és az értesítési címzetteknek küld.</span>
          </div>
        </div>
        <div class="toolbar">
          <button type="submit">Mentés</button>
        </div>
      </form>
      <div class="settings-form-section smtp-test-section">
        <h2>Teszt email</h2>
        <div class="form-row compact">
          <label>Teszt címzett <input data-smtp-test-to type="email" value="${esc(state.user?.email || '')}" autocomplete="off"></label>
        </div>
        <div class="toolbar">
          <button type="button" class="secondary" data-action="test-email-settings">Teszt email küldése</button>
          <span class="muted">A teszt a mezők aktuális értékeivel fut. Sikeres próba után a Mentés gombbal rögzíthető a beállítás.</span>
        </div>
      </div>
      <div id="smtpTestMessage" class="error-text"></div>
      <div id="notificationTestMessage" class="error-text"></div>
      <div id="settingsMessage" class="success-text"></div>
    </section>
  `;
  const mastersBody = `
    ${settingsHero('Törzsadatok', 'Rendszerszintű legördülő listák és konfigurációk helye.')}
    <div class="settings-master-grid">
      <div class="settings-placeholder-card">
        <h2>Pénzügyi törzsek</h2>
        <p class="muted">Devizák, scenario-k és egyéb közös pénzügyi listák kerülhetnek ide.</p>
      </div>
      <div class="settings-placeholder-card">
        <h2>Biztonsági törzsek</h2>
        <p class="muted">Szerepkörök, jogosultsági mátrixok és hozzáférési profilok előkészített helye.</p>
      </div>
      <div class="settings-placeholder-card">
        <h2>Import törzsek</h2>
        <p class="muted">Import típusok, validációs szintek és későbbi közös paraméterek kezelése.</p>
      </div>
    </div>
  `;
  let labelsBody = '';
  if (general === 'labels') {
    const labelData = await api('/api/ui-labels');
    window.__uiLabels = labelData.labels || [];
    const labelScope = 'ui-labels';
    const labelColumns = applyColumnOrder(labelScope, [
      { key: 'module', label: 'Modul', width: 160, render: (row) => `<input name="module" value="${esc(row.module || '')}">` },
      { key: 'menu', label: 'Menü', width: 180, render: (row) => `<input name="menu" value="${esc(row.menu || '')}">` },
      {
        key: 'labelKey',
        label: 'Kulcs',
        width: 230,
        render: (row) => {
          const labelKey = row.labelKey || row.label_key || '';
          return `<code class="readonly-key">${esc(labelKey)}</code><input type="hidden" name="labelKey" value="${esc(labelKey)}">`;
        },
      },
      { key: 'hu', label: 'Magyar címke', width: 260, render: (row) => `<input name="hu" value="${esc(row.hu || '')}">` },
      { key: 'en', label: 'Angol címke', width: 260, render: (row) => `<input name="en" value="${esc(row.en || '')}">` },
    ]);
    labelsBody = `
      ${settingsHero('Címkék és nyelv', 'Felületi címkék, magyar és angol szövegek, valamint megjelenítési mód kezelése.')}
      <section class="panel settings-card">
        <form data-form="ui-labels-save" class="grid">
          <div class="labels-toolbar">
            <label>Nyelv
              <select name="ui_language">
                <option value="hu" ${String(labelData.settings?.uiLanguage || setting('ui_language', 'hu')) === 'hu' ? 'selected' : ''}>Magyar</option>
                <option value="en" ${String(labelData.settings?.uiLanguage || setting('ui_language', 'hu')) === 'en' ? 'selected' : ''}>English</option>
              </select>
            </label>
            <label>Megjelenítés
              <select name="ui_theme">
                <option value="light" ${String(labelData.settings?.uiTheme || setting('ui_theme', 'light')) === 'light' ? 'selected' : ''}>Nappali mód</option>
                <option value="dark" ${String(labelData.settings?.uiTheme || setting('ui_theme', 'light')) === 'dark' ? 'selected' : ''}>Éjszakai mód</option>
              </select>
            </label>
            <button type="button" class="secondary" data-action="export-ui-labels">Címkék export</button>
            <label class="file-button secondary">
              Címkék import
              <input type="file" accept=".csv,.xlsx" data-ui-label-import-file>
            </label>
            <button type="submit">Mentés</button>
          </div>
          <div class="table-wrap labels-table-wrap">
            <table class="mgm-data-table stable-edit-table labels-table" data-column-scope="${labelScope}" ${fixedTableStyle(labelColumns, labelScope)}>
              ${colGroup(labelColumns, labelScope)}
              <thead><tr>${labelColumns.map((column) => resizableTh(column.label, column.className || '', { scope: labelScope, key: column.key, width: column.width, reorder: true })).join('')}</tr></thead>
              <tbody>
                ${window.__uiLabels.map((row) => `
                  <tr data-ui-label-row data-label-id="${esc(row.id || '')}" data-label-key="${esc(row.labelKey || row.label_key || '')}" data-active="${row.active === 0 ? '0' : '1'}">
                    ${labelColumns.map((column) => `<td class="${esc(column.className || '')}">${column.render(row)}</td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div id="uiLabelsMessage" class="success-text"></div>
        </form>
      </section>
    `;
  }
  let body = '';
  if (general === 'email') body = emailBody;
  else if (general === 'masters') body = mastersBody;
  else if (general === 'labels') body = labelsBody;
  else body = systemBody;
  content(`
    ${pageHead('Beállítások', 'Rendszer- és biztonsági beállítások.')}
    <div class="settings-shell">
      ${settingsTabs()}
      <div class="settings-content">${body}</div>
    </div>
  `);
}

async function renderLicense() {
  const data = await api('/api/license');
  state.license = data.license;
  content(`
    ${pageHead('Licensz', 'Helyi HMAC alapú licenszkulcs generálás és aktiválás.')}
    <div class="grid two">
      <section class="panel">
        <h2>Aktuális licensz</h2>
        <p><strong>Státusz:</strong> ${esc(data.license.status)}</p>
        <p><strong>Cég:</strong> ${esc(data.license.companyName || '-')}</p>
        <p><strong>Lejárat:</strong> ${esc(data.license.expiresAt || '-')}</p>
        <p><strong>Hátralévő nap:</strong> ${data.license.daysLeft ?? '-'}</p>
      </section>
      <section class="panel">
        <h2>Aktiválás</h2>
        <form data-form="license-activate" class="grid">
          <label>Licenszkulcs <textarea name="licenseKey" required></textarea></label>
          <button type="submit">Aktiválás</button>
        </form>
        <div id="licenseActivateMessage" class="error-text"></div>
      </section>
    </div>
    ${canPermission('license', 'admin') ? `
      <section class="panel" style="margin-top:14px">
        <h2>Licensz generálás</h2>
        <form data-form="license-generate" class="form-row">
          <label>Cégnév <input name="companyName" required></label>
          <label>Lejárat <input name="expiresAt" type="date" required></label>
          <button type="submit">Kulcs generálás</button>
        </form>
        <div id="licenseGenerateMessage" class="success-text"></div>
      </section>
    ` : ''}
  `);
}

async function renderProfile() {
  content(`
    ${pageHead('Profil', 'Saját jelszó és fiókadatok.')}
    <div class="grid two">
      <section class="panel">
        <h2>Fiók</h2>
        <p><strong>${esc(state.user.displayName)}</strong></p>
        <p class="muted">${esc(state.user.username)} - ${esc(state.user.role)}</p>
      </section>
      <section class="panel">
        <h2>Jelszócsere</h2>
        <form data-form="password-change" class="grid">
          <label>Jelenlegi jelszó <input name="currentPassword" type="password" required></label>
          <label>Új jelszó <input name="newPassword" type="password" minlength="8" required></label>
          <button type="submit">Jelszó mentése</button>
        </form>
        <div id="profileMessage" class="error-text"></div>
      </section>
    </div>
  `);
}

    return {
      renderDashboard,
      renderReport,
      renderGlImport,
      renderFx,
      renderBudget,
      renderCompanies,
      renderUsers,
      renderSessions,
      renderBackup,
      renderLogs,
      renderSettings,
      renderPermissions,
      refreshLogsTable,
      renderLicense,
      renderProfile,
      refreshGlImportSessionsTable,
    };
  }

  window.MGM_PAGE_VIEWS = {
    createPageViews,
  };
}());
