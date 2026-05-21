const zlib = require('node:zlib');
const { db } = require('../db');
const { httpError } = require('../http-utils');

function normalizeHeader(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const aliases = {
    gl: 'gl_number',
    glnumber: 'gl_number',
    gl_number: 'gl_number',
    fokszam: 'gl_number',
    gl_szam: 'gl_number',
    fokonyvi_szam: 'gl_number',
    szamlaszam: 'gl_number',
    account: 'gl_number',
    account_number: 'gl_number',
    gl_name: 'gl_name',
    megnev: 'gl_name',
    gl_nev: 'gl_name',
    account_name: 'gl_name',
    name: 'gl_name',
    megnevezes: 'gl_name',
    tipus: 'account_type',
    tipusnev: 'account_type_name',
    ervenyes: 'active',
    ervenyesnev: 'active_name',
    megjelol: 'marker',
    megjelolnev: 'marker_name',
    megjegyz: 'note',
    tkjelleg: 'balance_nature',
    tkjellegnev: 'balance_nature_name',
    gycsopkod1: 'group_code_1',
    gycsopnev1: 'group_name_1',
    gycsopkod2: 'group_code_2',
    gycsopnev2: 'group_name_2',
    gycsopkod3: 'group_code_3',
    gycsopnev3: 'group_name_3',
    gycsopkod4: 'group_code_4',
    gycsopnev4: 'group_name_4',
    consaccount: 'cons_account',
    cons_account: 'cons_account',
    consolidated_account: 'cons_account',
    cons_report_code: 'cons_account',
    konszi_riport_kod: 'cons_account',
    konszi_riport: 'cons_account',
    konszolidalt_konto: 'cons_account',
    cons_account_name: 'cons_account_name',
    consolidated_account_name: 'cons_account_name',
    konszolidalt_konto_nev: 'cons_account_name',
    konszolidalt_konto_megnevezes: 'cons_account_name',
    reporting_category: 'reporting_category',
    management_report_code: 'reporting_category',
    management_riport_kod: 'reporting_category',
    management_riport: 'reporting_category',
    category: 'reporting_category',
    riport_kategoria: 'reporting_category',
    reporting_category_name: 'reporting_category_name',
    category_name: 'reporting_category_name',
    riport_kategoria_nev: 'reporting_category_name',
    riport_kategoria_megnevezes: 'reporting_category_name',
    statement: 'statement_type',
    statement_type: 'statement_type',
    kimutatas: 'statement_type',
    amount: 'amount',
    balance: 'amount',
    value: 'amount',
    osszeg: 'amount',
    egyenleg: 'amount',
    debit: 'debit',
    tartozik: 'debit',
    debit_amount: 'debit',
    tartozik_osszeg: 'debit',
    credit: 'credit',
    kovetel: 'credit',
    követel: 'credit',
    credit_amount: 'credit',
    kovetel_osszeg: 'credit',
    month: 'month',
    honap: 'month',
    scenario: 'scenario',
    forgatokonyv: 'scenario',
    year: 'year',
    ev: 'year',
    report_code: 'report_code',
    riport_kod: 'report_code',
    riportkod: 'report_code',
    report_code_name: 'report_code_name',
    riport_kod_elnevezes: 'report_code_name',
    riport_kod_megnevezes: 'report_code_name',
    bs_pl: 'statement_type',
    bspl: 'statement_type',
    csoport1: 'group1_code',
    group1: 'group1_code',
    csoport1_elnevezes: 'group1_name',
    csoport1_megnevezes: 'group1_name',
    group1_name: 'group1_name',
    csoport1_kotelezo: 'group1_required',
    group1_required: 'group1_required',
    csoport2: 'group2_code',
    group2: 'group2_code',
    csoport2_elnevezes: 'group2_name',
    csoport2_megnevezes: 'group2_name',
    group2_name: 'group2_name',
    csoport2_kotelezo: 'group2_required',
    group2_required: 'group2_required',
    csoport3: 'group3_code',
    group3: 'group3_code',
    csoport3_elnevezes: 'group3_name',
    csoport3_megnevezes: 'group3_name',
    group3_name: 'group3_name',
    csoport3_kotelezo: 'group3_required',
    group3_required: 'group3_required',
  };
  return aliases[key] || key;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)));
}

function parseCsvText(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];
  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if ((char === ';' || char === ',') && !quoted) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    out.push(cur.trim());
    return out;
  };
  const headers = parseLine(lines[0]).map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? '';
    });
    return row;
  });
}

function uniqueColumnNames(columns) {
  const seen = new Map();
  return columns.map((column, idx) => {
    const fallback = `Column ${idx + 1}`;
    const base = String(column || fallback).trim() || fallback;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count ? `${base}_${count + 1}` : base;
  });
}

function parseCsvTable(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return { columns: [], rows: [] };
  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if ((char === ';' || char === ',') && !quoted) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    out.push(cur.trim());
    return out;
  };
  const columns = uniqueColumnNames(parseLine(lines[0]));
  const rows = lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row = {};
    columns.forEach((column, idx) => {
      row[column] = values[idx] ?? '';
    });
    return row;
  });
  return { columns, rows };
}

function readZipEntries(buffer) {
  const signature = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i -= 1) {
    if (buffer.readUInt32LE(i) === signature) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw httpError(400, 'BAD_XLSX', 'Nem olvasható XLSX fájl.');

  const count = buffer.readUInt16LE(eocd + 10);
  const centralDirOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  let offset = centralDirOffset;

  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw httpError(400, 'BAD_XLSX', 'Sérült XLSX ZIP struktúra.');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8').replace(/\\/g, '/');

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw httpError(400, 'BAD_XLSX', 'Sérült XLSX bejegyzés.');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw httpError(400, 'BAD_XLSX', `Nem támogatott XLSX tömörítés: ${method}`);
    entries.set(name, data);

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function attrValue(attrs, name) {
  const match = new RegExp(`${name}="([^"]*)"`, 'i').exec(attrs);
  return match ? decodeXml(match[1]) : '';
}

function collectText(xml) {
  return Array.from(String(xml || '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g))
    .map((match) => decodeXml(match[1]))
    .join('');
}

function parseSharedStrings(entries) {
  const shared = entries.get('xl/sharedStrings.xml');
  if (!shared) return [];
  const xml = shared.toString('utf8');
  return Array.from(xml.matchAll(/<si\b[\s\S]*?<\/si>/g)).map((match) => collectText(match[0]));
}

function worksheetPath(entries) {
  const workbook = entries.get('xl/workbook.xml')?.toString('utf8') || '';
  const rels = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') || '';
  const sheetMatch = /<sheet\b[^>]*r:id="([^"]+)"[^>]*>/i.exec(workbook);
  if (sheetMatch && rels) {
    const relRegex = new RegExp(`<Relationship\\b[^>]*Id="${sheetMatch[1]}"[^>]*Target="([^"]+)"`, 'i');
    const relMatch = relRegex.exec(rels);
    if (relMatch) {
      const target = decodeXml(relMatch[1]).replace(/^\/?xl\//, '');
      return `xl/${target}`.replace(/\/\.\//g, '/');
    }
  }
  if (entries.has('xl/worksheets/sheet1.xml')) return 'xl/worksheets/sheet1.xml';
  const firstSheet = Array.from(entries.keys()).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
  if (firstSheet) return firstSheet;
  throw httpError(400, 'BAD_XLSX', 'Nem található munkalap az XLSX fájlban.');
}

function columnIndex(cellRef) {
  const letters = String(cellRef || '').match(/[A-Z]+/i)?.[0] || '';
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return Math.max(0, index - 1);
}

function cellValue(attrs, innerXml, sharedStrings) {
  const type = attrValue(attrs, 't');
  if (type === 'inlineStr') return collectText(innerXml);
  const valueMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(innerXml);
  const raw = valueMatch ? decodeXml(valueMatch[1]) : collectText(innerXml);
  if (type === 's') return sharedStrings[Number(raw)] || '';
  if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE';
  if (raw === '') return '';
  const n = Number(raw);
  return Number.isFinite(n) && String(raw).trim() !== '' ? n : raw;
}

function worksheetRows(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = attrValue(cellMatch[1], 'r');
      const index = ref ? columnIndex(ref) : row.length;
      row[index] = cellValue(cellMatch[1], cellMatch[2], sharedStrings);
    }
    if (row.some((value) => value !== undefined && String(value).trim() !== '')) rows.push(row);
  }
  return rows;
}

function rowsToObjects(rows) {
  const headerRowIndex = rows.findIndex((row) => row.some((value) => String(value ?? '').trim() !== ''));
  if (headerRowIndex === -1) return [];
  const headers = rows[headerRowIndex].map(normalizeHeader);
  return rows.slice(headerRowIndex + 1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      if (!header) return;
      obj[header] = row[index] ?? '';
    });
    return obj;
  }).filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));
}

function parseXlsxBase64(base64) {
  const clean = String(base64 || '').replace(/^data:.*?;base64,/, '');
  const buffer = Buffer.from(clean, 'base64');
  if (buffer.length < 22) throw httpError(400, 'BAD_XLSX', 'Üres vagy sérült XLSX fájl.');
  const entries = readZipEntries(buffer);
  const sharedStrings = parseSharedStrings(entries);
  const sheet = entries.get(worksheetPath(entries));
  if (!sheet) throw httpError(400, 'BAD_XLSX', 'Nem található munkalap az XLSX fájlban.');
  return rowsToObjects(worksheetRows(sheet.toString('utf8'), sharedStrings));
}

function parseXlsxTableBase64(base64) {
  const clean = String(base64 || '').replace(/^data:.*?;base64,/, '');
  const buffer = Buffer.from(clean, 'base64');
  if (buffer.length < 22) throw httpError(400, 'BAD_XLSX', 'Üres vagy sérült XLSX fájl.');
  const entries = readZipEntries(buffer);
  const sharedStrings = parseSharedStrings(entries);
  const sheet = entries.get(worksheetPath(entries));
  if (!sheet) throw httpError(400, 'BAD_XLSX', 'Nem található munkalap az XLSX fájlban.');
  const rows = worksheetRows(sheet.toString('utf8'), sharedStrings);
  const headerRowIndex = rows.findIndex((row) => row.some((value) => String(value ?? '').trim() !== ''));
  if (headerRowIndex === -1) return { columns: [], rows: [] };
  const width = Math.max(...rows.slice(headerRowIndex).map((row) => row.length));
  const columns = uniqueColumnNames(Array.from({ length: width }, (_unused, idx) => rows[headerRowIndex][idx]));
  const objects = rows.slice(headerRowIndex + 1).map((row) => {
    const obj = {};
    columns.forEach((column, idx) => {
      obj[column] = row[idx] ?? '';
    });
    return obj;
  }).filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));
  return { columns, rows: objects };
}

function normalizeAmount(value) {
  if (typeof value === 'number') return value;
  const clean = String(value || '0').replace(/\s/g, '').replace(',', '.');
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function parseLedgerNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { ok: true, value } : { ok: false, value: 0, message: 'A számmező nem értelmezhető.' };
  }
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: true, value: 0, blank: true };
  let text = raw.replace(/\u00a0/g, '').replace(/\s/g, '');
  let sign = 1;
  if (/^\(.*\)$/.test(text)) {
    sign = -1;
    text = text.slice(1, -1);
  }
  if (/^-/.test(text)) {
    sign *= -1;
    text = text.slice(1);
  } else if (/^\+/.test(text)) {
    text = text.slice(1);
  }
  if (!/^\d*([,.]\d*)?$/.test(text) && !/^\d{1,3}([,.]\d{3})+([,.]\d+)?$/.test(text)) {
    return { ok: false, value: 0, message: `A számmező nem értelmezhető: ${raw}` };
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
  let normalized = text;
  if (decimalSep) {
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = normalized.replaceAll(thousandSep, '').replace(decimalSep, '.');
  } else {
    normalized = normalized.replace(/[,.]/g, '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? { ok: true, value: n * sign } : { ok: false, value: 0, message: `A számmező nem értelmezhető: ${raw}` };
}

function comparableName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '');
}

function normalizeObjectKeys(row) {
  const normalized = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    const target = normalizeHeader(key);
    if (target) normalized[target] = value;
  });
  return normalized;
}

function getRowsFromBody(body) {
  if (Array.isArray(body.rows)) return body.rows;
  const fileName = String(body.fileName || '').toLowerCase();
  if (body.fileData && fileName.endsWith('.xls') && !fileName.endsWith('.xlsx')) {
    throw httpError(400, 'XLS_NOT_SUPPORTED', 'A régi .xls formátum nem támogatott. Kérlek .xlsx fájlt használj.');
  }
  if (body.fileData && (body.fileType === 'xlsx' || fileName.endsWith('.xlsx'))) return parseXlsxBase64(body.fileData);
  if (body.xlsxBase64) return parseXlsxBase64(body.xlsxBase64);
  if (body.csvText) return parseCsvText(body.csvText);
  return [];
}

function getImportTableFromBody(body) {
  if (Array.isArray(body.rows)) {
    const columns = [];
    body.rows.forEach((row) => {
      Object.keys(row || {}).forEach((key) => {
        if (!columns.includes(key)) columns.push(key);
      });
    });
    return { columns, rows: body.rows };
  }
  const fileName = String(body.fileName || '').toLowerCase();
  if (body.fileData && fileName.endsWith('.xls') && !fileName.endsWith('.xlsx')) {
    throw httpError(400, 'XLS_NOT_SUPPORTED', 'A régi .xls formátum nem támogatott. Kérlek .xlsx fájlt használj.');
  }
  if (body.fileData && (body.fileType === 'xlsx' || fileName.endsWith('.xlsx'))) return parseXlsxTableBase64(body.fileData);
  if (body.xlsxBase64) return parseXlsxTableBase64(body.xlsxBase64);
  if (body.csvText) return parseCsvTable(body.csvText);
  return { columns: [], rows: [] };
}

function parseJsonField(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function isTruthy(value) {
  if (value === true || value === 1) return true;
  return ['true', '1', 'on', 'yes', 'igen'].includes(String(value || '').trim().toLowerCase());
}

function applyColumnMapping(rawRow, mapping) {
  const entries = Object.entries(mapping || {}).filter(([, source]) => String(source || '').trim() !== '');
  if (!entries.length) return normalizeObjectKeys(rawRow);
  const mapped = {};
  entries.forEach(([target, source]) => {
    if (Object.prototype.hasOwnProperty.call(rawRow, source)) mapped[target] = rawRow[source];
  });
  return mapped;
}

function splitRuleValues(value) {
  return String(value ?? '')
    .split(/[;,|]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function summaryRuleMatches(rawRow, mappedRow, rule) {
  if (!rule || !isTruthy(rule.enabled)) return null;
  const column = String(rule.column || rule.columnName || '').trim();
  const operator = String(rule.operator || 'equals').trim();
  const rawValue = column
    ? (rawRow[column] ?? mappedRow[normalizeHeader(column)])
    : firstValue(mappedRow, ['is_summary', 'account_type', 'account_type_name'], '');
  const value = String(rawValue ?? '').trim().toLowerCase();
  if (value === '') return null;
  const values = splitRuleValues(rule.value);
  if (!values.length) return false;
  if (operator === 'contains') return values.some((item) => value.includes(item));
  if (operator === 'startsWith') return values.some((item) => value.startsWith(item));
  if (operator === 'notEquals') return !values.includes(value);
  return values.includes(value);
}

function normalizeSummaryRule(rule) {
  return {
    id: rule.id ? Number(rule.id) : null,
    name: String(rule.name || '').trim(),
    ruleType: String(rule.ruleType || rule.rule_type || 'summary').trim(),
    enabled: rule.enabled === undefined ? true : isTruthy(rule.enabled),
    column: String(rule.column || rule.columnName || '').trim(),
    operator: String(rule.operator || 'equals').trim(),
    value: String(rule.value ?? rule.matchValue ?? '').trim(),
  };
}

function getSummaryRulesFromBody(body) {
  const rules = parseJsonField(body.summaryRules, null);
  if (Array.isArray(rules)) return rules.map(normalizeSummaryRule).filter((rule) => rule.enabled);
  if (rules && typeof rules === 'object') return [normalizeSummaryRule(rules)].filter((rule) => rule.enabled);
  const single = parseJsonField(body.summaryRule, null);
  if (single) return [normalizeSummaryRule(single)].filter((rule) => rule.enabled);
  return [];
}

function rowRulesProvided(body) {
  return Object.prototype.hasOwnProperty.call(body, 'summaryRules')
    || Object.prototype.hasOwnProperty.call(body, 'summaryRule');
}

function summaryRulesMatch(rawRow, mappedRow, rules) {
  const activeRules = (rules || []).filter((rule) => rule.enabled !== false);
  if (!activeRules.length) return null;
  return activeRules.some((rule) => summaryRuleMatches(rawRow, mappedRow, rule) === true);
}

function rulesForType(rules, ruleType) {
  return (rules || []).filter((rule) => String(rule.ruleType || 'summary') === ruleType);
}

function firstValue(row, keys, fallback = '') {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return fallback;
}

function cleanImportedText(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '<Nincs>') return '';
  return text;
}

function importTypeCode(importType) {
  const code = String(importType || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
  return code || 'GEN';
}

function importDateCode(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function nextImportBatchId(importType, date = new Date()) {
  const typeCode = importTypeCode(importType);
  const dateCode = importDateCode(date);
  const prefix = `IMP-${typeCode}-${dateCode}-`;
  const row = db.prepare(`
    SELECT batch_id AS batchId
    FROM import_sessions
    WHERE batch_id LIKE ?
    ORDER BY batch_id DESC
    LIMIT 1
  `).get(`${prefix}%`);
  const lastSeq = Number(String(row?.batchId || '').slice(prefix.length)) || 0;
  return `${prefix}${String(lastSeq + 1).padStart(5, '0')}`;
}


function buildAutoColumnMapping(columns, fields = []) {
  const mapping = {};
  fields.forEach((field) => {
    const candidates = field.candidates || [field.key];
    const column = columns.find((source) => candidates.includes(normalizeHeader(source)));
    mapping[field.key] = column || '';
  });
  return mapping;
}

module.exports = {
  normalizeHeader,
  buildAutoColumnMapping,
  parseCsvText,
  parseCsvTable,
  parseXlsxBase64,
  parseXlsxTableBase64,
  normalizeAmount,
  parseLedgerNumber,
  comparableName,
  normalizeObjectKeys,
  getRowsFromBody,
  getImportTableFromBody,
  parseJsonField,
  isTruthy,
  applyColumnMapping,
  summaryRuleMatches,
  normalizeSummaryRule,
  getSummaryRulesFromBody,
  rowRulesProvided,
  summaryRulesMatch,
  rulesForType,
  firstValue,
  cleanImportedText,
  importTypeCode,
  nextImportBatchId,
};
