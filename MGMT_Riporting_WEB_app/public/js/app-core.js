(function () {
  const roleLevel = { VIEWER: 1, USER: 2, ADMIN: 3, SA: 4 };

  function readJsonSetting(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_err) {
      return fallback;
    }
  }

  function createInitialState() {
    return {
      user: null,
      companies: [],
      settings: {},
      license: null,
      page: 'dashboard',
      activeModule: null,
      ribbonTab: null,
      ribbonCollapsed: localStorage.getItem('mgmRibbonCollapsed') === '1',
      sidebarCollapsed: localStorage.getItem('mgmSidebarCollapsed') === '1',
      statusMenu: null,
      windowSeq: 0,
      coaImportFile: null,
      coaImportPreview: null,
      glImportFile: null,
      glImportPreview: null,
      glImportTargetYear: '',
      glImportTargetMonth: '',
      glImportDetail: null,
      glImportFilters: {},
      importTemplates: [],
      summaryRules: [],
      logType: 'all',
      logScope: 'company',
      permissionUserId: '',
      permissions: { modules: {} },
      settingsMainTab: localStorage.getItem('mgmSettingsMainTab') || 'general',
      settingsGeneralTab: localStorage.getItem('mgmSettingsGeneralTab') || 'system',
      settingsAccountsTab: localStorage.getItem('mgmSettingsAccountsTab') || 'profile',
      contentTarget: '#content',
      reportCodeDrafts: {},
      reportCodeColumns: readJsonSetting('mgmReportCodeColumns', {}),
      coaReportMaster: { management: [], cons: [] },
      coaColumns: readJsonSetting('mgmCoaColumns', null),
      trialBalanceColumns: readJsonSetting('mgmTrialBalanceColumns', null),
    };
  }

  const navModules = [
    { id: 'home', label: 'Kezdőlap', glyph: 'KE', items: [
      ['dashboard', 'Áttekintés', 'VIEWER'],
      ['report', 'Riport', 'VIEWER'],
    ] },
    { id: 'ledger', label: 'Főkönyv', glyph: 'FK', items: [
      ['coa', 'Számlatükör', 'VIEWER'],
      ['trialbalance', 'Főkönyvi kivonat', 'VIEWER'],
      ['fx', 'Árfolyamok', 'VIEWER'],
      ['gl', 'GL import', 'USER'],
    ] },
    { id: 'planning', label: 'Tervezés', glyph: 'TR', items: [
      ['budget', 'Budget / Forecast', 'USER'],
    ] },
    { id: 'admin', label: 'Adminisztráció', glyph: 'AD', items: [
      ['companies', 'Cégek', 'ADMIN'],
      ['users', 'Felhasználók', 'ADMIN'],
      ['sessions', 'Munkamenetek', 'ADMIN'],
      ['backup', 'Backup', 'ADMIN'],
      ['logs', 'Naplók', 'USER'],
      ['settings', 'Beállítások', 'ADMIN'],
      ['permissions', 'JogosultsĂˇgok', 'SA'],
      ['license', 'Licensz', 'ADMIN'],
      ['dataadmin', 'Adatkarbantartás', 'SA'],
    ] },
    { id: 'account', label: 'Saját fiók', glyph: 'SF', items: [
      ['profile', 'Profil', 'VIEWER'],
    ] },
  ];

  const iconByGlyph = {
    RP: 'report.svg',
    AB: 'chart.svg',
    PY: 'chart.svg',
    GL: 'gl.svg',
    FK: 'gl.svg',
    SZ: 'coa.svg',
    SR: 'rules.svg',
    FR: 'refresh.svg',
    MI: 'sample.svg',
    AK: 'maintenance.svg',
    CE: 'company.svg',
    BE: 'settings.svg',
    XL: 'export.svg',
    FX: 'rates.svg',
    BD: 'budget.svg',
    IM: 'import.svg',
    VA: 'validation.svg',
    TD: 'master-data.svg',
    FA: 'file.svg',
    IN: 'logs.svg',
    NA: 'logs.svg',
    KA: 'rates.svg',
    FE: 'users.svg',
    SE: 'users.svg',
    BK: 'backup.svg',
    PA: 'settings.svg',
    LC: 'license.svg',
    GE: 'license.svg',
    JC: 'password.svg',
    JO: 'password.svg',
    KI: 'logout.svg',
  };

  const iconByModule = {
    home: 'apps.svg',
    ledger: 'coa.svg',
    planning: 'budget.svg',
    admin: 'settings.svg',
    account: 'profile.svg',
  };

  const moduleAreaCatalog = {
    home: [
      { title: 'Munka', items: [
        { label: 'Áttekintés', page: 'dashboard', glyph: 'RP', description: 'Aktív cég, időszak és fő mutatók.' },
        { label: 'Riport', page: 'report', glyph: 'RP', description: 'Pénzügyi riport, YTD és variancia nézet.' },
      ] },
      { title: 'Kapcsolódó', items: [
        { label: 'GL import', page: 'gl', glyph: 'GL', minRole: 'USER', description: 'Havi főkönyvi adatok betöltése.' },
        { label: 'Számlatükör', page: 'coa', glyph: 'SZ', description: 'GL számok és konszolidált kontók.' },
      ] },
    ],
    ledger: [
      { title: 'Alapadatok', items: [
        { label: 'Számlatükör', page: 'coa', glyph: 'SZ', description: 'Főkönyvi számlák és riport kategóriák.' },
        { label: 'Főkönyvi kivonat', page: 'trialbalance', glyph: 'FK', description: '12 havi ACT főkönyvi áttekintés.' },
        { label: 'Árfolyamok', page: 'fx', glyph: 'FX', description: 'Havi átlag és záró árfolyamok.' },
      ] },
      { title: 'Import', items: [
        { label: 'GL import', page: 'gl', glyph: 'GL', minRole: 'USER', description: 'Tény főkönyvi adatok betöltése.' },
        { label: 'Számlatükör import', action: 'open-coa-import-window', glyph: 'IM', minRole: 'USER', description: 'COA fájl betöltése megfeleltetéssel.' },
      ] },
      { title: 'Karbantartás', items: [
        { label: 'Sorszabályok', action: 'open-summary-rules-window', glyph: 'SR', minRole: 'USER', description: 'Összesítő és inaktív sor szabályok.' },
        { label: 'Törzsadatok', action: 'open-master-data-window', glyph: 'TD', minRole: 'USER', description: 'Riport kategóriák és konszolidált kontók.' },
      ] },
    ],
    planning: [
      { title: 'Tervezés', items: [
        { label: 'Budget / Forecast', page: 'budget', glyph: 'BD', minRole: 'USER', description: 'Terv és előrejelzés adatok GL szinten.' },
        { label: 'Riport', page: 'report', glyph: 'RP', description: 'Tény-terv összehasonlítás.' },
      ] },
    ],
    admin: [
      { title: 'Biztonság', items: [
        { label: 'Jogosultságok', page: 'permissions', glyph: 'JO', minRole: 'SA', description: 'Felhasználói modul- és cégjogok.' },
      ] },
      { title: 'Törzsek', items: [
        { label: 'Cégek', page: 'companies', glyph: 'CE', minRole: 'ADMIN', description: 'Cégek és aktív riport környezet.' },
        { label: 'Felhasználók', page: 'users', glyph: 'FE', minRole: 'ADMIN', description: 'Hozzáférések és szerepkörök.' },
      ] },
      { title: 'Rendszer', items: [
        { label: 'Munkamenetek', page: 'sessions', glyph: 'SE', minRole: 'ADMIN', description: 'Aktív belépések és kiléptetés.' },
        { label: 'Beállítások', page: 'settings', glyph: 'BE', minRole: 'ADMIN', description: 'SMTP, backup és környezeti beállítások.' },
        { label: 'Validációs szabályok', action: 'open-validation-rules-window', glyph: 'VA', minRole: 'ADMIN', description: 'Import és főkönyvi validáció beállítása.' },
        { label: 'Licensz', page: 'license', glyph: 'LC', minRole: 'ADMIN', description: 'Licensz aktiválás és generálás.' },
      ] },
      { title: 'Üzemeltetés', items: [
        { label: 'Backup', page: 'backup', glyph: 'BK', minRole: 'ADMIN', description: 'Adatbázis biztonsági mentése.' },
        { label: 'Naplók', page: 'logs', glyph: 'NA', minRole: 'USER', description: 'Rendszer, import és validációs naplók.' },
        { label: 'Adatkarbantartás', action: 'open-data-admin-window', glyph: 'AK', minRole: 'SA', description: 'Cégadatok célzott törlése.' },
      ] },
    ],
    account: [
      { title: 'Saját fiók', items: [
        { label: 'Profil', page: 'profile', glyph: 'JC', description: 'Fiókadatok és jelszócsere.' },
        { label: 'Kilépés', action: 'logout', glyph: 'KI', description: 'Munkamenet lezárása.' },
      ] },
    ],
  };

  const permissionByPage = {
    dashboard: ['dashboard', 'view'],
    report: ['report', 'view'],
    coa: ['coa', 'view'],
    trialbalance: ['trialbalance', 'view'],
    gl: ['gl', 'view'],
    fx: ['fx', 'view'],
    budget: ['budget', 'view'],
    companies: ['companies', 'view'],
    users: ['users', 'view'],
    sessions: ['sessions', 'view'],
    backup: ['backup', 'view'],
    logs: ['logs', 'view'],
    settings: ['settings', 'view'],
    permissions: ['permissions', 'view'],
    license: ['license', 'view'],
    dataadmin: ['dataadmin', 'view'],
    profile: null,
  };

  const permissionByAction = {
    'open-coa-import-window': ['coa', 'import'],
    'open-summary-rules-window': ['coa', 'edit'],
    'open-master-data-window': ['coa', 'view'],
    'open-validation-rules-window': ['validationRules', 'view'],
    'open-data-admin-window': ['dataadmin', 'view'],
    'load-sample-data': ['settings', 'admin'],
    'export-report': ['report', 'export'],
    'export-trial-balance': ['trialbalance', 'export'],
  };

  window.MGM_CORE = {
    roleLevel,
    createInitialState,
    navModules,
    iconByGlyph,
    iconByModule,
    moduleAreaCatalog,
    permissionByPage,
    permissionByAction,
  };
})();
