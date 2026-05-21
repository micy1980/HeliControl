(function () {
  function createTrialBalanceUi(deps) {
    const {
      state,
      api,
      esc,
      fmtAmount,
      displayAmount,
      displayUnitLabel,
      resizableTh,
      applyColumnOrder,
      pageHead,
      contextQuery,
      content,
      wildcardMatch,
    } = deps;

const monthLabels = ['Jan', 'Feb', 'Már', 'Ápr', 'Máj', 'Jún', 'Júl', 'Aug', 'Szep', 'Okt', 'Nov', 'Dec'];

const trialBalanceColumnDefs = [
  { key: 'glNumber', label: 'GL szám', fixed: true, value: (row) => row.glNumber },
  { key: 'glName', label: 'GL megnevezés', optional: true, value: (row) => row.glName },
  { key: 'managementGroup1Code', label: 'Mgmt Csoport1', optional: true, value: (row) => row.managementGroup1Code },
  { key: 'managementGroup1Name', label: 'Mgmt Csoport1 név', optional: true, value: (row) => row.managementGroup1Name },
  { key: 'managementGroup2Code', label: 'Mgmt Csoport2', optional: true, value: (row) => row.managementGroup2Code },
  { key: 'managementGroup2Name', label: 'Mgmt Csoport2 név', optional: true, value: (row) => row.managementGroup2Name },
  { key: 'managementGroup3Code', label: 'Mgmt Csoport3', optional: true, value: (row) => row.managementGroup3Code },
  { key: 'managementGroup3Name', label: 'Mgmt Csoport3 név', optional: true, value: (row) => row.managementGroup3Name },
  { key: 'managementReportCode', label: 'Mgmt riport kód', optional: true, value: (row) => row.managementReportCode },
  { key: 'managementReportName', label: 'Mgmt riport név', optional: true, value: (row) => row.managementReportName },
  { key: 'managementStatementType', label: 'Mgmt BS/PL', optional: true, value: (row) => row.managementStatementType },
  { key: 'consGroup1Code', label: 'Konszi Csoport1', optional: true, value: (row) => row.consGroup1Code },
  { key: 'consGroup1Name', label: 'Konszi Csoport1 név', optional: true, value: (row) => row.consGroup1Name },
  { key: 'consGroup2Code', label: 'Konszi Csoport2', optional: true, value: (row) => row.consGroup2Code },
  { key: 'consGroup2Name', label: 'Konszi Csoport2 név', optional: true, value: (row) => row.consGroup2Name },
  { key: 'consGroup3Code', label: 'Konszi Csoport3', optional: true, value: (row) => row.consGroup3Code },
  { key: 'consGroup3Name', label: 'Konszi Csoport3 név', optional: true, value: (row) => row.consGroup3Name },
  { key: 'consReportCode', label: 'Konszi riport kód', optional: true, value: (row) => row.consReportCode },
  { key: 'consReportName', label: 'Konszi riport név', optional: true, value: (row) => row.consReportName },
  { key: 'consStatementType', label: 'Konszi BS/PL', optional: true, value: (row) => row.consStatementType },
  { key: 'statementType', label: 'BS/PL', optional: true, value: (row) => row.statementType },
];

function trialBalanceOptionalColumnKeys() {
  return trialBalanceColumnDefs.filter((column) => column.optional).map((column) => column.key);
}

function selectedTrialBalanceColumns() {
  const valid = new Set(trialBalanceOptionalColumnKeys());
  if (!Array.isArray(state.trialBalanceColumns)) return trialBalanceOptionalColumnKeys();
  return state.trialBalanceColumns.filter((key) => valid.has(key));
}

function saveTrialBalanceColumns(columns) {
  const valid = new Set(trialBalanceOptionalColumnKeys());
  if (!Array.isArray(columns)) {
    state.trialBalanceColumns = null;
    localStorage.removeItem('mgmTrialBalanceColumns');
    return;
  }
  state.trialBalanceColumns = (columns || []).filter((key) => valid.has(key));
  localStorage.setItem('mgmTrialBalanceColumns', JSON.stringify(state.trialBalanceColumns));
}

function trialBalanceRootFromSource(source) {
  return source?.closest?.('[data-trial-root]')
    || source?.closest?.('.mgm-window-content')?.querySelector('[data-trial-root]')
    || document.querySelector('[data-trial-root]');
}

function trialBalanceKeyForTarget(selector) {
  return String(selector || '#content').replace(/[^a-z0-9_-]+/gi, '_');
}

function trialBalanceFiltersFromDom(source) {
  const root = trialBalanceRootFromSource(source) || document;
  const selectedColumns = Array.from(root.querySelectorAll('[data-trial-column]'))
    .filter((input) => input.checked)
    .map((input) => input.value);
  return {
    search: String(root.querySelector('[data-trial-filter="search"]')?.value || '').trim().toLowerCase(),
    statementType: String(root.querySelector('[data-trial-filter="statementType"]')?.value || ''),
    consAccount: String(root.querySelector('[data-trial-filter="consAccount"]')?.value || ''),
    reportingCategory: String(root.querySelector('[data-trial-filter="reportingCategory"]')?.value || ''),
    showZeros: Boolean(root.querySelector('[data-trial-filter="showZeros"]')?.checked),
    selectedColumns,
  };
}

function trialBalanceRowVisible(row, filters) {
  const haystack = [
    row.glNumber,
    row.glName,
    row.managementReportCode,
    row.managementReportName,
    row.managementGroup1Code,
    row.managementGroup1Name,
    row.managementGroup2Code,
    row.managementGroup2Name,
    row.managementGroup3Code,
    row.managementGroup3Name,
    row.consReportCode,
    row.consReportName,
    row.consGroup1Code,
    row.consGroup1Name,
    row.consGroup2Code,
    row.consGroup2Name,
    row.consGroup3Code,
    row.consGroup3Name,
  ].join(' ');
  if (filters.search && !wildcardMatch(haystack, filters.search)) return false;
  if (filters.statementType && row.statementType !== filters.statementType) return false;
  if (filters.consAccount && row.consReportCode !== filters.consAccount) return false;
  if (filters.reportingCategory && row.managementReportCode !== filters.reportingCategory) return false;
  if (!filters.showZeros && Number(row.total || 0) === 0 && Object.values(row.months || {}).every((value) => Number(value || 0) === 0)) return false;
  return true;
}

function visibleTrialBalanceColumns(filters = {}) {
  const selected = filters.selectedColumns || trialBalanceColumnDefs.filter((column) => column.optional).map((column) => column.key);
  const fixed = trialBalanceColumnDefs.filter((column) => column.fixed);
  const optionalByKey = new Map(trialBalanceColumnDefs.filter((column) => column.optional).map((column) => [column.key, column]));
  const orderedOptional = selected.map((key) => optionalByKey.get(key)).filter(Boolean);
  return applyColumnOrder ? applyColumnOrder('trialbalance', [...fixed, ...orderedOptional]) : [...fixed, ...orderedOptional];
}

function trialMonthImportTitle(info) {
  if (!info) return 'Nincs aktív import az adott hónapra.';
  return [
    `Import azonosító: ${info.batchId || ''}`,
    `Fájl: ${info.fileName || ''}`,
    `Aktiválta: ${info.activatedBy || ''}`,
    `Aktiválás dátuma: ${info.activatedAt || ''}`,
    `Sor: ${info.importedRows || 0}`,
  ].join('\n');
}

function renderTrialMonthHeader(label, month, importsByMonth = {}) {
  const info = importsByMonth[String(month)];
  const className = `num trial-month-head ${info ? 'has-import' : ''}`;
  return `
    <th class="${esc(className)}" data-col-scope="trialbalance" data-col-key="month${month}" data-action="show-trial-month-import" data-month="${month}" title="${esc(trialMonthImportTitle(info))}">
      <span class="th-label">${esc(label)}${info ? '<span class="month-import-dot"></span>' : ''}</span>
      <span class="col-resizer" data-col-resizer></span>
    </th>
  `;
}

function trialSeverityLabel(severity) {
  return { ERROR: 'Hiba', WARNING: 'Figyelmeztetés', INFO: 'Információ' }[severity] || severity || '';
}

function renderTrialValidationStatus(result) {
  if (!result) return '';
  const errorCount = Number(result.errorCount || 0);
  const warningCount = Number(result.warningCount || 0);
  const checkedRows = Number(result.checkedRows || 0);
  if (errorCount > 0) {
    return `
      <div class="inline-validation bad">
        <strong>Validációs hiba.</strong>
        <span>${fmt(errorCount)} hiba, ${fmt(warningCount)} figyelmeztetés, ellenőrzött GL: ${fmt(checkedRows)}.</span>
        <button type="button" class="secondary slim" data-action="open-trial-validation-details">Részletek</button>
      </div>
    `;
  }
  if (warningCount > 0) {
    return `
      <div class="inline-validation warn">
        <strong>Validálva, figyelmeztetéssel.</strong>
        <span>${fmt(warningCount)} figyelmeztetés, ellenőrzött GL: ${fmt(checkedRows)}.</span>
        <button type="button" class="secondary slim" data-action="open-trial-validation-details">Részletek</button>
      </div>
    `;
  }
  return `
    <div class="inline-validation ok">
      <strong>Validálva, nincs hiba.</strong>
      <span>Ellenőrzött GL: ${fmt(checkedRows)}.</span>
    </div>
  `;
}

function renderTrialValidationDetails(result = {}) {
  const issueRows = result.issues || [];
  return `
    <div class="import-summary">
      <span>Év: <strong>${esc(result.year || '')}</strong></span>
      <span>Ellenőrzött GL: <strong>${fmt(result.checkedRows || 0)}</strong></span>
      <span>Hiba: <strong>${fmt(result.errorCount || 0)}</strong></span>
      <span>Figyelmeztetés: <strong>${fmt(result.warningCount || 0)}</strong></span>
    </div>
    <div class="actions" style="justify-content:flex-start;margin:8px 0">
      <button type="button" class="secondary" data-page="coa">Számlatükör megnyitása</button>
      <button type="button" class="secondary" data-action="open-report-structure" data-structure-type="MGMT">Management riport törzs</button>
      <button type="button" class="secondary" data-action="open-report-structure" data-structure-type="CONS">Konszolidációs riport törzs</button>
    </div>
    ${issueRows.length ? `
      <div class="table-wrap">
        <table class="mgm-data-table compact-grid">
          <thead><tr><th>Szint</th><th>GL</th><th>GL név</th><th>Mező</th><th>Üzenet</th></tr></thead>
          <tbody>
            ${issueRows.map((issue) => `<tr>
              <td>${esc(trialSeverityLabel(issue.severity))}</td>
              <td>${esc(issue.glNumber || '')}</td>
              <td>${esc(issue.glName || '')}</td>
              <td>${esc(issue.fieldLabel || issue.fieldKey || '')}</td>
              <td>${esc(issue.message || '')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    ` : '<div class="notice">Nincs főkönyvi validációs hiba vagy figyelmeztetés.</div>'}
  `;
}

function updateTrialValidationStatus(root, result) {
  const key = root?.dataset.trialKey || trialBalanceKeyForTarget(state.contentTarget || '#content');
  window.__trialBalanceValidations = window.__trialBalanceValidations || {};
  window.__trialBalanceValidations[key] = result;
  const slot = root?.querySelector('[data-trial-validation-status]');
  if (slot) slot.innerHTML = renderTrialValidationStatus(result);
}

function trialValidationResultFromRoot(root) {
  const key = root?.dataset.trialKey || trialBalanceKeyForTarget(state.contentTarget || '#content');
  return window.__trialBalanceValidations?.[key] || null;
}

function renderTrialBalanceTable(data, filters = {}) {
  const rows = (data.rows || []).filter((row) => trialBalanceRowVisible(row, filters));
  const columns = visibleTrialBalanceColumns(filters);
  const importsByMonth = data.importsByMonth || {};
  window.__lastTrialBalanceExport = [
    ...rows.map((row) => ({
      'GL szám': row.glNumber,
      'GL megnevezés': row.glName,
      'Management Csoport1': row.managementGroup1Code,
      'Management Csoport1 név': row.managementGroup1Name,
      'Management Csoport2': row.managementGroup2Code,
      'Management Csoport2 név': row.managementGroup2Name,
      'Management Csoport3': row.managementGroup3Code,
      'Management Csoport3 név': row.managementGroup3Name,
      'Management riport kód': row.managementReportCode,
      'Management riport név': row.managementReportName,
      'Management BS/PL': row.managementStatementType,
      'Konszi Csoport1': row.consGroup1Code,
      'Konszi Csoport1 név': row.consGroup1Name,
      'Konszi Csoport2': row.consGroup2Code,
      'Konszi Csoport2 név': row.consGroup2Name,
      'Konszi Csoport3': row.consGroup3Code,
      'Konszi Csoport3 név': row.consGroup3Name,
      'Konszi riport kód': row.consReportCode,
      'Konszi riport név': row.consReportName,
      'Konszi BS/PL': row.consStatementType,
      'BS/PL': row.statementType,
      ...Object.fromEntries(monthLabels.map((label, idx) => [label, displayAmount(row.months[String(idx + 1)] || 0)])),
      'Éves összesen': displayAmount(row.total),
    })),
  ];
  return `
    <div class="table-wrap trial-balance-wrap">
      <table class="trial-balance-table mgm-data-table">
        <thead>
          <tr>
            ${columns.map((column) => resizableTh(column.label, '', { scope: 'trialbalance', key: column.key, reorder: true })).join('')}
            ${monthLabels.map((label, idx) => renderTrialMonthHeader(label, idx + 1, importsByMonth)).join('')}
            ${resizableTh('Éves összesen', 'num', { scope: 'trialbalance', key: 'yearTotal' })}
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((row) => `
            <tr>
              ${columns.map((column) => `<td>${esc(column.value(row))}</td>`).join('')}
              ${monthLabels.map((_label, idx) => `<td class="num">${fmtAmount(row.months[String(idx + 1)] || 0)}</td>`).join('')}
              <td class="num strong">${fmtAmount(row.total)}</td>
            </tr>
          `).join('') : `<tr><td colspan="${columns.length + 13}" class="empty">Nincs megjeleníthető sor.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function refreshTrialBalanceTable(source) {
  const root = trialBalanceRootFromSource(source);
  const slot = root?.querySelector('[data-trial-table]');
  const key = root?.dataset.trialKey || trialBalanceKeyForTarget(state.contentTarget || '#content');
  const data = window.__trialBalances?.[key] || window.__lastTrialBalance;
  if (!slot || !data) return;
  const filters = trialBalanceFiltersFromDom(root);
  saveTrialBalanceColumns(filters.selectedColumns);
  slot.innerHTML = renderTrialBalanceTable(data, filters);
}

async function renderTrialBalance() {
  const data = await api(`/api/trial-balance?${contextQuery()}`);
  const targetSelector = state.contentTarget || '#content';
  const trialKey = trialBalanceKeyForTarget(targetSelector);
  const activeYear = Number(state.settings.activeYear) || new Date().getFullYear();
  const yearOptions = Array.from({ length: 11 }, (_, index) => activeYear - 5 + index)
    .map((year) => `<option value="${year}" ${Number(state.settings.activeYear) === year ? 'selected' : ''}>${year}</option>`)
    .join('');
  window.__trialBalances = window.__trialBalances || {};
  window.__trialBalances[trialKey] = data;
  window.__lastTrialBalance = data;
  const consOptions = [...new Map(data.rows.map((row) => [row.consReportCode, `${row.consReportCode} - ${row.consReportName || ''}`])).entries()]
    .filter(([code]) => code)
    .sort((a, b) => a[0].localeCompare(b[0], 'hu'));
  const categoryOptions = [...new Map(data.rows.map((row) => [row.managementReportCode, `${row.managementReportCode} - ${row.managementReportName || ''}`])).entries()]
    .filter(([code]) => code)
    .sort((a, b) => a[0].localeCompare(b[0], 'hu'));
  const selectedColumns = selectedTrialBalanceColumns();
  const selectedColumnSet = new Set(selectedColumns);
  const validation = window.__trialBalanceValidations?.[trialKey] || null;
  content(`
    <div data-trial-root data-trial-key="${esc(trialKey)}">
    ${pageHead('Főkönyvi kivonat', `12 havi ACT főkönyvi áttekintés az aktív évre. Egység: ${displayUnitLabel()}.`, '<button data-action="validate-trial-balance" class="secondary">Validáció</button><button data-action="export-trial-balance">CSV export</button>')}
    <div data-trial-validation-status>${renderTrialValidationStatus(validation)}</div>
    <section class="panel trial-filter-panel">
      <div class="form-row compact">
        <label>Év <select data-context="activeYear" data-trial-year>${yearOptions}</select></label>
        <label>GL keresés <input data-trial-filter="search" placeholder="GL szám / név / kategória"></label>
        <label>BS / PL
          <select data-trial-filter="statementType"><option value="">Mind</option><option>BS</option><option>PL</option></select>
        </label>
        <label>Konszi riport
          <select data-trial-filter="consAccount"><option value="">Mind</option>${consOptions.map(([code, label]) => `<option value="${esc(code)}">${esc(label)}</option>`).join('')}</select>
        </label>
        <label>Management riport
          <select data-trial-filter="reportingCategory"><option value="">Mind</option>${categoryOptions.map(([code, label]) => `<option value="${esc(code)}">${esc(label)}</option>`).join('')}</select>
        </label>
        <label class="checkline trial-zero-toggle"><input type="checkbox" data-trial-filter="showZeros"> Nullás sorok mutatása</label>
        <details class="column-chooser">
            <summary>Oszlopok</summary>
            <div class="column-chooser-panel" data-column-family="trialbalance">
              <label class="checkline column-chooser-all"><input type="checkbox" data-trial-column-all ${selectedColumns.length === trialBalanceOptionalColumnKeys().length ? 'checked' : ''}> Mind</label>
              <button type="button" class="secondary slim column-reset" data-column-reset="trialbalance">Nézet alaphelyzetbe</button>
              ${[
              ...visibleTrialBalanceColumns({ selectedColumns }),
              ...trialBalanceColumnDefs.filter((column) => column.optional && !selectedColumnSet.has(column.key)),
            ].map((column) => `
              <div class="checkline column-option-row" data-column-option-row data-column-key="${esc(column.key)}">
                <span class="column-drag-handle" draggable="true" data-column-drag-handle data-column-family="trialbalance" data-column-key="${esc(column.key)}" title="Húzással rendezhető">☰</span>
                ${column.fixed
                  ? `<input type="checkbox" data-column-fixed value="${esc(column.key)}" checked disabled>`
                  : `<input type="checkbox" data-trial-column data-column-key="${esc(column.key)}" value="${esc(column.key)}" ${selectedColumnSet.has(column.key) ? 'checked' : ''}>`}
                <span>${esc(column.label)}</span>
              </div>
            `).join('')}
          </div>
        </details>
      </div>
    </section>
    <div data-trial-table style="margin-top:10px">
      ${renderTrialBalanceTable(data, {
        search: '',
        statementType: '',
        consAccount: '',
        reportingCategory: '',
        showZeros: false,
        selectedColumns,
      })}
    </div>
    </div>
  `);
}

    return {
      renderTrialBalance,
      refreshTrialBalanceTable,
      trialBalanceRootFromSource,
      trialBalanceOptionalColumnKeys,
      saveTrialBalanceColumns,
      renderTrialValidationDetails,
      updateTrialValidationStatus,
      trialValidationResultFromRoot,
    };
  }

  window.MGM_TRIAL_BALANCE_UI = {
    createTrialBalanceUi,
  };
}());
