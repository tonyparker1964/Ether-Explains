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
function art(sw, i) {
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
      ${art(s.swatch, i)}
      <div class="meta"><div class="nm">${esc(s.name)}</div><div class="sub">${esc(cat)} · ${esc(s.genre)}</div>
      <div class="brief">${esc(s.brief)}</div></div></button>`;
  }).join('') || '<p class="hint">No styles match.</p>';
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
  try { await navigator.clipboard.writeText(text); }
  catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
}

/* ---------------- revise ---------------- */
let lastErrors = [];
function buildRevise() {
  const code = currentCode();
  const req = $('#changeReq').value.trim();
  const errs = lastErrors.length ? `\nERRORS FROM THE PLAYER (fix these first):\n${lastErrors.slice(-6).join('\n')}\n` : '';
  $('#errorBox').hidden = !lastErrors.length; $('#errorBox').textContent = lastErrors.slice(-6).join('\n');
  const out = `Update this "Ether Explains" three.js scene.

CHANGE: ${req || (lastErrors.length ? 'Fix the errors below.' : '[describe the change]')}
${errs}
Keep everything else as it is and keep following the player rules: one self-contained HTML file, three.js ${THREE_VER} via import map, all text inside the canvas, the window.ether API (duration, time, playing, play, pause, seek, restart, setMuted) and the ether-ready / ether-end messages. Return the complete updated HTML file in one \`\`\`html code block.${$('#includeCode').checked && code ? `\n\nCURRENT CODE:\n\`\`\`html\n${code}\n\`\`\`` : ''}`;
  $('#reviseOut').value = out;
  return out;
}
$('#changeReq').oninput = buildRevise; $('#includeCode').onchange = buildRevise;
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
function inject(code) {
  if (/<head[^>]*>/i.test(code)) return code.replace(/<head[^>]*>/i, m => m + SHIM);
  if (/<html[^>]*>/i.test(code)) return code.replace(/<html[^>]*>/i, m => m + '<head>' + SHIM + '</head>');
  return SHIM + code;
}
function setStatus(kind, text) { $('#statusDot').className = 'dot ' + kind; $('#statusText').textContent = text; }
function play(code, scale = 1) {
  if (!code) return;
  readyInfo = null; frameLoaded = false; lastErrors = []; loadT0 = performance.now();
  hideAlert(); blackTimers.forEach(clearTimeout);
  $('#emptyState').hidden = true;
  setStatus('load', 'Loading scene…');
  layoutStage(scale);
  player.srcdoc = inject(code);
}
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
  } else if (d.type === 'ether-end') {
    if (!recording) setStatus('ok', 'Finished — press ⟲ to replay');
  } else if (d.type === 'ether-error') {
    if (!lastErrors.includes(d.message)) lastErrors.push(d.message);
    setStatus('err', 'Error: ' + d.message.slice(0, 90));
    showAlert('The scene hit an error', lastErrors.slice(-3).join('\n'));
  }
});
player.addEventListener('load', () => {
  if (!player.srcdoc) return;
  frameLoaded = true;
  setTimeout(() => {
    if (!readyInfo && !lastErrors.length) { setStatus('ok', etherApi() ? 'Playing' : 'Playing (no ether API — basic controls only)'); scheduleBlackCheck(); }
  }, 2500);
});
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
$('#pasteGo').onclick = e => {
  const code = extractHtml($('#pasteArea').value);
  if (!/<script|<canvas|three/i.test(code)) { e.preventDefault(); toast('That doesn\'t look like scene code — paste the HTML from Claude.'); return; }
  addVersion(code, 'pasted');
};
$('#htmlFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; addVersion(extractHtml(await f.text()), f.name); e.target.value = ''; };
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

/* ---------------- recording ---------------- */
let voice = null; // { file, url, name }
$('#audioFile').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  if (voice) URL.revokeObjectURL(voice.url);
  voice = { file: f, url: URL.createObjectURL(f), name: f.name };
  $('#audioName').textContent = f.name.length > 22 ? f.name.slice(0, 20) + '…' : f.name;
  e.target.value = '';
};
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
  play(code, scale);
  await waitFor(() => readyInfo || (frameLoaded && lastErrors.length), 15000);
  if (!readyInfo) await waitFor(() => frameLoaded && player.contentDocument && player.contentDocument.querySelector('canvas'), 5000);
  const doc = player.contentDocument;
  const canvas = doc && [...doc.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!canvas) { btn.disabled = false; btn.textContent = '● Record video'; return toast('No canvas found in the scene.'); }
  const api = etherApi();
  if (api) { try { api.pause(); api.seek(0); } catch {} }
  await new Promise(r => setTimeout(r, 300));

  const stream = canvas.captureStream(60);
  let ac = null, voiceEl = null;
  try {
    const sceneSound = api && api.audioContext && api.masterGain && P.withSound;
    if (voice || sceneSound) {
      ac = sceneSound ? api.audioContext : new AudioContext();
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
  const vDur = voice ? await audioDuration(voice.url) : 0;
  const total = Math.max(sceneDur, vDur || 0) + 0.4;
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: scale >= 1 ? 16e6 : 8e6, audioBitsPerSecond: 192000 } : undefined);
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    const type = rec.mimeType || mime || 'video/webm';
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    dl(new Blob(chunks, { type }), `${slug()}.${ext}`);
    toast(`Saved ${slug()}.${ext}${ext === 'webm' ? ' — open in Chrome or convert to MP4 for editing.' : ''}`, 4500);
  };
  recording = { rec, t0: performance.now(), scale, voiceEl, timer: null };
  rec.start(250);
  if (api) { try { api.restart ? api.restart() : (api.seek(0), api.play()); } catch {} }
  if (voiceEl) voiceEl.play().catch(() => toast('Voiceover could not start.'));
  btn.disabled = false; btn.textContent = '■ Stop'; btn.classList.add('on');
  $('#recBadge').hidden = false; setStatus('err', 'Recording…');
  recording.timer = setTimeout(() => stopRecording(false), total * 1000);
};
function stopRecording(manual) {
  if (!recording) return;
  clearTimeout(recording.timer);
  try { recording.rec.state !== 'inactive' && recording.rec.stop(); } catch {}
  try { recording.voiceEl && recording.voiceEl.pause(); } catch {}
  recording = null;
  const btn = $('#recordBtn'); btn.textContent = '● Record video'; btn.classList.remove('on');
  $('#recBadge').hidden = true; setStatus('ok', manual ? 'Recording stopped' : 'Recording finished');
  const api = etherApi(); if (api && api.setMuted) try { api.setMuted(muted); } catch {}
  setTimeout(() => layoutStage(1), 100);
}

/* ---------------- projects ---------------- */
function loadProject(p) {
  P = p; localStorage.setItem(LS_CURRENT, P.id);
  bindAll(); renderGallery(); updatePill(); renderCues(); lastErrors = [];
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

/* ---------------- boot ---------------- */
renderChips(); bindAll(); renderGallery(); updatePill(); renderCues(); layoutStage();
if (currentCode()) play(currentCode());
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.EtherExplains = { buildPrompt, parseCues, extractHtml, get project() { return P; } };
})();
