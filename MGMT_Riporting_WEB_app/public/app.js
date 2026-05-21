const app = document.querySelector('#app');

const {
  roleLevel,
  createInitialState,
  navModules,
  iconByGlyph,
  iconByModule,
  moduleAreaCatalog,
  permissionByPage,
  permissionByAction,
} = window.MGM_CORE;
const state = createInitialState();
const {
  iconPath,
  esc,
  fmt: baseFmt,
  isoDate,
  formData,
  selectOptions,
  collectColumnMapping,
  arrayBufferToBase64,
  normalizePrefixedCodeValue,
  enforceCodePrefix,
  wildcardMatch,
} = window.MGM_UTILS;
const { createApiClient } = window.MGM_API;
const { createWindowManager } = window.MGM_WINDOWS;
const { createTableUtils } = window.MGM_TABLES;
const { createImportUi } = window.MGM_IMPORT_UI;
const { createTrialBalanceUi } = window.MGM_TRIAL_BALANCE_UI;
const { createReportStructureUi } = window.MGM_REPORT_STRUCTURE_UI;
const { createCoaUi } = window.MGM_COA_UI;
const { createShellUi } = window.MGM_SHELL_UI;
const { createPageViews } = window.MGM_PAGE_VIEWS;
const { registerEventHandlers } = window.MGM_EVENT_HANDLERS;
const { csvDownload, xlsxDownload, readImportFile: readImportFileBase } = window.MGM_FILES;
const { ribbonCatalog } = window.MGM_RIBBON;

const api = createApiClient({
  onUnauthorized: () => {
    state.user = null;
    renderLogin();
  },
});
const {
  windowLayer,
  closeWindow,
  closeAllWindows,
  closeColumnChoosers,
  bringWindowToFront,
  toggleWindowMaximize,
  openAppWindow,
  refreshWindowStatusbars,
  setWindowContent,
  setWindowMessage,
  openResultWindow,
  setupWindowDrag,
} = createWindowManager({ state, esc });
const {
  resizableTh,
  table,
  setupColumnResize,
  clearColumnWidths,
  saveColumnOrder,
  clearColumnOrder,
  applyColumnOrder,
  freezeTableColumnWidths,
  colGroup,
  fixedTableStyle,
} = createTableUtils({ esc });
setupWindowDrag(document);
setupColumnResize(document);
const readImportFile = (file) => readImportFileBase(file, { arrayBufferToBase64 });

const {
  pageHead,
  moduleHomePage,
  isModuleHomePage,
  moduleForPage,
  renderRibbon,
  renderLogin,
  bootstrap,
  renderShell,
  contextQuery,
  saveContext,
  content,
  pageWindowId,
  refreshChrome,
  openPageWindow,
  refreshPageWindow,
  refreshOpenPageWindows,
  refreshSurface,
  loadPage,
} = createShellUi({
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
  renderers: {
    dashboard: (...args) => renderDashboard(...args),
    report: (...args) => renderReport(...args),
    coa: (...args) => renderCoa(...args),
    trialbalance: (...args) => renderTrialBalance(...args),
    gl: (...args) => renderGlImport(...args),
    fx: (...args) => renderFx(...args),
    budget: (...args) => renderBudget(...args),
    companies: (...args) => renderCompanies(...args),
    users: (...args) => renderUsers(...args),
    backup: (...args) => renderBackup(...args),
    logs: (...args) => renderLogs(...args),
    settings: (...args) => renderSettings(...args),
    permissions: (...args) => renderPermissions(...args),
    sessions: (...args) => renderSessions(...args),
    license: (...args) => renderLicense(...args),
    profile: (...args) => renderProfile(...args),
  },
});

const {
  validationResultHtml,
  coaImportBasePayload,
  selectedSummaryRules,
  renderCoaUploadWindow,
  openCoaImportWindow,
  renderCoaMappingWindow,
  updateCoaMappingWindow,
  renderCoaValidationDetails,
  previewCoaImportFromWindow,
  openCoaMappingWindow,
  glImportBasePayload,
  glStatusLabel,
  glOverwriteLabel,
  glIssueLabel,
  renderGlUploadPanel,
  renderGlValidationSummary,
  renderGlMappingWindow,
  updateGlMappingWindow,
  previewGlImportFromWindow,
  openGlMappingWindow,
  openGlImportDetail,
  openMissingGlWindow,
  openSummaryRulesWindow,
} = createImportUi({
  state,
  api,
  esc,
  fmt,
  fmtGlAmount,
  isoDate,
  selectOptions,
  collectColumnMapping,
  table,
  openAppWindow,
  setWindowMessage,
  setScopedMessage,
  pageWindowId,
  canPermission,
});

const {
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
  renderLicense,
  renderProfile,
  refreshGlImportSessionsTable,
} = createPageViews({
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
});

const {
  renderTrialBalance,
  refreshTrialBalanceTable,
  trialBalanceRootFromSource,
  trialBalanceOptionalColumnKeys,
  saveTrialBalanceColumns,
  renderTrialValidationDetails,
  updateTrialValidationStatus,
  trialValidationResultFromRoot,
} = createTrialBalanceUi({
  state,
  api,
  esc,
  fmt,
  fmtAmount,
  fmtGlAmount,
  wildcardMatch,
  displayAmount,
  displayUnitLabel,
  table,
  resizableTh,
  applyColumnOrder,
  pageHead,
  contextQuery,
  content,
});

const {
  masterOptions,
  structureDef,
  openMasterDataWindow,
  openReportStructureWindow,
  openReportGroupWindow,
  openReportStructureImportWindow,
  renderReportStructureImportWindow,
  removeReportCodeGroupOptions,
  removeReportStructureCodeCache,
  saveReportCodeRow,
  saveReportGroupRow,
  reportCodeOptionalColumnKeys,
  saveReportCodeColumns,
  refreshReportCodeGrid,
  setReportCodeRowEditing,
  restoreReportCodeRow,
  reportCodeRowReady,
  focusReportCodeMissingField,
  reportCodePayload,
  setReportGroupRowEditing,
  restoreReportGroupRow,
  reportGroupRowReady,
  focusReportGroupMissingField,
  reportGroupRowPayload,
  ensureReportCodeDraftRow,
  ensureReportGroupDraftRow,
} = createReportStructureUi({
  state,
  api,
  esc,
  fmt,
  can,
  canPermission,
  selectOptions,
  resizableTh,
  applyColumnOrder,
  freezeTableColumnWidths,
  colGroup,
  fixedTableStyle,
  openAppWindow,
  setWindowMessage,
  normalizePrefixedCodeValue,
  hydrateCoaRow: (...args) => hydrateCoaRow(...args),
  refreshCoaTable: (...args) => refreshCoaTable(...args),
});

const {
  renderCoa,
  hydrateCoaRow,
  refreshCoaTable,
  selectedCoaIds,
  coaRowById,
  coaIssues,
  coaOptionalColumnKeys,
  saveCoaColumns,
  coaRootFromSource,
  saveCoaInlineRow,
  setCoaRowEditing,
  restoreCoaRow,
  openCoaEditWindow,
  openCoaBulkEditWindow,
} = createCoaUi({
  state,
  api,
  esc,
  fmt,
  table,
  resizableTh,
  applyColumnOrder,
  freezeTableColumnWidths,
  colGroup,
  fixedTableStyle,
  openAppWindow,
  openResultWindow,
  setMessage,
  masterOptions,
  pageHead,
  contextQuery,
  content,
  can,
  canPermission,
  wildcardMatch,
});

function can(minRole) {
  return roleLevel[state.user?.role] >= roleLevel[minRole];
}

function canPermission(moduleKey, actionKey = 'view') {
  if (!moduleKey) return true;
  return Boolean(state.permissions?.modules?.[moduleKey]?.[actionKey]);
}

function displayUnit() {
  const unit = String(state.settings.activeDisplayUnit || '1');
  return ['1', '1000', '1000000'].includes(unit) ? Number(unit) : 1;
}

function displayUnitLabel() {
  const unit = displayUnit();
  if (unit === 1000000) return 'millió';
  if (unit === 1000) return 'ezer';
  return '1';
}

function displayAmount(value) {
  return Number(value || 0) / displayUnit();
}

function numberSetting(key, fallback) {
  return state.settings?.[key] ?? fallback;
}

function numberDigits(key, fallback) {
  const parsed = Number(numberSetting(key, fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(8, Math.trunc(parsed)));
}

function formatNumber(value, digits = 0) {
  let n = Number(value || 0);
  if (!Number.isFinite(n)) n = 0;
  const decimals = Math.max(0, Math.min(8, Math.trunc(Number(digits) || 0)));
  if (Math.round(n * (10 ** decimals)) === 0) n = 0;

  const negative = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [rawInteger, rawFraction = ''] = fixed.split('.');
  const thousandSetting = String(numberSetting('numberThousandSeparator', 'space'));
  const decimalSetting = String(numberSetting('numberDecimalSeparator', 'comma'));
  const thousandSeparator = { space: ' ', dot: '.', none: '' }[thousandSetting] ?? ' ';
  const decimalSeparator = decimalSetting === 'dot' ? '.' : ',';
  const integer = thousandSeparator
    ? rawInteger.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator)
    : rawInteger;
  const body = decimals > 0 ? `${integer}${decimalSeparator}${rawFraction}` : integer;
  if (!negative) return body;
  return String(numberSetting('numberNegativeFormat', 'minus')) === 'parentheses' ? `(${body})` : `-${body}`;
}

function fmt(value, digits = 0) {
  if (!state.settings) return baseFmt(value, digits);
  return formatNumber(value, digits);
}

function fmtAmount(value, digits = null) {
  const decimals = digits === null ? numberDigits('numberReportDecimals', 0) : digits;
  return fmt(displayAmount(value), decimals);
}

function fmtGlAmount(value, digits = null) {
  const decimals = digits === null ? numberDigits('numberGlDecimals', 2) : digits;
  return fmt(value, decimals);
}

function fmtFx(value, digits = null) {
  const decimals = digits === null ? numberDigits('numberFxDecimals', 4) : digits;
  return fmt(value, decimals);
}

function setMessage(selector, text, ok = false) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.className = ok ? 'success-text' : 'error-text';
  el.textContent = text || '';
}

function setScopedMessage(source, selector, text, ok = false) {
  const root = source?.closest?.('.mgm-window') || document;
  const el = root.querySelector(selector) || document.querySelector(selector);
  if (!el) return;
  el.className = ok ? 'success-text' : 'error-text';
  el.textContent = text || '';
}

async function openDataAdminWindow() {
  const counts = await api('/api/admin/data-counts');
  const company = state.companies.find((c) => c.id === Number(counts.companyId || state.settings.activeCompanyId));
  const year = counts.year || state.settings.activeYear;
  openAppWindow('dataAdminWindow', 'Adatkarbantartás', `
    <section class="maintenance-scope">
      <div>
        <span class="scope-label">Hatókör</span>
        <strong>${esc(company ? `${company.code} - ${company.name}` : 'Aktív cég')}</strong>
      </div>
      <div>
        <span class="scope-label">Év</span>
        <strong>${esc(year)}</strong>
      </div>
      <p>Csak SA jogosultsággal elérhető. Ez az ablak kizárólag az aktív cég aktív évéhez tartozó adatokat törli.</p>
    </section>
    <div class="maintenance-grid">
      <label class="maintenance-tile danger-zone">
        <input type="checkbox" data-clear-table="clearCoa">
        <span>Számlatükör</span>
        <strong>${fmt(counts.chartOfAccounts)}</strong>
        <small>Aktív cég teljes COA-ja + ${fmt(counts.summaryRules)} sorszabály. Cégkódos megerősítés kell.</small>
      </label>
      <label class="maintenance-tile">
        <input type="checkbox" data-clear-table="clearGl" checked>
        <span>GL adatok</span>
        <strong>${fmt(counts.glRows)}</strong>
        <small>Főkönyvi tény/PY sorok az aktív évben. Az aktív GL importok GL-ből törölve állapotot kapnak, ha az import sessionök megmaradnak.</small>
      </label>
      <label class="maintenance-tile">
        <input type="checkbox" data-clear-table="clearBudget" checked>
        <span>Budget / Forecast</span>
        <strong>${fmt(counts.budgetRows)}</strong>
        <small>Terv és forecast sorok az aktív évben.</small>
      </label>
      <label class="maintenance-tile">
        <input type="checkbox" data-clear-table="clearImports">
        <span>Import sessionök</span>
        <strong>${fmt(counts.importSessions)}</strong>
        <small>Az aktív évhez tartozó import előzmények. Csak akkor töröld, ha az újraaktiválási előzmény sem kell.</small>
      </label>
      <label class="maintenance-tile">
        <input type="checkbox" data-clear-table="clearEventLog" checked>
        <span>Eseménynapló</span>
        <strong>${fmt(counts.eventLog)}</strong>
        <small>Rendszer, import, validáció és admin naplók az évből.</small>
      </label>
      <label class="maintenance-tile danger-zone">
        <input type="checkbox" data-clear-table="clearMasterData">
        <span>Törzsadatok</span>
        <strong>${fmt(counts.masterData)}</strong>
        <small>Riport kategóriák és konszolidált kontók az aktív cégben. Cégkódos megerősítés kell.</small>
      </label>
    </div>
    <div class="maintenance-foot">
      <div class="notice">A védett tételek nem csak éves adatokat érintenek. A számlatükör az aktív cég teljes COA-ját és a sorszabályokat, a törzsadatok az aktív cég törzsadatait törlik.</div>
      <button type="button" class="danger" data-action="run-data-clear">Kijelölt adatok törlése</button>
    </div>
    <div data-window-message class="error-text"></div>
  `, { width: 920, height: 560, preserve: true });
}

async function openValidationRulesWindow() {
  const data = await api('/api/validation-rules');
  const severityOptions = (selected) => (data.severities || ['ERROR', 'WARNING', 'INFO']).map((severity) => {
    const label = { ERROR: 'Hiba', WARNING: 'Figyelmeztetés', INFO: 'Információ' }[severity] || severity;
    return `<option value="${esc(severity)}" ${selected === severity ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
  const validationScope = 'validation-rules';
  const baseColumns = [
    {
      key: 'enabled',
      label: 'Aktív',
      width: 64,
      className: 'center checkbox-cell',
      render: (field) => `<input type="checkbox" data-validation-rule-enabled ${field.enabled ? 'checked' : ''}>`,
    },
    {
      key: 'field',
      label: 'Mező',
      width: 270,
      render: (field) => `<strong>${esc(field.label)}</strong>`,
    },
    {
      key: 'severity',
      label: 'Szint',
      width: 150,
      render: (field) => `<select data-validation-rule-severity>${severityOptions(field.severity)}</select>`,
    },
  ];
  const columns = applyColumnOrder(validationScope, baseColumns);
  const sections = Object.entries(data.scopes || {}).map(([scope, scopeData]) => `
    <section class="panel flat-panel validation-rule-section">
      <div class="panel-title">
        <strong>${esc(scopeData.label)}</strong>
        <span class="muted">${esc(scopeData.description || '')}</span>
      </div>
      <div class="table-wrap">
        <table class="mgm-data-table stable-edit-table validation-rules-table" data-column-scope="${validationScope}" ${fixedTableStyle(columns, validationScope)}>
          ${colGroup(columns, validationScope)}
          <thead><tr>${columns.map((column) => resizableTh(column.label, column.className || '', { scope: validationScope, key: column.key, width: column.width, reorder: true })).join('')}</tr></thead>
          <tbody>
            ${(scopeData.fields || []).map((field) => `
              <tr data-validation-rule-row data-scope="${esc(scope)}" data-field-key="${esc(field.key)}">
                ${columns.map((column) => `<td class="${esc(column.className || '')}">${column.render(field)}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `).join('');
  openAppWindow('validationRulesWindow', 'Validációs szabályok', `
    <section class="window-page">
      <div class="report-toolbar">
        <strong>Validációs szabályok</strong>
        <div class="actions">
          <button type="button" data-action="save-validation-rules">Mentés</button>
        </div>
      </div>
      <div class="notice">A GL importnál csak az import alapmezői számítanak. A riportkódok és BS/PL ellenőrzése a főkönyvi kivonat validációjánál fut.</div>
      <div class="validation-rule-grid">${sections}</div>
      <div data-window-message class="error-text"></div>
    </section>
  `, { width: 1160, height: 620, preserve: true });
}

registerEventHandlers({
  state,
  api,
  esc,
  fmt,
  formData,
  arrayBufferToBase64,
  collectColumnMapping,
  enforceCodePrefix,
  readImportFile,
  csvDownload,
  xlsxDownload,
  closeWindow,
  closeAllWindows,
      closeColumnChoosers,
      clearColumnWidths,
      saveColumnOrder,
      clearColumnOrder,
  bringWindowToFront,
  toggleWindowMaximize,
  openAppWindow,
  setWindowContent,
  setWindowMessage,
  openResultWindow,
  bootstrap,
  renderShell,
  renderRibbon,
  renderLogin,
  moduleHomePage,
  moduleForPage,
  isModuleHomePage,
  pageWindowId,
  loadPage,
  openPageWindow,
  refreshPageWindow,
  refreshOpenPageWindows,
  refreshSurface,
  refreshChrome,
  refreshWindowStatusbars,
  openValidationRulesWindow,
  saveContext,
  content,
  setMessage,
  setScopedMessage,
  openCoaImportWindow,
  renderCoaUploadWindow,
  renderCoaMappingWindow,
  updateCoaMappingWindow,
  renderCoaValidationDetails,
  previewCoaImportFromWindow,
  openCoaMappingWindow,
  coaImportBasePayload,
  selectedSummaryRules,
  validationResultHtml,
  renderCoa,
  hydrateCoaRow,
  refreshCoaTable,
  refreshGlImportSessionsTable,
  coaRootFromSource,
  coaOptionalColumnKeys,
  saveCoaColumns,
  saveCoaInlineRow,
  setCoaRowEditing,
  restoreCoaRow,
  openCoaEditWindow,
  openCoaBulkEditWindow,
  coaRowById,
  coaIssues,
  openSummaryRulesWindow,
  openMasterDataWindow,
  openReportStructureWindow,
  openReportGroupWindow,
  openReportStructureImportWindow,
  renderReportStructureImportWindow,
  removeReportCodeGroupOptions,
  removeReportStructureCodeCache,
  structureDef,
  reportCodeOptionalColumnKeys,
  saveReportCodeColumns,
  refreshReportCodeGrid,
  reportCodePayload,
  reportCodeRowReady,
  focusReportCodeMissingField,
  saveReportCodeRow,
  ensureReportCodeDraftRow,
  restoreReportCodeRow,
  setReportCodeRowEditing,
  reportGroupRowPayload,
  reportGroupRowReady,
  focusReportGroupMissingField,
  saveReportGroupRow,
  ensureReportGroupDraftRow,
  restoreReportGroupRow,
  setReportGroupRowEditing,
  glImportBasePayload,
  renderGlMappingWindow,
  updateGlMappingWindow,
  renderGlValidationSummary,
  previewGlImportFromWindow,
  openGlMappingWindow,
  openGlImportDetail,
  openMissingGlWindow,
  glStatusLabel,
  glIssueLabel,
  renderGlUploadPanel,
  trialBalanceRootFromSource,
  trialBalanceOptionalColumnKeys,
  saveTrialBalanceColumns,
  refreshTrialBalanceTable,
  renderTrialValidationDetails,
  updateTrialValidationStatus,
  trialValidationResultFromRoot,
});

(async function init() {
  try {
    const me = await api('/api/auth/me');
    if (!me.user) {
      renderLogin();
      return;
    }
    await bootstrap();
    renderShell();
  } catch {
    renderLogin();
  }
})();








