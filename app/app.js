'use strict';
const $ = s => document.querySelector(s);
const state = { refs: [], gallery: [], selected: null, job: null, ready: false, polling: false, deleting: false, checked: new Set(), hardware: null };
async function api(path, options = {}) {
  const r = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await r.json(); if (!r.ok) throw new Error(data.error || `Error ${r.status}`); return data;
}
function notice(message, error = false) { $('#notice').hidden = false; $('#notice').textContent = message; $('#notice').classList.toggle('error', error); }
function settings() { return { prompt: $('#prompt').value, width: +$('#width').value, height: +$('#height').value, steps: +$('#steps').value, count: +$('#count').value, seed: +$('#seed').value, compute: $('#compute').value, threads: +$('#threads').value, transparent: $('#transparent').checked, profile: $('#profile').value }; }
let warmTimer = null, warmedKey = null, pendingKey = null;
function warmEngine() {
  const s = settings(), key = JSON.stringify([s.compute, s.threads, s.profile]);
  if (state.job || !state.hardware || key === warmedKey || key === pendingKey || !Number.isInteger(s.threads) || s.threads < 0 || s.threads > 128) return;
  clearTimeout(warmTimer); pendingKey = key;
  warmTimer = setTimeout(() => {
    pendingKey = null;
    if (state.job || JSON.stringify([$('#compute').value, +$('#threads').value, $('#profile').value]) !== key) return;
    warmedKey = key;
    api('/api/engine/warmup', { method: 'POST', body: JSON.stringify({ compute: s.compute, threads: s.threads, profile: s.profile }) }).catch(() => { warmedKey = null; });
  }, 700);
}
function persist() { try { localStorage.setItem('qwenpascal.settings', JSON.stringify(settings())); } catch {} }
function refreshForm() {
  const s = settings(); $('#chars').textContent = `${s.prompt.length}/6000`;
  $('#canvasSize').textContent = `${s.width} × ${s.height}`; $('#megapixels').textContent = `${(s.width*s.height/1e6).toFixed(2)} MP`;
  document.querySelectorAll('.preset').forEach(b => b.classList.toggle('active', +b.dataset.w === s.width && +b.dataset.h === s.height));
  $('#stepsHint').textContent = s.steps === 6 ? '6 pasos · configuración recomendada para Viggle v0.2.1.' : 'Modo experimental: usa 6 pasos para v0.2.1.';
  $('#generate').disabled = !!state.job || !state.ready; $('#compute').disabled=!!state.job;$('#profile').disabled=!!state.job;
  $('#computeHint').textContent={auto:'Pascal automático: Qwen3-VL queda en CPU/RAM y CUDA se reserva para Qwen Image + VAE. Es el modo recomendado para GTX 10xx.',cpu:'Solo CPU. Es el modo más compatible, pero puede tardar mucho.',gpu:'Intenta ejecutar todo en GPU. En 4–8 GB puede quedarse sin VRAM.',hybrid:'CPU procesa texto/referencias; GPU hace difusión y VAE. Es la distribución recomendada para Pascal.'}[$('#compute').value]+' Perfil VAE: '+({ 'pascal-fast':'clásico sin tiles (el más rápido en GTX 1070 probada)', 'pascal-direct':'direct-conv experimental', 'pascal-tiled':'tiles para reducir picos de VRAM' }[$('#profile').value])+'.';
  syncSelection(); document.querySelectorAll('.gallery-delete, #deleteAll, #delete').forEach(b=>b.disabled=!!state.job||state.deleting||!state.gallery.length);
  persist(); warmEngine();
}
function setSettings(s) { for (const key of ['prompt','width','height','steps','count','seed','compute','threads','profile']) if (s[key] !== undefined && $(`#${key}`)) $(`#${key}`).value = s[key]; $('#transparent').checked = s.transparent === true; refreshForm(); }
function renderRefs() {
  $('#refs').replaceChildren(); $('#refCount').textContent = `${state.refs.length} / 2`; $('#refHint').hidden = !state.refs.length; $('#addSecond').hidden = state.refs.length !== 1;
  state.refs.forEach((src,i) => {
    const div = document.createElement('div'); div.className = 'ref';
    const img = document.createElement('img'); img.src = src; img.alt = `Referencia ${i+1}`;
    const nav = document.createElement('nav'); const label = document.createElement('span'); label.textContent = `Imagen ${i+1}`; nav.append(label);
    if (i) { const prev = document.createElement('button'); prev.type='button'; prev.textContent='←'; prev.onclick=()=>{[state.refs[i-1],state.refs[i]]=[state.refs[i],state.refs[i-1]];renderRefs();}; nav.append(prev); }
    const remove = document.createElement('button'); remove.type='button'; remove.textContent='×'; remove.onclick=()=>{state.refs.splice(i,1);renderRefs();}; nav.append(remove);
    div.append(img,nav); $('#refs').append(div);
  });
}
async function addFiles(files) {
  try {
    for (const file of files) {
      if (state.refs.length >= 2) throw new Error('El modelo admite un máximo de 2 referencias.');
      if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 8*1024*1024) throw new Error('Usa PNG, JPG o WebP de hasta 8 MB.');
      const bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 40000000) { bitmap.close(); throw new Error('La referencia excede 40 megapíxeles.'); }
      const scale = Math.min(1, 1536 / Math.max(bitmap.width,bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width*scale); canvas.height = Math.round(bitmap.height*scale);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
      state.refs.push(canvas.toDataURL('image/png')); renderRefs();
    }
  } catch(e) { notice(e.message,true); }
  $('#files').value='';
}
$('#addSecond').onclick=()=>$('#files').click(); $('#files').onchange = e => addFiles(e.target.files);
const dz=$('#dropzone'); for(const event of ['dragenter','dragover']) dz.addEventListener(event,e=>{e.preventDefault();dz.classList.add('drag');});
for(const event of ['dragleave','drop']) dz.addEventListener(event,e=>{e.preventDefault();dz.classList.remove('drag');}); dz.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
document.querySelectorAll('.preset').forEach(b=>b.onclick=()=>{ $('#width').value=b.dataset.w;$('#height').value=b.dataset.h;refreshForm(); });
$('#swap').onclick=()=>{const w=$('#width').value;$('#width').value=$('#height').value;$('#height').value=w;refreshForm();};
$('#form').addEventListener('input',()=>refreshForm());
$('#random').onclick=()=>{$('#seed').value=crypto.getRandomValues(new Uint32Array(1))[0]%2147483640;refreshForm();};
$('#recommended').onclick=()=>{$('#steps').value=6;refreshForm();};
const ideas = ['An elegant ceramic teapot shaped like a tiny house, lavender glaze, soft morning sunlight, minimalist product photography, warm cream background.', 'Un jardín botánico dentro de una estación espacial, helechos gigantes, ventanas hacia Saturno, fotografía cinematográfica, luz dorada.', 'An editorial photograph of a red fox in a snowy forest at sunrise, soft mist, detailed fur, warm backlight, natural colors.','Un cartel tipográfico que dice "IMAGINA", formas de papel tridimensionales en tonos lavanda y coral, composición editorial limpia.'];
let ideaIndex=0;$('#inspire').onclick=()=>{$('#prompt').value=ideas[ideaIndex++%ideas.length];refreshForm();};
$('#theme').onclick=()=>{document.body.classList.toggle('dark');try{localStorage.setItem('qwenpascal.theme',document.body.classList.contains('dark')?'dark':'light');}catch{}};
function selectImage(item) {
  state.selected=item; $('#result').src=item.src;$('#result').hidden=false;$('#empty').hidden=true;$('#resultInfo').hidden=false;
  $('#resultTitle').textContent=item.prompt.length>85?item.prompt.slice(0,85)+'…':item.prompt;
  $('#resultMeta').textContent=`${item.width} × ${item.height} · ${item.steps} pasos · Semilla ${item.seed} · ${item.refsCount||0} referencias${item.pascalProfile?' · '+({'pascal-fast':'Pascal VAE','pascal-direct':'Direct VAE','pascal-tiled':'Tiled VAE'}[item.pascalProfile]||item.pascalProfile):''}${item.seconds?' · '+item.seconds+' s':''}`;
  $('#download').href=item.src;$('#download').download=`qwen-imagen-${item.seed}.png`; $('#metadata').href=`/outputs/${item.id}.json`;$('#metadata').download=`qwen-imagen-${item.seed}.json`;
  document.querySelectorAll('.thumb').forEach(b=>b.classList.toggle('selected',b.dataset.id===item.id));
}
async function loadGallery(selectLatest=false) {
  state.gallery=await api('/api/gallery');$('#gallery').replaceChildren();$('#galleryCount').textContent=state.gallery.length;$('#galleryEmpty').hidden=!!state.gallery.length;
  state.gallery.forEach(item=>{
    const card=document.createElement('article');card.className='gallery-card'; const b=document.createElement('button');b.className='thumb';b.dataset.id=item.id;b.title=item.prompt;
    const img=document.createElement('img');img.src=item.src;img.alt=item.prompt;img.loading='lazy'; const div=document.createElement('div');div.textContent=item.width+' × '+item.height;
    const meta=document.createElement('span');meta.textContent=item.steps+' pasos · '+item.seed;div.append(meta);b.append(img,div);b.onclick=()=>selectImage(item);
    const remove=document.createElement('button');remove.className='gallery-delete';remove.textContent='Eliminar';remove.onclick=()=>deleteImages(item);
    card.append(b,remove);$('#gallery').append(card);
  });
  if(state.gallery.length&&(selectLatest||!state.selected))selectImage(state.gallery[0]); else if(!state.gallery.length){$('#result').hidden=true;$('#empty').hidden=false;$('#resultInfo').hidden=true;} refreshForm();
}
async function deleteImages(item=null) {
  if(state.job||state.deleting)return; if(!confirm(item?'¿Eliminar esta imagen?':'¿Eliminar todas las imágenes?'))return;
  state.deleting=true;refreshForm(); try{await api(item?'/api/gallery/'+item.id:'/api/gallery',{method:'DELETE'});await loadGallery();}catch(e){notice(e.message,true);} finally{state.deleting=false;refreshForm();}
}
$('#delete').onclick=()=>{if(state.selected)deleteImages(state.selected);}; $('#deleteAll').onclick=()=>deleteImages();
$('#reuse').onclick=async()=>{try{const item=state.selected;const refs=await api(`/api/references/${item.id}`);setSettings(item);state.refs=refs.slice(0,2);renderRefs();notice('Ajustes restaurados.');}catch(e){notice(e.message,true);}};
$('#useRef').onclick=async()=>{try{if(state.refs.length>=2)throw new Error('Quita una referencia antes de añadir otra.');const r=await fetch(state.selected.src);await addFiles([new File([await r.blob()],'referencia.png',{type:'image/png'})]);}catch(e){notice(e.message,true);}};
function syncSelection(){}
function showJob(job) {state.job=job;$('#working').hidden=false;$('#workTitle').textContent=`Creando ${job.current||1} de ${job.total}`;$('#workMessage').textContent=job.message;$('#elapsed').textContent=`${Math.round((Date.now()-job.startedAt)/1000)} s`;$('#cancel').disabled=job.cancelRequested;refreshForm();}
async function followJob(id) {
  if(state.polling)return;state.polling=true;
  try{while(true){const job=await api(`/api/jobs/${id}`);showJob(job);if(['completed','failed','cancelled'].includes(job.status)){state.job=null;$('#working').hidden=true;notice(job.message,job.status==='failed');await loadGallery(job.images.length>0);break;}await new Promise(r=>setTimeout(r,400));}}
  catch(e){state.job=null;$('#working').hidden=true;notice(e.message,true);} finally{state.polling=false;refreshForm();}
}
$('#form').onsubmit=async e=>{e.preventDefault();if(state.job)return;try{const job=await api('/api/jobs',{method:'POST',body:JSON.stringify({...settings(),refs:state.refs})});showJob(job);void followJob(job.id);}catch(e){notice(e.message,true);refreshForm();}};
$('#cancel').onclick=async()=>{if(!state.job)return;try{const job=await api(`/api/jobs/${state.job.id}/cancel`,{method:'POST',body:'{}'});showJob(job);}catch(e){notice(e.message,true);}};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();if(state.ready&&!state.job)$('#form').requestSubmit();}});
async function status() {
  let loading=false;
  try{
    const s=await api('/api/status');state.ready=s.ready;loading=!!s.compute?.loading;
    if(s.compute?.hardware){const h=s.compute.hardware,first=!state.hardware;state.hardware=h;$('#hardwareInfo').textContent=h.cpuName+' · '+h.logicalCores+' hilos · '+h.ramGB+' GB RAM. '+(h.gpus.length?'GPU: '+h.gpus.map(g=>g.name).join(', '):'Sin GPU compatible detectada.');for(const o of $('#compute').options)o.disabled=!h.modes.includes(o.value);if(first)warmEngine();}
    const current=s.compute?.current;$('#status').classList.toggle('ready',s.ready&&!loading);$('#status').lastChild.textContent=s.ready?(loading?' Cargando modelos…':current?' Motor listo · '+({'pascal-fast':'Pascal VAE','pascal-direct':'Direct VAE','pascal-tiled':'Tiled VAE'}[current.profile]||''):' Listo para generar'):' Detectando / desconectado';
    if(s.active&&!state.job){showJob(s.active);void followJob(s.active.id);}
  }catch{state.ready=false;$('#status').classList.remove('ready');$('#status').lastChild.textContent=' Servidor desconectado';}
  refreshForm();setTimeout(status,loading?1500:5000);
}
try{if(localStorage.getItem('qwenpascal.theme')==='dark')document.body.classList.add('dark');const saved=JSON.parse(localStorage.getItem('qwenpascal.settings')||'null');if(saved)setSettings(saved);}catch{}
refreshForm();loadGallery().catch(e=>notice(e.message,true));status();
