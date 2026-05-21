(function () {
  function createImportUi(deps) {
    const {
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
    } = deps;

function validationResultHtml(stats = {}) {
  return `
    <div class="import-summary">
      <span>Összes sor: <strong>${fmt(stats.total)}</strong></span>
      <span>Felismerhető: <strong>${fmt(stats.recognized)}</strong></span>
      <span>Importálható: <strong>${fmt(stats.importable)}</strong></span>
      <span>Összesítőként kihagyva: <strong>${fmt(stats.skippedSummary)}</strong></span>
      <span>Inaktívként kihagyva: <strong>${fmt(stats.skippedInactive)}</strong></span>
      <span>Üres / hibás: <strong>${fmt(stats.skippedBlank)}</strong></span>
    </div>
    ${stats.importable ? '<div class="notice">A validáció lefutott, az import indítható.</div>' : '<div class="notice bad">Nincs importálható sor. Ellenőrizd a megfeleltetést és a szabályokat.</div>'}
  `;
}

function renderCoaInlineValidationStatus(preview = {}) {
  const stats = preview.stats || {};
  const fileErrors = preview.fileErrors || [];
  const warnings = preview.warnings || [];
  if (fileErrors.length) {
    return `
      <div class="inline-validation bad">
        <strong>Validációs hiba.</strong>
        <span>${fmt(fileErrors.length)} fájlhiba miatt az import nem indítható.</span>
        <button type="button" class="secondary slim" data-action="open-coa-validation-details">Részletek</button>
      </div>
    `;
  }
  if (warnings.length) {
    return `
      <div class="inline-validation warn">
        <strong>Validálva, importálható.</strong>
        <span>${fmt(warnings.length)} figyelmeztetés.</span>
        <button type="button" class="secondary slim" data-action="open-coa-validation-details">Részletek</button>
      </div>
    `;
  }
  if (stats.importable) {
    return '<div class="inline-validation ok"><strong>Validálva, importálható.</strong></div>';
  }
  return '<div class="inline-validation warn"><strong>Nincs importálható sor.</strong></div>';
}

function renderCoaValidationDetails(preview = {}) {
  const fileErrors = preview.fileErrors || [];
  const warnings = preview.warnings || [];
  const rows = [
    ...fileErrors.map((item) => ({ ...item, level: 'Hiba' })),
    ...warnings.map((item) => ({ ...item, level: 'Figyelmeztetés' })),
  ];
  return table([
    { label: 'Szint', key: 'level' },
    { label: 'Sor', key: 'row', num: true },
    { label: 'GL szám', key: 'glNumber' },
    { label: 'GL név', key: 'glName' },
    { label: 'Üzenet', key: 'message' },
  ], rows, 'Nincs validációs hiba vagy figyelmeztetés.');
}

function previewNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  let text = raw.replace(/\u00a0/g, '').replace(/\s/g, '');
  let sign = 1;
  if (/^\(.*\)$/.test(text)) {
    sign = -1;
    text = text.slice(1, -1);
  }
  if (text.startsWith('-')) {
    sign *= -1;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  const separators = [lastComma, lastDot].filter((idx) => idx >= 0);
  let decimalSep = '';
  if (separators.length >= 2) {
    decimalSep = lastComma > lastDot ? ',' : '.';
  } else if (separators.length === 1) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = text.split(sep);
    decimalSep = parts.length === 2 && parts[1].length !== 3 ? sep : '';
  }
  const normalized = decimalSep
    ? text.replaceAll(decimalSep === ',' ? '.' : ',', '').replace(decimalSep, '.')
    : text.replace(/[,.]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed * sign : null;
}

function renderMappedPreviewTable(columns = [], rows = [], mapping = {}, options = {}) {
  if (!rows.length) return '<div class="table-wrap import-preview-wrap"><div class="empty">Nincs előnézeti sor.</div></div>';
  const mappedColumns = new Set(Object.values(mapping || {}).filter(Boolean));
  const numericColumns = new Set((options.numericFields || [])
    .map((field) => mapping?.[field])
    .filter(Boolean));
  const normalizedAmountHeaders = new Set([
    'tforg',
    'kforg',
    'tegy',
    'kegy',
    'egyenleg',
    'balance',
    'amount',
    'tartozik',
    'kovetel',
    'követel',
    'debit',
    'credit',
  ]);
  if (options.autoNumeric) {
    columns.forEach((column) => {
      const normalized = String(column || '').trim().toLocaleLowerCase('hu-HU');
      if (normalizedAmountHeaders.has(normalized)) numericColumns.add(column);
    });
  }
  const cellValue = (column, row) => {
    const raw = row[column];
    if (!numericColumns.has(column)) return esc(raw);
    const parsed = previewNumber(raw);
    return parsed === null ? esc(raw) : (fmtGlAmount ? fmtGlAmount(parsed) : fmt(parsed, 2));
  };
  return `
    <div class="table-wrap import-preview-wrap">
      <table class="mgm-data-table">
        <thead><tr>${columns.map((column) => `<th class="${mappedColumns.has(column) ? 'mapped-import-column' : ''}">${esc(column)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${columns.map((column) => `<td class="${mappedColumns.has(column) ? 'mapped-import-column' : ''} ${numericColumns.has(column) ? 'num' : ''}">${cellValue(column, row)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function coaImportBasePayload() {
  return {
    importType: 'coa',
    fileName: state.coaImportFile?.fileName || '',
    fileType: state.coaImportFile?.fileType || '',
    fileData: state.coaImportFile?.fileData || '',
    csvText: state.coaImportFile?.csvText || '',
  };
}

function selectedSummaryRules(scope = 'coa-window') {
  const ids = Array.from(document.querySelectorAll(`[data-rule-scope="${scope}"]:checked`)).map((input) => Number(input.value));
  return state.summaryRules
    .filter((rule) => ids.includes(Number(rule.id)))
    .map((rule) => ({ ...rule, enabled: true }));
}

function renderCoaUploadWindow() {
  const file = state.coaImportFile;
  return `
    <div class="dropzone ${file ? 'ready' : ''}" data-dropzone="coa" data-action="choose-coa-file">
      <input type="file" accept=".xlsx,.csv,.txt" data-coa-file-picker hidden>
      <strong>${file ? esc(file.fileName) : 'Dobd ide a számlatükör fájlt'}</strong>
      <span>${file ? 'A fájl készen áll a megfeleltetésre.' : 'Kattintással tallózó ablak nyílik.'}</span>
    </div>
    <div class="actions" style="justify-content:flex-start;margin-top:10px">
      <button type="button" data-action="choose-coa-file">Fájl kiválasztása</button>
      <button type="button" data-action="open-coa-mapping-window" ${file ? '' : 'disabled'}>Import</button>
    </div>
    <div data-window-message class="error-text"></div>
  `;
}

function openCoaImportWindow(reset = true) {
  if (reset) {
    state.coaImportFile = null;
    state.coaImportPreview = null;
  }
  openAppWindow('coaImportWindow', 'Számlatükör import', renderCoaUploadWindow(), { width: 620, height: 330 });
}

function renderTemplateOptions(selectedId = '') {
  return [
    '<option value="">- nincs template -</option>',
    ...state.importTemplates.map((tpl) => `<option value="${tpl.id}" ${String(tpl.id) === String(selectedId) ? 'selected' : ''}>${esc(tpl.name)}</option>`),
  ].join('');
}

function renderRuleCheckboxes(selectedIds = null) {
  const selected = new Set((selectedIds || []).map(Number));
  return state.summaryRules.map((rule) => `
    <label class="checkline">
      <input type="checkbox" data-rule-scope="coa-window" value="${rule.id}" ${selectedIds === null ? (rule.active ? 'checked' : '') : (selected.has(Number(rule.id)) ? 'checked' : '')}>
      <span class="badge ${rule.ruleType === 'inactive' ? 'warn' : ''}">${rule.ruleType === 'inactive' ? 'Inaktív' : 'Összesítő'}</span>
      ${esc(rule.name)} <span class="muted">(${esc(rule.columnName || rule.column)} ${esc(rule.operator)} ${esc(rule.matchValue || rule.value)})</span>
    </label>
  `).join('') || '<p class="muted">Még nincs sorszabály.</p>';
}

function renderCoaImportSummary(preview = {}) {
  const stats = preview.stats || {};
  return `
    <div class="import-summary" style="margin-top:8px" data-coa-import-summary>
      <span>Összes sor: <strong>${fmt(stats.total)}</strong></span>
      <span>Felismerhető: <strong>${fmt(stats.recognized)}</strong></span>
      <span>Importálható: <strong>${fmt(stats.importable)}</strong></span>
      <span>Inaktív: <strong>${fmt(stats.inactive)}</strong></span>
      <span>Összesítő: <strong>${fmt(stats.summary)}</strong></span>
      <span>Kimaradó inaktív: <strong>${fmt(stats.skippedInactive)}</strong></span>
      <span>Fájlhiba: <strong>${fmt(stats.fileErrors)}</strong></span>
      <span>Figyelmeztetés: <strong>${fmt(stats.warnings)}</strong></span>
    </div>
  `;
}

function renderCoaPreviewSlot(preview = {}) {
  const columns = preview.columns || [];
  const mapping = preview.mapping || preview.autoMapping || {};
  return `<div data-coa-preview-table>${renderMappedPreviewTable(columns, preview.sampleRows || [], mapping)}</div>`;
}

function updateCoaMappingWindow(preview, selectedTemplateId = '', overrides = {}) {
  const win = document.querySelector('#coaMappingWindow');
  if (!win) return false;
  const validationSlot = win.querySelector('[data-coa-validation-status]');
  const summarySlot = win.querySelector('[data-coa-import-summary]');
  const previewSlot = win.querySelector('[data-coa-preview-table]');
  const previewWrap = previewSlot?.querySelector('.import-preview-wrap');
  const previewScroll = previewWrap ? { left: previewWrap.scrollLeft, top: previewWrap.scrollTop } : null;
  if (validationSlot) validationSlot.innerHTML = renderCoaInlineValidationStatus(preview);
  if (summarySlot) summarySlot.outerHTML = renderCoaImportSummary(preview);
  if (previewSlot) previewSlot.outerHTML = renderCoaPreviewSlot(preview);
  if (previewScroll) {
    const nextWrap = win.querySelector('[data-coa-preview-table] .import-preview-wrap');
    if (nextWrap) {
      nextWrap.scrollLeft = previewScroll.left;
      nextWrap.scrollTop = previewScroll.top;
    }
  }
  return Boolean(validationSlot || summarySlot || previewSlot);
}

function renderCoaMappingWindow(preview, selectedTemplateId = '', overrides = {}) {
  const columns = preview.columns || [];
  const mapping = preview.mapping || preview.autoMapping || {};
  const selectedTemplate = state.importTemplates.find((tpl) => String(tpl.id) === String(selectedTemplateId));
  const selectedRuleIds = overrides.selectedRuleIds !== undefined ? overrides.selectedRuleIds : (selectedTemplate ? selectedTemplate.selectedRuleIds : null);
  return `
    <div class="form-row compact">
      <label>Template
        <select data-template-select="coa">${renderTemplateOptions(selectedTemplateId)}</select>
      </label>
      <label>Template név <input data-template-name value="${esc(selectedTemplate?.name || '')}" placeholder="pl. számlatükör import"></label>
      <button type="button" data-action="save-import-template">Template mentése</button>
      <button type="button" data-action="validate-coa-import">Validáció frissítése</button>
      <button type="button" data-action="run-coa-import">Import indítása</button>
    </div>
    <div data-coa-validation-status>${renderCoaInlineValidationStatus(preview)}</div>
    ${renderCoaImportSummary(preview)}
    <div class="window-grid two" style="margin-top:8px">
      <section>
        <h3 class="subhead">Oszlop megfeleltetés</h3>
        <div class="table-wrap import-mapping">
          <table>
            <thead><tr><th>Program oszlop</th><th>Import fájl oszlopa</th></tr></thead>
            <tbody>
              ${preview.fields.map((field) => `
                <tr>
                  <td>${esc(field.label)}${field.required ? ' *' : ''}</td>
                  <td><select data-map-scope="coa-window" data-map-target="${esc(field.key)}">${selectOptions(columns, mapping[field.key] || '')}</select></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <div class="split-head">
          <h3 class="subhead">Sorszabályok</h3>
          ${canPermission('coa', 'edit') ? '<button type="button" class="secondary" data-action="open-summary-rules-window">Szabályok kezelése</button>' : ''}
        </div>
        <p class="muted">A kijelölt szabályok VAGY logikával működnek.</p>
        <div class="rule-list">${renderRuleCheckboxes(selectedRuleIds)}</div>
      </section>
    </div>
    <h3 class="subhead">Előnézet</h3>
    ${renderCoaPreviewSlot(preview)}
    <div data-window-message class="error-text"></div>
  `;
}

async function previewCoaImportFromWindow(logValidation = false) {
  const mapping = collectColumnMapping('coa-window');
  const rules = selectedSummaryRules('coa-window');
  return api('/api/import/preview', {
    method: 'POST',
    body: JSON.stringify({
      ...coaImportBasePayload(),
      companyId: state.settings.activeCompanyId,
      columnMapping: JSON.stringify(mapping),
      summaryRules: JSON.stringify(rules),
      logValidation,
    }),
  });
}

async function openCoaMappingWindow(templateId = '') {
  if (!state.coaImportFile) {
    openCoaImportWindow();
    setWindowMessage('coaImportWindow', 'Előbb válassz ki egy fájlt.');
    return;
  }
  const [templates, rules] = await Promise.all([
    api('/api/import/templates?importType=coa'),
    api('/api/summary-rules'),
  ]);
  state.importTemplates = templates.templates || [];
  state.summaryRules = rules.rules || [];
  const selectedTemplate = state.importTemplates.find((tpl) => String(tpl.id) === String(templateId));
  const selectedRules = selectedTemplate
    ? state.summaryRules.filter((rule) => selectedTemplate.selectedRuleIds.includes(rule.id))
    : state.summaryRules.filter((rule) => rule.active);
  const preview = await api('/api/import/preview', {
    method: 'POST',
    body: JSON.stringify({
      ...coaImportBasePayload(),
      companyId: state.settings.activeCompanyId,
      columnMapping: JSON.stringify(selectedTemplate?.mapping || {}),
      summaryRules: JSON.stringify(selectedRules),
    }),
  });
  state.coaImportPreview = preview;
  openAppWindow('coaMappingWindow', 'Számlatükör import - megfeleltetés', renderCoaMappingWindow(preview, templateId), { width: 1280, height: 780, preserve: true });
}

function glImportBasePayload() {
  return {
    importType: 'gl',
    fileName: state.glImportFile?.fileName || '',
    fileType: state.glImportFile?.fileType || '',
    fileData: state.glImportFile?.fileData || '',
    csvText: state.glImportFile?.csvText || '',
  };
}

function glStatusLabel(status) {
  return {
    INACTIVE: 'Inaktív / hibás',
    READY: 'Aktiválható',
    ACTIVE: 'Aktív',
    GL_DELETED: 'GL-ből törölve',
  }[status] || status || '';
}

function glOverwriteLabel(status) {
  return status === 'OVERWRITTEN' ? 'Felülírt' : 'Normál';
}

function renderGlLifecycle(session) {
  const inLedger = Boolean(session.inLedger) || Number(session.ledgerRows || 0) > 0;
  const steps = [
    { label: 'Importálva', active: true },
    { label: 'Validálva', active: ['READY', 'ACTIVE', 'GL_DELETED', 'INACTIVE'].includes(session.status) },
    { label: 'Aktiválható', active: session.status === 'READY' || session.status === 'GL_DELETED' },
    { label: 'Aktív főkönyvben', active: inLedger },
    { label: 'GL-ből törölve', active: session.status === 'GL_DELETED' },
    { label: 'Felülírt', active: session.overwrite_status === 'OVERWRITTEN' },
  ];
  return `
    <div class="lifecycle-panel">
      ${steps.map((step) => `<span class="lifecycle-step ${step.active ? 'active' : ''}">${esc(step.label)}</span>`).join('')}
    </div>
  `;
}

function glIssueLabel(code) {
  return {
    UNKNOWN_GL: 'Ismeretlen GL',
    SUMMARY_GL: 'Összesítő / nem riportképes GL',
    MISSING_NAME: 'Hiányzó megnevezés',
    NAME_MISMATCH: 'Megnevezés eltér a számlatükörtől',
    MISSING_MANAGEMENT_REPORT_CODE: 'Hiányzó Management riport kód',
    INVALID_MANAGEMENT_REPORT_CODE: 'Nem létező Management riport kód',
    INACTIVE_MANAGEMENT_REPORT_CODE: 'Inaktív Management riport kód',
    MISSING_MANAGEMENT_BSPL: 'Hiányzó Management BS/PL',
    MANAGEMENT_GROUP1_MISSING: 'Hiányzó Management Csoport1',
    MANAGEMENT_GROUP1_INVALID: 'Nem létező Management Csoport1',
    MANAGEMENT_GROUP1_INACTIVE: 'Inaktív Management Csoport1',
    MANAGEMENT_GROUP2_MISSING: 'Hiányzó Management Csoport2',
    MANAGEMENT_GROUP2_INVALID: 'Nem létező Management Csoport2',
    MANAGEMENT_GROUP2_INACTIVE: 'Inaktív Management Csoport2',
    MANAGEMENT_GROUP3_MISSING: 'Hiányzó Management Csoport3',
    MANAGEMENT_GROUP3_INVALID: 'Nem létező Management Csoport3',
    MANAGEMENT_GROUP3_INACTIVE: 'Inaktív Management Csoport3',
    MISSING_CONS_REPORT_CODE: 'Hiányzó Konszi riport kód',
    INVALID_CONS_REPORT_CODE: 'Nem létező Konszi riport kód',
    INACTIVE_CONS_REPORT_CODE: 'Inaktív Konszi riport kód',
    MISSING_CONS_BSPL: 'Hiányzó Konszi BS/PL',
    CONS_GROUP1_MISSING: 'Hiányzó Konszi Csoport1',
    CONS_GROUP1_INVALID: 'Nem létező Konszi Csoport1',
    CONS_GROUP1_INACTIVE: 'Inaktív Konszi Csoport1',
    CONS_GROUP2_MISSING: 'Hiányzó Konszi Csoport2',
    CONS_GROUP2_INVALID: 'Nem létező Konszi Csoport2',
    CONS_GROUP2_INACTIVE: 'Inaktív Konszi Csoport2',
    CONS_GROUP3_MISSING: 'Hiányzó Konszi Csoport3',
    CONS_GROUP3_INVALID: 'Nem létező Konszi Csoport3',
    CONS_GROUP3_INACTIVE: 'Inaktív Konszi Csoport3',
  }[code] || code;
}

function renderGlUploadPanel() {
  const file = state.glImportFile;
  return `
    <div class="dropzone ${file ? 'ready' : ''}" data-dropzone="gl" data-action="choose-gl-file">
      <input type="file" accept=".xlsx,.csv,.txt" data-gl-file-picker hidden>
      <strong>${file ? esc(file.fileName) : 'Dobd ide a havi főkönyv fájlt'}</strong>
      <span>${file ? 'A fájl készen áll a megfeleltetésre.' : 'Kattintással tallózó ablak nyílik.'}</span>
    </div>
    <div class="actions" style="justify-content:flex-start;margin-top:10px">
      <button type="button" data-action="choose-gl-file">Fájl kiválasztása</button>
      <button type="button" data-action="open-gl-mapping-window" ${file ? '' : 'disabled'}>Import</button>
    </div>
    <div id="glMessage" class="error-text"></div>
  `;
}

function renderGlValidationSummary(preview = {}, options = {}) {
  const stats = preview.stats || {};
  const mappingErrors = preview.mappingErrors || [];
  const fileErrors = preview.fileErrors || [];
  const showDetails = Boolean(options.showDetails);
  const suppressNotices = Boolean(options.suppressNotices);
  return `
    <div class="import-summary">
      <span>Fájl sor: <strong>${fmt(stats.total)}</strong></span>
      <span>Import sor: <strong>${fmt(stats.importable)}</strong></span>
      <span>Kihagyott nulla: <strong>${fmt(stats.skippedZero)}</strong></span>
      <span>Fájlhiba: <strong>${fmt(stats.fileErrors)}</strong></span>
      <span>Kezelendő: <strong>${fmt(stats.businessErrors)}</strong></span>
      <span>Soft: <strong>${fmt(stats.softErrors)}</strong></span>
      <span>Ismeretlen GL: <strong>${fmt(stats.unknownGl)}</strong></span>
    </div>
    ${!suppressNotices && mappingErrors.length ? `<div class="notice bad">${mappingErrors.map(esc).join('<br>')}</div>` : ''}
    ${!suppressNotices && fileErrors.length ? '<div class="notice bad">Validálási hiba. A fájlhibák részletei a validációs listában ellenőrizhetők.</div>' : ''}
    ${showDetails && fileErrors.length ? `
      <div class="table-wrap" style="margin-top:8px">
        <table class="mgm-data-table compact-grid">
          <thead><tr><th>Sor</th><th>GL szám</th><th>Megnevezés</th><th>Hiba</th></tr></thead>
          <tbody>
            ${fileErrors.map((err) => `<tr>
              <td class="num">${fmt(err.row || '')}</td>
              <td>${esc(err.glNumber || '')}</td>
              <td>${esc(err.glName || '')}</td>
              <td>${esc(err.message || '')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}
  `;
}

function renderGlInlineValidationStatus(preview = {}) {
  const stats = preview.stats || {};
  const mappingErrors = preview.mappingErrors || [];
  const fileErrors = preview.fileErrors || [];
  if (mappingErrors.length || fileErrors.length) {
    return `
      <div class="inline-validation bad">
        <strong>Validálási hiba.</strong>
        <span>${fmt(mappingErrors.length + fileErrors.length)} hiba miatt az import nem indítható.</span>
        <button type="button" class="secondary slim" data-action="open-gl-preview-validation-details">Részletek</button>
      </div>
    `;
  }
  if ((stats.businessErrors || 0) || (stats.softErrors || 0) || (stats.unknownGl || 0)) {
    return `
      <div class="inline-validation warn">
        <strong>Validálva, kezelendő.</strong>
        <span>Az import létrehozható, de aktiválás előtt javítás/OK kell.</span>
        <button type="button" class="secondary slim" data-action="open-gl-preview-validation-details">Részletek</button>
      </div>
    `;
  }
  if (stats.importable) {
    return '<div class="inline-validation ok"><strong>Validálva, importálható.</strong></div>';
  }
  return '<div class="inline-validation warn"><strong>Nincs importálható sor.</strong></div>';
}

function renderGlPreviewSlot(preview = {}) {
  const columns = preview.columns || [];
  const mapping = preview.mapping || preview.autoMapping || {};
  return `<div data-gl-preview-table>${renderMappedPreviewTable(columns, preview.sampleRows || [], mapping, { numericFields: ['debit', 'credit', 'amount'], autoNumeric: true })}</div>`;
}

function updateGlMappingWindow(preview) {
  const win = document.querySelector('#glMappingWindow');
  if (!win) return false;
  const statusSlot = win.querySelector('[data-gl-validation-status]');
  const summarySlot = win.querySelector('[data-gl-validation-summary]');
  const previewSlot = win.querySelector('[data-gl-preview-table]');
  const previewWrap = previewSlot?.querySelector('.import-preview-wrap');
  const previewScroll = previewWrap ? { left: previewWrap.scrollLeft, top: previewWrap.scrollTop } : null;
  if (statusSlot) statusSlot.innerHTML = renderGlInlineValidationStatus(preview);
  if (summarySlot) summarySlot.innerHTML = renderGlValidationSummary(preview, { suppressNotices: true });
  if (previewSlot) previewSlot.outerHTML = renderGlPreviewSlot(preview);
  if (previewScroll) {
    const nextWrap = win.querySelector('[data-gl-preview-table] .import-preview-wrap');
    if (nextWrap) {
      nextWrap.scrollLeft = previewScroll.left;
      nextWrap.scrollTop = previewScroll.top;
    }
  }
  return Boolean(statusSlot || summarySlot || previewSlot);
}

function renderGlMappingWindow(preview, selectedTemplateId = '', period = {}) {
  const columns = preview.columns || [];
  const mapping = preview.mapping || preview.autoMapping || {};
  const selectedTemplate = state.importTemplates.find((tpl) => String(tpl.id) === String(selectedTemplateId));
  const activeYear = Number(state.settings.activeYear) || new Date().getFullYear();
  const selectedYear = String(period.year ?? state.glImportTargetYear ?? '');
  const selectedMonth = String(period.month ?? state.glImportTargetMonth ?? '');
  const years = Array.from({ length: 11 }, (_, idx) => activeYear - 5 + idx);
  if (selectedYear && !years.includes(Number(selectedYear))) years.push(Number(selectedYear));
  years.sort((a, b) => a - b);
  return `
    <div class="form-row compact">
      <label>Év
        <select data-gl-import-year required>
          <option value="">- válassz évet -</option>
          ${years.map((year) => `<option value="${year}" ${String(year) === selectedYear ? 'selected' : ''}>${year}</option>`).join('')}
        </select>
      </label>
      <label>Hónap
        <select data-gl-import-month required>
          <option value="">- válassz hónapot -</option>
          ${Array.from({ length: 12 }, (_, idx) => idx + 1).map((month) => `<option value="${month}" ${String(month) === selectedMonth ? 'selected' : ''}>${month}. hó</option>`).join('')}
        </select>
      </label>
      <label>Template
        <select data-template-select="gl">${renderTemplateOptions(selectedTemplateId)}</select>
      </label>
      <label>Template név <input data-gl-template-name value="${esc(selectedTemplate?.name || '')}" placeholder="pl. havi főkönyv"></label>
      <button type="button" data-action="save-gl-import-template">Template mentése</button>
      <button type="button" data-action="validate-gl-import">Validáció frissítése</button>
      <button type="button" data-action="run-gl-import">Import indítása</button>
    </div>
    <div data-gl-validation-status>${renderGlInlineValidationStatus(preview)}</div>
    <div data-gl-validation-summary>${renderGlValidationSummary(preview, { suppressNotices: true })}</div>
    <div class="window-grid two" style="margin-top:8px">
      <section>
        <h3 class="subhead">Oszlop megfeleltetés</h3>
        <div class="table-wrap import-mapping">
          <table>
            <thead><tr><th>Program oszlop</th><th>Import fájl oszlopa</th></tr></thead>
            <tbody>
              ${preview.fields.map((field) => `
                <tr>
                  <td>${esc(field.label)}${field.required ? ' *' : ''}</td>
                  <td><select data-map-scope="gl-window" data-map-target="${esc(field.key)}">${selectOptions(columns, mapping[field.key] || '')}</select></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h3 class="subhead">Import szabály</h3>
        <div class="notice">Az import mindig ACT adatként jön létre. A nulla vagy üres egyenlegű sorok kimaradnak.</div>
        <p class="muted">A kötelező mezők hiányát gombnyomáskor jelzi a rendszer. A fájlhibás import nem kerül be, az üzleti hibás import inaktívként kerül be.</p>
      </section>
    </div>
    <h3 class="subhead">Előnézet</h3>
    ${renderGlPreviewSlot(preview)}
    <div data-window-message class="error-text"></div>
  `;
}

async function previewGlImportFromWindow(logValidation = false) {
  const mapping = collectColumnMapping('gl-window');
  return api('/api/gl/preview', {
    method: 'POST',
    body: JSON.stringify({
      ...glImportBasePayload(),
      companyId: state.settings.activeCompanyId,
      columnMapping: JSON.stringify(mapping),
      logValidation,
    }),
  });
}

async function openGlMappingWindow(templateId = '') {
  if (!state.glImportFile) {
    setScopedMessage(document.querySelector(`#${pageWindowId('gl')}`) || document, '#glMessage', 'Előbb válassz ki egy fájlt.');
    return;
  }
  const year = document.querySelector('#glMappingWindow [data-gl-import-year]')?.value || state.glImportTargetYear || '';
  const month = document.querySelector('#glMappingWindow [data-gl-import-month]')?.value || state.glImportTargetMonth || '';
  state.glImportTargetYear = year;
  state.glImportTargetMonth = month;
  const templates = await api('/api/import/templates?importType=gl');
  state.importTemplates = templates.templates || [];
  const selectedTemplate = state.importTemplates.find((tpl) => String(tpl.id) === String(templateId));
  const preview = await api('/api/gl/preview', {
    method: 'POST',
    body: JSON.stringify({
      ...glImportBasePayload(),
      companyId: state.settings.activeCompanyId,
      columnMapping: JSON.stringify(selectedTemplate?.mapping || {}),
    }),
  });
  state.glImportPreview = preview;
  openAppWindow('glMappingWindow', 'GL import - megfeleltetés', renderGlMappingWindow(preview, templateId, { year, month }), { width: 1360, height: 820, preserve: true });
}

function renderGlImportDetail(data) {
  const session = data.session;
  const rows = data.rows || [];
  const canValidate = canPermission('gl', 'validate');
  const canEdit = canPermission('gl', 'edit');
  const canActivate = canPermission('gl', 'activate') && (session.status === 'READY' || session.status === 'GL_DELETED');
  const activateLabel = session.status === 'GL_DELETED' ? 'Újraaktiválás' : 'Aktiválás';
  const companyCode = session.companyCode || state.companies.find((c) => c.id === Number(session.company_id))?.code || '';
  const unresolvedSoftCount = rows.filter((row) => (row.softErrors || []).length && !row.softOk).length;
  return `
    <div class="import-summary">
      <span>Import azonosító: <strong>${esc(session.batch_id || '')}</strong></span>
      <span>Státusz: <strong>${esc(glStatusLabel(session.status))}</strong></span>
      <span>Felülírás: <strong>${esc(glOverwriteLabel(session.overwrite_status))}</strong></span>
      <span>Főkönyvben: <strong>${session.inLedger || Number(session.ledgerRows || 0) > 0 ? 'Igen' : 'Nem'}</strong></span>
      <span>Cég: <strong>${esc(session.companyCode || '')}</strong></span>
      <span>Év/Hó: <strong>${esc(session.year)} / ${esc(session.month)}</strong></span>
      <span>Importálta: <strong>${esc(session.importedByName || session.username || '')}</strong></span>
      <span>Dátum: <strong>${esc(isoDate(session.imported_at))}</strong></span>
    </div>
    ${renderGlLifecycle(session)}
    <div class="actions" style="justify-content:flex-start;margin:8px 0">
      ${canValidate ? `<button type="button" data-action="validate-gl-import-session" data-session-id="${session.id}">Validáció frissítése</button>` : ''}
      <button type="button" class="secondary" data-action="open-gl-validation-list" data-session-id="${session.id}">Validációs lista</button>
      ${canValidate ? `<button type="button" class="secondary" data-action="soft-ok-gl-session" data-session-id="${session.id}" ${unresolvedSoftCount ? '' : 'disabled'}>Minden soft hiba OK</button>` : ''}
      ${canPermission('gl', 'activate') ? `<button type="button" data-action="activate-gl-import" data-session-id="${session.id}" data-company-code="${esc(companyCode)}" data-reactivate="${session.status === 'GL_DELETED' ? 'true' : 'false'}" ${canActivate ? '' : 'disabled'}>${activateLabel}</button>` : ''}
      ${canEdit ? `<button type="button" class="secondary" data-action="refresh-gl-names" data-session-id="${session.id}" data-company-code="${esc(companyCode)}">Megnevezések frissítése számlatükörből</button>` : ''}
    </div>
    ${table([
      { label: 'Sor', key: 'source_row_no', num: true },
      { label: 'GL szám', key: 'gl_number' },
      { label: 'Import név', key: 'imported_gl_name' },
      { label: 'Számlatükör név', key: 'coa_gl_name' },
      { label: 'Tartozik', key: 'debit', num: true, render: (r) => fmtGlAmount ? fmtGlAmount(r.debit) : fmt(r.debit, 2) },
      { label: 'Követel', key: 'credit', num: true, render: (r) => fmtGlAmount ? fmtGlAmount(r.credit) : fmt(r.credit, 2) },
      { label: 'Egyenleg', key: 'amount', num: true, render: (r) => fmtGlAmount ? fmtGlAmount(r.amount) : fmt(r.amount, 2) },
      { label: 'Validáció', key: 'id', render: (r) => {
        const businessCount = (r.businessErrors || []).length;
        const softCount = (r.softErrors || []).length;
        const parts = [];
        if (businessCount) parts.push(`Hiba: ${businessCount}`);
        if (softCount) parts.push(`Figy.: ${softCount}`);
        return parts.length ? `<button type="button" class="secondary slim" data-action="show-gl-row-errors" data-row-id="${r.id}">${esc(parts.join(' / '))}</button>` : 'OK';
      } },
      { label: '', key: 'id', render: (r) => {
        const actions = [];
        if (canValidate && (r.softErrors || []).length && !r.softOk) actions.push(`<button type="button" class="secondary slim" data-action="soft-ok-gl-row" data-row-id="${r.id}" data-session-id="${session.id}">Hiba OK</button>`);
        if (canEdit && (r.softErrors || []).some((code) => code === 'NAME_MISMATCH' || code === 'MISSING_NAME') && r.coa_gl_name) actions.push(`<button type="button" class="secondary slim" data-action="refresh-gl-row-name" data-row-id="${r.id}" data-session-id="${session.id}">Név frissítése</button>`);
        if (canPermission('coa', 'edit') && (r.businessErrors || []).includes('UNKNOWN_GL')) actions.push(`<button type="button" class="secondary slim" data-action="open-missing-gl-window" data-session-id="${session.id}" data-gl-number="${esc(r.gl_number)}" data-gl-name="${esc(r.imported_gl_name)}">GL felvétele</button>`);
        return actions.join(' ');
      } },
    ], rows, 'Nincs import részletsor.')}
    <div data-window-message class="error-text"></div>
  `;
}

async function openGlImportDetail(sessionId) {
  const data = await api(`/api/gl/import-sessions/${encodeURIComponent(sessionId)}`);
  state.glImportDetail = data;
  openAppWindow('glImportDetailWindow', 'GL import részletek', renderGlImportDetail(data), { width: 1360, height: 820, preserve: true });
}

function openMissingGlWindow({ sessionId, glNumber, glName }) {
  openAppWindow('missingGlWindow', 'Hiányzó GL felvétele', `
    <form data-form="missing-gl-add" class="grid">
      <input type="hidden" name="sessionId" value="${esc(sessionId)}">
      <label>GL szám <input name="glNumber" value="${esc(glNumber)}" required></label>
      <label>GL megnevezés <input name="glName" value="${esc(glName)}" required></label>
      <label>Konszi riport kód <input name="consAccount"></label>
      <label>Management riport kód <input name="reportingCategory"></label>
      <label>BS / PL
        <select name="statementType"><option>BS</option><option>PL</option></select>
      </label>
      <div class="actions"><button type="submit">Mentés</button></div>
      <div data-window-message class="error-text"></div>
    </form>
  `, { width: 520, height: 440, preserve: true });
}

async function openSummaryRulesWindow() {
  const data = await api('/api/summary-rules');
  state.summaryRules = data.rules || [];
  const canEditRules = canPermission('coa', 'edit');
  const canDeleteRules = canPermission('coa', 'delete');
  const columns = state.coaImportPreview?.columns || [];
  const columnInput = columns.length
    ? `<select name="column">${selectOptions(columns, 'TIPUS')}</select>`
    : '<input name="column" placeholder="pl. TIPUS">';
  openAppWindow('summaryRulesWindow', 'Sorszabályok', `
    <section class="panel flat-panel">
      <h3 class="subhead">Új / módosított szabály</h3>
      ${canEditRules ? `
      <form data-form="summary-rule-save" class="form-row compact">
        <label>Név <input name="name" placeholder="pl. TIPUS = C összesítő sor" required></label>
        <label>Típus
          <select name="ruleType"><option value="summary">Összesítő sor</option><option value="inactive">Inaktív sor</option></select>
        </label>
        <label>Oszlop ${columnInput}</label>
        <label>Feltétel
          <select name="operator"><option value="equals">egyenlő</option><option value="contains">tartalmazza</option><option value="startsWith">ezzel kezdődik</option><option value="notEquals">nem egyenlő</option></select>
        </label>
        <label>Érték <input name="value" value="C" required></label>
        <label class="checkline"><input type="checkbox" name="active" checked> Aktív</label>
        <button type="submit">Mentés</button>
      </form>
      ` : '<div class="notice">A sorszabályok csak olvashatók.</div>'}
      <div data-window-message class="error-text"></div>
    </section>
    <div class="summary-rules-table-wrap" style="margin-top:10px">
      ${table([
        { label: 'Típus', key: 'ruleType', render: (r) => r.ruleType === 'inactive' ? 'Inaktív' : 'Összesítő' },
        { label: 'Név', key: 'name' },
        { label: 'Oszlop', key: 'columnName' },
        { label: 'Feltétel', key: 'operator' },
        { label: 'Érték', key: 'matchValue' },
        { label: 'Aktív', key: 'active', render: (r) => r.active ? 'Igen' : 'Nem' },
        ...(canDeleteRules ? [{ label: '', key: 'id', render: (r) => `<button type="button" class="secondary" data-action="delete-summary-rule" data-id="${r.id}">Törlés</button>` }] : []),
      ], state.summaryRules, 'Még nincs szabály.')}
    </div>
  `, { width: 1040, height: 620, preserve: true });
}

    return {
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
    };
  }

  window.MGM_IMPORT_UI = {
    createImportUi,
  };
}());
