const $ = (id) => document.getElementById(id);

const HEAVY = ['Anton', 'Archivo Black', 'Bebas Neue', 'Luckiest Guy', 'Montserrat ExtraBold', 'Poppins', 'Inter', 'Inter Bold', 'Inter ExtraBold', 'Playfair Display', 'Arial Black', 'Impact'];

const TEMPLATES = {
  hormozi: { label: 'Hormozi', sub: 'Montserrat', mode: 'word', font: 'Montserrat ExtraBold', textColor: '#FFFFFF', highlightColor: '#FFE000', outlineColor: '#000000', outlineScale: 1, fontScale: 1, uppercase: true, posY: 33, animation: 'pop', maxWords: 3, box: false },
  beast: { label: 'Beast', sub: 'Anton vert', mode: 'word', font: 'Anton', textColor: '#FFFFFF', highlightColor: '#46FF45', outlineColor: '#000000', outlineScale: 1, fontScale: 1, uppercase: true, posY: 33, animation: 'pop', maxWords: 3, box: false },
  bebas: { label: 'Bebas', sub: 'élégant', mode: 'word', font: 'Bebas Neue', textColor: '#FFFFFF', highlightColor: '#FFD400', outlineColor: '#000000', outlineScale: 0.9, fontScale: 1.15, uppercase: true, posY: 10, animation: 'fade', maxWords: 4, box: false },
  tiktok: { label: 'TikTok', sub: 'Poppins rouge', mode: 'word', font: 'Poppins', textColor: '#FFFFFF', highlightColor: '#FF3B5C', outlineColor: '#000000', outlineScale: 1, fontScale: 1, uppercase: true, posY: 10, animation: 'bounce', maxWords: 3, box: false },
  boxed: { label: 'Boxed', sub: 'fond noir', mode: 'word', font: 'Montserrat ExtraBold', textColor: '#FFFFFF', highlightColor: '#FFE000', outlineColor: '#000000', outlineScale: 0.8, fontScale: 1, uppercase: true, posY: 33, animation: 'pop', maxWords: 3, box: true },
  neon: { label: 'Neon', sub: 'cyan / magenta', mode: 'word', font: 'Archivo Black', textColor: '#13F0FF', highlightColor: '#FF35E0', outlineColor: '#04121A', outlineScale: 1.6, fontScale: 1, uppercase: true, posY: 33, animation: 'bounce', maxWords: 3, box: false },
  fun: { label: 'Fun', sub: 'Luckiest Guy', mode: 'word', font: 'Luckiest Guy', textColor: '#FFFFFF', highlightColor: '#FF7A00', outlineColor: '#000000', outlineScale: 1, fontScale: 1, uppercase: true, posY: 33, animation: 'bounce', maxWords: 3, box: false },
  inter: { label: 'Inter', sub: 'moderne', mode: 'word', font: 'Inter Bold', textColor: '#FFFFFF', highlightColor: '#19E3B1', outlineColor: '#000000', outlineScale: 0.9, fontScale: 1, uppercase: true, posY: 33, animation: 'pop', maxWords: 3, box: false },
  playfair: { label: 'Playfair', sub: 'élégant serif', mode: 'word', font: 'Playfair Display', textColor: '#FFFFFF', highlightColor: '#E7C873', outlineColor: '#000000', outlineScale: 0.8, fontScale: 1.1, uppercase: false, posY: 12, animation: 'fade', maxWords: 4, box: false },
  clean: { label: 'Clean', sub: 'sobre', mode: 'word', font: 'Poppins', textColor: '#FFFFFF', highlightColor: '#FFD400', outlineColor: '#000000', outlineScale: 0.6, fontScale: 0.95, uppercase: false, posY: 8, animation: 'fade', maxWords: 4, box: false },
  subtitle: { label: 'Classique', sub: 'phrase entière', mode: 'segment', font: 'Arial', textColor: '#FFFFFF', highlightColor: '#FFFFFF', outlineColor: '#000000', outlineScale: 0.7, fontScale: 1, uppercase: false, posY: 6, animation: 'fade', maxWords: 4, box: false },
};
const FONTS = [
  'Montserrat ExtraBold', 'Inter', 'Inter Bold', 'Inter ExtraBold', 'Anton', 'Bebas Neue', 'Poppins',
  'Archivo Black', 'Luckiest Guy', 'Playfair Display', 'Arial Black', 'Impact', 'Arial', 'Verdana',
];
const FALLBACK_CUES = [{ start: 0, end: 3, text: 'Ceci est un aperçu de ton style' }];

let selectedFile = null;
let jobId = null;
let cues = [];
let videoDim = null;
let opt = { ...TEMPLATES.hormozi };
let pollTimer = null;
let lpTimer = null;
let lpSeq = [];
let lpIdx = 0;

function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function stripPunctJS(t) { return String(t).replace(/[.,;:!?…«»“”„"()\[\]{}<>]/g, '').replace(/\s{2,}/g, ' ').trim(); }

// --- Dépendances ---
fetch('/api/health').then((r) => r.json()).then((d) => {
  const missing = [];
  if (!d.ffmpeg || !d.ffprobe) missing.push('FFmpeg');
  if (!d.python) missing.push('Python');
  else if (!d.fasterWhisper) missing.push('faster-whisper (npm run setup:py)');
  if (missing.length) {
    $('depsWarning').innerHTML = '⚠️ Dépendance(s) manquante(s) : <b>' + missing.join(', ') + '</b>. Voir le README.';
    $('depsWarning').classList.remove('hidden');
  }
}).catch(() => {});

// --- Sélection fichier ---
const dropzone = $('dropzone');
$('browseBtn').addEventListener('click', (e) => { e.stopPropagation(); $('fileInput').click(); });
dropzone.addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', () => { if ($('fileInput').files[0]) setFile($('fileInput').files[0]); });
['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('video/')) setFile(f);
  else if (f) alert('Merci de déposer un fichier vidéo.');
});
function setFile(f) {
  selectedFile = f;
  $('fileChosen').textContent = `📹 ${f.name} — ${(f.size / 1024 / 1024).toFixed(1)} Mo`;
  $('fileChosen').classList.remove('hidden');
  $('importBtn').disabled = false;
}

// --- Import + transcription ---
$('importBtn').addEventListener('click', async () => {
  if (!selectedFile) return;
  show('transcribeView'); hide('uploadView');
  setBar('tr', 0, 'Envoi de la vidéo…');
  const fd = new FormData();
  fd.append('video', selectedFile);
  fd.append('language', $('language').value);
  fd.append('model', $('model').value);
  try {
    const res = await fetch('/api/jobs', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Échec de l\'envoi.');
    jobId = data.jobId;
    pollTranscription();
  } catch (err) { showError(friendlyErr(err)); }
});

function pollTranscription() {
  clearInterval(pollTimer);
  let fails = 0;
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) throw new Error();
      const job = await res.json();
      fails = 0;
      if (job.status === 'error') { clearInterval(pollTimer); showError(job.error || 'Erreur de transcription.'); return; }
      setBar('tr', job.progress || 0, job.stage || 'Transcription…');
      if (job.status === 'ready') {
        clearInterval(pollTimer);
        videoDim = job.dim || null;
        await loadCues();
        openStudio();
      }
    } catch {
      if (++fails >= 5) { clearInterval(pollTimer); showError('Connexion perdue avec le serveur. Vérifie que la fenêtre « Lancer Scriptshort » est toujours ouverte, puis réessaie.'); }
    }
  }, 1000);
}

async function loadCues() {
  try {
    const data = await (await fetch(`/api/jobs/${jobId}/cues`)).json();
    cues = (data.cues && data.cues.length) ? data.cues : FALLBACK_CUES;
  } catch { cues = FALLBACK_CUES; }
}

// --- Studio ---
function openStudio() {
  hide('transcribeView'); show('studioView');
  buildTemplates();
  buildFonts();
  bindControls();
  applyTemplate('hormozi');
}

function buildTemplates() {
  const wrap = $('templates');
  wrap.innerHTML = '';
  for (const [key, t] of Object.entries(TEMPLATES)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tpl'; b.dataset.key = key;
    b.innerHTML = `${t.label}<small>${t.sub}</small>`;
    b.addEventListener('click', () => applyTemplate(key));
    wrap.appendChild(b);
  }
}
function buildFonts() {
  const sel = $('font');
  sel.innerHTML = '';
  for (const f of FONTS) {
    const o = document.createElement('option');
    o.value = f; o.textContent = f;
    sel.appendChild(o);
  }
}

function applyTemplate(key) {
  const t = { ...TEMPLATES[key] };
  delete t.label; delete t.sub;
  const keepPunct = opt.punctuation;
  opt = { ...t, punctuation: keepPunct || false };
  // Couleur favorite enregistrée = couleur du mot surligné par défaut.
  const favs = loadFavs();
  if (favs.length) opt.highlightColor = favs[0];
  [...$('templates').children].forEach((c) => c.classList.toggle('selected', c.dataset.key === key));
  pushToControls();
  showLive();
  renderLive();
}

function pushToControls() {
  $('mode').value = opt.mode;
  $('font').value = opt.font;
  $('animation').value = opt.animation;
  $('maxWords').value = opt.maxWords;
  $('maxWordsVal').textContent = opt.maxWords;
  $('fontScale').value = Math.round((opt.fontScale || 1) * 100);
  $('fontScaleVal').textContent = Math.round((opt.fontScale || 1) * 100);
  $('posY').value = opt.posY != null ? opt.posY : 33;
  $('posYVal').textContent = opt.posY != null ? opt.posY : 33;
  $('textColor').value = opt.textColor;
  $('highlightColor').value = opt.highlightColor;
  $('outlineColor').value = opt.outlineColor || '#000000';
  $('textColorHex').value = opt.textColor.toUpperCase();
  $('highlightColorHex').value = opt.highlightColor.toUpperCase();
  $('outlineColorHex').value = (opt.outlineColor || '#000000').toUpperCase();
  $('uppercase').checked = opt.uppercase;
  $('punctuation').checked = !!opt.punctuation;
  toggleWordOnly();
}

function readControls() {
  opt.mode = $('mode').value;
  opt.font = $('font').value;
  opt.animation = $('animation').value;
  opt.maxWords = parseInt($('maxWords').value, 10);
  opt.fontScale = parseInt($('fontScale').value, 10) / 100;
  opt.posY = parseInt($('posY').value, 10);
  opt.textColor = $('textColor').value;
  opt.highlightColor = $('highlightColor').value;
  opt.outlineColor = $('outlineColor').value;
  opt.uppercase = $('uppercase').checked;
  opt.punctuation = $('punctuation').checked;
  $('maxWordsVal').textContent = opt.maxWords;
  $('fontScaleVal').textContent = Math.round(opt.fontScale * 100);
  $('posYVal').textContent = opt.posY;
  toggleWordOnly();
}

function toggleWordOnly() {
  const isWord = $('mode').value === 'word';
  $('wordsGroup').style.visibility = isWord ? 'visible' : 'hidden';
  $('highlightGroup').style.visibility = isWord ? 'visible' : 'hidden';
}

function bindControls() {
  ['mode', 'font', 'animation', 'maxWords', 'fontScale', 'posY', 'uppercase', 'punctuation'].forEach((id) => {
    $(id).addEventListener('input', () => { readControls(); showLive(); renderLive(); });
  });
}

// ============ APERÇU LIVE ============
function outlineShadow(px, color) {
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 / 12) * i;
    pts.push(`${(Math.cos(a) * px).toFixed(1)}px ${(Math.sin(a) * px).toFixed(1)}px 0 ${color}`);
  }
  return pts.join(', ');
}

function applyLiveStyle() {
  const frame = $('previewFrame');
  const stage = $('liveStage');
  const line = $('liveLine');
  const inner = $('liveInner');
  const isWord = opt.mode === 'word';

  const REF_W = (videoDim && videoDim.width) || 1080;
  const REF_H = (videoDim && videoDim.height) || 1920;
  const base = Math.min(REF_W, REF_H);

  frame.style.aspectRatio = REF_W + ' / ' + REF_H;
  const frameW = frame.clientWidth || 260;
  const k = frameW / REF_W;
  stage.style.width = REF_W + 'px';
  stage.style.height = REF_H + 'px';
  stage.style.transform = 'scale(' + k + ')';

  const fontPx = Math.max(8, base * (isWord ? 0.072 : 0.05) * (opt.fontScale || 1));
  inner.style.fontFamily = `"${opt.font}", sans-serif`;
  inner.style.fontSize = fontPx + 'px';
  inner.style.fontWeight = HEAVY.includes(opt.font) ? '400' : (isWord ? '800' : '400');
  inner.style.textTransform = opt.uppercase ? 'uppercase' : 'none';

  if (opt.box) {
    inner.style.textShadow = 'none';
    inner.style.background = 'rgba(0,0,0,0.62)';
    inner.style.padding = `${(fontPx * 0.10).toFixed(0)}px ${(fontPx * 0.32).toFixed(0)}px`;
    inner.style.borderRadius = `${(fontPx * 0.16).toFixed(0)}px`;
  } else {
    const outPx = Math.max(2, base * 0.009 * (opt.outlineScale || 1) * (isWord ? 1 : 0.7));
    inner.style.textShadow = outlineShadow(outPx, opt.outlineColor || '#000');
    inner.style.background = 'none';
    inner.style.padding = '0';
  }

  line.style.setProperty('--lp-txt', opt.textColor);
  line.style.setProperty('--lp-hl', opt.highlightColor);
  line.style.left = Math.round(REF_W * 0.08) + 'px';
  line.style.right = Math.round(REF_W * 0.08) + 'px';
  const posY = opt.posY != null ? opt.posY : 33;
  line.style.top = 'auto';
  line.style.bottom = Math.round(REF_H * (0.04 + (posY / 100) * 0.80)) + 'px';
}

function animCss(anim) {
  switch (anim) {
    case 'fade': return 'lpFade .22s ease both';
    case 'pop': return 'lpPop .28s cubic-bezier(.2,.8,.2,1) both';
    case 'bounce': return 'lpBounce .4s cubic-bezier(.2,.8,.2,1) both';
    default: return 'none';
  }
}

// Découpe les mots d'un cue en lignes (mêmes règles que le rendu) avec index global.
function cueToLines(cue, charsPerLine) {
  let text = opt.punctuation ? (cue.text || '') : stripPunctJS(cue.text || '');
  let toks = text.split(/\s+/).filter(Boolean);
  if (opt.uppercase) toks = toks.map((t) => t.toUpperCase());
  const lines = []; let cur = []; let len = 0; let gi = 0;
  for (const t of toks) {
    const add = (len ? 1 : 0) + t.length;
    if (len && len + add > charsPerLine) { lines.push(cur); cur = []; len = 0; }
    cur.push({ text: t, gi: gi++ });
    len += (cur.length > 1 ? 1 : 0) + t.length;
  }
  if (cur.length) lines.push(cur);
  return { lines, n: gi, dur: (cue.end - cue.start) || 1.5 };
}

function buildSequence() {
  const isWord = opt.mode === 'word';
  const charsPerLine = Math.max(8, Math.round(16 / (opt.fontScale || 1)));
  const src = (cues && cues.length) ? cues : FALLBACK_CUES;
  const seq = [];
  for (const cue of src) {
    const ci = cueToLines(cue, charsPerLine);
    if (!ci.n) continue;
    if (isWord) {
      const per = Math.max(170, Math.min(650, (ci.dur * 1000) / ci.n));
      for (let g = 0; g < ci.n; g++) seq.push({ lines: ci.lines, active: g, start: g === 0, dur: per });
      seq.push({ lines: ci.lines, active: ci.n - 1, start: false, dur: 200 });
    } else {
      seq.push({ lines: ci.lines, active: -1, start: true, dur: Math.max(900, ci.dur * 1000) });
    }
  }
  if (!seq.length) seq.push({ lines: [[{ text: 'APERÇU', gi: 0 }]], active: 0, start: true, dur: 400 });
  return seq;
}

function renderLive() {
  stopLive();
  applyLiveStyle();
  lpSeq = buildSequence();
  lpIdx = 0;
  lpTick();
}

function lpTick() {
  const step = lpSeq[lpIdx % lpSeq.length];
  const inner = $('liveInner');
  if (step.start) {
    inner.innerHTML = step.lines.map((line) => (
      '<span class="lp-line">' + line.map((wo) => (
        `<span class="lp-w ${wo.gi === step.active ? 'on' : ''}" data-gi="${wo.gi}">${escapeHtml(wo.text)}</span>`
      )).join(' ') + '</span>'
    )).join('');
    inner.style.animation = 'none';
    void inner.offsetWidth;
    inner.style.animation = animCss(opt.animation);
  } else {
    inner.querySelectorAll('.lp-w').forEach((el) => el.classList.toggle('on', +el.dataset.gi === step.active));
  }
  lpIdx++;
  lpTimer = setTimeout(lpTick, step.dur);
}

function stopLive() { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }

function showLive() {
  $('previewVideo').classList.add('hidden');
  $('livePreview').classList.remove('hidden');
  $('liveHint').classList.remove('hidden');
}
function showVideo() {
  stopLive();
  $('livePreview').classList.add('hidden');
  $('previewVideo').classList.remove('hidden');
  $('liveHint').classList.add('hidden');
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  if ($('studioView').classList.contains('hidden')) return;
  if ($('livePreview').classList.contains('hidden')) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderLive, 150);
});

// ============ Rendu réel (FFmpeg) ============
async function startRender(options, preview) {
  const res = await fetch(`/api/jobs/${jobId}/render`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ options, preview }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Rendu refusé.');
  return data.renderId;
}

function pollRender(renderId, onProgress) {
  return new Promise((resolve, reject) => {
    let fails = 0;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/renders/${renderId}`);
        if (!res.ok) throw new Error();
        const r = await res.json();
        fails = 0;
        if (r.status === 'error') { clearInterval(t); reject(new Error(r.error || 'Rendu échoué.')); return; }
        onProgress(r.progress || 0);
        if (r.status === 'done') { clearInterval(t); resolve(r); }
      } catch { if (++fails >= 5) { clearInterval(t); reject(new Error('Connexion perdue avec le serveur.')); } }
    }, 800);
  });
}

$('previewBtn').addEventListener('click', async () => {
  readControls();
  setRenderOverlay(true, 'Génération de l\'aperçu…', 0);
  $('previewBtn').disabled = true; $('finalBtn').disabled = true;
  try {
    const rid = await startRender(opt, true);
    await pollRender(rid, (p) => setRenderOverlay(true, 'Génération de l\'aperçu…', p));
    const v = $('previewVideo');
    v.src = `/api/jobs/${jobId}/renders/${rid}/download?t=${Date.now()}`;
    showVideo();
  } catch (err) { showError(friendlyErr(err)); }
  finally { setRenderOverlay(false); $('previewBtn').disabled = false; $('finalBtn').disabled = false; }
});

$('finalBtn').addEventListener('click', async () => {
  readControls();
  setRenderOverlay(true, 'Rendu final en cours…', 0);
  $('previewBtn').disabled = true; $('finalBtn').disabled = true;
  $('finalDownload').classList.add('hidden');
  try {
    const rid = await startRender(opt, false);
    await pollRender(rid, (p) => setRenderOverlay(true, 'Rendu final en cours…', p));
    const a = $('finalDownload');
    a.href = `/api/jobs/${jobId}/renders/${rid}/download`;
    a.classList.remove('hidden');
    const v = $('previewVideo');
    v.src = `/api/jobs/${jobId}/renders/${rid}/download?t=${Date.now()}`;
    showVideo();
  } catch (err) { showError(friendlyErr(err)); }
  finally { setRenderOverlay(false); $('previewBtn').disabled = false; $('finalBtn').disabled = false; }
});

$('srtBtn').addEventListener('click', async () => {
  try {
    readControls();
    const rid = await startRender({ format: 'srt', punctuation: opt.punctuation }, false);
    await pollRender(rid, () => {});
    window.location.href = `/api/jobs/${jobId}/renders/${rid}/download`;
  } catch (err) { showError(friendlyErr(err)); }
});

function setRenderOverlay(visible, stage, pct) {
  $('renderOverlay').classList.toggle('hidden', !visible);
  if (visible) {
    $('renderStage').textContent = stage || 'Génération…';
    $('renderBar').style.width = Math.max(0, Math.min(100, pct || 0)) + '%';
    $('renderPct').innerHTML = Math.round(pct || 0) + '&nbsp;%';
  }
}

// --- Utilitaires ---
function setBar(prefix, pct, stage) {
  $(prefix + 'Bar').style.width = Math.max(0, Math.min(100, pct)) + '%';
  $(prefix + 'Pct').innerHTML = Math.round(pct) + '&nbsp;%';
  if (stage) $(prefix + 'Stage').textContent = stage;
}
function friendlyErr(err) {
  const m = (err && err.message) || String(err);
  if (/failed to fetch|networkerror|load failed|connexion perdue/i.test(m)) {
    return 'Impossible de joindre le serveur. Vérifie que la fenêtre « Lancer Scriptshort » est toujours ouverte, puis réessaie.';
  }
  return m;
}
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
function showError(msg) {
  stopLive();
  ['uploadView', 'transcribeView', 'studioView'].forEach(hide);
  show('errorSection');
  $('errorMsg').textContent = msg;
}

function fullReset() {
  clearInterval(pollTimer);
  stopLive();
  jobId = null; selectedFile = null; cues = []; videoDim = null;
  $('fileInput').value = '';
  $('fileChosen').classList.add('hidden');
  $('importBtn').disabled = true;
  $('previewVideo').src = ''; $('previewVideo').classList.add('hidden');
  $('finalDownload').classList.add('hidden');
  ['transcribeView', 'studioView', 'errorSection'].forEach(hide);
  show('uploadView');
}

// ============ Couleurs : champ #, favoris ============
const COLOR_FIELDS = [
  { picker: 'textColor', hex: 'textColorHex' },
  { picker: 'highlightColor', hex: 'highlightColorHex' },
  { picker: 'outlineColor', hex: 'outlineColorHex' },
];
let activeColorField = 'highlightColor';
const FAV_KEY = 'scriptshort_fav_colors';

function normHex(v) {
  v = String(v || '').trim();
  if (v[0] !== '#') v = '#' + v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) v = '#' + v.slice(1).split('').map((c) => c + c).join('');
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null;
}
function setActiveColor(field) {
  activeColorField = field;
  document.querySelectorAll('.color-ctrl').forEach((c) => c.classList.toggle('active', c.dataset.color === field));
}
function onColorEdited() { readControls(); showLive(); renderLive(); }
function setupColorControls() {
  COLOR_FIELDS.forEach(({ picker, hex }) => {
    const p = $(picker), h = $(hex);
    p.addEventListener('input', () => { h.value = p.value.toUpperCase(); setActiveColor(picker); onColorEdited(); });
    p.addEventListener('focus', () => setActiveColor(picker));
    h.addEventListener('focus', () => setActiveColor(picker));
    h.addEventListener('input', () => { const n = normHex(h.value); if (n) { p.value = n; setActiveColor(picker); onColorEdited(); } });
    h.addEventListener('blur', () => { h.value = p.value.toUpperCase(); });
  });
  setActiveColor('highlightColor');
}
function loadFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } }
function saveFavs(a) { try { localStorage.setItem(FAV_KEY, JSON.stringify(a)); } catch { /* indispo */ } }
function renderFavs() {
  const favs = loadFavs();
  const wrap = $('favColors');
  wrap.innerHTML = '';
  if (!favs.length) { wrap.innerHTML = '<span class="fav-empty">Aucune. Choisis une couleur puis « ＋ Enregistrer ».</span>'; return; }
  favs.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'fav-swatch'; b.style.background = c; b.title = c;
    b.innerHTML = '<span class="x">×</span>';
    b.addEventListener('click', (e) => {
      if (e.target.classList.contains('x')) { const a = loadFavs(); a.splice(i, 1); saveFavs(a); renderFavs(); return; }
      const p = $(activeColorField), h = $(activeColorField + 'Hex');
      p.value = c; h.value = c.toUpperCase(); onColorEdited();
    });
    wrap.appendChild(b);
  });
}
function wireFavorites() {
  $('favAdd').addEventListener('click', () => {
    const c = $(activeColorField).value.toUpperCase();
    const a = loadFavs();
    if (!a.includes(c)) { a.unshift(c); saveFavs(a.slice(0, 24)); renderFavs(); }
  });
}

// ============ Éditeur de sous-titres (cues) ============
let editCues = [];
let lastActiveIdx = -1;
function wireEditor() {
  $('editTextBtn').addEventListener('click', openEditor);
  $('editCancel').addEventListener('click', closeEditor);
  $('editSave').addEventListener('click', saveEditor);
  $('editAdd').addEventListener('click', addCueRow);
  $('editRegen').addEventListener('click', regenCues);
  $('editModal').addEventListener('click', (e) => { if (e.target.id === 'editModal') closeEditor(); });
  const v = $('editVideo');
  v.addEventListener('timeupdate', updateEditOverlay);
  v.addEventListener('seeked', updateEditOverlay);
  v.addEventListener('loadeddata', updateEditOverlay);
}

// Affiche le sous-titre courant sur la vidéo + surligne sa ligne dans la liste.
function updateEditOverlay() {
  const t = $('editVideo').currentTime || 0;
  let idx = -1;
  for (let i = 0; i < editCues.length; i++) {
    if (t >= editCues[i].start && t < editCues[i].end) { idx = i; break; }
  }
  $('editOverlay').textContent = idx >= 0 ? (editCues[idx].text || '') : '';
  const rows = $('cuesEdit').children;
  for (let i = 0; i < rows.length; i++) rows[i].classList.toggle('cue-active', i === idx);
  if (idx >= 0 && idx !== lastActiveIdx) {
    const r = rows[idx];
    if (r) r.scrollIntoView({ block: 'nearest' });
  }
  lastActiveIdx = idx;
}
function closeEditor() {
  $('editModal').classList.add('hidden');
  const v = $('editVideo');
  try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* rien */ }
}
function seekEditVideo(t) {
  const v = $('editVideo');
  if (!v || !v.getAttribute('src')) return;
  const tt = Math.max(0, Number(t) || 0);
  try { v.currentTime = tt; v.pause(); } catch { /* metadata pas prête */ }
}
async function openEditor() {
  if (!jobId) return;
  try {
    const data = await (await fetch(`/api/jobs/${jobId}/cues`)).json();
    const strip = !opt.punctuation;
    editCues = (data.cues || []).map((c) => ({ start: c.start, end: c.end, text: strip ? stripPunctJS(c.text) : c.text }));
    $('editVideo').src = `/api/jobs/${jobId}/source`;
    lastActiveIdx = -1;
    renderCueRows();
    updateEditOverlay();
    $('editModal').classList.remove('hidden');
  } catch { alert('Impossible de charger les sous-titres.'); }
}
function renderCueRows() {
  const wrap = $('cuesEdit');
  wrap.innerHTML = '';
  editCues.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'cue-row';
    row.innerHTML =
      `<button type="button" class="cue-eye" data-i="${i}" title="Voir l'image de ce sous-titre">👁</button>` +
      `<input type="number" step="0.1" min="0" class="cue-t" value="${(c.start || 0).toFixed(1)}" data-i="${i}" data-f="start" title="Début (s)">` +
      `<input type="number" step="0.1" min="0" class="cue-t" value="${(c.end || 0).toFixed(1)}" data-i="${i}" data-f="end" title="Fin (s)">` +
      `<input type="text" class="cue-text" value="${escapeAttr(c.text)}" data-i="${i}" data-f="text" spellcheck="false">` +
      `<button type="button" class="cue-del" data-i="${i}" title="Supprimer ce sous-titre">✕</button>`;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.i, f = inp.dataset.f;
      editCues[i][f] = (f === 'text') ? inp.value : (parseFloat(inp.value) || 0);
      if (f === 'start' || f === 'end') seekEditVideo(editCues[i][f]);
      else updateEditOverlay();
    });
    if (inp.classList.contains('cue-t')) inp.addEventListener('focus', () => seekEditVideo(parseFloat(inp.value)));
  });
  wrap.querySelectorAll('.cue-eye').forEach((b) => b.addEventListener('click', () => seekEditVideo(editCues[+b.dataset.i].start)));
  wrap.querySelectorAll('.cue-del').forEach((b) => b.addEventListener('click', () => { editCues.splice(+b.dataset.i, 1); renderCueRows(); }));
}
function addCueRow() {
  const last = editCues[editCues.length - 1];
  const start = last ? last.end : 0;
  editCues.push({ start, end: start + 1.5, text: 'Nouveau sous-titre' });
  renderCueRows();
  const w = $('cuesEdit'); w.scrollTop = w.scrollHeight;
}
async function regenCues() {
  if (!confirm('Redécouper automatiquement selon le rythme ?\nCela remplace tes corrections de texte et de timing.')) return;
  try {
    const res = await fetch(`/api/jobs/${jobId}/cues/regenerate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maxWords: opt.maxWords || 4 }),
    });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || 'Erreur');
    editCues = r.cues.map((c) => ({ start: c.start, end: c.end, text: c.text }));
    renderCueRows();
  } catch (err) { alert('Échec : ' + err.message); }
}
async function saveEditor() {
  const out = editCues
    .map((c) => ({ start: Number(c.start) || 0, end: Number(c.end) || 0, text: (c.text || '').trim() }))
    .filter((c) => c.text && c.end > c.start);
  if (!out.length) { alert('Ajoute au moins un sous-titre valide (fin > début).'); return; }
  try {
    const res = await fetch(`/api/jobs/${jobId}/cues`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cues: out }),
    });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || 'Erreur');
    cues = r.cues || out;
    closeEditor();
    showLive(); renderLive();
  } catch (err) { alert('Échec de l\'enregistrement : ' + err.message); }
}

setupColorControls();
wireFavorites();
renderFavs();
wireEditor();

$('restartBtn').addEventListener('click', fullReset);
$('errorRestartBtn').addEventListener('click', fullReset);
