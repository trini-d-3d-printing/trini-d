'use strict';

const STORAGE_KEY = 'trinid_admin_database_v1';
const QUOTE_DRAFT_KEY = 'trinid_admin_quote_draft_v2';
const BILL_DRAFT_KEY = 'trinid_admin_invoice_draft_v2';
const CLOUD_DOC_PATH = 'trinid/default';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowStamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const num = value => Number(String(value ?? '').replace(/,/g, '').trim()) || 0;
const ceilCurrency = value => {
  const n = num(value);
  if (!Number.isFinite(n) || n === 0) return 0;
  return n > 0 ? Math.ceil(n) : -Math.ceil(Math.abs(n));
};
const money = value => `Rs ${ceilCurrency(value).toLocaleString('en-LK', { maximumFractionDigits: 0 })}`;
const safe = value => String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const materialText = obj => {
  if (hasOwn(obj, 'materialType')) return String(obj.materialType ?? '').trim();
  if (hasOwn(obj, 'material')) return String(obj.material ?? '').trim();
  return 'PLA+';
};
const colorText = obj => hasOwn(obj, 'color') ? String(obj.color ?? '').trim() : 'Black';
const materialColorText = obj => [materialText(obj), colorText(obj)].filter(Boolean).join(' / ');
const id = prefix => `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.floor(Math.random() * 900 + 100)}`;
const docId = prefix => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};
const prettyDate = value => {
  const d = value ? new Date(value + 'T00:00:00') : new Date();
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: '2-digit' });
};
const round2 = value => Math.round(num(value) * 100) / 100;
const CONFIG_KEYS = ['P', 'rho', 'd_mm', 'W', 'R', 'Cp', 'H', 'F', 'Cups', 'Hups'];

// Material profile library for FDM/FFF filament pricing.
// Densities and starter prices are editable defaults, not supplier quotes.
// The selected profile owns the full Operational Base and drives every calculation.
const MATERIAL_PROFILE_SPECS = [
  ['PLA+', 1.25, 5400],
  ['PLA', 1.24, 5000],
  ['Tough PLA', 1.24, 6200],
  ['Matte PLA', 1.24, 6000],
  ['Silk PLA', 1.24, 6500],
  ['High-Speed PLA', 1.24, 6500],
  ['LW-PLA / Foaming PLA', 1.05, 8500],
  ['Wood-Filled PLA', 1.15, 7500],
  ['Metal-Filled PLA', 1.70, 11000],
  ['PLA-CF', 1.30, 9500],
  ['PLA-GF', 1.32, 9500],
  ['PETG', 1.27, 6000],
  ['High-Speed PETG', 1.27, 7000],
  ['PETG-CF', 1.30, 10000],
  ['PETG-GF', 1.35, 10000],
  ['PCTG', 1.23, 8500],
  ['CPE', 1.27, 8500],
  ['CPE+', 1.20, 9500],
  ['ABS', 1.04, 6000],
  ['ABS+', 1.05, 6500],
  ['ABS-CF', 1.10, 9500],
  ['ASA', 1.07, 7000],
  ['ASA-CF', 1.10, 10500],
  ['HIPS', 1.04, 6500],
  ['TPU 95A', 1.21, 8000],
  ['TPU 85A', 1.18, 9000],
  ['TPE', 1.15, 9000],
  ['TPC', 1.20, 10000],
  ['Nylon PA6', 1.13, 9000],
  ['Nylon PA12', 1.01, 10000],
  ['PA6-CF', 1.15, 14000],
  ['PA12-CF', 1.06, 15000],
  ['PA-GF', 1.20, 13000],
  ['Polycarbonate (PC)', 1.20, 11000],
  ['PC-ABS', 1.15, 11000],
  ['PC-CF', 1.25, 15000],
  ['Polypropylene (PP)', 0.90, 9000],
  ['Polyethylene / HDPE', 0.95, 9000],
  ['POM / Acetal', 1.41, 11000],
  ['PMMA / Acrylic', 1.18, 10000],
  ['PVA Support', 1.19, 12000],
  ['BVOH Support', 1.14, 16000],
  ['PPS', 1.35, 18000],
  ['PPS-CF', 1.50, 23000],
  ['PEI / ULTEM', 1.27, 30000],
  ['PEEK', 1.30, 45000],
  ['PEKK', 1.28, 45000],
  ['PVDF', 1.78, 22000],
  ['Custom', 1.24, 5400]
];

const MATERIAL_PROFILE_NAMES = MATERIAL_PROFILE_SPECS.map(row => row[0]);
const MATERIAL_PROFILE_SPEC_MAP = Object.fromEntries(MATERIAL_PROFILE_SPECS.map(([name, rho, P]) => [name, { rho, P }]));

function buildDefaultMaterialProfiles(baseConfig = null) {
  const base = {
    P: 7800, rho: 1.24, d_mm: 1.75, W: 120, R: 65,
    Cp: 95000, H: 5000, F: 0.05, Cups: 0, Hups: 0,
    ...(baseConfig || {})
  };
  return Object.fromEntries(MATERIAL_PROFILE_SPECS.map(([name, rho, P]) => [name, {
    ...base,
    P,
    rho,
    d_mm: base.d_mm || 1.75
  }]));
}

function normalizeMaterialProfiles(target = db) {
  if (!target || typeof target !== 'object') return target;
  const legacyConfig = { ...defaultDb().config, ...(target.config || {}) };
  const defaults = buildDefaultMaterialProfiles(legacyConfig);
  const hadProfiles = target.materialProfiles && typeof target.materialProfiles === 'object' && !Array.isArray(target.materialProfiles);
  const existing = hadProfiles ? target.materialProfiles : {};
  target.materialProfiles = Object.fromEntries(MATERIAL_PROFILE_NAMES.map(name => [name, {
    ...defaults[name],
    ...(existing[name] || {})
  }]));
  // Migration: before material profiles existed, db.config was the user's only profile.
  // Preserve it as PLA+ rather than overwriting the user's working calculator values.
  if (!hadProfiles) target.materialProfiles['PLA+'] = { ...defaults['PLA+'], ...legacyConfig };
  const selected = String(target.selectedMaterialProfile || 'PLA+');
  target.selectedMaterialProfile = target.materialProfiles[selected] ? selected : 'PLA+';
  // Keep legacy config synchronized for desktop/backward compatibility.
  target.config = { ...target.materialProfiles[target.selectedMaterialProfile] };
  return target;
}

function selectedMaterialProfileName() {
  normalizeMaterialProfiles(db);
  return db.selectedMaterialProfile || 'PLA+';
}

function activeMaterialProfile() {
  normalizeMaterialProfiles(db);
  return db.materialProfiles[selectedMaterialProfileName()];
}


const calcFingerprint = result => JSON.stringify({
  customer: (result.customer || '').trim().toLowerCase(),
  model: (result.model || '').trim().toLowerCase(),
  status: result.status || '',
  printTimeMinutes: round2(result.printTimeMinutes),
  lengthM: round2(result.lengthM),
  weightG: round2(result.weightG),
  totalCost: round2(result.totalCost),
  price: round2(result.price)
});

const quotationCalcFingerprint = result => JSON.stringify({
  model: (result.model || '').trim().toLowerCase(),
  printTimeMinutes: round2(result.printTimeMinutes),
  lengthM: round2(result.lengthM),
  weightG: round2(result.weightG),
  totalCost: round2(result.totalCost),
  price: round2(result.price)
});

let firebaseApp = null;
let firebaseAuth = null;
let firebaseStore = null;
let firebaseUser = null;
let cloudUnsubscribe = null;
let applyingRemote = false;
let cloudWriteTimer = null;
let configSaveTimer = null;
let cloudReady = false;
let db = loadDb();
let lastCalc = null;
let activeDbTable = 'items';
let selectedItemIds = new Set();

function defaultDb() {
  const config = { P: 7800, rho: 1.24, d_mm: 1.75, W: 120, R: 65, Cp: 95000, H: 5000, F: 0.05, Cups: 0, Hups: 0 };
  return {
    config,
    selectedMaterialProfile: 'PLA+',
    materialProfiles: buildDefaultMaterialProfiles(config),
    itemRecords: [],
    orders: [],
    invoices: [],
    quotes: [],
    budget: [],
    customGroups: [],
    customRecords: []
  };
}

function loadDb() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return normalizeMaterialProfiles({ ...defaultDb(), ...(data || {}) });
  } catch (e) {
    return defaultDb();
  }
}

function normalizeMaterialColorDefaults() {
  ['itemRecords','orders','invoices','quotes','customRecords'].forEach(key => {
    (db[key] || []).forEach(row => {
      if (!hasOwn(row, 'materialType') && !hasOwn(row, 'material')) row.materialType = 'PLA+';
      if (!hasOwn(row, 'color')) row.color = 'Black';
      (row.items || []).forEach(item => {
        if (!hasOwn(item, 'materialType') && !hasOwn(item, 'material')) item.materialType = 'PLA+';
        if (!hasOwn(item, 'color')) item.color = 'Black';
      });
    });
  });
}
normalizeMaterialProfiles(db);
normalizeMaterialColorDefaults();

function saveDb(options = {}) {
  normalizeMaterialProfiles(db);
  normalizeMaterialColorDefaults();
  const { render = true, cloud = true } = options;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  if (render) renderAll();
  if (cloud && firebaseUser && firebaseStore && !applyingRemote) scheduleCloudSave();
}

function firestoreSafe(value) {
  return JSON.parse(JSON.stringify(value ?? defaultDb()));
}

function setCloudStatus(message, state = '') {
  const el = $('#cloudStatus');
  if (!el) return;
  el.textContent = message;
  el.dataset.state = state;
}

const ADMIN_THEME_KEY = 'trinid-admin-theme';
function applyAdminTheme(theme) {
  const selected = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', selected);
  try { localStorage.setItem(ADMIN_THEME_KEY, selected); } catch (e) {}
  const btn = $('#adminThemeToggle');
  if (btn) {
    const isDark = selected === 'dark';
    const icon = $('.theme-icon', btn);
    const text = $('.theme-text', btn);
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    if (text) text.textContent = isDark ? 'Light' : 'Dark';
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }
}
function initAdminTheme() {
  let saved = 'dark';
  try { saved = localStorage.getItem(ADMIN_THEME_KEY) || 'dark'; } catch (e) {}
  applyAdminTheme(saved);
  $('#adminThemeToggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyAdminTheme(current === 'dark' ? 'light' : 'dark');
  });
}

function initFirebase() {
  if (!window.firebase || !window.TRINID_FIREBASE_CONFIG) {
    setCloudStatus('Cloud: Firebase SDK missing', 'error');
    return;
  }
  try {
    firebaseApp = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(window.TRINID_FIREBASE_CONFIG);
    firebaseAuth = firebase.auth();
    firebaseStore = firebase.firestore();
    firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
    firebaseAuth.onAuthStateChanged(user => {
      firebaseUser = user || null;
      if (user) {
        showApp();
        setCloudStatus(`Cloud: signed in as ${user.email || 'admin'}`, 'ok');
        startCloudSync();
      } else {
        stopCloudSync();
        showLogin();
        setCloudStatus('Cloud: signed out', '');
      }
    });
  } catch (err) {
    console.error(err);
    setCloudStatus('Cloud: setup error', 'error');
  }
}

function startCloudSync() {
  if (!firebaseStore || !firebaseUser) return;
  stopCloudSync(false);
  const ref = firebaseStore.doc(CLOUD_DOC_PATH);
  cloudUnsubscribe = ref.onSnapshot(snapshot => {
    if (!snapshot.exists) {
      setCloudStatus('Cloud: creating database...', 'syncing');
      writeCloudNow();
      return;
    }
    const cloudPayload = snapshot.data() || {};
    const remoteDb = cloudPayload.database || cloudPayload;
    applyingRemote = true;
    db = normalizeImportedAdminDb(remoteDb);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    renderAll();
    applyingRemote = false;
    cloudReady = true;
    setCloudStatus('Cloud: realtime synced', 'ok');
  }, err => {
    console.error(err);
    setCloudStatus('Cloud: sync error', 'error');
    alert(`Firebase sync error: ${err.message || err}`);
  });
}

function stopCloudSync(clearUserStatus = true) {
  if (cloudUnsubscribe) {
    cloudUnsubscribe();
    cloudUnsubscribe = null;
  }
  cloudReady = false;
  if (clearUserStatus) setCloudStatus('Cloud: disconnected', '');
}

function scheduleCloudSave() {
  setCloudStatus('Cloud: saving...', 'syncing');
  clearTimeout(cloudWriteTimer);
  cloudWriteTimer = setTimeout(writeCloudNow, 350);
}

async function writeCloudNow() {
  if (!firebaseStore || !firebaseUser || applyingRemote) return;
  try {
    // Exact replacement mode: every website save writes the whole admin database.
    // This prevents old bill/order/profit records from staying in Firebase after
    // you deleted or replaced them from the website or desktop software.
    await firebaseStore.doc(CLOUD_DOC_PATH).set({
      database: firestoreSafe(db),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: firebaseUser.email || firebaseUser.uid,
      replaceMode: true,
      schemaVersion: 5
    });
    cloudReady = true;
    setCloudStatus('Cloud: saved / replaced latest database', 'ok');
  } catch (err) {
    console.error(err);
    setCloudStatus('Cloud: save failed', 'error');
    alert(`Could not save to Firebase: ${err.message || err}`);
  }
}

function toast(message) {
  const note = document.createElement('div');
  note.textContent = message;
  note.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:9999;background:#ff9f1c;color:#0b0d10;padding:13px 16px;border-radius:999px;font-weight:900;box-shadow:0 15px 50px rgba(0,0,0,.35)';
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 2600);
}

function downloadText(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function showApp() {
  const login = $('#adminLogin');
  const shell = $('#adminShell');
  if (login) {
    login.hidden = true;
    login.style.display = 'none';
    login.setAttribute('aria-hidden', 'true');
  }
  if (shell) {
    shell.hidden = false;
    shell.style.display = '';
    shell.removeAttribute('aria-hidden');
  }
  document.body.classList.add('firebase-signed-in');
  document.body.classList.remove('firebase-signed-out');
}

function showLogin() {
  const login = $('#adminLogin');
  const shell = $('#adminShell');
  if (login) {
    login.hidden = false;
    login.style.display = '';
    login.removeAttribute('aria-hidden');
  }
  if (shell) {
    shell.hidden = true;
    shell.style.display = 'none';
    shell.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.add('firebase-signed-out');
  document.body.classList.remove('firebase-signed-in');
}

function setSection(name) {
  $$('.admin-nav-link').forEach(btn => btn.classList.toggle('active', btn.dataset.section === name));
  $$('.admin-section').forEach(section => section.classList.toggle('active', section.id === `section-${name}`));
  if (name === 'database') renderDatabaseTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initAuth() {
  showLogin();
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!firebaseAuth) return alert('Firebase is not loaded. Check your internet connection and firebase-config.js.');
    const email = $('#adminEmail').value.trim();
    const password = $('#adminPassword').value;
    try {
      setCloudStatus('Cloud: signing in...', 'syncing');
      await firebaseAuth.signInWithEmailAndPassword(email, password);
      $('#adminPassword').value = '';
      toast('Firebase admin signed in');
    } catch (err) {
      console.error(err);
      setCloudStatus('Cloud: sign-in failed', 'error');
      alert(`Firebase login failed: ${err.message || err}`);
    }
  });
  $('#logoutBtn').textContent = 'Sign Out';
  $('#logoutBtn').addEventListener('click', async () => {
    if (firebaseAuth) await firebaseAuth.signOut();
    showLogin();
    toast('Signed out');
  });
}

function initNavigation() {
  $$('.admin-nav-link').forEach(btn => btn.addEventListener('click', () => setSection(btn.dataset.section)));
  $$('[data-section-jump]').forEach(btn => btn.addEventListener('click', () => setSection(btn.dataset.sectionJump)));
}

function initDatesAndIds() {
  ['quoteDate', 'billDate', 'budgetDate'].forEach(key => { const el = $(`#${key}`); if (el) el.value = todayISO(); });
  $('#quoteNo').value = docId('QT');
  $('#invoiceNo').value = docId('INV');
}

function renderMaterialProfileSelector() {
  normalizeMaterialProfiles(db);
  const select = $('#materialProfileSelect');
  if (!select) return;
  const current = selectedMaterialProfileName();
  if (select.options.length !== MATERIAL_PROFILE_NAMES.length) {
    select.innerHTML = MATERIAL_PROFILE_NAMES.map(name => `<option value="${safe(name)}">${safe(name)}</option>`).join('');
  }
  select.value = current;
  const jobMaterial = $('#calcMaterial');
  if (jobMaterial && document.activeElement !== jobMaterial) jobMaterial.value = current;
  const label = $('#activeMaterialProfileLabel');
  if (label) label.textContent = `${current} profile`;
}

function applyCalculatorConfigToForm(force = false) {
  normalizeMaterialProfiles(db);
  renderMaterialProfileSelector();
  const profile = activeMaterialProfile();
  const defaults = buildDefaultMaterialProfiles(defaultDb().config)[selectedMaterialProfileName()] || defaultDb().config;
  CONFIG_KEYS.forEach(key => {
    const el = $(`#${key}`);
    if (!el) return;
    if (!force && document.activeElement === el) return;
    const value = (profile && profile[key] !== undefined && profile[key] !== null && profile[key] !== '') ? profile[key] : defaults[key];
    el.value = value;
  });
}

function saveCalculatorConfigFromForm(options = {}) {
  const { render = false } = options;
  normalizeMaterialProfiles(db);
  const name = selectedMaterialProfileName();
  const previous = db.materialProfiles[name] || buildDefaultMaterialProfiles(db.config)[name];
  const updated = {
    ...previous,
    ...Object.fromEntries(CONFIG_KEYS.map(key => [key, $(`#${key}`)?.value ?? '']))
  };
  db.materialProfiles[name] = updated;
  db.config = { ...updated }; // backward compatibility with desktop/older website builds
  saveDb({ render, cloud: true });
}

function scheduleCalculatorConfigSave() {
  clearTimeout(configSaveTimer);
  configSaveTimer = setTimeout(() => saveCalculatorConfigFromForm({ render: false }), 500);
}

function switchMaterialProfile(name) {
  // Save edits to the current profile before switching.
  saveCalculatorConfigFromForm({ render: false });
  normalizeMaterialProfiles(db);
  if (!db.materialProfiles[name]) return;
  db.selectedMaterialProfile = name;
  db.config = { ...db.materialProfiles[name] };
  if ($('#calcMaterial')) $('#calcMaterial').value = name === 'Custom' ? 'Custom' : name;
  lastCalc = null;
  applyCalculatorConfigToForm(true);
  saveDb({ render: false, cloud: true });
  toast(`${name} material profile selected`);
}

function resetSelectedMaterialProfile() {
  normalizeMaterialProfiles(db);
  const name = selectedMaterialProfileName();
  if (!confirm(`Reset only the ${name} material profile to its starter defaults?`)) return;
  const defaults = buildDefaultMaterialProfiles(defaultDb().config);
  db.materialProfiles[name] = { ...defaults[name] };
  db.config = { ...db.materialProfiles[name] };
  applyCalculatorConfigToForm(true);
  saveDb({ render: false, cloud: true });
  toast(`${name} profile reset`);
}

function initCalculator() {
  normalizeMaterialProfiles(db);
  renderMaterialProfileSelector();
  applyCalculatorConfigToForm(true);
  if ($('#calcMaterial')) $('#calcMaterial').value = selectedMaterialProfileName();
  const profileSelect = $('#materialProfileSelect');
  if (profileSelect) profileSelect.addEventListener('change', e => switchMaterialProfile(e.target.value));
  const resetProfileBtn = $('#resetMaterialProfileBtn');
  if (resetProfileBtn) resetProfileBtn.addEventListener('click', resetSelectedMaterialProfile);
  CONFIG_KEYS.forEach(key => {
    const el = $(`#${key}`);
    if (!el) return;
    el.addEventListener('input', scheduleCalculatorConfigSave);
    el.addEventListener('change', () => saveCalculatorConfigFromForm({ render: false }));
  });
  $('#weightField').style.display = 'none';
  $('#materialMode').addEventListener('change', () => {
    const byWeight = $('#materialMode').value === 'Weight';
    $('#lengthField').style.display = byWeight ? 'none' : '';
    $('#weightField').style.display = byWeight ? '' : 'none';
  });
  $('#calculatorForm').addEventListener('submit', e => {
    e.preventDefault();
    calculatePrice(true);
  });
  $('#resetCalcBtn').addEventListener('click', resetJob);
  $('#saveCalcBtn').addEventListener('click', saveCalculatorResultToItems);
  $('#addCalcToBillBtn').addEventListener('click', () => addCalculatorResultToLine('bill'));
  $('#addCalcToQuoteBtn').addEventListener('click', () => addCalculatorResultToLine('quote'));
}

function getPrintMinutes() {
  return (num($('#calcDays').value) * 1440) + (num($('#calcHours').value) * 60) + num($('#calcMinutes').value);
}

function calculatePrice(showMessage = false) {
  const required = ['P', 'rho', 'd_mm', 'W', 'R', 'Cp', 'H', 'F'];
  const values = {};
  for (const key of required.concat(['Cups', 'Hups'])) {
    values[key] = num($(`#${key}`).value);
  }
  if (required.some(key => !String($(`#${key}`).value).trim())) {
    alert('Please fill all required operational fields.');
    return null;
  }
  const minutes = getPrintMinutes();
  if (minutes <= 0) {
    alert('Please enter print time.');
    return null;
  }
  if (values.F >= 1) {
    alert('Failure Risk must be less than 1.');
    return null;
  }
  const mode = $('#materialMode').value;
  if (mode === 'Length' && !String($('#lengthM').value).trim()) {
    alert('Please enter filament length.');
    return null;
  }
  if (mode === 'Weight' && !String($('#weightG').value).trim()) {
    alert('Please enter filament weight.');
    return null;
  }

  const T = minutes * 60;
  const d = values.d_mm / 10;
  const crossArea = Math.PI * (d ** 2) / 4;
  let lengthM = 0;
  let weightG = 0;
  if (mode === 'Length') {
    lengthM = num($('#lengthM').value);
    weightG = crossArea * (lengthM * 100) * values.rho;
  } else {
    weightG = num($('#weightG').value);
    const lengthCm = crossArea * values.rho > 0 ? weightG / (crossArea * values.rho) : 0;
    lengthM = lengthCm / 100;
  }
  const rawFilamentCost = weightG * (values.P / 1000);
  const rawElectricityCost = (values.W * T / 3600000) * values.R;
  const rawMachineDepreciation = (values.Cp / values.H) * (T / 3600);
  const rawUpsCost = values.Hups > 0 ? (values.Cups / values.Hups) * (T / 3600) : 0;
  const rawTotalCost = (rawFilamentCost + rawElectricityCost + rawMachineDepreciation + rawUpsCost) / (1 - values.F);
  const marginRate = num($('#margin').value) / 100;
  const rawFinalPrice = rawTotalCost * (1 + marginRate);
  const filamentCost = ceilCurrency(rawFilamentCost);
  const electricityCost = ceilCurrency(rawElectricityCost);
  const machineDepreciation = ceilCurrency(rawMachineDepreciation);
  const upsCost = ceilCurrency(rawUpsCost);
  const totalCost = ceilCurrency(rawTotalCost);
  const finalPrice = ceilCurrency(rawFinalPrice);

  saveCalculatorConfigFromForm({ render: false });

  lastCalc = {
    id: id('ITEM'),
    createdAt: nowStamp(),
    customer: $('#calcCustomer').value.trim(),
    model: $('#calcModel').value.trim() || '3D Printed Item',
    materialType: selectedMaterialProfileName(),
    color: $('#calcColor') ? $('#calcColor').value.trim() : 'Black',
    status: $('#calcStatus').value,
    printTimeMinutes: minutes,
    lengthM,
    weightG,
    electricityCost,
    filamentCost,
    machineDepreciation,
    upsCost,
    totalCost,
    price: finalPrice,
    profit: finalPrice - totalCost,
    margin: num($('#margin').value)
  };
  $('#outLength').textContent = `${lengthM.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
  $('#outWeight').textContent = `${weightG.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`;
  $('#outElectricity').textContent = money(electricityCost);
  $('#outFilament').textContent = money(filamentCost);
  $('#outDepreciation').textContent = money(machineDepreciation);
  $('#outTotalCost').textContent = money(totalCost);
  $('#outFinalPrice').textContent = money(finalPrice);
  if (showMessage) toast('Price calculated');
  return lastCalc;
}

function resetJob() {
  ['calcCustomer', 'calcModel', 'calcDays', 'calcHours', 'calcMinutes', 'lengthM', 'weightG', 'margin'].forEach(idName => { const el = $(`#${idName}`); if (el) el.value = idName === 'margin' ? '0' : ''; });
  if ($('#calcMaterial')) $('#calcMaterial').value = selectedMaterialProfileName();
  if ($('#calcColor')) $('#calcColor').value = 'Black';
  $('#calcDays').value = '0'; $('#calcHours').value = '0'; $('#calcMinutes').value = '0';
  lastCalc = null;
  ['outLength', 'outWeight'].forEach(key => $(`#${key}`).textContent = key === 'outLength' ? '0.00 m' : '0.00 g');
  ['outElectricity', 'outFilament', 'outDepreciation', 'outTotalCost', 'outFinalPrice'].forEach(key => $(`#${key}`).textContent = 'Rs 0');
}

function saveCalculatorResultToItems() {
  const result = lastCalc || calculatePrice(false);
  if (!result) return;
  const fingerprint = calcFingerprint(result);
  const duplicate = db.itemRecords.find(r => r.calcFingerprint === fingerprint || (
    String(r.customer || '').trim().toLowerCase() === String(result.customer || '').trim().toLowerCase() &&
    String(r.model || '').trim().toLowerCase() === String(result.model || '').trim().toLowerCase() &&
    round2(r.printTimeMinutes) === round2(result.printTimeMinutes) &&
    round2(r.weightG) === round2(result.weightG) &&
    round2(r.totalCost) === round2(result.totalCost) &&
    round2(r.price) === round2(result.price)
  ));
  if (duplicate) {
    toast('This calculator result is already saved. Duplicate record was not added.');
    return duplicate;
  }
  const record = { ...result, id: id('ITEM'), calcFingerprint: fingerprint, createdAt: nowStamp(), datePrinted: todayISO(), orderId: '', notes: 'Saved from calculator' };
  if (record.status === 'Failed') {
    record.price = 0;
    record.profit = -record.totalCost;
  }
  db.itemRecords.unshift(record);
  saveDb();
  toast('Calculator result saved to Item Details');
  return record;
}

function addCalculatorResultToLine(type) {
  const result = lastCalc || calculatePrice(false);
  if (!result) return;
  const calcKey = quotationCalcFingerprint(result);
  if (type === 'quote') {
    const alreadyUsed = $$('#quoteItemsBody tr').some(tr => tr.dataset.calcKey === calcKey);
    if (alreadyUsed) {
      toast('The item already use in quatation');
      return;
    }
    addQuoteRow({
      model: result.model,
      materialType: hasOwn(result, 'materialType') ? result.materialType : 'PLA+',
      color: hasOwn(result, 'color') ? result.color : 'Black',
      qty: 1,
      unit: result.price,
      weight: `${result.weightG.toFixed(2)} g`,
      printTime: minutesLabel(result.printTimeMinutes),
      calcKey,
      totalCost: result.totalCost,
      electricityCost: result.electricityCost,
      filamentCost: result.filamentCost,
      machineDepreciation: result.machineDepreciation,
      profit: result.price - result.totalCost
    });
    saveQuoteDraft();
  }
  if (type === 'bill') {
    addBillRow({ model: result.model, materialType: hasOwn(result, 'materialType') ? result.materialType : 'PLA+', color: hasOwn(result, 'color') ? result.color : 'Black', qty: 1, unit: result.price, discount: 0, cost: result.totalCost });
    saveBillDraft();
  }
  toast(`Calculator result added to ${type === 'bill' ? 'Bill' : 'Quotation'}`);
}

function minutesLabel(minutes) {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = Math.round(minutes % 60);
  return [d ? `${d}d` : '', h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ') || '0m';
}

function lineInput(value, cls = '', type = 'text') {
  const inputType = type === 'number' ? 'text' : type;
  const stepAttr = type === 'number' ? ' inputmode="decimal"' : '';
  return `<input class="${cls}" type="${inputType}"${stepAttr} value="${safe(value ?? '')}">`;
}

function addBillRow(data = {}) {
  const tr = document.createElement('tr');
  tr.dataset.calcKey = data.calcKey || '';
  tr.innerHTML = `
    <td>${lineInput(data.model || '', 'model-input')}</td>
    <td>${lineInput(materialText(data), 'material-input')}</td>
    <td>${lineInput(colorText(data), 'color-input')}</td>
    <td>${lineInput(data.qty || 1, 'qty-input', 'number')}</td>
    <td>${lineInput(data.unitPrice ?? data.unit ?? '', 'unit-input', 'number')}</td>
    <td>${lineInput(data.discount || 0, 'discount-input', 'number')}</td>
    <td>${lineInput(data.cost || 0, 'cost-input', 'number')}</td>
    <td>${lineInput(data.layer || '0.2', 'layer-input')}</td>
    <td><select class="walls-input"><option></option>${['1','2','3','4','5','6','Custom'].map(v => `<option${data.walls == v ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
    <td>${lineInput(data.infill || '', 'infill-input')}</td>
    <td><button class="row-delete" type="button">×</button></td>`;
  $('#billItemsBody').appendChild(tr);
  recalcBill();
}

function addQuoteRow(data = {}) {
  const tr = document.createElement('tr');
  tr.dataset.calcKey = data.calcKey || '';
  tr.dataset.totalCost = data.totalCost ? ceilCurrency(data.totalCost) : '';
  tr.dataset.electricityCost = data.electricityCost ? ceilCurrency(data.electricityCost) : '';
  tr.dataset.filamentCost = data.filamentCost ? ceilCurrency(data.filamentCost) : '';
  tr.dataset.machineDepreciation = data.machineDepreciation ? ceilCurrency(data.machineDepreciation) : '';
  tr.dataset.profit = data.profit ? ceilCurrency(data.profit) : '';
  tr.innerHTML = `
    <td>${lineInput(data.model || '', 'model-input')}</td>
    <td>${lineInput(materialText(data), 'material-input')}</td>
    <td>${lineInput(colorText(data), 'color-input')}</td>
    <td>${lineInput(data.qty || 1, 'qty-input', 'number')}</td>
    <td>${lineInput(data.unitPrice ?? data.unit ?? '', 'unit-input', 'number')}</td>
    <td>${lineInput(data.layer || '0.2', 'layer-input')}</td>
    <td><select class="walls-input">${['1','2','3','4','5','6','Custom'].map(v => `<option${data.walls == v ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
    <td>${lineInput(data.infill || '', 'infill-input')}</td>
    <td>${lineInput(data.weight || '', 'weight-input')}</td>
    <td>${lineInput(data.printTime || '', 'time-input')}</td>
    <td><button class="row-delete" type="button">×</button></td>`;
  $('#quoteItemsBody').appendChild(tr);
  recalcQuote();
}

function collectBillItems() {
  return $$('#billItemsBody tr').map(tr => ({
    model: $('.model-input', tr).value.trim(),
    materialType: $('.material-input', tr) ? $('.material-input', tr).value.trim() : 'PLA+',
    color: $('.color-input', tr) ? $('.color-input', tr).value.trim() : 'Black',
    qty: num($('.qty-input', tr).value) || 1,
    unitPrice: ceilCurrency($('.unit-input', tr).value),
    discount: ceilCurrency($('.discount-input', tr).value),
    cost: ceilCurrency($('.cost-input', tr).value),
    layer: $('.layer-input', tr).value.trim(),
    walls: $('.walls-input', tr).value.trim(),
    infill: $('.infill-input', tr).value.trim(),
    calcKey: tr.dataset.calcKey || ''
  })).filter(item => item.model);
}

function collectQuoteItems() {
  return $$('#quoteItemsBody tr').map(tr => ({
    model: $('.model-input', tr).value.trim(),
    materialType: $('.material-input', tr) ? $('.material-input', tr).value.trim() : 'PLA+',
    color: $('.color-input', tr) ? $('.color-input', tr).value.trim() : 'Black',
    qty: num($('.qty-input', tr).value) || 1,
    unitPrice: ceilCurrency($('.unit-input', tr).value),
    layer: $('.layer-input', tr).value.trim(),
    walls: $('.walls-input', tr).value.trim(),
    infill: $('.infill-input', tr).value.trim(),
    weight: $('.weight-input', tr).value.trim(),
    printTime: $('.time-input', tr).value.trim(),
    calcKey: tr.dataset.calcKey || '',
    totalCost: ceilCurrency(tr.dataset.totalCost),
    electricityCost: ceilCurrency(tr.dataset.electricityCost),
    filamentCost: ceilCurrency(tr.dataset.filamentCost),
    machineDepreciation: ceilCurrency(tr.dataset.machineDepreciation),
    profit: ceilCurrency(tr.dataset.profit)
  })).filter(item => item.model);
}

function billTotals(items = collectBillItems()) {
  const subtotal = ceilCurrency(items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0));
  const discount = ceilCurrency(items.reduce((sum, item) => sum + item.discount, 0));
  const cost = ceilCurrency(items.reduce((sum, item) => sum + item.cost, 0));
  const total = ceilCurrency(Math.max(0, subtotal - discount));
  const advance = ceilCurrency($('#billAdvance').value);
  return { subtotal, discount, total, advance, balance: ceilCurrency(Math.max(0, total - advance)), cost, profit: ceilCurrency(total - cost) };
}


function parseWeightG(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return 0;
  const match = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  const n = match ? Number(match[0]) : 0;
  if (!n) return 0;
  if (text.includes('kg')) return n * 1000;
  return n;
}

function parsePrintTimeMinutes(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return 0;
  let total = 0;
  const day = text.match(/([0-9.]+)\s*d/);
  const hour = text.match(/([0-9.]+)\s*h/);
  const min = text.match(/([0-9.]+)\s*m/);
  if (day) total += num(day[1]) * 1440;
  if (hour) total += num(hour[1]) * 60;
  if (min) total += num(min[1]);
  if (!total && /^\d+(\.\d+)?$/.test(text)) total = num(text);
  return total;
}

function quoteTotals(items = collectQuoteItems()) {
  const total = ceilCurrency(items.reduce((sum, item) => sum + ((num(item.qty) || 1) * ceilCurrency(item.unitPrice)), 0));
  const weightG = items.reduce((sum, item) => sum + ((num(item.qty) || 1) * parseWeightG(item.weight)), 0);
  const printMinutes = items.reduce((sum, item) => sum + ((num(item.qty) || 1) * parsePrintTimeMinutes(item.printTime)), 0);
  return { total, weightG, printMinutes };
}

function readDraft(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || null; } catch (e) { return null; }
}

function writeDraft(key, payload) {
  try { localStorage.setItem(key, JSON.stringify(payload)); } catch (e) {}
}

function saveQuoteDraft() {
  writeDraft(QUOTE_DRAFT_KEY, {
    customer: $('#quoteCustomer')?.value || '',
    quoteNo: $('#quoteNo')?.value || docId('QT'),
    date: $('#quoteDate')?.value || todayISO(),
    notes: $('#quoteNotes')?.value || '',
    items: collectQuoteItems()
  });
}

function saveBillDraft() {
  writeDraft(BILL_DRAFT_KEY, {
    customer: $('#billCustomer')?.value || '',
    invoiceNo: $('#invoiceNo')?.value || docId('INV'),
    date: $('#billDate')?.value || todayISO(),
    paidStatus: $('#billPaidStatus')?.value || 'Unpaid',
    paidMethod: $('#billPaidMethod')?.value || '',
    advance: $('#billAdvance')?.value || '0',
    notes: $('#billNotes')?.value || '',
    items: collectBillItems()
  });
}

function restoreQuoteDraft() {
  const draft = readDraft(QUOTE_DRAFT_KEY);
  $('#quoteItemsBody').innerHTML = '';
  if (draft) {
    $('#quoteCustomer').value = draft.customer || '';
    $('#quoteNo').value = draft.quoteNo || $('#quoteNo').value || docId('QT');
    $('#quoteDate').value = draft.date || todayISO();
    $('#quoteNotes').value = draft.notes || '';
    (draft.items && draft.items.length ? draft.items : [{}]).forEach(item => addQuoteRow(item));
  } else {
    addQuoteRow();
  }
  recalcQuote();
}

function restoreBillDraft() {
  const draft = readDraft(BILL_DRAFT_KEY);
  $('#billItemsBody').innerHTML = '';
  if (draft) {
    $('#billCustomer').value = draft.customer || '';
    $('#invoiceNo').value = draft.invoiceNo || $('#invoiceNo').value || docId('INV');
    $('#billDate').value = draft.date || todayISO();
    $('#billPaidStatus').value = draft.paidStatus || 'Unpaid';
    $('#billPaidMethod').value = draft.paidMethod || '';
    $('#billAdvance').value = draft.advance || '0';
    $('#billNotes').value = draft.notes || '';
    (draft.items && draft.items.length ? draft.items : [{}]).forEach(item => addBillRow(item));
  } else {
    addBillRow();
  }
  recalcBill();
}

function resetQuotationDraft() {
  localStorage.removeItem(QUOTE_DRAFT_KEY);
  $('#quoteCustomer').value = '';
  $('#quoteNo').value = docId('QT');
  $('#quoteDate').value = todayISO();
  $('#quoteNotes').value = '';
  $('#quoteItemsBody').innerHTML = '';
  addQuoteRow();
  saveQuoteDraft();
  toast('Quotation reset');
}

function resetBillDraft() {
  localStorage.removeItem(BILL_DRAFT_KEY);
  $('#billCustomer').value = '';
  $('#invoiceNo').value = docId('INV');
  $('#billDate').value = todayISO();
  $('#billPaidStatus').value = 'Unpaid';
  $('#billPaidMethod').value = '';
  $('#billAdvance').value = '0';
  $('#billNotes').value = '';
  $('#billItemsBody').innerHTML = '';
  addBillRow();
  saveBillDraft();
  toast('Invoice reset');
}

function recalcBill() {
  const totals = billTotals();
  $('#billSubtotal').textContent = money(totals.subtotal);
  $('#billDiscount').textContent = money(totals.discount);
  $('#billGrandTotal').textContent = money(totals.total);
  $('#billBalance').textContent = money(totals.balance);
}

function recalcQuote() {
  const totals = quoteTotals();
  $('#quoteGrandTotal').textContent = money(totals.total);
  const weightEl = $('#quoteTotalWeight');
  const timeEl = $('#quoteTotalTime');
  if (weightEl) weightEl.textContent = `${totals.weightG.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`;
  if (timeEl) timeEl.textContent = minutesLabel(totals.printMinutes);
}

function initBillQuote() {
  restoreBillDraft();
  restoreQuoteDraft();
  $('#addBillRowBtn').addEventListener('click', () => { addBillRow(); saveBillDraft(); });
  $('#addQuoteRowBtn').addEventListener('click', () => { addQuoteRow(); saveQuoteDraft(); });
  $('#addCalcBillBtn').addEventListener('click', () => addCalculatorResultToLine('bill'));
  $('#addCalcQuoteBtn').addEventListener('click', () => addCalculatorResultToLine('quote'));
  $('#resetQuoteBtn')?.addEventListener('click', resetQuotationDraft);
  $('#resetBillBtn')?.addEventListener('click', resetBillDraft);
  ['quoteCustomer', 'quoteNo', 'quoteDate', 'quoteNotes'].forEach(key => $(`#${key}`)?.addEventListener('input', saveQuoteDraft));
  ['billCustomer', 'invoiceNo', 'billDate', 'billPaidStatus', 'billPaidMethod', 'billAdvance', 'billNotes'].forEach(key => $(`#${key}`)?.addEventListener('input', saveBillDraft));
  $('#billItemsBody').addEventListener('input', () => { recalcBill(); saveBillDraft(); });
  $('#billItemsBody').addEventListener('change', () => { recalcBill(); saveBillDraft(); });
  $('#quoteItemsBody').addEventListener('input', () => { recalcQuote(); saveQuoteDraft(); });
  $('#quoteItemsBody').addEventListener('change', () => { recalcQuote(); saveQuoteDraft(); });
  $('#billAdvance').addEventListener('input', () => { recalcBill(); saveBillDraft(); });
  document.addEventListener('click', e => {
    if (e.target.classList.contains('row-delete')) {
      const wasBill = !!e.target.closest('#billItemsBody');
      const wasQuote = !!e.target.closest('#quoteItemsBody');
      e.target.closest('tr').remove();
      if (wasBill && !$('#billItemsBody tr')) addBillRow();
      if (wasQuote && !$('#quoteItemsBody tr')) addQuoteRow();
      recalcBill();
      recalcQuote();
      if (wasBill) saveBillDraft();
      if (wasQuote) saveQuoteDraft();
    }
  });
  $('#quoteCustomerPdfBtn')?.addEventListener('click', printCustomerQuotationOnly);
  $('#quoteInternalPdfBtn')?.addEventListener('click', printInternalQuotationOnly);
  $('#billAdminForm').addEventListener('submit', generateInvoice);
  $('#quoteAdminForm').addEventListener('submit', generateQuotation);
}

function generateInvoice(e) {
  e.preventDefault();
  const items = collectBillItems();
  if (!items.length) return alert('Please add at least one invoice item.');
  const totals = billTotals(items);
  const data = {
    type: 'INVOICE',
    no: $('#invoiceNo').value,
    date: $('#billDate').value || todayISO(),
    customer: $('#billCustomer').value.trim(),
    notes: $('#billNotes').value.trim(),
    items,
    totals,
    paidStatus: $('#billPaidStatus').value,
    paidMethod: $('#billPaidMethod').value.trim()
  };
  printDocument(data);
  saveBillDraft();
  const invoiceRecord = {
    id: id('INVOICE'), createdAt: nowStamp(), invoiceNo: data.no, orderId: data.no, customer: data.customer,
    date: data.date, subtotal: totals.subtotal, discount: totals.discount, total: totals.total,
    advancePayment: totals.advance, balance: totals.balance, paidStatus: data.paidStatus, paidMethod: data.paidMethod,
    totalCost: totals.cost, profit: totals.profit, items, notes: data.notes, documentData: data
  };
  // Bills / Invoices are saved only in the Bills / Invoices database.
  // They do not create Orders, Costs, Profit, Income, or Budget records.
  // Orders are created only from selected Item Details records.
  db.invoices.unshift(invoiceRecord);
  saveDb();
  $('#invoiceNo').value = docId('INV');
  saveBillDraft();
  toast('Invoice saved to Bills / Invoices database only');
}

function buildQuotationDataFromForm() {
  const items = collectQuoteItems();
  if (!items.length) {
    alert('Please add at least one quotation item.');
    return null;
  }
  const totals = quoteTotals(items);
  return {
    type: 'QUOTATION',
    no: $('#quoteNo').value,
    date: $('#quoteDate').value || todayISO(),
    customer: $('#quoteCustomer').value.trim(),
    notes: $('#quoteNotes').value.trim(),
    items,
    totals
  };
}

function saveQuotationRecord(data) {
  if (!data) return;
  db.quotes.unshift({
    id: id('QUOTE'),
    createdAt: nowStamp(),
    quoteNo: data.no,
    customer: data.customer,
    date: data.date,
    total: data.totals.total,
    totalWeightG: data.totals.weightG,
    totalPrintMinutes: data.totals.printMinutes,
    items: data.items,
    notes: data.notes,
    documentData: data
  });
  saveDb();
  $('#quoteNo').value = docId('QT');
  saveQuoteDraft();
}

function printCustomerQuotationOnly() {
  const data = buildQuotationDataFromForm();
  if (!data) return;
  printDocument(data);
  toast('Customer quotation PDF opened.');
}

function printInternalQuotationOnly() {
  const data = buildQuotationDataFromForm();
  if (!data) return;
  printInternalQuotationDocument(data);
  toast('Internal quotation PDF opened.');
}

function generateQuotation(e) {
  e.preventDefault();
  const data = buildQuotationDataFromForm();
  if (!data) return;
  printDocument(data);
  printInternalQuotationDocument(data);
  saveQuotationRecord(data);
  toast('Quotation saved. Customer and internal PDFs opened.');
}



function printInternalQuotationDocument(data) {
  const formatNumber = v => Number(v || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatMoneyDot = v => `Rs. ${ceilCurrency(v).toLocaleString('en-LK', { maximumFractionDigits: 0 })}`;
  const percentText = v => Number.isFinite(Number(v)) ? `${formatNumber(v)}%` : '0.00%';
  const itemWeightG = item => parseWeightG(item.weight || item.weightG || item.filamentWeightG || '');
  const itemPrintMinutes = item => parsePrintTimeMinutes(item.printTime || item.print_time || item.printTimeText || '');
  const itemMargin = item => {
    const unitPrice = num(item.unitPrice ?? item.unit);
    const unitCost = num(item.totalCost || item.cost);
    if (!unitCost) return 0;
    return ((unitPrice - unitCost) / unitCost) * 100;
  };

  const items = (data.items || []).map(item => {
    const qty = num(item.qty) || 1;
    const unitPrice = num(item.unitPrice ?? item.unit);
    const unitElectricity = num(item.electricityCost);
    const unitFilament = num(item.filamentCost);
    const unitMachine = num(item.machineDepreciation);
    const explicitUnitCost = num(item.totalCost || item.cost);
    const unitCost = explicitUnitCost || (unitElectricity + unitFilament + unitMachine);
    const linePrice = qty * unitPrice;
    const lineCost = qty * unitCost;
    const lineElectricity = qty * unitElectricity;
    const lineFilament = qty * unitFilament;
    const lineMachine = qty * unitMachine;
    const weightG = itemWeightG(item) * qty;
    const printMinutes = itemPrintMinutes(item) * qty;
    return {
      ...item,
      qty,
      unitPrice,
      unitElectricity,
      unitFilament,
      unitMachine,
      unitCost,
      linePrice,
      lineCost,
      lineElectricity,
      lineFilament,
      lineMachine,
      lineProfit: linePrice - lineCost,
      profitMargin: itemMargin(item),
      weightG,
      printMinutes
    };
  });

  const totals = items.reduce((acc, item) => {
    acc.price += item.linePrice;
    acc.cost += item.lineCost;
    acc.electricity += item.lineElectricity;
    acc.filament += item.lineFilament;
    acc.machine += item.lineMachine;
    acc.profit += item.lineProfit;
    acc.weightG += item.weightG;
    acc.printMinutes += item.printMinutes;
    return acc;
  }, { price: 0, cost: 0, electricity: 0, filament: 0, machine: 0, profit: 0, weightG: 0, printMinutes: 0 });

  const customerRows = items.map((item, index) => {
    const lineTotal = item.qty * item.unitPrice;
    const layer = item.layer ? `${safe(item.layer)}${String(item.layer).toLowerCase().includes('mm') ? '' : ' mm'}` : '';
    const infill = item.infill ? `${safe(item.infill)}${String(item.infill).includes('%') ? '' : '%'}` : '';
    return `<tr>
      <td>${index + 1}</td>
      <td>${safe(item.model || '')}${materialColorText(item) ? `<br><small>${safe(materialColorText(item))}</small>` : ''}</td>
      <td>${item.qty}</td>
      <td>${formatMoneyDot(item.unitPrice)}</td>
      <td>${layer}</td>
      <td>${safe(item.walls || '')}</td>
      <td>${infill}</td>
      <td>${formatMoneyDot(lineTotal)}</td>
    </tr>`;
  }).join('');

  const internalRows = items.map((item, index) => `<tr>
      <td>${index + 1}</td>
      <td>${safe(item.model || '')}${materialColorText(item) ? `<br><small>${safe(materialColorText(item))}</small>` : ''}</td>
      <td>${safe(item.printTime || minutesLabel(item.printMinutes))}</td>
      <td>${safe(item.weight || (item.weightG ? `${formatNumber(item.weightG)} g` : ''))}</td>
      <td>${formatMoneyDot(item.lineElectricity)}</td>
      <td>${formatMoneyDot(item.lineFilament)}</td>
      <td>${formatMoneyDot(item.lineMachine)}</td>
      <td>${formatMoneyDot(item.lineCost)}</td>
      <td>${formatMoneyDot(item.lineProfit)}</td>
      <td>${percentText(item.profitMargin)}</td>
    </tr>`).join('');

  const html = `<!doctype html><html><head><base href="${location.href}"><title>Internal_Quote_${safe(data.no)}.pdf</title><style>
    @page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.print-btn{position:fixed;right:12px;top:12px;z-index:10;border:0;border-radius:999px;background:#d4af37;color:#111;font-weight:900;padding:10px 16px;cursor:pointer}@media print{.print-btn{display:none}}.head{border-bottom:3px solid #d4af37;background:#111;color:#fff;padding:14px 16px;margin-bottom:12px}.brand{display:flex;align-items:center;gap:12px}.brand img{width:50px;height:50px;object-fit:contain}.title{margin-left:auto;text-align:right}.title h1{margin:0;color:#d4af37;font-size:22px}.title p{margin:4px 0 0;font-size:12px}.warning{background:#fff3cd;border:1px solid #d4af37;padding:8px 11px;font-weight:700;margin:8px 0 12px}.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px}.meta div{background:#f2f2f2;padding:8px 10px;border-radius:6px}.meta b{display:block;font-size:10px;color:#555;text-transform:uppercase}.meta span{font-size:13px;font-weight:700}.section-title{font-size:13px;font-weight:900;color:#111;border-left:5px solid #d4af37;padding-left:8px;margin:14px 0 8px}table{width:100%;border-collapse:collapse;font-size:9.3px;page-break-inside:auto}th{background:#111;color:#d4af37;text-align:left;padding:6px 5px;border:1px solid #333}td{padding:5px;border:1px solid #ccc;vertical-align:top}tr:nth-child(even) td{background:#f7f7f7}.text-right{text-align:right}.summary{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;page-break-inside:avoid}.summary div{display:flex;justify-content:space-between;background:#f2f2f2;padding:8px 10px;border-radius:4px;font-size:11px}.summary .final{background:#d4af37;font-weight:900}.notes{margin-top:12px;font-size:10.5px;color:#333}.footer-note{margin-top:10px;font-size:10px;color:#777;font-weight:700}.page-break{page-break-inside:avoid}</style></head><body><button class="print-btn" onclick="window.print()">Print / Save Internal PDF</button><section class="head"><div class="brand"><img src="../assets/logo.png" alt="Trini-D"><div><strong>TRINI-D 3D Printing</strong><br><small>Internal quotation copy</small></div><div class="title"><h1>INTERNAL QUOTATION</h1><p># ${safe(data.no)}</p></div></div></section><div class="warning">INTERNAL COPY ONLY — Do not send this PDF to the customer.</div><section class="meta"><div><b>Customer</b><span>${safe(data.customer || 'Customer')}</span></div><div><b>Date</b><span>${safe(prettyDate(data.date))}</span></div><div><b>Quote No</b><span>${safe(data.no)}</span></div></section><div class="section-title">Customer Quotation Details</div><table><thead><tr><th>#</th><th>Model / Description</th><th>Qty</th><th>Unit Price</th><th>Layer</th><th>Walls</th><th>Infill</th><th>Total</th></tr></thead><tbody>${customerRows}</tbody></table><div class="section-title">Internal Cost & Profit Details</div><table><thead><tr><th>#</th><th>Model</th><th>Part Time</th><th>Part Weight</th><th>Electricity Cost</th><th>Filament Cost</th><th>Machine Cost</th><th>Total Cost</th><th>Profit</th><th>Profit Margin</th></tr></thead><tbody>${internalRows}</tbody></table><section class="summary page-break"><div><span>Total Weight</span><b>${formatNumber(totals.weightG)} g</b></div><div><span>Total Time</span><b>${minutesLabel(totals.printMinutes)}</b></div><div><span>Total Electricity Cost</span><b>${formatMoneyDot(totals.electricity)}</b></div><div><span>Total Filament Cost</span><b>${formatMoneyDot(totals.filament)}</b></div><div><span>Total Machine Cost</span><b>${formatMoneyDot(totals.machine)}</b></div><div><span>Total Cost</span><b>${formatMoneyDot(totals.cost)}</b></div><div><span>Customer Quotation Total</span><b>${formatMoneyDot(totals.price)}</b></div><div class="final"><span>Total Profit</span><b>${formatMoneyDot(totals.profit)}</b></div></section>${data.notes ? `<section class="notes"><b>Notes:</b><br>${safe(data.notes).split('\n').join('<br>')}</section>` : ''}<div class="footer-note">This internal PDF includes cost, time, weight, and profit details for business use only.</div><script>window.onload = () => setTimeout(() => window.print(), 500);</script></body></html>`;
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

function printDocument(data) {
  const isInvoice = data.type === 'INVOICE';
  const docWord = isInvoice ? 'INVOICE' : 'QUOTATION';
  const docNoLabel = isInvoice ? 'INVOICE NO.' : 'QUOTE NO.';
  const partyLabel = isInvoice ? 'BILL TO' : 'QUOTE FOR';
  const totalLabel = isInvoice ? 'TOTAL' : 'TOTAL QUOTE';
  const dateText = prettyDate(data.date);
  const filePrefix = isInvoice ? 'Invoice' : 'Quote';
  const thanks = isInvoice ? 'Thank you for your business!' : 'Thank you for choosing Trini-D!';
  const formatNumber = v => Number(v || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatMoneyDot = v => `Rs. ${ceilCurrency(v).toLocaleString('en-LK', { maximumFractionDigits: 0 })}`;
  const normalizedLayer = item => item.layer ? `${safe(item.layer)}${String(item.layer).toLowerCase().includes('mm') ? '' : ' mm'}` : '';
  const normalizedInfill = item => item.infill ? `${safe(item.infill)}${String(item.infill).includes('%') ? '' : '%'}` : '';
  const preparedItems = (data.items || []).map(item => ({
    ...item,
    qty: Number(item.qty || 1) || 1,
    unitPrice: ceilCurrency(item.unitPrice ?? item.unit ?? 0),
    discount: ceilCurrency(item.discount || 0),
    materialType: safe(materialText(item)),
    color: safe(colorText(item)),
    layer: normalizedLayer(item),
    walls: safe(item.walls || ''),
    infill: normalizedInfill(item),
    weight: item.weight || '',
    printTime: item.printTime || item.print_time || ''
  }));
  const hasInvoiceDiscount = isInvoice && preparedItems.some(item => item.discount > 0);

  const quoteHeaders = `<div class="th c-model">MODEL / DESCRIPTION</div><div class="th c-qty">Quantity</div><div class="th c-unit">UNIT PRICE</div><div class="th c-layer">LAYER</div><div class="th c-walls">WALLS</div><div class="th c-infill">INFILL</div><div class="th c-total">TOTAL</div>`;
  const invoiceHeaders = hasInvoiceDiscount
    ? `<div class="th i-model-disc">MODEL / DESCRIPTION</div><div class="th i-qty-disc">Quantity</div><div class="th i-unit-disc">UNIT PRICE</div><div class="th i-discount-disc">DISCOUNT</div><div class="th i-total-disc">TOTAL</div>`
    : `<div class="th i-model">MODEL / DESCRIPTION</div><div class="th i-qty">Quantity</div><div class="th i-unit">UNIT PRICE</div><div class="th i-total">TOTAL</div>`;

  function rowInfo(item, index) {
    const lineTotal = isInvoice ? Math.max(0, (item.qty * item.unitPrice) - item.discount) : (item.qty * item.unitPrice);
    const rowClass = index % 2 === 0 ? 'row-light' : 'row-white';
    if (!isInvoice) {
      const weight = item.weight || '';
      const printTime = item.printTime || '';
      const matColor = [item.materialType, item.color].filter(Boolean).join(' / ');
      const extra = weight || printTime || matColor ? 16 : 0;
      return {
        height: 22 + extra,
        html: top => {
          const subParts = []; if (matColor) subParts.push(`Material: ${safe(matColor)}`); if (weight) subParts.push(`⚖ ${safe(weight)}`); if (printTime) subParts.push(`⏱ ${safe(printTime)}`);
          const sub = subParts.length ? `<div class="quote-sub" style="top:22pt">${subParts.join('   |   ')}</div>` : '';
          return `<div class="doc-row quote-row ${rowClass}" style="top:${top}pt;height:${22 + extra}pt"><div class="td q-model">${safe(item.model).slice(0, 30)}</div><div class="td q-qty">${item.qty}</div><div class="td q-unit">${formatMoneyDot(item.unitPrice)}</div><div class="td q-layer">${item.layer}</div><div class="td q-walls">${item.walls}</div><div class="td q-infill">${item.infill}</div><div class="td q-total">${formatMoneyDot(lineTotal)}</div>${sub}</div>`;
        }
      };
    }
    const hasSpecs = item.layer || item.walls || item.infill;
    const rowHeight = 22 + (hasSpecs ? 14 : 0);
    const specParts = [];
    if (item.materialType || item.color) specParts.push(`Material: ${[item.materialType, item.color].filter(Boolean).join(' / ')}`);
    if (item.layer) specParts.push(`Layer: ${item.layer}`);
    if (item.walls) specParts.push(`Walls: ${item.walls}`);
    if (item.infill) specParts.push(`Infill: ${item.infill}`);
    return {
      height: rowHeight,
      html: top => {
        const specs = specParts.length ? `<span class="spec-tag">${safe(specParts.join('   ·   '))}</span>` : '';
        return hasInvoiceDiscount
          ? `<div class="doc-row inv-row ${rowClass}" style="top:${top}pt;height:${rowHeight}pt"><div class="td id-model-disc">${safe(item.model).slice(0, 44)}</div><div class="td id-qty-disc">${item.qty}</div><div class="td id-unit-disc">${formatMoneyDot(item.unitPrice)}</div><div class="td id-discount-disc">${item.discount > 0 ? `- ${formatMoneyDot(item.discount)}` : '-'}</div><div class="td id-total-disc">${formatMoneyDot(lineTotal)}</div>${specs ? `<div class="spec-line">${specs}</div>` : ''}</div>`
          : `<div class="doc-row inv-row ${rowClass}" style="top:${top}pt;height:${rowHeight}pt"><div class="td i-model">${safe(item.model).slice(0, 44)}</div><div class="td i-qty">${item.qty}</div><div class="td i-unit">${formatMoneyDot(item.unitPrice)}</div><div class="td i-total">${formatMoneyDot(lineTotal)}</div>${specs ? `<div class="spec-line">${specs}</div>` : ''}</div>`;
      }
    };
  }

  const rowInfos = preparedItems.map(rowInfo);
  const chunks = [];
  let current = [], height = 0;
  const maxRowsHeight = 410;
  rowInfos.forEach(info => {
    if (current.length && height + info.height > maxRowsHeight) {
      chunks.push({ rows: current, height });
      current = [];
      height = 0;
    }
    current.push(info);
    height += info.height;
  });
  chunks.push({ rows: current, height });

  const totalsHtml = (() => {
    if (!isInvoice) return `<div class="total-quote"><span>${totalLabel}</span><b>${formatMoneyDot(data.totals.total)}</b></div>`;
    const parts = [];
    if (data.totals.discount > 0) {
      parts.push(`<div class="total-mini"><span>Subtotal</span><b>${formatMoneyDot(data.totals.subtotal)}</b></div>`);
      parts.push(`<div class="total-mini red"><span>Total Discount</span><b>- ${formatMoneyDot(data.totals.discount)}</b></div>`);
    }
    parts.push(`<div class="total-main"><span>TOTAL</span><b>${formatMoneyDot(data.totals.total)}</b></div>`);
    if (data.totals.advance > 0) {
      parts.push(`<div class="total-mini red"><span>Advance Paid</span><b>- ${formatMoneyDot(data.totals.advance)}</b></div>`);
      parts.push(`<div class="total-balance"><span>BALANCE DUE</span><b>${formatMoneyDot(data.totals.balance)}</b></div>`);
    }
    return parts.join('');
  })();
  const notesHtml = data.notes ? `<section class="notes"><b>NOTES</b>${safe(data.notes).split('\n').map(line => `<span>${line}</span>`).join('')}</section>` : '';
  const finalNeedsOwnPage = chunks.length && chunks[chunks.length - 1].height > (data.notes ? 280 : 335);
  if (finalNeedsOwnPage) chunks.push({ rows: [], height: 0 });
  const pageCount = Math.max(1, chunks.length);

  function renderPage(chunk, pageIndex) {
    let top = 0;
    const rowsHtml = chunk.rows.map(info => { const html = info.html(top); top += info.height; return html; }).join('');
    const tableHeightPt = chunk.rows.length ? 26 + top : 0;
    const tableHtml = chunk.rows.length ? `<section class="table-wrap" style="height:${tableHeightPt}pt"><div class="table-head">${isInvoice ? invoiceHeaders : quoteHeaders}</div><div class="rows" style="position:absolute;left:0;top:26pt;width:100%;height:${top}pt">${rowsHtml}</div></section>` : '';
    const isLast = pageIndex === pageCount - 1;
    const totalsTop = chunk.rows.length ? Math.min(650, 194 + tableHeightPt + 12) : 218;
    return `<div class="page"><header class="header"><img class="logo" src="../assets/logo.png" alt="Trini-D logo"><img class="brand-name" src="../assets/brand_name.png" alt="TRINI-D 3D Printing"><div class="header-motto">THREE&nbsp; DIMENTIONS&nbsp;&nbsp; - &nbsp;&nbsp;<span class="gold">ENDLESS</span>&nbsp; POSSIBILITIES</div><div class="doc-title">${docWord}</div><div class="doc-id-top"># ${safe(data.no)}</div></header><section class="panel"></section><div class="label customer-label">${partyLabel}</div><div class="customer-name">${safe(data.customer || 'Customer')}</div><div class="label date-label">DATE</div><div class="date-value">${safe(dateText)}</div><div class="label number-label">${docNoLabel}</div><div class="number-value">${safe(data.no)}</div>${tableHtml}${isLast ? `<section class="totals" style="top:${totalsTop}pt">${totalsHtml}</section>${notesHtml ? notesHtml.replace('<section class="notes"', `<section class="notes" style="top:${Math.min(680, totalsTop + 56)}pt"`) : ''}` : ''}<footer class="footer"><div class="footer-title">${thanks}</div><div class="footer-phone">☎ &nbsp;071 93 35 411&nbsp;&nbsp; | &nbsp;&nbsp;078 55 24 561</div><div class="footer-wa">WhatsApp: +94 75 16 56 777</div><div class="footer-motto">Three Dimensions - Endless Possibilities</div><img class="qr" src="../assets/whatsapp-qr.png" alt="WhatsApp QR"><div class="qr-caption">Scan to WhatsApp us</div></footer><div class="page-line">Page ${pageIndex + 1} of ${pageCount} &nbsp; · &nbsp; TRINI-D &nbsp; · &nbsp; Three Dimensions - Endless Possibilities</div></div>`;
  }

  const pagesHtml = chunks.map(renderPage).join('');
  const html = `<!doctype html><html><head><base href="${location.href}"><title>${filePrefix}_${safe(data.no)}.pdf</title><style>
    @page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.print-btn{position:fixed;right:12px;top:12px;z-index:50;border:0;border-radius:999px;background:#d4af37;color:#111;font-weight:900;padding:10px 16px;box-shadow:0 10px 30px rgba(0,0,0,.25);cursor:pointer}@media print{.print-btn{display:none}.page{margin:0!important;page-break-after:always}.page:last-child{page-break-after:auto}}.page{width:210mm;height:297mm;margin:0 auto;background:#fff;position:relative;overflow:hidden}.header{position:absolute;left:0;top:0;width:210mm;height:110pt;background:#111;border-bottom:2.5pt solid #d4af37}.logo{position:absolute;left:18mm;top:16pt;width:78pt;height:78pt;object-fit:contain}.brand-name{position:absolute;left:139pt;top:22pt;width:180pt;height:46pt;object-fit:contain}.header-motto{position:absolute;left:139pt;top:76pt;width:180pt;text-align:center;font-size:6pt;font-weight:700;letter-spacing:.02em;white-space:nowrap;color:#e8e8e8;line-height:1}.header-motto .gold{color:#d4af37}.doc-title{position:absolute;right:18mm;top:35pt;text-align:right;color:#fff;font-size:20pt;font-weight:700;line-height:1;letter-spacing:.02em}.doc-id-top{position:absolute;right:18mm;top:67pt;text-align:right;color:#d4af37;font-size:9pt;line-height:1}.panel{position:absolute;left:18mm;top:120pt;width:174mm;height:68pt;background:#f2f2f2;border-radius:6pt}.label{font-size:8pt;font-weight:700;color:#2d2d2d;text-transform:uppercase;line-height:1}.customer-label{position:absolute;left:22mm;top:136pt}.customer-name{position:absolute;left:22mm;top:151pt;font-size:13pt;font-weight:700;color:#111;line-height:1}.date-label{position:absolute;left:405pt;top:133pt}.date-value{position:absolute;left:405pt;top:147pt;font-size:10pt;color:#111;line-height:1}.number-label{position:absolute;left:405pt;top:165pt}.number-value{position:absolute;left:405pt;top:178pt;font-size:8pt;font-weight:700;color:#d4af37;line-height:1}.table-wrap{position:absolute;left:18mm;top:194pt;width:174mm;border-bottom:.5pt solid #ccc}.table-head{position:absolute;left:0;top:0;width:100%;height:26pt;background:#111;border-bottom:1pt solid #d4af37;color:#d4af37;font-size:7.5pt;font-weight:700;text-transform:uppercase;line-height:1}.th{position:absolute;top:10pt;text-align:center;white-space:nowrap}.th:first-child{text-align:left}.doc-row{position:absolute;left:0;width:100%;font-size:9pt;color:#111;line-height:1}.row-light{background:#f2f2f2}.row-white{background:#fff}.td{position:absolute;top:8pt;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.q-model,.i-model,.i-model-disc,.id-model-disc{text-align:left;font-weight:700}.q-total,.i-total,.id-total-disc{font-weight:700;text-align:right}.q-unit,.q-layer,.q-walls,.q-infill,.id-qty-disc{color:#2d2d2d}.id-discount-disc{color:#cc3333}.quote-sub{position:absolute;left:4pt;font-size:7pt;font-style:italic;color:#888;line-height:1}.spec-line{position:absolute;left:4pt;top:21pt}.spec-tag{display:inline-block;background:#2a2200;color:#d4af37;border-radius:2pt;padding:2pt 5pt;font-size:7pt;font-style:italic;line-height:1}.c-model{left:4pt;text-align:left}.c-qty{left:136pt;width:40pt}.c-unit{left:190pt;width:68pt}.c-layer{left:271pt;width:58pt}.c-walls{left:333pt;width:59pt}.c-infill{left:395pt;width:55pt}.c-total{right:4pt;width:64pt}.q-model{left:4pt;width:132pt}.q-qty{left:136pt;width:40pt;font-weight:700}.q-unit{left:190pt;width:68pt;font-size:8pt}.q-layer{left:271pt;width:58pt;font-size:8pt}.q-walls{left:333pt;width:59pt;font-size:8pt}.q-infill{left:395pt;width:55pt;font-size:8pt}.q-total{right:4pt;width:70pt}.i-model{left:4pt;width:220pt}.i-qty{left:245pt;width:40pt;font-weight:700}.i-unit{left:310pt;width:85pt}.i-total{right:4pt;width:90pt}.i-model-disc{left:4pt;text-align:left}.i-qty-disc{left:292pt;width:35pt}.i-unit-disc{left:340pt;width:70pt}.i-discount-disc{left:430pt;width:60pt}.i-total-disc{right:4pt;width:62pt}.id-model-disc{left:4pt;width:280pt}.id-qty-disc{left:292pt;width:35pt}.id-unit-disc{left:332pt;width:80pt}.id-discount-disc{left:418pt;width:72pt}.id-total-disc{right:4pt;width:72pt}.totals{position:absolute;right:18mm;width:90mm}.total-quote,.total-main,.total-balance{height:24pt;background:#d4af37;color:#111;font-size:12pt;font-weight:700;line-height:24pt;padding:0 8pt}.total-quote{display:flex;justify-content:space-between}.total-main,.total-balance,.total-mini{display:flex;justify-content:space-between}.total-mini{height:20pt;color:#111;font-size:9pt;line-height:20pt;padding:0 8pt}.total-mini.red{color:#cc3333}.total-balance{background:#1a5c2a;color:#4ade80}.notes{position:absolute;left:18mm;width:95mm;font-size:8pt;color:#111}.notes b{display:block;color:#2d2d2d;margin-bottom:4pt}.notes span{display:block;margin-bottom:3pt}.footer{position:absolute;left:0;bottom:38pt;width:210mm;height:90pt;background:#111;border-top:2pt solid #d4af37}.footer-title{position:absolute;left:18mm;top:20pt;color:#d4af37;font-size:13pt;font-weight:700}.footer-phone{position:absolute;left:18mm;top:42pt;color:#fff;font-size:8.5pt}.footer-wa{position:absolute;left:18mm;top:56pt;color:#fff;font-size:8.5pt}.footer-motto{position:absolute;left:18mm;top:70pt;color:#ccc;font-size:7.5pt;font-style:italic}.qr{position:absolute;right:18mm;top:14pt;width:68pt;height:68pt}.qr-caption{position:absolute;right:18mm;top:83pt;width:68pt;text-align:center;color:#ccc;font-size:6.5pt}.page-line{position:absolute;left:0;bottom:15pt;width:210mm;text-align:center;font-size:7pt;color:#bbb}
  </style></head><body><button class="print-btn" onclick="window.print()">Print / Save PDF</button>${pagesHtml}<script>window.onload = () => setTimeout(() => window.print(), 350);</script></body></html>`;
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

function initDatabase() {
  $$('.db-tab').forEach(btn => btn.addEventListener('click', () => {
    activeDbTable = btn.dataset.dbTable;
    $$('.db-tab').forEach(b => b.classList.toggle('active', b === btn));
    renderDatabaseTable();
  }));
  $('#dbSearch').addEventListener('input', renderDatabaseTable);
  $('#exportCsvBtn').addEventListener('click', exportActiveCsv);
  $('#createCustomGroupBtn').addEventListener('click', createCustomGroup);
  $('#addSelectedToCustomBtn').addEventListener('click', addSelectedToCustom);
  $('#addSelectedToOrdersBtn').addEventListener('click', addSelectedItemsToOrders);
  $('#useSelectedInBillBtn').addEventListener('click', useSelectedItemsInBill);
  $('#customGroupSelect').addEventListener('change', renderDatabaseTable);
  $('#databaseBody').addEventListener('change', e => {
    if (e.target.classList.contains('item-select')) {
      const itemId = e.target.value;
      if (e.target.checked) selectedItemIds.add(itemId); else selectedItemIds.delete(itemId);
    }
    const paidSelect = e.target.closest('[data-order-paid]');
    if (paidSelect) updateOrderPaidStatus(paidSelect.dataset.orderPaid, paidSelect.value);
  });
  $('#databaseBody').addEventListener('click', e => {
    const orderBtn = e.target.closest('[data-item-to-order]');
    if (orderBtn) return addSingleItemToOrders(orderBtn.dataset.itemToOrder);
    const billBtn = e.target.closest('[data-item-to-bill]');
    if (billBtn) return useSingleItemInBill(billBtn.dataset.itemToBill);
    const editItem = e.target.closest('[data-edit-item]');
    if (editItem) return editItemRecord(editItem.dataset.editItem);
    const editOrder = e.target.closest('[data-edit-order]');
    if (editOrder) return editOrderRecord(editOrder.dataset.editOrder);
    const printInvoice = e.target.closest('[data-print-invoice]');
    if (printInvoice) return printStoredInvoice(printInvoice.dataset.printInvoice);
    const printQuote = e.target.closest('[data-print-quote]');
    if (printQuote) return printStoredQuote(printQuote.dataset.printQuote);
    const printQuoteInternal = e.target.closest('[data-print-quote-internal]');
    if (printQuoteInternal) return printStoredQuoteInternal(printQuoteInternal.dataset.printQuoteInternal);
    const del = e.target.closest('[data-delete]');
    if (!del) return;
    deleteRecord(del.dataset.delete, del.dataset.kind);
  });
}

function createCustomGroup() {
  const name = $('#customGroupName').value.trim();
  if (!name) return alert('Enter custom group name.');
  db.customGroups.push({ id: id('GROUP'), name, createdAt: nowStamp() });
  $('#customGroupName').value = '';
  saveDb();
}

function addSelectedToCustom() {
  const groupId = $('#customGroupSelect').value;
  if (!groupId) return alert('Create/select a custom group first.');
  if (!selectedItemIds.size) return alert('Tick Item Details records first.');
  const existing = new Set(db.customRecords.filter(r => r.groupId === groupId).map(r => r.sourceItemId));
  db.itemRecords.filter(item => selectedItemIds.has(item.id)).forEach(item => {
    if (!existing.has(item.id)) db.customRecords.unshift({ ...item, id: id('CUSTOM'), sourceItemId: item.id, groupId, createdAt: nowStamp() });
  });
  selectedItemIds.clear();
  saveDb();
  toast('Selected items copied to custom table');
}

function editValue(label, currentValue) {
  const value = prompt(label, currentValue ?? '');
  return value === null ? currentValue : value;
}

function editNumberValue(label, currentValue) {
  const value = prompt(label, currentValue ?? 0);
  if (value === null) return currentValue;
  return num(value);
}

function editItemRecord(itemId) {
  const item = db.itemRecords.find(r => r.id === itemId);
  if (!item) return;
  item.customer = editValue('Customer name', item.customer);
  item.model = editValue('Model / item name', item.model);
  item.materialType = editValue('Material type', materialText(item));
  item.color = editValue('Color', colorText(item));
  const status = editValue('Status: Success or Failed', item.status || 'Success');
  item.status = /^f/i.test(status) ? 'Failed' : 'Success';
  item.printTimeMinutes = editNumberValue('Print time in minutes', item.printTimeMinutes);
  item.weightG = editNumberValue('Weight in grams', item.weightG);
  item.totalCost = ceilCurrency(editNumberValue('Total cost Rs', item.totalCost));
  item.price = item.status === 'Failed' ? 0 : ceilCurrency(editNumberValue('Selling price Rs', item.price));
  item.profit = ceilCurrency(num(item.price) - num(item.totalCost));
  item.calcFingerprint = calcFingerprint(item);
  saveDb();
  toast('Item record updated');
}

function editOrderRecord(orderId) {
  const order = db.orders.find(r => r.id === orderId);
  if (!order) return;
  order.orderId = editValue('Order ID', order.orderId);
  order.customer = editValue('Customer name', order.customer);
  order.model = editValue('Model / item name', order.model);
  order.datePrinted = editValue('Date printed YYYY-MM-DD', order.datePrinted || todayISO());
  const paid = editValue('Paid status: Paid or Unpaid', normalizePaidStatus(order.paidStatus) || 'Unpaid');
  order.paidStatus = /^p/i.test(paid) ? 'Paid' : 'Unpaid';
  order.paidMethod = editValue('Paid method', order.paidMethod || '');
  order.advancePayment = ceilCurrency(editNumberValue('Advance payment Rs', order.advancePayment));
  order.totalCost = ceilCurrency(editNumberValue('Total cost Rs', order.totalCost));
  order.price = ceilCurrency(editNumberValue('Price Rs', order.price));
  order.profit = ceilCurrency(num(order.price) - num(order.totalCost));
  saveDb();
  toast('Order record updated');
}

function printableInvoiceData(r) {
  if (r.documentData) return r.documentData;
  const items = (r.items || []).map(item => ({ ...item, unitPrice: num(item.unitPrice ?? item.unit), discount: num(item.discount), cost: num(item.cost) }));
  return {
    type: 'INVOICE',
    no: r.invoiceNo || r.orderId || docId('INV'),
    date: r.date || todayISO(),
    customer: r.customer || '',
    notes: r.notes || '',
    items,
    totals: { subtotal: num(r.subtotal), discount: num(r.discount), total: num(r.total), advance: num(r.advancePayment), balance: num(r.balance), cost: num(r.totalCost), profit: num(r.profit) },
    paidStatus: r.paidStatus || 'Unpaid',
    paidMethod: r.paidMethod || ''
  };
}

function printableQuoteData(r) {
  if (r.documentData) return r.documentData;
  const items = (r.items || []).map(item => ({ ...item, unitPrice: num(item.unitPrice ?? item.unit) }));
  const totals = quoteTotals(items);
  return { type: 'QUOTATION', no: r.quoteNo || docId('QT'), date: r.date || todayISO(), customer: r.customer || '', notes: r.notes || '', items, totals: { ...totals, total: num(r.total) || totals.total } };
}

function printStoredInvoice(recordId) {
  const record = (db.invoices || []).find(r => r.id === recordId);
  if (!record) return alert('Invoice record not found.');
  printDocument(printableInvoiceData(record));
}

function printStoredQuote(recordId) {
  const record = (db.quotes || []).find(r => r.id === recordId);
  if (!record) return alert('Quotation record not found.');
  printDocument(printableQuoteData(record));
}

function printStoredQuoteInternal(recordId) {
  const record = (db.quotes || []).find(r => r.id === recordId);
  if (!record) return alert('Quotation record not found.');
  printInternalQuotationDocument(printableQuoteData(record));
}

function deleteRecord(recordId, kind) {
  if (!confirm('Delete this record?')) return;
  const map = { item: 'itemRecords', order: 'orders', invoice: 'invoices', quote: 'quotes', budget: 'budget', custom: 'customRecords' };
  const key = map[kind];
  if (!key || !Array.isArray(db[key])) return;

  if (kind === 'invoice') {
    const invoice = db.invoices.find(item => item.id === recordId);
    const invoiceNo = invoice ? (invoice.invoiceNo || invoice.orderId || '') : '';

    // Clean up old versions that incorrectly created an Order from a Bill/Invoice.
    // New invoices do NOT create Orders anymore.
    const linkedOrderIds = new Set((db.orders || [])
      .filter(order => order.invoiceId === recordId || (invoiceNo && order.invoiceId && order.orderId === invoiceNo))
      .map(order => order.id));

    db.invoices = db.invoices.filter(item => item.id !== recordId);
    if (linkedOrderIds.size) {
      db.orders = (db.orders || []).filter(order => !linkedOrderIds.has(order.id));
      db.budget = (db.budget || []).filter(record => !(record.source === 'Order' && linkedOrderIds.has(record.sourceId)));
    }
  } else if (kind === 'order') {
    db.orders = (db.orders || []).filter(item => item.id !== recordId);
    db.budget = (db.budget || []).filter(record => !(record.source === 'Order' && record.sourceId === recordId));
  } else {
    db[key] = db[key].filter(item => item.id !== recordId);
  }

  saveDb();
}

function itemToBillData(item) {
  return {
    model: item.model || item.model_name || '3D print item',
    qty: 1,
    unit: ceilCurrency(item.price),
    discount: 0,
    cost: ceilCurrency(item.totalCost),
    layer: item.layer || item.layerHeight || '',
    walls: item.walls || item.wallLoops || '',
    infill: item.infill || ''
  };
}

function itemToOrderData(item, overrideOrderId = null) {
  const price = ceilCurrency(item.price);
  const totalCost = ceilCurrency(item.totalCost);
  return {
    id: id('ORDER'),
    createdAt: nowStamp(),
    orderId: overrideOrderId || docId('INV'),
    customer: item.customer || 'Customer',
    model: item.model || '3D print item',
    datePrinted: todayISO(),
    price,
    paidStatus: 'Unpaid',
    paidMethod: '',
    advancePayment: 0,
    totalCost,
    profit: price - totalCost,
    sourceItemIds: [item.id],
    items: [itemToBillData(item)],
    notes: 'Created from Item Details record'
  };
}

function addSingleItemToOrders(itemId) {
  const item = db.itemRecords.find(r => r.id === itemId);
  if (!item) return alert('Item record not found.');
  const exists = db.orders.find(o => Array.isArray(o.sourceItemIds) && o.sourceItemIds.includes(itemId));
  if (exists && !confirm('This item is already linked to an order. Add another order anyway?')) return;
  db.orders.unshift(itemToOrderData(item));
  saveDb();
  toast('Item added to Orders');
}

function addSelectedItemsToOrders() {
  const items = db.itemRecords.filter(item => selectedItemIds.has(item.id));
  if (!items.length) return alert('Tick one or more Item Details records first.');
  const duplicateCount = items.filter(item => db.orders.some(o => Array.isArray(o.sourceItemIds) && o.sourceItemIds.includes(item.id))).length;
  if (duplicateCount && !confirm(`${duplicateCount} selected item(s) are already linked to Orders. Continue and create a new combined order?`)) return;
  const orderId = docId('INV');
  const price = ceilCurrency(items.reduce((sum, item) => sum + ceilCurrency(item.price), 0));
  const totalCost = ceilCurrency(items.reduce((sum, item) => sum + ceilCurrency(item.totalCost), 0));
  const customer = items.map(i => i.customer).find(Boolean) || 'Customer';
  db.orders.unshift({
    id: id('ORDER'),
    createdAt: nowStamp(),
    orderId,
    customer,
    model: items.map(i => i.model || '3D print item').join(', '),
    datePrinted: todayISO(),
    price,
    paidStatus: 'Unpaid',
    paidMethod: '',
    advancePayment: 0,
    totalCost,
    profit: price - totalCost,
    sourceItemIds: items.map(i => i.id),
    items: items.map(itemToBillData),
    notes: 'Created from selected Item Details records'
  });
  selectedItemIds.clear();
  saveDb();
  toast('Selected items added to Orders');
}

function useSingleItemInBill(itemId) {
  const item = db.itemRecords.find(r => r.id === itemId);
  if (!item) return alert('Item record not found.');
  addBillRow(itemToBillData(item));
  if (item.customer) $('#billCustomer').value = item.customer;
  setSection('bill');
  toast('Item added to Bill form');
}

function useSelectedItemsInBill() {
  const items = db.itemRecords.filter(item => selectedItemIds.has(item.id));
  if (!items.length) return alert('Tick one or more Item Details records first.');
  items.forEach(item => addBillRow(itemToBillData(item)));
  const customer = items.map(i => i.customer).find(Boolean);
  if (customer) $('#billCustomer').value = customer;
  setSection('bill');
  toast('Selected items added to Bill form');
}

function updateOrderPaidStatus(orderId, paidStatus) {
  const order = db.orders.find(r => r.id === orderId);
  if (!order) return;
  order.paidStatus = paidStatus === 'Paid' ? 'Paid' : 'Unpaid';

  // Keep matching invoice status updated when this order was generated from a bill/invoice.
  const invoice = (db.invoices || []).find(r => r.id === orderId || r.orderId === order.orderId || r.invoiceNo === order.orderId);
  if (invoice) invoice.paidStatus = order.paidStatus;

  saveDb();
  toast(`Order marked as ${order.paidStatus}`);
}

function renderDatabaseTable() {
  const q = $('#dbSearch').value.trim().toLowerCase();
  const include = row => JSON.stringify(row).toLowerCase().includes(q);
  let rows = [];
  let headers = '';
  let body = '';
  if (activeDbTable === 'items') {
    rows = db.itemRecords.filter(include);
    headers = '<tr><th>✓</th><th>Date</th><th>Customer</th><th>Model</th><th>Material</th><th>Color</th><th>Status</th><th>Print Time</th><th>Weight</th><th>Cost</th><th>Price</th><th>Profit</th><th>Actions</th></tr>';
    body = rows.map(r => `<tr><td><input class="item-select" type="checkbox" value="${r.id}" ${selectedItemIds.has(r.id) ? 'checked' : ''}></td><td>${safe(r.datePrinted || r.createdAt)}</td><td>${safe(r.customer)}</td><td>${safe(r.model)}</td><td>${safe(materialText(r))}</td><td>${safe(colorText(r))}</td><td><span class="pill-status ${String(r.status).toLowerCase()}">${safe(r.status)}</span></td><td>${minutesLabel(r.printTimeMinutes)}</td><td>${Number(r.weightG || 0).toFixed(2)} g</td><td>${money(r.totalCost)}</td><td>${money(r.price)}</td><td>${money(r.profit)}</td><td class="row-actions"><button class="small-btn" data-edit-item="${r.id}">Edit</button><button class="small-btn" data-item-to-order="${r.id}">Order</button><button class="small-btn" data-item-to-bill="${r.id}">Bill</button><button class="small-btn" data-delete="${r.id}" data-kind="item">Delete</button></td></tr>`).join('');
  }
  if (activeDbTable === 'orders') {
    rows = db.orders.filter(include);
    headers = '<tr><th>Date</th><th>Order ID</th><th>Customer</th><th>Model</th><th>Paid Status</th><th>Advance</th><th>Cost</th><th>Price</th><th>Profit</th><th>Actions</th></tr>';
    body = rows.map(r => {
      const paidStatus = normalizePaidStatus(r.paidStatus) || 'Unpaid';
      return `<tr><td>${safe(r.datePrinted)}</td><td>${safe(r.orderId)}</td><td>${safe(r.customer)}</td><td>${safe(r.model)}</td><td><select class="order-paid-select ${paidStatus.toLowerCase()}" data-order-paid="${r.id}"><option value="Paid" ${paidStatus === 'Paid' ? 'selected' : ''}>Paid</option><option value="Unpaid" ${paidStatus === 'Unpaid' ? 'selected' : ''}>Unpaid</option></select></td><td>${money(r.advancePayment)}</td><td>${money(r.totalCost)}</td><td>${money(r.price)}</td><td>${money(r.profit)}</td><td class="row-actions"><button class="small-btn" data-edit-order="${r.id}">Edit</button><button class="small-btn" data-delete="${r.id}" data-kind="order">Delete</button></td></tr>`;
    }).join('');
  }
  if (activeDbTable === 'invoices') {
    rows = (db.invoices || []).filter(include);
    headers = '<tr><th>Date</th><th>Invoice No</th><th>Customer</th><th>Items</th><th>Paid</th><th>Subtotal</th><th>Discount</th><th>Advance</th><th>Balance</th><th>Total</th><th>Actions</th></tr>';
    body = rows.map(r => `<tr><td>${safe(r.date)}</td><td>${safe(r.invoiceNo || r.orderId)}</td><td>${safe(r.customer)}</td><td>${safe((r.items || []).map(i => i.model).join(', '))}</td><td><span class="pill-status ${String(r.paidStatus || '').toLowerCase()}">${safe(r.paidStatus || '-')}</span></td><td>${money(r.subtotal)}</td><td>${money(r.discount)}</td><td>${money(r.advancePayment)}</td><td>${money(r.balance)}</td><td>${money(r.total)}</td><td class="row-actions"><button class="small-btn" data-print-invoice="${r.id}">Download PDF</button><button class="small-btn" data-delete="${r.id}" data-kind="invoice">Delete</button></td></tr>`).join('');
  }
  if (activeDbTable === 'quotes') {
    rows = db.quotes.filter(include);
    headers = '<tr><th>Date</th><th>Quote No</th><th>Customer</th><th>Items</th><th>Total</th><th>Actions</th></tr>';
    body = rows.map(r => `<tr><td>${safe(r.date)}</td><td>${safe(r.quoteNo)}</td><td>${safe(r.customer)}</td><td>${safe((r.items || []).map(i => i.model).join(', '))}</td><td>${money(r.total)}</td><td class="row-actions"><button class="small-btn" data-print-quote="${r.id}">Customer PDF</button><button class="small-btn" data-print-quote-internal="${r.id}">Internal PDF</button><button class="small-btn" data-delete="${r.id}" data-kind="quote">Delete</button></td></tr>`).join('');
  }
  if (activeDbTable === 'custom') {
    const groupId = $('#customGroupSelect').value;
    rows = db.customRecords.filter(r => !groupId || r.groupId === groupId).filter(include);
    headers = '<tr><th>Group</th><th>Source Item</th><th>Customer</th><th>Model</th><th>Status</th><th>Cost</th><th>Price</th><th></th></tr>';
    body = rows.map(r => `<tr><td>${safe(groupName(r.groupId))}</td><td>${safe(r.sourceItemId)}</td><td>${safe(r.customer)}</td><td>${safe(r.model)}</td><td>${safe(r.status)}</td><td>${money(r.totalCost)}</td><td>${money(r.price)}</td><td><button class="small-btn" data-delete="${r.id}" data-kind="custom">Delete</button></td></tr>`).join('');
  }
  $('#databaseHead').innerHTML = headers;
  $('#databaseBody').innerHTML = body || `<tr><td colspan="12" class="muted">No records yet.</td></tr>`;
}

function groupName(groupId) {
  return (db.customGroups.find(g => g.id === groupId) || {}).name || 'Custom';
}

function renderCustomGroups() {
  const select = $('#customGroupSelect');
  const current = select.value;
  select.innerHTML = '<option value="">All custom groups</option>' + db.customGroups.map(g => `<option value="${g.id}">${safe(g.name)}</option>`).join('');
  if (current) select.value = current;
}

function initBudget() {
  $('#budgetForm').addEventListener('submit', e => {
    e.preventDefault();
    const editId = $('#budgetEditId') ? $('#budgetEditId').value : '';
    const payload = {
      entryDate: $('#budgetDate').value || todayISO(),
      entryType: $('#budgetType').value,
      category: $('#budgetCategory').value.trim(),
      description: $('#budgetDescription').value.trim(),
      amount: num($('#budgetAmount').value),
      source: ($('#budgetSource').value || 'Manual').trim() || 'Manual'
    };
    if (editId) {
      const record = db.budget.find(r => r.id === editId);
      if (!record) return alert('Budget record not found.');
      Object.assign(record, payload, { updatedAt: nowStamp() });
      toast('Budget record updated');
    } else {
      db.budget.unshift({ id: id('BUDGET'), createdAt: nowStamp(), ...payload, sourceId: '' });
      toast('Budget record saved');
    }
    resetBudgetForm();
    saveDb();
  });
  $('#syncBudgetBtn').addEventListener('click', syncOrdersToBudget);
  const cancelBtn = $('#budgetCancelEditBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', resetBudgetForm);
  $('#budgetBody').addEventListener('click', e => {
    const edit = e.target.closest('[data-budget-edit]');
    if (edit) return editBudgetRecord(edit.dataset.budgetEdit);
    const del = e.target.closest('[data-delete]');
    if (del) deleteRecord(del.dataset.delete, 'budget');
  });
}

function resetBudgetForm() {
  $('#budgetForm').reset();
  $('#budgetDate').value = todayISO();
  $('#budgetEditId').value = '';
  if ($('#budgetSource')) $('#budgetSource').value = 'Manual';
  const saveBtn = $('#budgetSaveBtn');
  const cancelBtn = $('#budgetCancelEditBtn');
  if (saveBtn) saveBtn.textContent = 'Save Budget Record';
  if (cancelBtn) cancelBtn.hidden = true;
}

function editBudgetRecord(recordId) {
  const record = db.budget.find(r => r.id === recordId);
  if (!record) return alert('Budget record not found.');
  $('#budgetEditId').value = record.id;
  $('#budgetDate').value = record.entryDate || todayISO();
  $('#budgetType').value = record.entryType || 'Expense';
  $('#budgetCategory').value = record.category || '';
  $('#budgetAmount').value = num(record.amount) || '';
  $('#budgetSource').value = record.source || 'Manual';
  $('#budgetDescription').value = record.description || '';
  const saveBtn = $('#budgetSaveBtn');
  const cancelBtn = $('#budgetCancelEditBtn');
  if (saveBtn) saveBtn.textContent = 'Update Budget Record';
  if (cancelBtn) cancelBtn.hidden = false;
  $('#budgetForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function syncOrdersToBudget() {
  const existing = new Set(db.budget.filter(r => r.source === 'Order').map(r => `${r.sourceId}-${r.entryType}-${r.category}`));
  let added = 0;
  db.orders.forEach(order => {
    const incomeKey = `${order.id}-Income-Order Payment`;
    if (!existing.has(incomeKey)) {
      db.budget.unshift({ id: id('BUDGET'), createdAt: nowStamp(), entryDate: order.datePrinted || todayISO(), entryType: 'Income', category: 'Order Payment', description: `Invoice ${order.orderId} - ${order.customer}`, amount: order.price, paymentMethod: order.paidMethod, reference: order.orderId, notes: '', source: 'Order', sourceId: order.id });
      added += 1;
    }
    const expenseKey = `${order.id}-Expense-Print Cost`;
    if (order.totalCost && !existing.has(expenseKey)) {
      db.budget.unshift({ id: id('BUDGET'), createdAt: nowStamp(), entryDate: order.datePrinted || todayISO(), entryType: 'Expense', category: 'Print Cost', description: `Estimated cost for ${order.orderId}`, amount: order.totalCost, paymentMethod: '', reference: order.orderId, notes: '', source: 'Order', sourceId: order.id });
      added += 1;
    }
  });
  saveDb();
  toast(`${added} budget records synced`);
}

function renderBudget() {
  const income = db.budget.filter(r => r.entryType === 'Income').reduce((s, r) => s + num(r.amount), 0);
  const expense = db.budget.filter(r => r.entryType === 'Expense').reduce((s, r) => s + num(r.amount), 0);
  $('#budgetIncome').textContent = money(income);
  $('#budgetExpense').textContent = money(expense);
  $('#budgetBalance').textContent = money(income - expense);
  $('#budgetBody').innerHTML = db.budget.map(r => `<tr>
    <td>${safe(r.desktopId || r.id)}</td>
    <td>${safe(r.entryDate)}</td>
    <td><span class="pill-status ${String(r.entryType).toLowerCase()}">${safe(r.entryType)}</span></td>
    <td>${safe(r.category)}</td>
    <td>${safe(r.description)}</td>
    <td>${money(r.amount)}</td>
    <td>${safe(r.source || 'Manual')}</td>
    <td><button class="small-btn" data-budget-edit="${r.id}">Edit</button> <button class="small-btn danger" data-delete="${r.id}">Delete</button></td>
  </tr>`).join('') || '<tr><td colspan="8" class="muted">No budget records yet.</td></tr>';
}

function uniqueCustomerCount(rows) {
  return new Set(rows.map(r => String(r.customer || '').trim().toLowerCase()).filter(Boolean)).size;
}

function normalizePaidStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (['paid', 'y', 'yes', 'true', '1'].includes(value)) return 'Paid';
  if (['unpaid', 'n', 'no', 'false', '0'].includes(value)) return 'Unpaid';
  return '';
}

function orderUnpaidAmount(order) {
  const status = normalizePaidStatus(order.paidStatus);
  if (status !== 'Unpaid') return 0;
  return Math.max(0, num(order.price) - num(order.advancePayment));
}

function renderDatabaseSummary() {
  const el = $('#databaseSummaryCards');
  if (!el) return;

  const itemRows = db.itemRecords || [];
  const doneItems = itemRows.filter(r => String(r.status || '').toLowerCase() === 'success');
  const itemCost = doneItems.reduce((sum, r) => sum + num(r.totalCost), 0);

  const orderRows = db.orders || [];
  const orderIncome = orderRows.reduce((sum, r) => sum + num(r.price), 0);
  const orderProfit = orderRows.reduce((sum, r) => sum + num(r.profit), 0);
  const customerCount = uniqueCustomerCount(orderRows);
  const unpaidOrders = orderRows.filter(r => orderUnpaidAmount(r) > 0);
  const unpaidAmount = unpaidOrders.reduce((sum, r) => sum + orderUnpaidAmount(r), 0);

  const groups = db.customGroups || [];
  const customRecords = db.customRecords || [];
  const customCards = groups.map(group => {
    const rows = customRecords.filter(r => r.groupId === group.id);
    const cost = rows.reduce((sum, r) => sum + num(r.totalCost), 0);
    const income = rows.reduce((sum, r) => sum + num(r.price), 0);
    const profit = income - cost;
    return `<article class="db-summary-card custom-summary-card">
      <span>Custom: ${safe(group.name)}</span>
      <b>${money(profit)}</b>
      <small>${rows.length} items · Cost ${money(cost)} · Income ${money(income)}</small>
    </article>`;
  }).join('');

  const allCustomCost = customRecords.reduce((sum, r) => sum + num(r.totalCost), 0);
  const allCustomIncome = customRecords.reduce((sum, r) => sum + num(r.price), 0);
  const allCustomProfit = allCustomIncome - allCustomCost;

  el.innerHTML = `
    <article class="db-summary-card">
      <span>Items Done</span>
      <b>${doneItems.length}</b>
      <small>Total item cost ${money(itemCost)}</small>
    </article>
    <article class="db-summary-card">
      <span>Orders Done</span>
      <b>${orderRows.length}</b>
      <small>Order income ${money(orderIncome)}</small>
    </article>
    <article class="db-summary-card highlight-profit">
      <span>Total Profit</span>
      <b>${money(orderProfit)}</b>
      <small>Orders price minus print cost</small>
    </article>
    <article class="db-summary-card">
      <span>Customers</span>
      <b>${customerCount}</b>
      <small>Unique customer names in orders</small>
    </article>
    <article class="db-summary-card unpaid-card">
      <span>Unpaid Orders</span>
      <b>${money(unpaidAmount)}</b>
      <small>${unpaidOrders.length} unpaid orders</small>
    </article>
    <article class="db-summary-card custom-total-card">
      <span>Custom Tables Total</span>
      <b>${money(allCustomProfit)}</b>
      <small>${customRecords.length} custom items · Cost ${money(allCustomCost)}</small>
    </article>
    ${customCards || '<article class="db-summary-card custom-summary-card"><span>Custom Tables</span><b>0</b><small>No custom group records yet.</small></article>'}
  `;
}

function renderStats() {
  const income = db.budget.filter(r => r.entryType === 'Income').reduce((s, r) => s + num(r.amount), 0);
  const expense = db.budget.filter(r => r.entryType === 'Expense').reduce((s, r) => s + num(r.amount), 0);
  const budgetBalance = income - expense;
  const profit = db.orders.reduce((s, r) => s + num(r.profit), 0);
  $('#statItems').textContent = db.itemRecords.length;
  $('#statOrders').textContent = db.orders.length;
  $('#statProfit').textContent = money(profit);
  $('#statBudgetBalance').textContent = money(budgetBalance);

  const recentEl = $('#recentActivity');
  if (recentEl) {
    const recent = [
      ...db.itemRecords.slice(0, 6).map(r => ({ type: 'Item', title: r.model || r.customer || '3D Printed Item', amount: r.price, date: r.createdAt || r.datePrinted })),
      ...db.orders.slice(0, 6).map(r => ({ type: 'Order', title: r.orderId || r.customer || 'Order', amount: r.price, date: r.createdAt || r.datePrinted })),
      ...(db.invoices || []).slice(0, 6).map(r => ({ type: 'Invoice', title: r.invoiceNo || r.customer || 'Invoice', amount: r.total, date: r.createdAt || r.date })),
      ...db.quotes.slice(0, 6).map(r => ({ type: 'Quote', title: r.quoteNo || r.customer || 'Quotation', amount: r.total, date: r.createdAt || r.date }))
    ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 8);
    recentEl.innerHTML = recent.map(r => `<div class="activity-item"><div><b>${safe(r.type)}</b><br><span>${safe(r.title || '-')}</span></div><div><b>${money(r.amount)}</b><br><span>${safe(r.date || '-')}</span></div></div>`).join('') || '<p class="muted">No activity yet.</p>';
  }
}

function exportActiveCsv() {
  let rows = [];
  if (activeDbTable === 'items') rows = db.itemRecords;
  if (activeDbTable === 'orders') rows = db.orders;
  if (activeDbTable === 'invoices') rows = db.invoices || [];
  if (activeDbTable === 'quotes') rows = db.quotes;
  if (activeDbTable === 'custom') rows = db.customRecords;
  if (!rows.length) return alert('No records to export.');
  const keys = Array.from(rows.reduce((set, row) => { Object.keys(row).forEach(k => { if (!Array.isArray(row[k]) && typeof row[k] !== 'object') set.add(k); }); return set; }, new Set()));
  const csv = [keys.join(','), ...rows.map(row => keys.map(k => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  downloadText(`TriniD_${activeDbTable}_${todayISO()}.csv`, csv, 'text/csv');
}

function exportJson() {
  downloadText(`TriniD_Admin_Database_${todayISO()}.json`, JSON.stringify(db, null, 2), 'application/json');
}

function normalizeImportedAdminDb(imported) {
  return normalizeMaterialProfiles({
    ...defaultDb(),
    ...imported,
    itemRecords: imported.itemRecords || imported.items || [],
    orders: imported.orders || [],
    invoices: imported.invoices || imported.bills || [],
    quotes: imported.quotes || [],
    budget: imported.budget || imported.budgetRecords || [],
    customGroups: imported.customGroups || [],
    customRecords: imported.customRecords || []
  });
}

function upsertMany(target, rows) {
  let added = 0, updated = 0;
  rows.forEach(row => {
    const idx = target.findIndex(existing => existing.id === row.id);
    if (idx >= 0) { target[idx] = { ...target[idx], ...row }; updated += 1; }
    else { target.unshift(row); added += 1; }
  });
  return { added, updated };
}

function sqlRows(sqlDb, table) {
  try {
    const result = sqlDb.exec(`SELECT * FROM ${table}`);
    if (!result.length) return [];
    const { columns, values } = result[0];
    return values.map(row => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
  } catch (_err) {
    return [];
  }
}

async function importDesktopSqlite(file) {
  if (typeof initSqlJs !== 'function') {
    alert('SQLite reader did not load. Use the included Python converter in the tools folder, then import the converted JSON backup.');
    return;
  }
  try {
    const SQL = await initSqlJs({ locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${filename}` });
    const buffer = await file.arrayBuffer();
    const sqlDb = new SQL.Database(new Uint8Array(buffer));
    const printRows = sqlRows(sqlDb, 'print_records');
    const orderRows = sqlRows(sqlDb, 'order_records');
    const budgetRows = sqlRows(sqlDb, 'budget_records');
    const groupRows = sqlRows(sqlDb, 'custom_groups');
    const customRows = sqlRows(sqlDb, 'custom_records');
    if (!printRows.length && !orderRows.length && !budgetRows.length && !groupRows.length && !customRows.length) {
      alert('This SQLite file does not look like the Trini-D desktop database.');
      return;
    }
    const mappedItems = printRows.map(r => ({
      id: `DESKTOP-ITEM-${r.id}`,
      desktopId: r.id,
      createdAt: r.created_at || nowStamp(),
      orderId: r.order_id || '',
      customer: r.customer_name || '',
      model: r.model_name || '',
      datePrinted: r.date_printed || '',
      status: r.status || '',
      printTimeMinutes: num(r.print_time_minutes),
      lengthM: num(r.length_m),
      weightG: num(r.weight_g),
      electricityCost: num(r.electricity_cost),
      filamentCost: num(r.filament_cost),
      machineDepreciation: num(r.machine_depreciation),
      totalCost: num(r.total_cost),
      price: num(r.price),
      profit: num(r.price) - num(r.total_cost),
      notes: 'Imported from desktop SQLite database'
    }));
    const mappedOrders = orderRows.map(r => ({
      id: `DESKTOP-ORDER-${r.id}`,
      desktopId: r.id,
      createdAt: r.created_at || nowStamp(),
      orderId: r.order_id || '',
      customer: r.customer_name || '',
      model: r.model_name || '',
      datePrinted: r.date_printed || '',
      price: num(r.price),
      paidStatus: r.paid_status || '',
      paidMethod: r.paid_method || '',
      advancePayment: num(r.advance_payment),
      totalCost: num(r.total_cost),
      profitMargin: num(r.profit_margin),
      profit: num(r.profit),
      items: [],
      notes: 'Imported from desktop SQLite database'
    }));
    const mappedBudget = budgetRows.map(r => ({
      id: `DESKTOP-BUDGET-${r.id}`,
      desktopId: r.id,
      createdAt: r.created_at || nowStamp(),
      entryDate: r.entry_date || '',
      entryType: r.entry_type || '',
      category: r.category || '',
      description: r.description || '',
      amount: num(r.amount),
      method: r.payment_method || '',
      reference: r.reference || '',
      notes: r.notes || '',
      source: r.source || 'Manual',
      sourceTable: r.source_table || '',
      sourceId: r.source_id || 0
    }));
    const mappedGroups = groupRows.map(r => ({ id: `DESKTOP-GROUP-${r.id}`, desktopId: r.id, createdAt: r.created_at || nowStamp(), name: r.name || `Desktop Group ${r.id}` }));
    const mappedCustom = customRows.map(r => ({
      id: `DESKTOP-CUSTOM-${r.id}`,
      desktopId: r.id,
      createdAt: r.created_at || nowStamp(),
      groupId: `DESKTOP-GROUP-${r.group_id}`,
      sourceItemId: r.source_item_id ? `DESKTOP-ITEM-${r.source_item_id}` : '',
      orderId: r.order_id || '',
      customer: r.customer_name || '',
      model: r.model_name || '',
      datePrinted: r.date_printed || '',
      status: r.status || '',
      printTimeMinutes: num(r.print_time_minutes),
      lengthM: num(r.length_m),
      weightG: num(r.weight_g),
      electricityCost: num(r.electricity_cost),
      filamentCost: num(r.filament_cost),
      machineDepreciation: num(r.machine_depreciation),
      totalCost: num(r.total_cost),
      price: num(r.price),
      notes: r.notes || 'Imported from desktop SQLite database'
    }));
    // Exact replacement mode: an imported desktop SQLite database becomes the
    // complete latest admin database. It does NOT merge with old browser/cloud
    // records and it does NOT convert desktop orders into bill/invoice records.
    db = normalizeImportedAdminDb({
      config: db.config || defaultDb().config,
      selectedMaterialProfile: db.selectedMaterialProfile || 'PLA+',
      materialProfiles: db.materialProfiles || buildDefaultMaterialProfiles(db.config || defaultDb().config),
      itemRecords: mappedItems,
      orders: mappedOrders,
      invoices: [],
      quotes: [],
      budget: mappedBudget,
      customGroups: mappedGroups,
      customRecords: mappedCustom
    });
    saveDb();
    toast(`Desktop database replaced cloud: ${mappedItems.length} items, ${mappedOrders.length} orders, ${mappedBudget.length} budget records, ${mappedCustom.length} custom records`);
  } catch (err) {
    console.error(err);
    alert('Could not import SQLite directly. Use the included tools/convert_desktop_db_to_admin_json.py converter, then import the JSON file.');
  }
}

function initSettings() {
  $('#exportJsonBtn').addEventListener('click', exportJson);
  $('#saveSnapshotBtn').addEventListener('click', exportJson);
  $('#importJsonInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = normalizeImportedAdminDb(JSON.parse(reader.result));
        db = imported;
        saveDb();
        toast('JSON database imported and replaced cloud database');
      } catch (err) {
        alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
  });
  $('#importDesktopDbInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    importDesktopSqlite(file);
    e.target.value = '';
  });
  $('#clearDbBtn').addEventListener('click', () => {
    if (!confirm('This will clear the Firebase cloud admin database and the local cache. Continue?')) return;
    db = defaultDb();
    saveDb();
    toast('Cloud database cleared and replaced');
  });
}

function renderAll() {
  normalizeMaterialProfiles(db);
  renderMaterialProfileSelector();
  applyCalculatorConfigToForm(false);
  renderStats();
  renderCustomGroups();
  renderDatabaseSummary();
  renderDatabaseTable();
  renderBudget();
}

function init() {
  initAdminTheme();
  initFirebase();
  initAuth();
  initNavigation();
  initDatesAndIds();
  initCalculator();
  initBillQuote();
  initDatabase();
  initBudget();
  initSettings();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
