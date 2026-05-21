(function () {
  function iconPath(fileName) {
    return `icons/m365/${fileName}`;
  }

  function repairEncoding(value) {
    const fixes = {
      'Asztali g\uFFFDp': 'Asztali gép',
      'Ăˇ': 'á',
      'Ă¡': 'á',
      'Ă©': 'é',
      'Ă­': 'í',
      'Ăł': 'ó',
      'Ă¶': 'ö',
      'Ĺ‘': 'ő',
      'Ăş': 'ú',
      'ĂĽ': 'ü',
      'Ĺ±': 'ű',
    };
    return Object.entries(fixes).reduce(
      (text, [bad, good]) => text.replaceAll(bad, good),
      String(value ?? ''),
    );
  }

  function esc(value) {
    return repairEncoding(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function fmt(value, digits = 0) {
    let n = Number(value || 0);
    if (Math.round(n * (10 ** digits)) === 0) n = 0;
    return new Intl.NumberFormat('hu-HU', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
  }

  function datePartsInSelectedZone(date) {
    const settings = window.MGM_TIME_SETTINGS || {};
    if (settings.dstAuto === false && Number.isFinite(Number(settings.offsetMinutes))) {
      const shifted = new Date(date.getTime() + Number(settings.offsetMinutes) * 60 * 1000);
      return {
        year: String(shifted.getUTCFullYear()),
        month: String(shifted.getUTCMonth() + 1).padStart(2, '0'),
        day: String(shifted.getUTCDate()).padStart(2, '0'),
        hour: String(shifted.getUTCHours()).padStart(2, '0'),
        minute: String(shifted.getUTCMinutes()).padStart(2, '0'),
        second: String(shifted.getUTCSeconds()).padStart(2, '0'),
      };
    }
    const timeZone = settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(date);
      return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    } catch (_err) {
      return {
        year: String(date.getFullYear()),
        month: String(date.getMonth() + 1).padStart(2, '0'),
        day: String(date.getDate()).padStart(2, '0'),
        hour: String(date.getHours()).padStart(2, '0'),
        minute: String(date.getMinutes()).padStart(2, '0'),
        second: String(date.getSeconds()).padStart(2, '0'),
      };
    }
  }

  function isoDate(value) {
    if (!value) return '';
    const raw = String(value).trim();
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
    const parsed = hasTimezone ? new Date(raw) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) {
      const parts = datePartsInSelectedZone(parsed);
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
    }
    return raw.slice(0, 19).replace('T', ' ');
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function selectOptions(columns, selected = '') {
    return [
      `<option value="">-</option>`,
      ...columns.map((column) => `<option value="${esc(column)}" ${column === selected ? 'selected' : ''}>${esc(column)}</option>`),
    ].join('');
  }

  function collectColumnMapping(scope) {
    const mapping = {};
    document.querySelectorAll(`[data-map-scope="${scope}"]`).forEach((select) => {
      mapping[select.dataset.mapTarget] = select.value;
    });
    return mapping;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function normalizePrefixedCodeValue(value, prefix = '') {
    if (!prefix) return String(value || '').trim();
    const compact = String(value || '').replace(/\s+/g, '');
    const lastPrefix = compact.lastIndexOf(prefix);
    const suffix = lastPrefix >= 0 ? compact.slice(lastPrefix + prefix.length) : compact;
    return `${prefix}${suffix}`;
  }

  function enforceCodePrefix(input) {
    const prefix = input?.dataset?.codePrefix || '';
    if (!prefix) return;
    const normalized = normalizePrefixedCodeValue(input.value, prefix);
    if (input.value !== normalized) input.value = normalized;
  }

  function wildcardMatch(value, pattern) {
    const text = String(value ?? '').toLocaleLowerCase('hu-HU');
    const raw = String(pattern ?? '').trim().toLocaleLowerCase('hu-HU');
    if (!raw) return true;
    if (!raw.includes('*')) return text.includes(raw);
    const escaped = raw
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp(`^${escaped}$`, 'i').test(text);
  }

  window.MGM_UTILS = {
    iconPath,
    esc,
    fmt,
    isoDate,
    formData,
    selectOptions,
    collectColumnMapping,
    arrayBufferToBase64,
    normalizePrefixedCodeValue,
    enforceCodePrefix,
    repairEncoding,
    wildcardMatch,
  };
})();
