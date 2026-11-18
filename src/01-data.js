'use strict';
// ---------------------------------------------------------------- utilities
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y, s) {
  let t = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { t += a * vnoise(x * f, y * f, s + i * 17); f *= 2; a *= 0.5; }
  return t / 0.9375;
}
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// ---------------------------------------------------------------- the sung language
// Each word: an abstract glyph (SVG path in a 10 by 10 box), its own tone, and the picture that means it.
const WORDS = [
  { id: 'tide', midi: 57, glyph: 'M2 3 L5 8 L8 3 M5 1.5 L5 4', pic: 'wave', name: 'tide' },
  { id: 'bell', midi: 60, glyph: 'M5 1 L5 9 M2 5 L8 5 M3 8.5 L7 8.5', pic: 'bell', name: 'bell' },
  { id: 'moss', midi: 62, glyph: 'M2 8.5 Q5 -1 8 8.5 M5 5 L5 9', pic: 'moss', name: 'moss' },
  { id: 'stone', midi: 64, glyph: 'M2 2 L8 2 L8 8 L2 8 Z M5 2 L5 5', pic: 'stone', name: 'stone' },
  { id: 'lantern', midi: 67, glyph: 'M5 2 A3 3 0 1 1 4.99 2 M5 4.6 L5 5.4', pic: 'lantern', name: 'light' },
  { id: 'keeper', midi: 69, glyph: 'M5 1 L5 9 M2 4 L5 6.5 L8 4', pic: 'keeper', name: 'keeper' },
  { id: 'path', midi: 72, glyph: 'M1 8 L3.7 2 L6.3 8 L9 2', pic: 'steps', name: 'path' },
  { id: 'low', midi: 55, glyph: 'M2 4 L8 4 M2 7 L8 7 M5 7 L5 9.5', pic: 'low', name: 'low' },
  { id: 'high', midi: 76, glyph: 'M2 6 L8 6 M2 3 L8 3 M5 3 L5 0.5', pic: 'high', name: 'high' },
  { id: 'sing', midi: 74, glyph: 'M1.5 5.5 Q3.2 1.5 5 5.5 Q6.8 9.5 8.5 5.5 M5 0.8 L5 2.4', pic: 'note', name: 'sing' },
  { id: 'sleep', midi: 52, glyph: 'M3 2 L7 2 L3 8 L7 8', pic: 'moon', name: 'sleep' },
  { id: 'open', midi: 79, glyph: 'M2 8.5 L2 2 L8 2 L8 8.5 M4 8.5 L6 8.5', pic: 'arch', name: 'open' },
  { id: 'one', midi: 81, glyph: 'M5 2 L5 8 M3 2 L7 2', pic: 'p1', name: 'one' },
  { id: 'two', midi: 84, glyph: 'M3.8 2 L3.8 8 M6.2 2 L6.2 8 M2.5 2 L7.5 2', pic: 'p2', name: 'two' },
  { id: 'three', midi: 86, glyph: 'M3 2 L3 8 M5 2 L5 8 M7 2 L7 8 M2 2 L8 2', pic: 'p3', name: 'three' },
];
const WI = Object.fromEntries(WORDS.map((w, i) => [w.id, i]));
const GLYPH_PATHS = WORDS.map((w) => (typeof Path2D !== 'undefined' ? new Path2D(w.glyph) : null));

// Every phrase is a situation: who sings it, its words, and the sketch the journal keeps of where it was heard.
// Every word appears in at least two situations, so a guess can be checked against two places.
const PHRASES = [
  { id: 'p1', who: 'moth', w: ['lantern', 'keeper'], sketch: ['moth', 'keeper', 'lantern'] },
  { id: 'p2', who: 'moth', w: ['moss', 'lantern'], sketch: ['moth', 'moss', 'lantern'] },
  { id: 'p3', who: 'crab', w: ['stone', 'sleep'], sketch: ['crab', 'stone', 'moon'] },
  { id: 'p4', who: 'crab', w: ['keeper', 'path', 'sing'], sketch: ['crab', 'keeper', 'steps', 'note'] },
  { id: 'p5', who: 'fish', w: ['tide', 'low', 'open'], sketch: ['fish', 'wave', 'low', 'arch'] },
  { id: 'p6', who: 'fish', w: ['tide', 'high', 'sleep'], sketch: ['fish', 'wave', 'high', 'moon'] },
  { id: 'p7', who: 'bell', n: 1, w: ['bell', 'one'], sketch: ['bell1'] },
  { id: 'p8', who: 'bell', n: 2, w: ['bell', 'two'], sketch: ['bell2'] },
  { id: 'p9', who: 'bell', n: 3, w: ['bell', 'three'], sketch: ['bell3'] },
  { id: 'p10', who: 'fish', n: 1, w: ['one', 'stone'], sketch: ['fish1', 'stone'] },
  { id: 'p11', who: 'fish', n: 2, w: ['two', 'moss'], sketch: ['fish2', 'moss'] },
  { id: 'p12', who: 'fish', n: 3, w: ['three', 'low'], sketch: ['fish3', 'low'] },
  { id: 'p13', who: 'spirit', w: ['moss', 'path'], sketch: ['spirit', 'moss', 'steps'] },
  { id: 'p14', who: 'spirit', w: ['bell', 'one', 'two', 'three'], sketch: ['spirit', 'bell1', 'bell2', 'bell3'] },
  { id: 'p15', who: 'spirit', w: ['bell', 'sing', 'lantern', 'high'], sketch: ['spirit', 'bell', 'note', 'tower'] },
  { id: 'p16', who: 'bell', w: ['tide', 'high', 'bell', 'sleep'], sketch: ['bell', 'wave', 'high'] },
  { id: 'p17', who: 'crab', w: ['path', 'low', 'open'], sketch: ['crab', 'steps', 'low', 'wave'] },
];
const PI_ = Object.fromEntries(PHRASES.map((p, i) => [p.id, i]));
const KIND_NAMES = { crab: 'glow crab', moth: 'shore moth', fish: 'pool fish', bell: 'drowned bell', spirit: 'moss spirit',
  tower: 'the lighthouse', pool: 'rock pool', ruin: 'drowned house', islet: 'little island', stone: 'standing stone' };

// ---------------------------------------------------------------- pictures (journal choices and sketches)
// Drawn as shapes in a 0..1 box; ink colour passed in. Shapes, not emoji.
function drawPic(c, name, x, y, s, ink) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.lineWidth = 0.07; c.strokeStyle = ink; c.fillStyle = ink; c.lineCap = 'round'; c.lineJoin = 'round';
  const P = (f) => { c.beginPath(); f(); };
  const dot = (px, py, r) => { P(() => c.arc(px, py, r, 0, 7)); c.fill(); };
  switch (name) {
    case 'wave': P(() => { c.moveTo(0.08, 0.55); c.bezierCurveTo(0.25, 0.3, 0.35, 0.3, 0.5, 0.55); c.bezierCurveTo(0.65, 0.8, 0.75, 0.8, 0.92, 0.55); }); c.stroke();
      P(() => { c.moveTo(0.08, 0.78); c.bezierCurveTo(0.25, 0.6, 0.35, 0.6, 0.5, 0.78); c.bezierCurveTo(0.65, 0.95, 0.75, 0.95, 0.92, 0.78); }); c.globalAlpha = 0.5; c.stroke(); break;
    case 'bell': case 'bell1': case 'bell2': case 'bell3':
      P(() => { c.moveTo(0.22, 0.78); c.quadraticCurveTo(0.28, 0.2, 0.5, 0.18); c.quadraticCurveTo(0.72, 0.2, 0.78, 0.78); c.closePath(); }); c.globalAlpha = 0.35; c.fill(); c.globalAlpha = 1; c.stroke();
      dot(0.5, 0.86, 0.07); P(() => { c.moveTo(0.5, 0.18); c.lineTo(0.5, 0.08); }); c.stroke();
      if (name !== 'bell') { const n = +name[4]; for (let i = 0; i < n; i++) { P(() => { c.moveTo(0.3, 0.42 + i * 0.12); c.lineTo(0.7, 0.42 + i * 0.12); }); c.stroke(); } }
      break;
    case 'moss': for (let i = 0; i < 7; i++) { const a = -1.4 + i * 0.47; P(() => { c.moveTo(0.5, 0.85); c.quadraticCurveTo(0.5 + Math.cos(a) * 0.1, 0.6, 0.5 + Math.sin(a) * 0.33, 0.35 + Math.abs(Math.sin(a)) * 0.2); }); c.stroke(); dot(0.5 + Math.sin(a) * 0.33, 0.35 + Math.abs(Math.sin(a)) * 0.2, 0.05); } break;
    case 'stone': P(() => { c.moveTo(0.15, 0.78); c.lineTo(0.25, 0.4); c.lineTo(0.5, 0.25); c.lineTo(0.78, 0.36); c.lineTo(0.86, 0.78); c.closePath(); }); c.globalAlpha = 0.45; c.fill(); c.globalAlpha = 1; c.stroke(); break;
    case 'lantern': P(() => c.rect(0.33, 0.32, 0.34, 0.44)); c.stroke(); P(() => { c.moveTo(0.4, 0.32); c.quadraticCurveTo(0.5, 0.12, 0.6, 0.32); }); c.stroke(); dot(0.5, 0.55, 0.1);
      for (let i = 0; i < 6; i++) { const a = i * 1.047; P(() => { c.moveTo(0.5 + Math.cos(a) * 0.36, 0.55 + Math.sin(a) * 0.36); c.lineTo(0.5 + Math.cos(a) * 0.46, 0.55 + Math.sin(a) * 0.46); }); c.globalAlpha = 0.6; c.stroke(); c.globalAlpha = 1; } break;
    case 'keeper': dot(0.5, 0.22, 0.11); P(() => { c.moveTo(0.3, 0.9); c.lineTo(0.4, 0.4); c.lineTo(0.6, 0.4); c.lineTo(0.7, 0.9); c.closePath(); }); c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1; c.stroke(); dot(0.78, 0.58, 0.06); break;
    case 'steps': for (let i = 0; i < 4; i++) { c.save(); c.translate(0.22 + i * 0.19, i % 2 ? 0.38 : 0.62); c.rotate(-0.5); P(() => c.ellipse(0, 0, 0.06, 0.1, 0, 0, 7)); c.fill(); c.restore(); } break;
    case 'low': P(() => { c.moveTo(0.1, 0.8); c.lineTo(0.9, 0.8); }); c.stroke(); P(() => { c.moveTo(0.5, 0.15); c.lineTo(0.5, 0.62); c.moveTo(0.33, 0.47); c.lineTo(0.5, 0.64); c.lineTo(0.67, 0.47); }); c.stroke(); break;
    case 'high': P(() => { c.moveTo(0.1, 0.25); c.lineTo(0.9, 0.25); }); c.stroke(); P(() => { c.moveTo(0.5, 0.85); c.lineTo(0.5, 0.38); c.moveTo(0.33, 0.53); c.lineTo(0.5, 0.36); c.lineTo(0.67, 0.53); }); c.stroke(); break;
    case 'note': c.save(); c.translate(0.36, 0.74); c.rotate(-0.4); P(() => c.ellipse(0, 0, 0.13, 0.09, 0, 0, 7)); c.fill(); c.restore();
      P(() => { c.moveTo(0.48, 0.7); c.lineTo(0.48, 0.15); c.quadraticCurveTo(0.62, 0.3, 0.78, 0.3); }); c.stroke(); break;
    case 'moon': P(() => { c.arc(0.5, 0.5, 0.32, 0, Math.PI * 2); }); c.fill(); c.globalCompositeOperation = 'destination-out'; P(() => c.arc(0.64, 0.4, 0.28, 0, 7)); c.fill(); c.globalCompositeOperation = 'source-over'; break;
    case 'arch': P(() => { c.moveTo(0.22, 0.88); c.lineTo(0.22, 0.45); c.arc(0.5, 0.45, 0.28, Math.PI, 0); c.lineTo(0.78, 0.88); }); c.stroke(); P(() => { c.moveTo(0.1, 0.88); c.lineTo(0.9, 0.88); }); c.stroke(); break;
    case 'p1': dot(0.5, 0.55, 0.13); break;
    case 'p2': dot(0.32, 0.55, 0.12); dot(0.68, 0.55, 0.12); break;
    case 'p3': dot(0.2, 0.58, 0.11); dot(0.5, 0.42, 0.11); dot(0.8, 0.58, 0.11); break;
    case 'crab': P(() => c.ellipse(0.5, 0.58, 0.24, 0.15, 0, 0, 7)); c.fill(); for (const sx of [-1, 1]) { P(() => { c.moveTo(0.5 + sx * 0.2, 0.5); c.lineTo(0.5 + sx * 0.33, 0.3); }); c.stroke(); dot(0.5 + sx * 0.35, 0.27, 0.06); for (let k = 0; k < 3; k++) { P(() => { c.moveTo(0.5 + sx * 0.18, 0.62 + k * 0.03); c.lineTo(0.5 + sx * 0.4, 0.72 + k * 0.06); }); c.stroke(); } } break;
    case 'moth': P(() => { c.ellipse(0.3, 0.45, 0.2, 0.14, -0.5, 0, 7); }); c.globalAlpha = 0.6; c.fill(); P(() => c.ellipse(0.7, 0.45, 0.2, 0.14, 0.5, 0, 7)); c.fill(); c.globalAlpha = 1; P(() => c.ellipse(0.5, 0.52, 0.05, 0.2, 0, 0, 7)); c.fill(); break;
    case 'fish': case 'fish1': case 'fish2': case 'fish3': {
      const n = name === 'fish' ? 1 : +name[4];
      for (let i = 0; i < n; i++) { const fy = n === 1 ? 0.5 : 0.25 + i * (0.5 / (n - 1)); const fx = 0.5 + (i % 2 ? 0.08 : -0.08);
        P(() => c.ellipse(fx, fy, 0.22, 0.09, 0, 0, 7)); c.fill(); P(() => { c.moveTo(fx + 0.2, fy); c.lineTo(fx + 0.34, fy - 0.08); c.lineTo(fx + 0.34, fy + 0.08); c.closePath(); }); c.fill(); }
      break; }
    case 'spirit': P(() => { c.moveTo(0.5, 0.1); c.quadraticCurveTo(0.85, 0.5, 0.62, 0.9); c.quadraticCurveTo(0.5, 0.75, 0.38, 0.9); c.quadraticCurveTo(0.15, 0.5, 0.5, 0.1); }); c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1; c.stroke(); dot(0.43, 0.42, 0.04); dot(0.57, 0.42, 0.04); break;
    case 'tower': P(() => { c.moveTo(0.36, 0.92); c.lineTo(0.42, 0.3); c.lineTo(0.58, 0.3); c.lineTo(0.64, 0.92); c.closePath(); }); c.stroke(); P(() => c.rect(0.4, 0.14, 0.2, 0.16)); c.fill();
      P(() => { c.moveTo(0.6, 0.2); c.lineTo(0.98, 0.08); c.moveTo(0.6, 0.24); c.lineTo(0.98, 0.34); }); c.globalAlpha = 0.6; c.stroke(); break;
    default: P(() => c.arc(0.5, 0.5, 0.3, 0, 7)); c.stroke();
  }
  c.restore();
}
function drawGlyph(c, wi, x, y, s, ink, lw) {
  const p = GLYPH_PATHS[wi]; if (!p) return;
  c.save(); c.translate(x, y); c.scale(s / 10, s / 10);
  c.lineWidth = (lw || 1.2); c.strokeStyle = ink; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(p); c.restore();
}

// ---------------------------------------------------------------- settings and save (namespaced, guarded)
const KEY_SAVE = 'lowtide.v5t2.save', KEY_SET = 'lowtide.v5t2.settings', SAVE_V = 1;
function storeGet(store, k) { try { const s = store && store.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function storeSet(store, k, v) { try { store && store.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function storeDel(store, k) { try { store && store.removeItem(k); } catch (e) { /* storage blocked: keep playing */ } }
function getStore() { try { return window.localStorage; } catch (e) { return null; } }
const store = getStore();
const settings = Object.assign({ sound: true, motion: 'system' }, storeGet(store, KEY_SET) || {});
if (!['system', 'full', 'reduced'].includes(settings.motion)) settings.motion = 'system';
settings.sound = settings.sound !== false;
function saveSettings() { storeSet(store, KEY_SET, settings); }
const mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
function reducedMotion() { return settings.motion === 'reduced' || (settings.motion === 'system' && !!(mqReduce && mqReduce.matches)); }

const MOSS_N = 140, MOSS_X0 = -20, MOSS_Y0 = -20; // moss grid: 1 cell per world unit over [-20,120]
function freshJournal() {
  return { v: SAVE_V, night: 1, seed: (Math.random() * 1e9) | 0, words: WORDS.map(() => ({ guess: -1, heard: [], fade: 0, confirmed: false, lastNight: 0 })),
    phrases: PHRASES.map(() => 0), seen: {}, chart: [], phantoms: [], moss: null, lit: false, ended: false, tut: 0, nightsLit: 0 };
}
function encodeMoss(arr) { let s = ''; for (let i = 0; i < arr.length; i++) s += String.fromCharCode(Math.round(clamp(arr[i], 0, 1) * 255)); return btoa(s); }
function decodeMoss(str) {
  const a = new Float32Array(MOSS_N * MOSS_N);
  try { const s = atob(str); if (s.length !== a.length) return a; for (let i = 0; i < a.length; i++) a[i] = s.charCodeAt(i) / 255; } catch (e) { /* bad moss data: start bare */ }
  return a;
}
function loadSave() {
  const s = storeGet(store, KEY_SAVE);
  if (!s) return { save: null, note: '' };
  if (typeof s.v !== 'number') return { save: null, note: 'An old save could not be read, so it was left alone.' };
  if (s.v > SAVE_V) return { save: null, note: 'This save is from a newer version and was left alone.' };
  const f = freshJournal();
  const out = Object.assign(f, s);
  out.night = Math.max(1, Math.floor(+out.night) || 1);
  out.seed = (+out.seed | 0) || f.seed;
  out.words = WORDS.map((w, i) => {
    const o = (s.words && s.words[i]) || {};
    return { guess: Number.isInteger(o.guess) && o.guess >= -1 && o.guess < WORDS.length ? o.guess : -1,
      heard: Array.isArray(o.heard) ? o.heard.filter((p) => PI_[p] !== undefined) : [],
      fade: clamp(Math.floor(+o.fade) || 0, 0, 3), confirmed: !!o.confirmed, lastNight: Math.max(0, Math.floor(+o.lastNight) || 0) };
  });
  out.phrases = PHRASES.map((p, i) => Math.max(0, Math.floor(+(s.phrases && s.phrases[i])) || 0));
  out.chart = Array.isArray(s.chart) ? s.chart.filter((c) => c && isFinite(c.x) && isFinite(c.y)).slice(0, 12) : [];
  out.phantoms = Array.isArray(s.phantoms) ? s.phantoms.filter((c) => c && isFinite(c.x) && isFinite(c.y)).slice(0, 12) : [];
  out.seen = s.seen && typeof s.seen === 'object' ? s.seen : {};
  out.tut = clamp(Math.floor(+s.tut) || 0, 0, 99);
  return { save: out, note: '' };
}
