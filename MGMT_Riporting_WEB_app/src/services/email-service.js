const net = require('node:net');
const tls = require('node:tls');
const os = require('node:os');
const { httpError } = require('../http-utils');
const { getSetting } = require('./settings-service');

const SMTP_SETTING_KEYS = [
  'smtp_host',
  'smtp_port',
  'smtp_tls',
  'smtp_user',
  'smtp_password',
  'smtp_from',
];

const NOTIFICATION_TYPES = {
  backup_error: { setting: 'notify_backup_error', label: 'Backup hiba' },
  user_lock: { setting: 'notify_user_lock', label: 'Lockolt user' },
  restore: { setting: 'notify_restore', label: 'Restore' },
  critical_import: { setting: 'notify_critical_import', label: 'Kritikus import hiba' },
  security_event: { setting: 'notify_security_event', label: 'Biztonsági esemény' },
  test: { setting: null, label: 'Teszt értesítés' },
};

const NOTIFICATION_SETTING_KEYS = [
  'notification_recipients',
  ...Object.values(NOTIFICATION_TYPES).map((type) => type.setting).filter(Boolean),
];

function boolValue(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

function extractEmailAddress(value = '') {
  const text = String(value || '').trim();
  const match = text.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  return (match ? match[1] : text).trim();
}

function isEmailAddress(value = '') {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(extractEmailAddress(value));
}

function splitRecipients(value = '') {
  return [...new Set(String(value || '')
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter(Boolean))];
}

function validRecipients(value = '') {
  const recipients = splitRecipients(value);
  const invalid = recipients.filter((recipient) => !isEmailAddress(recipient));
  if (invalid.length) {
    throw httpError(400, 'NOTIFICATION_RECIPIENT_INVALID', `Érvénytelen értesítési email cím: ${invalid[0]}`);
  }
  return recipients;
}

function normalizeSmtpSettings(overrides = {}, { requireComplete = false } = {}) {
  const raw = Object.fromEntries(SMTP_SETTING_KEYS.map((key) => [key, overrides[key] ?? getSetting(key, '')]));
  const settings = {
    host: String(raw.smtp_host || '').trim(),
    port: Number(raw.smtp_port || 587),
    tls: boolValue(raw.smtp_tls),
    user: String(raw.smtp_user || '').trim(),
    password: String(raw.smtp_password || ''),
    from: String(raw.smtp_from || '').trim(),
  };
  if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) {
    throw httpError(400, 'SMTP_PORT_INVALID', 'Az SMTP port 1 és 65535 közötti egész szám legyen.');
  }
  if (settings.user && !settings.password && requireComplete) {
    throw httpError(400, 'SMTP_PASSWORD_REQUIRED', 'SMTP user mellé SMTP jelszó is szükséges.');
  }
  if (settings.password && !settings.user) {
    throw httpError(400, 'SMTP_USER_REQUIRED', 'SMTP jelszó mellé SMTP user is szükséges.');
  }
  if (settings.from && !isEmailAddress(settings.from)) {
    throw httpError(400, 'SMTP_FROM_INVALID', 'Az SMTP feladó nem érvényes email cím.');
  }
  if (requireComplete) {
    if (!settings.host) throw httpError(400, 'SMTP_HOST_REQUIRED', 'SMTP host megadása szükséges.');
    if (!settings.from) throw httpError(400, 'SMTP_FROM_REQUIRED', 'SMTP feladó megadása szükséges.');
  }
  return settings;
}

function normalizedSettingsForStorage(values = {}) {
  const settings = normalizeSmtpSettings(values, { requireComplete: false });
  return {
    smtp_host: settings.host,
    smtp_port: String(settings.port),
    smtp_tls: settings.tls ? '1' : '0',
    smtp_user: settings.user,
    smtp_password: settings.password,
    smtp_from: settings.from,
  };
}

function normalizedNotificationSettingsForStorage(values = {}) {
  const recipients = validRecipients(values.notification_recipients || '');
  const normalized = {
    notification_recipients: recipients.join('; '),
  };
  Object.values(NOTIFICATION_TYPES).forEach((type) => {
    if (!type.setting) return;
    normalized[type.setting] = boolValue(values[type.setting]) ? '1' : '0';
  });
  return normalized;
}

function notificationSettings(overrides = {}) {
  const raw = Object.fromEntries(NOTIFICATION_SETTING_KEYS.map((key) => [key, overrides[key] ?? getSetting(key, '')]));
  const normalized = normalizedNotificationSettingsForStorage(raw);
  return {
    recipients: splitRecipients(normalized.notification_recipients),
    enabled: Object.fromEntries(Object.entries(NOTIFICATION_TYPES).map(([key, type]) => [
      key,
      type.setting ? normalized[type.setting] === '1' : true,
    ])),
    raw: normalized,
  };
}

function encodeHeader(value = '') {
  const text = String(value || '');
  return /^[\x20-\x7e]*$/.test(text)
    ? text
    : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function smtpAddress(value = '') {
  return extractEmailAddress(value).replace(/[<>\r\n]/g, '');
}

function createSmtpClient({ host, port, tls: useTls, timeoutMs = 15000 }) {
  let socket;
  let buffer = '';
  const pending = [];
  let responseLines = [];

  function cleanup() {
    socket?.removeAllListeners();
    socket?.destroy();
  }

  function rejectPending(err) {
    while (pending.length) pending.shift().reject(err);
  }

  function attach(nextSocket) {
    socket = nextSocket;
    socket.setTimeout(timeoutMs);
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      flushResponses();
    });
    socket.on('timeout', () => {
      const err = new Error('SMTP időtúllépés: a szerver nem válaszolt időben.');
      cleanup();
      rejectPending(err);
    });
    socket.on('error', (err) => rejectPending(err));
    socket.on('close', () => rejectPending(new Error('SMTP kapcsolat lezárult.')));
  }

  function flushResponses() {
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line) continue;
      responseLines.push(line);
      if (/^\d{3}\s/.test(line)) {
        const pendingResponse = pending.shift();
        if (pendingResponse) {
          const code = Number(line.slice(0, 3));
          pendingResponse.resolve({ code, text: responseLines.join('\n') });
        }
        responseLines = [];
      }
    }
  }

  function read() {
    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
      flushResponses();
    });
  }

  function write(command) {
    socket.write(`${command}\r\n`);
    return read();
  }

  async function expect(responsePromise, expectedCodes, commandLabel) {
    const response = await responsePromise;
    const codes = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];
    if (!codes.includes(response.code)) {
      throw new Error(`${commandLabel}: SMTP ${response.code} - ${response.text}`);
    }
    return response;
  }

  async function connect() {
    const implicitTls = useTls && Number(port) === 465;
    const nextSocket = implicitTls
      ? tls.connect({ host, port, servername: host, timeout: timeoutMs })
      : net.connect({ host, port, timeout: timeoutMs });
    attach(nextSocket);
    await new Promise((resolve, reject) => {
      nextSocket.once(implicitTls ? 'secureConnect' : 'connect', resolve);
      nextSocket.once('error', reject);
    });
    await expect(read(), 220, 'Kapcsolódás');
  }

  async function startTls() {
    await expect(write('STARTTLS'), 220, 'STARTTLS');
    socket.removeAllListeners('data');
    socket.removeAllListeners('timeout');
    socket.removeAllListeners('error');
    socket.removeAllListeners('close');
    buffer = '';
    responseLines = [];
    attach(tls.connect({ socket, servername: host, timeout: timeoutMs }));
    await new Promise((resolve, reject) => {
      socket.once('secureConnect', resolve);
      socket.once('error', reject);
    });
  }

  return { connect, write, read, expect, startTls, cleanup };
}

async function sendSmtpMail({ settings, to, subject, text }) {
  const normalized = normalizeSmtpSettings(settings, { requireComplete: true });
  if (!isEmailAddress(to)) throw httpError(400, 'SMTP_TO_INVALID', 'A teszt email címzettje nem érvényes email cím.');
  const client = createSmtpClient(normalized);
  const ehloName = os.hostname().replace(/[^\w.-]/g, '') || 'localhost';
  try {
    await client.connect();
    await client.expect(client.write(`EHLO ${ehloName}`), 250, 'EHLO');
    if (normalized.tls && normalized.port !== 465) {
      await client.startTls();
      await client.expect(client.write(`EHLO ${ehloName}`), 250, 'EHLO TLS után');
    }
    if (normalized.user) {
      const auth = Buffer.from(`\0${normalized.user}\0${normalized.password}`, 'utf8').toString('base64');
      await client.expect(client.write(`AUTH PLAIN ${auth}`), 235, 'SMTP autentikáció');
    }
    await client.expect(client.write(`MAIL FROM:<${smtpAddress(normalized.from)}>`), 250, 'Feladó');
    await client.expect(client.write(`RCPT TO:<${smtpAddress(to)}>`), [250, 251], 'Címzett');
    await client.expect(client.write('DATA'), 354, 'Email törzs indítása');
    const body = [
      `From: ${normalized.from}`,
      `To: ${to}`,
      `Subject: ${encodeHeader(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      text,
    ].join('\r\n').replace(/^\./gm, '..');
    await client.expect(client.write(`${body}\r\n.`), 250, 'Email küldése');
    await client.write('QUIT').catch(() => null);
    return normalized;
  } finally {
    client.cleanup();
  }
}

async function sendTestEmail({ to, settings = {}, username = '' }) {
  const normalized = await sendSmtpMail({
    settings,
    to,
    subject: 'MGM Reporting - teszt email',
    text: [
      'Ez egy teszt email az MGM Reporting rendszerből.',
      '',
      `Indította: ${username || '-'}`,
      `Időpont: ${new Date().toISOString()}`,
    ].join('\n'),
  });
  return {
    to,
    host: normalized.host,
    port: normalized.port,
    tls: normalized.tls,
    from: normalized.from,
    message: `Teszt email elküldve: ${to}`,
  };
}

function notificationAuditDetails({ type, recipients, subject, resultText }) {
  const label = NOTIFICATION_TYPES[type]?.label || type;
  return [
    `Típus: ${label}`,
    `Címzett: ${recipients.join(', ')}`,
    `Tárgy: ${subject}`,
    `Eredmény: ${resultText}`,
  ].join('; ');
}

async function sendNotification(type, {
  subject = '',
  text = '',
  username = '',
  settings = {},
  recipientsOverride = null,
  force = false,
} = {}) {
  const typeDef = NOTIFICATION_TYPES[type];
  if (!typeDef) throw httpError(400, 'UNKNOWN_NOTIFICATION_TYPE', 'Ismeretlen értesítési típus.');
  const notification = notificationSettings(settings);
  if (!force && !notification.enabled[type]) {
    return { skipped: true, reason: 'disabled', sent: 0, failed: 0, recipients: [] };
  }
  const recipients = recipientsOverride ? validRecipients(recipientsOverride.join(';')) : notification.recipients;
  if (!recipients.length) {
    return { skipped: true, reason: 'no_recipients', sent: 0, failed: 0, recipients: [] };
  }
  const finalSubject = subject || `MGM Reporting - ${typeDef.label}`;
  const finalText = [
    text || `${typeDef.label} esemény történt az MGM Reporting rendszerben.`,
    '',
    `Indította: ${username || '-'}`,
    `Időpont: ${new Date().toISOString()}`,
  ].join('\n');
  const sent = [];
  const failed = [];
  for (const recipient of recipients) {
    try {
      await sendSmtpMail({ settings, to: recipient, subject: finalSubject, text: finalText });
      sent.push(recipient);
    } catch (err) {
      failed.push({ recipient, error: err.message });
    }
  }
  const { logEvent } = require('./log-service');
  if (sent.length) {
    logEvent({
      username,
      severity: 'AUDIT',
      module: 'notifications',
      action: `${type}_sent`,
      details: notificationAuditDetails({ type, recipients: sent, subject: finalSubject, resultText: 'siker' }),
    });
  }
  if (failed.length) {
    logEvent({
      username,
      severity: 'ERROR',
      module: 'notifications',
      action: `${type}_failed`,
      details: notificationAuditDetails({
        type,
        recipients: failed.map((item) => item.recipient),
        subject: finalSubject,
        resultText: failed.map((item) => `${item.recipient}: ${item.error}`).join(' | '),
      }),
    });
  }
  return {
    skipped: false,
    sent: sent.length,
    failed: failed.length,
    recipients,
    errors: failed,
  };
}

module.exports = {
  SMTP_SETTING_KEYS,
  NOTIFICATION_SETTING_KEYS,
  NOTIFICATION_TYPES,
  notificationSettings,
  normalizeSmtpSettings,
  normalizedNotificationSettingsForStorage,
  normalizedSettingsForStorage,
  sendNotification,
  sendTestEmail,
};
