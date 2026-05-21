(function () {
  function createTableUtils({ esc }) {
    const widthStoreKey = 'mgmColumnWidths';
    const orderStoreKey = 'mgmColumnOrders';

    function readColumnWidths() {
      try {
        return JSON.parse(localStorage.getItem(widthStoreKey) || '{}');
      } catch (_err) {
        return {};
      }
    }

    function writeColumnWidth(scope, key, width) {
      if (!scope || !key) return;
      const widths = readColumnWidths();
      widths[scope] = { ...(widths[scope] || {}) };
      if (width === null || width === undefined) delete widths[scope][key];
      else widths[scope][key] = width;
      localStorage.setItem(widthStoreKey, JSON.stringify(widths));
    }

    function clearColumnWidths(scope) {
      if (!scope) return;
      const widths = readColumnWidths();
      delete widths[scope];
      localStorage.setItem(widthStoreKey, JSON.stringify(widths));
    }

    function columnWidth(scope, key) {
      const width = readColumnWidths()?.[scope]?.[key];
      return Number.isFinite(Number(width)) && Number(width) > 0 ? Number(width) : null;
    }

    function readColumnOrders() {
      try {
        return JSON.parse(localStorage.getItem(orderStoreKey) || '{}');
      } catch (_err) {
        return {};
      }
    }

    function saveColumnOrder(scope, keys = []) {
      if (!scope) return;
      const orders = readColumnOrders();
      const clean = Array.from(new Set((keys || []).map(String).filter(Boolean)));
      if (!clean.length) delete orders[scope];
      else orders[scope] = clean;
      localStorage.setItem(orderStoreKey, JSON.stringify(orders));
    }

    function clearColumnOrder(scope) {
      if (!scope) return;
      const orders = readColumnOrders();
      delete orders[scope];
      localStorage.setItem(orderStoreKey, JSON.stringify(orders));
    }

    function columnOrder(scope) {
      const order = readColumnOrders()?.[scope];
      return Array.isArray(order) ? order.map(String) : [];
    }

    function applyColumnOrder(scope, columns = []) {
      const order = columnOrder(scope);
      if (!scope || !order.length) return columns;
      const rank = new Map(order.map((key, index) => [key, index]));
      return columns
        .map((column, index) => ({ column, index }))
        .sort((a, b) => {
          const aRank = rank.has(a.column.key) ? rank.get(a.column.key) : Number.MAX_SAFE_INTEGER;
          const bRank = rank.has(b.column.key) ? rank.get(b.column.key) : Number.MAX_SAFE_INTEGER;
          return aRank === bRank ? a.index - b.index : aRank - bRank;
        })
        .map((item) => item.column);
    }

    function columnPixelWidth(scope, key, fallback = null) {
      const stored = columnWidth(scope, key);
      const base = stored || (Number(fallback) > 0 ? Number(fallback) : null);
      return base ? Math.max(42, Math.round(base)) : null;
    }

    function columnsPixelWidth(columns = [], scope = '') {
      return columns.reduce((sum, column) => sum + (columnPixelWidth(scope, column.key, column.width) || 120), 0);
    }

    function fixedTableStyle(columns = [], scope = '') {
      const width = columnsPixelWidth(columns, scope);
      return width ? `style="--grid-width:${width}px"` : '';
    }

    function colGroup(columns = [], scope = '') {
      if (!columns.length) return '';
      return `
        <colgroup data-col-freeze="1">
          ${columns.map((column) => {
            const width = columnPixelWidth(scope, column.key, column.width) || 120;
            const px = `${width}px`;
            return `<col data-col-key="${esc(column.key || '')}" style="width:${px};min-width:${px};max-width:${px}">`;
          }).join('')}
        </colgroup>
      `;
    }

    function resizableTh(label, className = '', options = {}) {
      const opts = typeof className === 'object' ? className : options;
      const cssClass = typeof className === 'object' ? '' : className;
      const scope = opts.scope || opts.pref || '';
      const key = opts.key || '';
      const width = columnPixelWidth(scope, key, opts.width);
      const attrs = [
        key ? `data-col-key="${esc(key)}"` : '',
        scope ? `data-col-scope="${esc(scope)}"` : '',
        opts.reorder ? 'draggable="true" data-column-header-drag="1"' : '',
        width ? `style="width:${width}px;min-width:${width}px;max-width:${width}px"` : '',
      ].filter(Boolean).join(' ');
      return `<th class="${esc(cssClass)}" ${attrs}><span class="th-label">${esc(label)}</span><span class="col-resizer" data-col-resizer></span></th>`;
    }

    function table(headers, rows, empty = 'Nincs megjeleníthető adat.') {
      if (!rows.length) return `<div class="table-wrap"><div class="empty">${esc(empty)}</div></div>`;
      return `
        <div class="table-wrap">
          <table class="mgm-data-table">
            <thead><tr>${headers.map((h) => resizableTh(h.label, h.num ? 'num' : '')).join('')}</tr></thead>
            <tbody>
              ${rows.map((row) => `<tr>${headers.map((h) => `<td class="${h.num ? 'num' : ''}">${h.render ? h.render(row) : esc(row[h.key])}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    function autoTableScope(headers = []) {
      const keys = (headers || [])
        .map((header) => String(header.key || header.label || '').trim())
        .filter(Boolean);
      if (!keys.length) return '';
      return `auto-${keys.join('-')}`
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    }

    function enhancedTable(headers, rows, empty = 'Nincs megjeleníthető adat.', options = {}) {
      if (empty && typeof empty === 'object') {
        options = empty;
        empty = 'Nincs megjeleníthető adat.';
      }
      const preparedHeaders = (headers || []).map((header, index) => (
        header.key ? header : { ...header, key: `col_${index}` }
      ));
      const scope = options.scope || autoTableScope(preparedHeaders);
      const columns = scope ? applyColumnOrder(scope, preparedHeaders) : preparedHeaders;
      const tableClass = ['mgm-data-table', options.className || ''].filter(Boolean).join(' ');
      const tableAttrs = [
        scope ? `data-column-scope="${esc(scope)}"` : '',
        scope ? fixedTableStyle(columns, scope) : '',
      ].filter(Boolean).join(' ');
      if (!rows.length) return `<div class="table-wrap"><div class="empty">${esc(empty)}</div></div>`;
      return `
        <div class="table-wrap">
          <table class="${esc(tableClass)}" ${tableAttrs}>
            ${scope ? colGroup(columns, scope) : ''}
            <thead><tr>${columns.map((h) => resizableTh(h.label, h.num ? 'num' : (h.className || ''), { scope, key: h.key, width: h.width, reorder: Boolean(options.reorder) })).join('')}</tr></thead>
            <tbody>
              ${rows.map((row) => `<tr>${columns.map((h) => `<td class="${h.num ? 'num' : (h.className || '')}">${h.render ? h.render(row) : esc(row[h.key] ?? '')}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    function domColumnKey(label, index) {
      return String(label || `col_${index}`)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || `col_${index}`;
    }

    function applyFixedColumnWidths(tableEl, widths = []) {
      if (!tableEl || !widths.length) return;
      const cleanWidths = widths.map((width) => Math.max(42, Math.ceil(Number(width) || 0))).filter(Boolean);
      if (!cleanWidths.length) return;
      let colgroup = tableEl.querySelector(':scope > colgroup[data-col-freeze]');
      if (!colgroup) {
        colgroup = document.createElement('colgroup');
        colgroup.dataset.colFreeze = '1';
        tableEl.insertBefore(colgroup, tableEl.firstChild);
      }
      while (colgroup.children.length < cleanWidths.length) colgroup.appendChild(document.createElement('col'));
      while (colgroup.children.length > cleanWidths.length) colgroup.lastElementChild.remove();
      cleanWidths.forEach((width, index) => {
        const px = `${width}px`;
        colgroup.children[index].style.width = px;
        colgroup.children[index].style.minWidth = px;
        colgroup.children[index].style.maxWidth = px;
        Array.from(tableEl.rows).forEach((row) => {
          const cell = row.children[index];
          if (!cell) return;
          cell.style.width = px;
          cell.style.minWidth = px;
          cell.style.maxWidth = px;
        });
      });
      const total = cleanWidths.reduce((sum, width) => sum + width, 0);
      tableEl.style.tableLayout = 'fixed';
      tableEl.style.setProperty('--grid-width', `${total}px`);
      if (!tableEl.classList.contains('stable-edit-table')) {
        tableEl.style.width = `${total}px`;
        tableEl.style.minWidth = `${total}px`;
      }
    }

    function stableColumnMinimum(key) {
      const minimums = {
        select: 42,
        active: 58,
        flags: 118,
      };
      return minimums[key] || 42;
    }

    function measuredColumnWidths(tableEl) {
      const referenceRow = tableEl?.tHead?.rows?.[0] || tableEl?.rows?.[0];
      if (!referenceRow) return [];
      const keys = Array.from(referenceRow.children).map((cell) => cell.dataset.colKey || '');
      return Array.from(referenceRow.children).map((cell, index) => {
        const rowWidths = Array.from(tableEl.rows).map((row) => {
          const rowCell = row.children[index];
          return rowCell ? Math.ceil(rowCell.getBoundingClientRect().width) : 0;
        });
        return Math.max(stableColumnMinimum(keys[index]), Math.ceil(cell.getBoundingClientRect().width), ...rowWidths);
      });
    }

    function enhancePlainTables(root = document) {
      const host = root.querySelectorAll ? root : document;
      host.querySelectorAll('table.mgm-data-table').forEach((tableEl, tableIndex) => {
        const headerRow = Array.from(tableEl.tHead?.rows || []).find((row) => !row.classList.contains('table-filter-row'));
        const headers = Array.from(headerRow?.children || []).filter((cell) => cell.tagName === 'TH');
        if (!headers.length) return;
        const existingScope = headers.find((cell) => cell.dataset.colScope)?.dataset.colScope || '';
        const generatedScope = autoTableScope(headers.map((cell, index) => ({ key: domColumnKey(cell.textContent, index) })));
        const scope = tableEl.dataset.columnScope || existingScope || generatedScope || `auto-table-${tableIndex}`;
        tableEl.dataset.columnScope = scope;
        headers.forEach((th, index) => {
          const key = th.dataset.colKey || domColumnKey(th.textContent, index);
          th.dataset.colKey = key;
          th.dataset.colScope = scope;
          if (!th.querySelector('.th-label')) {
            const label = document.createElement('span');
            label.className = 'th-label';
            while (th.firstChild) label.appendChild(th.firstChild);
            th.appendChild(label);
          }
          if (!th.querySelector('[data-col-resizer]')) {
            const resizer = document.createElement('span');
            resizer.className = 'col-resizer';
            resizer.dataset.colResizer = '';
            th.appendChild(resizer);
          }
        });
        if (!tableEl.querySelector(':scope > colgroup[data-col-freeze]')) {
          const widths = headers.map((th) => columnPixelWidth(scope, th.dataset.colKey, th.getBoundingClientRect().width || th.offsetWidth || 120) || 120);
          applyFixedColumnWidths(tableEl, widths);
        }
      });
    }

    function setupColumnResize(root = document) {
      enhancePlainTables(root);
      if (root === document && window.MutationObserver) {
        const observer = new MutationObserver((mutations) => {
          const hasAddedElements = mutations.some((mutation) => Array.from(mutation.addedNodes || []).some((node) => node.nodeType === 1));
          if (hasAddedElements) enhancePlainTables(document);
        });
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
      }
      root.addEventListener('pointerdown', (event) => {
        const resizer = event.target.closest('[data-col-resizer]');
        if (!resizer) return;
        event.preventDefault();
        event.stopPropagation();
        const th = resizer.closest('th');
        const tableEl = th?.closest('table');
        if (!th || !tableEl) return;
        const index = Array.from(th.parentElement.children).indexOf(th);
        const startX = event.clientX;
        const startWidth = th.getBoundingClientRect().width;
        const startWidths = measuredColumnWidths(tableEl);
        const applyWidth = (width) => {
          const nextWidths = [...startWidths];
          nextWidths[index] = Math.max(42, Math.round(width));
          applyFixedColumnWidths(tableEl, nextWidths);
        };
        const move = (moveEvent) => applyWidth(startWidth + moveEvent.clientX - startX);
        const up = () => {
          const nextWidth = Math.max(42, Math.round(th.getBoundingClientRect().width));
          writeColumnWidth(th.dataset.colScope, th.dataset.colKey, nextWidth);
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
      });

      root.addEventListener('dblclick', (event) => {
        const resizer = event.target.closest('[data-col-resizer]');
        if (!resizer) return;
        const th = resizer.closest('th');
        const tableEl = th?.closest('table');
        if (!th || !tableEl) return;
        const index = Array.from(th.parentElement.children).indexOf(th);
        Array.from(tableEl.rows).forEach((row) => {
          const cell = row.children[index];
          if (!cell) return;
          cell.style.width = '';
          cell.style.minWidth = '';
          cell.style.maxWidth = '';
        });
        const colgroup = tableEl.querySelector(':scope > colgroup[data-col-freeze]');
        if (colgroup?.children[index]) {
          colgroup.children[index].style.width = '';
          colgroup.children[index].style.minWidth = '';
          colgroup.children[index].style.maxWidth = '';
        }
        tableEl.style.tableLayout = '';
        tableEl.style.width = '';
        tableEl.style.minWidth = '';
        tableEl.style.removeProperty('--grid-width');
        writeColumnWidth(th.dataset.colScope, th.dataset.colKey, null);
      });
    }

    function freezeTableColumnWidths(tableEl) {
      if (!tableEl) return;
      applyFixedColumnWidths(tableEl, measuredColumnWidths(tableEl));
    }

    return {
      resizableTh,
      table: enhancedTable,
      setupColumnResize,
      clearColumnWidths,
      saveColumnOrder,
      clearColumnOrder,
      applyColumnOrder,
      freezeTableColumnWidths,
      colGroup,
      fixedTableStyle,
      columnPixelWidth,
    };
  }

  window.MGM_TABLES = { createTableUtils };
})();
