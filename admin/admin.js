'use strict';

const STORAGE_KEY = 'trinid_admin_database_v1';
const CLOUD_DOC_PATH = 'trinid/default';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowStamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const money = value => `Rs ${Number(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = value => Number(String(value ?? '').replace(/,/g, '').trim()) || 0;
const safe = value => String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
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
  return {
    config: { P: 7800, rho: 1.24, d_mm: 1.75, W: 120, R: 65, Cp: 95000, H: 5000, F: 0.05, Cups: 0, Hups: 0 },
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
    return { ...defaultDb(), ...(data || {}) };
  } catch (e) {
    return defaultDb();
  }
}

function saveDb(options = {}) {
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
    await firebaseStore.doc(CLOUD_DOC_PATH).set({
      database: firestoreSafe(db),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: firebaseUser.email || firebaseUser.uid,
      schemaVersion: 2
    }, { merge: true });
    cloudReady = true;
    setCloudStatus('Cloud: saved', 'ok');
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

function applyCalculatorConfigToForm(force = false) {
  const defaults = defaultDb().config;
  CONFIG_KEYS.forEach(key => {
    const el = $(`#${key}`);
    if (!el) return;
    if (!force && document.activeElement === el) return;
    const value = (db.config && db.config[key] !== undefined && db.config[key] !== null && db.config[key] !== '') ? db.config[key] : defaults[key];
    el.value = value;
  });
}

function saveCalculatorConfigFromForm(options = {}) {
  const { render = false } = options;
  db.config = {
    ...(db.config || defaultDb().config),
    ...Object.fromEntries(CONFIG_KEYS.map(key => [key, $(`#${key}`)?.value ?? '']))
  };
  saveDb({ render, cloud: true });
}

function scheduleCalculatorConfigSave() {
  clearTimeout(configSaveTimer);
  configSaveTimer = setTimeout(() => saveCalculatorConfigFromForm({ render: false }), 500);
}

function initCalculator() {
  applyCalculatorConfigToForm(true);
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
  const filamentCost = weightG * (values.P / 1000);
  const electricityCost = (values.W * T / 3600000) * values.R;
  const machineDepreciation = (values.Cp / values.H) * (T / 3600);
  const upsCost = values.Hups > 0 ? (values.Cups / values.Hups) * (T / 3600) : 0;
  const totalCost = (filamentCost + electricityCost + machineDepreciation + upsCost) / (1 - values.F);
  const marginRate = num($('#margin').value) / 100;
  const finalPrice = totalCost * (1 + marginRate);

  saveCalculatorConfigFromForm({ render: false });

  lastCalc = {
    id: id('ITEM'),
    createdAt: nowStamp(),
    customer: $('#calcCustomer').value.trim(),
    model: $('#calcModel').value.trim() || '3D Printed Item',
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
  $('#calcDays').value = '0'; $('#calcHours').value = '0'; $('#calcMinutes').value = '0';
  lastCalc = null;
  ['outLength', 'outWeight'].forEach(key => $(`#${key}`).textContent = key === 'outLength' ? '0.00 m' : '0.00 g');
  ['outElectricity', 'outFilament', 'outDepreciation', 'outTotalCost', 'outFinalPrice'].forEach(key => $(`#${key}`).textContent = 'Rs 0.00');
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
  if (type === 'bill') addBillRow({ model: result.model, qty: 1, unit: result.price, discount: 0, cost: result.totalCost });
  if (type === 'quote') addQuoteRow({ model: result.model, qty: 1, unit: result.price, weight: `${result.weightG.toFixed(2)} g`, printTime: minutesLabel(result.printTimeMinutes) });
  toast(`Calculator result added to ${type === 'bill' ? 'Bill' : 'Quotation'}`);
}

function minutesLabel(minutes) {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = Math.round(minutes % 60);
  return [d ? `${d}d` : '', h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ') || '0m';
}

function lineInput(value, cls = '', type = 'text') {
  return `<input class="${cls}" type="${type}" value="${safe(value ?? '')}">`;
}

function addBillRow(data = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${lineInput(data.model || '', 'model-input')}</td>
    <td>${lineInput(data.qty || 1, 'qty-input', 'number')}</td>
    <td>${lineInput(data.unit || '', 'unit-input', 'number')}</td>
    <td>${lineInput(data.discount || 0, 'discount-input', 'number')}</td>
    <td>${lineInput(data.cost || 0, 'cost-input', 'number')}</td>
    <td>${lineInput(data.layer || '', 'layer-input')}</td>
    <td><select class="walls-input"><option></option>${['1','2','3','4','5','6','Custom'].map(v => `<option${data.walls == v ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
    <td>${lineInput(data.infill || '', 'infill-input')}</td>
    <td><button class="row-delete" type="button">×</button></td>`;
  $('#billItemsBody').appendChild(tr);
  recalcBill();
}

function addQuoteRow(data = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${lineInput(data.model || '', 'model-input')}</td>
    <td>${lineInput(data.qty || 1, 'qty-input', 'number')}</td>
    <td>${lineInput(data.unit || '', 'unit-input', 'number')}</td>
    <td>${lineInput(data.layer || '', 'layer-input')}</td>
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
    qty: num($('.qty-input', tr).value) || 1,
    unitPrice: num($('.unit-input', tr).value),
    discount: num($('.discount-input', tr).value),
    cost: num($('.cost-input', tr).value),
    layer: $('.layer-input', tr).value.trim(),
    walls: $('.walls-input', tr).value.trim(),
    infill: $('.infill-input', tr).value.trim()
  })).filter(item => item.model);
}

function collectQuoteItems() {
  return $$('#quoteItemsBody tr').map(tr => ({
    model: $('.model-input', tr).value.trim(),
    qty: num($('.qty-input', tr).value) || 1,
    unitPrice: num($('.unit-input', tr).value),
    layer: $('.layer-input', tr).value.trim(),
    walls: $('.walls-input', tr).value.trim(),
    infill: $('.infill-input', tr).value.trim(),
    weight: $('.weight-input', tr).value.trim(),
    printTime: $('.time-input', tr).value.trim()
  })).filter(item => item.model);
}

function billTotals(items = collectBillItems()) {
  const subtotal = items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
  const discount = items.reduce((sum, item) => sum + item.discount, 0);
  const cost = items.reduce((sum, item) => sum + item.cost, 0);
  const total = Math.max(0, subtotal - discount);
  const advance = num($('#billAdvance').value);
  return { subtotal, discount, total, advance, balance: Math.max(0, total - advance), cost, profit: total - cost };
}

function quoteTotals(items = collectQuoteItems()) {
  return { total: items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0) };
}

function recalcBill() {
  const totals = billTotals();
  $('#billSubtotal').textContent = money(totals.subtotal);
  $('#billDiscount').textContent = money(totals.discount);
  $('#billGrandTotal').textContent = money(totals.total);
  $('#billBalance').textContent = money(totals.balance);
}

function recalcQuote() {
  $('#quoteGrandTotal').textContent = money(quoteTotals().total);
}

function initBillQuote() {
  addBillRow();
  addQuoteRow();
  $('#addBillRowBtn').addEventListener('click', () => addBillRow());
  $('#addQuoteRowBtn').addEventListener('click', () => addQuoteRow());
  $('#addCalcBillBtn').addEventListener('click', () => addCalculatorResultToLine('bill'));
  $('#addCalcQuoteBtn').addEventListener('click', () => addCalculatorResultToLine('quote'));
  $('#billItemsBody').addEventListener('input', recalcBill);
  $('#billItemsBody').addEventListener('change', recalcBill);
  $('#quoteItemsBody').addEventListener('input', recalcQuote);
  $('#quoteItemsBody').addEventListener('change', recalcQuote);
  $('#billAdvance').addEventListener('input', recalcBill);
  document.addEventListener('click', e => {
    if (e.target.classList.contains('row-delete')) {
      e.target.closest('tr').remove();
      recalcBill();
      recalcQuote();
    }
  });
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
  const invoiceRecord = {
    id: id('INVOICE'), createdAt: nowStamp(), invoiceNo: data.no, orderId: data.no, customer: data.customer,
    date: data.date, subtotal: totals.subtotal, discount: totals.discount, total: totals.total,
    advancePayment: totals.advance, balance: totals.balance, paidStatus: data.paidStatus, paidMethod: data.paidMethod,
    totalCost: totals.cost, profit: totals.profit, items, notes: data.notes
  };
  db.invoices.unshift(invoiceRecord);
  db.orders.unshift({
    id: id('ORDER'), createdAt: invoiceRecord.createdAt, orderId: data.no, customer: data.customer,
    model: items.map(item => item.model).join(', '), datePrinted: data.date, price: totals.total,
    paidStatus: data.paidStatus, paidMethod: data.paidMethod, advancePayment: totals.advance,
    totalCost: totals.cost, profit: totals.profit, items, notes: data.notes, invoiceId: invoiceRecord.id
  });
  saveDb();
  $('#invoiceNo').value = docId('INV');
  toast('Invoice saved to Bills / Invoices and Orders databases');
}

function generateQuotation(e) {
  e.preventDefault();
  const items = collectQuoteItems();
  if (!items.length) return alert('Please add at least one quotation item.');
  const totals = quoteTotals(items);
  const data = {
    type: 'QUOTATION',
    no: $('#quoteNo').value,
    date: $('#quoteDate').value || todayISO(),
    customer: $('#quoteCustomer').value.trim(),
    notes: $('#quoteNotes').value.trim(),
    items,
    totals
  };
  printDocument(data);
  db.quotes.unshift({ id: id('QUOTE'), createdAt: nowStamp(), quoteNo: data.no, customer: data.customer, date: data.date, total: totals.total, items, notes: data.notes });
  saveDb();
  $('#quoteNo').value = docId('QT');
  toast('Quotation saved to database');
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
  const formatMoneyDot = v => `Rs. ${formatNumber(v)}`;
  const normalizedLayer = item => item.layer ? `${safe(item.layer)}${String(item.layer).toLowerCase().includes('mm') ? '' : ' mm'}` : '';
  const normalizedInfill = item => item.infill ? `${safe(item.infill)}${String(item.infill).includes('%') ? '' : '%'}` : '';
  const preparedItems = data.items.map(item => ({
    ...item,
    qty: Number(item.qty || 1) || 1,
    unitPrice: Number(item.unitPrice || 0) || 0,
    discount: Number(item.discount || 0) || 0,
    layer: normalizedLayer(item),
    walls: safe(item.walls || ''),
    infill: normalizedInfill(item)
  }));
  const hasInvoiceDiscount = isInvoice && preparedItems.some(item => item.discount > 0);

  const quoteHeaders = `
    <div class="th c-model">MODEL / DESCRIPTION</div><div class="th c-qty">Quantity</div><div class="th c-unit">UNIT PRICE</div><div class="th c-layer">LAYER</div><div class="th c-walls">WALLS</div><div class="th c-infill">INFILL</div><div class="th c-total">TOTAL</div>`;
  const invoiceHeaders = hasInvoiceDiscount
    ? `<div class="th i-model-disc">MODEL / DESCRIPTION</div><div class="th i-qty-disc">Quantity</div><div class="th i-unit-disc">UNIT PRICE</div><div class="th i-discount-disc">DISCOUNT</div><div class="th i-total-disc">TOTAL</div>`
    : `<div class="th i-model">MODEL / DESCRIPTION</div><div class="th i-qty">Quantity</div><div class="th i-unit">UNIT PRICE</div><div class="th i-total">TOTAL</div>`;

  let rowTopPt = 0;
  const rows = preparedItems.map((item, index) => {
    const lineTotal = isInvoice ? Math.max(0, (item.qty * item.unitPrice) - item.discount) : (item.qty * item.unitPrice);
    const rowClass = index % 2 === 0 ? 'row-light' : 'row-white';
    if (!isInvoice) {
      const weight = item.weight || '';
      const printTime = item.printTime || item.print_time || '';
      const extra = weight || printTime ? 16 : 0;
      const top = rowTopPt;
      rowTopPt += 22 + extra;
      const sub = weight || printTime ? `<div class="quote-sub" style="top:22pt">${weight ? `⚖ ${safe(weight)}` : ''}${weight && printTime ? '   |   ' : ''}${printTime ? `⏱ ${safe(printTime)}` : ''}</div>` : '';
      return `<div class="doc-row quote-row ${rowClass}" style="top:${top}pt;height:${22 + extra}pt"><div class="td q-model">${safe(item.model).slice(0, 30)}</div><div class="td q-qty">${item.qty}</div><div class="td q-unit">${formatNumber(item.unitPrice)}</div><div class="td q-layer">${item.layer}</div><div class="td q-walls">${item.walls}</div><div class="td q-infill">${item.infill}</div><div class="td q-total">${formatMoneyDot(lineTotal)}</div>${sub}</div>`;
    }
    const hasSpecs = item.layer || item.walls || item.infill;
    const top = rowTopPt;
    rowTopPt += 22 + (hasSpecs ? 14 : 0);
    const specParts = [];
    if (item.layer) specParts.push(`Layer: ${item.layer}`);
    if (item.walls) specParts.push(`Walls: ${item.walls}`);
    if (item.infill) specParts.push(`Infill: ${item.infill}`);
    const specs = specParts.length ? `<span class="spec-tag">${safe(specParts.join('   ·   '))}</span>` : '';
    return hasInvoiceDiscount
      ? `<div class="doc-row inv-row ${rowClass}" style="top:${top}pt;height:${22 + (hasSpecs ? 14 : 0)}pt"><div class="td id-model-disc">${safe(item.model).slice(0, 44)}</div><div class="td id-qty-disc">${item.qty}</div><div class="td id-unit-disc">${formatMoneyDot(item.unitPrice)}</div><div class="td id-discount-disc">${item.discount > 0 ? `- ${formatMoneyDot(item.discount)}` : '-'}</div><div class="td id-total-disc">${formatMoneyDot(lineTotal)}</div>${specs ? `<div class="spec-line">${specs}</div>` : ''}</div>`
      : `<div class="doc-row inv-row ${rowClass}" style="top:${top}pt;height:${22 + (hasSpecs ? 14 : 0)}pt"><div class="td i-model">${safe(item.model).slice(0, 44)}</div><div class="td i-qty">${item.qty}</div><div class="td i-unit">${formatMoneyDot(item.unitPrice)}</div><div class="td i-total">${formatMoneyDot(lineTotal)}</div>${specs ? `<div class="spec-line">${specs}</div>` : ''}</div>`;
  }).join('');
  const tableHeightPt = 26 + rowTopPt;

  const totalsHtml = (() => {
    if (!isInvoice) {
      return `<div class="total-quote"><span>TOTAL QUOTE</span><b>${formatMoneyDot(data.totals.total)}</b></div>`;
    }
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

  const html = `<!doctype html><html><head><base href="${location.href}"><title>${filePrefix}_${safe(data.no)}.pdf</title><style>
    @page{size:A4;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#111111;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .print-btn{position:fixed;right:12px;top:12px;z-index:50;border:0;border-radius:999px;background:#d4af37;color:#111;font-weight:900;padding:10px 16px;box-shadow:0 10px 30px rgba(0,0,0,.25);cursor:pointer}
    .page{width:210mm;height:297mm;margin:0 auto;background:#fff;position:relative;overflow:hidden}
    .header{position:absolute;left:0;top:0;width:210mm;height:110pt;background:#111111;border-bottom:2.5pt solid #d4af37}
    .logo{position:absolute;left:18mm;top:16pt;width:78pt;height:78pt;object-fit:contain}
    .brand-name{position:absolute;left:139pt;top:22pt;width:180pt;height:46pt;object-fit:contain}
    .header-motto{position:absolute;left:139pt;top:76pt;width:180pt;text-align:center;font-size:6pt;font-weight:700;letter-spacing:.02em;white-space:nowrap;color:#e8e8e8;line-height:1}
    .header-motto .gold{color:#d4af37}
    .doc-title{position:absolute;right:18mm;top:35pt;text-align:right;color:#fff;font-size:20pt;font-weight:700;line-height:1;letter-spacing:.02em}
    .doc-id-top{position:absolute;right:18mm;top:67pt;text-align:right;color:#d4af37;font-size:9pt;line-height:1}
    .panel{position:absolute;left:18mm;top:120pt;width:174mm;height:68pt;background:#f2f2f2;border-radius:6pt}
    .label{font-size:8pt;font-weight:700;color:#2d2d2d;text-transform:uppercase;line-height:1}
    .customer-label{position:absolute;left:22mm;top:136pt}.customer-name{position:absolute;left:22mm;top:151pt;font-size:13pt;font-weight:700;color:#111;line-height:1}
    .date-label{position:absolute;left:405pt;top:133pt}.date-value{position:absolute;left:405pt;top:147pt;font-size:10pt;color:#111;line-height:1}
    .number-label{position:absolute;left:405pt;top:165pt}.number-value{position:absolute;left:405pt;top:178pt;font-size:8pt;font-weight:700;color:#d4af37;line-height:1}
    .table-wrap{position:absolute;left:18mm;top:194pt;width:174mm;height:${tableHeightPt}pt;border-bottom:.5pt solid #cccccc}
    .table-head{position:absolute;left:0;top:0;width:100%;height:26pt;background:#111111;border-bottom:1pt solid #d4af37;color:#d4af37;font-size:7.5pt;font-weight:700;text-transform:uppercase;line-height:1}
    .th{position:absolute;top:10pt;text-align:center;white-space:nowrap}.th:first-child{text-align:left}
    .doc-row{position:absolute;left:0;width:100%;font-size:9pt;color:#111;line-height:1}.row-light{background:#f2f2f2}.row-white{background:#ffffff}.td{position:absolute;top:8pt;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.q-model,.i-model,.i-model-disc,.id-model-disc{text-align:left;font-weight:700}.q-total,.i-total,.id-total-disc{font-weight:700;text-align:right}.q-unit,.q-layer,.q-walls,.q-infill,.id-qty-disc{color:#2d2d2d}.id-discount-disc{color:#cc3333}.quote-sub{position:absolute;left:4pt;font-size:7pt;font-style:italic;color:#cccccc;line-height:1}.spec-line{position:absolute;left:4pt;top:21pt}.spec-tag{display:inline-block;background:#2a2200;color:#d4af37;border-radius:2pt;padding:2pt 5pt;font-size:7pt;font-style:italic;line-height:1}
    .c-model{left:4pt;text-align:left}.c-qty{left:136pt;width:40pt}.c-unit{left:190pt;width:68pt}.c-layer{left:271pt;width:58pt}.c-walls{left:333pt;width:59pt}.c-infill{left:395pt;width:55pt}.c-total{right:4pt;width:64pt}
    .q-model{left:4pt;width:132pt}.q-qty{left:136pt;width:40pt;font-weight:700}.q-unit{left:190pt;width:68pt;font-size:8pt}.q-layer{left:271pt;width:58pt;font-size:8pt}.q-walls{left:333pt;width:59pt;font-size:8pt}.q-infill{left:395pt;width:55pt;font-size:8pt}.q-total{right:4pt;width:70pt}
    .i-model{left:4pt;width:200pt}.i-qty{right:306pt;width:42pt;text-align:right;font-weight:700}.i-unit{right:178pt;width:90pt;text-align:right}.i-total{right:4pt;width:95pt;text-align:right;font-weight:700}.i-model-disc{left:4pt;width:180pt}.i-qty-disc{right:360pt;width:42pt;text-align:right;font-weight:700}.i-unit-disc{right:248pt;width:90pt;text-align:right}.i-discount-disc{right:126pt;width:95pt;text-align:right}.i-total-disc{right:4pt;width:95pt;text-align:right}.id-model-disc{left:4pt;width:180pt}.id-qty-disc{right:360pt;width:42pt;text-align:right;font-weight:700}.id-unit-disc{right:248pt;width:90pt;text-align:right}.id-discount-disc{right:126pt;width:95pt;text-align:right}.id-total-disc{right:4pt;width:95pt;text-align:right;font-weight:700}
    .totals{position:absolute;right:18mm;top:${194 + tableHeightPt + 14}pt;width:90mm}.total-quote{height:24pt;background:#d4af37;color:#111;font-size:13pt;font-weight:700;display:flex;align-items:center;justify-content:space-between;padding:0 6pt}.total-main{height:20pt;background:#d4af37;color:#111;font-size:12pt;font-weight:700;display:flex;align-items:center;justify-content:space-between;padding:0 6pt}.total-mini{height:20pt;color:#111;font-size:9pt;display:flex;align-items:center;justify-content:space-between;padding:0 6pt}.total-mini.red span{color:#cc3333}.total-balance{height:20pt;background:#1a5c2a;color:#4ade80;font-size:12pt;font-weight:700;display:flex;align-items:center;justify-content:space-between;padding:0 6pt}
    .notes{position:absolute;left:18mm;top:${194 + tableHeightPt + 64}pt;font-size:8pt;line-height:12pt;color:#111}.notes b{display:block;color:#2d2d2d;margin-bottom:4pt}.notes span{display:block}
    .footer{position:absolute;left:0;bottom:14mm;width:210mm;height:90pt;background:#111111;border-top:2pt solid #d4af37;color:#fff}.footer-title{position:absolute;left:18mm;top:20pt;font-size:13pt;font-weight:700;color:#d4af37;line-height:1}.footer-phone{position:absolute;left:18mm;top:37pt;font-size:8.5pt;line-height:1;color:#fff}.footer-wa{position:absolute;left:18mm;top:51pt;font-size:8.5pt;line-height:1;color:#fff}.footer-motto{position:absolute;left:18mm;top:64pt;font-size:7.5pt;font-style:italic;color:#cccccc;line-height:1}.qr{position:absolute;right:18mm;top:11pt;width:68pt;height:68pt;background:#fff}.qr-caption{position:absolute;right:18mm;top:81pt;width:68pt;text-align:center;color:#cccccc;font-size:6.5pt;line-height:1}.page-line{position:absolute;left:0;right:0;bottom:0;height:12mm;line-height:12mm;text-align:center;color:#cccccc;font-size:7pt}
    @media print{html,body{width:210mm;height:297mm;background:#fff}.print-btn{display:none}.page{margin:0;width:210mm;height:297mm}}
  </style></head><body><button class="print-btn" onclick="window.print()">Print / Save PDF</button><div class="page"><header class="header"><img class="logo" src="../assets/logo.png" alt="Trini-D logo"><img class="brand-name" src="../assets/brand_name.png" alt="TRINI-D 3D Printing"><div class="header-motto">THREE&nbsp; DIMENTIONS&nbsp;&nbsp; - &nbsp;&nbsp;<span class="gold">ENDLESS</span>&nbsp; POSSIBILITIES</div><div class="doc-title">${docWord}</div><div class="doc-id-top"># ${safe(data.no)}</div></header><section class="panel"></section><div class="label customer-label">${partyLabel}</div><div class="customer-name">${safe(data.customer || 'Customer')}</div><div class="label date-label">DATE</div><div class="date-value">${safe(dateText)}</div><div class="label number-label">${docNoLabel}</div><div class="number-value">${safe(data.no)}</div><section class="table-wrap"><div class="table-head">${isInvoice ? invoiceHeaders : quoteHeaders}</div><div class="rows" style="position:absolute;left:0;top:26pt;width:100%;height:${rowTopPt}pt">${rows}</div></section><section class="totals">${totalsHtml}</section>${notesHtml}<footer class="footer"><div class="footer-title">${thanks}</div><div class="footer-phone">☎ &nbsp;071 93 35 411&nbsp;&nbsp; | &nbsp;&nbsp;078 55 24 561</div><div class="footer-wa">WhatsApp: +94 75 16 56 777</div><div class="footer-motto">Three Dimensions - Endless Possibilities</div><img class="qr" src="../assets/whatsapp-qr.png" alt="WhatsApp QR"><div class="qr-caption">Scan to WhatsApp us</div></footer><div class="page-line">Page 1 of 1 &nbsp; · &nbsp; TRINI-D &nbsp; · &nbsp; Three Dimensions - Endless Possibilities</div></div><script>window.onload = () => setTimeout(() => window.print(), 350);</script></body></html>`;
  const win = window.open('', '_blank');
  win.document.open();
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

function deleteRecord(recordId, kind) {
  if (!confirm('Delete this record?')) return;
  const map = { item: 'itemRecords', order: 'orders', invoice: 'invoices', quote: 'quotes', budget: 'budget', custom: 'customRecords' };
  const key = map[kind];
  db[key] = db[key].filter(item => item.id !== recordId);
  saveDb();
}

function itemToBillData(item) {
  return {
    model: item.model || item.model_name || '3D print item',
    qty: 1,
    unit: round2(item.price),
    discount: 0,
    cost: round2(item.totalCost),
    layer: item.layer || item.layerHeight || '',
    walls: item.walls || item.wallLoops || '',
    infill: item.infill || ''
  };
}

function itemToOrderData(item, overrideOrderId = null) {
  const price = round2(item.price);
  const totalCost = round2(item.totalCost);
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
  const price = items.reduce((sum, item) => sum + round2(item.price), 0);
  const totalCost = items.reduce((sum, item) => sum + round2(item.totalCost), 0);
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
    headers = '<tr><th>✓</th><th>Date</th><th>Customer</th><th>Model</th><th>Status</th><th>Print Time</th><th>Weight</th><th>Cost</th><th>Price</th><th>Profit</th><th>Actions</th></tr>';
    body = rows.map(r => `<tr><td><input class="item-select" type="checkbox" value="${r.id}" ${selectedItemIds.has(r.id) ? 'checked' : ''}></td><td>${safe(r.datePrinted || r.createdAt)}</td><td>${safe(r.customer)}</td><td>${safe(r.model)}</td><td><span class="pill-status ${String(r.status).toLowerCase()}">${safe(r.status)}</span></td><td>${minutesLabel(r.printTimeMinutes)}</td><td>${Number(r.weightG || 0).toFixed(2)} g</td><td>${money(r.totalCost)}</td><td>${money(r.price)}</td><td>${money(r.profit)}</td><td class="row-actions"><button class="small-btn" data-item-to-order="${r.id}">Order</button><button class="small-btn" data-item-to-bill="${r.id}">Bill</button><button class="small-btn" data-delete="${r.id}" data-kind="item">Delete</button></td></tr>`).join('');
  }
  if (activeDbTable === 'orders') {
    rows = db.orders.filter(include);
    headers = '<tr><th>Date</th><th>Order ID</th><th>Customer</th><th>Model</th><th>Paid Status</th><th>Advance</th><th>Cost</th><th>Price</th><th>Profit</th><th></th></tr>';
    body = rows.map(r => {
      const paidStatus = normalizePaidStatus(r.paidStatus) || 'Unpaid';
      return `<tr><td>${safe(r.datePrinted)}</td><td>${safe(r.orderId)}</td><td>${safe(r.customer)}</td><td>${safe(r.model)}</td><td><select class="order-paid-select ${paidStatus.toLowerCase()}" data-order-paid="${r.id}"><option value="Paid" ${paidStatus === 'Paid' ? 'selected' : ''}>Paid</option><option value="Unpaid" ${paidStatus === 'Unpaid' ? 'selected' : ''}>Unpaid</option></select></td><td>${money(r.advancePayment)}</td><td>${money(r.totalCost)}</td><td>${money(r.price)}</td><td>${money(r.profit)}</td><td><button class="small-btn" data-delete="${r.id}" data-kind="order">Delete</button></td></tr>`;
    }).join('');
  }
  if (activeDbTable === 'invoices') {
    rows = (db.invoices || []).filter(include);
    headers = '<tr><th>Date</th><th>Invoice No</th><th>Customer</th><th>Items</th><th>Paid</th><th>Subtotal</th><th>Discount</th><th>Advance</th><th>Balance</th><th>Total</th><th></th></tr>';
    body = rows.map(r => `<tr><td>${safe(r.date)}</td><td>${safe(r.invoiceNo || r.orderId)}</td><td>${safe(r.customer)}</td><td>${safe((r.items || []).map(i => i.model).join(', '))}</td><td><span class="pill-status ${String(r.paidStatus || '').toLowerCase()}">${safe(r.paidStatus || '-')}</span></td><td>${money(r.subtotal)}</td><td>${money(r.discount)}</td><td>${money(r.advancePayment)}</td><td>${money(r.balance)}</td><td>${money(r.total)}</td><td><button class="small-btn" data-delete="${r.id}" data-kind="invoice">Delete</button></td></tr>`).join('');
  }
  if (activeDbTable === 'quotes') {
    rows = db.quotes.filter(include);
    headers = '<tr><th>Date</th><th>Quote No</th><th>Customer</th><th>Items</th><th>Total</th><th></th></tr>';
    body = rows.map(r => `<tr><td>${safe(r.date)}</td><td>${safe(r.quoteNo)}</td><td>${safe(r.customer)}</td><td>${safe((r.items || []).map(i => i.model).join(', '))}</td><td>${money(r.total)}</td><td><button class="small-btn" data-delete="${r.id}" data-kind="quote">Delete</button></td></tr>`).join('');
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
      <small>${unpaidOrders.length} unpaid / advance orders</small>
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
  return {
    ...defaultDb(),
    ...imported,
    itemRecords: imported.itemRecords || imported.items || [],
    orders: imported.orders || [],
    invoices: imported.invoices || imported.bills || [],
    quotes: imported.quotes || [],
    budget: imported.budget || imported.budgetRecords || [],
    customGroups: imported.customGroups || [],
    customRecords: imported.customRecords || []
  };
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
    const a = upsertMany(db.itemRecords, mappedItems);
    const mappedInvoices = mappedOrders.map(order => ({
      id: order.id.replace('DESKTOP-ORDER-', 'DESKTOP-INVOICE-'),
      desktopId: order.desktopId,
      createdAt: order.createdAt,
      invoiceNo: order.orderId,
      orderId: order.orderId,
      customer: order.customer,
      date: order.datePrinted,
      subtotal: order.price,
      discount: 0,
      total: order.price,
      advancePayment: order.advancePayment,
      balance: Math.max(0, num(order.price) - num(order.advancePayment)),
      paidStatus: order.paidStatus,
      paidMethod: order.paidMethod,
      totalCost: order.totalCost,
      profit: order.profit,
      items: order.items || [],
      notes: order.notes
    }));
    const b = upsertMany(db.orders, mappedOrders);
    const bi = upsertMany(db.invoices, mappedInvoices);
    const c = upsertMany(db.budget, mappedBudget);
    const d = upsertMany(db.customGroups, mappedGroups);
    const e = upsertMany(db.customRecords, mappedCustom);
    saveDb();
    toast(`Desktop database imported: ${a.added + b.added + bi.added + c.added + d.added + e.added} new, ${a.updated + b.updated + bi.updated + c.updated + d.updated + e.updated} updated`);
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
        toast('JSON database imported');
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
    toast('Cloud database cleared');
  });
}

function renderAll() {
  applyCalculatorConfigToForm(false);
  renderStats();
  renderCustomGroups();
  renderDatabaseSummary();
  renderDatabaseTable();
  renderBudget();
}

function init() {
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
