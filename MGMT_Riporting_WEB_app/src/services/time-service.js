const dgram = require('node:dgram');
const { getSetting, setSetting } = require('./settings-service');

const DEFAULT_TIMEZONE = 'Europe/Budapest';
const DEFAULT_TIME_SERVER_URL = 'https://worldtimeapi.org/api/timezone/{timezone}';
const NTP_EPOCH_OFFSET_SECONDS = 2208988800;

const LEGACY_TIME_ZONES = [
  { value: 'UTC', label: '(UTC+00:00) Koordinált világidő', offsetMinutes: 0 },
  { value: 'Europe/London', label: '(UTC+00:00) Dublin, Edinburgh, Lisszabon, London', offsetMinutes: 0 },
  { value: 'Atlantic/Reykjavik', label: '(UTC+00:00) Monrovia, Reykjavik', offsetMinutes: 0 },
  { value: 'Africa/Sao_Tome', label: '(UTC+00:00) São Tomé', offsetMinutes: 0 },
  { value: 'Africa/Casablanca', label: '(UTC+01:00) Casablanca', offsetMinutes: 60 },
  { value: 'Europe/Berlin', label: '(UTC+01:00) Amszterdam, Bécs, Berlin, Bern, Róma, Stockholm', offsetMinutes: 60 },
  { value: 'Europe/Paris', label: '(UTC+01:00) Brüsszel, Koppenhága, Madrid, Párizs', offsetMinutes: 60 },
  { value: 'Europe/Budapest', label: '(UTC+01:00) Budapest, Belgrád, Ljubljana, Pozsony, Prága', offsetMinutes: 60 },
  { value: 'Africa/Lagos', label: '(UTC+01:00) Nyugat-Közép-Afrika', offsetMinutes: 60 },
  { value: 'Europe/Warsaw', label: '(UTC+01:00) Szarajevó, Szkopje, Varsó, Zágráb', offsetMinutes: 60 },
  { value: 'Europe/Athens', label: '(UTC+02:00) Athén, Bukarest', offsetMinutes: 120 },
  { value: 'Asia/Beirut', label: '(UTC+02:00) Bejrút', offsetMinutes: 120 },
  { value: 'Europe/Chisinau', label: '(UTC+02:00) Chisinau', offsetMinutes: 120 },
  { value: 'Asia/Gaza', label: '(UTC+02:00) Gáza, Hebron', offsetMinutes: 120 },
  { value: 'America/New_York', label: '(UTC-05:00) Keleti idő, USA és Kanada', offsetMinutes: -300 },
  { value: 'America/Chicago', label: '(UTC-06:00) Középső idő, USA és Kanada', offsetMinutes: -360 },
  { value: 'America/Denver', label: '(UTC-07:00) Hegyi idő, USA és Kanada', offsetMinutes: -420 },
  { value: 'America/Los_Angeles', label: '(UTC-08:00) Csendes-óceáni idő, USA és Kanada', offsetMinutes: -480 },
  { value: 'Asia/Tokyo', label: '(UTC+09:00) Oszaka, Szapporó, Tokió', offsetMinutes: 540 },
  { value: 'Asia/Shanghai', label: '(UTC+08:00) Peking, Hongkong, Szingapúr', offsetMinutes: 480 },
];

const WINDOWS_TIME_ZONES = [
  { value: 'Etc/GMT+12', label: '(UTC-12:00) Nemzetközi dátumválasztó vonal - nyugat', offsetMinutes: -720 },
  { value: 'Pacific/Pago_Pago', label: '(UTC-11:00) Egyezményes világidő-11', offsetMinutes: -660 },
  { value: 'America/Adak', label: '(UTC-10:00) Aleut-szigetek', offsetMinutes: -600 },
  { value: 'Pacific/Honolulu', label: '(UTC-10:00) Hawaii', offsetMinutes: -600 },
  { value: 'Pacific/Marquesas', label: '(UTC-09:30) Marquesas-szigetek', offsetMinutes: -570 },
  { value: 'America/Anchorage', label: '(UTC-09:00) Alaszka', offsetMinutes: -540 },
  { value: 'Etc/GMT+9', label: '(UTC-09:00) Egyezményes világidő-09', offsetMinutes: -540 },
  { value: 'America/Tijuana', label: '(UTC-08:00) Baja California', offsetMinutes: -480 },
  { value: 'America/Los_Angeles', label: '(UTC-08:00) Csendes-óceáni idő (Egyesült Államok és Kanada)', offsetMinutes: -480 },
  { value: 'Etc/GMT+8', label: '(UTC-08:00) Egyezményes világidő-08', offsetMinutes: -480 },
  { value: 'America/Phoenix', label: '(UTC-07:00) Arizona', offsetMinutes: -420 },
  { value: 'America/Denver', label: '(UTC-07:00) Hegyi idő (Egyesült Államok és Kanada)', offsetMinutes: -420 },
  { value: 'America/Mazatlan', label: '(UTC-07:00) La Paz, Mazatlan', offsetMinutes: -420 },
  { value: 'America/Whitehorse', label: '(UTC-07:00) Yukon', offsetMinutes: -420 },
  { value: 'America/Chicago', label: '(UTC-06:00) Amerikai középidő (Egyesült Államok és Kanada)', offsetMinutes: -360 },
  { value: 'America/Mexico_City', label: '(UTC-06:00) Guadalajara, Mexikóváros, Monterrey', offsetMinutes: -360 },
  { value: 'Pacific/Easter', label: '(UTC-06:00) Húsvét-sziget', offsetMinutes: -360 },
  { value: 'America/Guatemala', label: '(UTC-06:00) Közép-Amerika', offsetMinutes: -360 },
  { value: 'America/Regina', label: '(UTC-06:00) Saskatchewan', offsetMinutes: -360 },
  { value: 'America/Bogota', label: '(UTC-05:00) Bogota, Lima, Quito, Rio Branco', offsetMinutes: -300 },
  { value: 'America/Cancun', label: '(UTC-05:00) Chetumal', offsetMinutes: -300 },
  { value: 'America/Port-au-Prince', label: '(UTC-05:00) Haiti', offsetMinutes: -300 },
  { value: 'America/Havana', label: '(UTC-05:00) Havanna', offsetMinutes: -300 },
  { value: 'America/Indiana/Indianapolis', label: '(UTC-05:00) Indiana (kelet)', offsetMinutes: -300 },
  { value: 'America/New_York', label: '(UTC-05:00) Keleti idő (Egyesült Államok és Kanada)', offsetMinutes: -300 },
  { value: 'America/Grand_Turk', label: '(UTC-05:00) Turks- és Caicos-szigetek', offsetMinutes: -300 },
  { value: 'America/Halifax', label: '(UTC-04:00) Atlanti-óceáni idő (Kanada)', offsetMinutes: -240 },
  { value: 'America/Caracas', label: '(UTC-04:00) Caracas', offsetMinutes: -240 },
  { value: 'America/Cuiaba', label: '(UTC-04:00) Cuiaba', offsetMinutes: -240 },
  { value: 'America/La_Paz', label: '(UTC-04:00) Georgetown, La Paz, Manaus, San Juan', offsetMinutes: -240 },
  { value: 'America/Santiago', label: '(UTC-04:00) Santiago', offsetMinutes: -240 },
  { value: 'America/St_Johns', label: '(UTC-03:30) Újfundland', offsetMinutes: -210 },
  { value: 'America/Araguaina', label: '(UTC-03:00) Araguaina', offsetMinutes: -180 },
  { value: 'America/Asuncion', label: '(UTC-03:00) Asuncion', offsetMinutes: -180 },
  { value: 'America/Sao_Paulo', label: '(UTC-03:00) Brazíliaváros', offsetMinutes: -180 },
  { value: 'America/Argentina/Buenos_Aires', label: '(UTC-03:00) Buenos Aires', offsetMinutes: -180 },
  { value: 'America/Cayenne', label: '(UTC-03:00) Cayenne, Fortaleza', offsetMinutes: -180 },
  { value: 'America/Montevideo', label: '(UTC-03:00) Montevideo', offsetMinutes: -180 },
  { value: 'America/Punta_Arenas', label: '(UTC-03:00) Punta Arenas', offsetMinutes: -180 },
  { value: 'America/Miquelon', label: '(UTC-03:00) Saint-Pierre és Miquelon', offsetMinutes: -180 },
  { value: 'America/Bahia', label: '(UTC-03:00) Salvador', offsetMinutes: -180 },
  { value: 'Etc/GMT+2', label: '(UTC-02:00) Egyezményes világidő-02', offsetMinutes: -120 },
  { value: 'America/Nuuk', label: '(UTC-02:00) Grönland', offsetMinutes: -120 },
  { value: 'Atlantic/Azores', label: '(UTC-01:00) Azori-szigetek', offsetMinutes: -60 },
  { value: 'Atlantic/Cape_Verde', label: '(UTC-01:00) Cabo Verde', offsetMinutes: -60 },
  { value: 'UTC', label: '(UTC) Egyezményes világidő', offsetMinutes: 0 },
  { value: 'Europe/London', label: '(UTC+00:00) Dublin, Edinburgh, Lisszabon, London', offsetMinutes: 0 },
  { value: 'Atlantic/Reykjavik', label: '(UTC+00:00) Monrovia, Reykjavik', offsetMinutes: 0 },
  { value: 'Africa/Sao_Tome', label: '(UTC+00:00) São Tomé', offsetMinutes: 0 },
  { value: 'Africa/Casablanca', label: '(UTC+01:00) Casablanca', offsetMinutes: 60 },
  { value: 'Europe/Berlin', label: '(UTC+01:00) Amszterdam, Bécs, Berlin, Bern, Róma, Stockholm', offsetMinutes: 60 },
  { value: 'Europe/Paris', label: '(UTC+01:00) Brüsszel, Koppenhága, Madrid, Párizs', offsetMinutes: 60 },
  { value: 'Europe/Budapest', label: '(UTC+01:00) Budapest, Belgrád, Ljubljana, Pozsony, Prága', offsetMinutes: 60 },
  { value: 'Africa/Lagos', label: '(UTC+01:00) Nyugat-Közép-Afrika', offsetMinutes: 60 },
  { value: 'Europe/Warsaw', label: '(UTC+01:00) Szarajevó, Szkopje, Varsó, Zágráb', offsetMinutes: 60 },
  { value: 'Europe/Athens', label: '(UTC+02:00) Athén, Bukarest', offsetMinutes: 120 },
  { value: 'Asia/Beirut', label: '(UTC+02:00) Bejrút', offsetMinutes: 120 },
  { value: 'Europe/Chisinau', label: '(UTC+02:00) Chisinau', offsetMinutes: 120 },
  { value: 'Asia/Gaza', label: '(UTC+02:00) Gáza, Hebron', offsetMinutes: 120 },
  { value: 'Africa/Johannesburg', label: '(UTC+02:00) Harare, Pretoria', offsetMinutes: 120 },
  { value: 'Europe/Kyiv', label: '(UTC+02:00) Helsinki, Kijev, Riga, Szófia, Tallinn, Vilnius', offsetMinutes: 120 },
  { value: 'Asia/Jerusalem', label: '(UTC+02:00) Jeruzsálem', offsetMinutes: 120 },
  { value: 'Africa/Juba', label: '(UTC+02:00) Juba', offsetMinutes: 120 },
  { value: 'Africa/Cairo', label: '(UTC+02:00) Kairó', offsetMinutes: 120 },
  { value: 'Europe/Kaliningrad', label: '(UTC+02:00) Kalinyingrád', offsetMinutes: 120 },
  { value: 'Africa/Khartoum', label: '(UTC+02:00) Kartúm', offsetMinutes: 120 },
  { value: 'Africa/Tripoli', label: '(UTC+02:00) Tripoli', offsetMinutes: 120 },
  { value: 'Africa/Windhoek', label: '(UTC+02:00) Windhoek', offsetMinutes: 120 },
  { value: 'Asia/Amman', label: '(UTC+03:00) Amman', offsetMinutes: 180 },
  { value: 'Asia/Baghdad', label: '(UTC+03:00) Bagdad', offsetMinutes: 180 },
  { value: 'Asia/Damascus', label: '(UTC+03:00) Damaszkusz', offsetMinutes: 180 },
  { value: 'Europe/Istanbul', label: '(UTC+03:00) Isztambul', offsetMinutes: 180 },
  { value: 'Asia/Riyadh', label: '(UTC+03:00) Kuvait, Rijád', offsetMinutes: 180 },
  { value: 'Europe/Minsk', label: '(UTC+03:00) Minszk', offsetMinutes: 180 },
  { value: 'Europe/Moscow', label: '(UTC+03:00) Moszkva, Szentpétervár', offsetMinutes: 180 },
  { value: 'Africa/Nairobi', label: '(UTC+03:00) Nairobi', offsetMinutes: 180 },
  { value: 'Europe/Volgograd', label: '(UTC+03:00) Volgográd', offsetMinutes: 180 },
  { value: 'Asia/Tehran', label: '(UTC+03:30) Teherán', offsetMinutes: 210 },
  { value: 'Asia/Dubai', label: '(UTC+04:00) Abu-Dzabi, Maszkat', offsetMinutes: 240 },
  { value: 'Europe/Astrakhan', label: '(UTC+04:00) Asztrahán, Uljanovszk', offsetMinutes: 240 },
  { value: 'Asia/Baku', label: '(UTC+04:00) Baku', offsetMinutes: 240 },
  { value: 'Europe/Samara', label: '(UTC+04:00) Izsevszk, Szamara', offsetMinutes: 240 },
  { value: 'Asia/Yerevan', label: '(UTC+04:00) Jereván', offsetMinutes: 240 },
  { value: 'Indian/Mauritius', label: '(UTC+04:00) Port Louis', offsetMinutes: 240 },
  { value: 'Europe/Saratov', label: '(UTC+04:00) Szaratov', offsetMinutes: 240 },
  { value: 'Asia/Tbilisi', label: '(UTC+04:00) Tbiliszi', offsetMinutes: 240 },
  { value: 'Asia/Kabul', label: '(UTC+04:30) Kabul', offsetMinutes: 270 },
  { value: 'Asia/Tashkent', label: '(UTC+05:00) Asgabat, Taskent', offsetMinutes: 300 },
  { value: 'Asia/Qyzylorda', label: '(UTC+05:00) Asztana', offsetMinutes: 300 },
  { value: 'Asia/Karachi', label: '(UTC+05:00) Iszlámábád, Karacsi', offsetMinutes: 300 },
  { value: 'Asia/Yekaterinburg', label: '(UTC+05:00) Jekatyerinburg', offsetMinutes: 300 },
  { value: 'Asia/Kolkata', label: '(UTC+05:30) Chennai, Kolkata, Mumbai, Új-Delhi', offsetMinutes: 330 },
  { value: 'Asia/Colombo', label: '(UTC+05:30) Kotte', offsetMinutes: 330 },
  { value: 'Asia/Kathmandu', label: '(UTC+05:45) Katmandu', offsetMinutes: 345 },
  { value: 'Asia/Bishkek', label: '(UTC+06:00) Biskek', offsetMinutes: 360 },
  { value: 'Asia/Dhaka', label: '(UTC+06:00) Dakka', offsetMinutes: 360 },
  { value: 'Asia/Omsk', label: '(UTC+06:00) Omszk', offsetMinutes: 360 },
  { value: 'Asia/Yangon', label: '(UTC+06:30) Yangon (Rangun)', offsetMinutes: 390 },
  { value: 'Asia/Bangkok', label: '(UTC+07:00) Bangkok, Dzsakarta, Hanoi', offsetMinutes: 420 },
  { value: 'Asia/Barnaul', label: '(UTC+07:00) Barnaul, Gorno-Altajszk', offsetMinutes: 420 },
  { value: 'Asia/Hovd', label: '(UTC+07:00) Hovd', offsetMinutes: 420 },
  { value: 'Asia/Krasnoyarsk', label: '(UTC+07:00) Krasznojarszk', offsetMinutes: 420 },
  { value: 'Asia/Novosibirsk', label: '(UTC+07:00) Novoszibirszk', offsetMinutes: 420 },
  { value: 'Asia/Tomsk', label: '(UTC+07:00) Tomszk', offsetMinutes: 420 },
  { value: 'Asia/Irkutsk', label: '(UTC+08:00) Irkutszk', offsetMinutes: 480 },
  { value: 'Asia/Singapore', label: '(UTC+08:00) Kuala Lumpur, Szingapúr', offsetMinutes: 480 },
  { value: 'Asia/Shanghai', label: '(UTC+08:00) Peking, Csungking, Hongkong, Urumcsi', offsetMinutes: 480 },
  { value: 'Australia/Perth', label: '(UTC+08:00) Perth', offsetMinutes: 480 },
  { value: 'Asia/Taipei', label: '(UTC+08:00) Tajpej', offsetMinutes: 480 },
  { value: 'Asia/Ulaanbaatar', label: '(UTC+08:00) Ulánbátor', offsetMinutes: 480 },
  { value: 'Australia/Eucla', label: '(UTC+08:45) Eucla', offsetMinutes: 525 },
  { value: 'Asia/Chita', label: '(UTC+09:00) Csita', offsetMinutes: 540 },
  { value: 'Asia/Yakutsk', label: '(UTC+09:00) Jakutszk', offsetMinutes: 540 },
  { value: 'Asia/Tokyo', label: '(UTC+09:00) Oszaka, Szapporó, Tokió', offsetMinutes: 540 },
  { value: 'Asia/Pyongyang', label: '(UTC+09:00) Phenjan', offsetMinutes: 540 },
  { value: 'Asia/Seoul', label: '(UTC+09:00) Szöul', offsetMinutes: 540 },
  { value: 'Australia/Adelaide', label: '(UTC+09:30) Adelaide', offsetMinutes: 570 },
  { value: 'Australia/Darwin', label: '(UTC+09:30) Darwin', offsetMinutes: 570 },
  { value: 'Australia/Brisbane', label: '(UTC+10:00) Brisbane', offsetMinutes: 600 },
  { value: 'Australia/Sydney', label: '(UTC+10:00) Canberra, Melbourne, Sydney', offsetMinutes: 600 },
  { value: 'Pacific/Guam', label: '(UTC+10:00) Guam, Port Moresby', offsetMinutes: 600 },
  { value: 'Australia/Hobart', label: '(UTC+10:00) Hobart', offsetMinutes: 600 },
  { value: 'Asia/Vladivostok', label: '(UTC+10:00) Vlagyivosztok', offsetMinutes: 600 },
  { value: 'Australia/Lord_Howe', label: '(UTC+10:30) Lord Howe-sziget', offsetMinutes: 630 },
  { value: 'Pacific/Bougainville', label: '(UTC+11:00) Bougainville-sziget', offsetMinutes: 660 },
  { value: 'Asia/Srednekolymsk', label: '(UTC+11:00) Csokurdah', offsetMinutes: 660 },
  { value: 'Asia/Magadan', label: '(UTC+11:00) Magadán', offsetMinutes: 660 },
  { value: 'Pacific/Norfolk', label: '(UTC+11:00) Norfolk-sziget', offsetMinutes: 660 },
  { value: 'Pacific/Guadalcanal', label: '(UTC+11:00) Salamon-szigetek, Új-Kaledónia', offsetMinutes: 660 },
  { value: 'Asia/Sakhalin', label: '(UTC+11:00) Szahalin', offsetMinutes: 660 },
  { value: 'Asia/Kamchatka', label: '(UTC+12:00) Anadir, Petropavlovszk-Kamcsatszkij', offsetMinutes: 720 },
  { value: 'Pacific/Auckland', label: '(UTC+12:00) Auckland, Wellington', offsetMinutes: 720 },
  { value: 'Etc/GMT-12', label: '(UTC+12:00) Egyezményes világidő+12', offsetMinutes: 720 },
  { value: 'Pacific/Fiji', label: '(UTC+12:00) Fidzsi-szigetek', offsetMinutes: 720 },
  { value: 'Pacific/Chatham', label: '(UTC+12:45) Chatham-szigetek', offsetMinutes: 765 },
  { value: 'Etc/GMT-13', label: '(UTC+13:00) Egyezményes világidő+13', offsetMinutes: 780 },
  { value: 'Pacific/Tongatapu', label: '(UTC+13:00) Nukuʻalofa', offsetMinutes: 780 },
  { value: 'Pacific/Apia', label: '(UTC+13:00) Szamoa', offsetMinutes: 780 },
  { value: 'Pacific/Kiritimati', label: '(UTC+14:00) Kiritimati-sziget', offsetMinutes: 840 },
];

const TIME_ZONES = WINDOWS_TIME_ZONES;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function timeZoneInfo(value = configuredTimeZone()) {
  return TIME_ZONES.find((zone) => zone.value === value) || TIME_ZONES.find((zone) => zone.value === DEFAULT_TIMEZONE) || TIME_ZONES[0];
}

function validTimeZone(value) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch (_err) {
    return false;
  }
}

function configuredTimeZone() {
  const value = String(getSetting('time_timezone', DEFAULT_TIMEZONE) || DEFAULT_TIMEZONE);
  return timeZoneInfo(value).value;
}

function daylightSavingAuto() {
  return String(getSetting('time_dst_auto', '1')) !== '0';
}

function timeSource() {
  return String(getSetting('time_source', 'system') || 'system') === 'timeserver' ? 'timeserver' : 'system';
}

function configuredOffsetMs() {
  if (timeSource() !== 'timeserver') return 0;
  const raw = Number(getSetting('time_server_offset_ms', '0'));
  return Number.isFinite(raw) ? raw : 0;
}

function appNow() {
  return new Date(Date.now() + configuredOffsetMs());
}

function partsFromIana(date, timeZone) {
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
}

function partsFromFixedOffset(date, offsetMinutes) {
  const shifted = new Date(date.getTime() + (Number(offsetMinutes) || 0) * 60 * 1000);
  return {
    year: String(shifted.getUTCFullYear()),
    month: pad2(shifted.getUTCMonth() + 1),
    day: pad2(shifted.getUTCDate()),
    hour: pad2(shifted.getUTCHours()),
    minute: pad2(shifted.getUTCMinutes()),
    second: pad2(shifted.getUTCSeconds()),
  };
}

function zonedParts(date = appNow(), timeZone = configuredTimeZone()) {
  const info = timeZoneInfo(timeZone);
  if (!daylightSavingAuto()) return partsFromFixedOffset(date, info.offsetMinutes);
  try {
    return partsFromIana(date, info.value);
  } catch (_err) {
    return partsFromFixedOffset(date, info.offsetMinutes);
  }
}

function formatDateTime(date = appNow(), timeZone = configuredTimeZone()) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function formatFileStamp(date = appNow(), timeZone = configuredTimeZone()) {
  const p = zonedParts(date, timeZone);
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
}

function zonedNow() {
  const p = zonedParts(appNow(), configuredTimeZone());
  return new Date(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
}

function serverUrl() {
  return String(getSetting('time_server_url', DEFAULT_TIME_SERVER_URL) || DEFAULT_TIME_SERVER_URL).trim();
}

function getTimeSettings() {
  const zone = configuredTimeZone();
  const info = timeZoneInfo(zone);
  const offsetMs = configuredOffsetMs();
  return {
    source: timeSource(),
    timezone: zone,
    timezoneLabel: info.label,
    offsetMinutes: info.offsetMinutes,
    fixedOffset: false,
    dstAuto: daylightSavingAuto(),
    serverUrl: serverUrl(),
    offsetMs,
    currentTime: appNow().toISOString(),
    currentDisplay: formatDateTime(appNow(), zone),
    systemTime: new Date().toISOString(),
    lastSyncAt: getSetting('time_last_sync_at', ''),
    lastServerTime: getSetting('time_last_server_time', ''),
    lastSyncError: getSetting('time_last_sync_error', ''),
  };
}

function saveTimeSettings(values = {}) {
  const allowed = [
    'time_source',
    'time_timezone',
    'time_dst_auto',
    'time_server_url',
  ];
  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) setSetting(key, values[key]);
  });
}

function parseServerTime(payload, rawText = '') {
  if (typeof payload === 'number') return payload > 1e12 ? payload : payload * 1000;
  if (payload && typeof payload === 'object') {
    const candidates = [
      payload.unixtime !== undefined ? Number(payload.unixtime) * 1000 : null,
      payload.unixTime !== undefined ? Number(payload.unixTime) * 1000 : null,
      payload.timestamp !== undefined ? Number(payload.timestamp) : null,
      payload.currentUnixTime !== undefined ? Number(payload.currentUnixTime) * 1000 : null,
      payload.utc_datetime,
      payload.datetime,
      payload.currentDateTime,
      payload.dateTime,
      payload.time,
    ];
    for (const candidate of candidates) {
      if (candidate === null || candidate === undefined || candidate === '') continue;
      if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate > 1e12 ? candidate : candidate * 1000;
      const parsed = Date.parse(String(candidate));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  const parsedText = Date.parse(String(rawText || '').trim());
  return Number.isFinite(parsedText) ? parsedText : NaN;
}

function timeServerErrorMessage(err, endpoint) {
  const raw = String(err?.message || err || '').trim();
  if (err?.name === 'AbortError') {
    return `Timeserver időtúllépés: a szerver 12 másodpercen belül nem válaszolt. Ellenőrizd az URL-t vagy a hálózati kapcsolatot. URL: ${endpoint}`;
  }
  if (/Failed to parse URL|Invalid URL|Only absolute URLs/i.test(raw)) {
    return `Érvénytelen timeserver URL. Ellenőrizd a beírt címet. URL: ${endpoint}`;
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network/i.test(raw)) {
    return `Timeserver nem érhető el. Ellenőrizd az URL-t, a hálózatot vagy a tűzfalat. URL: ${endpoint}`;
  }
  if (/HTTP\s+\d+/i.test(raw)) return `Timeserver válaszhiba: ${raw.match(/HTTP\s+\d+/i)?.[0] || raw}. URL: ${endpoint}`;
  if (/tartalmaz/i.test(raw) && /id/i.test(raw)) return `A timeserver válasza nem tartalmaz értelmezhető időt. URL: ${endpoint}`;
  return `Timeserver szinkronizálás sikertelen: ${raw || 'ismeretlen hiba'}. URL: ${endpoint}`;
}

async function syncTimeServer(values = {}) {
  if (values && typeof values === 'object') saveTimeSettings(values);
  const zone = configuredTimeZone();
  const endpoint = serverUrl().replaceAll('{timezone}', encodeURIComponent(validTimeZone(zone) ? zone : DEFAULT_TIMEZONE));
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.8' },
      signal: controller.signal,
    });
    const finished = Date.now();
    if (!response.ok) throw new Error(`Timeserver válaszhiba: HTTP ${response.status}`);
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch (_err) {
      payload = text;
    }
    const serverMs = parseServerTime(payload, text);
    if (!Number.isFinite(serverMs)) throw new Error('A timeserver válasza nem tartalmaz értelmezhető időt.');
    const midpoint = started + Math.round((finished - started) / 2);
    const offsetMs = Math.round(serverMs - midpoint);
    setSetting('time_source', 'timeserver');
    setSetting('time_server_offset_ms', String(offsetMs));
    setSetting('time_last_sync_at', new Date().toISOString());
    setSetting('time_last_server_time', new Date(serverMs).toISOString());
    setSetting('time_last_sync_error', '');
    return {
      endpoint,
      offsetMs,
      serverTime: new Date(serverMs).toISOString(),
      roundTripMs: finished - started,
      message: `Timeserver elérhető. Szinkronizálás sikeres. URL: ${endpoint}`,
    };
  } catch (err) {
    const message = timeServerErrorMessage(err, endpoint);
    setSetting('time_last_sync_error', message);
    const wrapped = new Error(message);
    wrapped.status = 502;
    wrapped.code = 'TIME_SERVER_SYNC_FAILED';
    wrapped.cause = err;
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }
}

function isHttpTimeServerV2(endpoint = '') {
  return /^https?:\/\//i.test(String(endpoint || '').trim());
}

function parseNtpEndpointV2(endpoint = '') {
  const clean = String(endpoint || '').trim().replace(/^ntp:\/\//i, '').split(/[/?#]/)[0];
  if (!clean || /\s/.test(clean)) throw new Error('Érvénytelen NTP timeserver cím.');
  if (clean.startsWith('[')) {
    const end = clean.indexOf(']');
    if (end < 0) throw new Error('Érvénytelen NTP timeserver cím.');
    const host = clean.slice(1, end);
    const portText = clean.slice(end + 1).replace(/^:/, '');
    const port = portText ? Number(portText) : 123;
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Érvénytelen NTP timeserver cím.');
    return { host, port };
  }
  const colonCount = (clean.match(/:/g) || []).length;
  const [host, portText] = colonCount === 1 ? clean.split(':') : [clean, ''];
  const port = portText ? Number(portText) : 123;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Érvénytelen NTP timeserver cím.');
  return { host, port };
}

function queryNtpTimeServerV2(endpoint, timeoutMs = 12000) {
  const { host, port } = parseNtpEndpointV2(endpoint);
  const displayEndpoint = `ntp://${host}:${port}`;
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const packet = Buffer.alloc(48);
    const started = Date.now();
    let completed = false;
    packet[0] = 0x1b;
    const finish = (err, result) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      socket.close();
      if (err) reject(err);
      else resolve(result);
    };
    const timer = setTimeout(() => {
      const err = new Error('NTP timeserver időtúllépés.');
      err.name = 'AbortError';
      finish(err);
    }, timeoutMs);
    socket.once('error', (err) => finish(err));
    socket.once('message', (message) => {
      if (message.length < 48) {
        finish(new Error('Az NTP timeserver válasza túl rövid.'));
        return;
      }
      const finished = Date.now();
      const seconds = message.readUInt32BE(40);
      const fraction = message.readUInt32BE(44);
      const serverMs = ((seconds - NTP_EPOCH_OFFSET_SECONDS) * 1000) + Math.round((fraction * 1000) / 0x100000000);
      if (!Number.isFinite(serverMs)) {
        finish(new Error('Az NTP timeserver válasza nem tartalmaz értelmezhető időt.'));
        return;
      }
      finish(null, {
        endpoint: displayEndpoint,
        protocol: 'NTP',
        serverMs,
        started,
        roundTripMs: finished - started,
      });
    });
    socket.send(packet, 0, packet.length, port, host, (err) => {
      if (err) finish(err);
    });
  });
}

async function queryHttpTimeServerV2(endpoint, timeoutMs = 12000) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.8' },
      signal: controller.signal,
    });
    const finished = Date.now();
    if (!response.ok) throw new Error(`Timeserver válaszhiba: HTTP ${response.status}`);
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch (_err) {
      payload = text;
    }
    const serverMs = parseServerTime(payload, text);
    if (!Number.isFinite(serverMs)) throw new Error('A timeserver válasza nem tartalmaz értelmezhető időt.');
    return {
      endpoint,
      protocol: 'HTTP',
      serverMs,
      started,
      roundTripMs: finished - started,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function timeServerErrorMessageV2(err, endpoint) {
  const raw = String(err?.message || err || '').trim();
  if (err?.name === 'AbortError') {
    return `Timeserver időtúllépés: a szerver 12 másodpercen belül nem válaszolt. Ellenőrizd a címet vagy a hálózati kapcsolatot. Cím: ${endpoint}`;
  }
  if (/Failed to parse URL|Invalid URL|Only absolute URLs|Érvénytelen NTP/i.test(raw)) {
    return `Érvénytelen timeserver cím. Adj meg HTTP(S) URL-t vagy NTP hostnevet. Cím: ${endpoint}`;
  }
  if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network/i.test(raw)) {
    return `Timeserver nem érhető el. Ellenőrizd a címet, a hálózatot vagy a tűzfalat. Cím: ${endpoint}`;
  }
  if (/HTTP\s+\d+/i.test(raw)) return `Timeserver válaszhiba: ${raw.match(/HTTP\s+\d+/i)?.[0] || raw}. Cím: ${endpoint}`;
  if (/tartalmaz/i.test(raw) && /id/i.test(raw)) return `A timeserver válasza nem tartalmaz értelmezhető időt. Cím: ${endpoint}`;
  return `Timeserver szinkronizálás sikertelen: ${raw || 'ismeretlen hiba'}. Cím: ${endpoint}`;
}

async function syncTimeServerV2(values = {}) {
  if (values && typeof values === 'object') saveTimeSettings(values);
  const zone = configuredTimeZone();
  const endpoint = serverUrl().replaceAll('{timezone}', encodeURIComponent(validTimeZone(zone) ? zone : DEFAULT_TIMEZONE));
  try {
    const result = isHttpTimeServerV2(endpoint)
      ? await queryHttpTimeServerV2(endpoint)
      : await queryNtpTimeServerV2(endpoint);
    const midpoint = result.started + Math.round(result.roundTripMs / 2);
    const offsetMs = Math.round(result.serverMs - midpoint);
    setSetting('time_source', 'timeserver');
    setSetting('time_server_offset_ms', String(offsetMs));
    setSetting('time_last_sync_at', new Date().toISOString());
    setSetting('time_last_server_time', new Date(result.serverMs).toISOString());
    setSetting('time_last_sync_error', '');
    return {
      endpoint: result.endpoint,
      protocol: result.protocol,
      offsetMs,
      serverTime: new Date(result.serverMs).toISOString(),
      roundTripMs: result.roundTripMs,
      message: `Timeserver elérhető (${result.protocol}). Szinkronizálás sikeres. Cím: ${result.endpoint}`,
    };
  } catch (err) {
    const message = timeServerErrorMessageV2(err, endpoint);
    setSetting('time_last_sync_error', message);
    const wrapped = new Error(message);
    wrapped.status = 502;
    wrapped.code = 'TIME_SERVER_SYNC_FAILED';
    wrapped.cause = err;
    throw wrapped;
  }
}

module.exports = {
  DEFAULT_TIMEZONE,
  TIME_ZONES,
  appNow,
  configuredTimeZone,
  formatDateTime,
  formatFileStamp,
  getTimeSettings,
  saveTimeSettings,
  syncTimeServer: syncTimeServerV2,
  zonedNow,
};
