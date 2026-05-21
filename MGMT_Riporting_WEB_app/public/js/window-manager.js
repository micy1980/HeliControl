(function () {
  function createWindowManager({ state, esc }) {
    function windowLayer() {
      return document.querySelector('#windowLayer');
    }

    function closeWindow(id) {
      document.querySelector(`#${id}`)?.remove();
    }

    function closeAllWindows() {
      document.querySelectorAll('.mgm-window').forEach((win) => win.remove());
    }

    function closeColumnChoosers(except = null) {
      document.querySelectorAll('.column-chooser[open]').forEach((chooser) => {
        if (chooser !== except) chooser.removeAttribute('open');
      });
    }

    function bringWindowToFront(win) {
      document.querySelectorAll('.mgm-window.active').forEach((item) => item.classList.remove('active'));
      state.windowSeq += 1;
      win.style.zIndex = String(1000 + state.windowSeq);
      win.classList.add('active');
    }

    function toggleWindowMaximize(id) {
      const win = document.querySelector(`#${id}`);
      if (!win) return;
      bringWindowToFront(win);
      if (win.classList.contains('maximized')) {
        win.classList.remove('maximized');
        win.style.left = win.dataset.restoreLeft || win.style.left;
        win.style.top = win.dataset.restoreTop || win.style.top;
        win.style.width = win.dataset.restoreWidth || win.style.width;
        win.style.height = win.dataset.restoreHeight || win.style.height;
        delete win.dataset.restoreLeft;
        delete win.dataset.restoreTop;
        delete win.dataset.restoreWidth;
        delete win.dataset.restoreHeight;
      } else {
        win.dataset.restoreLeft = win.style.left;
        win.dataset.restoreTop = win.style.top;
        win.dataset.restoreWidth = win.style.width;
        win.dataset.restoreHeight = win.style.height;
        win.classList.add('maximized');
        win.style.left = '0px';
        win.style.top = '0px';
        win.style.width = '100vw';
        win.style.height = '100vh';
      }
    }

    function contextLabel() {
      const company = state.companies.find((c) => c.id === Number(state.settings.activeCompanyId));
      const unitMap = { 1: '1', 1000: 'ezer', 1000000: 'millió' };
      return [
        `Cég: ${company?.code || ''}`,
        `Deviza: ${state.settings.activeCurrency || ''}`,
        `FX: ${state.settings.activeFxMode || ''}`,
        `Egység: ${unitMap[String(state.settings.activeDisplayUnit || '1')] || '1'}`,
      ].join('  |  ');
    }

    function renderWindowStatusbar() {
      return `<div class="mgm-window-statusbar" data-window-statusbar>${esc(contextLabel())}</div>`;
    }

    function refreshWindowStatusbars() {
      document.querySelectorAll('[data-window-statusbar]').forEach((bar) => {
        bar.textContent = contextLabel();
      });
    }

    function openAppWindow(id, title, html, options = {}) {
      const existing = document.querySelector(`#${id}`);
      const layer = windowLayer();
      if (!layer) return null;
      const requestedWidth = options.width || 920;
      const requestedHeight = options.height || 560;
      const width = Math.min(requestedWidth, Math.max(420, window.innerWidth - 48));
      const height = Math.min(requestedHeight, Math.max(260, window.innerHeight - 48));
      const left = Math.max(12, Math.round((window.innerWidth - width) / 2));
      const top = Math.max(12, Math.round((window.innerHeight - height) / 2));
      if (existing) {
        const titleSlot = existing.querySelector('.mgm-window-titlebar span');
        const contentSlot = existing.querySelector('.mgm-window-content');
        const statusSlot = existing.querySelector('[data-window-statusbar]');
        if (titleSlot) titleSlot.textContent = title;
        if (contentSlot) replaceHtmlPreservingUi(contentSlot, html);
        if (statusSlot) statusSlot.textContent = contextLabel();
        if (options.page) existing.dataset.pageWindow = options.page;
        else delete existing.dataset.pageWindow;
        if (options.preserve === false) {
          existing.style.width = `${width}px`;
          existing.style.height = `${height}px`;
          existing.style.left = `${left}px`;
          existing.style.top = `${top}px`;
        }
        bringWindowToFront(existing);
        return existing;
      }
      const win = document.createElement('section');
      win.id = id;
      win.className = 'mgm-window';
      if (options.page) win.dataset.pageWindow = options.page;
      win.style.width = `${width}px`;
      win.style.height = `${height}px`;
      win.style.left = `${left}px`;
      win.style.top = `${top}px`;
      win.innerHTML = `
        <div class="mgm-window-titlebar" data-window-drag>
          <span>${esc(title)}</span>
          <button type="button" class="mgm-window-maximize" data-window-maximize="${esc(id)}" title="Teljes ablak">□</button>
          <button type="button" class="mgm-window-close" data-window-close="${esc(id)}">×</button>
        </div>
        <div class="mgm-window-content">${html}</div>
        ${renderWindowStatusbar()}
        <span class="window-resize-handle n" data-window-resize="n"></span>
        <span class="window-resize-handle e" data-window-resize="e"></span>
        <span class="window-resize-handle s" data-window-resize="s"></span>
        <span class="window-resize-handle w" data-window-resize="w"></span>
        <span class="window-resize-handle ne" data-window-resize="ne"></span>
        <span class="window-resize-handle nw" data-window-resize="nw"></span>
        <span class="window-resize-handle se" data-window-resize="se"></span>
        <span class="window-resize-handle sw" data-window-resize="sw"></span>
      `;
      layer.appendChild(win);
      bringWindowToFront(win);
      return win;
    }

    function setWindowContent(id, html) {
      const slot = document.querySelector(`#${id} .mgm-window-content`);
      if (slot) replaceHtmlPreservingUi(slot, html);
    }

    function elementPath(root, element) {
      const path = [];
      let current = element;
      while (current && current !== root) {
        const parent = current.parentElement;
        if (!parent) return null;
        path.unshift(Array.prototype.indexOf.call(parent.children, current));
        current = parent;
      }
      return current === root ? path : null;
    }

    function elementByPath(root, path) {
      return (path || []).reduce((current, index) => current?.children?.[index] || null, root);
    }

    function captureUiState(root) {
      const scrollCandidates = [root, ...root.querySelectorAll('.table-wrap, .import-preview-wrap, [data-preserve-scroll], textarea')];
      const scrolls = scrollCandidates
        .map((element) => ({
          path: elementPath(root, element),
          top: element.scrollTop,
          left: element.scrollLeft,
        }))
        .filter((item) => item.path && (item.top || item.left));

      const active = document.activeElement;
      const focus = active && root.contains(active)
        ? {
            path: elementPath(root, active),
            start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
            end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
          }
        : null;

      return { scrolls, focus };
    }

    function restoreUiState(root, snapshot) {
      snapshot.scrolls.forEach((item) => {
        const element = elementByPath(root, item.path);
        if (!element) return;
        element.scrollTop = item.top;
        element.scrollLeft = item.left;
      });
      const focusTarget = snapshot.focus?.path ? elementByPath(root, snapshot.focus.path) : null;
      if (!focusTarget || typeof focusTarget.focus !== 'function') return;
      focusTarget.focus({ preventScroll: true });
      if (snapshot.focus.start !== null && typeof focusTarget.setSelectionRange === 'function') {
        try {
          focusTarget.setSelectionRange(snapshot.focus.start, snapshot.focus.end ?? snapshot.focus.start);
        } catch (_) {
          // Some input types do not support text selection.
        }
      }
    }

    function replaceHtmlPreservingUi(slot, html) {
      if (slot.innerHTML === html) return;
      const snapshot = captureUiState(slot);
      slot.innerHTML = html;
      restoreUiState(slot, snapshot);
    }

    function setWindowMessage(id, text, ok = false) {
      const el = document.querySelector(`#${id} [data-window-message]`);
      if (!el) return;
      el.className = ok ? 'success-text' : 'error-text';
      el.textContent = text || '';
    }

    function openResultWindow(title, html) {
      openAppWindow('resultWindow', title, `
        ${html}
        <div class="actions" style="justify-content:flex-end;margin-top:10px">
          <button type="button" data-window-close="resultWindow">OK</button>
        </div>
      `, { width: 640, height: 330, preserve: true });
    }

    function setupWindowDrag(root = document) {
      const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

      root.addEventListener('pointerdown', (event) => {
        const resizeHandle = event.target.closest('[data-window-resize]');
        if (resizeHandle) {
          const win = resizeHandle.closest('.mgm-window');
          if (!win || win.classList.contains('maximized')) return;
          event.preventDefault();
          bringWindowToFront(win);
          const direction = resizeHandle.dataset.windowResize || '';
          const rect = win.getBoundingClientRect();
          const startX = event.clientX;
          const startY = event.clientY;
          const minWidth = 420;
          const minHeight = 240;
          resizeHandle.setPointerCapture?.(event.pointerId);
          const move = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            let left = rect.left;
            let top = rect.top;
            let width = rect.width;
            let height = rect.height;

            if (direction.includes('e')) {
              width = clamp(rect.width + dx, minWidth, window.innerWidth - rect.left);
            }
            if (direction.includes('s')) {
              height = clamp(rect.height + dy, minHeight, window.innerHeight - rect.top);
            }
            if (direction.includes('w')) {
              const clampedDx = clamp(dx, -rect.left, rect.width - minWidth);
              left = rect.left + clampedDx;
              width = rect.width - clampedDx;
            }
            if (direction.includes('n')) {
              const clampedDy = clamp(dy, -rect.top, rect.height - minHeight);
              top = rect.top + clampedDy;
              height = rect.height - clampedDy;
            }

            win.style.left = `${Math.round(left)}px`;
            win.style.top = `${Math.round(top)}px`;
            win.style.width = `${Math.round(width)}px`;
            win.style.height = `${Math.round(height)}px`;
          };
          const up = () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
          };
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', up);
          return;
        }

        const handle = event.target.closest('[data-window-drag]');
        if (!handle || event.target.closest('button')) return;
        const win = handle.closest('.mgm-window');
        if (!win || win.classList.contains('maximized')) return;
        bringWindowToFront(win);
        const startX = event.clientX;
        const startY = event.clientY;
        const startLeft = Number.parseFloat(win.style.left) || 0;
        const startTop = Number.parseFloat(win.style.top) || 0;
        handle.setPointerCapture?.(event.pointerId);
        const move = (moveEvent) => {
          win.style.left = `${Math.max(0, startLeft + moveEvent.clientX - startX)}px`;
          win.style.top = `${Math.max(0, startTop + moveEvent.clientY - startY)}px`;
        };
        const up = () => {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
      });

      root.addEventListener('dblclick', (event) => {
        const handle = event.target.closest('[data-window-drag]');
        if (!handle || event.target.closest('button')) return;
        const win = handle.closest('.mgm-window');
        if (win?.id) {
          event.preventDefault();
          toggleWindowMaximize(win.id);
        }
      });
    }

    return {
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
    };
  }

  window.MGM_WINDOWS = { createWindowManager };
})();
