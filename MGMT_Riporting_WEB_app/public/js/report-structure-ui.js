(function () {
  function createReportStructureUi(deps) {
    const {
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
      hydrateCoaRow,
      refreshCoaTable,
      normalizePrefixedCodeValue,
    } = deps;

const reportStructureDefs = [
  { key: 'management', type: 'MGMT', title: 'Management riport törzs', reportPrefix: 'mrk_', groupPrefixes: { 1: 'mcs1_', 2: 'mcs2_', 3: 'mcs3_' } },
  { key: 'consolidation', type: 'CONS', title: 'Konszolidációs riport törzs', reportPrefix: 'krk_', groupPrefixes: { 1: 'kcs1_', 2: 'kcs2_', 3: 'kcs3_' } },
];

function masterOptions(rows = [], selected = '') {
  return [
    '<option value=""></option>',
    ...rows.map((row) => `<option value="${esc(row.code)}" ${String(row.code) === String(selected) ? 'selected' : ''}>${esc(row.code)} - ${esc(row.name)}</option>`),
  ].join('');
}

function reportCodeOptions(rows = [], selected = '') {
  return [
    '<option value="" data-name=""></option>',
    ...rows.map((row) => `<option value="${esc(row.code)}" data-name="${esc(row.name)}" ${String(row.code) === String(selected) ? 'selected' : ''}>${esc(row.code)}</option>`),
  ].join('');
}

function activeText(row) {
  return row.active ? 'Igen' : 'Nem';
}

function structureDef(type) {
  return reportStructureDefs.find((def) => def.type === type) || reportStructureDefs[0];
}

function reportGroupPrefix(def, level) {
  return def.groupPrefixes?.[Number(level)] || '';
}

function reportGroupActive(row) {
  return row.active !== false && row.active !== 0;
}

function reportGroupUsageBadge(row) {
  const usageCount = Number(row.usageCount || 0);
  if (usageCount > 0) {
    return `<span class="usage-badge used" title="Riport törzsben használatban">! ${fmt(usageCount)}</span>`;
  }
  return '<span class="usage-badge free" title="Nincs riport törzsben használva">Szabad</span>';
}

function checkboxSlot(content = '') {
  return `<span class="checkbox-slot ${content ? '' : 'empty'}">${content}</span>`;
}

function canEditMasterData() {
  return canPermission('coa', 'edit');
}

function canDeleteMasterData() {
  return canPermission('coa', 'delete');
}

function canImportMasterData() {
  return canPermission('coa', 'import');
}

const reportGroupColumnDefs = [
  { key: 'select', label: '', width: 42 },
  { key: 'code', label: 'Kód', width: 180 },
  { key: 'name', label: 'Megnevezés', width: 340 },
  { key: 'usage', label: 'Használat', width: 96 },
  { key: 'active', label: 'Aktív', width: 64 },
];

function reportGroupCellClass(key) {
  return [
    `col-${key}`,
    ['select', 'usage', 'active'].includes(key) ? 'center' : '',
  ].filter(Boolean).join(' ');
}

function renderReportGroupTableRow(def, level, row = {}, mode = 'view') {
  const prefix = reportGroupPrefix(def, level);
  const isNew = mode === 'new';
  const active = isNew ? true : reportGroupActive(row);
  const code = isNew ? prefix : (row.code || prefix);
  const usageCount = Number(row.usageCount || 0);
  if (isNew && !canEditMasterData()) return '';
  const cells = {
    select: isNew ? checkboxSlot('') : checkboxSlot(`<input type="checkbox" data-report-group-delete-select value="${esc(row.code || '')}" ${usageCount > 0 || !canDeleteMasterData() ? 'disabled' : ''}>`),
    code: isNew
      ? `<input data-report-group-field="code" data-code-prefix="${esc(prefix)}" value="${esc(code)}" placeholder="${esc(prefix)}">`
      : esc(row.code || ''),
    name: isNew
      ? '<input data-report-group-field="name" value="">'
      : esc(row.name || ''),
    usage: isNew ? '' : reportGroupUsageBadge(row),
    active: isNew
      ? `<input type="checkbox" data-report-group-field="active" ${active ? 'checked' : ''}>`
      : `<input type="checkbox" data-report-group-active ${active ? 'checked' : ''} ${canEditMasterData() ? '' : 'disabled'}>`,
  };
  return `
    <tr data-report-group-row data-mode="${isNew ? 'new' : 'view'}" data-structure-type="${esc(def.type)}" data-group-level="${level}" data-prefix="${esc(prefix)}" data-code="${esc(row.code || '')}" data-name="${esc(row.name || '')}" data-active="${active ? '1' : '0'}" data-usage-count="${usageCount}">
      ${reportGroupColumnDefs.map((column) => `<td class="${reportGroupCellClass(column.key)}" data-col-key="${esc(column.key)}">${cells[column.key] || ''}</td>`).join('')}
    </tr>
  `;
}

function renderReportGroupBlock(def, data, level) {
  const rows = data[`groups${level}`] || [];
  const scope = `report-group-${def.type}-${level}`;
  return `
    <section class="panel flat-panel report-master-card">
      <div class="report-group-toolbar">
        <h3 class="subhead">Csoport${level}</h3>
        <div class="actions">
          <button type="button" class="secondary slim" data-action="download-report-group-template" data-structure-type="${esc(def.type)}" data-group-level="${level}">Template</button>
          ${canDeleteMasterData() ? `<button type="button" class="danger slim" data-action="delete-report-groups" data-structure-type="${esc(def.type)}" data-group-level="${level}">Kijelölt törlése</button>` : ''}
        </div>
      </div>
      <div class="table-wrap report-group-grid-wrap">
        <table class="report-group-grid stable-edit-table" ${fixedTableStyle ? fixedTableStyle(reportGroupColumnDefs, scope) : ''}>
          ${colGroup ? colGroup(reportGroupColumnDefs, scope) : ''}
          <thead>
            <tr>
              ${reportGroupColumnDefs.map((column) => resizableTh(column.label, '', { scope, key: column.key, width: column.width })).join('')}
            </tr>
          </thead>
          <tbody data-report-group-grid="${esc(def.type)}-${level}">
            ${rows.map((row) => renderReportGroupTableRow(def, level, row)).join('')}
            ${renderReportGroupTableRow(def, level, {}, 'new')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function reportGroupRowPayload(row) {
  const codeInput = row.querySelector('[data-report-group-field="code"]');
  const nameInput = row.querySelector('[data-report-group-field="name"]');
  const activeInput = row.querySelector('[data-report-group-field="active"], [data-report-group-active]');
  const prefix = row.dataset.prefix || codeInput?.dataset?.codePrefix || '';
  return {
    structureType: row.dataset.structureType || '',
    groupLevel: Number(row.dataset.groupLevel || 1),
    code: normalizePrefixedCodeValue(codeInput ? codeInput.value : row.dataset.code || '', prefix),
    name: String(nameInput ? nameInput.value : row.dataset.name || '').trim(),
    active: activeInput ? Boolean(activeInput.checked) : row.dataset.active !== '0',
  };
}

function reportGroupRowReady(row) {
  const payload = reportGroupRowPayload(row);
  const prefix = row.dataset.prefix || '';
  return Boolean(payload.code && payload.code !== prefix && payload.name);
}

function focusReportGroupMissingField(row) {
  const payload = reportGroupRowPayload(row);
  const prefix = row.dataset.prefix || '';
  const codeInput = row.querySelector('[data-report-group-field="code"]');
  const nameInput = row.querySelector('[data-report-group-field="name"]');
  if (!payload.code || payload.code === prefix) {
    codeInput?.focus();
    return true;
  }
  if (!payload.name) {
    nameInput?.focus();
    return true;
  }
  return false;
}

function setReportGroupRowEditing(row) {
  if (!canEditMasterData() || row.dataset.mode !== 'view') return;
  freezeTableColumnWidths?.(row.closest('table'));
  const prefix = row.dataset.prefix || '';
  const code = row.dataset.code || prefix;
  const name = row.dataset.name || '';
  const active = row.querySelector('[data-report-group-active]')?.checked ?? row.dataset.active !== '0';
  row.dataset.mode = 'edit';
  row.innerHTML = `
    <td class="${reportGroupCellClass('select')}" data-col-key="select">${checkboxSlot('')}</td>
    <td class="${reportGroupCellClass('code')} report-group-code-cell" data-col-key="code"><input data-report-group-field="code" data-code-prefix="${esc(prefix)}" value="${esc(code)}" readonly title="A kód kulcsmező, meglévő sornál nem módosítható."></td>
    <td class="${reportGroupCellClass('name')}" data-col-key="name"><input data-report-group-field="name" value="${esc(name)}"></td>
    <td class="${reportGroupCellClass('usage')}" data-col-key="usage">${reportGroupUsageBadge({ usageCount: Number(row.dataset.usageCount || 0) })}</td>
    <td class="${reportGroupCellClass('active')}" data-col-key="active"><input type="checkbox" data-report-group-field="active" ${active ? 'checked' : ''}></td>
  `;
  row.querySelector('[data-report-group-field="name"]')?.focus();
}

function restoreReportGroupRow(row) {
  if (row.dataset.mode !== 'edit') return;
  const def = structureDef(row.dataset.structureType);
  const level = Number(row.dataset.groupLevel || 1);
  const holder = document.createElement('tbody');
  holder.innerHTML = renderReportGroupTableRow(def, level, {
    code: row.dataset.code,
    name: row.dataset.name,
    active: row.dataset.active !== '0',
    usageCount: Number(row.dataset.usageCount || 0),
  });
  row.replaceWith(holder.firstElementChild);
}

function replaceReportGroupRowInline(row, payload) {
  const def = structureDef(payload.structureType);
  const level = Number(payload.groupLevel || 1);
  const wasNew = row.dataset.mode === 'new';
  freezeTableColumnWidths?.(row.closest('table'));
  const holder = document.createElement('tbody');
  holder.innerHTML = renderReportGroupTableRow(def, level, {
    code: payload.code,
    name: payload.name,
    active: payload.active,
    usageCount: Number(row.dataset.usageCount || 0),
  });
  const savedRow = holder.firstElementChild;
  row.replaceWith(savedRow);
  if (wasNew) {
    const hasTrailingNewRow = savedRow.nextElementSibling?.matches?.('[data-report-group-row][data-mode="new"]');
    if (!hasTrailingNewRow) savedRow.insertAdjacentHTML('afterend', renderReportGroupTableRow(def, level, {}, 'new'));
  }
  return savedRow;
}

function reportGroupRowHasDraft(row) {
  if (!row || row.dataset.mode !== 'new') return false;
  const payload = reportGroupRowPayload(row);
  const prefix = row.dataset.prefix || '';
  return Boolean((payload.code && payload.code !== prefix) || payload.name);
}

function removeEmptyReportGroupDraftRowsAfter(row) {
  let next = row?.nextElementSibling;
  while (next?.matches?.('[data-report-group-row][data-mode="new"]')) {
    const current = next;
    next = next.nextElementSibling;
    if (!reportGroupRowHasDraft(current)) current.remove();
  }
}

function reportGroupDuplicateMessage(row, payload = reportGroupRowPayload(row)) {
  const grid = row?.closest('[data-report-group-grid]');
  if (!grid) return '';
  const code = String(payload.code || '').trim().toLowerCase();
  const name = String(payload.name || '').trim().toLowerCase();
  const prefix = String(row.dataset.prefix || '').toLowerCase();
  if (!code || code === prefix) return '';
  const duplicate = Array.from(grid.querySelectorAll('[data-report-group-row]')).find((other) => {
    if (other === row) return false;
    const otherPayload = reportGroupRowPayload(other);
    const otherPrefix = String(other.dataset.prefix || '').toLowerCase();
    const otherCode = String(otherPayload.code || '').trim().toLowerCase();
    const otherName = String(otherPayload.name || '').trim().toLowerCase();
    return (otherCode && otherCode !== otherPrefix && otherCode === code) || (name && otherName === name);
  });
  if (!duplicate) return '';
  const duplicatePayload = reportGroupRowPayload(duplicate);
  if (String(duplicatePayload.code || '').trim().toLowerCase() === code) {
    return `Nem menthető: ilyen kód már van (${payload.code}).`;
  }
  return `Nem menthető: ilyen megnevezés már van (${payload.name}).`;
}

function ensureReportGroupDraftRow(row) {
  if (!reportGroupRowHasDraft(row)) return;
  const grid = row.closest('[data-report-group-grid]');
  if (!grid) return;
  if (!reportGroupRowReady(row) || reportGroupDuplicateMessage(row)) {
    removeEmptyReportGroupDraftRowsAfter(row);
    return;
  }
  const newRows = Array.from(grid.querySelectorAll('[data-report-group-row][data-mode="new"]'));
  if (newRows[newRows.length - 1] !== row) return;
  const def = structureDef(row.dataset.structureType);
  const level = Number(row.dataset.groupLevel || 1);
  grid.insertAdjacentHTML('beforeend', renderReportGroupTableRow(def, level, {}, 'new'));
}

function updateReportCodeGroupOption(structureType, groupLevel, group) {
  const win = document.querySelector(`#reportStructureWindow${structureType}`);
  if (!win) return;
  const key = `group${groupLevel}`;
  const structure = win.__reportStructureData || {};
  const groupKey = `groups${groupLevel}`;
  const groups = Array.isArray(structure[groupKey]) ? structure[groupKey] : [];
  const existingIdx = groups.findIndex((row) => row.code === group.code);
  const nextGroup = {
    ...(existingIdx >= 0 ? groups[existingIdx] : {}),
    code: group.code,
    name: group.name,
    active: group.active !== false,
  };
  if (existingIdx >= 0) groups[existingIdx] = nextGroup;
  else groups.push(nextGroup);
  groups.sort((a, b) => String(a.code).localeCompare(String(b.code), 'hu'));
  win.__reportStructureData = { ...structure, [groupKey]: groups };
  win.querySelectorAll(`[data-report-group-select="${key}"]`).forEach((select) => {
    let option = Array.from(select.options).find((item) => item.value === group.code);
    if (!option) {
      option = document.createElement('option');
      option.value = group.code;
      select.appendChild(option);
    }
    option.textContent = group.code;
    option.dataset.name = group.name;
    if (select.value === group.code) {
      const row = select.closest('[data-report-code-row]');
      const target = row?.querySelector(`[data-report-group-name="${key}"]`);
      if (target) target.value = group.name;
    }
  });
}

function removeReportCodeGroupOptions(structureType, groupLevel, codes = []) {
  const win = document.querySelector(`#reportStructureWindow${structureType}`);
  if (!win) return;
  const codeSet = new Set(codes);
  const key = `group${groupLevel}`;
  const structure = win.__reportStructureData || {};
  const groupKey = `groups${groupLevel}`;
  win.__reportStructureData = {
    ...structure,
    [groupKey]: (structure[groupKey] || []).filter((row) => !codeSet.has(row.code)),
  };
  win.querySelectorAll(`[data-report-group-select="${key}"]`).forEach((select) => {
    const selectedRemoved = codeSet.has(select.value);
    Array.from(select.options).forEach((option) => {
      if (codeSet.has(option.value)) option.remove();
    });
    if (selectedRemoved) {
      select.value = '';
      const row = select.closest('[data-report-code-row]');
      const target = row?.querySelector(`[data-report-group-name="${key}"]`);
      if (target) target.value = '';
    }
  });
}

async function saveReportGroupRow(row, options = {}) {
  if (!canEditMasterData() || !row || row.dataset.saving === '1') return false;
  if (!reportGroupRowReady(row)) {
    if (!options.silentIncomplete) focusReportGroupMissingField(row);
    return false;
  }
  const payload = reportGroupRowPayload(row);
  const windowId = row.closest('.mgm-window')?.id;
  const duplicateMessage = reportGroupDuplicateMessage(row, payload);
  if (duplicateMessage) {
    removeEmptyReportGroupDraftRowsAfter(row);
    if (windowId) setWindowMessage(windowId, duplicateMessage);
    const field = duplicateMessage.includes('megnevezés') ? 'name' : 'code';
    if (!options.silentIncomplete) row.querySelector(`[data-report-group-field="${field}"]`)?.focus();
    return false;
  }
  row.dataset.saving = '1';
  try {
    await api('/api/master-data/report-groups', {
      method: 'POST',
      body: JSON.stringify({ ...payload, mode: row.dataset.mode === 'new' ? 'create' : 'update' }),
    });
    updateReportCodeGroupOption(payload.structureType, payload.groupLevel, payload);
    if (options.activeOnly) {
      row.dataset.code = payload.code;
      row.dataset.name = payload.name;
      row.dataset.active = payload.active ? '1' : '0';
      row.dataset.saving = '';
      if (windowId) setWindowMessage(windowId, 'Mentve.', true);
      return true;
    }
    replaceReportGroupRowInline(row, payload);
    if (windowId) setWindowMessage(windowId, 'Mentve.', true);
    return true;
  } catch (err) {
    removeEmptyReportGroupDraftRowsAfter(row);
    if (options.previousActive !== undefined) {
      const activeInput = row.querySelector('[data-report-group-active], [data-report-group-field="active"]');
      if (activeInput) activeInput.checked = Boolean(options.previousActive);
    }
    if (windowId) setWindowMessage(windowId, err.message);
    row.dataset.saving = '';
    return false;
  }
}

function statementOptions(selected = '') {
  return `<option value=""></option><option value="BS" ${selected === 'BS' ? 'selected' : ''}>BS</option><option value="PL" ${selected === 'PL' ? 'selected' : ''}>PL</option>`;
}

function hydrateReportCodeRows(rows = [], data = {}) {
  const names = {};
  [1, 2, 3].forEach((level) => {
    names[level] = new Map((data[`groups${level}`] || []).map((row) => [String(row.code), row.name]));
  });
  return rows.map((row) => ({
    ...row,
    group1Name: row.group1Code ? names[1].get(String(row.group1Code)) || '' : '',
    group2Name: row.group2Code ? names[2].get(String(row.group2Code)) || '' : '',
    group3Name: row.group3Code ? names[3].get(String(row.group3Code)) || '' : '',
  }));
}

function preserveReportCodeDraft(type) {
  delete state.reportCodeDrafts[type];
}

const reportCodeColumnDefs = [
  { key: 'select', label: '', fixed: true, width: 42 },
  { key: 'code', label: 'Riport kód', fixed: true, width: 190 },
  { key: 'name', label: 'Riport kód elnevezés', fixed: true, width: 230 },
  { key: 'statementType', label: 'BS/PL', fixed: true, width: 80 },
  { key: 'usage', label: 'Használat', fixed: true, width: 92 },
  { key: 'active', label: 'Aktív', fixed: true, width: 64 },
  { key: 'group1Code', label: 'Csoport1', optional: true, width: 160 },
  { key: 'group1Name', label: 'Csoport1 elnevezés', optional: true, width: 210 },
  { key: 'group1Required', label: 'Csoport1 kötelező', optional: true, width: 120 },
  { key: 'group2Code', label: 'Csoport2', optional: true, width: 160 },
  { key: 'group2Name', label: 'Csoport2 elnevezés', optional: true, width: 210 },
  { key: 'group2Required', label: 'Csoport2 kötelező', optional: true, width: 120 },
  { key: 'group3Code', label: 'Csoport3', optional: true, width: 160 },
  { key: 'group3Name', label: 'Csoport3 elnevezés', optional: true, width: 210 },
  { key: 'group3Required', label: 'Csoport3 kötelező', optional: true, width: 120 },
];

const defaultReportCodeOptionalColumns = [
  'group1Code',
  'group1Name',
  'group1Required',
  'group2Code',
  'group2Name',
  'group2Required',
  'group3Code',
  'group3Name',
  'group3Required',
];

function reportCodeOptionalColumnKeys() {
  return reportCodeColumnDefs.filter((column) => column.optional).map((column) => column.key);
}

function selectedReportCodeColumns(type) {
  const valid = new Set(reportCodeOptionalColumnKeys());
  const selected = Array.isArray(state.reportCodeColumns?.[type])
    ? state.reportCodeColumns[type].filter((key) => valid.has(key))
    : defaultReportCodeOptionalColumns;
  return selected;
}

function saveReportCodeColumns(type, columns) {
  if (!Array.isArray(columns)) {
    state.reportCodeColumns = { ...(state.reportCodeColumns || {}) };
    delete state.reportCodeColumns[type];
    localStorage.setItem('mgmReportCodeColumns', JSON.stringify(state.reportCodeColumns));
    return;
  }
  state.reportCodeColumns = { ...(state.reportCodeColumns || {}), [type]: columns };
  localStorage.setItem('mgmReportCodeColumns', JSON.stringify(state.reportCodeColumns));
}

function visibleReportCodeColumns(type) {
  const selected = selectedReportCodeColumns(type);
  const fixed = reportCodeColumnDefs.filter((column) => column.fixed);
  const optionalByKey = new Map(reportCodeColumnDefs.filter((column) => column.optional).map((column) => [column.key, column]));
  const orderedOptional = selected.map((key) => optionalByKey.get(key)).filter(Boolean);
  const scope = `report-code-${type}`;
  return applyColumnOrder ? applyColumnOrder(scope, [...fixed, ...orderedOptional]) : [...fixed, ...orderedOptional];
}

function reportCodeUsageBadge(row) {
  const usageCount = Number(row.usageCount || 0);
  if (usageCount > 0) return `<span class="usage-badge used" title="Számlatükörben használatban">! ${fmt(usageCount)}</span>`;
  return '<span class="usage-badge free" title="Nincs számlatükör hivatkozás">Szabad</span>';
}

function reportCodeGroupName(data, level, code) {
  return code ? (data[`groups${level}`] || []).find((row) => row.code === code)?.name || '' : '';
}

function reportCodeRowData(row = {}, data = {}) {
  return {
    ...row,
    group1Name: row.group1Name || reportCodeGroupName(data, 1, row.group1Code),
    group2Name: row.group2Name || reportCodeGroupName(data, 2, row.group2Code),
    group3Name: row.group3Name || reportCodeGroupName(data, 3, row.group3Code),
    active: row.active !== false,
    group1Required: row.group1Required !== false,
    group2Required: row.group2Required !== false,
    group3Required: Boolean(row.group3Required),
    usageCount: Number(row.usageCount || 0),
  };
}

function reportCodeViewCell(def, data, row, column, isNew = false) {
  if (column.key === 'select') return isNew ? checkboxSlot('') : checkboxSlot(`<input type="checkbox" data-report-code-delete-select value="${esc(row.code || '')}" ${row.usageCount > 0 || !canDeleteMasterData() ? 'disabled' : ''}>`);
  if (column.key === 'active') return isNew
    ? `<input type="checkbox" data-report-code-field="active" checked>`
    : `<input type="checkbox" data-report-code-active ${row.active ? 'checked' : ''} ${canEditMasterData() ? '' : 'disabled'}>`;
  if (column.key === 'usage') return isNew ? '' : reportCodeUsageBadge(row);
  if (column.key === 'code') return isNew
    ? `<input data-report-code-field="code" data-code-prefix="${esc(def.reportPrefix || '')}" value="${esc(def.reportPrefix || '')}" placeholder="${esc(def.reportPrefix || '')}">`
    : esc(row.code || '');
  if (column.key === 'name') return isNew ? '<input data-report-code-field="name" value="">' : esc(row.name || '');
  if (column.key === 'statementType') return isNew ? `<select data-report-code-field="statementType">${statementOptions('')}</select>` : esc(row.statementType || '');
  if (column.key === 'group1Code') return isNew ? `<select data-report-code-field="group1Code" data-report-group-select="group1">${reportCodeOptions(data.groups1 || [], '')}</select>` : esc(row.group1Code || '');
  if (column.key === 'group1Name') return isNew ? '<input data-report-group-name="group1" value="" readonly>' : esc(row.group1Name || '');
  if (column.key === 'group1Required') return `<input type="checkbox" ${isNew ? 'data-report-code-field="group1Required" checked' : `${row.group1Required ? 'checked' : ''} disabled`}>`;
  if (column.key === 'group2Code') return isNew ? `<select data-report-code-field="group2Code" data-report-group-select="group2">${reportCodeOptions(data.groups2 || [], '')}</select>` : esc(row.group2Code || '');
  if (column.key === 'group2Name') return isNew ? '<input data-report-group-name="group2" value="" readonly>' : esc(row.group2Name || '');
  if (column.key === 'group2Required') return `<input type="checkbox" ${isNew ? 'data-report-code-field="group2Required" checked' : `${row.group2Required ? 'checked' : ''} disabled`}>`;
  if (column.key === 'group3Code') return isNew ? `<select data-report-code-field="group3Code" data-report-group-select="group3">${reportCodeOptions(data.groups3 || [], '')}</select>` : esc(row.group3Code || '');
  if (column.key === 'group3Name') return isNew ? '<input data-report-group-name="group3" value="" readonly>' : esc(row.group3Name || '');
  if (column.key === 'group3Required') return `<input type="checkbox" ${isNew ? 'data-report-code-field="group3Required"' : `${row.group3Required ? 'checked' : ''} disabled`}>`;
  return '';
}

function reportCodeEditCell(def, data, row, column) {
  if (column.key === 'select') return checkboxSlot('');
  if (column.key === 'active') return `<input type="checkbox" data-report-code-field="active" ${row.active ? 'checked' : ''}>`;
  if (column.key === 'usage') return reportCodeUsageBadge(row);
  if (column.key === 'code') return `<input data-report-code-field="code" data-code-prefix="${esc(def.reportPrefix || '')}" value="${esc(row.code || '')}" readonly title="A kód kulcsmező, meglévő sornál nem módosítható.">`;
  if (column.key === 'name') return `<input data-report-code-field="name" value="${esc(row.name || '')}">`;
  if (column.key === 'statementType') return `<select data-report-code-field="statementType">${statementOptions(row.statementType || '')}</select>`;
  if (column.key === 'group1Code') return `<select data-report-code-field="group1Code" data-report-group-select="group1">${reportCodeOptions(data.groups1 || [], row.group1Code || '')}</select>`;
  if (column.key === 'group1Name') return `<input data-report-group-name="group1" value="${esc(row.group1Name || '')}" readonly>`;
  if (column.key === 'group1Required') return `<input type="checkbox" data-report-code-field="group1Required" ${row.group1Required ? 'checked' : ''}>`;
  if (column.key === 'group2Code') return `<select data-report-code-field="group2Code" data-report-group-select="group2">${reportCodeOptions(data.groups2 || [], row.group2Code || '')}</select>`;
  if (column.key === 'group2Name') return `<input data-report-group-name="group2" value="${esc(row.group2Name || '')}" readonly>`;
  if (column.key === 'group2Required') return `<input type="checkbox" data-report-code-field="group2Required" ${row.group2Required ? 'checked' : ''}>`;
  if (column.key === 'group3Code') return `<select data-report-code-field="group3Code" data-report-group-select="group3">${reportCodeOptions(data.groups3 || [], row.group3Code || '')}</select>`;
  if (column.key === 'group3Name') return `<input data-report-group-name="group3" value="${esc(row.group3Name || '')}" readonly>`;
  if (column.key === 'group3Required') return `<input type="checkbox" data-report-code-field="group3Required" ${row.group3Required ? 'checked' : ''}>`;
  return '';
}

function reportCodeCellClass(column) {
  return [
    `col-${column.key}`,
    ['select', 'active', 'usage', 'group1Required', 'group2Required', 'group3Required'].includes(column.key) ? 'center' : '',
  ].filter(Boolean).join(' ');
}

function renderReportCodeGridRow(def, data, row = {}, mode = 'view') {
  const columns = visibleReportCodeColumns(def.type);
  const isNew = mode === 'new';
  if (isNew && !canEditMasterData()) return '';
  const normalized = isNew ? { active: true, group1Required: true, group2Required: true, group3Required: false } : reportCodeRowData(row, data);
  return `
    <tr data-report-code-row data-mode="${isNew ? 'new' : 'view'}" data-structure-type="${esc(def.type)}" data-prefix="${esc(def.reportPrefix || '')}" data-code="${esc(normalized.code || '')}" data-name="${esc(normalized.name || '')}" data-statement-type="${esc(normalized.statementType || '')}" data-group1-code="${esc(normalized.group1Code || '')}" data-group1-name="${esc(normalized.group1Name || '')}" data-group1-required="${normalized.group1Required ? '1' : '0'}" data-group2-code="${esc(normalized.group2Code || '')}" data-group2-name="${esc(normalized.group2Name || '')}" data-group2-required="${normalized.group2Required ? '1' : '0'}" data-group3-code="${esc(normalized.group3Code || '')}" data-group3-name="${esc(normalized.group3Name || '')}" data-group3-required="${normalized.group3Required ? '1' : '0'}" data-active="${normalized.active ? '1' : '0'}" data-usage-count="${Number(normalized.usageCount || 0)}">
      ${columns.map((column) => `<td class="${reportCodeCellClass(column)}" data-col-key="${esc(column.key)}">${isNew ? reportCodeViewCell(def, data, {}, column, true) : reportCodeViewCell(def, data, normalized, column)}</td>`).join('')}
    </tr>
  `;
}

function renderReportCodeEditRow(def, data, row = {}) {
  const columns = visibleReportCodeColumns(def.type);
  const normalized = reportCodeRowData(row, data);
  return `
    <tr data-report-code-row data-mode="edit" data-structure-type="${esc(def.type)}" data-prefix="${esc(def.reportPrefix || '')}" data-code="${esc(normalized.code || '')}" data-name="${esc(normalized.name || '')}" data-statement-type="${esc(normalized.statementType || '')}" data-group1-code="${esc(normalized.group1Code || '')}" data-group1-name="${esc(normalized.group1Name || '')}" data-group1-required="${normalized.group1Required ? '1' : '0'}" data-group2-code="${esc(normalized.group2Code || '')}" data-group2-name="${esc(normalized.group2Name || '')}" data-group2-required="${normalized.group2Required ? '1' : '0'}" data-group3-code="${esc(normalized.group3Code || '')}" data-group3-name="${esc(normalized.group3Name || '')}" data-group3-required="${normalized.group3Required ? '1' : '0'}" data-active="${normalized.active ? '1' : '0'}" data-usage-count="${Number(normalized.usageCount || 0)}">
      ${columns.map((column) => `<td class="${reportCodeCellClass(column)}" data-col-key="${esc(column.key)}">${reportCodeEditCell(def, data, normalized, column)}</td>`).join('')}
    </tr>
  `;
}

function renderReportCodeBlock(def, data) {
  const displayRows = hydrateReportCodeRows(data.reportCodes || [], data);
  const selectedColumns = selectedReportCodeColumns(def.type);
  const selectedColumnSet = new Set(selectedColumns);
  const columns = visibleReportCodeColumns(def.type);
  return `
    <section class="report-code-grid-form" data-report-code-root="${esc(def.type)}">
      <div class="report-grid-toolbar">
        <strong>Riport kódok</strong>
        <div class="actions">
          ${canDeleteMasterData() ? `<button type="button" class="danger slim" data-action="delete-report-codes" data-structure-type="${esc(def.type)}">Kijelölt törlése</button>` : ''}
          <details class="column-chooser">
            <summary>Oszlopok</summary>
            <div class="column-chooser-panel" data-column-family="report-code" data-structure-type="${esc(def.type)}">
              <label class="checkline column-chooser-all"><input type="checkbox" data-report-code-column-all data-structure-type="${esc(def.type)}" ${selectedColumns.length === reportCodeOptionalColumnKeys().length ? 'checked' : ''}> Mind</label>
              <button type="button" class="secondary slim column-reset" data-column-reset="report-code" data-structure-type="${esc(def.type)}">Nézet alaphelyzetbe</button>
              ${[
                ...visibleReportCodeColumns(def.type),
                ...reportCodeColumnDefs.filter((column) => column.optional && !selectedColumnSet.has(column.key)),
              ].map((column) => `
                <div class="checkline column-option-row" data-column-option-row data-column-key="${esc(column.key)}">
                  <span class="column-drag-handle" draggable="true" data-column-drag-handle data-column-family="report-code" data-structure-type="${esc(def.type)}" data-column-key="${esc(column.key)}" title="Húzással rendezhető">☰</span>
                  ${column.fixed
                    ? `<input type="checkbox" data-column-fixed value="${esc(column.key)}" checked disabled>`
                    : `<input type="checkbox" data-report-code-column data-column-key="${esc(column.key)}" data-structure-type="${esc(def.type)}" value="${esc(column.key)}" ${selectedColumnSet.has(column.key) ? 'checked' : ''}>`}
                  <span>${esc(column.label)}</span>
                </div>
              `).join('')}
            </div>
          </details>
        </div>
      </div>
      <div class="table-wrap report-code-grid-wrap">
        <table class="report-code-grid stable-edit-table" ${fixedTableStyle ? fixedTableStyle(columns, `report-code-${def.type}`) : ''}>
          ${colGroup ? colGroup(columns, `report-code-${def.type}`) : ''}
          <thead>
            <tr>
              ${columns.map((column) => resizableTh(column.label, '', { scope: `report-code-${def.type}`, key: column.key, reorder: true, width: column.width })).join('')}
            </tr>
          </thead>
          <tbody data-report-code-grid="${esc(def.type)}">
            ${displayRows.map((row) => renderReportCodeGridRow(def, data, row)).join('')}
            ${renderReportCodeGridRow(def, data, {}, 'new')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function reportStructureDataForType(type) {
  const def = structureDef(type);
  const root = document.querySelector(`#reportStructureWindow${def.type}`);
  return root?.__reportStructureData || {};
}

function reportCodePayload(row) {
  const value = (field) => row.querySelector(`[data-report-code-field="${field}"]`)?.value;
  const checked = (field) => {
    const input = row.querySelector(`[data-report-code-field="${field}"]`) || (field === 'active' ? row.querySelector('[data-report-code-active]') : null);
    return input?.checked;
  };
  const prefix = row.dataset.prefix || '';
  return {
    structureType: row.dataset.structureType || '',
    code: normalizePrefixedCodeValue(value('code') ?? row.dataset.code ?? '', prefix),
    name: String(value('name') ?? row.dataset.name ?? '').trim(),
    statementType: value('statementType') ?? row.dataset.statementType ?? '',
    group1Code: value('group1Code') ?? row.dataset.group1Code ?? '',
    group1Required: checked('group1Required') ?? row.dataset.group1Required === '1',
    group2Code: value('group2Code') ?? row.dataset.group2Code ?? '',
    group2Required: checked('group2Required') ?? row.dataset.group2Required === '1',
    group3Code: value('group3Code') ?? row.dataset.group3Code ?? '',
    group3Required: checked('group3Required') ?? row.dataset.group3Required === '1',
    active: checked('active') ?? row.dataset.active === '1',
    usageCount: Number(row.dataset.usageCount || 0),
  };
}

function reportCodeRowReady(row) {
  const payload = reportCodePayload(row);
  const prefix = row.dataset.prefix || '';
  return Boolean(payload.code && payload.code !== prefix && payload.name && payload.statementType);
}

function reportCodeMissingLabels(row) {
  const payload = reportCodePayload(row);
  const prefix = row.dataset.prefix || '';
  const missing = [];
  if (!payload.code || payload.code === prefix) missing.push('Riport kód');
  if (!payload.name) missing.push('Riport kód elnevezés');
  if (!payload.statementType) missing.push('BS/PL');
  return missing;
}

function reportCodeIncompleteMessage(row) {
  const missing = reportCodeMissingLabels(row);
  return missing.length ? `Nincs mentve. Kötelező mező hiányzik: ${missing.join(', ')}.` : '';
}

function focusReportCodeMissingField(row) {
  const payload = reportCodePayload(row);
  const prefix = row.dataset.prefix || '';
  if (!payload.code || payload.code === prefix) {
    row.querySelector('[data-report-code-field="code"]')?.focus();
    return true;
  }
  if (!payload.name) {
    row.querySelector('[data-report-code-field="name"]')?.focus();
    return true;
  }
  if (!payload.statementType) {
    row.querySelector('[data-report-code-field="statementType"]')?.focus();
    return true;
  }
  return false;
}

function replaceReportCodeRowInline(row, payload) {
  const def = structureDef(payload.structureType);
  const data = reportStructureDataForType(def.type);
  const wasNew = row.dataset.mode === 'new';
  freezeTableColumnWidths?.(row.closest('table'));
  const holder = document.createElement('tbody');
  holder.innerHTML = renderReportCodeGridRow(def, data, payload);
  const savedRow = holder.firstElementChild;
  row.replaceWith(savedRow);
  if (wasNew) {
    const hasTrailingNewRow = savedRow.nextElementSibling?.matches?.('[data-report-code-row][data-mode="new"]');
    if (!hasTrailingNewRow) savedRow.insertAdjacentHTML('afterend', renderReportCodeGridRow(def, data, {}, 'new'));
  }
  return savedRow;
}

function reportCodeRowHasDraft(row) {
  if (!row || row.dataset.mode !== 'new') return false;
  const payload = reportCodePayload(row);
  const prefix = row.dataset.prefix || '';
  return Boolean(
    (payload.code && payload.code !== prefix) ||
    payload.name ||
    payload.statementType ||
    payload.group1Code ||
    payload.group2Code ||
    payload.group3Code
  );
}

function removeEmptyReportCodeDraftRowsAfter(row) {
  let next = row?.nextElementSibling;
  while (next?.matches?.('[data-report-code-row][data-mode="new"]')) {
    const current = next;
    next = next.nextElementSibling;
    if (!reportCodeRowHasDraft(current)) current.remove();
  }
}

function reportCodeDuplicateMessage(row, payload = reportCodePayload(row)) {
  const grid = row?.closest('[data-report-code-grid]');
  if (!grid) return '';
  const code = String(payload.code || '').trim().toLowerCase();
  const name = String(payload.name || '').trim().toLowerCase();
  const prefix = String(row.dataset.prefix || '').toLowerCase();
  if (!code || code === prefix) return '';
  const duplicate = Array.from(grid.querySelectorAll('[data-report-code-row]')).find((other) => {
    if (other === row) return false;
    const otherPayload = reportCodePayload(other);
    const otherPrefix = String(other.dataset.prefix || '').toLowerCase();
    const otherCode = String(otherPayload.code || '').trim().toLowerCase();
    const otherName = String(otherPayload.name || '').trim().toLowerCase();
    return (otherCode && otherCode !== otherPrefix && otherCode === code) || (name && otherName === name);
  });
  if (!duplicate) return '';
  const duplicatePayload = reportCodePayload(duplicate);
  if (String(duplicatePayload.code || '').trim().toLowerCase() === code) {
    return `Nem menthető: ilyen riport kód már van (${payload.code}).`;
  }
  return `Nem menthető: ilyen riport kód elnevezés már van (${payload.name}).`;
}

function ensureReportCodeDraftRow(row) {
  if (!reportCodeRowHasDraft(row)) return;
  const grid = row.closest('[data-report-code-grid]');
  if (!grid) return;
  if (!reportCodeRowReady(row) || reportCodeDuplicateMessage(row)) {
    removeEmptyReportCodeDraftRowsAfter(row);
    return;
  }
  const newRows = Array.from(grid.querySelectorAll('[data-report-code-row][data-mode="new"]'));
  if (newRows[newRows.length - 1] !== row) return;
  const def = structureDef(row.dataset.structureType);
  const data = reportStructureDataForType(def.type);
  grid.insertAdjacentHTML('beforeend', renderReportCodeGridRow(def, data, {}, 'new'));
}

function updateReportStructureCodeCache(payload) {
  const def = structureDef(payload.structureType);
  const root = document.querySelector(`#reportStructureWindow${def.type}`);
  if (!root) return;
  const data = root.__reportStructureData || {};
  const hydrated = reportCodeRowData(payload, data);
  const rows = Array.isArray(data.reportCodes) ? data.reportCodes : [];
  const idx = rows.findIndex((row) => row.code === hydrated.code);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...hydrated };
  else rows.push(hydrated);
  rows.sort((a, b) => String(a.code).localeCompare(String(b.code), 'hu'));
  root.__reportStructureData = { ...data, reportCodes: rows };
}

function removeReportStructureCodeCache(type, codes = []) {
  const def = structureDef(type);
  const root = document.querySelector(`#reportStructureWindow${def.type}`);
  if (!root) return;
  const codeSet = new Set(codes);
  const data = root.__reportStructureData || {};
  root.__reportStructureData = {
    ...data,
    reportCodes: (data.reportCodes || []).filter((row) => !codeSet.has(row.code)),
  };
}

function setReportCodeRowEditing(row) {
  if (!canEditMasterData() || row?.dataset.mode !== 'view') return;
  freezeTableColumnWidths?.(row.closest('table'));
  const def = structureDef(row.dataset.structureType);
  const data = reportStructureDataForType(def.type);
  const holder = document.createElement('tbody');
  holder.innerHTML = renderReportCodeEditRow(def, data, reportCodePayload(row));
  row.replaceWith(holder.firstElementChild);
  document.querySelector(`#reportStructureWindow${def.type} [data-report-code-row][data-mode="edit"] [data-report-code-field="name"]`)?.focus();
}

function restoreReportCodeRow(row) {
  if (row?.dataset.mode !== 'edit') return;
  replaceReportCodeRowInline(row, {
    structureType: row.dataset.structureType || '',
    code: row.dataset.code || '',
    name: row.dataset.name || '',
    statementType: row.dataset.statementType || '',
    group1Code: row.dataset.group1Code || '',
    group1Name: row.dataset.group1Name || '',
    group1Required: row.dataset.group1Required === '1',
    group2Code: row.dataset.group2Code || '',
    group2Name: row.dataset.group2Name || '',
    group2Required: row.dataset.group2Required === '1',
    group3Code: row.dataset.group3Code || '',
    group3Name: row.dataset.group3Name || '',
    group3Required: row.dataset.group3Required === '1',
    active: row.dataset.active === '1',
    usageCount: Number(row.dataset.usageCount || 0),
  });
}

function updateCoaReportMasterFromCode(payload) {
  const key = payload.structureType === 'CONS' ? 'cons' : 'management';
  const rows = state.coaReportMaster[key] || [];
  const data = reportStructureDataForType(payload.structureType);
  const hydrated = reportCodeRowData(payload, data);
  const idx = rows.findIndex((row) => row.code === hydrated.code);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...hydrated };
  else rows.push(hydrated);
  state.coaReportMaster[key] = rows;
  if (window.__lastCoaRows?.length) {
    window.__lastCoaRows = window.__lastCoaRows.map(hydrateCoaRow);
    refreshCoaTable(document);
  }
}

async function saveReportCodeRow(row, options = {}) {
  if (!canEditMasterData() || !row || row.dataset.saving === '1') return false;
  if (!reportCodeRowReady(row)) {
    const windowId = row.closest('.mgm-window')?.id;
    if (windowId && (!options.silentIncomplete || reportCodeRowHasDraft(row))) setWindowMessage(windowId, reportCodeIncompleteMessage(row));
    if (!options.silentIncomplete) focusReportCodeMissingField(row);
    return false;
  }
  const payload = reportCodePayload(row);
  const windowId = row.closest('.mgm-window')?.id;
  const duplicateMessage = reportCodeDuplicateMessage(row, payload);
  if (duplicateMessage) {
    removeEmptyReportCodeDraftRowsAfter(row);
    if (windowId) setWindowMessage(windowId, duplicateMessage);
    const field = duplicateMessage.includes('elnevezés') ? 'name' : 'code';
    if (!options.silentIncomplete) row.querySelector(`[data-report-code-field="${field}"]`)?.focus();
    return false;
  }
  row.dataset.saving = '1';
  try {
    await api('/api/master-data/report-codes', {
      method: 'POST',
      body: JSON.stringify({ ...payload, mode: row.dataset.mode === 'new' ? 'create' : 'update' }),
    });
    updateReportStructureCodeCache(payload);
    updateCoaReportMasterFromCode(payload);
    if (options.activeOnly) {
      row.dataset.active = payload.active ? '1' : '0';
      row.dataset.saving = '';
      if (windowId) setWindowMessage(windowId, 'Mentve.', true);
      return true;
    }
    replaceReportCodeRowInline(row, payload);
    if (windowId) setWindowMessage(windowId, 'Mentve.', true);
    return true;
  } catch (err) {
    removeEmptyReportCodeDraftRowsAfter(row);
    if (options.previousActive !== undefined) {
      const activeInput = row.querySelector('[data-report-code-active], [data-report-code-field="active"]');
      if (activeInput) activeInput.checked = Boolean(options.previousActive);
    }
    row.dataset.saving = '';
    if (windowId) setWindowMessage(windowId, err.message);
    return false;
  }
}

function refreshReportCodeGrid(type) {
  const def = structureDef(type);
  const root = document.querySelector(`#reportStructureWindow${def.type}`);
  const slot = root?.querySelector('[data-report-code-grid]')?.closest('.report-code-grid-form');
  if (!slot) return;
  const data = reportStructureDataForType(def.type);
  slot.outerHTML = renderReportCodeBlock(def, data);
  const nextRoot = document.querySelector(`#reportStructureWindow${def.type}`);
  if (nextRoot) nextRoot.__reportStructureData = data;
}

function renderReportStructureWindow(def, data) {
  return `
    <section class="report-structure compact">
      <div class="report-toolbar">
        <strong>${esc(def.title)}</strong>
        <div class="actions">
          <button type="button" class="secondary" data-action="download-report-structure-template" data-structure-type="${esc(def.type)}">Template</button>
          ${canImportMasterData() ? `<button type="button" class="secondary" data-action="open-report-structure-import" data-structure-type="${esc(def.type)}">Import</button>` : ''}
          <button type="button" class="secondary" data-action="open-report-group" data-structure-type="${esc(def.type)}" data-group-level="1">Csoport1</button>
          <button type="button" class="secondary" data-action="open-report-group" data-structure-type="${esc(def.type)}" data-group-level="2">Csoport2</button>
          <button type="button" class="secondary" data-action="open-report-group" data-structure-type="${esc(def.type)}" data-group-level="3">Csoport3</button>
        </div>
      </div>
      ${renderReportCodeBlock(def, data)}
    </section>
    <div data-window-message class="error-text"></div>
  `;
}

async function openMasterDataWindow() {
  openAppWindow('masterDataWindow', 'Riport törzsadatok', `
    <div class="master-launcher">
      ${reportStructureDefs.map((def) => `
        <button type="button" class="master-launcher-button" data-action="open-report-structure" data-structure-type="${esc(def.type)}">
          <strong>${esc(def.title)}</strong>
          <span>Riport kódok és kapcsolódó beállítások.</span>
        </button>
      `).join('')}
    </div>
    <div data-window-message class="error-text"></div>
  `, { width: 760, height: 280, preserve: true });
}

async function openReportStructureWindow(type, options = {}) {
  const def = structureDef(type);
  if (options.clearDraft) delete state.reportCodeDrafts[def.type];
  else preserveReportCodeDraft(def.type);
  const data = await api('/api/master-data');
  const structure = data.structures?.[def.key] || {};
  const win = openAppWindow(`reportStructureWindow${def.type}`, def.title, renderReportStructureWindow(def, structure), { width: 1180, height: 700, preserve: true });
  if (win) win.__reportStructureData = structure;
}

async function openReportGroupWindow(type, level) {
  const def = structureDef(type);
  const groupLevel = Number(level) || 1;
  const data = await api('/api/master-data');
  const structure = data.structures?.[def.key] || {};
  openAppWindow(`reportGroupWindow${def.type}${groupLevel}`, `${def.title} - Csoport${groupLevel}`, `
    ${renderReportGroupBlock(def, structure, groupLevel)}
    <div data-window-message class="error-text"></div>
  `, { width: 760, height: 420, preserve: true });
}

function renderReportStructureImportWindow(def, file = null) {
  return `
    <section class="window-page">
      <div class="page-card">
        <h2>${esc(def.title)} import</h2>
        <p class="muted">XLSX / CSV / TXT fájl. Egy sor egy riportkód, a kapcsolódó csoportok automatikusan bekerülnek a csoport törzsbe.</p>
      </div>
      <div class="dropzone" data-dropzone="report-structure" data-structure-type="${esc(def.type)}">
        <strong>${file ? esc(file.fileName || '') : 'Dobd ide a riport törzs fájlt'}</strong>
        <span>${file ? 'A fájl készen áll az importra.' : 'Kattintással tallózó ablak nyílik.'}</span>
      </div>
      <input type="file" hidden data-report-structure-file-picker data-structure-type="${esc(def.type)}" accept=".xlsx,.csv,.txt">
      <div class="button-row">
        <button type="button" class="secondary" data-action="choose-report-structure-file" data-structure-type="${esc(def.type)}">Fájl kiválasztása</button>
        <button type="button" data-action="run-report-structure-import" data-structure-type="${esc(def.type)}" ${file ? '' : 'disabled'}>Import</button>
      </div>
      <div class="notice">
        Elvárt oszlopok: Riport kód, Riport kód elnevezés, BS/PL, Csoport1, Csoport1 elnevezés, Csoport1 kötelező, Csoport2, Csoport2 elnevezés, Csoport2 kötelező, Csoport3, Csoport3 elnevezés, Csoport3 kötelező, Aktív.
      </div>
      <div data-window-message class="error-text"></div>
    </section>
  `;
}

function openReportStructureImportWindow(type) {
  const def = structureDef(type);
  state.reportStructureImportFiles = state.reportStructureImportFiles || {};
  const file = state.reportStructureImportFiles[def.type] || null;
  openAppWindow(`reportStructureImportWindow${def.type}`, `${def.title} import`, renderReportStructureImportWindow(def, file), { width: 760, height: 460, preserve: true });
}

    return {
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
      ensureReportCodeDraftRow,
      saveReportGroupRow,
      ensureReportGroupDraftRow,
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
    };
  }

  window.MGM_REPORT_STRUCTURE_UI = {
    createReportStructureUi,
  };
}());
