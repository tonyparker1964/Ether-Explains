/* Ether Explains — voice analysis: decode audio, find speech and pauses, line a script up with a voice. */
(() => {
'use strict';
const FPS = 100; // analysis frames per second (10 ms hops)

async function decode(blob) {
  const ab = await blob.arrayBuffer();
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Off(1, 44100, 44100);
  const buf = await new Promise((res, rej) => {
    const p = ctx.decodeAudioData(ab, res, rej);
    if (p && p.then) p.then(res, rej);
  });
  const n = buf.length, ch = buf.numberOfChannels, mono = new Float32Array(n);
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ch; }
  return { data: mono, rate: buf.sampleRate, duration: n / buf.sampleRate };
}

/* loudness per 10 ms frame (dB), speech/silence mask, and waveform peaks */
function analyze(au) {
  const hop = Math.max(1, Math.round(au.rate / FPS)), n = Math.floor(au.data.length / hop);
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0; const o = i * hop;
    for (let j = 0; j < hop; j++) { const v = au.data[o + j]; s += v * v; }
    db[i] = 10 * Math.log10(s / hop + 1e-10);
  }
  const sorted = Float32Array.from(db).sort();
  const pct = p => sorted[Math.min(n - 1, Math.max(0, Math.floor(n * p)))] ?? -100;
  const floor = pct(0.1), peak = pct(0.97);
  const thr = Math.max(floor + 8, floor + (peak - floor) * 0.32, -62);
  const voiced = new Uint8Array(n);
  for (let i = 0; i < n; i++) voiced[i] = db[i] > thr ? 1 : 0;
  // drop clicks shorter than 60 ms, bridge micro-gaps shorter than 70 ms
  runs(voiced, 1).forEach(r => { if (r.len < 6) voiced.fill(0, r.s, r.e); });
  runs(voiced, 0).forEach(r => { if (r.len < 7 && r.s > 0 && r.e < n) voiced.fill(1, r.s, r.e); });
  let first = voiced.indexOf(1), last = voiced.lastIndexOf(1);
  if (first < 0) { first = 0; last = n - 1; }
  const gaps = runs(voiced, 0).filter(r => r.s > first && r.e <= last && r.len >= 14)
    .map(r => ({ s: r.s / FPS, e: r.e / FPS, len: r.len / FPS }));
  // peaks for drawing (≈ 400 per minute, capped)
  const P = Math.min(6000, Math.max(200, Math.round(au.duration * 8)));
  const step = au.data.length / P, peaks = new Float32Array(P);
  for (let i = 0; i < P; i++) { let m = 0; const a = Math.floor(i * step), b = Math.floor((i + 1) * step); for (let j = a; j < b; j += 4) { const v = Math.abs(au.data[j]); if (v > m) m = v; } peaks[i] = m; }
  return { duration: au.duration, speechStart: first / FPS, speechEnd: (last + 1) / FPS, gaps, peaks, thr, floor };
}
function runs(arr, val) {
  const out = []; let s = -1;
  for (let i = 0; i <= arr.length; i++) {
    const on = i < arr.length && arr[i] === val;
    if (on && s < 0) s = i;
    if (!on && s >= 0) { out.push({ s, e: i, len: i - s }); s = -1; }
  }
  return out;
}

/* Line N text lines up with the voice.
   expected: optional array of N-1 expected boundary times (e.g. where you tapped "next line").
   Picks the pause for each boundary that best matches where it should fall, preferring longer pauses. */
function align(an, lines, expected) {
  const N = lines.length;
  if (!N) return [];
  const S = an.speechStart, E = an.speechEnd, T = Math.max(0.5, E - S);
  if (N === 1) return [{ start: Math.max(0, S - 0.05), end: Math.min(an.duration, E + 0.08), text: lines[0] }];
  const w = lines.map(l => Math.max(4, l.replace(/[^\p{L}\p{N}]/gu, '').length + (l.match(/[,;:—–-]/g) || []).length * 3));
  const W = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  const B = expected && expected.length === N - 1 ? expected.slice()
    : w.slice(0, -1).map(x => (acc += x, S + T * acc / W));
  const scale = expected ? 0.7 : T / N;
  // candidates: real pauses, plus fallback cut points at each expected boundary
  const cand = an.gaps.map(g => ({ s: g.s, e: g.e, mid: (g.s + g.e) / 2, bonus: Math.log(g.len / 0.14) * 0.9 }));
  B.forEach(b => cand.push({ s: b, e: b, mid: b, bonus: -2.5 }));
  cand.sort((a, b) => a.mid - b.mid);
  const G = cand.length, INF = 1e18;
  const cost = Array.from({ length: N - 1 }, () => new Float64Array(G).fill(INF));
  const from = Array.from({ length: N - 1 }, () => new Int32Array(G).fill(-1));
  const c = (i, k) => { const d = (cand[k].mid - B[i]) / scale; return d * d - cand[k].bonus; };
  for (let k = 0; k < G; k++) cost[0][k] = c(0, k);
  for (let i = 1; i < N - 1; i++) {
    for (let k = 1; k < G; k++) {
      let best = INF, bi = -1;
      for (let j = 0; j < k; j++) if (cost[i - 1][j] < best && cand[j].e <= cand[k].s - 0.25) { best = cost[i - 1][j]; bi = j; }
      if (bi >= 0) { cost[i][k] = best + c(i, k); from[i][k] = bi; }
    }
  }
  let k = -1, best = INF;
  for (let j = 0; j < G; j++) if (cost[N - 2][j] < best) { best = cost[N - 2][j]; k = j; }
  const pick = new Array(N - 1);
  if (k < 0) B.forEach((b, i) => pick[i] = { s: b, e: b }); // too many lines for this much speech: split evenly
  else for (let i = N - 2; i >= 0; i--) { pick[i] = cand[k]; k = from[i][k]; }
  return lines.map((text, i) => {
    const st = i === 0 ? S : pick[i - 1].e, en = i === N - 1 ? E : pick[i].s;
    return { start: Math.max(0, st - 0.05), end: Math.min(an.duration, Math.max(st + 0.3, en + 0.08)), text };
  });
}

/* 16-bit mono WAV — plays everywhere, has a real duration, and drops straight into Ether's Cut */
function toWav(au) {
  const n = au.data.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, au.rate, true); v.setUint32(28, au.rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, au.data[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}

window.EtherVoiceDSP = { decode, analyze, align, toWav, FPS };
})();
