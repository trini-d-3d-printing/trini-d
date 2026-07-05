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
const infill = $('#sqInfill');
const quantity = $('#sqQuantity');

const MATERIALS = {
  'PLA+': { density: 1.25, priceKg: 5400, colors: ['Black','White','Gray','Gold','Red','Blue'], best: 'General purpose', description: 'Reliable general-purpose material for prototypes, models, gifts and everyday functional parts.' },
  'PLA':  { density: 1.24, priceKg: 5000, colors: ['Black','White','Gray','Red','Blue','Green'], best: 'Models & prototypes', description: 'Easy-printing material for visual models, prototypes and low-load functional parts.' },
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
const MODEL_COLORS = { Black:0x4a4f59, White:0xe7e9ed, Gray:0x7a808b, Gold:0xd6a11d, Red:0xc63a3a, Blue:0x315dca, Green:0x3f8d55, Transparent:0x9fcbd0 };
const PRICING = { powerW:150, electricityPerKWh:70, printerCost:140000, printerLifeHours:2000, profitMargin:75, filamentDiameterMm:1.75 };

let renderer, scene, camera, controls, mesh;
let modelData = null;
let currentFile = null;

function ceilRs(v){ return Math.ceil(Math.max(0, Number(v) || 0)); }
function clamp(v,min,max){ return Math.min(max,Math.max(min,v)); }
function fmt(n,d=2){ return Number(n||0).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}); }
function fmtBytes(bytes){ if(bytes < 1024) return `${bytes} B`; if(bytes < 1024**2) return `${fmt(bytes/1024,1)} KB`; return `${fmt(bytes/1024**2,1)} MB`; }
function fmtTime(minutes){ const total=Math.max(0,Math.round(minutes)); const d=Math.floor(total/1440); const h=Math.floor((total%1440)/60); const m=total%60; return [d?`${d}d`:null,h?`${h}h`:null,(m||(!d&&!h))?`${m}m`:null].filter(Boolean).join(' '); }

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
    sendToQuoteBtn.disabled=false;
    $('#viewerFileName').textContent=file.name;
    $('#statDimensions').textContent=`${fmt(stats.size.x,1)} × ${fmt(stats.size.y,1)} × ${fmt(stats.size.z,1)} mm`;
    $('#statTriangles').textContent=Math.round(stats.triangles).toLocaleString();
    $('#statVolume').textContent=`${fmt(stats.volumeMm3/1000,2)} cm³`;
    $('#statFileSize').textContent=fmtBytes(file.size);
    applyModelColor();
    fitCamera();
    renderer.render(scene,camera);
    calculateEstimate();
  }catch(err){ console.error(err); alert(`Could not analyze this STL. ${err.message||''}`); }
  finally{ loading.hidden=true; setAnalysisStatus('Analyzing model…'); if(mesh){ resizeViewer(); fitCamera(); renderer.render(scene,camera); } }
}

function calculateEstimate(){
  const q=QUALITY[qualitySelect.value];
  $('#infillValue').textContent=`${infill.value}%`; $('#estLayer').textContent=`${q.layer.toFixed(2)} mm`;
  updateMaterialCard();
  if(!modelData){ return; }
  const mat=MATERIALS[materialSelect.value]; const infillRatio=Number(infill.value)/100; const qty=clamp(parseInt(quantity.value||'1',10)||1,1,100); quantity.value=qty;
  const solid=modelData.volumeMm3; const surface=modelData.surfaceAreaMm2;
  // Geometry-only approximation: shell + partial internal infill. Real slicing will replace this in Stage 2.
  const shellThickness=0.55*Math.pow(0.20/q.layer,0.08);
  const shellVolume=Math.min(solid*0.72,surface*shellThickness);
  const inner=Math.max(0,solid-shellVolume);
  const extrusionVolume=(shellVolume+inner*infillRatio)*1.08;
  const weightG=extrusionVolume/1000*mat.density;
  const filamentArea=Math.PI*Math.pow(PRICING.filamentDiameterMm/2,2);
  const lengthM=extrusionVolume/filamentArea/1000;
  const complexity=clamp(1+(surface/Math.max(solid,1))*0.9,1,1.45);
  const layers=Math.max(1,modelData.size.z/q.layer);
  const timeSeconds=(extrusionVolume/q.flow)*q.timeFactor*complexity*1.16 + layers*2.5;
  const timeMinutes=timeSeconds/60;
  const hours=timeMinutes/60;
  const filamentCost=weightG/1000*mat.priceKg;
  const electricityCost=hours*(PRICING.powerW/1000)*PRICING.electricityPerKWh;
  const machineCost=hours*(PRICING.printerCost/PRICING.printerLifeHours);
  const unitCost=filamentCost+electricityCost+machineCost;
  const unitPrice=ceilRs(unitCost*(1+PRICING.profitMargin/100));
  const totalPrice=ceilRs(unitCost*qty*(1+PRICING.profitMargin/100));
  const estimate={
    fileName:currentFile.name, material:materialSelect.value, color:colorSelect.value, quality:qualitySelect.options[qualitySelect.selectedIndex].text, qualityKey:qualitySelect.value,
    layerHeightMm:q.layer, infill:Number(infill.value), quantity:qty,
    dimensions:{x:modelData.size.x,y:modelData.size.y,z:modelData.size.z}, triangles:modelData.triangles, solidVolumeCm3:solid/1000,
    printTimeMinutes:timeMinutes*qty, unitPrintTimeMinutes:timeMinutes, weightG:weightG*qty, unitWeightG:weightG, filamentLengthM:lengthM*qty, unitFilamentLengthM:lengthM,
    unitPrice,totalPrice, createdAt:new Date().toISOString(), stage:'browser-preliminary'
  };
  modelData.estimate=estimate;
  $('#estimateStatus').textContent=`${currentFile.name} · ${qty} item${qty===1?'':'s'}`;
  $('#estTime').textContent=fmtTime(estimate.printTimeMinutes);
  $('#estWeight').textContent=`${fmt(estimate.weightG,2)} g`;
  $('#estLength').textContent=`${fmt(estimate.filamentLengthM,2)} m`;
  $('#estPrice').textContent=`Rs ${totalPrice.toLocaleString()}`;
  $('#estPriceUnit').textContent=qty>1?`Rs ${unitPrice.toLocaleString()} each · final after slicer review`:'Final quote after slicer review';
}

function updateMaterialCard(){
  const mat=MATERIALS[materialSelect.value];
  $('#materialTitle').textContent=materialSelect.value; $('#materialDescription').textContent=mat.description; $('#materialDensity').textContent=`${mat.density.toFixed(2)} g/cm³`; $('#materialPrice').textContent=`Rs ${mat.priceKg.toLocaleString()}/kg`; $('#materialBestFor').textContent=mat.best;
  const current=colorSelect.value; colorSelect.innerHTML=mat.colors.map(c=>`<option value="${c}">${c}</option>`).join(''); if(mat.colors.includes(current)) colorSelect.value=current; else colorSelect.value=mat.colors[0];
  const orb=$('#materialOrb'); const c=MODEL_COLORS[colorSelect.value]||0x202329; orb.style.setProperty('--orb-color',`#${c.toString(16).padStart(6,'0')}`);
}
function syncOrbColor(){ const c=MODEL_COLORS[colorSelect.value]||0x202329; const hex=`#${c.toString(16).padStart(6,'0')}`; $('#materialOrb span').style.background=`linear-gradient(145deg, color-mix(in srgb, ${hex} 70%, white), ${hex})`; }

uploadZone.addEventListener('click',()=>fileInput.click());
uploadZone.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();fileInput.click();} });
fileInput.addEventListener('change',()=>loadSTL(fileInput.files[0]));
['dragenter','dragover'].forEach(ev=>uploadZone.addEventListener(ev,e=>{e.preventDefault();uploadZone.classList.add('dragging');}));
['dragleave','drop'].forEach(ev=>uploadZone.addEventListener(ev,e=>{e.preventDefault();uploadZone.classList.remove('dragging');}));
uploadZone.addEventListener('drop',e=>loadSTL(e.dataTransfer.files[0]));
resetViewBtn.addEventListener('click',fitCamera);
uploadAnotherBtn.addEventListener('click',()=>fileInput.click());
materialSelect.addEventListener('change',()=>{updateMaterialCard();syncOrbColor();calculateEstimate();applyModelColor();});
colorSelect.addEventListener('change',()=>{syncOrbColor();applyModelColor();calculateEstimate();});
qualitySelect.addEventListener('change',calculateEstimate); infill.addEventListener('input',calculateEstimate); quantity.addEventListener('input',calculateEstimate);
sendToQuoteBtn.addEventListener('click',()=>{
  if(!modelData?.estimate) return;
  localStorage.setItem('trinid-smartquote-draft',JSON.stringify(modelData.estimate));
  location.href='quotation.html?from=smartquote';
});

canvas.addEventListener('webglcontextlost',e=>{ e.preventDefault(); console.warn('Smart Quote WebGL context lost.'); });
canvas.addEventListener('webglcontextrestored',()=>{ resizeViewer(); if(mesh) fitCamera(); });

resetSmartQuoteIdleState();
updateMaterialCard();
colorSelect.value='Black';
syncOrbColor();
initViewer();
calculateEstimate();
