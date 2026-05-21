(function () {
  function createShellUi(deps) {
    const {
      state,
      app,
      api,
      navModules,
      iconByGlyph,
      iconByModule,
      moduleAreaCatalog,
      ribbonCatalog,
      iconPath,
      esc,
      can,
      canPermission,
      permissionByPage,
      permissionByAction,
      openAppWindow,
      openDataAdminWindow,
      refreshWindowStatusbars,
      renderers,
    } = deps;

function pageHead(title, subtitle, action = '') {
  return `
    <div class="page-head">
      <div>
        <h1>${esc(title)}</h1>
        <p>${esc(subtitle)}</p>
      </div>
      <div class="actions">${action}</div>
    </div>
  `;
}

function moduleHomePage(moduleId) {
  return `module:${moduleId}`;
}

function moduleIdFromPage(page = state.page) {
  return String(page || '').startsWith('module:') ? String(page).slice('module:'.length) : '';
}

function isModuleHomePage(page = state.page) {
  return Boolean(moduleIdFromPage(page));
}

function hasOwn(map, key) {
  return Object.prototype.hasOwnProperty.call(map || {}, key);
}

function canPage(page) {
  if (!hasOwn(permissionByPage, page)) return true;
  const permission = permissionByPage[page];
  if (!permission) return true;
  return canPermission(permission[0], permission[1]);
}

function canActionItem(action) {
  if (!hasOwn(permissionByAction, action)) return true;
  const permission = permissionByAction[action];
  if (!permission) return true;
  return canPermission(permission[0], permission[1]);
}

function navItemVisible(item) {
  const [page, _label, minRole] = item;
  if (hasOwn(permissionByPage, page)) return canPage(page);
  return !minRole || can(minRole);
}

function ribbonButtonVisible(button) {
  if (button.page && hasOwn(permissionByPage, button.page)) return canPage(button.page);
  if (button.action && hasOwn(permissionByAction, button.action)) return canActionItem(button.action);
  return !button.minRole || can(button.minRole);
}

function moduleAreaItemVisible(item) {
  if (item.page && hasOwn(permissionByPage, item.page)) return canPage(item.page);
  if (item.action && hasOwn(permissionByAction, item.action)) return canActionItem(item.action);
  return !item.minRole || can(item.minRole);
}

function currentPageLabel() {
  const moduleId = moduleIdFromPage();
  if (moduleId) return visibleModules().find((module) => module.id === moduleId)?.label || 'Modul';
  for (const group of navModules) {
    const item = group.items.find(([id]) => id === state.page);
    if (item) return item[1];
  }
  return 'Áttekintés';
}

function visibleModules() {
  return navModules.map((module) => ({
    ...module,
    items: module.items.filter(navItemVisible),
  })).filter((module) => module.items.length);
}

function moduleForPage(page = state.page) {
  const moduleId = moduleIdFromPage(page);
  if (moduleId) return visibleModules().find((module) => module.id === moduleId);
  return visibleModules().find((module) => module.items.some(([id]) => id === page));
}

function activeNavModule() {
  const modules = visibleModules();
  const current = modules.find((module) => module.id === state.activeModule) || moduleForPage() || modules[0];
  if (current) state.activeModule = current.id;
  return current;
}

function currentCompanyCode() {
  return state.companies.find((c) => c.id === Number(state.settings.activeCompanyId))?.code || 'MGM';
}

function currentCompany() {
  return state.companies.find((c) => c.id === Number(state.settings.activeCompanyId));
}

function currentDisplayUnitLabel() {
  const unit = String(state.settings.activeDisplayUnit || '1');
  if (unit === '1000000') return 'millió';
  if (unit === '1000') return 'ezer';
  return '1';
}

function renderStatusOption(contextKey, value, label, active = false) {
  return `
    <button type="button" class="status-option ${active ? 'active' : ''}" data-status-option data-status-context="${esc(contextKey)}" data-value="${esc(value)}">
      ${esc(label)}
    </button>
  `;
}

function renderStatusOptions(menu) {
  if (menu === 'company') {
    return state.companies.map((company) => renderStatusOption(
      'activeCompanyId',
      company.id,
      `${company.code} - ${company.name}`,
      Number(state.settings.activeCompanyId) === company.id,
    )).join('');
  }
  if (menu === 'currency') {
    return ['HUF', 'EUR', 'USD', 'CHF', 'GBP'].map((currency) => renderStatusOption(
      'activeCurrency',
      currency,
      currency,
      state.settings.activeCurrency === currency,
    )).join('');
  }
  if (menu === 'fx') {
    return ['FX1', 'FX2'].map((mode) => renderStatusOption(
      'activeFxMode',
      mode,
      mode,
      state.settings.activeFxMode === mode,
    )).join('');
  }
  if (menu === 'unit') {
    return [
      ['1', '1'],
      ['1000', 'ezer'],
      ['1000000', 'millió'],
    ].map(([value, label]) => renderStatusOption(
      'activeDisplayUnit',
      value,
      label,
      String(state.settings.activeDisplayUnit || '1') === value,
    )).join('');
  }
  return '';
}

function renderStatusChip(menu, label, value) {
  const open = state.statusMenu === menu;
  return `
    <span class="status-chip-wrap">
      <button type="button" class="status-chip ${open ? 'active' : ''}" data-status-menu="${esc(menu)}">
        <span>${esc(label)}</span><strong>${esc(value)}</strong>
      </button>
      ${open ? `<div class="status-popover">${renderStatusOptions(menu)}</div>` : ''}
    </span>
  `;
}

function renderStatusBar() {
  const company = currentCompany();
  return `
    <div class="statusbar-inner">
      ${renderStatusChip('company', 'Cég', company ? `${company.code} - ${company.name}` : '')}
      ${renderStatusChip('currency', 'Deviza', state.settings.activeCurrency || '')}
      ${renderStatusChip('fx', 'FX mód', state.settings.activeFxMode || '')}
      ${renderStatusChip('unit', 'Egység', currentDisplayUnitLabel())}
      <span id="statusPage" class="status-chip display"><span>Oldal</span><strong>${esc(currentPageLabel())}</strong></span>
      <span class="status-spacer"></span>
      <span class="status-chip display user"><span>Felhasználó</span><strong>${esc(state.user.displayName)} / ${esc(state.user.role)}</strong></span>
    </div>
  `;
}

function pageRibbonDefinition() {
  if (isModuleHomePage()) {
    const module = activeNavModule();
    return {
      area: module?.label || 'Modul',
      path: ['MGM Reporting', module?.label || 'Modul'],
      tabs: [
        { id: 'module', label: module?.label || 'Modul', groups: [
          { label: 'Navigáció', buttons: (module?.items || []).map(([page, label]) => ({
            label,
            page,
            glyph: ({ dashboard: 'RP', report: 'RP', coa: 'SZ', gl: 'GL', fx: 'FX', budget: 'BD', companies: 'CE', users: 'FE', sessions: 'SE', backup: 'BK', logs: 'NA', settings: 'BE', permissions: 'JO', license: 'LC', profile: 'JC' }[page]) || 'RP',
          })) },
        ] },
      ],
    };
  }
  return ribbonCatalog[state.page] || ribbonCatalog.dashboard;
}

function visibleRibbonTabs(definition = pageRibbonDefinition()) {
  return definition.tabs
    .map((tab) => ({
      ...tab,
      groups: tab.groups
        .map((group) => ({
          ...group,
          buttons: group.buttons.filter(ribbonButtonVisible),
        }))
        .filter((group) => group.buttons.length),
    }))
    .filter((tab) => tab.groups.length);
}

function activeRibbonTab(tabs) {
  if (!tabs.length) return null;
  const selected = tabs.find((tab) => tab.id === state.ribbonTab);
  if (selected) return selected;
  state.ribbonTab = tabs[0].id;
  return tabs[0];
}

function renderRibbonButton(button) {
  const icon = button.icon || iconByGlyph[button.glyph] || 'apps.svg';
  const attrs = [
    'class="mgm-ribbon-button"',
    `data-glyph="${esc(button.glyph || '')}"`,
    `title="${esc(button.label)}"`,
  ];
  if (button.page) attrs.push(`data-page="${esc(button.page)}"`);
  if (button.action) attrs.push(`data-action="${esc(button.action)}"`);
  if (button.target) attrs.push(`data-target="${esc(button.target)}"`);
  return `
    <button ${attrs.join(' ')}>
      <span class="mgm-ribbon-icon"><img src="${esc(iconPath(icon))}" alt=""></span>
      <span class="mgm-ribbon-text">${esc(button.label)}</span>
    </button>
  `;
}

function renderContextBar() {
  return '';
}

function renderRibbon() {
  return '';
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-page">
      <section class="login-panel">
        <div class="brand-mark">M</div>
        <h1>MGM Reporting</h1>
        <p class="muted">Helyi hálózaton futó konszolidációs és riportáló rendszer.</p>
        <form data-form="login" class="grid" style="margin-top:24px">
          <label>Felhasználónév <input name="username" autocomplete="username" value="admin" required></label>
          <label>Jelszó <input name="password" type="password" autocomplete="current-password" value="Admin123!" required></label>
          <button type="submit">Belépés</button>
          <div id="loginMessage" class="error-text"></div>
        </form>
        <div class="notice warn">
          Első indításkor az alap belépés: <strong>admin / Admin123!</strong>. Éles használat előtt cseréld le.
        </div>
      </section>
      <section class="login-aside">
        <div>
          <h1>Konszolidált riportok egy helyi szerveren.</h1>
          <p>GL import, számlatükör, árfolyam, budget, forecast, admin naplók és backup egy böngészőből.</p>
        </div>
      </section>
    </main>
  `;
}

async function bootstrap() {
  const data = await api('/api/bootstrap');
  state.user = data.user;
  state.companies = data.companies;
  state.settings = data.settings;
  state.permissions = data.permissions || { modules: {} };
  window.MGM_TIME_SETTINGS = data.timeSettings || data.settings?.timeSettings || {};
  state.license = data.license;
  applyUiTheme();
}

function applyUiTheme() {
  const theme = state.settings?.uiTheme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme;
}

function renderSidebarNavigation() {
  const activeModule = activeNavModule();
  document.querySelectorAll('.module-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.module === activeModule?.id);
  });
}

function renderShell() {
  const modules = visibleModules();
  const firstModule = modules[0] || null;
  state.activeModule = canPage('dashboard') ? 'home' : (firstModule?.id || 'account');
  state.page = canPage('dashboard') ? 'dashboard' : moduleHomePage(state.activeModule);
  history.replaceState(null, '', `#${state.page}`);
  const activeModule = activeNavModule();

  app.innerHTML = `
    <div class="shell ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''}">
      <header class="mgm-chrome">
        <div class="mgm-titlebar">
          <strong>MGM Reporting</strong>
          <span>${esc(state.user.displayName)} / ${esc(state.user.role)}</span>
        </div>
      </header>
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="sidebar-logo" aria-hidden="true">M</div>
          <div class="sidebar-brand-text">
            <strong>MGM Reporting</strong>
            <span>Multi-Company</span>
          </div>
          <button type="button" class="sidebar-toggle" data-action="toggle-sidebar" title="${state.sidebarCollapsed ? 'Menü kinyitása' : 'Menü becsukása'}">
            ${state.sidebarCollapsed ? '›' : '‹'}
          </button>
        </div>
        <div class="sidebar-heading">Főmenü</div>
        <div class="module-dock">
          ${modules.map((module) => `
            <button type="button" class="module-button ${activeModule?.id === module.id ? 'active' : ''}" data-module="${esc(module.id)}">
              <span class="module-glyph"><img src="${esc(iconPath(iconByModule[module.id] || 'apps.svg'))}" alt=""></span>
              <span class="module-label">${esc(module.label)}</span>
            </button>
          `).join('')}
        </div>
      </aside>
      <main class="main">
        <section id="content" class="content"></section>
        <footer id="globalStatusbar" class="statusbar">${renderStatusBar()}</footer>
      </main>
      <div id="windowLayer" class="window-layer"></div>
    </div>
  `;
  loadPage();
}

function contextQuery() {
  const s = state.settings;
  return `companyId=${encodeURIComponent(s.activeCompanyId)}&year=${encodeURIComponent(s.activeYear)}&period=${encodeURIComponent(s.activePeriod)}&currency=${encodeURIComponent(s.activeCurrency)}&fxMode=${encodeURIComponent(s.activeFxMode)}`;
}

async function saveContext() {
  await api('/api/settings/context', {
    method: 'POST',
    body: JSON.stringify({
      active_company_id: state.settings.activeCompanyId,
      active_year: state.settings.activeYear,
      active_period: state.settings.activePeriod,
      active_currency: state.settings.activeCurrency,
      active_fx_mode: state.settings.activeFxMode,
      active_display_unit: state.settings.activeDisplayUnit,
    }),
  });
}

function content(html) {
  const target = document.querySelector(state.contentTarget || '#content');
  if (target) target.innerHTML = html;
}

async function withContentTarget(selector, task) {
  const previous = state.contentTarget;
  state.contentTarget = selector;
  try {
    return await task();
  } finally {
    state.contentTarget = previous;
  }
}

function pageRenderers() {
  return renderers || {};
}

const pageWindowOptions = {
  dashboard: { title: 'Áttekintés', width: 1180, height: 720 },
  report: { title: 'Riport', width: 1280, height: 760 },
  coa: { title: 'Számlatükör', width: 1220, height: 720 },
  trialbalance: { title: 'Főkönyvi kivonat', width: 1760, height: 820 },
  gl: { title: 'GL import', width: 1120, height: 700 },
  fx: { title: 'Árfolyamok', width: 980, height: 640 },
  budget: { title: 'Budget / Forecast', width: 1120, height: 700 },
  companies: { title: 'Cégek', width: 1180, height: 620 },
  users: { title: 'Felhasználók', width: 1240, height: 650 },
  sessions: { title: 'Munkamenetek', width: 1280, height: 680 },
  backup: { title: 'Backup', width: 900, height: 560 },
  logs: { title: 'Naplók', width: 1260, height: 720 },
  settings: { title: 'Beállítások', width: 1040, height: 660 },
  permissions: { title: 'Jogosultságok', width: 1280, height: 720 },
  license: { title: 'Licensz', width: 1040, height: 650 },
  profile: { title: 'Profil', width: 840, height: 520 },
};

function pageWindowId(page) {
  return `pageWindow_${String(page || '').replace(/[^a-z0-9_-]/gi, '_')}`;
}

async function renderPageToTarget(page, targetSelector) {
  const renderer = pageRenderers()[page];
  if (!renderer) return false;
  await withContentTarget(targetSelector, renderer);
  return true;
}

async function renderWorkspaceModuleArea() {
  await withContentTarget('#content', renderModuleArea);
}

function refreshChrome() {
  renderSidebarNavigation();
  const statusbar = document.querySelector('#globalStatusbar');
  if (statusbar) statusbar.innerHTML = renderStatusBar();
  refreshWindowStatusbars?.();
}

async function openPageWindow(page, optionsOverride = {}) {
  if (!canPage(page)) {
    content(`<div class="notice bad">Nincs jogosultságod ehhez a funkcióhoz.</div>`);
    return;
  }
  if (page === 'dashboard') {
    state.page = 'dashboard';
    state.activeModule = 'home';
    state.ribbonTab = null;
    history.replaceState(null, '', '#dashboard');
    refreshChrome();
    await renderPageToTarget('dashboard', '#content');
    return;
  }
  state.page = page;
  state.activeModule = moduleForPage(page)?.id || state.activeModule;
  state.ribbonTab = null;
  history.replaceState(null, '', `#${page}`);
  if (optionsOverride.renderWorkspace !== false) {
    await renderWorkspaceModuleArea();
  }
  refreshChrome();

  if (page === 'dataadmin') {
    await openDataAdminWindow();
    return;
  }
  const renderer = pageRenderers()[page];
  if (!renderer) return;
  const options = pageWindowOptions[page] || { title: currentPageLabel(), width: 980, height: 620 };
  const id = pageWindowId(page);
  openAppWindow(id, options.title, '', {
    width: options.width,
    height: options.height,
    preserve: true,
    page,
  });
  await renderPageToTarget(page, `#${id} .mgm-window-content`);
}

async function refreshPageWindow(page) {
  const id = pageWindowId(page);
  const win = document.querySelector(`#${id}`);
  if (!win) return false;
  await renderPageToTarget(page, `#${id} .mgm-window-content`);
  return true;
}

async function refreshOpenPageWindows() {
  const windows = Array.from(document.querySelectorAll('.mgm-window[data-page-window]'));
  for (const win of windows) {
    await renderPageToTarget(win.dataset.pageWindow, `#${win.id} .mgm-window-content`);
  }
}

async function refreshSurface(source, page) {
  const win = source?.closest?.('.mgm-window');
  if (win?.dataset.pageWindow === page) {
    await renderPageToTarget(page, `#${win.id} .mgm-window-content`);
    return;
  }
  if (await refreshPageWindow(page)) return;
  await loadPage();
}

async function loadPage() {
  const pageModule = moduleForPage();
  if (pageModule) state.activeModule = pageModule.id;
  refreshChrome();
  const pages = pageRenderers();
  try {
    if (state.page === 'dashboard') {
      await (pages.dashboard || renderDashboard)();
    } else if (isModuleHomePage()) {
      await renderModuleArea();
    } else if (pages[state.page] || state.page === 'dataadmin') {
      state.page = 'dashboard';
      state.activeModule = 'home';
      history.replaceState(null, '', '#dashboard');
      refreshChrome();
      await (pages.dashboard || renderDashboard)();
    } else {
      state.page = 'dashboard';
      state.activeModule = 'home';
      history.replaceState(null, '', `#${state.page}`);
      await (pages.dashboard || renderDashboard)();
    }
  } catch (err) {
    content(`<div class="notice bad">${esc(err.message)}</div>`);
  }
}

async function renderModuleArea() {
  const activeModule = activeNavModule();
  const groups = (moduleAreaCatalog[activeModule?.id] || [])
    .map((group) => ({
      ...group,
      items: group.items.filter(moduleAreaItemVisible),
    }))
    .filter((group) => group.items.length);
  content(`
    <section class="module-area">
      <header class="module-area-head">
        <div>
          <h1>${esc(activeModule?.label || 'Modul')}</h1>
          <p>Válassz funkciót a modulon belül.</p>
        </div>
      </header>
      <div class="module-area-grid">
        ${groups.map((group) => `
          <section class="module-card">
            <header>
              <span>${esc(group.title)}</span>
            </header>
            <div class="module-card-list">
              ${group.items.map((item) => {
                const icon = iconByGlyph[item.glyph] || 'apps.svg';
                const attrs = [];
                if (item.page) attrs.push(`data-page="${esc(item.page)}"`);
                if (item.action) attrs.push(`data-action="${esc(item.action)}"`);
                return `
                  <button type="button" class="module-link" ${attrs.join(' ')}>
                    <span class="module-link-icon"><img src="${esc(iconPath(icon))}" alt=""></span>
                    <span>
                      <strong>${esc(item.label)}</strong>
                      <small>${esc(item.description || '')}</small>
                    </span>
                  </button>
                `;
              }).join('')}
            </div>
          </section>
        `).join('')}
      </div>
    </section>
  `);
}

    return {
      pageHead,
      moduleHomePage,
      moduleIdFromPage,
      isModuleHomePage,
      currentPageLabel,
      visibleModules,
      moduleForPage,
      activeNavModule,
      currentCompanyCode,
      pageRibbonDefinition,
      visibleRibbonTabs,
      activeRibbonTab,
      renderRibbonButton,
      renderContextBar,
      renderStatusBar,
      renderRibbon,
      renderLogin,
      bootstrap,
      renderSidebarNavigation,
      renderShell,
      contextQuery,
      saveContext,
      content,
      withContentTarget,
      pageWindowId,
      renderPageToTarget,
      refreshChrome,
      openPageWindow,
      refreshPageWindow,
      refreshOpenPageWindows,
      refreshSurface,
      loadPage,
      renderModuleArea,
    };
  }

  window.MGM_SHELL_UI = {
    createShellUi,
  };
}());
