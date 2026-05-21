(function () {
const ribbonCatalog = {
  dashboard: {
    area: 'MGM Reporting',
    path: ['MGM Reporting', 'Kezdőlap', 'Áttekintés'],
    tabs: [
      { id: 'overview', label: 'Kezdőlap', groups: [
        { label: 'Navigáció', buttons: [
          { label: 'Riport', glyph: 'RP', page: 'report' },
          { label: 'GL import', glyph: 'GL', page: 'gl', minRole: 'USER' },
          { label: 'Számlatükör', glyph: 'SZ', page: 'coa' },
        ] },
        { label: 'Oldal', buttons: [
          { label: 'Frissítés', glyph: 'FR', action: 'reload-page' },
        ] },
        { label: 'Adatok', buttons: [
          { label: 'Mintaadatok', glyph: 'MI', action: 'load-sample-data', minRole: 'ADMIN' },
          { label: 'Adatkarbantartás', glyph: 'AK', action: 'open-data-admin-window', minRole: 'SA' },
        ] },
      ] },
      { id: 'period', label: 'Környezet', groups: [
        { label: 'Beállítás', buttons: [
          { label: 'Cégek', glyph: 'CE', page: 'companies', minRole: 'ADMIN' },
          { label: 'Beállítások', glyph: 'BE', page: 'settings', minRole: 'ADMIN' },
        ] },
      ] },
    ],
  },
  report: {
    area: 'Riport',
    path: ['MGM Reporting', 'Riportok', 'Pénzügyi riport'],
    tabs: [
      { id: 'report', label: 'Riport', groups: [
        { label: 'Műveletek', buttons: [
          { label: 'Frissítés', glyph: 'FR', action: 'reload-page' },
          { label: 'Excel export', glyph: 'XL', action: 'export-report' },
        ] },
        { label: 'Adatforrás', buttons: [
          { label: 'GL import', glyph: 'GL', page: 'gl', minRole: 'USER' },
          { label: 'Budget', glyph: 'BD', page: 'budget', minRole: 'USER' },
          { label: 'Árfolyamok', glyph: 'FX', page: 'fx' },
        ] },
      ] },
      { id: 'analyze', label: 'Elemzés', groups: [
        { label: 'Összehasonlítás', buttons: [
          { label: 'ACT / BUD', glyph: 'AB', action: 'reload-page' },
          { label: 'ACT / PY', glyph: 'PY', action: 'reload-page' },
        ] },
      ] },
    ],
  },
  coa: {
    area: 'Számlatükör',
    path: ['MGM Reporting', 'Főkönyv', 'Számlatükör'],
    tabs: [
      { id: 'coa', label: 'Számlatükör', groups: [
        { label: 'Adatcsere', buttons: [
          { label: 'Import', glyph: 'IM', action: 'open-coa-import-window', minRole: 'USER' },
          { label: 'Frissítés', glyph: 'FR', action: 'reload-page' },
        ] },
        { label: 'Karbantartás', buttons: [
          { label: 'Validáció', glyph: 'VA', action: 'open-coa-import-window', minRole: 'USER' },
          { label: 'Sorszabályok', glyph: 'SR', action: 'open-summary-rules-window', minRole: 'USER' },
          { label: 'Törzsadatok', glyph: 'TD', action: 'open-master-data-window', minRole: 'USER' },
        ] },
        { label: 'Kapcsolódó', buttons: [
          { label: 'GL import', glyph: 'GL', page: 'gl', minRole: 'USER' },
          { label: 'Riport', glyph: 'RP', page: 'report' },
        ] },
      ] },
    ],
  },
  trialbalance: {
    area: 'Főkönyvi kivonat',
    path: ['MGM Reporting', 'Főkönyv', 'Főkönyvi kivonat'],
    tabs: [
      { id: 'view', label: 'Kivonat', groups: [
        { label: 'Műveletek', buttons: [
          { label: 'Frissítés', glyph: 'FR', action: 'reload-page' },
          { label: 'Excel export', glyph: 'XL', action: 'export-trial-balance' },
        ] },
        { label: 'Kapcsolódó', buttons: [
          { label: 'Számlatükör', glyph: 'SZ', page: 'coa' },
          { label: 'GL import', glyph: 'GL', page: 'gl', minRole: 'USER' },
        ] },
      ] },
    ],
  },
  gl: {
    area: 'GL import',
    path: ['MGM Reporting', 'Főkönyv', 'GL import'],
    tabs: [
      { id: 'import', label: 'Import', groups: [
        { label: 'Betöltés', buttons: [
          { label: 'Fájl választás', glyph: 'FA', action: 'focus', target: '[data-form="gl-import"] input[type="file"]' },
          { label: 'Import', glyph: 'IM', action: 'focus', target: '[data-form="gl-import"] textarea' },
        ] },
        { label: 'Ellenőrzés', buttons: [
          { label: 'Számlatükör', glyph: 'SZ', page: 'coa' },
          { label: 'Frissítés', glyph: 'FR', action: 'reload-page' },
        ] },
      ] },
      { id: 'history', label: 'Napló', groups: [
        { label: 'Előzmények', buttons: [
          { label: 'Importok', glyph: 'IN', action: 'focus', target: '[data-region="import-sessions"]' },
          { label: 'Naplók', glyph: 'NA', page: 'logs', minRole: 'USER' },
        ] },
      ] },
    ],
  },
  fx: {
    area: 'Árfolyamok',
    path: ['MGM Reporting', 'Főkönyv', 'Árfolyamok'],
    tabs: [
      { id: 'rates', label: 'Árfolyam', groups: [
        { label: 'Karbantartás', buttons: [
          { label: 'Kézi árfolyam', glyph: 'KA', action: 'focus', target: '[data-form="fx-save"] input[name="averageRate"]', minRole: 'USER' },
          { label: 'Frissítés', glyph: 'FR', action: 'reload-page' },
        ] },
        { label: 'Kapcsolódó', buttons: [
          { label: 'Riport', glyph: 'RP', page: 'report' },
          { label: 'Budget', glyph: 'BD', page: 'budget', minRole: 'USER' },
        ] },
      ] },
    ],
  },
  budget: {
    area: 'Budget / Forecast',
    path: ['MGM Reporting', 'Tervezés', 'Budget / Forecast'],
    tabs: [
      { id: 'budget', label: 'Budget', groups: [
        { label: 'Betöltés', buttons: [
          { label: 'Import', glyph: 'IM', action: 'focus', target: '[data-form="budget-import"] textarea' },
          { label: 'Frissítés', glyph: 'FR', action: 'reload-page' },
        ] },
        { label: 'Riportok', buttons: [
          { label: 'Pénzügyi riport', glyph: 'RP', page: 'report' },
        ] },
      ] },
    ],
  },
  companies: {
    area: 'Cégek',
    path: ['MGM Reporting', 'Adminisztráció', 'Cégek'],
    tabs: [
      { id: 'company', label: 'Cégek', groups: [
        { label: 'Új', buttons: [
          { label: 'Cég', glyph: 'CE', action: 'focus', target: '[data-form="company-create"] input[name="code"]' },
        ] },
        { label: 'Beállítás', buttons: [
          { label: 'Felhasználók', glyph: 'FE', page: 'users' },
          { label: 'Beállítások', glyph: 'BE', page: 'settings' },
        ] },
      ] },
    ],
  },
  users: {
    area: 'Felhasználók',
    path: ['MGM Reporting', 'Adminisztráció', 'Felhasználók'],
    tabs: [
      { id: 'user', label: 'Felhasználók', groups: [
        { label: 'Új', buttons: [
          { label: 'Felhasználó', glyph: 'FE', action: 'focus', target: '[data-form="user-create"] input[name="username"]' },
        ] },
        { label: 'Karbantartás', buttons: [
          { label: 'Naplók', glyph: 'NA', page: 'logs' },
          { label: 'Frissítés', glyph: 'FR', action: 'reload-page' },
        ] },
      ] },
    ],
  },
  backup: {
    area: 'Backup',
    path: ['MGM Reporting', 'Adminisztráció', 'Backup'],
    tabs: [
      { id: 'backup', label: 'Backup', groups: [
        { label: 'Műveletek', buttons: [
          { label: 'Backup készítése', glyph: 'BK', action: 'create-backup' },
          { label: 'Frissítés', glyph: 'FR', action: 'reload-page' },
        ] },
        { label: 'Napló', buttons: [
          { label: 'Naplók', glyph: 'NA', page: 'logs' },
        ] },
      ] },
    ],
  },
  logs: {
    area: 'Naplók',
    path: ['MGM Reporting', 'Adminisztráció', 'Naplók'],
    tabs: [
      { id: 'log', label: 'Naplók', groups: [
        { label: 'Nézet', buttons: [
          { label: 'Frissítés', glyph: 'FR', action: 'reload-page' },
        ] },
        { label: 'Kapcsolódó', buttons: [
          { label: 'Backup', glyph: 'BK', page: 'backup', minRole: 'ADMIN' },
          { label: 'Felhasználók', glyph: 'FE', page: 'users', minRole: 'ADMIN' },
        ] },
      ] },
    ],
  },
  settings: {
    area: 'Beállítások',
    path: ['MGM Reporting', 'Adminisztráció', 'Beállítások'],
    tabs: [
      { id: 'setup', label: 'Beállítás', groups: [
        { label: 'Karbantartás', buttons: [
          { label: 'Paraméterek', glyph: 'PA', action: 'focus', target: '[data-form="settings-save"] input[name="smtp_host"]' },
        ] },
        { label: 'Kapcsolódó', buttons: [
          { label: 'Licensz', glyph: 'LC', page: 'license' },
          { label: 'Backup', glyph: 'BK', page: 'backup' },
        ] },
      ] },
    ],
  },
  license: {
    area: 'Licensz',
    path: ['MGM Reporting', 'Adminisztráció', 'Licensz'],
    tabs: [
      { id: 'license', label: 'Licensz', groups: [
        { label: 'Karbantartás', buttons: [
          { label: 'Aktiválás', glyph: 'LC', action: 'focus', target: '[data-form="license-activate"] textarea' },
          { label: 'Generálás', glyph: 'GE', action: 'focus', target: '[data-form="license-generate"] input[name="companyName"]', minRole: 'SA' },
        ] },
        { label: 'Beállítás', buttons: [
          { label: 'Beállítások', glyph: 'BE', page: 'settings' },
        ] },
      ] },
    ],
  },
  profile: {
    area: 'Profil',
    path: ['MGM Reporting', 'Saját fiók', 'Profil'],
    tabs: [
      { id: 'profile', label: 'Profil', groups: [
        { label: 'Karbantartás', buttons: [
          { label: 'Jelszócsere', glyph: 'JC', action: 'focus', target: '[data-form="password-change"] input[name="currentPassword"]' },
        ] },
        { label: 'Munkamenet', buttons: [
          { label: 'Kilépés', glyph: 'KI', action: 'logout' },
        ] },
      ] },
    ],
  },
};

  window.MGM_RIBBON = { ribbonCatalog };
})();
