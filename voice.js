/* Ether Explains — Voice tab: read it yourself (teleprompter), line up a voice file, or use a Mac voice.
   The voice's real timing becomes the narration cues; the player keeps the voice locked to the scene. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const EE = window.EE, DSP = window.EtherVoiceDSP;
const P = () => EE.P;
const audio = EE.previewAudio;

/* ---------------- lines ---------------- */
const splitLines = txt => String(txt || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
function storyLines() {
  const c = EE.parseCues(P().srt);
  if (c.length) return c.map(x => x.text);
  return String(P().script || '').split(/\n+|(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}
function getLines() { return splitLines($('#vLines').value); }
function showLineCount() { const n = getLines().length; $('#vLineCount').textContent = n ? `${n} line${n > 1 ? 's' : ''}` : ''; }
function bindLines() {
  if (!P().voiceLines) P().voiceLines = storyLines().join('\n');
  $('#vLines').value = P().voiceLines || '';
  showLineCount();
}
$('#vLines').oninput = () => { P().voiceLines = $('#vLines').value; EE.save(); showLineCount(); };
$('#vFromStory').onclick = () => {
  const l = storyLines();
  if (!l.length) return EE.toast('Write a script or paste an SRT in Story first.');
  $('#vLines').value = P().voiceLines = l.join('\n'); EE.save(); showLineCount(); EE.toast(`Pulled ${l.length} lines from Story.`);
};

/* ---------------- mode ---------------- */
function setMode(m) {
  P().voiceMode = m;
  $$('#voiceMode button').forEach(b => b.classList.toggle('active', b.dataset.vm === m));
  ['record', 'file', 'mac'].forEach(x => $('#vm-' + x).hidden = x !== m);
  if (m === 'mac') loadMacVoices();
}
$$('#voiceMode button').forEach(b => b.onclick = () => { setMode(b.dataset.vm); EE.save(); });

/* ---------------- current voice card ---------------- */
function renderCard(v) {
  $('#vCard').classList.toggle('has', !!v);
  $('#vCardBtns').hidden = !v;
  if (!v) { $('#vName').textContent = 'No voice yet'; $('#vMeta').textContent = 'Read it yourself, load a voice file, or use a Mac voice.'; }
  else {
    const n = (P().voiceCues || []).length;
    $('#vName').textContent = v.name;
    $('#vMeta').textContent = `${(v.duration || 0).toFixed(1)}s${n ? ` · ${n} cues lined up` : ' · not lined up yet'}`;
  }
  $('#vTimeline').hidden = !v;
  renderCueList(); drawWave();
}
EE.onVoice(renderCard);
$('#vPlay').onclick = () => { if (!audio.paused && listening) { audio.pause(); return; } listen(0); };
$('#vRemove').onclick = () => { if (!confirm('Remove this voice from the project?')) return; P().voiceCues = null; EE.setVoice(null); };
$('#vSave').onclick = async () => {
  const v = EE.voice; if (!v) return;
  const blob = v.au ? DSP.toWav(v.au) : v.blob;
  EE.dl(blob, EE.slug() + '-voice.' + (v.au ? 'wav' : (v.name.split('.').pop() || 'audio')));
};

/* listening inside the Voice tab (separate from the scene sync) */
let listening = false;
function listen(t) {
  if (!EE.voice) return;
  listening = true; EE.voiceHold = true; audio.playbackRate = 1;
  try { audio.currentTime = Math.max(0, t); } catch {}
  audio.play().catch(() => {});
  $('#vPlay').textContent = '❚❚ Pause';
}
['pause', 'ended'].forEach(ev => audio.addEventListener(ev, () => { if (listening) { listening = false; EE.voiceHold = false; $('#vPlay').textContent = '▶ Listen'; } }));

/* ---------------- cues: voice time → scene time ---------------- */
function writeSrt(quiet) {
  const vc = P().voiceCues; if (!vc || !vc.length) return;
  const off = P().voiceOffset || 0;
  const sc = vc.map(c => ({ start: Math.max(0, c.start + off), end: Math.max(0.1, c.end + off), text: c.text }));
  P().srt = sc.map((c, i) => `${i + 1}\n${EE.fmtSrt(c.start)} --> ${EE.fmtSrt(c.end)}\n${c.text}`).join('\n\n');
  $('#srt').value = P().srt;
  EE.setTimingMode('srt');
  const end = sc[sc.length - 1].end;
  if (end + 0.8 > P().duration) EE.setDuration(Math.min(180, Math.ceil(end + 1.2)));
  EE.renderCues(); EE.save();
  renderCard(EE.voice);
  if (!quiet) EE.toast(`${vc.length} cues lined up with the voice — the prompt now uses them.`);
}
function renderCueList() {
  const vc = P().voiceCues || [];
  const off = P().voiceOffset || 0;
  $('#vCues').innerHTML = vc.map((c, i) => `<li data-i="${i}"><b>${(c.start + off).toFixed(2)}–${(c.end + off).toFixed(2)}s</b>${EE.esc(c.text)}</li>`).join('');
  $$('#vCues li').forEach(li => li.onclick = () => listen(vc[+li.dataset.i].start));
}

/* ---------------- line up a voice with the lines ---------------- */
function lineUp(expected) {
  const v = EE.voice;
  if (!v) return EE.toast('Load or record a voice first.');
  if (!v.an) return EE.toast('This audio couldn\'t be analysed — try a WAV or M4A.');
  let lines = getLines();
  if (!lines.length) return EE.toast('Add the lines you read (one per line), then line it up.');
  if (expected && expected.length < lines.length - 1) lines = lines.slice(0, expected.length + 1);
  P().voiceCues = DSP.align(v.an, lines, expected && expected.slice(0, lines.length - 1));
  writeSrt();
}
$('#vAlign').onclick = () => lineUp();
$('#vFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  P().voiceCues = null;
  const v = await EE.setVoice(f, f.name);
  if (v && v.an && getLines().length) lineUp();
};

/* ---------------- offset + sync ---------------- */
function showOffset() { const o = P().voiceOffset || 0; $('#vOffset').value = o; $('#vOffsetV').textContent = (o >= 0 ? '+' : '') + o.toFixed(2) + 's'; }
$('#vOffset').oninput = () => { P().voiceOffset = +$('#vOffset').value; showOffset(); renderCueList(); };
$('#vOffset').onchange = () => { writeSrt(true); EE.save(); };
$('#vSync').onchange = () => { P().voiceSync = $('#vSync').checked; EE.save(); EE.updateVoiceUi(); };
EE.onVoice(() => { $('#vSync').checked = P().voiceSync !== false; });

/* ---------------- waveform with draggable cue edges ---------------- */
const cv = $('#vWave');
let drag = null, hover = null;
function waveGeom() { const r = cv.getBoundingClientRect(); return { w: r.width, h: r.height, d: EE.voice?.duration || 1 }; }
function drawWave() {
  const v = EE.voice; if (!v || $('#vTimeline').hidden) return;
  const dpr = devicePixelRatio || 1, { w, h, d } = waveGeom();
  if (!w) return;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const X = t => t / d * w;
  (P().voiceCues || []).forEach((c, i) => {
    x.fillStyle = i % 2 ? 'rgba(139,108,255,.16)' : 'rgba(232,195,122,.14)';
    x.fillRect(X(c.start), 0, X(c.end) - X(c.start), h);
    x.fillStyle = 'rgba(236,232,255,.75)'; x.font = '10px Inter,system-ui'; x.fillText(String(i + 1), X(c.start) + 3, 11);
  });
  const pk = v.an && v.an.peaks;
  if (pk) {
    x.fillStyle = 'rgba(236,232,255,.7)';
    const mid = h / 2 + 4, amp = h / 2 - 10, n = pk.length;
    let m = 0; for (let i = 0; i < n; i++) if (pk[i] > m) m = pk[i];
    const k = m > 0 ? 1 / m : 1;
    for (let px = 0; px < w; px++) {
      const a = Math.floor(px / w * n), b = Math.max(a + 1, Math.floor((px + 1) / w * n));
      let mm = 0; for (let i = a; i < b; i++) if (pk[i] > mm) mm = pk[i];
      const hh = Math.max(0.5, mm * k * amp); x.fillRect(px, mid - hh, 1, hh * 2);
    }
  }
  (P().voiceCues || []).forEach((c, i) => ['start', 'end'].forEach(edge => {
    const on = hover && hover.i === i && hover.edge === edge;
    x.fillStyle = on ? '#e8c37a' : (edge === 'start' ? 'rgba(95,227,255,.85)' : 'rgba(255,255,255,.35)');
    x.fillRect(X(c[edge]) - (on ? 1.5 : 0.5), 0, on ? 3 : 1, h);
  }));
  if (!audio.paused || listening) {
    x.fillStyle = '#ff4d6d'; x.fillRect(X(audio.currentTime) - 1, 0, 2, h);
  }
  const ci = (P().voiceCues || []).findIndex(c => audio.currentTime >= c.start && audio.currentTime < c.end);
  $$('#vCues li').forEach((li, i) => li.classList.toggle('on', !audio.paused && i === ci));
}
function hit(e) {
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, { w, d } = waveGeom();
  let best = null;
  (P().voiceCues || []).forEach((c, i) => ['start', 'end'].forEach(edge => {
    const dx = Math.abs(c[edge] / d * w - px);
    if (dx < 7 && (!best || dx < best.dx)) best = { i, edge, dx };
  }));
  return { best, t: Math.max(0, Math.min(d, px / w * d)) };
}
cv.addEventListener('pointermove', e => {
  const { best, t } = hit(e);
  if (drag) {
    const vc = P().voiceCues, c = vc[drag.i];
    if (drag.edge === 'start') c.start = Math.max(drag.i ? vc[drag.i - 1].end : 0, Math.min(c.end - 0.2, t));
    else c.end = Math.min(drag.i < vc.length - 1 ? vc[drag.i + 1].start : waveGeom().d, Math.max(c.start + 0.2, t));
    renderCueList();
  } else { hover = best; cv.style.cursor = best ? 'ew-resize' : 'pointer'; }
});
cv.addEventListener('pointerdown', e => {
  const { best, t } = hit(e);
  if (best) { drag = best; hover = best; cv.setPointerCapture(e.pointerId); }
  else listen(t);
});
cv.addEventListener('pointerup', () => { if (drag) { drag = null; writeSrt(true); } });
cv.addEventListener('pointerleave', () => { if (!drag) hover = null; });
(function loop() { if ($('#tab-voice').classList.contains('active')) drawWave(); requestAnimationFrame(loop); })();

/* ---------------- read it myself: teleprompter + mic ---------------- */
let tele = null;
async function fillMics() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    const sel = $('#micSel'), cur = P().micId || '';
    sel.innerHTML = '<option value="">Default microphone</option>' + devs.filter(d => d.deviceId && d.deviceId !== 'default')
      .map(d => `<option value="${EE.esc(d.deviceId)}">${EE.esc(d.label || 'Microphone')}</option>`).join('');
    sel.value = [...sel.options].some(o => o.value === cur) ? cur : '';
  } catch {}
}
$('#micSel').onchange = () => { P().micId = $('#micSel').value; EE.save(); };
function showPrompter(lines, i) {
  $('#pPrev').textContent = lines[i - 1] || '';
  $('#pCur').textContent = lines[i] || '';
  $('#pNext').textContent = lines[i + 1] ? 'Next: ' + lines[i + 1] : 'Last line — press Space or Finish when done.';
  $('#pIdx').textContent = i + 1; $('#pTot').textContent = lines.length;
}
function pickAudioMime() {
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}
$('#readStart').onclick = async () => {
  const lines = getLines();
  if (!lines.length) return EE.toast('Add the lines to read first (or Pull from Story).');
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return EE.toast('This browser can\'t record the mic. Try Chrome or Safari.');
  let stream;
  try {
    const id = P().micId;
    stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: false, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  } catch (e) { return EE.toast(e.name === 'NotAllowedError' ? 'Microphone is blocked — allow it in the address bar, then try again.' : 'Couldn\'t open the microphone.'); }
  fillMics();
  const a = EE.etherApi(); if (a) try { a.pause(); } catch {}
  audio.pause(); EE.voiceHold = true;
  const mime = pickAudioMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 160000 } : undefined);
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  // level meter
  const ac = new AudioContext(), an = ac.createAnalyser(); an.fftSize = 1024;
  ac.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize);
  tele = { lines, i: 0, marks: [], rec, chunks, stream, ac, t0: 0, raf: 0, cancelled: false };
  const meter = () => {
    if (!tele) return;
    an.getFloatTimeDomainData(buf); let pk = 0; for (const v of buf) pk = Math.max(pk, Math.abs(v));
    $('#micLevel').style.width = Math.min(100, Math.sqrt(pk) * 110) + '%';
    if (tele.t0) $('#pTime').textContent = ((performance.now() - tele.t0) / 1000).toFixed(1);
    tele.raf = requestAnimationFrame(meter);
  };
  meter();
  rec.onstart = () => { tele.t0 = performance.now(); };
  rec.onstop = () => finishTake();
  rec.start(500);
  showPrompter(lines, 0);
  $('#prompter').classList.add('live'); $('#pRec').hidden = false;
  $('#readStart').hidden = true; $('#readNext').hidden = $('#readStop').hidden = $('#readCancel').hidden = false;
  if (document.activeElement) document.activeElement.blur();
};
function nextLine() {
  if (!tele || !tele.t0) return;
  if (tele.i >= tele.lines.length - 1) return stopReading();
  tele.marks.push((performance.now() - tele.t0) / 1000 - 0.12);
  tele.i++; showPrompter(tele.lines, tele.i);
}
function stopReading(cancel) {
  if (!tele) return;
  tele.cancelled = !!cancel;
  try { tele.rec.state !== 'inactive' && tele.rec.stop(); } catch {}
}
$('#readNext').onclick = nextLine;
$('#readStop').onclick = () => stopReading();
$('#readCancel').onclick = () => stopReading(true);
document.addEventListener('keydown', e => {
  if (!tele || /input|textarea|select/i.test(e.target.tagName) && e.target.id !== 'readNext') return;
  if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'Enter') { e.preventDefault(); nextLine(); }
  if (e.code === 'Escape') stopReading(true);
});
async function finishTake() {
  const t = tele; tele = null;
  cancelAnimationFrame(t.raf); t.stream.getTracks().forEach(x => x.stop()); t.ac.close().catch(() => {});
  $('#micLevel').style.width = '0';
  $('#prompter').classList.remove('live'); $('#pRec').hidden = true;
  $('#readStart').hidden = false; $('#readNext').hidden = $('#readStop').hidden = $('#readCancel').hidden = true;
  $('#pPrev').textContent = $('#pNext').textContent = '';
  EE.voiceHold = false;
  if (t.cancelled) { $('#pCur').textContent = 'Cancelled. Press Start to read again.'; return; }
  $('#pCur').textContent = 'Lining up your take…';
  const raw = new Blob(t.chunks, { type: t.rec.mimeType || 'audio/webm' });
  try {
    const au = await DSP.decode(raw);
    const wav = DSP.toWav(au);
    const lines = t.lines.slice(0, t.i + 1);
    P().voiceCues = null;
    await EE.setVoice(wav, `My voice — ${EE.slug()}.wav`, { quiet: true });
    if (t.i < t.lines.length - 1) EE.toast(`You read ${t.i + 1} of ${t.lines.length} lines — lined up the ones you read.`, 3600);
    const v = EE.voice;
    if (v && v.an) { P().voiceCues = DSP.align(v.an, lines, t.marks); writeSrt(); }
    $('#pCur').textContent = 'Got it. Listen back, drag any cue edge to fine-tune, or press Start to read again.';
  } catch (e) {
    console.warn(e);
    await EE.setVoice(raw, `My voice — ${EE.slug()}`, {});
    $('#pCur').textContent = 'Saved your take, but it couldn\'t be analysed for timing.';
  }
}

/* ---------------- Mac voices (speech synthesis) ---------------- */
const synth = window.speechSynthesis;
let macVoices = [];
function loadMacVoices() {
  if (!synth) { $('#macVoice').innerHTML = '<option>Speech isn\'t available in this browser</option>'; return; }
  const all = synth.getVoices();
  if (!all.length) return;
  const lang = (navigator.language || 'en').slice(0, 2);
  const score = v => (v.lang.startsWith(lang) ? 100 : 0) + (/premium/i.test(v.name) ? 30 : /enhanced/i.test(v.name) ? 20 : 0) + (v.localService ? 10 : 0) + (/samantha|ava|zoe|evan|nathan|allison|daniel|serena/i.test(v.name) ? 5 : 0);
  macVoices = all.slice().sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  const sel = $('#macVoice');
  sel.innerHTML = macVoices.map((v, i) => `<option value="${i}">${EE.esc(v.name)} · ${EE.esc(v.lang)}${v.localService ? '' : ' (online)'}</option>`).join('');
  const keep = macVoices.findIndex(v => v.name === P().macVoice);
  sel.value = String(keep >= 0 ? keep : 0);
}
if (synth) synth.onvoiceschanged = () => { if (P().voiceMode === 'mac') loadMacVoices(); };
const macVoice = () => macVoices[+$('#macVoice').value];
$('#macVoice').onchange = () => { P().macVoice = macVoice()?.name || ''; EE.save(); };
function showRate() { const r = P().macRate || 1; $('#macRate').value = r; $('#macRateV').textContent = r.toFixed(2).replace(/0$/, '') + '×'; }
$('#macRate').oninput = () => { P().macRate = +$('#macRate').value; showRate(); EE.save(); };
function utter(text) {
  const u = new SpeechSynthesisUtterance(text);
  const v = macVoice(); if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = P().macRate || 1;
  return u;
}
const speak = text => new Promise(res => {
  const u = utter(text); let t0 = 0;
  u.onstart = () => { t0 = performance.now(); };
  u.onend = u.onerror = () => res(t0 ? (performance.now() - t0) / 1000 : 0);
  speak.keep = u; // keep a reference so the end event always fires
  synth.speak(u);
});
$('#macTest').onclick = () => { if (!synth) return; synth.cancel(); speak(getLines()[0] || 'Hello. This is the voice of Ether Explains.'); };

let timing = false;
$('#macTime').onclick = async () => {
  if (!synth) return EE.toast('Speech isn\'t available in this browser.');
  if (timing) { timing = false; synth.cancel(); return; }
  const lines = getLines(); if (!lines.length) return EE.toast('Add the lines first.');
  timing = true; synth.cancel(); EE.voiceHold = true;
  const btn = $('#macTime'); const label = btn.textContent;
  const out = []; let t = 0.5;
  for (let i = 0; i < lines.length && timing; i++) {
    btn.textContent = `■ Timing ${i + 1}/${lines.length}…`;
    let d = await speak(lines[i]);
    if (!d) d = Math.max(1.2, lines[i].split(/\s+/).length / 2.6);
    out.push({ start: t, end: t + d, text: lines[i] }); t += d + 0.35;
  }
  btn.textContent = label; EE.voiceHold = false;
  if (!timing) return EE.toast('Timing stopped.');
  timing = false;
  P().srt = out.map((c, i) => `${i + 1}\n${EE.fmtSrt(c.start)} --> ${EE.fmtSrt(c.end)}\n${c.text}`).join('\n\n');
  $('#srt').value = P().srt; EE.setTimingMode('srt');
  if (t + 0.6 > P().duration) EE.setDuration(Math.min(180, Math.ceil(t + 1)));
  EE.renderCues(); EE.save();
  EE.toast(`Timed ${out.length} lines with ${macVoice()?.name || 'this voice'} — the prompt now uses them.`, 3600);
};

let along = null;
$('#macAlong').onclick = () => {
  if (along) return stopAlong('Read-along stopped.');
  if (!synth) return EE.toast('Speech isn\'t available in this browser.');
  const api = EE.etherApi(); if (!api) return EE.toast('Load a scene first — then the voice reads along with it.');
  const cs = EE.cues(); if (!cs.length) return EE.toast('No cues yet — press "Time my lines with this voice" first.');
  synth.cancel(); EE.voiceHold = true;
  try { api.restart ? api.restart() : (api.seek(0), api.play()); } catch {}
  along = { cs, i: 0, speaking: false, held: false, api };
  $('#macAlong').textContent = '■ Stop read-along';
  const step = () => {
    if (!along) return;
    const a = along; let t = 0; try { t = a.api.time; } catch {}
    const c = a.cs[a.i];
    if (c && !a.speaking && t >= c.start - 0.03) {
      a.speaking = true; a.i++;
      speak(c.text).then(() => { if (along !== a) return; a.speaking = false; if (a.held) { a.held = false; try { a.api.play(); } catch {} } });
    }
    const nx = a.cs[a.i];
    if (a.speaking && nx && t >= nx.start - 0.03 && !a.held) { a.held = true; try { a.api.pause(); } catch {} }
    let playing = true; try { playing = a.api.playing; } catch {}
    if (a.i >= a.cs.length && !a.speaking && !playing) return stopAlong();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};
function stopAlong(msg) {
  if (!along) return; along = null; synth && synth.cancel(); EE.voiceHold = false;
  $('#macAlong').textContent = '▶ Read along with the scene';
  if (msg) EE.toast(msg);
}

$('#macCmd').onclick = async () => {
  const lines = getLines(); if (!lines.length) return EE.toast('Add the lines first.');
  const v = macVoice();
  const clean = s => s.replace(/'/g, '’').replace(/\[\[|\]\]/g, '');
  const text = lines.map(clean).join(' [[slnc 450]] ');
  const vflag = v && v.localService && !/^google|^microsoft/i.test(v.name) ? `-v '${v.name.replace(/'/g, '')}' ` : '';
  const wpm = Math.round(185 * (P().macRate || 1));
  const cmd = `say ${vflag}-r ${wpm} --file-format=WAVE --data-format=LEI16@44100 -o ~/Desktop/${EE.slug()}-voice.wav '${text}'`;
  try { await navigator.clipboard.writeText(cmd); } catch { prompt('Copy this command:', cmd); return; }
  EE.toast('Command copied — paste it in Terminal. The WAV lands on your Desktop.', 4000);
};

/* ---------------- tab lifecycle ---------------- */
function refresh() {
  bindLines(); setMode(P().voiceMode || 'record'); showOffset(); showRate();
  $('#vSync').checked = P().voiceSync !== false;
  renderCard(EE.voice);
}
$$('.step').forEach(b => b.addEventListener('click', () => { if (b.dataset.tab === 'voice') refresh(); }));
$$('[data-goto="voice"]').forEach(b => b.addEventListener('click', refresh));
refresh();
window.EtherVoice = { lineUp, writeSrt, refresh, getLines };
})();
