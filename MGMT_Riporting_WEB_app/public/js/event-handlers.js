(function () {
  function registerEventHandlers(deps) {
    const {
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
      refreshLogsTable,
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
    } = deps;

function orderedCheckedValues(root, selector) {
  return Array.from(root?.querySelectorAll(selector) || [])
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function backupDirectoryInput() {
  return document.querySelector('[data-backup-directory-input]');
}

function surfacePageFor(source, fallback) {
  return source?.closest?.('.mgm-window')?.dataset.pageWindow || fallback;
}

async function refreshAdminSurface(source, fallback) {
  await refreshSurface(source, surfacePageFor(source, fallback));
}

function setSettingsTabs({ main, general, accounts } = {}) {
  if (main) {
    state.settingsMainTab = main;
    localStorage.setItem('mgmSettingsMainTab', main);
  }
  if (general) {
    state.settingsMainTab = 'general';
    state.settingsGeneralTab = general;
    localStorage.setItem('mgmSettingsMainTab', 'general');
    localStorage.setItem('mgmSettingsGeneralTab', general);
  }
  if (accounts) {
    state.settingsMainTab = 'accounts';
    state.settingsAccountsTab = accounts;
    localStorage.setItem('mgmSettingsMainTab', 'accounts');
    localStorage.setItem('mgmSettingsAccountsTab', accounts);
  }
}

function settingsAliasForPage(page) {
  if (page !== 'settings') return null;
  return { general: state.settingsGeneralTab || 'system' };
}

function collectUiLabels(form = document) {
  return Array.from(form.querySelectorAll('[data-ui-label-row]')).map((row) => ({
    id: row.dataset.labelId ? Number(row.dataset.labelId) : null,
    module: row.querySelector('[name="module"]')?.value || '',
    menu: row.querySelector('[name="menu"]')?.value || '',
    labelKey: row.querySelector('[name="labelKey"]')?.value || row.dataset.labelKey || '',
    hu: row.querySelector('[name="hu"]')?.value || '',
    en: row.querySelector('[name="en"]')?.value || '',
    active: row.querySelector('[name="active"]')
      ? (row.querySelector('[name="active"]').checked ? 1 : 0)
      : (row.dataset.active === '0' ? 0 : 1),
  })).filter((row) => row.module || row.menu || row.labelKey || row.hu || row.en);
}

function uiLabelExportRows(labels = window.__uiLabels || []) {
  return labels.map((row) => ({
    Modul: row.module || '',
    Menü: row.menu || '',
    Kulcs: row.labelKey || row.label_key || '',
    Magyar: row.hu || '',
    English: row.en || '',
  }));
}

function collectPermissionMatrix(form = document) {
  return {
    userId: Number(form.querySelector('[name="permissionUserId"]')?.value || state.permissionUserId || 0),
    companyPermissions: Array.from(form.querySelectorAll('[data-permission-company]')).map((row) => ({
      companyId: Number(row.dataset.companyId),
      canView: Boolean(row.querySelector('[data-company-permission="canView"]')?.checked),
      canManage: Boolean(row.querySelector('[data-company-permission="canManage"]')?.checked),
    })),
    modulePermissions: Array.from(form.querySelectorAll('[data-module-permission]')).map((input) => ({
      moduleKey: input.dataset.moduleKey || '',
      actionKey: input.dataset.actionKey || '',
      allowed: Boolean(input.checked),
    })),
  };
}

async function openBackupDirectoryBrowser(startPath = '') {
  const result = await api('/api/backups/select-directory', {
    method: 'POST',
    body: JSON.stringify({ startPath }),
  });
  if (result.cancelled) {
    setMessage('#backupSettingsMessage', 'Mappaválasztás megszakítva.');
    return;
  }
  const input = backupDirectoryInput();
  if (input && result.path) {
    input.value = result.path;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  setMessage('#backupSettingsMessage', 'Mentési útvonal kiválasztva. A rögzítéshez nyomd meg a Beállítások mentése gombot.', true);
}

let columnDragState = null;

function clearColumnDropMarkers() {
  document.querySelectorAll('.column-dragging, .column-drop-before, .column-drop-after')
    .forEach((element) => element.classList.remove('column-dragging', 'column-drop-before', 'column-drop-after'));
}

function columnDropBefore(event, target) {
  const rect = target.getBoundingClientRect();
  if (target.matches?.('th')) return event.clientX < rect.left + rect.width / 2;
  return event.clientY < rect.top + rect.height / 2;
}

function markColumnDropTarget(event, target) {
  clearColumnDropMarkers();
  target.classList.add(columnDropBefore(event, target) ? 'column-drop-before' : 'column-drop-after');
}

function optionalKeysForFamily(family) {
  if (family === 'coa') return coaOptionalColumnKeys();
  if (family === 'trialbalance') return trialBalanceOptionalColumnKeys();
  if (family === 'report-code') return reportCodeOptionalColumnKeys();
  return [];
}

function saveColumnVisibilityOrder(family, root, type = '') {
  const panel = root?.querySelector?.('.column-chooser-panel[open]') || root?.querySelector?.('.column-chooser-panel');
  const orderedKeys = Array.from(panel?.querySelectorAll('[data-column-option-row]') || [])
    .map((row) => row.dataset.columnKey)
    .filter(Boolean);
  if (family === 'coa') {
    saveColumnOrder('coa', orderedKeys);
    saveCoaColumns(orderedCheckedValues(root, '[data-coa-column]'));
    refreshCoaTable(root);
    return true;
  }
  if (family === 'trialbalance') {
    saveColumnOrder('trialbalance', orderedKeys);
    saveTrialBalanceColumns(orderedCheckedValues(root, '[data-trial-column]'));
    refreshTrialBalanceTable(root);
    return true;
  }
  if (family === 'report-code') {
    saveColumnOrder(`report-code-${type}`, orderedKeys);
    saveReportCodeColumns(type, orderedCheckedValues(root, '[data-report-code-column]'));
    refreshReportCodeGrid(type);
    return true;
  }
  return false;
}

function saveHeaderColumnOrder(scope, keys, source) {
  saveColumnOrder(scope, keys);
  if (scope === 'coa') {
    const optional = new Set(coaOptionalColumnKeys());
    saveCoaColumns(keys.filter((key) => optional.has(key)));
    refreshCoaTable(source);
    return true;
  }
  if (scope === 'trialbalance') {
    const optional = new Set(trialBalanceOptionalColumnKeys());
    saveTrialBalanceColumns(keys.filter((key) => optional.has(key)));
    refreshTrialBalanceTable(source);
    return true;
  }
  if (scope.startsWith('report-code-')) {
    const type = scope.replace('report-code-', '');
    const optional = new Set(reportCodeOptionalColumnKeys());
    saveReportCodeColumns(type, keys.filter((key) => optional.has(key)));
    refreshReportCodeGrid(type);
    return true;
  }
  return false;
}

async function resetColumnView(button) {
  const scope = button.dataset.columnReset;
  if (scope === 'coa') {
    saveCoaColumns(null);
    clearColumnWidths('coa');
    clearColumnOrder('coa');
    await refreshSurface(button, 'coa');
    return true;
  }
  if (scope === 'trialbalance') {
    saveTrialBalanceColumns(null);
    clearColumnWidths('trialbalance');
    clearColumnOrder('trialbalance');
    await refreshSurface(button, 'trialbalance');
    return true;
  }
  if (scope === 'report-code') {
    const type = button.dataset.structureType;
    saveReportCodeColumns(type, null);
    clearColumnWidths(`report-code-${type}`);
    clearColumnOrder(`report-code-${type}`);
    refreshReportCodeGrid(type);
    return true;
  }
  return false;
}

function saveColumnOrderFromPanel(source) {
  const panel = source.closest('.column-chooser-panel');
  const family = source.dataset.columnFamily || panel?.dataset.columnFamily || '';
  const type = source.dataset.structureType || panel?.dataset.structureType || '';
  const root = family === 'coa'
    ? coaRootFromSource(source)
    : family === 'trialbalance'
      ? trialBalanceRootFromSource(source)
      : source.closest('[data-report-code-root]');
  return saveColumnVisibilityOrder(family, root, type);
}

function moveColumnDragRow(event, targetRow) {
  const sourceRow = columnDragState?.source;
  if (!sourceRow || !targetRow || sourceRow === targetRow) return false;
  const before = columnDropBefore(event, targetRow);
  const reference = before ? targetRow : targetRow.nextElementSibling;
  targetRow.parentElement.insertBefore(sourceRow, reference);
  saveColumnOrderFromPanel(sourceRow);
  return true;
}

function moveColumnHeader(event, targetTh) {
  const stateInfo = columnDragState;
  if (!stateInfo?.key || !targetTh || targetTh.dataset.colKey === stateInfo.key) return false;
  const scope = stateInfo.scope || targetTh.dataset.colScope || '';
  if (!scope || scope !== targetTh.dataset.colScope) return false;
  const headerCells = Array.from(targetTh.parentElement.querySelectorAll('th[data-column-header-drag][data-col-key]'))
    .filter((th) => th.dataset.colScope === scope);
  const keys = headerCells.map((th) => th.dataset.colKey);
  const from = keys.indexOf(stateInfo.key);
  const to = keys.indexOf(targetTh.dataset.colKey);
  if (from < 0 || to < 0) return false;
  const [key] = keys.splice(from, 1);
  const nextIndex = columnDropBefore(event, targetTh)
    ? (from < to ? to - 1 : to)
    : (from < to ? to : to + 1);
  keys.splice(Math.max(0, Math.min(keys.length, nextIndex)), 0, key);
  saveHeaderColumnOrder(scope, keys, targetTh);
  return true;
}

document.addEventListener('dragstart', (event) => {
  const handle = event.target.closest?.('[data-column-drag-handle]');
  if (handle) {
    const row = handle.closest('[data-column-option-row]');
    if (!row) return;
    columnDragState = {
      kind: 'chooser',
      source: row,
      family: handle.dataset.columnFamily || row.closest('.column-chooser-panel')?.dataset.columnFamily || '',
      type: handle.dataset.structureType || row.closest('.column-chooser-panel')?.dataset.structureType || '',
      key: row.dataset.columnKey || '',
    };
    row.classList.add('column-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnDragState.key);
    return;
  }

  if (event.target.closest?.('[data-col-resizer]')) return;
  const th = event.target.closest?.('th[data-column-header-drag]');
  if (!th?.dataset.colKey || !th.dataset.colScope) return;
  columnDragState = {
    kind: 'header',
    source: th,
    scope: th.dataset.colScope,
    key: th.dataset.colKey,
  };
  th.classList.add('column-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', columnDragState.key);
});

document.addEventListener('dragover', (event) => {
  if (!columnDragState) return;
  if (columnDragState.kind === 'chooser') {
    const target = event.target.closest?.('[data-column-option-row]');
    const panel = target?.closest('.column-chooser-panel');
    if (!target || target === columnDragState.source || panel?.dataset.columnFamily !== columnDragState.family) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    markColumnDropTarget(event, target);
    return;
  }

  const targetTh = event.target.closest?.('th[data-column-header-drag]');
  if (!targetTh || targetTh === columnDragState.source || targetTh.dataset.colScope !== columnDragState.scope) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  markColumnDropTarget(event, targetTh);
});

document.addEventListener('drop', (event) => {
  if (!columnDragState) return;
  if (columnDragState.kind === 'chooser') {
    const target = event.target.closest?.('[data-column-option-row]');
    const panel = target?.closest('.column-chooser-panel');
    if (target && panel?.dataset.columnFamily === columnDragState.family) {
      event.preventDefault();
      moveColumnDragRow(event, target);
    }
  } else {
    const targetTh = event.target.closest?.('th[data-column-header-drag]');
    if (targetTh?.dataset.colScope === columnDragState.scope) {
      event.preventDefault();
      moveColumnHeader(event, targetTh);
    }
  }
  columnDragState = null;
  clearColumnDropMarkers();
});

document.addEventListener('dragend', () => {
  columnDragState = null;
  clearColumnDropMarkers();
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = formData(form);
  try {
    switch (form.dataset.form) {
      case 'login': {
        const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
        state.user = result.user;
        await bootstrap();
        renderShell();
        break;
      }
      case 'fx-save':
        await api('/api/fx', { method: 'POST', body: JSON.stringify(data) });
        await refreshSurface(form, 'fx');
        setScopedMessage(form, '#fxMessage', 'Árfolyam mentve.', true);
        break;
      case 'budget-import':
        {
          const result = await api('/api/budget/import', { method: 'POST', body: JSON.stringify({ ...data, companyId: state.settings.activeCompanyId }) });
          await refreshSurface(form, 'budget');
          setScopedMessage(form, '#budgetMessage', `Tervadat import kész: ${result.imported} sor.`, true);
        }
        break;
      case 'company-create':
        await api('/api/companies', { method: 'POST', body: JSON.stringify(data) });
        await bootstrap();
        refreshChrome();
        await refreshAdminSurface(form, 'companies');
        break;
      case 'company-update': {
        const id = form.dataset.companyId;
        const active = Boolean(document.querySelector(`[form="companyForm${id}"][name="active"]`)?.checked);
        await api(`/api/companies/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...data, active }),
        });
        await bootstrap();
        refreshChrome();
        await refreshAdminSurface(form, 'companies');
        setScopedMessage(form, '#companyMessage', 'Cég mentve.', true);
        break;
      }
      case 'user-create':
        await api('/api/users', { method: 'POST', body: JSON.stringify(data) });
        await refreshAdminSurface(form, 'users');
        setScopedMessage(form, '#userMessage', 'Felhasználó létrehozva.', true);
        break;
      case 'user-update': {
        const id = form.dataset.userId;
        const displayName = document.querySelector(`[data-user-edit="${id}"] input[name="displayName"]`)?.value || data.displayName || '';
        const email = document.querySelector(`[form="userForm${id}"][name="email"]`)?.value || '';
        const role = document.querySelector(`[form="userForm${id}"][name="role"]`)?.value || data.role || 'USER';
        const active = Boolean(document.querySelector(`[form="userForm${id}"][name="active"]`)?.checked);
        const mustChangePassword = Boolean(document.querySelector(`[form="userForm${id}"][name="mustChangePassword"]`)?.checked);
        await api(`/api/users/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ displayName, email, role, active, mustChangePassword }),
        });
        await refreshAdminSurface(form, 'users');
        break;
      }
      case 'settings-save':
        await api('/api/settings', { method: 'POST', body: JSON.stringify({ settings: data }) });
        await bootstrap();
        refreshChrome();
        await refreshOpenPageWindows();
        setMessage('#settingsMessage', 'Beállítások mentve.', true);
        break;
      case 'ui-labels-save': {
        const result = await api('/api/ui-labels', {
          method: 'POST',
          body: JSON.stringify({
            settings: {
              uiLanguage: form.querySelector('[name="ui_language"]')?.value || 'hu',
              uiTheme: form.querySelector('[name="ui_theme"]')?.value || 'light',
            },
            labels: collectUiLabels(form),
          }),
        });
        window.__uiLabels = result.labels || [];
        await bootstrap();
        refreshChrome();
        await refreshSurface(form, 'settings');
        setMessage('#uiLabelsMessage', 'Címkék és megjelenítési beállítások mentve.', true);
        break;
      }
      case 'permissions-save': {
        const payload = collectPermissionMatrix(form);
        const result = await api('/api/admin/permissions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        state.permissionUserId = String(result.selectedUserId || payload.userId || '');
        await refreshSurface(form, 'permissions');
        setMessage('#permissionsMessage', 'Jogosultságok mentve.', true);
        break;
      }
      case 'backup-settings-save': {
        const payload = {
          ...data,
          backup_schedule_weekdays: Array.from(form.querySelectorAll('[name="backup_schedule_weekdays"]:checked')).map((input) => input.value).join(','),
          backup_schedule_months: Array.from(form.querySelectorAll('[name="backup_schedule_months"]:checked')).map((input) => input.value).join(','),
          backup_schedule_month_days: Array.from(form.querySelectorAll('[name="backup_schedule_month_days"]:checked')).map((input) => input.value).join(','),
        };
        await api('/api/backups/settings', { method: 'POST', body: JSON.stringify(payload) });
        await refreshSurface(form, 'backup');
        setMessage('#backupSettingsMessage', 'Beállítások mentve.', true);
        break;
      }
      case 'license-generate': {
        const result = await api('/api/license/generate', { method: 'POST', body: JSON.stringify(data) });
        setScopedMessage(form, '#licenseGenerateMessage', result.key, true);
        break;
      }
      case 'license-activate':
        await api('/api/license/activate', { method: 'POST', body: JSON.stringify(data) });
        await refreshSurface(form, 'license');
        setScopedMessage(form, '#licenseActivateMessage', 'Licensz aktiválva.', true);
        break;
      case 'password-change':
        await api('/api/profile/password', { method: 'POST', body: JSON.stringify(data) });
        setScopedMessage(form, '#profileMessage', 'Jelszó módosítva.', true);
        state.user.mustChangePassword = false;
        break;
      case 'summary-rule-save':
        await api('/api/summary-rules', { method: 'POST', body: JSON.stringify({ ...data, active: Boolean(form.querySelector('[name="active"]')?.checked) }) });
        await openSummaryRulesWindow();
        if (document.querySelector('#coaMappingWindow')) await openCoaMappingWindow(document.querySelector('#coaMappingWindow [data-template-select="coa"]')?.value || '');
        break;
      case 'report-group-save':
        await api('/api/master-data/report-groups', {
          method: 'POST',
          body: JSON.stringify({ ...data, active: Boolean(form.querySelector('[name="active"]')?.checked) }),
        });
        if (document.querySelector(`#reportStructureWindow${data.structureType}`)) await openReportStructureWindow(data.structureType);
        await openReportGroupWindow(data.structureType, data.groupLevel);
        break;
      case 'reporting-category-save':
        await api('/api/master-data/reporting-categories', { method: 'POST', body: JSON.stringify(data) });
        await openMasterDataWindow();
        break;
      case 'cons-account-save':
        await api('/api/master-data/cons-accounts', { method: 'POST', body: JSON.stringify(data) });
        await openMasterDataWindow();
        break;
      case 'coa-row-save':
        await api('/api/coa/manual', { method: 'POST', body: JSON.stringify(data) });
        closeWindow('coaEditWindow');
        await refreshSurface(form, 'coa');
        break;
      case 'coa-bulk-save': {
        const ids = String(form.dataset.coaBulkIds || '').split(',').map((value) => Number(value)).filter(Number.isFinite);
        const fields = {
          consAccount: data.consAccount !== '',
          reportingCategory: data.reportingCategory !== '',
          statementType: data.statementType !== '',
          isSummary: data.isSummaryBulk !== '',
          isFxTransDiff: data.isFxTransDiffBulk !== '',
        };
        if (!Object.values(fields).some(Boolean)) {
          setScopedMessage(form, '[data-window-message]', 'Nem történt módosítás: nincs kiválasztott új érték.');
          return;
        }
        const selectedRows = (window.__lastCoaRows || []).filter((row) => ids.includes(Number(row.id)));
        const changedIds = selectedRows.length ? selectedRows
          .filter((row) => {
            if (fields.consAccount && String(row.consReportCode || row.consAccount || '') !== String(data.consAccount || '')) return true;
            if (fields.reportingCategory && String(row.managementReportCode || row.reportingCategory || '') !== String(data.reportingCategory || '')) return true;
            if (fields.statementType && String(row.statementType || '') !== String(data.statementType || '')) return true;
            if (fields.isSummary && Boolean(row.isSummary) !== (data.isSummaryBulk === '1')) return true;
            if (fields.isFxTransDiff && Boolean(row.isFxTransDiff) !== (data.isFxTransDiffBulk === '1')) return true;
            return false;
          })
          .map((row) => Number(row.id)) : ids;
        if (!changedIds.length) {
          setScopedMessage(form, '[data-window-message]', 'Nem történt módosítás: a kijelölt sorok már ezeket az értékeket tartalmazzák.');
          return;
        }
        const result = await api('/api/coa/bulk-update', {
          method: 'POST',
          body: JSON.stringify({
            ids: changedIds,
            consAccount: data.consAccount || '',
            reportingCategory: data.reportingCategory || '',
            statementType: data.statementType || '',
            isSummary: data.isSummaryBulk === '1',
            isFxTransDiff: data.isFxTransDiffBulk === '1',
            fields,
          }),
        });
        closeWindow('coaBulkEditWindow');
        if (window.__lastCoaRows?.length) {
          const idSet = new Set(changedIds);
          window.__lastCoaRows = window.__lastCoaRows.map((row) => {
            if (!idSet.has(Number(row.id))) return row;
            return hydrateCoaRow({
              ...row,
              ...(fields.consAccount ? { consAccount: data.consAccount || '', consReportCode: data.consAccount || '' } : {}),
              ...(fields.reportingCategory ? { reportingCategory: data.reportingCategory || '', managementReportCode: data.reportingCategory || '' } : {}),
              ...(fields.statementType ? { statementType: data.statementType || '' } : {}),
              ...(fields.isSummary ? { isSummary: data.isSummaryBulk === '1' } : {}),
              ...(fields.isFxTransDiff ? { isFxTransDiff: data.isFxTransDiffBulk === '1' } : {}),
            });
          });
          refreshCoaTable(document);
        } else {
          await refreshSurface(form, 'coa');
        }
        openResultWindow('Tömeges módosítás', `<div class="notice">Frissített sorok: <strong>${fmt(result.updated || 0)}</strong></div>`);
        break;
      }
      case 'missing-gl-add':
        await api('/api/coa/manual', { method: 'POST', body: JSON.stringify(data) });
        closeWindow('missingGlWindow');
        if (data.sessionId) {
          await api(`/api/gl/import-sessions/${encodeURIComponent(data.sessionId)}/validate`, { method: 'POST', body: '{}' });
          await openGlImportDetail(data.sessionId);
        }
        break;
    }
  } catch (err) {
    const target = {
      login: '#loginMessage',
      'coa-import': '#coaMessage',
      'gl-import': '#glMessage',
      'fx-save': '#fxMessage',
      'budget-import': '#budgetMessage',
      'company-create': '#companyMessage',
      'company-update': '#companyMessage',
      'user-create': '#userMessage',
      'user-update': '#userMessage',
      'settings-save': '#settingsMessage',
      'ui-labels-save': '#uiLabelsMessage',
      'backup-settings-save': '#backupMessage',
      'license-generate': '#licenseGenerateMessage',
      'license-activate': '#licenseActivateMessage',
      'password-change': '#profileMessage',
      'summary-rule-save': '#summaryRulesWindow [data-window-message]',
      'report-group-save': '[data-window-message]',
      'reporting-category-save': '#masterDataWindow [data-window-message]',
      'cons-account-save': '#masterDataWindow [data-window-message]',
      'coa-row-save': '#coaEditWindow [data-window-message]',
      'coa-bulk-save': '#coaBulkEditWindow [data-window-message]',
    }[form.dataset.form];
    if (target === '[data-window-message]' && form.closest('.mgm-window')) {
      setScopedMessage(form, target, err.message);
    } else if (target?.startsWith('#') && form.closest('.mgm-window') && !target.includes(' ')) {
      setScopedMessage(form, target, err.message);
    } else {
      setMessage(target, err.message);
    }
  }
});

document.addEventListener('click', async (event) => {
  const columnChooser = event.target.closest('.column-chooser');
  closeColumnChoosers(columnChooser);

  const closeButton = event.target.closest('[data-window-close]');
  if (closeButton) {
    closeWindow(closeButton.dataset.windowClose);
    return;
  }

  const maximizeButton = event.target.closest('[data-window-maximize]');
  if (maximizeButton) {
    toggleWindowMaximize(maximizeButton.dataset.windowMaximize);
    return;
  }

  const activeWindow = event.target.closest('.mgm-window');
  if (activeWindow) bringWindowToFront(activeWindow);

  const columnReset = event.target.closest('[data-column-reset]');
  if (columnReset) {
    if (await resetColumnView(columnReset)) return;
  }

  const statusOption = event.target.closest('[data-status-option]');
  if (statusOption) {
    const contextKey = statusOption.dataset.statusContext;
    const previousCompanyId = String(state.settings.activeCompanyId || '');
    state.settings[contextKey] = statusOption.dataset.value;
    state.statusMenu = null;
    try {
      await saveContext();
      if (contextKey === 'activeCompanyId' && String(state.settings.activeCompanyId || '') !== previousCompanyId) {
        closeAllWindows();
        await bootstrap();
        state.page = 'dashboard';
        state.activeModule = 'home';
        state.ribbonTab = null;
        history.replaceState(null, '', '#dashboard');
        refreshChrome();
        await loadPage();
      } else {
        refreshChrome();
        await refreshOpenPageWindows();
        await loadPage();
      }
    } catch (err) {
      content(`<div class="notice bad">${esc(err.message)}</div>`);
    }
    return;
  }

  const statusMenuButton = event.target.closest('[data-status-menu]');
  if (statusMenuButton) {
    const menu = statusMenuButton.dataset.statusMenu;
    state.statusMenu = state.statusMenu === menu ? null : menu;
    refreshChrome();
    return;
  }

  if (state.statusMenu && !event.target.closest('.statusbar')) {
    state.statusMenu = null;
    refreshChrome();
  }

  const logTypeButton = event.target.closest('[data-log-type]');
  if (logTypeButton) {
    state.logType = logTypeButton.dataset.logType;
    await refreshSurface(logTypeButton, 'logs');
    return;
  }

  const logScopeButton = event.target.closest('[data-log-scope]');
  if (logScopeButton) {
    state.logScope = logScopeButton.dataset.logScope;
    await refreshSurface(logScopeButton, 'logs');
    return;
  }

  const ribbonTab = event.target.closest('[data-ribbon-tab]');
  if (ribbonTab) {
    state.ribbonTab = ribbonTab.dataset.ribbonTab;
    const ribbonSlot = document.querySelector('#mgmRibbonSlot');
    if (ribbonSlot) ribbonSlot.innerHTML = renderRibbon();
    return;
  }

  const moduleButton = event.target.closest('[data-module]');
  if (moduleButton) {
    state.activeModule = moduleButton.dataset.module;
    state.page = moduleHomePage(state.activeModule);
    state.ribbonTab = null;
    if (location.hash.replace('#', '') !== state.page) location.hash = state.page;
    await loadPage();
    return;
  }

  const pageButton = event.target.closest('[data-page]');
  if (pageButton) {
    const alias = settingsAliasForPage(pageButton.dataset.page);
    if (alias) {
      setSettingsTabs(alias);
      await openPageWindow('settings');
      return;
    }
    await openPageWindow(pageButton.dataset.page);
    return;
  }

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;

  try {
    if (action === 'toggle-ribbon') {
      state.ribbonCollapsed = !state.ribbonCollapsed;
      localStorage.setItem('mgmRibbonCollapsed', state.ribbonCollapsed ? '1' : '0');
      const ribbonSlot = document.querySelector('#mgmRibbonSlot');
      if (ribbonSlot) ribbonSlot.innerHTML = renderRibbon();
      return;
    }
    if (action === 'settings-tab') {
      const button = event.target.closest('[data-action="settings-tab"]');
      const tab = button?.dataset.settingsTab;
      const level = button?.dataset.settingsLevel || 'general';
      if (level === 'main') setSettingsTabs({ main: tab });
      else if (level === 'accounts') setSettingsTabs({ accounts: tab });
      else setSettingsTabs({ general: tab });
      await refreshSurface(button, 'settings');
      return;
    }
    if (action === 'export-ui-labels') {
      const form = event.target.closest('form') || document.querySelector('[data-form="ui-labels-save"]');
      const rows = uiLabelExportRows(form ? collectUiLabels(form) : (window.__uiLabels || []));
      if (!rows.length) {
        setMessage('#uiLabelsMessage', 'Nincs exportálható címke.');
        return;
      }
      (xlsxDownload || csvDownload)('mgm_ui_cimkek.xlsx', rows);
      setMessage('#uiLabelsMessage', `Exportálva: ${fmt(rows.length)} címke.`, true);
      return;
    }
    if (action === 'test-email-settings') {
      const root = event.target.closest('.settings-card') || document;
      const form = root.querySelector('[data-form="settings-save"]');
      const to = root.querySelector('[data-smtp-test-to]')?.value || '';
      const button = event.target.closest('button');
      if (button) button.disabled = true;
      setMessage('#smtpTestMessage', 'Teszt email küldése folyamatban...');
      try {
        const result = await api('/api/settings/email-test', {
          method: 'POST',
          body: JSON.stringify({ to, settings: form ? formData(form) : {} }),
        });
        setMessage('#smtpTestMessage', result.message || 'Teszt email elküldve.', true);
      } catch (err) {
        setMessage('#smtpTestMessage', err.message);
      } finally {
        if (button) button.disabled = false;
      }
      return;
    }
    if (action === 'test-notification-settings') {
      const root = event.target.closest('.settings-card') || document;
      const form = root.querySelector('[data-form="settings-save"]');
      const button = event.target.closest('button');
      if (button) button.disabled = true;
      setMessage('#notificationTestMessage', 'Teszt értesítés küldése folyamatban...');
      try {
        const result = await api('/api/settings/notification-test', {
          method: 'POST',
          body: JSON.stringify({ settings: form ? formData(form) : {} }),
        });
        setMessage('#notificationTestMessage', result.message || 'Teszt értesítés elküldve.', true);
      } catch (err) {
        setMessage('#notificationTestMessage', err.message);
      } finally {
        if (button) button.disabled = false;
      }
      return;
    }
    if (action === 'toggle-sidebar') {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      localStorage.setItem('mgmSidebarCollapsed', state.sidebarCollapsed ? '1' : '0');
      document.querySelector('.shell')?.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
      const toggle = document.querySelector('.sidebar-toggle');
      if (toggle) {
        toggle.textContent = state.sidebarCollapsed ? '›' : '‹';
        toggle.title = state.sidebarCollapsed ? 'Menü kinyitása' : 'Menü becsukása';
      }
      return;
    }
    if (action === 'reload-page') {
      const page = surfacePageFor(event.target, state.page);
      if (page && await refreshPageWindow(page)) return;
      if (!(await refreshPageWindow(state.page))) {
        if (isModuleHomePage()) await loadPage();
        else await openPageWindow(state.page);
      }
      return;
    }
    if (action === 'focus') {
      const targetSelector = event.target.closest('[data-action]')?.dataset.target;
      const activeWindow = document.querySelector(`#${pageWindowId(state.page)}`);
      const target = targetSelector ? (activeWindow?.querySelector(targetSelector) || document.querySelector(targetSelector)) : null;
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (typeof target.focus === 'function') target.focus();
      }
      return;
    }
    if (action === 'logout') {
      await api('/api/auth/logout', { method: 'POST', body: '{}' });
      state.user = null;
      renderLogin();
      return;
    }
    if (action === 'export-report') {
      csvDownload(`mgm_report_${state.settings.activeYear}_${state.settings.activePeriod}.csv`, window.__lastReport || []);
      return;
    }
    if (action === 'export-trial-balance') {
      csvDownload(`mgm_fokonyvi_kivonat_${state.settings.activeYear}.csv`, window.__lastTrialBalanceExport || []);
      return;
    }
    if (action === 'validate-trial-balance') {
      const root = trialBalanceRootFromSource(event.target) || document;
      const year = root.querySelector('[data-trial-year]')?.value || state.settings.activeYear;
      if (!year) {
        updateTrialValidationStatus(root, {
          year: '',
          checkedRows: 0,
          errorCount: 1,
          warningCount: 0,
          issues: [{ severity: 'ERROR', message: 'Válassz évet a validációhoz.' }],
        });
        return;
      }
      const params = new URLSearchParams({
        companyId: state.settings.activeCompanyId,
        year,
        period: 12,
        currency: state.settings.activeCurrency || 'HUF',
        fxMode: state.settings.activeFxMode || 'FX1',
      });
      const result = await api(`/api/trial-balance/validation?${params.toString()}`);
      updateTrialValidationStatus(root, result);
      return;
    }
    if (action === 'open-trial-validation-details') {
      const root = trialBalanceRootFromSource(event.target) || document;
      const result = trialValidationResultFromRoot(root);
      openResultWindow('Főkönyvi validáció', renderTrialValidationDetails(result || {}));
      return;
    }
    if (action === 'show-trial-month-import') {
      const month = event.target.closest('[data-month]')?.dataset.month;
      const info = window.__lastTrialBalance?.importsByMonth?.[String(month || '')];
      openResultWindow(`${month}. havi főkönyvi import`, info ? `
        <div class="import-summary">
          <span>Import azonosító: <strong>${esc(info.batchId || '')}</strong></span>
          <span>Fájl: <strong>${esc(info.fileName || '')}</strong></span>
          <span>Aktiválta: <strong>${esc(info.activatedBy || '')}</strong></span>
          <span>Aktiválás: <strong>${esc(info.activatedAt || '')}</strong></span>
          <span>Sor: <strong>${fmt(info.importedRows || 0)}</strong></span>
        </div>
      ` : '<div class="notice">Nincs aktív GL import az adott hónapra.</div>');
      return;
    }
    if (action === 'browse-backup-directory') {
      await openBackupDirectoryBrowser(backupDirectoryInput()?.value || '');
      return;
    }
    if (action === 'create-backup') {
      const result = await api('/api/backups', { method: 'POST', body: '{}' });
      await refreshSurface(event.target, 'backup');
      setMessage('#backupMessage', `Backup elkészült: ${result.file}${result.pruned?.length ? `, retention törölte: ${result.pruned.length} régi mentés` : ''}.`, true);
      return;
    }
    if (action === 'delete-backup') {
      const fileName = event.target.closest('[data-backup-name]')?.dataset.backupName || '';
      if (!fileName) return;
      const typed = window.prompt(`BACKUP TÖRLÉSE\n\nA mentés törléséhez írd be pontosan a fájl nevét:\n${fileName}`);
      if (typed !== fileName) {
        setMessage('#backupMessage', 'Backup törlés megszakítva: a fájlnév nem egyezett.');
        return;
      }
      const result = await api('/api/backups', {
        method: 'DELETE',
        body: JSON.stringify({ name: fileName, confirmName: typed }),
      });
      await refreshSurface(event.target, 'backup');
      setMessage('#backupMessage', `Backup törölve: ${result.file}${result.deletedFile ? '' : ' (a fájl már hiányzott, az előzmény törölve)'}.`, true);
      return;
    }
    if (action === 'copy-backup-directory') {
      const directory = event.target.closest('[data-backup-directory]')?.dataset.backupDirectory || '';
      if (!directory) return;
      try {
        await navigator.clipboard.writeText(directory);
        setMessage('#backupMessage', 'Mentési útvonal vágólapra másolva.', true);
      } catch (_err) {
        window.prompt('Mentési útvonal:', directory);
      }
      return;
    }
    if (action === 'sync-time-server') {
      const form = event.target.closest('form') || document.querySelector('[data-form="settings-save"]');
      const settings = form ? formData(form) : {};
      setMessage('#timeSettingsMessage', 'Timeserver szinkronizálás folyamatban...');
      try {
        const result = await api('/api/time-settings/sync', {
          method: 'POST',
          body: JSON.stringify({ settings }),
        });
        await bootstrap();
        refreshChrome();
        await refreshSurface(event.target, 'settings');
        const sync = result.sync || {};
        const offset = fmt(Number(sync.offsetMs || 0) / 1000, 3);
        const roundTrip = fmt(Number(sync.roundTripMs || 0), 0);
        setMessage(
          '#timeSettingsMessage',
          `${sync.message || 'Timeserver elérhető. Szinkronizálás sikeres.'} Eltérés: ${offset} mp. Válaszidő: ${roundTrip} ms.`,
          true,
        );
      } catch (err) {
        await bootstrap().catch(() => {});
        refreshChrome();
        await refreshSurface(event.target, 'settings').catch(() => {});
        setMessage('#timeSettingsMessage', `Timeserver ellenőrzés sikertelen: ${err.message}`);
      }
      return;
    }
    if (action === 'download-backup') {
      const fileName = event.target.closest('[data-backup-name]')?.dataset.backupName || '';
      if (!fileName) return;
      const link = document.createElement('a');
      link.href = `/api/backups/download?name=${encodeURIComponent(fileName)}`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    if (action === 'restore-backup') {
      const fileName = event.target.closest('[data-backup-name]')?.dataset.backupName || '';
      if (!fileName) return;
      const typed = window.prompt(`ADATBÁZIS RESTORE\n\nA restore a teljes adatbázist visszaállítja ebből a mentésből:\n${fileName}\n\nA művelet előtt automatikus biztonsági mentés készül, majd a szerver újraindul.\nMegerősítéshez írd be pontosan a backup fájl nevét:`);
      if (typed !== fileName) {
        setMessage('#backupMessage', 'Restore megszakítva: a fájlnév nem egyezett.');
        return;
      }
      try {
        const result = await api('/api/backups/restore', {
          method: 'POST',
          body: JSON.stringify({ name: fileName, confirmName: typed }),
        });
        openResultWindow('Backup restore', `
          <div class="notice warn">A restore elindult. A szerver automatikusan újraindul, pár másodperc múlva frissítsd az oldalt.</div>
          <div class="import-summary">
            <span>Visszaállítás ebből: <strong>${esc(result.restoredFrom)}</strong></span>
            <span>Restore előtti mentés: <strong>${esc(result.safetyBackup)}</strong></span>
          </div>
        `);
      } catch (err) {
        if (/Failed to fetch|NetworkError|Load failed/i.test(String(err?.message || ''))) {
          openResultWindow('Backup restore', `
            <div class="notice warn">A restore valószínűleg elindult, a szerver újraindul. Várj pár másodpercet, majd frissítsd az oldalt.</div>
            <div class="import-summary">
              <span>Visszaállítás ebből: <strong>${esc(fileName)}</strong></span>
            </div>
          `);
        } else {
          setMessage('#backupMessage', `Restore nem indult: ${err.message}`);
        }
      }
      return;
    }
    if (action === 'restore-uploaded-backup') {
      const fileInput = document.querySelector('[data-backup-restore-file]');
      const file = fileInput?.files?.[0];
      if (!file) {
        setMessage('#backupMessage', 'Válassz ki egy .db backup fájlt a restore-hoz.');
        return;
      }
      const typed = window.prompt(`ADATBÁZIS RESTORE\n\nA restore a teljes adatbázist visszaállítja ebből a tallózott fájlból:\n${file.name}\n\nA művelet előtt automatikus biztonsági mentés készül, majd a szerver újraindul.\nMegerősítéshez írd be pontosan a fájl nevét:`);
      if (typed !== file.name) {
        setMessage('#backupMessage', 'Restore megszakítva: a fájlnév nem egyezett.');
        return;
      }
      const fileData = arrayBufferToBase64(await file.arrayBuffer());
      try {
        const result = await api('/api/backups/restore-upload', {
          method: 'POST',
          body: JSON.stringify({ name: file.name, confirmName: typed, fileData }),
        });
        openResultWindow('Backup restore', `
          <div class="notice warn">A restore elindult. A szerver automatikusan újraindul, pár másodperc múlva frissítsd az oldalt.</div>
          <div class="import-summary">
            <span>Visszaállítás ebből: <strong>${esc(result.restoredFrom)}</strong></span>
            <span>Restore előtti mentés: <strong>${esc(result.safetyBackup)}</strong></span>
          </div>
        `);
      } catch (err) {
        if (/Failed to fetch|NetworkError|Load failed/i.test(String(err?.message || ''))) {
          openResultWindow('Backup restore', `
            <div class="notice warn">A restore valószínűleg elindult, a szerver újraindul. Várj pár másodpercet, majd frissítsd az oldalt.</div>
            <div class="import-summary">
              <span>Visszaállítás ebből: <strong>${esc(file.name)}</strong></span>
            </div>
          `);
        } else {
          setMessage('#backupMessage', `Restore nem indult: ${err.message}`);
        }
      }
      return;
    }
    if (action === 'unlock-user') {
      const id = event.target.closest('[data-user-id]')?.dataset.userId;
      if (!id) return;
      await api(`/api/users/${encodeURIComponent(id)}/unlock`, { method: 'POST', body: '{}' });
      await refreshAdminSurface(event.target, 'users');
      return;
    }
    if (action === 'reset-user-password') {
      const button = event.target.closest('[data-user-id]');
      const id = button?.dataset.userId;
      const username = button?.dataset.username || '';
      if (!id) return;
      const password = window.prompt(`Új ideiglenes jelszó: ${username}`);
      if (!password) return;
      await api(`/api/users/${encodeURIComponent(id)}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      await refreshAdminSurface(event.target, 'users');
      return;
    }
    if (action === 'revoke-user-sessions') {
      const button = event.target.closest('[data-user-id]');
      const id = button?.dataset.userId;
      const username = button?.dataset.username || '';
      if (!id || !window.confirm(`Kilépteted a felhasználó összes aktív munkamenetét?\n\n${username}`)) return;
      await api(`/api/users/${encodeURIComponent(id)}/revoke-sessions`, { method: 'POST', body: '{}' });
      await refreshAdminSurface(event.target, state.page === 'sessions' ? 'sessions' : 'users');
      return;
    }
    if (action === 'revoke-session') {
      const id = event.target.closest('[data-session-id]')?.dataset.sessionId;
      if (!id || !window.confirm('Kilépteted ezt a munkamenetet?')) return;
      await api(`/api/admin/sessions/${id}/revoke`, { method: 'POST', body: '{}' });
      await refreshAdminSurface(event.target, 'sessions');
      return;
    }
    if (action === 'delete-log-entry') {
      const id = event.target.closest('[data-log-id]')?.dataset.logId;
      if (!id || !window.confirm('Törlöd ezt a naplóbejegyzést?')) return;
      await api(`/api/logs/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await refreshSurface(event.target, 'logs');
      return;
    }
    if (action === 'delete-visible-logs') {
      const typeLabels = {
        all: 'összes típus',
        system: 'rendszer',
        import: 'import',
        validation: 'validáció',
        master: 'törzsadat',
        admin: 'admin',
        security: 'biztonság',
      };
      const scopeLabel = state.logScope === 'all' ? 'összes cég' : 'aktív cég';
      const typeLabel = typeLabels[state.logType] || state.logType;
      const typed = window.prompt(`A jelenlegi szűrés szerinti naplók törlődnek.\n\nKör: ${scopeLabel}\nTípus: ${typeLabel}\n\nMegerősítéshez írd be: NAPLO`);
      if (typed !== 'NAPLO') return;
      const result = await api(`/api/logs?type=${encodeURIComponent(state.logType)}&scope=${encodeURIComponent(state.logScope)}&companyId=${encodeURIComponent(state.settings.activeCompanyId)}`, { method: 'DELETE' });
      await refreshSurface(event.target, 'logs');
      openResultWindow('Naplók törlése', `<div class="notice">Törölve: <strong>${fmt(result.deleted)}</strong> naplóbejegyzés.</div>`);
      return;
    }
    if (action === 'open-coa-import-window') {
      openCoaImportWindow();
      return;
    }
    if (action === 'choose-gl-file') {
      const root = event.target.closest('.mgm-window') || document;
      root.querySelector('[data-gl-file-picker]')?.click();
      return;
    }
    if (action === 'open-gl-mapping-window') {
      await openGlMappingWindow();
      return;
    }
    if (action === 'validate-gl-import') {
      const year = document.querySelector('#glMappingWindow [data-gl-import-year]')?.value || '';
      const month = document.querySelector('#glMappingWindow [data-gl-import-month]')?.value || '';
      state.glImportTargetYear = year;
      state.glImportTargetMonth = month;
      if (!year || !month) {
        setWindowMessage('glMappingWindow', 'Válassz évet és hónapot a validáció előtt.');
        return;
      }
      const preview = await previewGlImportFromWindow(true);
      state.glImportPreview = preview;
      const selectedTemplateId = document.querySelector('#glMappingWindow [data-template-select="gl"]')?.value || '';
      if (!updateGlMappingWindow(preview)) {
        setWindowContent('glMappingWindow', renderGlMappingWindow(preview, selectedTemplateId, { year, month }));
      }
      setWindowMessage('glMappingWindow', preview.fileErrors?.length || preview.mappingErrors?.length ? 'A validáció hibát talált.' : 'Validáció lefutott.', !(preview.fileErrors?.length || preview.mappingErrors?.length));
      return;
    }
    if (action === 'open-gl-preview-validation-details') {
      openResultWindow('GL validáció', renderGlValidationSummary(state.glImportPreview || {}, { showDetails: true }));
      return;
    }
    if (action === 'save-gl-import-template') {
      const name = document.querySelector('#glMappingWindow [data-gl-template-name]')?.value.trim();
      if (!name) {
        setWindowMessage('glMappingWindow', 'Adj nevet a template-nek.');
        return;
      }
      const mapping = collectColumnMapping('gl-window');
      const result = await api('/api/import/templates', {
        method: 'POST',
        body: JSON.stringify({ importType: 'gl', name, mapping }),
      });
      state.importTemplates = result.templates || [];
      setWindowMessage('glMappingWindow', 'Template mentve az aktív céghez.', true);
      return;
    }
    if (action === 'run-gl-import') {
      const yearValue = document.querySelector('#glMappingWindow [data-gl-import-year]')?.value || '';
      const monthValue = document.querySelector('#glMappingWindow [data-gl-import-month]')?.value || '';
      state.glImportTargetYear = yearValue;
      state.glImportTargetMonth = monthValue;
      if (!yearValue || !monthValue) {
        setWindowMessage('glMappingWindow', 'Válassz évet és hónapot az import előtt.');
        return;
      }
      const year = Number(yearValue);
      const month = Number(monthValue);
      const mapping = collectColumnMapping('gl-window');
      const selectedTemplateId = document.querySelector('#glMappingWindow [data-template-select="gl"]')?.value || '';
      const result = await api('/api/gl/import', {
        method: 'POST',
        body: JSON.stringify({
          ...glImportBasePayload(),
          companyId: state.settings.activeCompanyId,
          year,
          month,
          columnMapping: JSON.stringify(mapping),
        }),
      });
      if (!result.accepted) {
        state.glImportPreview = {
          ...(state.glImportPreview || {}),
          ...result,
          fileErrors: result.fileErrors || state.glImportPreview?.fileErrors || [],
          mappingErrors: result.mappingErrors || state.glImportPreview?.mappingErrors || [],
          stats: result.stats || state.glImportPreview?.stats || {},
        };
        if (!updateGlMappingWindow(state.glImportPreview)) {
          setWindowContent('glMappingWindow', renderGlMappingWindow(state.glImportPreview, selectedTemplateId, { year: yearValue, month: monthValue }));
        }
        setWindowMessage('glMappingWindow', result.message || 'Az import nem hozható létre.');
        return;
      }
      state.glImportFile = null;
      state.glImportPreview = null;
      state.glImportTargetYear = '';
      state.glImportTargetMonth = '';
      closeWindow('glMappingWindow');
      await refreshSurface(event.target, 'gl');
      openResultWindow('GL import létrejött', `
        <div class="import-summary">
          <span>Import azonosító: <strong>${esc(result.batchId || '')}</strong></span>
          <span>Státusz: <strong>${esc(glStatusLabel(result.status))}</strong></span>
          <span>Import sor: <strong>${fmt(result.imported)}</strong></span>
          <span>Kihagyott nulla: <strong>${fmt(result.zeroRows)}</strong></span>
          <span>Ismeretlen GL: <strong>${fmt(result.unknown)}</strong></span>
        </div>
        <div class="notice">Az import bekerült. Aktiválni a részletek ablakban lehet.</div>
      `);
      await openGlImportDetail(result.sessionId);
      return;
    }
    if (action === 'choose-coa-file') {
      document.querySelector('#coaImportWindow [data-coa-file-picker]')?.click();
      return;
    }
    if (action === 'open-coa-mapping-window') {
      await openCoaMappingWindow();
      return;
    }
    if (action === 'open-summary-rules-window') {
      await openSummaryRulesWindow();
      return;
    }
    if (action === 'open-master-data-window') {
      await openMasterDataWindow();
      return;
    }
    if (action === 'open-report-structure') {
      await openReportStructureWindow(event.target.closest('[data-structure-type]')?.dataset.structureType);
      return;
    }
    if (action === 'download-report-structure-template') {
      const type = event.target.closest('[data-structure-type]')?.dataset.structureType || 'MGMT';
      const prefix = type === 'CONS' ? 'krk_' : 'mrk_';
      const rows = [{
        'Riport kód': prefix,
        'Riport kód elnevezés': '',
        'BS/PL': 'BS',
        Csoport1: type === 'CONS' ? 'kcs1_' : 'mcs1_',
        'Csoport1 elnevezés': '',
        'Csoport1 kötelező': 'Igen',
        Csoport2: type === 'CONS' ? 'kcs2_' : 'mcs2_',
        'Csoport2 elnevezés': '',
        'Csoport2 kötelező': 'Igen',
        Csoport3: type === 'CONS' ? 'kcs3_' : 'mcs3_',
        'Csoport3 elnevezés': '',
        'Csoport3 kötelező': 'Nem',
        Aktív: 'Igen',
      }];
      (xlsxDownload || csvDownload)(`${type.toLowerCase()}_riport_torzs_template.xlsx`, rows);
      return;
    }
    if (action === 'open-report-group') {
      const trigger = event.target.closest('[data-structure-type]');
      await openReportGroupWindow(trigger?.dataset.structureType, trigger?.dataset.groupLevel);
      return;
    }
    if (action === 'download-report-group-template') {
      const trigger = event.target.closest('[data-structure-type]');
      const type = trigger?.dataset.structureType || 'MGMT';
      const rows = [1, 2, 3].map((level) => ({
        Csoport: level,
        Kód: type === 'CONS' ? `kcs${level}_` : `mcs${level}_`,
        Megnevezés: '',
        Aktív: 'Igen',
      }));
      (xlsxDownload || csvDownload)(`${type.toLowerCase()}_csoport_torzs_template.xlsx`, rows);
      return;
    }
    if (action === 'open-report-structure-import') {
      await openReportStructureImportWindow(event.target.closest('[data-structure-type]')?.dataset.structureType);
      return;
    }
    if (action === 'choose-report-structure-file') {
      const trigger = event.target.closest('[data-structure-type]');
      document.querySelector(`#reportStructureImportWindow${trigger?.dataset.structureType} [data-report-structure-file-picker]`)?.click();
      return;
    }
    if (action === 'run-report-structure-import') {
      const trigger = event.target.closest('[data-structure-type]');
      const structureType = trigger?.dataset.structureType || '';
      const file = state.reportStructureImportFiles?.[structureType];
      if (!file) {
        setWindowMessage(`reportStructureImportWindow${structureType}`, 'Válassz import fájlt.');
        return;
      }
      const result = await api('/api/master-data/report-codes/import', {
        method: 'POST',
        body: JSON.stringify({ ...file, structureType }),
      });
      if (!result.accepted) {
        openResultWindow('Riport törzs import hiba', `
          <div class="notice bad">Az import nem futott le. Hibák: <strong>${fmt(result.errors?.length || 0)}</strong></div>
          <div class="table-wrap">
            <table class="mgm-data-table">
              <thead><tr><th>Sor</th><th>Kód</th><th>Hiba</th></tr></thead>
              <tbody>${(result.errors || []).map((err) => `<tr><td>${fmt(err.row || '')}</td><td>${esc(err.code || '')}</td><td>${esc(err.message || '')}</td></tr>`).join('')}</tbody>
            </table>
          </div>
        `);
        return;
      }
      delete state.reportStructureImportFiles[structureType];
      await openReportStructureWindow(structureType, { clearDraft: true });
      closeWindow(`reportStructureImportWindow${structureType}`);
      openResultWindow('Riport törzs import', `
        <div class="import-summary">
          <span>Import azonosító: <strong>${esc(result.batchId || '')}</strong></span>
          <span>Riport kód: <strong>${fmt(result.imported || 0)}</strong></span>
          <span>Csoport: <strong>${fmt(result.groups || 0)}</strong></span>
        </div>
        <div class="notice">A riport törzs import befejeződött.</div>
      `);
      return;
    }
    if (action === 'delete-report-groups') {
      const trigger = event.target.closest('[data-structure-type]');
      const structureType = trigger?.dataset.structureType;
      const groupLevel = Number(trigger?.dataset.groupLevel || 1);
      const root = event.target.closest('.mgm-window') || document;
      const codes = Array.from(root.querySelectorAll('[data-report-group-delete-select]:checked')).map((input) => input.value).filter(Boolean);
      if (!codes.length) {
        setWindowMessage(`reportGroupWindow${structureType}${groupLevel}`, 'Nincs kijelölt törölhető csoport.');
        return;
      }
      if (!window.confirm(`Törlöm a kijelölt csoportokat?\n\nDarab: ${codes.length}`)) return;
      event.target.disabled = true;
      let result;
      try {
        result = await api('/api/master-data/report-groups', {
          method: 'DELETE',
          body: JSON.stringify({ structureType, groupLevel, codes }),
        });
      } catch (err) {
        event.target.disabled = false;
        setWindowMessage(`reportGroupWindow${structureType}${groupLevel}`, err.message);
        return;
      }
      const blockedCodes = new Set((result.blocked || []).map((item) => item.code));
      const deletedCodes = codes.filter((code) => !blockedCodes.has(code));
      deletedCodes.forEach((code) => {
        root.querySelector(`[data-report-group-delete-select][value="${CSS.escape(code)}"]`)?.closest('[data-report-group-row]')?.remove();
      });
      removeReportCodeGroupOptions(structureType, groupLevel, deletedCodes);
      const blocked = result.blocked?.length ? ` Nem törölhető használat miatt: ${result.blocked.map((item) => item.code).join(', ')}.` : '';
      setWindowMessage(`reportGroupWindow${structureType}${groupLevel}`, `Törölve: ${fmt(result.deleted || 0)}.${blocked}`, !result.blocked?.length);
      event.target.disabled = false;
      return;
    }
    if (action === 'delete-report-codes') {
      const trigger = event.target.closest('[data-structure-type]');
      const structureType = trigger?.dataset.structureType;
      const def = structureDef(structureType);
      const root = event.target.closest('[data-report-code-root]') || document.querySelector(`#reportStructureWindow${def.type}`);
      const codes = Array.from(root?.querySelectorAll('[data-report-code-delete-select]:checked') || []).map((input) => input.value).filter(Boolean);
      if (!codes.length) {
        setWindowMessage(`reportStructureWindow${def.type}`, 'Nincs kijelölt törölhető riport kód.');
        return;
      }
      if (!window.confirm(`Törlöm a kijelölt riport kódokat?\n\nDarab: ${codes.length}`)) return;
      event.target.disabled = true;
      let result;
      try {
        result = await api('/api/master-data/report-codes', {
          method: 'DELETE',
          body: JSON.stringify({ structureType: def.type, codes }),
        });
      } catch (err) {
        event.target.disabled = false;
        setWindowMessage(`reportStructureWindow${def.type}`, err.message);
        return;
      }
      const blockedCodes = new Set((result.blocked || []).map((item) => item.code));
      const deletedCodes = codes.filter((code) => !blockedCodes.has(code));
      deletedCodes.forEach((code) => {
        root?.querySelector(`[data-report-code-delete-select][value="${CSS.escape(code)}"]`)?.closest('[data-report-code-row]')?.remove();
      });
      removeReportStructureCodeCache(def.type, deletedCodes);
      const masterKey = def.type === 'CONS' ? 'cons' : 'management';
      state.coaReportMaster[masterKey] = (state.coaReportMaster[masterKey] || []).filter((row) => !deletedCodes.includes(row.code));
      const blocked = result.blocked?.length ? ` Nem törölhető használat miatt: ${result.blocked.map((item) => item.code).join(', ')}.` : '';
      setWindowMessage(`reportStructureWindow${def.type}`, `Törölve: ${fmt(result.deleted || 0)}.${blocked}`, !result.blocked?.length);
      event.target.disabled = false;
      return;
    }
    if (action === 'open-coa-edit-window') {
      await openCoaEditWindow(event.target.closest('[data-coa-id]')?.dataset.coaId);
      return;
    }
    if (action === 'show-coa-issues') {
      const row = coaRowById(event.target.closest('[data-coa-id]')?.dataset.coaId);
      if (!row) return;
      const issues = coaIssues(row);
      openResultWindow(`Számlatükör validáció - ${esc(row.glNumber)}`, issues.length
        ? `<div class="notice bad">${issues.map(esc).join('<br>')}</div>`
        : '<div class="notice">Nincs hiba ezen a soron.</div>');
      return;
    }
    if (action === 'open-coa-bulk-edit-window') {
      await openCoaBulkEditWindow();
      return;
    }
    if (action === 'validate-coa-import') {
      const preview = await previewCoaImportFromWindow(true);
      state.coaImportPreview = preview;
      const selectedTemplateId = document.querySelector('#coaMappingWindow [data-template-select="coa"]')?.value || '';
      const selectedRuleIds = Array.from(document.querySelectorAll('[data-rule-scope="coa-window"]:checked')).map((input) => Number(input.value));
      if (!updateCoaMappingWindow(preview, selectedTemplateId, { selectedRuleIds })) {
        setWindowContent('coaMappingWindow', renderCoaMappingWindow(preview, selectedTemplateId, {
          selectedRuleIds,
        }));
      }
      setWindowMessage('coaMappingWindow', preview.fileErrors?.length ? 'A validáció hibát talált.' : '', !preview.fileErrors?.length);
      return;
    }
    if (action === 'open-coa-validation-details') {
      openResultWindow('Számlatükör import validáció', renderCoaValidationDetails(state.coaImportPreview || {}));
      return;
    }
    if (action === 'save-import-template') {
      const name = document.querySelector('#coaMappingWindow [data-template-name]')?.value.trim();
      if (!name) {
        setWindowMessage('coaMappingWindow', 'Adj nevet a template-nek.');
        return;
      }
      const mapping = collectColumnMapping('coa-window');
      const selectedRuleIds = Array.from(document.querySelectorAll('[data-rule-scope="coa-window"]:checked')).map((input) => Number(input.value));
      const result = await api('/api/import/templates', {
        method: 'POST',
        body: JSON.stringify({
          importType: 'coa',
          name,
          mapping,
          selectedRuleIds,
        }),
      });
      state.importTemplates = result.templates || [];
      setWindowMessage('coaMappingWindow', 'Template mentve a közös tárba.', true);
      return;
    }
    if (action === 'run-coa-import') {
      const mapping = collectColumnMapping('coa-window');
      if (!mapping.gl_number || !mapping.gl_name) {
        setWindowMessage('coaMappingWindow', 'A GL szám és GL név megfeleltetése kötelező.');
        return;
      }
      const rules = selectedSummaryRules('coa-window');
      const validation = await previewCoaImportFromWindow(true);
      state.coaImportPreview = validation;
      if (!validation.canImport) {
        const selectedTemplateId = document.querySelector('#coaMappingWindow [data-template-select="coa"]')?.value || '';
        const selectedRuleIds = Array.from(document.querySelectorAll('[data-rule-scope="coa-window"]:checked')).map((input) => Number(input.value));
        if (!updateCoaMappingWindow(validation, selectedTemplateId, { selectedRuleIds })) {
          setWindowContent('coaMappingWindow', renderCoaMappingWindow(validation, selectedTemplateId, { selectedRuleIds }));
        }
        setWindowMessage('coaMappingWindow', validation.fileErrors?.length ? 'Az import nem indítható fájlhiba miatt.' : 'Nincs importálható sor.');
        return;
      }
      const result = await api('/api/coa/import', {
        method: 'POST',
        body: JSON.stringify({
          ...coaImportBasePayload(),
          companyId: state.settings.activeCompanyId,
          columnMapping: JSON.stringify(mapping),
          summaryRules: JSON.stringify(rules),
        }),
      });
      if (!result.accepted) {
        state.coaImportPreview = result;
        const selectedTemplateId = document.querySelector('#coaMappingWindow [data-template-select="coa"]')?.value || '';
        const selectedRuleIds = Array.from(document.querySelectorAll('[data-rule-scope="coa-window"]:checked')).map((input) => Number(input.value));
        if (!updateCoaMappingWindow(result, selectedTemplateId, { selectedRuleIds })) {
          setWindowContent('coaMappingWindow', renderCoaMappingWindow(result, selectedTemplateId, { selectedRuleIds }));
        }
        setWindowMessage('coaMappingWindow', result.message || 'Az import nem indult el.');
        return;
      }
      state.coaImportFile = null;
      state.coaImportPreview = null;
      closeWindow('coaMappingWindow');
      closeWindow('coaImportWindow');
      if (await refreshPageWindow('coa')) {
        setScopedMessage(document.querySelector(`#${pageWindowId('coa')}`), '#coaMessage', `Import kész: ${result.imported} sor. Kihagyott inaktív: ${result.skippedInactive || 0}.`, true);
      } else if (state.page === 'coa') {
        await renderCoa();
        setMessage('#coaMessage', `Import kész: ${result.imported} sor. Kihagyott inaktív: ${result.skippedInactive || 0}.`, true);
      }
      openResultWindow('Import eredménye', `
        <div class="import-summary">
          <span>Import azonosító: <strong>${esc(result.batchId || '')}</strong></span>
          <span>Importált sor: <strong>${fmt(result.imported)}</strong></span>
          <span>Kihagyott inaktív: <strong>${fmt(result.skippedInactive)}</strong></span>
          <span>Validált importálható: <strong>${fmt(validation.stats?.importable)}</strong></span>
        </div>
        <div class="notice">A számlatükör import befejeződött.</div>
      `);
      return;
    }
    if (action === 'delete-summary-rule') {
      const id = event.target.closest('[data-id]')?.dataset.id;
      if (!id || !window.confirm('Töröljem ezt a szabályt?')) return;
      await api(`/api/summary-rules/${id}`, { method: 'DELETE' });
      await openSummaryRulesWindow();
      return;
    }
    if (action === 'open-data-admin-window') {
      await openDataAdminWindow();
      return;
    }
    if (action === 'open-validation-rules-window') {
      await openValidationRulesWindow();
      return;
    }
    if (action === 'save-validation-rules') {
      const rows = Array.from(document.querySelectorAll('#validationRulesWindow [data-validation-rule-row]'));
      const rules = rows.map((row) => ({
        scope: row.dataset.scope,
        fieldKey: row.dataset.fieldKey,
        enabled: Boolean(row.querySelector('[data-validation-rule-enabled]')?.checked),
        severity: row.querySelector('[data-validation-rule-severity]')?.value || 'ERROR',
      }));
      await api('/api/validation-rules', { method: 'POST', body: JSON.stringify({ rules }) });
      setWindowMessage('validationRulesWindow', 'Validációs szabályok mentve.', true);
      return;
    }
    if (action === 'run-data-clear') {
      const company = state.companies.find((c) => c.id === Number(state.settings.activeCompanyId));
      if (!window.confirm(`Biztosan törlöd a kijelölt éves adatokat?\n\nCég: ${company ? `${company.code} - ${company.name}` : 'aktív cég'}\nÉv: ${state.settings.activeYear}`)) return;
      const body = {};
      document.querySelectorAll('[data-clear-table]').forEach((input) => {
        body[input.dataset.clearTable] = Boolean(input.checked);
      });
      if (body.clearCoa || body.clearMasterData) {
        const typed = window.prompt(`VÉDETT TÖRLÉS\n\nA kijelölt védett adatok törléséhez írd be a cég kódját: ${company?.code || ''}`);
        if (typed !== company?.code) {
          setWindowMessage('dataAdminWindow', 'A védett törlés megszakítva: a cégkód nem egyezett.');
          return;
        }
        body.confirmCoaCode = typed;
        body.confirmMasterDataCode = typed;
      }
      const result = await api('/api/admin/clear-company-data', { method: 'POST', body: JSON.stringify(body) });
      await bootstrap();
      state.page = 'dashboard';
      state.activeModule = 'home';
      state.ribbonTab = null;
      history.replaceState(null, '', '#dashboard');
      refreshChrome();
      await refreshOpenPageWindows();
      await loadPage();
      await openDataAdminWindow();
      const glDeletedSessions = Number(result.glDeletedImportSessions || 0);
      const glDeletedText = glDeletedSessions ? ` ${glDeletedSessions} import session GL-ből törölve státuszt kapott.` : '';
      const backupText = result.safetyBackup ? ` Törlés előtti backup: ${result.safetyBackup}.` : '';
      setWindowMessage('dataAdminWindow', `Törölve: ${result.chartOfAccounts} COA, ${result.summaryRules} sorszabály, ${result.masterData} törzsadat, ${result.glRows} GL, ${result.budgetRows} budget/forecast, ${result.importSessions} import session, ${result.eventLog} eseménynapló sor.${glDeletedText}${backupText}`, true);
      return;
    }
    if (action === 'delete-company') {
      const button = event.target.closest('[data-company-id]');
      const id = button?.dataset.companyId;
      const code = button?.dataset.companyCode || '';
      const name = button?.dataset.companyName || '';
      if (!id) return;
      const typed = window.prompt(`TELJES CÉG TÖRLÉSE\n\nCég: ${code} - ${name}\n\nEz törli a céghez tartozó minden COA, GL, budget/forecast, template, sorszabály, import és napló adatot minden évből.\nA művelet nem visszavonható.\n\nMegerősítéshez írd be a cég kódját:`);
      if (typed !== code) return;
      const result = await api(`/api/companies/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await bootstrap();
      refreshChrome();
      setSettingsTabs({ main: 'companies' });
      await refreshOpenPageWindows();
      openResultWindow('Cég törlése', `
        <div class="import-summary">
          <span>COA: <strong>${fmt(result.counts?.chartOfAccounts)}</strong></span>
          <span>GL: <strong>${fmt(result.counts?.glRows)}</strong></span>
          <span>Budget/Forecast: <strong>${fmt(result.counts?.budgetRows)}</strong></span>
          <span>Törzsadat: <strong>${fmt(result.counts?.masterData)}</strong></span>
          <span>Template: <strong>${fmt(result.counts?.importTemplates)}</strong></span>
          <span>Sorszabály: <strong>${fmt(result.counts?.summaryRules)}</strong></span>
          <span>Import: <strong>${fmt(result.counts?.importSessions)}</strong></span>
          <span>Napló: <strong>${fmt(result.counts?.eventLog)}</strong></span>
          ${result.safetyBackup ? `<span>Törlés előtti backup: <strong>${esc(result.safetyBackup)}</strong></span>` : ''}
        </div>
        <div class="notice">A(z) ${esc(code)} cég és minden kapcsolódó adata törölve.</div>
      `);
      return;
    }
    if (action === 'open-gl-import-detail') {
      const id = event.target.closest('[data-session-id]')?.dataset.sessionId;
      if (id) await openGlImportDetail(id);
      return;
    }
    if (action === 'validate-gl-import-session') {
      const id = event.target.closest('[data-session-id]')?.dataset.sessionId;
      if (!id) return;
      const result = await api(`/api/gl/import-sessions/${encodeURIComponent(id)}/validate`, { method: 'POST', body: '{}' });
      await openGlImportDetail(id);
      openResultWindow('GL validáció', `
        <div class="notice ${result.status === 'READY' || result.status === 'ACTIVE' || result.status === 'GL_DELETED' ? '' : 'warn'}">Státusz: <strong>${esc(glStatusLabel(result.status))}</strong></div>
        ${renderGlValidationSummary(result)}
      `);
      return;
    }
    if (action === 'open-gl-validation-list') {
      const id = event.target.closest('[data-session-id]')?.dataset.sessionId;
      const data = String(state.glImportDetail?.session?.id || '') === String(id)
        ? state.glImportDetail
        : await api(`/api/gl/import-sessions/${encodeURIComponent(id)}`);
      const issueRows = [];
      (data.rows || []).forEach((row) => {
        (row.businessErrors || []).forEach((code) => issueRows.push({ row, code, level: 'Hiba' }));
        (row.softErrors || []).forEach((code) => issueRows.push({ row, code, level: row.softOk ? 'Figyelmeztetés OK' : 'Figyelmeztetés' }));
      });
      openResultWindow('GL validációs lista', issueRows.length ? `
        <div class="table-wrap">
          <table class="mgm-data-table">
            <thead><tr><th>Szint</th><th>GL</th><th>Megnevezés</th><th>Üzenet</th><th>Gyors művelet</th></tr></thead>
            <tbody>
              ${issueRows.map(({ row, code, level }) => {
                const actions = [];
                if (code === 'UNKNOWN_GL') actions.push(`<button type="button" class="secondary slim" data-action="open-missing-gl-window" data-session-id="${data.session.id}" data-gl-number="${esc(row.gl_number)}" data-gl-name="${esc(row.imported_gl_name)}">GL felvétele</button>`);
                if ((code === 'NAME_MISMATCH' || code === 'MISSING_NAME') && row.coa_gl_name) actions.push(`<button type="button" class="secondary slim" data-action="refresh-gl-row-name" data-row-id="${row.id}" data-session-id="${data.session.id}">Név frissítése</button>`);
                if ((row.softErrors || []).includes(code) && !row.softOk) actions.push(`<button type="button" class="secondary slim" data-action="soft-ok-gl-row" data-row-id="${row.id}" data-session-id="${data.session.id}">Hiba OK</button>`);
                return `<tr>
                  <td>${esc(level)}</td>
                  <td>${esc(row.gl_number)}</td>
                  <td>${esc(row.imported_gl_name || row.coa_gl_name || '')}</td>
                  <td>${esc(glIssueLabel(code))}</td>
                  <td>${actions.join(' ') || ''}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="notice">Nincs validációs hiba vagy figyelmeztetés.</div>');
      return;
    }
    if (action === 'activate-gl-import') {
      const button = event.target.closest('[data-session-id]');
      const id = button?.dataset.sessionId;
      const companyCode = button?.dataset.companyCode || '';
      const reactivationRequested = button?.dataset.reactivate === 'true';
      if (!id) return;
      let result = await api(`/api/gl/import-sessions/${encodeURIComponent(id)}/activate`, { method: 'POST', body: '{}' });
      if (result.needsConfirmation) {
        if (!window.confirm(`Már van aktív GL adat erre a hónapra (${fmt(result.existingActiveRows)} sor).\n\nAz aktiválás felülírja a korábbi aktív adatot.`)) return;
        const typed = window.prompt(`Megerősítéshez írd be a cég kódját: ${companyCode || result.companyCode || ''}`);
        if (typed !== (companyCode || result.companyCode || '')) return;
        result = await api(`/api/gl/import-sessions/${encodeURIComponent(id)}/activate`, {
          method: 'POST',
          body: JSON.stringify({ confirmCompanyCode: typed }),
        });
      }
      await refreshSurface(event.target, 'gl');
      await openGlImportDetail(id);
      const activatedTitle = result.reactivated || reactivationRequested ? 'GL import újraaktiválva' : 'GL import aktiválva';
      openResultWindow(result.activated ? activatedTitle : 'GL import nem aktiválható', result.activated
        ? `<div class="notice">Az import aktív lett. Felülírt korábbi sorok: <strong>${fmt(result.overwrittenRows)}</strong>.</div>`
        : `<div class="notice bad">${esc(result.message || 'Az import nem aktiválható.')}</div>${renderGlValidationSummary(result)}`);
      return;
    }
    if (action === 'refresh-gl-names') {
      const button = event.target.closest('[data-session-id]');
      const id = button?.dataset.sessionId;
      const companyCode = button?.dataset.companyCode || '';
      if (!id) return;
      if (!window.confirm('A művelet lecseréli az importált megnevezéseket a számlatükörben lévő aktuális megnevezésekre.')) return;
      const typed = window.prompt(`Megerősítéshez írd be a cég kódját: ${companyCode}`);
      if (typed !== companyCode) return;
      const result = await api(`/api/gl/import-sessions/${encodeURIComponent(id)}/refresh-names`, {
        method: 'POST',
        body: JSON.stringify({ confirmCompanyCode: typed }),
      });
      await openGlImportDetail(id);
      openResultWindow('Megnevezések frissítése', `<div class="notice">Frissített sorok: <strong>${fmt(result.updated)}</strong>. Új státusz: <strong>${esc(glStatusLabel(result.status))}</strong>.</div>`);
      return;
    }
    if (action === 'soft-ok-gl-row') {
      const button = event.target.closest('[data-row-id]');
      const rowId = button?.dataset.rowId;
      const sessionId = button?.dataset.sessionId;
      if (!rowId || !window.confirm('Elfogadod ezt a soft hibát?')) return;
      await api(`/api/gl/import-rows/${encodeURIComponent(rowId)}/soft-ok`, { method: 'POST', body: '{}' });
      if (sessionId) await openGlImportDetail(sessionId);
      return;
    }
    if (action === 'soft-ok-gl-session') {
      const id = event.target.closest('[data-session-id]')?.dataset.sessionId;
      if (!id || !window.confirm('Elfogadod az import összes soft hibáját?')) return;
      await api(`/api/gl/import-sessions/${encodeURIComponent(id)}/soft-ok`, { method: 'POST', body: '{}' });
      await openGlImportDetail(id);
      return;
    }
    if (action === 'refresh-gl-row-name') {
      const button = event.target.closest('[data-row-id]');
      const rowId = button?.dataset.rowId;
      const sessionId = button?.dataset.sessionId;
      if (!rowId) return;
      await api(`/api/gl/import-rows/${encodeURIComponent(rowId)}/refresh-name`, { method: 'POST', body: '{}' });
      if (sessionId) await openGlImportDetail(sessionId);
      return;
    }
    if (action === 'show-gl-row-errors') {
      const rowId = Number(event.target.closest('[data-row-id]')?.dataset.rowId);
      const row = state.glImportDetail?.rows?.find((item) => Number(item.id) === rowId);
      if (!row) return;
      const business = (row.businessErrors || []).map(glIssueLabel);
      const soft = (row.softErrors || []).map(glIssueLabel);
      openResultWindow(`GL sor hiba - ${row.gl_number}`, `
        ${business.length ? `<div class="notice bad"><strong>Kezelendő hiba</strong><br>${business.map(esc).join('<br>')}</div>` : ''}
        ${soft.length ? `<div class="notice warn"><strong>Soft hiba</strong><br>${soft.map(esc).join('<br>')}${row.softOk ? '<br><strong>Hiba OK megadva.</strong>' : ''}</div>` : ''}
        ${!business.length && !soft.length ? '<div class="notice">Nincs hiba ezen a soron.</div>' : ''}
      `);
      return;
    }
    if (action === 'open-missing-gl-window') {
      const button = event.target.closest('[data-gl-number]');
      openMissingGlWindow({
        sessionId: button?.dataset.sessionId || '',
        glNumber: button?.dataset.glNumber || '',
        glName: button?.dataset.glName || '',
      });
      return;
    }
    if (action === 'load-sample-data') {
      const result = await api('/api/sample-data/load', { method: 'POST', body: '{}' });
      const message = `Betöltve: ${result.coaRows} COA sor, ${result.glRows} GL sor, ${result.budgetRows} budget/forecast sor.`;
      await bootstrap();
      state.page = 'dashboard';
      state.activeModule = 'home';
      state.ribbonTab = null;
      history.replaceState(null, '', '#dashboard');
      refreshChrome();
      await refreshOpenPageWindows();
      await loadPage();
      setMessage('#sampleMessage', message, true);
      return;
    }
  } catch (err) {
    content(`<div class="notice bad">${esc(err.message)}</div>`);
  }
});

document.addEventListener('change', async (event) => {
  if (event.target.closest('[data-log-filter]')) {
    refreshLogsTable(event.target);
    return;
  }

  const permissionUser = event.target.closest('[data-permission-user]');
  if (permissionUser) {
    state.permissionUserId = permissionUser.value || '';
    await refreshSurface(permissionUser, 'permissions');
    return;
  }

  const companyPermission = event.target.closest('[data-company-permission]');
  if (companyPermission?.dataset.companyPermission === 'canManage' && companyPermission.checked) {
    const row = companyPermission.closest('[data-permission-company]');
    const canView = row?.querySelector('[data-company-permission="canView"]');
    if (canView) canView.checked = true;
    return;
  }

  const companyLogoFile = event.target.closest('[data-company-logo-file]');
  if (companyLogoFile) {
    const file = companyLogoFile.files?.[0];
    const form = companyLogoFile.dataset.companyForm ? document.querySelector(`#${companyLogoFile.dataset.companyForm}`) : companyLogoFile.closest('form');
    if (!file || !form) return;
    const encoded = arrayBufferToBase64(await file.arrayBuffer());
    const logoData = `data:${file.type || 'application/octet-stream'};base64,${encoded}`;
    const logoDataInput = form.querySelector('[name="logoData"]');
    const logoFileInput = form.querySelector('[name="logoFileName"]');
    if (logoDataInput) logoDataInput.value = logoData;
    if (logoFileInput) logoFileInput.value = file.name;
    const nameSlot = form.querySelector('[data-company-logo-name]');
    if (nameSlot) nameSlot.textContent = file.name;
    return;
  }

  const backupScheduleType = event.target.closest('[data-backup-schedule-type]');
  if (backupScheduleType) {
    const form = backupScheduleType.closest('form');
    const type = backupScheduleType.value || 'daily';
    form?.querySelectorAll('[data-backup-schedule-section]').forEach((section) => {
      const sectionType = section.dataset.backupScheduleSection;
      section.style.display = sectionType === type ? '' : 'none';
    });
    return;
  }

  const uiLabelImportFile = event.target.closest('[data-ui-label-import-file]');
  if (uiLabelImportFile) {
    const file = uiLabelImportFile.files?.[0];
    if (!file) return;
    try {
      const payload = await readImportFile(file);
      const result = await api('/api/ui-labels/import', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      window.__uiLabels = result.labels || [];
      await bootstrap();
      refreshChrome();
      await refreshSurface(uiLabelImportFile, 'settings');
      setMessage('#uiLabelsMessage', `Importálva: ${fmt(result.imported || 0)} címke.`, true);
    } catch (err) {
      setMessage('#uiLabelsMessage', `Címke import sikertelen: ${err.message}`);
    } finally {
      uiLabelImportFile.value = '';
    }
    return;
  }

  const reportCodeActiveToggle = event.target.closest('[data-report-code-active]');
  if (reportCodeActiveToggle) {
    const row = reportCodeActiveToggle.closest('[data-report-code-row]');
    await saveReportCodeRow(row, { activeOnly: true, previousActive: row?.dataset.active === '1' });
    return;
  }

  const reportGroupActiveToggle = event.target.closest('[data-report-group-active]');
  if (reportGroupActiveToggle) {
    const row = reportGroupActiveToggle.closest('[data-report-group-row]');
    await saveReportGroupRow(row, { activeOnly: true, previousActive: row?.dataset.active === '1' });
    return;
  }

  const reportCodeColumnAll = event.target.closest('[data-report-code-column-all]');
  if (reportCodeColumnAll) {
    const root = reportCodeColumnAll.closest('[data-report-code-root]');
    root?.querySelectorAll('[data-report-code-column]').forEach((input) => {
      input.checked = reportCodeColumnAll.checked;
    });
    saveColumnOrderFromPanel(reportCodeColumnAll);
    return;
  }

  const reportCodeColumn = event.target.closest('[data-report-code-column]');
  if (reportCodeColumn) {
    saveColumnOrderFromPanel(reportCodeColumn);
    return;
  }

  const coaColumnAll = event.target.closest('[data-coa-column-all]');
  if (coaColumnAll) {
    const root = coaRootFromSource(coaColumnAll);
    root?.querySelectorAll('[data-coa-column]').forEach((input) => {
      input.checked = coaColumnAll.checked;
    });
    saveColumnOrderFromPanel(coaColumnAll);
    return;
  }

  if (event.target.closest('[data-coa-column]')) {
    saveColumnOrderFromPanel(event.target.closest('[data-coa-column]'));
    return;
  }

  if (event.target.closest('[data-coa-filter]')) {
    refreshCoaTable(event.target);
    return;
  }

  const reportGroupSelect = event.target.closest('[data-report-group-select]');
  if (reportGroupSelect) {
    const scope = reportGroupSelect.closest('[data-report-code-row]') || reportGroupSelect.closest('form');
    const target = scope?.querySelector(`[data-report-group-name="${reportGroupSelect.dataset.reportGroupSelect}"]`);
    if (target) target.value = reportGroupSelect.selectedOptions?.[0]?.dataset.name || '';
    return;
  }

  if (event.target.closest('[data-trial-filter]')) {
    refreshTrialBalanceTable();
    return;
  }

  const coaPicker = event.target.closest('[data-coa-file-picker]');
  if (coaPicker) {
    const file = coaPicker.files?.[0];
    if (!file) return;
    try {
      state.coaImportFile = await readImportFile(file);
      state.coaImportPreview = null;
      setWindowContent('coaImportWindow', renderCoaUploadWindow());
    } catch (err) {
      setWindowMessage('coaImportWindow', err.message);
    }
    return;
  }

  const glPicker = event.target.closest('[data-gl-file-picker]');
  if (glPicker) {
    const file = glPicker.files?.[0];
    if (!file) return;
    try {
      state.glImportFile = await readImportFile(file);
      state.glImportPreview = null;
      state.glImportTargetYear = '';
      state.glImportTargetMonth = '';
      await refreshSurface(glPicker, 'gl');
    } catch (err) {
      setScopedMessage(glPicker, '#glMessage', err.message);
    }
    return;
  }

  const reportStructurePicker = event.target.closest('[data-report-structure-file-picker]');
  if (reportStructurePicker) {
    const file = reportStructurePicker.files?.[0];
    const structureType = reportStructurePicker.dataset.structureType || '';
    if (!file || !structureType) return;
    try {
      state.reportStructureImportFiles = state.reportStructureImportFiles || {};
      state.reportStructureImportFiles[structureType] = await readImportFile(file);
      const def = structureDef(structureType);
      setWindowContent(`reportStructureImportWindow${structureType}`, renderReportStructureImportWindow(def, state.reportStructureImportFiles[structureType]));
    } catch (err) {
      setWindowMessage(`reportStructureImportWindow${structureType}`, err.message);
    }
    return;
  }

  if (event.target.closest('[data-map-scope="coa-window"], [data-rule-scope="coa-window"]')) {
    const preview = await previewCoaImportFromWindow(false);
    state.coaImportPreview = preview;
    const selectedTemplateId = document.querySelector('#coaMappingWindow [data-template-select="coa"]')?.value || '';
    const selectedRuleIds = Array.from(document.querySelectorAll('[data-rule-scope="coa-window"]:checked')).map((input) => Number(input.value));
    if (!updateCoaMappingWindow(preview, selectedTemplateId, { selectedRuleIds })) {
      setWindowContent('coaMappingWindow', renderCoaMappingWindow(preview, selectedTemplateId, { selectedRuleIds }));
    }
    return;
  }

  if (event.target.closest('[data-map-scope="gl-window"]')) {
    const year = document.querySelector('#glMappingWindow [data-gl-import-year]')?.value || '';
    const month = document.querySelector('#glMappingWindow [data-gl-import-month]')?.value || '';
    state.glImportTargetYear = year;
    state.glImportTargetMonth = month;
    const preview = await previewGlImportFromWindow(false);
    state.glImportPreview = preview;
    const selectedTemplateId = document.querySelector('#glMappingWindow [data-template-select="gl"]')?.value || '';
    if (!updateGlMappingWindow(preview)) {
      setWindowContent('glMappingWindow', renderGlMappingWindow(preview, selectedTemplateId, { year, month }));
    }
    return;
  }

  const templateSelect = event.target.closest('[data-template-select="coa"]');
  if (templateSelect) {
    await openCoaMappingWindow(templateSelect.value);
    return;
  }

  const glTemplateSelect = event.target.closest('[data-template-select="gl"]');
  if (glTemplateSelect) {
    await openGlMappingWindow(glTemplateSelect.value);
    return;
  }

  const fileInput = event.target.closest('[data-file-target]');
  if (fileInput) {
    const target = document.querySelector(`#${fileInput.dataset.fileTarget}`);
    const file = fileInput.files?.[0];
    if (target && file) {
      const fileNameTarget = fileInput.dataset.fileNameTarget ? document.querySelector(`#${fileInput.dataset.fileNameTarget}`) : null;
      if (fileNameTarget) fileNameTarget.value = file.name;
      const fileTypeTarget = fileInput.dataset.fileTypeTarget ? document.querySelector(`#${fileInput.dataset.fileTypeTarget}`) : null;
      const fileDataTarget = fileInput.dataset.fileDataTarget ? document.querySelector(`#${fileInput.dataset.fileDataTarget}`) : null;
      const ext = file.name.toLowerCase().split('.').pop() || '';
      if (fileTypeTarget) fileTypeTarget.value = ext;
      if (ext === 'xlsx') {
        if (fileDataTarget) fileDataTarget.value = arrayBufferToBase64(await file.arrayBuffer());
        target.value = `Excel fájl betöltve: ${file.name}\nA rendszer az első munkalapot fogja importálni.`;
      } else {
        if (fileDataTarget) fileDataTarget.value = '';
        target.value = await file.text();
      }
      const previewTarget = fileInput.dataset.previewTarget ? document.querySelector(`#${fileInput.dataset.previewTarget}`) : null;
      if (previewTarget) previewTarget.innerHTML = '';
    }
    return;
  }

  const trialColumnAll = event.target.closest('[data-trial-column-all]');
  if (trialColumnAll) {
    const root = trialBalanceRootFromSource(trialColumnAll);
    root?.querySelectorAll('[data-trial-column]').forEach((input) => {
      input.checked = trialColumnAll.checked;
    });
    saveColumnOrderFromPanel(trialColumnAll);
    return;
  }

  if (event.target.closest('[data-trial-column]')) {
    saveColumnOrderFromPanel(event.target.closest('[data-trial-column]'));
    return;
  }

  if (event.target.closest('[data-trial-filter]')) {
    refreshTrialBalanceTable(event.target);
    return;
  }

  if (event.target.closest('[data-gl-import-list-filter]')) {
    refreshGlImportSessionsTable(event.target);
    return;
  }

  const input = event.target.closest('[data-context]');
  if (!input) return;
  const previousCompanyId = String(state.settings.activeCompanyId || '');
  const contextKey = input.dataset.context;
  state.settings[input.dataset.context] = input.value;
  try {
    await saveContext();
    if (contextKey === 'activeCompanyId' && String(state.settings.activeCompanyId || '') !== previousCompanyId) {
      closeAllWindows();
      await bootstrap();
      state.page = 'dashboard';
      state.activeModule = 'home';
      state.ribbonTab = null;
      history.replaceState(null, '', '#dashboard');
      refreshChrome();
      await loadPage();
      return;
    }
    refreshChrome();
    const pageWindow = input.closest('.mgm-window')?.dataset.pageWindow;
    if (pageWindow) {
      await refreshPageWindow(pageWindow);
    } else {
      await refreshOpenPageWindows();
      await loadPage();
    }
  } catch (err) {
    content(`<div class="notice bad">${esc(err.message)}</div>`);
  }
});

document.addEventListener('focusin', (event) => {
  const prefixed = event.target.closest?.('[data-code-prefix]');
  if (prefixed) enforceCodePrefix(prefixed);
});

document.addEventListener('input', (event) => {
  const prefixed = event.target.closest?.('[data-code-prefix]');
  if (prefixed) enforceCodePrefix(prefixed);
  const reportCodeField = event.target.closest?.('[data-report-code-field]');
  if (reportCodeField) ensureReportCodeDraftRow?.(reportCodeField.closest('[data-report-code-row]'));
  const reportGroupField = event.target.closest?.('[data-report-group-field]');
  if (reportGroupField) ensureReportGroupDraftRow?.(reportGroupField.closest('[data-report-group-row]'));
  if (event.target.closest('[data-coa-filter="search"]')) refreshCoaTable(event.target);
  if (event.target.closest('[data-trial-filter]')) refreshTrialBalanceTable(event.target);
  if (event.target.closest('[data-gl-import-list-filter]')) refreshGlImportSessionsTable(event.target);
  if (event.target.closest('[data-log-filter]')) refreshLogsTable(event.target);
});

document.addEventListener('keyup', (event) => {
  if (event.key === 'Enter' && event.target.closest('[data-log-filter]')) refreshLogsTable(event.target);
});

document.addEventListener('focusout', (event) => {
  const coaField = event.target.closest?.('[data-coa-field]');
  if (coaField) {
    const row = coaField.closest('[data-coa-row]');
    setTimeout(() => {
      if (!row?.isConnected || row.contains(document.activeElement)) return;
      saveCoaInlineRow(row);
    }, 0);
    return;
  }

  const reportCodeField = event.target.closest?.('[data-report-code-field]');
  if (reportCodeField) {
    const row = reportCodeField.closest('[data-report-code-row]');
    if (!row) return;
    setTimeout(() => {
      if (!row.isConnected || row.contains(document.activeElement)) return;
      saveReportCodeRow(row, { silentIncomplete: true });
    }, 0);
    return;
  }

  const reportGroupField = event.target.closest?.('[data-report-group-field]');
  if (!reportGroupField) return;
  const row = reportGroupField.closest('[data-report-group-row]');
  if (!row) return;
  setTimeout(() => {
    if (!row.isConnected || row.contains(document.activeElement)) return;
    saveReportGroupRow(row, { silentIncomplete: true });
  }, 0);
});

document.addEventListener('dblclick', (event) => {
  const groupRow = event.target.closest('[data-report-group-row][data-mode="view"]');
  if (groupRow && event.target.closest('input, button, select, textarea')) return;
  if (groupRow) setReportGroupRowEditing(groupRow);

  const reportCodeRow = event.target.closest('[data-report-code-row][data-mode="view"]');
  if (reportCodeRow && !event.target.closest('input, button, select, textarea')) {
    setReportCodeRowEditing(reportCodeRow);
    return;
  }

  const coaRow = event.target.closest('[data-coa-row][data-mode="view"]');
  if (coaRow && !event.target.closest('input, button, select, textarea')) setCoaRowEditing(coaRow);
});

document.addEventListener('keydown', async (event) => {
  if (event.key === 'Escape') {
    if (state.statusMenu) {
      event.preventDefault();
      state.statusMenu = null;
      refreshChrome();
      return;
    }
    const openChooser = document.querySelector('.column-chooser[open]');
    if (openChooser) {
      event.preventDefault();
      closeColumnChoosers();
      return;
    }
  }

  const coaField = event.target.closest?.('[data-coa-field]');
  if (coaField && event.key === 'Enter') {
    event.preventDefault();
    await saveCoaInlineRow(coaField.closest('[data-coa-row]'));
    return;
  }

  if (coaField && event.key === 'Escape') {
    event.preventDefault();
    restoreCoaRow(coaField.closest('[data-coa-row]'));
    return;
  }

  const reportCodeField = event.target.closest?.('[data-report-code-field]');
  if (reportCodeField && event.key === 'Enter') {
    event.preventDefault();
    const row = reportCodeField.closest('[data-report-code-row]');
    if (!row) return;
    const wasNew = row.dataset.mode === 'new';
    const payload = reportCodePayload(row);
    const saved = await saveReportCodeRow(row);
    if (saved && wasNew) {
      setTimeout(() => {
        document.querySelector(`#reportStructureWindow${payload.structureType} [data-report-code-row][data-mode="new"] [data-report-code-field="code"]`)?.focus();
      }, 0);
    }
    return;
  }

  if (reportCodeField && event.key === 'Escape') {
    const row = reportCodeField.closest('[data-report-code-row]');
    if (row?.dataset.mode === 'edit') {
      event.preventDefault();
      restoreReportCodeRow(row);
      return;
    }
  }

  const reportGroupField = event.target.closest?.('[data-report-group-field]');
  if (reportGroupField && event.key === 'Enter') {
    event.preventDefault();
    const row = reportGroupField.closest('[data-report-group-row]');
    if (!row) return;
    const wasNew = row.dataset.mode === 'new';
    const payload = reportGroupRowPayload(row);
    const saved = await saveReportGroupRow(row);
    if (saved && wasNew) {
      setTimeout(() => {
        document.querySelector(`#reportGroupWindow${payload.structureType}${payload.groupLevel} [data-report-group-row][data-mode="new"] [data-report-group-field="code"]`)?.focus();
      }, 0);
    }
    return;
  }

  if (reportGroupField && event.key === 'Escape') {
    const row = reportGroupField.closest('[data-report-group-row]');
    if (row?.dataset.mode === 'edit') {
      event.preventDefault();
      restoreReportGroupRow(row);
      return;
    }
  }

  if (event.key !== 'Escape') return;
  const windows = Array.from(document.querySelectorAll('.mgm-window'));
  if (!windows.length) return;
  const topWindow = windows.sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0];
  if (topWindow?.id) {
    event.preventDefault();
    closeWindow(topWindow.id);
  }
});

document.addEventListener('dragover', (event) => {
  const zone = event.target.closest('[data-dropzone]');
  if (!zone) return;
  event.preventDefault();
  zone.classList.add('dragging');
});

document.addEventListener('dragleave', (event) => {
  const zone = event.target.closest('[data-dropzone]');
  if (zone) zone.classList.remove('dragging');
});

document.addEventListener('drop', async (event) => {
  const zone = event.target.closest('[data-dropzone]');
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove('dragging');
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  try {
    if (zone.dataset.dropzone === 'coa') {
      state.coaImportFile = await readImportFile(file);
      state.coaImportPreview = null;
      setWindowContent('coaImportWindow', renderCoaUploadWindow());
    } else if (zone.dataset.dropzone === 'gl') {
      state.glImportFile = await readImportFile(file);
      state.glImportPreview = null;
      state.glImportTargetYear = '';
      state.glImportTargetMonth = '';
      await refreshSurface(zone, 'gl');
    } else if (zone.dataset.dropzone === 'report-structure') {
      const structureType = zone.dataset.structureType || '';
      state.reportStructureImportFiles = state.reportStructureImportFiles || {};
      state.reportStructureImportFiles[structureType] = await readImportFile(file);
      const def = structureDef(structureType);
      setWindowContent(`reportStructureImportWindow${structureType}`, renderReportStructureImportWindow(def, state.reportStructureImportFiles[structureType]));
    }
  } catch (err) {
    if (zone.dataset.dropzone === 'coa') setWindowMessage('coaImportWindow', err.message);
    else if (zone.dataset.dropzone === 'report-structure') setWindowMessage(`reportStructureImportWindow${zone.dataset.structureType || ''}`, err.message);
    else setScopedMessage(zone, '#glMessage', err.message);
  }
});

window.addEventListener('hashchange', () => {
  const next = location.hash.replace('#', '') || 'dashboard';
  if (next !== state.page) {
    state.page = next;
    state.activeModule = moduleForPage(next)?.id || state.activeModule;
    state.ribbonTab = null;
    loadPage();
  }
});
  }

  window.MGM_EVENT_HANDLERS = {
    registerEventHandlers,
  };
}());
