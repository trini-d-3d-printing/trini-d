import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (s) => document.querySelector(s);
const fileInput = $('#stlFile');
const uploadZone = $('#uploadZone');
const viewer = $('#stlViewer');
const canvas = $('#stlCanvas');
const loading = $('#sqLoading');
const resetViewBtn = $('#resetViewBtn');
const uploadAnotherBtn = $('#uploadAnotherBtn');
const sendToQuoteBtn = $('#sendToQuoteBtn');
const materialSelect = $('#sqMaterial');
const qualitySelect = $('#sqQuality');
const colorSelect = $('#sqColor');
const wallSelect = $('#sqWalls');
const infill = $('#sqInfill');
const quantity = $('#sqQuantity');
const estimatePriceBtn = $('#estimatePriceBtn');
function normalizeApiUrl(value){
  return String(value || '').trim().replace(/\/+$/, '');
}

function isLocalApiUrl(value){
  try{
    const url = new URL(value);
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  }catch{
    return false;
  }
}

function isLocalPage(){
  return location.protocol === 'file:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost';
}

let API_URLS = [];
let lastWorkingApiUrl = normalizeApiUrl(localStorage.getItem('trinid-smartquote-working-api'));
let lastEstimate = null;
let PUBLIC_PRICING_PROFILES = {};
const apiHealthCache = new Map();

function setConfiguredApiUrl(cloudUrl = ''){
  const next = [];
  const add = (value) => {
    const url = normalizeApiUrl(value);
    if(!url || next.includes(url)) return;
    // A public HTTPS page must use a public HTTPS API. Local HTTP endpoints are
    // kept only for localhost/file testing so they cannot hide the real error.
    if(!isLocalPage() && isLocalApiUrl(url)) return;
    if(!isLocalPage() && !/^https:\/\//i.test(url)) return;
    next.push(url);
  };

  // Firebase Admin value has first priority. The bundled config remains a safe
  // fallback when Firebase is unavailable, blank, cached, or still updating.
  add(cloudUrl);
  add(window.TRINID_QUOTE_API_URL);
  if(Array.isArray(window.TRINID_QUOTE_API_URLS)){
    window.TRINID_QUOTE_API_URLS.forEach(add);
  }

  const changed = next.join('|') !== API_URLS.join('|');
  API_URLS = next;
  if(lastWorkingApiUrl && !API_URLS.includes(lastWorkingApiUrl)){
    lastWorkingApiUrl = '';
    localStorage.removeItem('trinid-smartquote-working-api');
  }
  apiMode();
  return changed;
}

const MATERIALS = {
  'PLA+': { density: 1.25, priceKg: 5400, colors: ['Black','White','Gray','Red','Blue','Green','Yellow','Orange','Gold','Silver','Transparent','Natural'], best: 'General purpose', description: 'Reliable general-purpose material for prototypes, models, gifts and everyday functional parts.' },
  'PLA':  { density: 1.24, priceKg: 5000, colors: ['Black','White','Gray','Red','Blue','Green'], best: 'Models & prototypes', description: 'Easy-printing material for visual models, prototypes and low-load functional parts.' },
  'PETG+': { density: 1.27, priceKg: 6200, colors: ['Black','White','Gray','Red','Blue','Green','Yellow','Orange','Gold','Silver','Transparent','Natural'], best: 'Durable parts', description: 'Tougher PETG+ material with good layer adhesion for practical and more durable components.' },
  'PETG': { density: 1.27, priceKg: 6200, colors: ['Black','White','Gray','Transparent','Blue'], best: 'Durable parts', description: 'Tougher material with good layer adhesion for practical and more durable components.' },
  'TPU':  { density: 1.21, priceKg: 7500, colors: ['Black','White','Red','Blue'], best: 'Flexible parts', description: 'Flexible material for grips, bumpers, soft-touch parts and components that need bending.' },
  'ABS':  { density: 1.04, priceKg: 5800, colors: ['Black','White','Gray'], best: 'Technical parts', description: 'Technical material for stronger parts where the print setup and model geometry are suitable.' }
};
const QUALITY = {
  draft:    { layer: 0.28, timeFactor: 0.82, flow: 6.2 },
  standard: { layer: 0.20, timeFactor: 1.00, flow: 5.5 },
  high:     { layer: 0.16, timeFactor: 1.22, flow: 5.0 },
  ultra:    { layer: 0.12, timeFactor: 1.55, flow: 4.4 }
};
const MODEL_COLORS = { Black:0x4a4f59, White:0xe7e9ed, Gray:0x7a808b, Red:0xc63a3a, Blue:0x315dca, Green:0x3f8d55, Yellow:0xf0d247, Orange:0xe87425, Gold:0xd6a11d, Silver:0xb8bec8, Transparent:0x9fcbd0, Natural:0xe6d2a8 };
const PRICING = { powerW:150, electricityPerKWh:70, printerCost:140000, printerLifeHours:2000, profitMargin:75, filamentDiameterMm:1.75 };
const SMARTQUOTE_CONFIG_DOC_PATH = 'trinid/default/public/smartquote';
let smartQuoteConfigUnsubscribe = null;

let renderer, scene, camera, controls, mesh;
let modelData = null;
let currentFile = null;

function ceilRs(v){ return Math.ceil(Math.max(0, Number(v) || 0)); }
function clamp(v,min,max){ return Math.min(max,Math.max(min,v)); }
function fmt(n,d=2){ return Number(n||0).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}); }
function fmtBytes(bytes){ if(bytes < 1024) return `${bytes} B`; if(bytes < 1024**2) return `${fmt(bytes/1024,1)} KB`; return `${fmt(bytes/1024**2,1)} MB`; }
function fmtTime(minutes){ const total=Math.max(0,Math.round(minutes)); const d=Math.floor(total/1440); const h=Math.floor((total%1440)/60); const m=total%60; return [d?`${d}d`:null,h?`${h}h`:null,(m||(!d&&!h))?`${m}m`:null].filter(Boolean).join(' '); }
function supportLabel(value){ return 'Tree / Organic Auto'; }
function selectedWalls(){ return clamp(parseInt(wallSelect?.value || '2',10) || 2,1,6); }
function selectedSupport(){ return 'tree-auto'; }
function apiMode(){
  const notice = $('#apiModeNotice');
  if(!notice) return;
  if(API_URLS.length){
    const mode = isLocalPage() ? 'local/public' : 'public HTTPS';
    notice.innerHTML = `<b>API status:</b> ${mode} backend configured. Endpoint: ${API_URLS[0]}`;
  }else{
    notice.innerHTML = '<b>API status:</b> Public Smart Quote backend URL is not configured.';
  }
}

function showLoading(message){
  if(loading){
    const label = loading.querySelector('b');
    if(label) label.textContent = message || 'Analyzing model…';
    loading.hidden = false;
  }
}
function hideLoading(){ if(loading) loading.hidden = true; }


function normalizeCloudProfitMargin(value){
  const n=Number(String(value ?? '').replace(/,/g,'').trim());
  if(!Number.isFinite(n)) return 75;
  return Math.max(0,Math.min(1000,n));
}

function normalizePublicPricingProfile(raw, fallbackName=''){
  if(!raw || typeof raw !== 'object') return null;
  const number = (key, fallback=0) => {
    const value = Number(String(raw[key] ?? fallback).replace(/,/g,'').trim());
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    profileName: String(raw.profileName || fallbackName || '').trim(),
    P: number('P'),
    rho: number('rho', 1.24),
    d_mm: number('d_mm', 1.75),
    W: number('W'),
    R: number('R'),
    Cp: number('Cp'),
    H: number('H'),
    F: number('F'),
    Cups: number('Cups'),
    Hups: number('Hups')
  };
}

function setPublicPricingProfiles(raw){
  const next = {};
  if(raw && typeof raw === 'object'){
    for(const key of ['PLA+','PETG+']){
      const profile = normalizePublicPricingProfile(raw[key], key);
      if(profile) next[key] = profile;
    }
  }
  const changed = JSON.stringify(next) !== JSON.stringify(PUBLIC_PRICING_PROFILES);
  PUBLIC_PRICING_PROFILES = next;
  return changed;
}

function selectedPublicPricingProfile(){
  return PUBLIC_PRICING_PROFILES[materialSelect?.value] || null;
}

async function initSmartQuoteCloudConfig(){
  if(!window.firebase || !window.TRINID_FIREBASE_CONFIG){
    console.warn('Smart Quote cloud margin unavailable; using fallback 75%.');
    return;
  }
  try{
    const fb=window.firebase;
    fb.apps && fb.apps.length ? fb.app() : fb.initializeApp(window.TRINID_FIREBASE_CONFIG);
    const auth=fb.auth();
    const store=fb.firestore();
    try{ await auth.setPersistence(fb.auth.Auth.Persistence.LOCAL); }catch(e){}
    if(!auth.currentUser) await auth.signInAnonymously();
    if(smartQuoteConfigUnsubscribe) smartQuoteConfigUnsubscribe();
    smartQuoteConfigUnsubscribe=store.doc(SMARTQUOTE_CONFIG_DOC_PATH).onSnapshot(snapshot=>{
      const data=snapshot.exists ? (snapshot.data()||{}) : {};
      const nextMargin=normalizeCloudProfitMargin(data.profitMargin);
      const marginChanged=nextMargin!==PRICING.profitMargin;
      PRICING.profitMargin=nextMargin;
      const apiChanged=setConfiguredApiUrl(data.backendApiUrl || data.publicApiUrl || '');
      const pricingChanged=setPublicPricingProfiles(data.pricingProfiles || {});
      if((marginChanged || apiChanged || pricingChanged) && modelData) markEstimatePending('Pricing/settings updated. Click Estimate Price again.');
      console.info(`Smart Quote config synced: margin ${PRICING.profitMargin}%, API ${API_URLS[0] || 'not configured'}, public pricing ${Object.keys(PUBLIC_PRICING_PROFILES).join(', ') || 'fallback'}`);
    },err=>{
      console.warn('Smart Quote margin listener failed; using current fallback.',err);
    });
  }catch(err){
    console.warn('Smart Quote anonymous cloud config failed; using fallback 75%.',err);
  }
}

function initViewer(){
  renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42,1,0.1,10000);
  camera.position.set(120,100,150);
  controls = new OrbitControls(camera,canvas);
  controls.enableDamping=true; controls.dampingFactor=.08;
  scene.add(new THREE.HemisphereLight(0xffffff,0x353842,2.2));
  const key=new THREE.DirectionalLight(0xffe1a0,3.2); key.position.set(100,160,120); scene.add(key);
  const rim=new THREE.DirectionalLight(0x9db7ff,1.5); rim.position.set(-120,60,-100); scene.add(rim);
  const grid=new THREE.GridHelper(300,20,0xd6a11d,0x777d88); grid.material.opacity=.18; grid.material.transparent=true; scene.add(grid);
  const animate=()=>{ requestAnimationFrame(animate); controls.update(); renderer.render(scene,camera); };
  animate(); resizeViewer();
}
function resizeViewer(){
  if(!renderer || !viewer) return;
  const r=viewer.getBoundingClientRect();
  const w=Math.max(320,Math.round(r.width||viewer.clientWidth||720));
  const h=Math.max(320,Math.round(r.height||viewer.clientHeight||455));
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize',resizeViewer);

const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));


function resetSmartQuoteIdleState(){
  // Fresh page load/refresh must show the upload area, not an analysis spinner.
  if(loading){
    loading.hidden=true;
    const label=loading.querySelector('b');
    if(label) label.textContent='Analyzing model…';
  }
  if(!currentFile && !modelData){
    uploadZone.style.removeProperty('display');
    uploadZone.hidden=false;
    canvas.hidden=true;
    resetViewBtn.disabled=true;
    uploadAnotherBtn.disabled=true;
    sendToQuoteBtn.disabled=true;
    if(estimatePriceBtn) estimatePriceBtn.disabled=true;
    const name=$('#viewerFileName');
    if(name) name.textContent='No model loaded';
  }
}

function setAnalysisStatus(message){
  const label = loading?.querySelector('b');
  if(label) label.textContent = message;
}

async function geometryStats(geometry){
  geometry.computeBoundingBox();
  const box=geometry.boundingBox;
  const size=new THREE.Vector3(); box.getSize(size);
  const pos=geometry.attributes.position.array;
  const triangles=Math.floor(pos.length/9);
  let signedVolume=0, surfaceArea=0;

  // Process large STL files in chunks. The old implementation created several
  // THREE.Vector3 objects for every triangle and blocked the browser UI on
  // high-triangle-count models. Raw numeric math is much faster and yielding
  // between chunks keeps the loading indicator and page responsive.
  const chunkTriangles=25000;
  for(let t=0;t<triangles;t++){
    const i=t*9;
    const ax=pos[i], ay=pos[i+1], az=pos[i+2];
    const bx=pos[i+3], by=pos[i+4], bz=pos[i+5];
    const cx=pos[i+6], cy=pos[i+7], cz=pos[i+8];

    // Signed tetrahedron volume: dot(a, cross(b,c)) / 6.
    const bxcx=by*cz-bz*cy;
    const bxcy=bz*cx-bx*cz;
    const bxcz=bx*cy-by*cx;
    signedVolume += (ax*bxcx + ay*bxcy + az*bxcz)/6;

    // Triangle area: |cross(b-a,c-a)| / 2.
    const abx=bx-ax, aby=by-ay, abz=bz-az;
    const acx=cx-ax, acy=cy-ay, acz=cz-az;
    const crx=aby*acz-abz*acy;
    const cry=abz*acx-abx*acz;
    const crz=abx*acy-aby*acx;
    surfaceArea += Math.hypot(crx,cry,crz)/2;

    if((t+1)%chunkTriangles===0 && t+1<triangles){
      const pct=Math.min(99,Math.round((t+1)/triangles*100));
      setAnalysisStatus(`Analyzing model… ${pct}%`);
      await nextPaint();
    }
  }
  return { size, volumeMm3:Math.abs(signedVolume), surfaceAreaMm2:surfaceArea, triangles };
}

function fitCamera(){
  if(!mesh || !camera || !controls) return;
  mesh.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(mesh);
  if(box.isEmpty()) return;
  const size=box.getSize(new THREE.Vector3());
  const center=box.getCenter(new THREE.Vector3());
  const maxDim=Math.max(size.x,size.y,size.z,1);

  // Frame the complete model with extra margin. This is intentionally more
  // conservative than the old camera distance so flat/tall STL files are not
  // clipped or placed behind the near plane.
  const fov=THREE.MathUtils.degToRad(camera.fov);
  const fitHeightDistance=maxDim/(2*Math.tan(fov/2));
  const fitWidthDistance=fitHeightDistance/Math.max(camera.aspect,0.2);
  const distance=Math.max(fitHeightDistance,fitWidthDistance)*2.15;

  camera.near=Math.max(0.01,maxDim/10000);
  camera.far=Math.max(5000,maxDim*100);
  camera.position.set(
    center.x+distance*0.72,
    center.y+distance*0.55,
    center.z+distance
  );
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.minDistance=Math.max(maxDim*0.05,0.01);
  controls.maxDistance=Math.max(maxDim*50,1000);
  controls.update();
  renderer.render(scene,camera);
}

function applyModelColor(){ if(!mesh) return; const color=MODEL_COLORS[colorSelect.value] ?? 0x8a909b; mesh.material.color.setHex(color); mesh.material.roughness=.48; mesh.material.metalness=colorSelect.value==='Gold'?.22:.05; }

async function showPreviewCanvas(){
  // Explicitly remove the hidden state before measuring the viewer. Some
  // browsers can keep a WebGL canvas at a stale 1x1/zero-like drawing buffer
  // when it was initialized while hidden.
  uploadZone.hidden=true;
  uploadZone.style.display='none';
  canvas.hidden=false;
  canvas.removeAttribute('hidden');
  canvas.style.display='block';
  await nextPaint();
  resizeViewer();
  await nextPaint();
}


async function loadSTL(file){
  if(!file) return;
  if(!file.name.toLowerCase().endsWith('.stl')) return alert('Please select a valid .STL file.');
  if(file.size>50*1024*1024) return alert('Maximum STL file size is 50 MB.');
  loading.hidden=false;
  setAnalysisStatus('Reading STL file…');
  await nextPaint();
  try{
    const buffer=await file.arrayBuffer();
    setAnalysisStatus('Parsing STL geometry…');
    await nextPaint();
    const geometry=new STLLoader().parse(buffer);
    if(!geometry.attributes.position || geometry.attributes.position.count<3) throw new Error('The STL contains no valid triangles.');

    const triangleCount=Math.floor(geometry.attributes.position.count/3);
    if(triangleCount>1500000) throw new Error(`This STL is extremely detailed (${triangleCount.toLocaleString()} triangles). Please simplify it below 1,500,000 triangles and try again.`);

    // STLLoader normally provides facet normals already. Recomputing all normals
    // for large files can freeze the browser, so only do it when they are absent.
    if(!geometry.attributes.normal) geometry.computeVertexNormals();
    geometry.center();
    setAnalysisStatus('Analyzing model… 0%');
    const stats=await geometryStats(geometry);
    if(!isFinite(stats.volumeMm3) || stats.volumeMm3<=0) throw new Error('Could not calculate a closed model volume. The STL may be open or damaged.');
    if(mesh){ scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
    mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({
      color:MODEL_COLORS[colorSelect.value]||0x4a4f59,
      roughness:.42,
      metalness:.04,
      side:THREE.DoubleSide,
      flatShading:false
    }));
    mesh.rotation.x=-Math.PI/2;
    mesh.castShadow=false;
    mesh.receiveShadow=false;
    scene.add(mesh);
    mesh.updateMatrixWorld(true);

    currentFile=file;
    modelData={...stats,fileName:file.name,fileSize:file.size};

    // Make the canvas visible and give WebGL a real drawing-buffer size BEFORE
    // fitting the camera. This fixes blank previews after a successful upload.
    await showPreviewCanvas();
    resetViewBtn.disabled=false;
    uploadAnotherBtn.disabled=false;
    sendToQuoteBtn.disabled=true;
    if(estimatePriceBtn) estimatePriceBtn.disabled=false;
    $('#viewerFileName').textContent=file.name;
    applyModelColor();
    fitCamera();
    renderer.render(scene,camera);
    markEstimatePending('Model ready. Choose the settings, then click Estimate Price.');
  }catch(err){ console.error(err); alert(`Could not analyze this STL. ${err.message||''}`); }
  finally{ loading.hidden=true; setAnalysisStatus('Analyzing model…'); if(mesh){ resizeViewer(); fitCamera(); renderer.render(scene,camera); } }
}

function browserEstimate(){
  const q=QUALITY[qualitySelect.value];
  const mat=MATERIALS[materialSelect.value];
  const infillRatio=Number(infill.value)/100;
  const wallLoops=selectedWalls();
  const supportMode=selectedSupport();
  const supportFactor=supportMode==='normal-auto'?1.25:(supportMode==='buildplate-tree'?1.14:1.18);
  const qty=clamp(parseInt(quantity.value||'1',10)||1,1,100);
  quantity.value=qty;
  const solid=modelData.volumeMm3;
  const surface=modelData.surfaceAreaMm2;
  const shellThickness=(0.45*wallLoops)*Math.pow(0.20/q.layer,0.08);
  const shellVolume=Math.min(solid*0.72,surface*shellThickness);
  const inner=Math.max(0,solid-shellVolume);
  const extrusionVolume=(shellVolume+inner*infillRatio)*1.08*supportFactor;
  const weightG=extrusionVolume/1000*mat.density;
  const filamentArea=Math.PI*Math.pow(PRICING.filamentDiameterMm/2,2);
  const lengthM=extrusionVolume/filamentArea/1000;
  const complexity=clamp(1+(surface/Math.max(solid,1))*0.9,1,1.45);
  const layers=Math.max(1,modelData.size.z/q.layer);
  const timeSeconds=(extrusionVolume/q.flow)*q.timeFactor*complexity*1.16*supportFactor + layers*2.5;
  const timeMinutes=timeSeconds/60;
  const hours=timeMinutes/60;
  const filamentCost=weightG/1000*mat.priceKg;
  const electricityCost=hours*(PRICING.powerW/1000)*PRICING.electricityPerKWh;
  const machineCost=hours*(PRICING.printerCost/PRICING.printerLifeHours);
  const unitCost=filamentCost+electricityCost+machineCost;
  const unitPrice=ceilRs(unitCost*(1+PRICING.profitMargin/100));
  const totalPrice=ceilRs(unitCost*qty*(1+PRICING.profitMargin/100));
  return {
    source:'browser-preliminary', slicerEngine:'', fileName:currentFile.name,
    material:materialSelect.value, color:colorSelect.value, quality:qualitySelect.options[qualitySelect.selectedIndex].text, qualityKey:qualitySelect.value,
    layerHeightMm:q.layer, wallLoops, support:supportMode, supportLabel:supportLabel(supportMode), infill:Number(infill.value), quantity:qty,
    dimensions:{x:modelData.size.x,y:modelData.size.y,z:modelData.size.z}, triangles:modelData.triangles, solidVolumeCm3:solid/1000,
    printTimeMinutes:timeMinutes*qty, unitPrintTimeMinutes:timeMinutes, weightG:weightG*qty, unitWeightG:weightG, filamentLengthM:lengthM*qty, unitFilamentLengthM:lengthM,
    unitPrice,totalPrice, profitMargin:PRICING.profitMargin, createdAt:new Date().toISOString(), stage:'browser-preliminary',
    costBreakdown:{filament:ceilRs(filamentCost),electricity:ceilRs(electricityCost),machine:ceilRs(machineCost),risk:0,totalCost:ceilRs(unitCost),profit:ceilRs(unitPrice-unitCost)}
  };
}

function buildQuoteFormData(){
  const fd=new FormData();
  fd.append('model_file', currentFile, currentFile.name);
  fd.append('material', materialSelect.value);
  fd.append('color', colorSelect.value);
  fd.append('quality', qualitySelect.value);
  fd.append('infill', infill.value);
  fd.append('walls', String(selectedWalls()));
  fd.append('quantity', quantity.value || '1');
  fd.append('profit_margin', String(PRICING.profitMargin));
  const publicProfile=selectedPublicPricingProfile();
  if(publicProfile) fd.append('pricing_profile', JSON.stringify(publicProfile));
  return fd;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try{
    return await fetch(url, {...options, signal: controller.signal});
  }catch(err){
    if(err?.name === 'AbortError') throw new Error(`Request timed out after ${Math.round(timeoutMs/1000)} seconds`);
    throw err;
  }finally{
    clearTimeout(timer);
  }
}

async function verifyApiHealth(baseUrl){
  const cachedAt = apiHealthCache.get(baseUrl) || 0;
  if(Date.now() - cachedAt < 60000) return;
  const res = await fetchWithTimeout(`${baseUrl}/health`, {
    method:'GET', mode:'cors', credentials:'omit', cache:'no-store'
  }, 12000);
  let json = null;
  try{ json = await res.json(); }catch{}
  if(!res.ok) throw new Error(`health check returned HTTP ${res.status}`);
  if(json && json.ok === false) throw new Error(json.detail || 'health check reported unavailable');
  if(json && json.readyForQuotes === false){
    throw new Error(`backend is online but the slicer is not ready (PrusaSlicer: ${json.prusaPathFound ? 'found' : 'missing'}, profile: ${json.configFound ? 'found' : 'missing'})`);
  }
  apiHealthCache.set(baseUrl, Date.now());
}

async function apiEstimate(){
  const candidates = [];
  if(lastWorkingApiUrl && API_URLS.includes(lastWorkingApiUrl)) candidates.push(lastWorkingApiUrl);
  for(const u of API_URLS){ if(!candidates.includes(u)) candidates.push(u); }
  if(!candidates.length) throw new Error('Public Smart Quote API URL is blank.');

  const errors = [];
  for(const baseUrl of candidates){
    try{
      await verifyApiHealth(baseUrl);
      const res=await fetchWithTimeout(`${baseUrl}/api/quote`, {
        method:'POST', body:buildQuoteFormData(), mode:'cors', credentials:'omit', cache:'no-store'
      }, 330000);
      let json;
      const responseText = await res.text();
      try{ json=responseText ? JSON.parse(responseText) : {}; }
      catch{ json={detail:responseText || `API returned HTTP ${res.status}`}; }
      if(!res.ok) throw new Error(json.detail || `API returned HTTP ${res.status}`);
      if(!json?.ok) throw new Error(json?.detail || 'API returned an invalid quote response.');
      lastWorkingApiUrl = baseUrl;
      localStorage.setItem('trinid-smartquote-working-api', baseUrl);
      const q=json.quote || {}, total=q.total || {}, unit=q.unit || {}, m=json.model || {}, settings=json.settings || {};
      return {
        source:json.source || 'real-slicer', slicerEngine:json.slicerEngine || '', fileName:currentFile.name,
        material:settings.material || materialSelect.value, color:settings.color || colorSelect.value, quality:qualitySelect.options[qualitySelect.selectedIndex].text, qualityKey:qualitySelect.value,
        layerHeightMm:settings.layerHeightMm || QUALITY[qualitySelect.value].layer, wallLoops:Number(settings.walls || settings.wallLoops || selectedWalls()), support:settings.support || selectedSupport(), supportLabel:supportLabel(settings.support || selectedSupport()), infill:Number(settings.infill || infill.value), quantity:Number(settings.quantity || quantity.value || 1),
        dimensions:{x:m.dimensionsMm?.x || modelData.size.x, y:m.dimensionsMm?.y || modelData.size.y, z:m.dimensionsMm?.z || modelData.size.z},
        triangles:m.triangles || modelData.triangles, solidVolumeCm3:m.solidVolumeCm3 || modelData.volumeMm3/1000,
        printTimeMinutes:total.printTimeMinutes || 0, unitPrintTimeMinutes:unit.printTimeMinutes || 0,
        weightG:total.weightG || 0, unitWeightG:unit.weightG || 0,
        filamentLengthM:total.filamentLengthM || 0, unitFilamentLengthM:unit.filamentLengthM || 0,
        unitPrice:unit.price || 0, totalPrice:total.price || 0, profitMargin:PRICING.profitMargin,
        createdAt:new Date().toISOString(), stage:'real-slicer', apiUrl:baseUrl,
        costBreakdown:{filament:unit.filamentCost,electricity:unit.electricityCost,machine:unit.machineCost,risk:unit.riskCost || 0,totalCost:unit.totalCost,profit:unit.profit}
      };
    }catch(err){
      const reason = err?.message || String(err);
      errors.push(`${baseUrl}: ${reason}`);
      apiHealthCache.delete(baseUrl);
      console.warn('Smart Quote API attempt failed:', baseUrl, err);
    }
  }
  throw new Error(errors.join(' | ') || 'Could not connect to the Smart Quote API.');
}

function renderEstimate(estimate){
  const isReal = String(estimate.source || '').includes('slicer') && !String(estimate.source || '').includes('fallback');
  const badge = $('#stageBadge');
  if(badge){
    badge.textContent = isReal ? 'Real Slicer' : 'Backend Required';
    badge.className = `sq-stage-badge ${isReal ? 'real' : 'warn'}`;
  }
  modelData.estimate = estimate;
  lastEstimate = estimate;
  $('#estimateStatus').textContent=`${estimate.fileName} · ${estimate.quantity} item${estimate.quantity===1?'':'s'}`;
  $('#estTime').textContent=fmtTime(estimate.printTimeMinutes);
  $('#estWeight').textContent=`${fmt(estimate.weightG,2)} g`;
  $('#estPrice').textContent=`Rs ${ceilRs(estimate.totalPrice).toLocaleString()}`;
  $('#estPriceUnit').textContent=estimate.quantity>1?`Rs ${ceilRs(estimate.unitPrice).toLocaleString()} each · real slicer estimate`:'Real slicer estimate';
  const bd=$('#sqBreakdown');
  if(bd){ bd.hidden=true; bd.innerHTML=''; }
  if(estimatePriceBtn){ estimatePriceBtn.textContent='Recalculate Price'; estimatePriceBtn.disabled=false; }
  sendToQuoteBtn.disabled=false;
  const note = $('#settingsNote') || $('.sq-settings-note');
  if(note){
    note.textContent = isReal ? 'Real slicer result shown. Change any setting and click Recalculate Price to update it.' : 'The Smart Quote backend is required for the final quote.';
  }
}

function showBackendError(message){
  const badge=$('#stageBadge');
  if(badge){ badge.textContent='Backend not connected'; badge.className='sq-stage-badge warn'; }
  const status=$('#estimateStatus');
  if(status) status.textContent=currentFile ? `${currentFile.name} · backend unavailable` : 'Backend unavailable';
  const note=$('#settingsNote') || $('.sq-settings-note');
  if(note) note.textContent=`Smart Quote backend failed: ${message}`;
  $('#estTime').textContent='—';
  $('#estWeight').textContent='—';
  $('#estPrice').textContent='—';
  const unit=$('#estPriceUnit');
  if(unit) unit.textContent='The Smart Quote backend is required for the estimate.';
  sendToQuoteBtn.disabled=true;
  if(estimatePriceBtn){ estimatePriceBtn.disabled=false; estimatePriceBtn.textContent='Estimate Price'; }
}


function markEstimatePending(message='Choose the settings, then click Estimate Price.'){
  if(!modelData) return;
  modelData.estimate=null;
  lastEstimate=null;
  sendToQuoteBtn.disabled=true;
  if(estimatePriceBtn){
    estimatePriceBtn.disabled=false;
    estimatePriceBtn.textContent='Estimate Price';
  }
  const badge=$('#stageBadge');
  if(badge){ badge.textContent='Ready'; badge.className='sq-stage-badge'; }
  const status=$('#estimateStatus');
  if(status) status.textContent=`${currentFile?.name || 'Model'} · ready to estimate`;
  $('#estTime').textContent='—';
  $('#estWeight').textContent='—';
  $('#estPrice').textContent='Rs —';
  const unit=$('#estPriceUnit');
  if(unit) unit.textContent='Click Estimate Price after choosing the settings';
  const note=$('#settingsNote') || $('.sq-settings-note');
  if(note) note.textContent=message;
}

async function calculateEstimate(){
  $('#infillValue').textContent=`${infill.value}%`;
  if(!modelData) return;
  try{
    if(!API_URLS.length) throw new Error('Public Smart Quote API URL is not configured.');
    if(estimatePriceBtn){ estimatePriceBtn.disabled=true; estimatePriceBtn.textContent='Estimating…'; }
    showLoading('Sending STL to the Smart Quote slicer backend…');
    const estimate=await apiEstimate();
    renderEstimate(estimate);
  }catch(err){
    console.warn(err);
    showBackendError(err.message || String(err));
  }finally{
    hideLoading();
  }
}

function updateMaterialOptions(){
  const mat=MATERIALS[materialSelect.value] || MATERIALS['PLA+'];
  const current=colorSelect.value;
  colorSelect.innerHTML=mat.colors.map(c=>`<option value="${c}">${c}</option>`).join('');
  colorSelect.value=mat.colors.includes(current) ? current : mat.colors[0];
  refreshCustomSelect(colorSelect);
  refreshCustomSelect(materialSelect);
}
function refreshCustomSelect(select){
  const wrapper=select?.closest?.('.td-select');
  if(wrapper && wrapper._tdRender) wrapper._tdRender();
}
function enhanceSelect(select){
  if(!select || select.dataset.tdEnhanced==='1') return;
  const wrapper=document.createElement('div');
  wrapper.className='td-select';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.classList.add('td-native-select');
  select.dataset.tdEnhanced='1';
  const button=document.createElement('button');
  button.type='button';
  button.className='td-select-button';
  const menu=document.createElement('div');
  menu.className='td-select-menu';
  wrapper.appendChild(button);
  wrapper.appendChild(menu);
  const render=()=>{
    const selected=select.options[select.selectedIndex];
    button.textContent=selected ? selected.textContent : 'Select';
    menu.innerHTML='';
    Array.from(select.options).forEach(opt=>{
      const item=document.createElement('button');
      item.type='button';
      item.className='td-select-option';
      item.textContent=opt.textContent;
      item.dataset.value=opt.value;
      if(opt.value===select.value) item.classList.add('selected');
      item.addEventListener('click',()=>{
        select.value=opt.value;
        wrapper.classList.remove('open');
        select.dispatchEvent(new Event('change',{bubbles:true}));
        render();
      });
      menu.appendChild(item);
    });
  };
  wrapper._tdRender=render;
  button.addEventListener('click',e=>{
    e.preventDefault();
    e.stopPropagation();
    const willOpen=!wrapper.classList.contains('open');
    closeAllCustomSelects(wrapper);
    wrapper.classList.toggle('open', willOpen);
  });
  select.addEventListener('change',render);
  render();
}
function initCustomSelects(){
  [materialSelect, qualitySelect, colorSelect, wallSelect].forEach(enhanceSelect);
}
document.addEventListener('click',()=>closeAllCustomSelects());
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeAllCustomSelects(); });

uploadZone.addEventListener('click',()=>fileInput.click());
uploadZone.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();fileInput.click();} });
fileInput.addEventListener('change',()=>loadSTL(fileInput.files[0]));
['dragenter','dragover'].forEach(ev=>uploadZone.addEventListener(ev,e=>{e.preventDefault();uploadZone.classList.add('dragging');}));
['dragleave','drop'].forEach(ev=>uploadZone.addEventListener(ev,e=>{e.preventDefault();uploadZone.classList.remove('dragging');}));
uploadZone.addEventListener('drop',e=>loadSTL(e.dataTransfer.files[0]));
resetViewBtn.addEventListener('click',fitCamera);
if(estimatePriceBtn) estimatePriceBtn.addEventListener('click',calculateEstimate);
uploadAnotherBtn.addEventListener('click',()=>fileInput.click());
materialSelect.addEventListener('change',()=>{updateMaterialOptions();applyModelColor();markEstimatePending();});
colorSelect.addEventListener('change',()=>{applyModelColor();markEstimatePending();});
qualitySelect.addEventListener('change',()=>markEstimatePending());
if(wallSelect) wallSelect.addEventListener('change',()=>markEstimatePending());
infill.addEventListener('input',()=>{ $('#infillValue').textContent=`${infill.value}%`; markEstimatePending(); });
quantity.addEventListener('input',()=>markEstimatePending());
sendToQuoteBtn.addEventListener('click',()=>{
  if(!modelData?.estimate) return;
  localStorage.setItem('trinid-smartquote-draft',JSON.stringify(modelData.estimate));
  location.href='quotation.html?from=smartquote';
});

canvas.addEventListener('webglcontextlost',e=>{ e.preventDefault(); console.warn('Smart Quote WebGL context lost.'); });
canvas.addEventListener('webglcontextrestored',()=>{ resizeViewer(); if(mesh) fitCamera(); });

resetSmartQuoteIdleState();
setConfiguredApiUrl();
apiMode();
initCustomSelects();
updateMaterialOptions();
colorSelect.value='Black';
refreshCustomSelect(colorSelect);
initViewer();
initSmartQuoteCloudConfig();
