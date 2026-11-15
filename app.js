/* Ether Explains — prompt builder, player and recorder for three.js explainers. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const STYLES = window.ETHER_STYLES, CATS = window.ETHER_CATEGORIES;
const THREE_VER = '0.170.0';
const LS_PROJECTS = 'etherExplains.projects.v1', LS_CURRENT = 'etherExplains.current.v1';
const RES = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };

/* ---------------- state ---------------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const blank = () => ({ id: uid(), name: '', styleId: 'glass-light', custom: null, topic: '', duration: 20, aspect: '16:9',
  genre: 'Explainer', tone: '', palette: '', timingMode: 'srt', srt: '', script: '', wpm: 150, withSound: false,
  versions: [], cur: -1, updated: Date.now() });
let projects = {};
try { projects = JSON.parse(localStorage.getItem(LS_PROJECTS) || '{}'); } catch { projects = {}; }
let P = projects[localStorage.getItem(LS_CURRENT)] || blank();
let saveTimer = null;
const LS_COVERS = 'etherExplains.covers.v1';
let covers = {};
try { covers = JSON.parse(localStorage.getItem(LS_COVERS) || '{}'); } catch { covers = {}; }
function save() {
  $('#saveState').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    P.updated = Date.now();
    projects[P.id] = P;
    try {
      localStorage.setItem(LS_PROJECTS, JSON.stringify(projects));
      localStorage.setItem(LS_CURRENT, P.id);
      $('#saveState').textContent = 'Saved';
    } catch (e) {
      $('#saveState').textContent = 'Not saved';
      toast('Browser storage is full — export old projects and delete them.');
    }
  }, 300);
}
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}
const styleOf = () => P.custom ? { id: 'custom', name: P.custom.name || 'Custom style', brief: P.custom.brief, genre: P.genre, cat: 'custom' }
                               : (STYLES.find(s => s.id === P.styleId) || STYLES[0]);

/* ---------------- tabs ---------------- */
function showTab(name) {
  $$('.step').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  if (name === 'prompt') buildPrompt();
  if (name === 'revise') { buildRevise(); renderVersions(); }
}
$$('.step').forEach(b => b.onclick = () => showTab(b.dataset.tab));
$$('[data-goto]').forEach(b => b.onclick = () => showTab(b.dataset.goto));

/* ---------------- gallery ---------------- */
let catFilter = 'all';
function renderChips() {
  const all = [{ id: 'all', name: 'All 37' }, ...CATS];
  $('#catChips').innerHTML = all.map(c => `<button class="chip ${c.id === catFilter ? 'active' : ''}" data-c="${c.id}">${c.name}</button>`).join('');
  $$('#catChips .chip').forEach(b => b.onclick = () => { catFilter = b.dataset.c; renderChips(); renderGallery(); });
}
function art(sw, i, id) {
  const cv = id && covers[id];
  if (cv) return `<div class="art has-img" style="background-image:url('${cv.url}')"><span class="num">#${String(i + 1).padStart(2, '0')}</span></div>`;
  const [a, b, c] = sw;
  const r = n => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return `<div class="art" style="background:linear-gradient(${Math.round(r(1) * 360)}deg,${a},${b})">
    <i style="width:${30 + r(2) * 40}px;height:${30 + r(2) * 40}px;left:${r(3) * 70}%;top:${r(4) * 50}%;background:${c};opacity:.85"></i>
    <i style="width:${14 + r(5) * 20}px;height:${14 + r(5) * 20}px;left:${r(6) * 85}%;top:${20 + r(7) * 50}%;background:${b};box-shadow:0 0 18px ${c}"></i>
    <span class="num">#${String(i + 1).padStart(2, '0')}</span></div>`;
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderGallery() {
  const q = $('#styleSearch').value.trim().toLowerCase();
  const list = STYLES.map((s, i) => ({ s, i })).filter(({ s }) =>
    (catFilter === 'all' || s.cat === catFilter) &&
    (!q || (s.name + ' ' + s.brief + ' ' + s.genre).toLowerCase().includes(q)));
  $('#gallery').innerHTML = list.map(({ s, i }) => {
    const cat = CATS.find(c => c.id === s.cat)?.name || '';
    return `<button class="card ${!P.custom && s.id === P.styleId ? 'sel' : ''}" data-id="${s.id}">
      ${art(s.swatch, i, s.id)}
      <div class="meta"><div class="nm">${esc(s.name)}</div><div class="sub">${esc(cat)} · ${esc(s.genre)}</div>
      <div class="brief">${esc(s.brief)}${covers[s.id] ? `<br><span class="cover-reset" data-reset="${s.id}">Reset cover</span>` : ''}</div></div></button>`;
  }).join('') || '<p class="hint">No styles match.</p>';
  $$('#gallery .cover-reset').forEach(x => x.onclick = e => {
    e.stopPropagation(); delete covers[x.dataset.reset]; storeCovers(); renderGallery(); toast('Cover removed.');
  });
  $$('#gallery .card').forEach(c => c.onclick = () => {
    P.styleId = c.dataset.id; P.custom = null;
    const s = STYLES.find(x => x.id === P.styleId);
    if (s && s.genre) { P.genre = s.genre; $('#genre').value = s.genre; }
    save(); renderGallery(); updatePill();
  });
}
$('#styleSearch').oninput = () => { if (catFilter !== 'all') { catFilter = 'all'; renderChips(); } renderGallery(); };
$('#useCustom').onclick = () => {
  const brief = $('#customBrief').value.trim();
  if (!brief) return toast('Paste a style prompt first.');
  P.custom = { name: $('#customName').value.trim() || 'Custom style', brief };
  save(); renderGallery(); updatePill(); toast('Custom style selected.');
};
function updatePill() { $('#stylePill').textContent = 'Style: ' + styleOf().name; }

/* ---------------- story fields ---------------- */
const bind = (sel, key, num) => {
  const el = $(sel);
  el.value = P[key] ?? '';
  el.oninput = () => { P[key] = num ? Number(el.value) : el.value; save(); if (key === 'srt' || key === 'duration') renderCues(); if (key === 'aspect') layoutStage(); };
};
function bindAll() {
  bind('#topic', 'topic'); bind('#duration', 'duration', true); bind('#aspect', 'aspect'); bind('#genre', 'genre');
  bind('#tone', 'tone'); bind('#palette', 'palette'); bind('#srt', 'srt'); bind('#script', 'script'); bind('#wpm', 'wpm', true);
  $('#projectName').value = P.name; $('#projectName').oninput = e => { P.name = e.target.value; save(); };
  $('#withSound').checked = !!P.withSound; $('#withSound').onchange = e => { P.withSound = e.target.checked; save(); buildPrompt(); };
  $('#customName').value = P.custom?.name || ''; $('#customBrief').value = P.custom?.brief || '';
  setTimingMode(P.timingMode || 'srt');
  if (window.bindAiReady) bindAi();
}
function setTimingMode(m) {
  P.timingMode = m;
  $$('#timingMode button').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  $('#srtBox').hidden = m !== 'srt'; $('#scriptBox').hidden = m !== 'script';
  renderCues();
}
$$('#timingMode button').forEach(b => b.onclick = () => { setTimingMode(b.dataset.mode); save(); });
$('#srtFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  P.srt = await f.text(); $('#srt').value = P.srt; save(); renderCues(); e.target.value = '';
};

/* SRT / VTT parsing */
const toSec = s => { const m = s.trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/); return m ? (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) : NaN; };
function parseCues(text) {
  const out = [];
  const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/);
  for (const b of blocks) {
    const lines = b.split('\n').map(l => l.trim()).filter(Boolean);
    const ti = lines.findIndex(l => l.includes('-->'));
    if (ti < 0) continue;
    const [a, z] = lines[ti].split('-->');
    const start = toSec(a), end = toSec(z.split(' ').filter(Boolean)[0] || z);
    const txt = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '');
    if (!isNaN(start) && !isNaN(end) && txt) out.push({ start, end, text: txt });
  }
  return out;
}
const fmtSrt = s => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60, r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(r).padStart(3, '0')}`; };
$('#scriptToSrt').onclick = () => {
  const lines = (P.script || '').split(/\n+|(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) return toast('Write the script first.');
  const wps = (P.wpm || 150) / 60; let t = 0.4; const cues = [];
  lines.forEach((l, i) => { const d = Math.max(1.4, l.split(/\s+/).length / wps); cues.push(`${i + 1}\n${fmtSrt(t)} --> ${fmtSrt(t + d)}\n${l}`); t += d + 0.35; });
  P.srt = cues.join('\n\n'); $('#srt').value = P.srt;
  P.duration = Math.ceil(t + 1); $('#duration').value = P.duration;
  setTimingMode('srt'); save(); toast('Timed cues made — check them in the SRT tab.');
};
function cues() { return P.timingMode === 'none' ? [] : parseCues(P.srt); }
function renderCues() {
  const c = P.timingMode === 'none' ? [] : parseCues(P.srt);
  const box = $('#cueSummary');
  if (P.timingMode === 'none') { box.innerHTML = 'No narration — Claude will pace the beats to the length you set.'; return; }
  if (!c.length) { box.innerHTML = P.srt.trim() ? '<span style="color:#ff8fa3">Couldn\'t read any cues — check the SRT format.</span>' : ''; return; }
  const end = c[c.length - 1].end;
  const warn = end > P.duration ? ` <span style="color:var(--gold)">Narration runs ${end.toFixed(1)}s — longer than the ${P.duration}s length.</span>` : '';
  box.innerHTML = `${c.length} cues, ${end.toFixed(1)}s of narration.${warn}<ol>${c.map(x => `<li><b>${x.start.toFixed(1)}–${x.end.toFixed(1)}s</b> ${esc(x.text)}</li>`).join('')}</ol>`;
}

/* ---------------- prompt ---------------- */
function contract(sound) {
  return `TECHNICAL RULES (the Ether Explains player depends on these):
1. Return ONE complete, self-contained HTML file in a single \`\`\`html code block. No other files.
2. Load three.js ${THREE_VER} with an import map:
   "three": "https://cdn.jsdelivr.net/npm/three@${THREE_VER}/build/three.module.js",
   "three/addons/": "https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm/"
   Use no other external files: no models, images, fonts or textures. Build everything from geometry, materials, lights, shaders and procedural CanvasTextures.
3. One full-window <canvas> from WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }). Use renderer.setPixelRatio(window.ETHER_PIXEL_RATIO || Math.min(devicePixelRatio, 2)). Handle window resize. Body margin 0, black background, no scrollbars.
4. ALL text (captions, labels, titles) must be drawn inside the WebGL canvas — CanvasTexture sprites/planes or a screen-space HUD scene rendered with an orthographic camera. No HTML overlays: only the canvas is recorded. Keep captions short, large and readable at phone size, inside a 6% safe margin.
5. Drive everything from one function of time: update(t) where t = seconds since the start. Same t must always give the same frame (seed any randomness). Advance t with real elapsed time while playing.
6. Expose this API exactly:
   window.ether = { duration, get time(){}, get playing(){}, play(), pause(), seek(t), restart(), setMuted(bool)${sound ? ', audioContext, masterGain' : ''} };
   Start playing automatically on load. When the scene is built and the first frame is drawn, call
   parent.postMessage({ type: 'ether-ready', duration }, '*'); when t reaches duration, hold the last frame, set playing false and call parent.postMessage({ type: 'ether-end' }, '*').
7. ${sound
    ? 'SOUND: synthesize all sound effects with the Web Audio API (no audio files). Route everything through one GainNode exposed as window.ether.masterGain (connected to audioContext.destination) and expose window.ether.audioContext. Start muted; setMuted(false) resumes the context. Sounds must be scheduled from t so they stay in sync after seek/restart. Keep them subtle — they sit under a voiceover.'
    : 'No sound. setMuted can be an empty function.'}
8. Camera moves must be smooth and deliberate (ease in/out, no jitter, no clipping through objects). Target 60 fps on a Mac mini; keep draw calls low (use InstancedMesh for repeated objects).
9. At the top of the script, write the beat plan as a comment (beat number, time range, what is on screen). Then write the code.`;
}
function buildPrompt() {
  const s = styleOf(), c = cues();
  const [w, h] = RES[P.aspect] || RES['16:9'];
  const narration = c.length
    ? `NARRATION CUES — the voiceover is fixed. Each cue's idea must be on screen during its time window; transitions land between cues:\n${c.map(x => `[${x.start.toFixed(2)}s – ${x.end.toFixed(2)}s] ${x.text}`).join('\n')}`
    : 'NARRATION: none. Pace 4–7 clear visual beats across the full length, with short on-screen captions carrying the explanation.';
  const out = `Use three.js to build a ${P.duration}-second animated 3D ${(P.genre || 'explainer').toLowerCase()} for "Ether Explains".

TOPIC: ${P.topic.trim() || '[write your topic here]'}
${P.tone.trim() ? `AUDIENCE & TONE: ${P.tone.trim()}\n` : ''}FORMAT: ${P.aspect} composition, framed for ${w}×${h}. Keep the important action centred so it also works if the window is a slightly different shape.
${P.palette.trim() ? `PALETTE / BRAND NOTES: ${P.palette.trim()}\n` : ''}
VISUAL STYLE — ${s.name}:
${s.brief}
Commit fully to this look in every beat: materials, lighting, camera and the way captions are presented should all belong to the same physical world.

${narration}

STORY: Explain the topic accurately and simply. Show, don't just label — every beat needs a visible change (something moves, builds, lights up, splits or transforms) that makes the idea obvious without the narration. End on a calm, composed final frame.

${contract(P.withSound)}`;
  $('#promptOut').value = out;
  return out;
}
$('#copyPrompt').onclick = async () => { await copy($('#promptOut').value); toast('Prompt copied — paste it into Claude.'); };
async function copy(text) {
  if (NATIVE) { try { await NATIVE.call('copy', { text }); return; } catch {} }
  try { await navigator.clipboard.writeText(text); }
  catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
}

/* ---------------- revise ---------------- */
let lastErrors = [];
function buildRevise() {
  const code = currentCode();
  const req = $('#changeReq').value.trim();
  const errs = lastErrors.length ? `\nERRORS FROM THE PLAYER (fix these first):\n${lastErrors.slice(-6).join('\n')}\n` : '';
  const cc = $('#includeTiming').checked ? cues() : [];
  const timing = cc.length ? `\nRETIME TO THE VOICEOVER — the narration is fixed; move each beat so its idea is on screen during its cue window, and set duration to at least ${Math.ceil(cc[cc.length - 1].end + 0.8)}s:\n${cc.map(x => `[${x.start.toFixed(2)}s – ${x.end.toFixed(2)}s] ${x.text}`).join('\n')}\n` : '';
  $('#errorBox').hidden = !lastErrors.length; $('#errorBox').textContent = lastErrors.slice(-6).join('\n');
  const out = `Update this "Ether Explains" three.js scene.

CHANGE: ${req || (lastErrors.length ? 'Fix the errors below.' : timing ? 'Retime the scene to the voiceover cues below.' : '[describe the change]')}
${errs}${timing}
Keep everything else as it is and keep following the player rules: one self-contained HTML file, three.js ${THREE_VER} via import map, all text inside the canvas, the window.ether API (duration, time, playing, play, pause, seek, restart, setMuted) and the ether-ready / ether-end messages. Return the complete updated HTML file in one \`\`\`html code block.${$('#includeCode').checked && code ? `\n\nCURRENT CODE:\n\`\`\`html\n${code}\n\`\`\`` : ''}`;
  $('#reviseOut').value = out;
  return out;
}
$('#changeReq').oninput = buildRevise; $('#includeCode').onchange = buildRevise; $('#includeTiming').onchange = buildRevise;
$('#copyRevise').onclick = async () => { await copy(buildRevise()); toast('Change prompt copied.'); };
function renderVersions() {
  const v = P.versions || [];
  $('#versions').innerHTML = v.length ? v.map((x, i) => `<div class="ver ${i === P.cur ? 'cur' : ''}"><span>v${i + 1} · ${new Date(x.at).toLocaleString()}${x.note ? ' · ' + esc(x.note) : ''}</span>
    <button class="btn ghost" data-v="${i}" type="button">${i === P.cur ? 'Playing' : 'Load'}</button></div>`).reverse().join('') : '<p class="hint">Versions appear here each time you load new code.</p>';
  $$('#versions [data-v]').forEach(b => b.onclick = () => { P.cur = +b.dataset.v; save(); play(currentCode()); renderVersions(); });
}

/* ---------------- player ---------------- */
const player = $('#player');
let readyInfo = null, loadT0 = 0, recording = null, muted = true, frameLoaded = false;
function currentCode() { return (P.versions && P.versions[P.cur]) ? P.versions[P.cur].code : ''; }
function extractHtml(text) {
  const t = String(text || '');
  const fences = [...t.matchAll(/```(?:html|HTML)?\s*\n([\s\S]*?)```/g)].map(m => m[1]);
  const pick = fences.find(f => /<html|<!doctype|<script/i.test(f)) || fences.sort((a, b) => b.length - a.length)[0];
  let code = (pick || t).trim();
  const i = code.search(/<!doctype html|<html/i);
  if (i > 0 && !pick) code = code.slice(i);
  const e = code.search(/<\/html>/i);
  if (e >= 0) code = code.slice(0, e + 7);
  return code;
}
const SHIM = `<script>
window.ETHER_PIXEL_RATIO=1;window.ETHER_HOST=true;
(function(){var send=function(m){try{parent.postMessage({type:'ether-error',message:String(m).slice(0,400)},'*')}catch(e){}};
addEventListener('error',function(e){if(e.target&&e.target!==window&&e.target.src){send('Could not load '+e.target.src);return;}send((e.message||'Error')+(e.lineno?' (line '+e.lineno+')':''))},true);
addEventListener('unhandledrejection',function(e){send('Unhandled promise: '+((e.reason&&e.reason.message)||e.reason))});
var ce=console.error;console.error=function(){send([].map.call(arguments,String).join(' '));return ce.apply(console,arguments)};})();
<\/script>`;
const NATIVE = window.EtherNative || null;
// in the Mac app, scenes use the bundled three.js so they play without the internet
function localize(code) {
  const b = NATIVE && NATIVE.threeBase;
  return b ? code.split(`https://cdn.jsdelivr.net/npm/three@${THREE_VER}/`).join(b) : code;
}
function inject(code) {
  code = localize(code);
  if (/<head[^>]*>/i.test(code)) return code.replace(/<head[^>]*>/i, m => m + SHIM);
  if (/<html[^>]*>/i.test(code)) return code.replace(/<html[^>]*>/i, m => m + '<head>' + SHIM + '</head>');
  return SHIM + code;
}
// free the old scene's WebGL context right away (WebKit keeps a small number alive; reloading for a recording needs a fresh one)
function releaseGl() {
  try {
    const doc = player.contentDocument; if (!doc) return;
    doc.querySelectorAll('canvas').forEach(cv => {
      const gl = cv.__etherGl || cv.getContext('webgl2') || cv.getContext('webgl');
      const ext = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    });
  } catch {}
}
function setStatus(kind, text) { $('#statusDot').className = 'dot ' + kind; $('#statusText').textContent = text; }
let loadSeq = 0, glRetries = 0, lastPlay = { code: '', scale: 1 };
function play(code, scale = 1, retry = false) {
  if (!code) return;
  if (!/<script[\s>]/i.test(code)) {
    $('#emptyState').hidden = true; player.srcdoc = '<!doctype html><body style="margin:0;background:#000"></body>';
    setStatus('err', 'This version isn\'t a scene');
    showAlert('This version is text, not a scene', 'It looks like the prompt was pasted instead of Claude\'s reply. Paste the prompt into Claude, then paste the HTML Claude gives back with "Paste Claude\'s code".');
    return;
  }
  if (!retry) glRetries = 0;
  lastPlay = { code, scale };
  readyInfo = null; frameLoaded = false; lastErrors = []; loadT0 = performance.now();
  hideAlert(); blackTimers.forEach(clearTimeout); clearTimeout(coverTimer);
  $('#emptyState').hidden = true;
  setStatus('load', 'Loading scene…');
  layoutStage(scale);
  // release the old scene's 3D context, show a blank page for a moment, then load the new scene
  releaseGl();
  const seq = ++loadSeq;
  player.dataset.blank = '1';
  player.srcdoc = '<!doctype html><body style="margin:0;background:#000"></body>';
  setTimeout(() => { if (seq !== loadSeq) return; delete player.dataset.blank; player.srcdoc = inject(code); }, 180);
}
const GL_FAIL = /getShaderPrecisionFormat|WebGL|webgl|context (?:was )?lost|Error creating WebGL/;
function addVersion(code, note) {
  P.versions = P.versions || [];
  P.versions.push({ code, at: Date.now(), note: note || '' });
  if (P.versions.length > 12) P.versions.shift();
  P.cur = P.versions.length - 1;
  lastErrors = [];
  save(); play(code); renderVersions();
}
window.addEventListener('message', e => {
  if (e.source !== player.contentWindow || !e.data || typeof e.data !== 'object') return;
  const d = e.data;
  if (d.type === 'ether-ready') {
    readyInfo = { duration: Number(d.duration) || P.duration };
    setStatus('ok', `Playing · ${readyInfo.duration}s`);
    const api = etherApi(); if (api && api.setMuted) try { api.setMuted(muted); } catch {}
    scheduleBlackCheck();
    scheduleAutoCover(readyInfo.duration);
  } else if (d.type === 'ether-end') {
    if (!recording) setStatus('ok', 'Finished — press ⟲ to replay');
  } else if (d.type === 'ether-error') {
    // WebKit sometimes hands a reloaded scene a dead 3D context: quietly try again before calling it an error
    if (GL_FAIL.test(d.message) && !readyInfo && glRetries < 3 && performance.now() - loadT0 < 8000) {
      glRetries++; setStatus('load', 'Starting 3D…');
      setTimeout(() => play(lastPlay.code, lastPlay.scale, true), 500 * glRetries);
      return;
    }
    if (!lastErrors.includes(d.message)) lastErrors.push(d.message);
    setStatus('err', 'Error: ' + d.message.slice(0, 90));
    showAlert('The scene hit an error', lastErrors.slice(-3).join('\n'));
  }
});
player.addEventListener('load', () => {
  if (!player.srcdoc || player.dataset.blank) return;
  frameLoaded = true;
  setTimeout(() => {
    if (!readyInfo && !lastErrors.length) { setStatus('ok', etherApi() ? 'Playing' : 'Playing (no ether API — basic controls only)'); scheduleBlackCheck(); }
  }, 2500);
});
/* style covers: a still frame from your own scene becomes the style's card picture */
function storeCovers() {
  try { localStorage.setItem(LS_COVERS, JSON.stringify(covers)); return true; }
  catch { toast('Browser storage is full — remove some covers or old projects.'); return false; }
}
function grabFrame(maxDim = 560) {
  try {
    const doc = player.contentDocument;
    const cv = doc && [...doc.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!cv || !cv.width) return null;
    const s = Math.min(1, maxDim / Math.max(cv.width, cv.height));
    const out = document.createElement('canvas'); out.width = Math.round(cv.width * s); out.height = Math.round(cv.height * s);
    const x = out.getContext('2d', { willReadFrequently: true });
    x.drawImage(cv, 0, 0, out.width, out.height);
    const px = x.getImageData(0, 0, out.width, out.height).data;
    let max = 0;
    for (let i = 0; i < px.length; i += 16) { const l = px[i] + px[i + 1] + px[i + 2]; if (l > max) max = l; }
    return { url: out.toDataURL('image/jpeg', 0.82), max };
  } catch { return null; }
}
function saveCover(styleId, manual) {
  if (!styleId || styleId === 'custom') return 'custom';
  if (!manual && covers[styleId] && covers[styleId].manual) return 'kept';
  const f = grabFrame();
  if (!f) return 'none';
  if (f.max < 24) return 'black';
  covers[styleId] = { url: f.url, manual: !!manual, at: Date.now() };
  if (!storeCovers()) return 'full';
  renderGallery();
  return 'ok';
}
let coverTimer = null;
function scheduleAutoCover(dur) {
  clearTimeout(coverTimer);
  const styleId = P.custom ? null : P.styleId;
  if (!styleId) return;
  coverTimer = setTimeout(() => { if (!P.custom && P.styleId === styleId) saveCover(styleId, false); }, Math.max(1500, (dur || 10) * 650));
}
$('#coverBtn').onclick = () => {
  if (!currentCode()) return toast('Load a scene first.');
  const s = styleOf();
  const r = saveCover(P.custom ? 'custom' : P.styleId, true);
  if (r === 'ok') toast(`This frame is now the ${s.name} cover.`);
  else if (r === 'custom') toast('Covers are for the 37 gallery styles — pick one in the Style tab first.');
  else if (r === 'black') toast('That frame is black — pause on a better moment and try again.');
  else toast('Couldn\'t grab a frame from this scene.');
};

/* problem alerts on the stage */
function showAlert(title, text) {
  if (recording) return;
  $('#alertTitle').textContent = title; $('#alertText').textContent = text; $('#stageAlert').hidden = false;
}
function hideAlert() { $('#stageAlert').hidden = true; }
$('#alertClose').onclick = hideAlert;
$('#alertFix').onclick = () => { hideAlert(); showTab('revise'); toast('Copy the change prompt and paste it into the same Claude chat.'); };

/* black-screen check: sample the scene canvas a few times; if every sample is (near) black, flag it */
let blackTimers = [];
function sampleCanvas() {
  try {
    const doc = player.contentDocument;
    const cv = doc && [...doc.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!cv || !cv.width) return { ok: false, why: 'no canvas' };
    const t = document.createElement('canvas'); t.width = 48; t.height = 48;
    const x = t.getContext('2d', { willReadFrequently: true });
    x.drawImage(cv, 0, 0, 48, 48);
    const px = x.getImageData(0, 0, 48, 48).data;
    let max = 0, sum = 0;
    for (let i = 0; i < px.length; i += 4) { const l = px[i] + px[i + 1] + px[i + 2]; sum += l; if (l > max) max = l; }
    return { ok: true, max, avg: sum / (px.length / 4) };
  } catch (e) { return { ok: false, why: String(e) }; }
}
function scheduleBlackCheck() {
  blackTimers.forEach(clearTimeout); blackTimers = [];
  const results = [];
  [1200, 3500, 7000].forEach((ms, i, arr) => blackTimers.push(setTimeout(() => {
    results.push(sampleCanvas());
    if (results.length === arr.length) {
      const good = results.filter(r => r.ok);
      if (good.length && good.every(r => r.max < 24)) {
        const api = etherApi();
        const msg = `Player check: the canvas stays completely black while the scene runs (checked at ~1s, ~3s and ~7s${api ? '' : ', no window.ether API found'}). Make sure the renderer actually draws: lights are added and bright enough, the camera is outside the objects and looking at them, objects are added to the scene, renderer.render(scene, camera) runs every frame (and a HUD/second render pass doesn't clear the first one — use renderer.autoClear = false with a manual clear), and preserveDrawingBuffer: true is set.`;
        if (!lastErrors.includes(msg)) lastErrors.push(msg);
        setStatus('err', 'Scene is drawing only black');
        showAlert('The scene is drawing only black', 'Every frame I checked is black. Usually that means no light, the camera is inside or behind something, or a second render pass wipes the picture. Get a fix prompt to send back to Claude.');
      }
    }
  }, ms)));
}
function etherApi() { try { return player.contentWindow && player.contentWindow.ether; } catch { return null; } }

/* stage layout: iframe renders at the target resolution, scaled to fit */
function layoutStage(scale = 1) {
  const [w0, h0] = RES[P.aspect] || RES['16:9'];
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const inner = $('#stageInner'), st = $('#stage');
  inner.style.width = w + 'px'; inner.style.height = h + 'px';
  const s = Math.min(st.clientWidth / w, st.clientHeight / h) || 0.3;
  inner.style.transform = `translate(-50%,-50%) scale(${s})`;
  inner.style.setProperty('--inv', (1 / s).toFixed(3));
}
new ResizeObserver(() => layoutStage(recording ? recording.scale : 1)).observe($('#stage'));

/* transport */
function tick() {
  const api = etherApi();
  let t = 0, d = readyInfo?.duration || P.duration || 0, playing = false;
  if (api) { try { t = api.time || 0; d = api.duration || d; playing = !!api.playing; } catch {} }
  else if (player.srcdoc && $('#emptyState').hidden) { t = Math.min(d, (performance.now() - loadT0) / 1000); playing = t < d; }
  $('#timeFill').style.width = d ? Math.min(100, (t / d) * 100) + '%' : '0';
  $('#timeLabel').textContent = `${t.toFixed(1)} / ${Number(d).toFixed(1)}`;
  $('#playBtn').textContent = playing ? '❚❚' : '▶';
  if (recording) $('#recTime').textContent = ((performance.now() - recording.t0) / 1000).toFixed(1);
  syncVoice(api);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
$('#playBtn').onclick = () => { const a = etherApi(); if (!a) return; try { a.playing ? a.pause() : (a.time >= a.duration - 0.05 ? a.restart() : a.play()); } catch {} };
$('#restartBtn').onclick = () => { const a = etherApi(); if (a && a.restart) { try { a.restart(); setStatus('ok', 'Playing'); } catch {} } else play(currentCode()); };
$('.timebar').onclick = e => { const a = etherApi(); if (!a) return; const r = e.currentTarget.getBoundingClientRect(); try { a.seek(((e.clientX - r.left) / r.width) * a.duration); } catch {} };
$('#soundBtn').onclick = () => { muted = !muted; $('#soundBtn').textContent = muted ? '🔇' : '🔊'; const a = etherApi(); if (a && a.setMuted) try { a.setMuted(muted); } catch {} };
$('#fullBtn').onclick = () => { const st = $('#stage'); (document.fullscreenElement ? document.exitFullscreen() : st.requestFullscreen?.()); };
document.addEventListener('fullscreenchange', () => setTimeout(() => layoutStage(), 50));

/* load code */
const openPaste = () => { $('#pasteArea').value = ''; $('#pasteDlg').showModal(); setTimeout(() => $('#pasteArea').focus(), 50); };
['#pasteCodeBtn', '#pasteCodeBtn2', '#pasteCodeBtn3'].forEach(s => $(s).onclick = openPaste);
// a scene is an HTML page with a script; our own prompt (or any plain text) is not
const isPromptText = t => /for "Ether Explains"/.test(t) && /TECHNICAL RULES|player rules|CHANGE:/.test(t) && !/<script[\s>]/i.test(t);
const looksLikeScene = code => /<script[\s>]/i.test(code) && /<\/script>/i.test(code);
function checkScene(raw, code) {
  if (isPromptText(raw)) return 'That\'s the prompt, not the scene. Paste it into a Claude chat first, then paste Claude\'s reply (the HTML) here.';
  if (!looksLikeScene(code)) return 'That doesn\'t look like scene code. Paste the whole reply from Claude; it should contain an html code block.';
  return '';
}
$('#pasteGo').onclick = e => {
  const raw = $('#pasteArea').value, code = extractHtml(raw), bad = checkScene(raw, code);
  if (bad) { e.preventDefault(); toast(bad, 6000); return; }
  addVersion(code, 'pasted');
};
$('#htmlFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return; e.target.value = '';
  const raw = await f.text(), code = extractHtml(raw), bad = checkScene(raw, code);
  if (bad) return toast(bad, 6000);
  addVersion(code, f.name);
};
$('#demoBtn').onclick = async () => {
  try {
    const code = await (await fetch('demo.html', { cache: 'no-cache' })).text();
    if (!P.topic) { P.topic = 'Why the Moon has phases'; $('#topic').value = P.topic; }
    if (!P.name) { P.name = 'Moon phases (demo)'; $('#projectName').value = P.name; }
    P.aspect = '16:9'; $('#aspect').value = '16:9';
    addVersion(code, 'demo');
  } catch { toast('Couldn\'t load the demo.'); }
};
$('#downloadHtml').onclick = () => {
  const code = currentCode(); if (!code) return toast('Nothing loaded yet.');
  dl(new Blob([code], { type: 'text/html' }), slug() + '.html');
};
const slug = () => (P.name || P.topic || 'ether-explains').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'ether-explains';
function dl(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

/* ---------------- voice (shared by the Voice tab, the player and the recorder) ---------------- */
const DSP = window.EtherVoiceDSP;
let voice = null; // { blob, url, name, duration, an }
const voiceListeners = [];
const idb = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('etherExplains', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('voices');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
    const t = db.transaction('voices', mode), req = fn(t.objectStore('voices'));
    t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error);
  }));
  return { get: k => run('readonly', s => s.get(k)), put: (k, v) => run('readwrite', s => s.put(v, k)), del: k => run('readwrite', s => s.delete(k)) };
})();
async function setVoice(blob, name, { persist = true, quiet = false } = {}) {
  previewAudio.pause();
  if (voice) URL.revokeObjectURL(voice.url);
  if (!blob) {
    voice = null; P.voiceName = ''; save();
    if (persist) idb.del(P.id).catch(() => {});
    updateVoiceUi(); return null;
  }
  const v = { blob, url: URL.createObjectURL(blob), name: name || 'voice', duration: 0, an: null };
  voice = v; previewAudio.src = v.url;
  try { const au = await DSP.decode(blob); v.duration = au.duration; v.an = DSP.analyze(au); v.au = au; }
  catch (e) { v.duration = await audioDuration(v.url); if (!quiet) toast('That audio plays, but it couldn\'t be analysed for auto line-up.'); }
  if (voice !== v) return v;
  P.voiceName = v.name; save();
  if (persist) idb.put(P.id, { blob, name: v.name }).catch(() => toast('Voice is loaded but couldn\'t be saved in the browser.'));
  updateVoiceUi();
  if (!quiet) toast(`Voice ready: ${v.name} · ${v.duration.toFixed(1)}s`);
  return v;
}
async function loadVoiceFor(id) {
  const want = id;
  let rec = null; try { rec = await idb.get(id); } catch {}
  if (P.id !== want) return;
  if (rec && rec.blob) await setVoice(rec.blob, rec.name, { persist: false, quiet: true });
  else if (voice) { previewAudio.pause(); URL.revokeObjectURL(voice.url); voice = null; updateVoiceUi(); }
}
function updateVoiceUi() {
  const n = voice ? voice.name : 'Add voiceover';
  $('#audioName').textContent = n.length > 22 ? n.slice(0, 20) + '…' : n;
  $('#voiceBtn').hidden = !voice;
  $('#voiceBtn').textContent = P.voiceSync === false ? '🗣̸' : '🗣';
  $('#voiceBtn').title = P.voiceSync === false ? 'Voice is off in the player — click to play it with the scene' : 'Voice plays locked to the scene — click to turn it off';
  voiceListeners.forEach(f => { try { f(voice); } catch (e) { console.warn(e); } });
}
$('#audioFile').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  setVoice(f, f.name); e.target.value = '';
};

/* the voice follows the scene's clock while you preview, so what you see is what will be recorded */
const previewAudio = new Audio(); previewAudio.preload = 'auto';
let voiceHold = false, playBlockedUntil = 0;
function syncVoice(api) {
  if (!voice || recording) return;
  if (voiceHold || P.voiceSync === false || !api) { if (!previewAudio.paused) previewAudio.pause(); return; }
  let t, playing; try { t = api.time || 0; playing = !!api.playing; } catch { return; }
  const target = t - (P.voiceOffset || 0), dur = voice.duration || previewAudio.duration || 0;
  const inRange = target >= 0 && (!dur || target < dur - 0.03);
  if (playing && inRange) {
    const drift = target - previewAudio.currentTime; // + means the voice is behind the picture
    if (previewAudio.paused) {
      try { previewAudio.currentTime = target + 0.04; } catch {}
      if (performance.now() > playBlockedUntil) previewAudio.play().catch(() => { playBlockedUntil = performance.now() + 1500; });
    } else if (Math.abs(drift) > 0.3) { try { previewAudio.currentTime = target; } catch {} }
    else {
      // small drift: ease the voice's speed a touch so it slides back into place without a jump
      const r = Math.abs(drift) < 0.015 ? 1 : 1 + Math.max(-0.08, Math.min(0.08, drift * 0.6));
      if (Math.abs(previewAudio.playbackRate - r) > 0.004) previewAudio.playbackRate = r;
    }
  } else {
    if (previewAudio.playbackRate !== 1) previewAudio.playbackRate = 1;
    if (!previewAudio.paused) previewAudio.pause();
    if (inRange && Math.abs(previewAudio.currentTime - target) > 0.05) { try { previewAudio.currentTime = target; } catch {} }
  }
}
$('#voiceBtn').onclick = () => { P.voiceSync = P.voiceSync === false; save(); updateVoiceUi(); };

/* ---------------- recording ---------------- */
function pickMime() {
  const opts = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return opts.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}
const waitFor = (fn, ms) => new Promise(res => { const t0 = performance.now(); (function poll() { const v = fn(); if (v || performance.now() - t0 > ms) return res(v); setTimeout(poll, 60); })(); });
const audioDuration = url => new Promise(res => { const a = new Audio(); a.preload = 'metadata'; a.onloadedmetadata = () => res(a.duration); a.onerror = () => res(0); a.src = url; });

$('#recordBtn').onclick = async () => {
  if (recording) return stopRecording(true);
  const code = currentCode(); if (!code) return toast('Load a scene first.');
  if (!window.MediaRecorder) return toast('This browser can\'t record video. Try Chrome or Safari.');
  const scale = Number($('#recRes').value) || 1;
  const btn = $('#recordBtn'); btn.disabled = true; btn.textContent = 'Preparing…';
  const running = readyInfo && etherApi() && !lastErrors.length && player.contentDocument && player.contentDocument.querySelector('canvas');
  if (running) { layoutStage(scale); await new Promise(r => setTimeout(r, 450)); }
  else play(code, scale);
  await waitFor(() => readyInfo || (frameLoaded && lastErrors.length), 20000);
  if (!readyInfo) await waitFor(() => frameLoaded && player.contentDocument && player.contentDocument.querySelector('canvas'), 5000);
  const doc = player.contentDocument;
  const canvas = doc && [...doc.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!canvas) { btn.disabled = false; btn.textContent = '● Record video'; return toast('No canvas found in the scene.'); }
  const api = etherApi();
  if (api) { try { api.pause(); api.seek(0); } catch {} }
  await new Promise(r => setTimeout(r, 300));

  previewAudio.pause();
  const stream = canvas.captureStream(60);
  let ac = null, voiceEl = null, ownAc = false;
  try {
    const sceneSound = api && api.audioContext && api.masterGain && P.withSound;
    if (voice || sceneSound) {
      ac = sceneSound ? api.audioContext : new AudioContext(); ownAc = !sceneSound;
      const dest = ac.createMediaStreamDestination();
      if (sceneSound) { api.masterGain.connect(dest); try { api.setMuted(false); } catch {} }
      if (voice) {
        voiceEl = sceneSound ? new (player.contentWindow.Audio)(voice.url) : new Audio(voice.url);
        voiceEl.crossOrigin = 'anonymous';
        const src = ac.createMediaElementSource(voiceEl);
        src.connect(dest); src.connect(ac.destination);
      }
      await ac.resume();
      dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    }
  } catch (err) { console.warn(err); toast('Audio couldn\'t be attached — recording video only.'); }

  const sceneDur = (api && api.duration) || readyInfo?.duration || P.duration;
  const off = voice ? (P.voiceOffset || 0) : 0;
  let vDur = voice ? (voice.duration || await audioDuration(voice.url)) : 0;
  if (!isFinite(vDur)) vDur = 0;
  const total = Math.max(sceneDur, vDur ? vDur + off : 0) + 0.4;
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: scale >= 1 ? 16e6 : 8e6, audioBitsPerSecond: 192000 } : undefined);
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    const type = rec.mimeType || mime || 'video/webm';
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type });
    lastTake = { blob, name: `${slug()}.${ext}`, type, aspect: P.aspect, seconds: (performance.now() - recT0) / 1000 };
    $('#cutBtn').disabled = false;
    if (ownAc) ac.close().catch(() => {});
    dl(blob, lastTake.name);
    toast(`Saved ${lastTake.name} — press ✂ Edit in Ether's Cut to cut it.`, 4500);
  };
  const recT0 = performance.now();
  recording = { rec, t0: recT0, scale, voiceEl, timer: null, sync: null, vStart: null };
  rec.start(250);
  const startScene = () => { if (api) { try { api.restart ? api.restart() : (api.seek(0), api.play()); } catch {} } };
  if (!voiceEl) startScene();
  else {
    // the voice is the master clock: start it at the offset, then keep nudging the scene onto it
    const go = () => voiceEl.play().catch(() => toast('Voiceover could not start.'));
    try { voiceEl.currentTime = Math.max(0, -off); } catch {}
    if (off > 0) { startScene(); recording.vStart = setTimeout(go, off * 1000); }
    else { await Promise.race([go(), new Promise(r => setTimeout(r, 1500))]); startScene(); }
    recording.sync = setInterval(() => {
      if (!recording || voiceEl.paused || voiceEl.ended) return;
      const a = etherApi(); if (!a) return;
      try {
        const want = voiceEl.currentTime + off;
        if (a.playing && want < a.duration - 0.05 && Math.abs(a.time - want) > 0.09) a.seek(want);
      } catch {}
    }, 200);
  }
  btn.disabled = false; btn.textContent = '■ Stop'; btn.classList.add('on');
  $('#recBadge').hidden = false; setStatus('err', 'Recording…');
  recording.timer = setTimeout(() => stopRecording(false), total * 1000);
};
function stopRecording(manual) {
  if (!recording) return;
  clearTimeout(recording.timer); clearTimeout(recording.vStart); clearInterval(recording.sync);
  try { recording.rec.state !== 'inactive' && recording.rec.stop(); } catch {}
  try { recording.voiceEl && recording.voiceEl.pause(); } catch {}
  recording = null;
  const btn = $('#recordBtn'); btn.textContent = '● Record video'; btn.classList.remove('on');
  $('#recBadge').hidden = true; setStatus('ok', manual ? 'Recording stopped' : 'Recording finished');
  const api = etherApi(); if (api && api.setMuted) try { api.setMuted(muted); } catch {}
  setTimeout(() => layoutStage(1), 100);
}

/* ---------------- Ether's Cut (editor, in its own view) ---------------- */
let lastTake = null; // last recording { blob, name, type, aspect }
const cutFrame = $('#cutFrame');
let cutReady = null;
function showView(v) {
  $$('#modeSeg button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('#studioView').hidden = v !== 'studio'; $('#cutView').hidden = v !== 'cut';
  document.body.classList.toggle('in-cut', v === 'cut');
  if (v === 'cut') {
    previewAudio.pause(); voiceHold = true;
    const a = etherApi(); if (a && !recording) try { a.pause(); } catch {}
    if (!cutReady) cutReady = new Promise(res => { cutFrame.addEventListener('load', () => res(cutFrame.contentWindow), { once: true }); cutFrame.src = 'cut.html?v=7'; });
  } else { voiceHold = false; setTimeout(() => layoutStage(), 30); }
}
$$('#modeSeg button').forEach(b => b.onclick = () => showView(b.dataset.view));
async function sendToCut(take) {
  if (!take) return toast('Record a video first — it goes straight into Ether\'s Cut.');
  showView('cut');
  const w = await cutReady;
  const br = await waitFor(() => w.EtherCutBridge, 8000);
  if (!br) return toast('Ether\'s Cut didn\'t open — add the file with + Video there.');
  br.importFromExplains(new File([take.blob], take.name, { type: take.type }), take.aspect, take.seconds);
}
$('#cutBtn').onclick = () => sendToCut(lastTake);

/* ---------------- projects ---------------- */
function loadProject(p) {
  P = p; localStorage.setItem(LS_CURRENT, P.id);
  bindAll(); renderGallery(); updatePill(); renderCues(); lastErrors = [];
  loadVoiceFor(P.id); if (window.EtherVoice) window.EtherVoice.refresh();
  const code = currentCode();
  if (code) play(code); else { player.removeAttribute('srcdoc'); player.src = 'about:blank'; $('#emptyState').hidden = false; setStatus('', 'No scene loaded'); }
  layoutStage();
}
$('#newBtn').onclick = () => { save(); loadProject(blank()); showTab('style'); toast('New project.'); };
$('#projectsBtn').onclick = () => { renderProjects(); $('#projDlg').showModal(); };
function renderProjects() {
  const list = Object.values(projects).sort((a, b) => b.updated - a.updated);
  $('#projList').innerHTML = list.length ? list.map(p => `<div class="proj ${p.id === P.id ? 'cur' : ''}">
    <div><div class="t">${esc(p.name || p.topic || 'Untitled')}</div><div class="d">${esc((p.custom?.name) || STYLES.find(s => s.id === p.styleId)?.name || '')} · ${p.versions?.length || 0} versions · ${new Date(p.updated).toLocaleDateString()}</div></div>
    <div class="row gap"><button class="btn ghost" type="button" data-open="${p.id}">Open</button><button class="btn ghost" type="button" data-del="${p.id}">Delete</button></div></div>`).join('')
    : '<p class="hint">No saved projects yet.</p>';
  $$('#projList [data-open]').forEach(b => b.onclick = () => { loadProject(projects[b.dataset.open]); $('#projDlg').close(); });
  $$('#projList [data-del]').forEach(b => b.onclick = () => {
    const p = projects[b.dataset.del];
    if (!confirm(`Delete "${p.name || p.topic || 'Untitled'}"? This can't be undone.`)) return;
    delete projects[b.dataset.del]; localStorage.setItem(LS_PROJECTS, JSON.stringify(projects));
    if (p.id === P.id) loadProject(blank());
    renderProjects();
  });
}
$('#exportBtn').onclick = () => dl(new Blob([JSON.stringify(P, null, 2)], { type: 'application/json' }), slug() + '.ether-explains.json');
$('#importFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const p = JSON.parse(await f.text()); p.id = uid(); projects[p.id] = p; loadProject(p); save(); $('#projDlg').close(); toast('Project imported.'); }
  catch { toast('That file isn\'t an Ether Explains project.'); }
  e.target.value = '';
};

/* ---------------- local AI: write scenes with a model on this Mac ---------------- */
const AI_SYSTEM = 'You are an expert three.js developer and motion designer. Follow every rule in the request exactly. Reply with ONE complete, self-contained HTML file inside a single ```html code block and nothing else: no explanations before or after.';
let aiKind = 'ollama', aiBusy = false;
const aiBase = () => P.aiServer === 'custom' ? (P.aiURL || '').replace(/\/+$/, '') : (P.aiServer || 'http://127.0.0.1:11434');
let cc = null; // Claude Code status
const engine = () => P.aiEngine || 'claude';
function setEngine(e) {
  P.aiEngine = e;
  $$('#aiEngine button').forEach(b => b.classList.toggle('active', b.dataset.eng === e));
  $('#eng-claude').hidden = e !== 'claude'; $('#eng-local').hidden = e !== 'local';
  const who = e === 'claude' ? 'Claude' : 'local AI';
  $('#aiMake').textContent = `✦ Make the scene with ${who}`; $('#aiFix').textContent = `✦ Fix it with ${who}`;
  if (e === 'claude' && !cc) ccCheck(); if (e === 'local' && !$('#aiModel').value) aiFindModels();
}
$$('#aiEngine button').forEach(b => b.onclick = () => { setEngine(b.dataset.eng); save(); });
async function ccCheck() {
  if (!NATIVE) { $('#ccTitle').textContent = 'Claude Code works in the Mac app'; $('#ccMeta').textContent = ''; $('#ccConnect').hidden = true; return null; }
  $('#ccTitle').textContent = 'Checking Claude Code…'; $('#ccMeta').textContent = ''; $('#ccDot').className = 'dot load';
  try { cc = await NATIVE.call('claudeStatus'); } catch (e) { cc = { installed: false, error: String(e) }; }
  const card = $('#ccCard');
  if (!cc.installed) {
    $('#ccDot').className = 'dot err'; card.classList.remove('ok');
    $('#ccTitle').textContent = 'Claude Code isn\'t on this Mac yet'; $('#ccMeta').textContent = 'Set it up once: it installs and signs in, in Terminal.';
    $('#ccConnect').textContent = 'Set up Claude Code';
  } else if (!cc.signedIn) {
    $('#ccDot').className = 'dot err'; card.classList.remove('ok');
    $('#ccTitle').textContent = 'Claude Code needs you to sign in'; $('#ccMeta').textContent = (cc.version || '') + ' · press Sign in to Claude';
    $('#ccConnect').textContent = 'Sign in to Claude';
  } else {
    $('#ccDot').className = 'dot ok'; card.classList.add('ok');
    $('#ccTitle').textContent = 'Claude is connected';
    $('#ccMeta').textContent = [cc.email, cc.subscriptionType, cc.version].filter(Boolean).join(' · ');
    $('#ccConnect').textContent = 'Switch account';
  }
  return cc;
}
$('#ccCheck').onclick = () => ccCheck();
$('#ccConnect').onclick = async () => {
  try { await NATIVE.call('claudeConnect', { install: !!(cc && !cc.installed) }); toast('Terminal opened. Sign in there, then come back and press ↻.', 6000); }
  catch (e) { toast(String(e && e.message || e), 5000); }
};
$('#ccModel').onchange = () => { P.ccModel = $('#ccModel').value; save(); };
function bindAi() {
  $('#ccModel').value = P.ccModel || '';
  setEngine(engine());
  $('#aiServer').value = P.aiServer || 'http://127.0.0.1:11434';
  $('#aiURL').hidden = $('#aiServer').value !== 'custom'; $('#aiURL').value = P.aiURL || '';
  if (P.aiModel && ![...$('#aiModel').options].some(o => o.value === P.aiModel)) $('#aiModel').innerHTML = `<option value="${esc(P.aiModel)}">${esc(P.aiModel)}</option>`;
  $('#aiModel').value = P.aiModel || '';
}
$('#aiServer').onchange = () => { P.aiServer = $('#aiServer').value; P.aiModel = ''; save(); bindAi(); if (P.aiServer !== 'custom') aiFindModels(); };
$('#aiURL').onchange = () => { P.aiURL = $('#aiURL').value.trim(); save(); aiFindModels(); };
$('#aiModel').onchange = () => { P.aiModel = $('#aiModel').value; save(); };
$('#aiFind').onclick = () => aiFindModels(true);
async function aiFindModels(loud) {
  const base = aiBase(); if (!base) return toast('Type the address of your AI app first.');
  $('#aiModel').innerHTML = '<option value="">Looking…</option>';
  let r = null, err = '';
  try {
    if (NATIVE) r = await NATIVE.call('llmModels', { base });
    else {
      const tags = await fetch(base + '/api/tags').then(x => x.ok ? x.json() : null).catch(() => null);
      if (tags && tags.models) r = { kind: 'ollama', models: tags.models.map(m => m.name) };
      else { const v1 = await fetch(base + '/v1/models').then(x => x.json()); r = { kind: 'openai', models: (v1.data || []).map(m => m.id) }; }
    }
  } catch (e) { err = (e && e.message) || String(e); }
  if (!r || !r.models || !r.models.length) {
    $('#aiModel').innerHTML = '<option value="">No models found</option>';
    if (loud || err) toast(err && NATIVE ? err : (NATIVE ? 'No models found. Open Ollama or LM Studio and load a model.' : 'Couldn\'t reach your local AI from the web page. The Mac app connects on its own; in a browser, Ollama needs OLLAMA_ORIGINS set to allow this site.'), 6000);
    return;
  }
  aiKind = r.kind;
  const score = n => (/coder|code/i.test(n) ? 100 : 0) + (/qwen|deepseek|devstral|codestral|llama|gpt-oss|gemma/i.test(n) ? 10 : 0) + ((r.sizes && r.sizes[n]) ? Math.min(30, r.sizes[n] / 1e9) : 0) - (/embed|whisper|tts|vision-only/i.test(n) ? 500 : 0);
  const cloud = n => /:cloud$|-cloud$/i.test(n);
  const list = r.models.filter(n => !/embed|whisper|rerank/i.test(n)).sort((a, b) => (score(b) - (cloud(b) ? 200 : 0)) - (score(a) - (cloud(a) ? 200 : 0)));
  if (!list.length) { $('#aiModel').innerHTML = '<option value="">No chat models found</option>'; return; }
  $('#aiModel').innerHTML = list.map(n => `<option value="${esc(n)}">${esc(n)}${cloud(n) ? ' (online)' : r.sizes && r.sizes[n] ? ' · ' + (r.sizes[n] / 1e9).toFixed(1) + ' GB' : ''}</option>`).join('');
  if (!list.includes(P.aiModel)) { P.aiModel = list[0]; save(); }
  $('#aiModel').value = P.aiModel;
  if (loud) toast(`${list.length} model${list.length > 1 ? 's' : ''} found.`);
}
async function aiGenerate(prompt, note) {
  if (aiBusy) return;
  const useClaude = engine() === 'claude';
  if (useClaude) {
    if (!NATIVE) return toast('Making scenes with Claude works in the Ether Explains Mac app.');
    if (!cc || !cc.installed || !cc.signedIn) await ccCheck();
    if (!cc.installed || !cc.signedIn) return toast(cc.installed ? 'Sign in to Claude first (button above).' : 'Set up Claude Code first (button above).', 5000);
  } else if (!P.aiModel) { await aiFindModels(true); if (!P.aiModel) return; }
  const who = useClaude ? ('Claude' + (P.ccModel ? ' ' + P.ccModel[0].toUpperCase() + P.ccModel.slice(1) : '')) : P.aiModel;
  if (!NATIVE && location.protocol === 'https:' && !/^https:/.test(aiBase())) toast('Tip: the Mac app talks to your local AI without any setup.', 3500);
  aiBusy = true;
  const t0 = performance.now(), btns = ['#aiMake', '#aiFix'];
  btns.forEach(s => $(s).disabled = true); $('#aiStop').hidden = false; $('#aiProgress').hidden = false;
  const status = (txt, tail) => { $('#aiStatus').textContent = txt; if (tail != null) $('#aiTail').textContent = tail; };
  status(useClaude ? `Asking ${who}… (a full scene takes about 2–3 minutes)` : `Asking ${who}… (loading a big model can take a minute or two)`, '');
  const timer = setInterval(() => { if (!aiBusy) return; const s = Math.round((performance.now() - t0) / 1000); if ($('#aiStatus').dataset.chars) status(`Writing the scene… ${$('#aiStatus').dataset.chars} characters · ${s}s`); else status(`${useClaude ? 'Claude is planning the scene' : 'Waiting for ' + who}… ${s}s`); }, 1000);
  window.EtherLLMProgress = p => {
    if (!p.chars) { if (p.tail) status(`${p.tail.replace(/\(\d+ characters of notes\)/, '').trim()} ${Math.round((performance.now() - t0) / 1000)}s`, ''); return; }
    $('#aiStatus').dataset.chars = p.chars; status(`Writing the scene… ${p.chars} characters · ${Math.round((performance.now() - t0) / 1000)}s`, p.tail); };
  let text = null, err = '';
  try {
    if (useClaude) { const r = await NATIVE.call('claudeRun', { prompt, system: AI_SYSTEM, model: P.ccModel || '' }); text = r.text; }
    else if (NATIVE) text = await NATIVE.call('llm', { base: aiBase(), kind: aiKind, model: P.aiModel, system: AI_SYSTEM, prompt });
    else text = await aiDirect(prompt);
  } catch (e) { err = (e && e.message) || String(e); }
  clearInterval(timer); delete $('#aiStatus').dataset.chars;
  aiBusy = false; btns.forEach(s => $(s).disabled = false); $('#aiStop').hidden = true;
  const secs = Math.round((performance.now() - t0) / 1000);
  if (err || !text) { status(err || 'The model returned nothing.', ''); toast(err || 'The model returned nothing.', 5000); return; }
  const code = extractHtml(text);
  if (!looksLikeScene(code)) {
    status(`${who} answered in ${secs}s, but not with a complete scene. Try again${useClaude ? '' : ', or pick a bigger coding model'}.`, text.slice(-300));
    return;
  }
  status(`Done in ${secs}s with ${who}. Playing it now. To change something, describe it in Revise and press ✦ Fix it.`, '');
  addVersion(code, note + ' · ' + who);
}
let aiAbort = null;
async function aiDirect(prompt) { // web page only (the Mac app goes through native code)
  aiAbort = new AbortController();
  const ollama = aiKind === 'ollama', base = aiBase();
  const body = ollama ? { model: P.aiModel, stream: true, messages: [{ role: 'system', content: AI_SYSTEM }, { role: 'user', content: prompt }], options: { num_ctx: 32768, num_predict: 30000, temperature: 0.35 } }
    : { model: P.aiModel, stream: true, temperature: 0.35, max_tokens: 30000, messages: [{ role: 'system', content: AI_SYSTEM }, { role: 'user', content: prompt }] };
  const r = await fetch(base + (ollama ? '/api/chat' : '/v1/chat/completions'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: aiAbort.signal });
  if (!r.ok) throw new Error('The local AI answered with an error (' + r.status + ').');
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', out = '';
  for (;;) {
    const { value, done } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop();
    for (let l of lines) { l = l.trim(); if (!l) continue; if (!ollama) { if (!l.startsWith('data:')) continue; l = l.slice(5).trim(); if (l === '[DONE]') continue; }
      try { const j = JSON.parse(l); out += ollama ? (j.message && j.message.content || '') : ((j.choices && j.choices[0].delta && j.choices[0].delta.content) || ''); } catch {} }
    window.EtherLLMProgress({ chars: out.length, tail: out.slice(-160) });
  }
  return out;
}
$('#aiMake').onclick = () => aiGenerate(buildPrompt(), engine() === 'claude' ? 'made in app' : 'local AI');
$('#aiFix').onclick = () => { const was = $('#includeCode').checked; $('#includeCode').checked = true; const pr = buildRevise(); $('#includeCode').checked = was; buildRevise();
  if (!currentCode()) return toast('Load a scene first.'); showTab('prompt'); aiGenerate(pr, 'fix'); };
$('#aiStop').onclick = () => { if (NATIVE) { NATIVE.call(engine() === 'claude' ? 'claudeStop' : 'llmStop'); } else if (aiAbort) aiAbort.abort(); };

/* ---------------- Mac app extras ---------------- */
if (NATIVE) {
  document.body.classList.add('native');
  $('#openSavedBtn').hidden = false;
  $('#openSavedBtn').onclick = () => NATIVE.call('openSaveFolder');
  $('.small-print').textContent = `Recording captures the 3D canvas plus your voice, locked together. Videos save to ${NATIVE.saveFolder}.`;
  window.EtherNativeSaved = name => {
    toast(`Saved ${name} to ${NATIVE.saveFolder}`, 3800);
  };
}

/* ---------------- boot ---------------- */
window.bindAiReady = true; bindAi();
renderChips(); bindAll(); renderGallery(); updatePill(); renderCues(); layoutStage();
if (currentCode()) play(currentCode());
loadVoiceFor(P.id);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.EtherExplains = { buildPrompt, parseCues, extractHtml, get project() { return P; } };
/* internals the Voice tab (voice.js) builds on */
window.EE = {
  get P() { return P; }, get voice() { return voice; }, get recording() { return !!recording; },
  set voiceHold(v) { voiceHold = v; }, get lastTake() { return lastTake; },
  save, toast, esc, cues, parseCues, fmtSrt, renderCues, setTimingMode, showTab, etherApi, setVoice, updateVoiceUi,
  onVoice: f => voiceListeners.push(f), previewAudio, slug, dl, sendToCut, play, currentCode,
  setDuration(d) { P.duration = d; $('#duration').value = d; },
};
})();
