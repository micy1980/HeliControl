(function () {
  function createCoaUi(deps) {
    const {
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
    } = deps;

const coaColumnDefs = [
  { key: 'select', label: '', fixed: true, width: 42 },
  { key: 'status', label: 'Státusz', fixed: true, width: 70 },
  { key: 'glNumber', label: 'GL', fixed: true, width: 82 },
  { key: 'glName', label: 'GL név', fixed: true, width: 300 },
  { key: 'managementGroup1Code', label: 'Mgmt Cs1', optional: true, width: 132 },
  { key: 'managementGroup1Name', label: 'Mgmt Cs1 név', optional: true, width: 190 },
  { key: 'managementGroup2Code', label: 'Mgmt Cs2', optional: true, width: 132 },
  { key: 'managementGroup2Name', label: 'Mgmt Cs2 név', optional: true, width: 190 },
  { key: 'managementGroup3Code', label: 'Mgmt Cs3', optional: true, width: 132 },
  { key: 'managementGroup3Name', label: 'Mgmt Cs3 név', optional: true, width: 190 },
  { key: 'managementReportCode', label: 'Mgmt riport kód', optional: true, width: 170 },
  { key: 'managementReportName', label: 'Mgmt riport név', optional: true, width: 220 },
  { key: 'managementStatementType', label: 'Mgmt BS/PL', optional: true, width: 82 },
  { key: 'consGroup1Code', label: 'Konszi Cs1', optional: true, width: 132 },
  { key: 'consGroup1Name', label: 'Konszi Cs1 név', optional: true, width: 190 },
  { key: 'consGroup2Code', label: 'Konszi Cs2', optional: true, width: 132 },
  { key: 'consGroup2Name', label: 'Konszi Cs2 név', optional: true, width: 190 },
  { key: 'consGroup3Code', label: 'Konszi Cs3', optional: true, width: 132 },
  { key: 'consGroup3Name', label: 'Konszi Cs3 név', optional: true, width: 190 },
  { key: 'consReportCode', label: 'Konszi riport kód', optional: true, width: 170 },
  { key: 'consReportName', label: 'Konszi riport név', optional: true, width: 220 },
  { key: 'consStatementType', label: 'Konszi BS/PL', optional: true, width: 82 },
  { key: 'statementType', label: 'BS/PL', optional: true, width: 72 },
  { key: 'flags', label: 'Jelek', optional: true, width: 118 },
  { key: 'source', label: 'Forrás', optional: true, width: 100 },
];

const defaultCoaOptionalColumns = [
  'managementReportCode',
  'managementReportName',
  'consReportCode',
  'consReportName',
  'statementType',
  'flags',
];

function coaOptionalColumnKeys() {
  return coaColumnDefs.filter((column) => column.optional).map((column) => column.key);
}

function selectedCoaColumns() {
  const valid = new Set(coaOptionalColumnKeys());
  const selected = Array.isArray(state.coaColumns) ? state.coaColumns.filter((key) => valid.has(key)) : defaultCoaOptionalColumns;
  return selected.length ? selected : [];
}

function saveCoaColumns(columns) {
  if (!Array.isArray(columns)) {
    state.coaColumns = null;
    localStorage.removeItem('mgmCoaColumns');
    return;
  }
  state.coaColumns = columns;
  localStorage.setItem('mgmCoaColumns', JSON.stringify(columns));
}

function visibleCoaColumns(selectedColumns = selectedCoaColumns()) {
  const selected = selectedColumns || [];
  const fixed = coaColumnDefs.filter((column) => column.fixed);
  const optionalByKey = new Map(coaColumnDefs.filter((column) => column.optional).map((column) => [column.key, column]));
  const orderedOptional = selected.map((key) => optionalByKey.get(key)).filter(Boolean);
  return applyColumnOrder ? applyColumnOrder('coa', [...fixed, ...orderedOptional]) : [...fixed, ...orderedOptional];
}

function coaRootFromSource(source) {
  return source?.closest?.('[data-coa-root]') || document.querySelector('[data-coa-root]');
}

function selectedCoaIds(root = document) {
  return Array.from(root.querySelectorAll('[data-coa-row-id]:checked')).map((input) => Number(input.dataset.coaRowId)).filter(Number.isFinite);
}

function coaMasterLookup(type, code) {
  const rows = type === 'CONS' ? state.coaReportMaster.cons : state.coaReportMaster.management;
  return (rows || []).find((row) => String(row.code) === String(code || ''));
}

function hydrateCoaRow(row) {
  const managementCode = row.managementReportCode || row.reportingCategory || '';
  const consCode = row.consReportCode || row.consAccount || '';
  const management = coaMasterLookup('MGMT', managementCode);
  const cons = coaMasterLookup('CONS', consCode);
  return {
    ...row,
    managementReportCode: managementCode || '',
    managementReportName: management ? management.name : (managementCode ? row.managementReportName || '' : ''),
    managementGroup1Code: management ? management.group1Code || '' : (managementCode ? row.managementGroup1Code || '' : ''),
    managementGroup1Name: management ? management.group1Name || '' : (managementCode ? row.managementGroup1Name || '' : ''),
    managementGroup2Code: management ? management.group2Code || '' : (managementCode ? row.managementGroup2Code || '' : ''),
    managementGroup2Name: management ? management.group2Name || '' : (managementCode ? row.managementGroup2Name || '' : ''),
    managementGroup3Code: management ? management.group3Code || '' : (managementCode ? row.managementGroup3Code || '' : ''),
    managementGroup3Name: management ? management.group3Name || '' : (managementCode ? row.managementGroup3Name || '' : ''),
    managementStatementType: management ? management.statementType || '' : (managementCode ? row.managementStatementType || '' : ''),
    managementReportActive: management ? Boolean(management.active) : Boolean(row.managementReportActive),
    consReportCode: consCode || '',
    consReportName: cons ? cons.name : (consCode ? row.consReportName || '' : ''),
    consGroup1Code: cons ? cons.group1Code || '' : (consCode ? row.consGroup1Code || '' : ''),
    consGroup1Name: cons ? cons.group1Name || '' : (consCode ? row.consGroup1Name || '' : ''),
    consGroup2Code: cons ? cons.group2Code || '' : (consCode ? row.consGroup2Code || '' : ''),
    consGroup2Name: cons ? cons.group2Name || '' : (consCode ? row.consGroup2Name || '' : ''),
    consGroup3Code: cons ? cons.group3Code || '' : (consCode ? row.consGroup3Code || '' : ''),
    consGroup3Name: cons ? cons.group3Name || '' : (consCode ? row.consGroup3Name || '' : ''),
    consStatementType: cons ? cons.statementType || '' : (consCode ? row.consStatementType || '' : ''),
    consReportActive: cons ? Boolean(cons.active) : Boolean(row.consReportActive),
    statementType: (management?.statementType || cons?.statementType || row.statementType || ''),
    hasGlValue: Boolean(row.hasGlValue),
  };
}

function coaIssues(row) {
  const issues = [];
  const managementCode = row.managementReportCode || '';
  const consCode = row.consReportCode || '';
  const management = managementCode ? coaMasterLookup('MGMT', managementCode) : null;
  const cons = consCode ? coaMasterLookup('CONS', consCode) : null;
  if (row.hasGlValue && !managementCode) issues.push('Hiányzó Management riportkód aktív főkönyvi értékkel.');
  if (row.hasGlValue && !consCode) issues.push('Hiányzó Konszi riportkód aktív főkönyvi értékkel.');
  if (managementCode && !management) issues.push(`Nem létező Management riportkód: ${managementCode}`);
  if (management && !management.active) issues.push(`Inaktív Management riportkód: ${managementCode}`);
  if (consCode && !cons) issues.push(`Nem létező Konszi riportkód: ${consCode}`);
  if (cons && !cons.active) issues.push(`Inaktív Konszi riportkód: ${consCode}`);
  if (row.hasGlValue && !row.statementType) issues.push('Hiányzó BS/PL aktív főkönyvi értékkel.');
  return issues;
}

function coaStatusCell(row) {
  const issues = coaIssues(row);
  if (!issues.length) return '<span class="row-status ok" title="Rendben">OK</span>';
  return `<button type="button" class="row-status bad" data-action="show-coa-issues" data-coa-id="${esc(row.id)}" title="${esc(issues.join('\n'))}">! ${issues.length}</button>`;
}

function fauxCheckbox(checked) {
  return `<span class="faux-checkbox ${checked ? 'checked' : ''}" aria-hidden="true"></span>`;
}

function checkboxSlot(content = '') {
  return `<span class="checkbox-slot ${content ? '' : 'empty'}">${content}</span>`;
}

function coaFlagControls(row, editable = false) {
  const summaryControl = editable
    ? `<input type="checkbox" data-coa-field="isSummary" ${row.isSummary ? 'checked' : ''}>`
    : fauxCheckbox(row.isSummary);
  const fxControl = editable
    ? `<input type="checkbox" data-coa-field="isFxTransDiff" ${row.isFxTransDiff ? 'checked' : ''}>`
    : fauxCheckbox(row.isFxTransDiff);
  return `
    <span class="coa-flag-cell ${editable ? 'coa-flag-editor' : ''}">
      <label class="compact-check" title="Összesítő sor">${summaryControl}<span>Össz.</span></label>
      <label class="compact-check" title="FX átértékelés különbség">${fxControl}<span>FX</span></label>
      <span class="coa-flag-token ${row.hasGlValue ? 'active' : 'empty'}" title="Van főkönyvi érték">GL</span>
    </span>
  `;
}

function coaReportOptions(type, selected = '') {
  const rows = type === 'CONS' ? state.coaReportMaster.cons : state.coaReportMaster.management;
  const activeRows = (rows || []).filter((row) => row.active || row.code === selected);
  const hasSelected = !selected || activeRows.some((row) => row.code === selected);
  return [
    '<option value=""></option>',
    ...activeRows.map((row) => `<option value="${esc(row.code)}" ${row.code === selected ? 'selected' : ''} ${row.active ? '' : 'disabled'}>${esc(row.code)} - ${esc(row.name)}${row.active ? '' : ' (inaktív)'}</option>`),
    hasSelected ? '' : `<option value="${esc(selected)}" selected>${esc(selected)} (nincs törzsben)</option>`,
  ].join('');
}

function coaFiltersFromDom(root) {
  return {
    search: root?.querySelector('[data-coa-filter="search"]')?.value.trim().toLowerCase() || '',
    statementType: root?.querySelector('[data-coa-filter="statementType"]')?.value || '',
    management: root?.querySelector('[data-coa-filter="management"]')?.value || '',
    cons: root?.querySelector('[data-coa-filter="cons"]')?.value || '',
    issue: root?.querySelector('[data-coa-filter="issue"]')?.value || '',
    selectedColumns: Array.from(root?.querySelectorAll('[data-coa-column]:checked') || []).map((input) => input.value),
  };
}

function coaRowVisible(row, filters = {}) {
  if (filters.statementType && row.statementType !== filters.statementType) return false;
  if (filters.management && row.managementReportCode !== filters.management) return false;
  if (filters.cons && row.consReportCode !== filters.cons) return false;
  const issues = coaIssues(row);
  if (filters.issue === 'errors' && !issues.length) return false;
  if (filters.issue === 'empty' && row.managementReportCode && row.consReportCode) return false;
  if (filters.search) {
    const haystack = [
      row.glNumber, row.glName,
      row.managementReportCode, row.managementReportName,
      row.consReportCode, row.consReportName,
      row.managementGroup1Code, row.managementGroup1Name,
      row.managementGroup2Code, row.managementGroup2Name,
      row.managementGroup3Code, row.managementGroup3Name,
      row.consGroup1Code, row.consGroup1Name,
      row.consGroup2Code, row.consGroup2Name,
      row.consGroup3Code, row.consGroup3Name,
    ].join(' ');
    if (!wildcardMatch(haystack, filters.search)) return false;
  }
  return true;
}

function coaCellValue(row, column) {
  if (column.key === 'select') return checkboxSlot(`<input type="checkbox" data-coa-row-id="${esc(row.id)}">`);
  if (column.key === 'status') return coaStatusCell(row);
  if (column.key === 'flags') return coaFlagControls(row, false);
  return esc(row[column.key] || '');
}

function renderCoaEditCell(row, column) {
  if (column.key === 'select') return checkboxSlot('');
  if (column.key === 'status') return coaStatusCell(row);
  if (column.key === 'glNumber') return esc(row.glNumber || '');
  if (column.key === 'glName') return `<input data-coa-field="glName" value="${esc(row.glName || '')}">`;
  if (column.key === 'managementReportCode') return `<select data-coa-field="reportingCategory">${coaReportOptions('MGMT', row.managementReportCode || '')}</select>`;
  if (column.key === 'consReportCode') return `<select data-coa-field="consAccount">${coaReportOptions('CONS', row.consReportCode || '')}</select>`;
  if (column.key === 'statementType') return `<select data-coa-field="statementType"><option value="BS" ${row.statementType === 'BS' ? 'selected' : ''}>BS</option><option value="PL" ${row.statementType === 'PL' ? 'selected' : ''}>PL</option></select>`;
  if (column.key === 'flags') return coaFlagControls(row, true);
  return coaCellValue(row, column);
}

function coaCellClass(column) {
  return [
    `col-${column.key}`,
    column.key === 'status' || column.key === 'select' ? 'center' : '',
  ].filter(Boolean).join(' ');
}

function renderCoaRow(row, columns = visibleCoaColumns()) {
  return `
    <tr data-coa-row data-coa-id="${esc(row.id)}" data-mode="view">
      ${columns.map((column) => `<td class="${coaCellClass(column)}" data-col-key="${esc(column.key)}">${coaCellValue(row, column)}</td>`).join('')}
    </tr>
  `;
}

function renderCoaEditRow(row, columns = visibleCoaColumns()) {
  return `
    <tr data-coa-row data-coa-id="${esc(row.id)}" data-mode="edit">
      ${columns.map((column) => `<td class="${coaCellClass(column)}" data-col-key="${esc(column.key)}">${renderCoaEditCell(row, column)}</td>`).join('')}
    </tr>
  `;
}

function renderCoaTable(rows, filters = {}) {
  const columns = visibleCoaColumns(filters.selectedColumns);
  const visibleRows = rows.filter((row) => coaRowVisible(row, filters));
  return `
    <div class="table-wrap coa-table-wrap">
      <table class="coa-table mgm-data-table stable-edit-table" ${fixedTableStyle ? fixedTableStyle(columns, 'coa') : ''}>
        ${colGroup ? colGroup(columns, 'coa') : ''}
        <thead><tr>${columns.map((column) => resizableTh(column.label, '', { scope: 'coa', key: column.key, reorder: true, width: column.width })).join('')}</tr></thead>
        <tbody>
          ${visibleRows.length ? visibleRows.map((row) => renderCoaRow(row, columns)).join('') : `<tr><td colspan="${columns.length}" class="empty">Nincs megjeleníthető számlatükör sor.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function refreshCoaTable(source) {
  const root = coaRootFromSource(source);
  const slot = root?.querySelector('[data-coa-table]');
  if (!slot) return;
  const filters = coaFiltersFromDom(root);
  saveCoaColumns(filters.selectedColumns);
  slot.innerHTML = renderCoaTable(window.__lastCoaRows || [], filters);
}

function coaRowById(id) {
  return (window.__lastCoaRows || []).find((row) => Number(row.id) === Number(id));
}

function replaceCoaRowInDom(id, row) {
  const rowEl = document.querySelector(`[data-coa-row][data-coa-id="${CSS.escape(String(id))}"]`);
  if (!rowEl) return;
  freezeTableColumnWidths?.(rowEl.closest('table'));
  const columns = visibleCoaColumns(coaFiltersFromDom(coaRootFromSource(rowEl)).selectedColumns);
  const holder = document.createElement('tbody');
  holder.innerHTML = renderCoaRow(row, columns);
  rowEl.replaceWith(holder.firstElementChild);
}

function setCoaRowEditing(rowEl) {
  if (!canPermission('coa', 'edit') || !rowEl || rowEl.dataset.mode === 'edit') return;
  const row = coaRowById(rowEl.dataset.coaId);
  if (!row) return;
  freezeTableColumnWidths?.(rowEl.closest('table'));
  const columns = visibleCoaColumns(coaFiltersFromDom(coaRootFromSource(rowEl)).selectedColumns);
  const holder = document.createElement('tbody');
  holder.innerHTML = renderCoaEditRow(row, columns);
  rowEl.replaceWith(holder.firstElementChild);
  document.querySelector(`[data-coa-row][data-coa-id="${CSS.escape(String(row.id))}"] [data-coa-field="glName"]`)?.focus();
}

function restoreCoaRow(rowEl) {
  const row = coaRowById(rowEl?.dataset.coaId);
  if (row) replaceCoaRowInDom(row.id, row);
}

function coaInlinePayload(rowEl) {
  const base = coaRowById(rowEl.dataset.coaId);
  const input = (field) => rowEl.querySelector(`[data-coa-field="${field}"]`);
  const value = (field) => input(field)?.value ?? '';
  const checked = (field) => Boolean(rowEl.querySelector(`[data-coa-field="${field}"]`)?.checked);
  return {
    id: base.id,
    glNumber: base.glNumber,
    glName: String(value('glName') || base.glName || '').trim(),
    reportingCategory: input('reportingCategory') ? value('reportingCategory') : base.managementReportCode || '',
    consAccount: input('consAccount') ? value('consAccount') : base.consReportCode || '',
    statementType: input('statementType') ? value('statementType') : base.statementType || 'BS',
    isSummary: rowEl.querySelector('[data-coa-field="isSummary"]') ? checked('isSummary') : Boolean(base.isSummary),
    isFxTransDiff: rowEl.querySelector('[data-coa-field="isFxTransDiff"]') ? checked('isFxTransDiff') : Boolean(base.isFxTransDiff),
  };
}

async function saveCoaInlineRow(rowEl) {
  if (!rowEl || rowEl.dataset.saving === '1') return false;
  const payload = coaInlinePayload(rowEl);
  if (!payload.glName) {
    setMessage('#coaMessage', 'A GL név kötelező.');
    rowEl.querySelector('[data-coa-field="glName"]')?.focus();
    return false;
  }
  rowEl.dataset.saving = '1';
  try {
    await api('/api/coa/manual', { method: 'POST', body: JSON.stringify(payload) });
    const idx = (window.__lastCoaRows || []).findIndex((row) => Number(row.id) === Number(payload.id));
    const next = hydrateCoaRow({
      ...(window.__lastCoaRows[idx] || {}),
      glName: payload.glName,
      reportingCategory: payload.reportingCategory,
      managementReportCode: payload.reportingCategory,
      consAccount: payload.consAccount,
      consReportCode: payload.consAccount,
      statementType: payload.statementType,
      isSummary: payload.isSummary,
      isFxTransDiff: payload.isFxTransDiff,
    });
    if (idx >= 0) window.__lastCoaRows[idx] = next;
    replaceCoaRowInDom(payload.id, next);
    setMessage('#coaMessage', 'Sor mentve.', true);
    return true;
  } catch (err) {
    setMessage('#coaMessage', err.message);
    rowEl.dataset.saving = '';
    return false;
  }
}

async function reportCodeOptionsForCoa(selectedManagement = '', selectedCons = '') {
  const master = await api('/api/master-data');
  const management = master.structures?.management?.reportCodes || [];
  const cons = master.structures?.consolidation?.reportCodes || [];
  return {
    management: masterOptions(management, selectedManagement),
    cons: masterOptions(cons, selectedCons),
  };
}

async function openCoaEditWindow(id) {
  const row = (window.__lastCoaRows || []).find((item) => Number(item.id) === Number(id));
  if (!row) return;
  const options = await reportCodeOptionsForCoa(row.managementReportCode || row.reportingCategory, row.consReportCode || row.consAccount);
  openAppWindow('coaEditWindow', 'Számlatükör sor szerkesztése', `
    <form data-form="coa-row-save" class="grid">
      <label>GL szám <input name="glNumber" value="${esc(row.glNumber)}" readonly></label>
      <label>GL megnevezés <input name="glName" value="${esc(row.glName)}" required></label>
      <label>Management riport kód <select name="reportingCategory">${options.management}</select></label>
      <label>Konszi riport kód <select name="consAccount">${options.cons}</select></label>
      <label>BS / PL <select name="statementType"><option>BS</option><option ${row.statementType === 'PL' ? 'selected' : ''}>PL</option></select></label>
      <div class="actions"><button type="submit">Mentés</button></div>
      <div data-window-message class="error-text"></div>
    </form>
  `, { width: 560, height: 440, preserve: true });
}

async function openCoaBulkEditWindow() {
  const ids = selectedCoaIds();
  if (!ids.length) {
    openResultWindow('Tömeges módosítás', '<div class="notice bad">Jelölj ki legalább egy számlatükör sort.</div>');
    return;
  }
  const options = await reportCodeOptionsForCoa();
  const noChangeOption = '<option value="">- nincs módosítás -</option>';
  openAppWindow('coaBulkEditWindow', 'Számlatükör tömeges módosítás', `
    <form data-form="coa-bulk-save" class="grid compact-bulk-form" data-coa-bulk-ids="${esc(ids.join(','))}">
      <div class="notice">${fmt(ids.length)} kijelölt sor módosítása. Csak a kiválasztott értékek íródnak át.</div>
      <label>Management riport kód <select name="reportingCategory">${noChangeOption}${options.management}</select></label>
      <label>Konszi riport kód <select name="consAccount">${noChangeOption}${options.cons}</select></label>
      <label>BS / PL
        <select name="statementType">
          ${noChangeOption}
          <option>BS</option>
          <option>PL</option>
        </select>
      </label>
      <label>Összesítő sor
        <select name="isSummaryBulk">
          ${noChangeOption}
          <option value="1">Igen</option>
          <option value="0">Nem</option>
        </select>
      </label>
      <label>FX átértékelés különbség
        <select name="isFxTransDiffBulk">
          ${noChangeOption}
          <option value="1">Igen</option>
          <option value="0">Nem</option>
        </select>
      </label>
      <div class="actions"><button type="submit">Módosítás</button></div>
      <div data-window-message class="error-text"></div>
    </form>
  `, { width: 620, height: 430, preserve: true });
}

async function renderCoa() {
  const [data, master] = await Promise.all([
    api(`/api/coa?companyId=${state.settings.activeCompanyId}&year=${state.settings.activeYear}`),
    api('/api/master-data'),
  ]);
  state.coaReportMaster = {
    management: master.structures?.management?.reportCodes || [],
    cons: master.structures?.consolidation?.reportCodes || [],
  };
  window.__lastCoaRows = (data.rows || []).map(hydrateCoaRow);
  const selectedColumns = selectedCoaColumns();
  const selectedColumnSet = new Set(selectedColumns);
  const managementOptions = (state.coaReportMaster.management || []).map((row) => `<option value="${esc(row.code)}">${esc(row.code)} - ${esc(row.name)}</option>`).join('');
  const consOptions = (state.coaReportMaster.cons || []).map((row) => `<option value="${esc(row.code)}">${esc(row.code)} - ${esc(row.name)}</option>`).join('');
  const coaActions = [
    canPermission('coa', 'import') ? '<button type="button" data-action="open-coa-import-window">Import</button>' : '',
    canPermission('coa', 'edit') ? '<button type="button" class="secondary" data-action="open-coa-bulk-edit-window">Tömeges módosítás</button>' : '',
    canPermission('coa', 'edit') ? '<button type="button" class="secondary" data-action="open-summary-rules-window">Sorszabályok</button>' : '',
    canPermission('coa', 'view') ? '<button type="button" class="secondary" data-action="open-master-data-window">Törzsadatok</button>' : '',
  ].filter(Boolean).join('');
  content(`
    <div data-coa-root>
    ${pageHead('Számlatükör', 'GL számok hozzárendelése Management és Konszi riport struktúrákhoz.', coaActions)}
    ${canPermission('coa', 'edit') || canPermission('coa', 'import') ? `
      <div id="coaMessage" class="success-text"></div>
    ` : ''}
    <section class="panel coa-filter-panel">
      <div class="form-row compact">
        <label>GL keresés <input data-coa-filter="search" placeholder="GL szám / név / riport / csoport"></label>
        <label>BS / PL
          <select data-coa-filter="statementType"><option value="">Mind</option><option>BS</option><option>PL</option></select>
        </label>
        <label>Management riport
          <select data-coa-filter="management"><option value="">Mind</option>${managementOptions}</select>
        </label>
        <label>Konszi riport
          <select data-coa-filter="cons"><option value="">Mind</option>${consOptions}</select>
        </label>
        <label>Állapot
          <select data-coa-filter="issue"><option value="">Mind</option><option value="errors">Csak hibás</option><option value="empty">Üres hozzárendelés</option></select>
        </label>
        <details class="column-chooser">
          <summary>Oszlopok</summary>
          <div class="column-chooser-panel" data-column-family="coa">
            <label class="checkline column-chooser-all"><input type="checkbox" data-coa-column-all ${selectedColumns.length === coaOptionalColumnKeys().length ? 'checked' : ''}> Mind</label>
            <button type="button" class="secondary slim column-reset" data-column-reset="coa">Nézet alaphelyzetbe</button>
            ${[
              ...visibleCoaColumns(selectedColumns),
              ...coaColumnDefs.filter((column) => column.optional && !selectedColumnSet.has(column.key)),
            ].map((column) => `
              <div class="checkline column-option-row" data-column-option-row data-column-key="${esc(column.key)}">
                <span class="column-drag-handle" draggable="true" data-column-drag-handle data-column-family="coa" data-column-key="${esc(column.key)}" title="Húzással rendezhető">☰</span>
                ${column.fixed
                  ? `<input type="checkbox" data-column-fixed value="${esc(column.key)}" checked disabled>`
                  : `<input type="checkbox" data-coa-column data-column-key="${esc(column.key)}" value="${esc(column.key)}" ${selectedColumnSet.has(column.key) ? 'checked' : ''}>`}
                <span>${esc(column.label)}</span>
              </div>
            `).join('')}
          </div>
        </details>
      </div>
    </section>
    <div data-coa-table style="margin-top:10px">
      ${renderCoaTable(window.__lastCoaRows, {
        search: '',
        statementType: '',
        management: '',
        cons: '',
        issue: '',
        selectedColumns,
      })}
    </div>
    </div>
  `);
}

    return {
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
    };
  }

  window.MGM_COA_UI = {
    createCoaUi,
  };
}());
