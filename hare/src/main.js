// The page around the hunt: drawing, input, the horn's sound and the best run.
import { createHunt, step, hounds, watched, visibleHounds, C } from './sim.js';
import { isFloor } from './map.js';
import { fov } from './fov.js';
import { hareBot } from './bot.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let seedBase = params.get('seed') || String(Math.floor(Math.random() * 1e9));
let runs = 0, hunt = null, mode = 'title', ghosts = new Map(), audio = null, flash = 0;
const KEY = 'bst1.hare.best';
const store = { get() { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } },
  set(v) { try { localStorage.setItem(KEY, String(v)); } catch { /* storage can be blocked */ } } };

function newHunt() { hunt = createHunt(seedBase + '-' + runs++); ghosts = new Map(); mode = 'play'; $('card').hidden = true; draw(); hud(); }

// Portrait screens get the meadow turned on its side so the tiles stay big.
function view() {
  const w = innerWidth, h = innerHeight, m = hunt ? hunt.map : { w: 33, h: 23 };
  const turned = h > w;
  const cols = turned ? m.h : m.w, rows = turned ? m.w : m.h;
  const top = 56, pad = 8;
  const tile = Math.max(4, Math.floor(Math.min((w - 2 * pad) / cols, (h - top - pad) / rows)));
  return { turned, tile, ox: Math.floor((w - cols * tile) / 2), oy: Math.floor(top + (h - top - pad - rows * tile) / 2), cols, rows };
}
const toScreen = (v, x, y) => (v.turned ? [v.ox + (hunt.map.h - 1 - y) * v.tile, v.oy + x * v.tile] : [v.ox + x * v.tile, v.oy + y * v.tile]);
// A screen direction becomes a map move, turned with the board.
function moveFor(sx, sy, v) {
  const [mx, my] = v.turned ? [sy, -sx] : [sx, sy];
  if (Math.abs(mx) > Math.abs(my)) return mx > 0 ? 'right' : 'left';
  return my > 0 ? 'down' : 'up';
}

function draw() {
  const dpr = devicePixelRatio || 1;
  if (canvas.width !== Math.round(innerWidth * dpr) || canvas.height !== Math.round(innerHeight * dpr)) {
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#10170f'; ctx.fillRect(0, 0, innerWidth, innerHeight);
  if (!hunt) hunt = createHunt(seedBase + '-preview');
  const h = hunt, m = h.map, v = view(), t = v.tile;
  const mine = fov(m, h.hare.x, h.hare.y);
  const seenHounds = visibleHounds(h);
  for (const d of seenHounds) ghosts.set(h.hounds.indexOf(d), { x: d.x, y: d.y, turn: h.turn });
  const danger = new Set();
  for (const d of seenHounds) for (const k of fov(m, d.x, d.y, h.c.SIGHT)) danger.add(k);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const [px, py] = toScreen(v, x, y), k = y * m.w + x;
    if (!isFloor(m, x, y)) {                    // hedge: a dark mass with one bush per tile
      ctx.fillStyle = '#142813'; ctx.fillRect(px, py, t, t);
      const j = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      ctx.fillStyle = j % 3 ? '#1f3d1d' : '#234621';
      ctx.beginPath(); ctx.arc(px + t * (0.4 + (j % 5) * 0.05), py + t * (0.45 + (j % 7) * 0.02), t * 0.46, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    const lit = mine.has(k);
    ctx.fillStyle = lit ? '#7f9b55' : '#3c4e2d';
    ctx.fillRect(px, py, t, t);
    if (danger.has(k)) { ctx.fillStyle = 'rgba(255,190,70,.42)'; ctx.fillRect(px, py, t, t); }
  }
  const dot = (x, y, r, fill) => { const [px, py] = toScreen(v, x, y); ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(px + t / 2, py + t / 2, t * r, 0, Math.PI * 2); ctx.fill(); };
  // home form
  { const [px, py] = toScreen(v, h.home[0], h.home[1]); ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = Math.max(2, t * 0.14); ctx.beginPath(); ctx.ellipse(px + t / 2, py + t / 2, t * 0.42, t * 0.3, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#5b4429'; ctx.fill(); }
  for (const [x, y] of h.clover) { for (const [a, b] of [[-0.14, -0.1], [0.14, -0.1], [0, 0.14]]) { const [px, py] = toScreen(v, x, y); ctx.fillStyle = '#c8f07a'; ctx.beginPath(); ctx.arc(px + t / 2 + a * t, py + t / 2 + b * t, t * 0.16, 0, Math.PI * 2); ctx.fill(); } }
  for (const [i, g] of ghosts) if (!seenHounds.includes(h.hounds[i])) {
    const age = h.turn - g.turn; if (age > 8) { ghosts.delete(i); continue; }
    ctx.globalAlpha = Math.max(0.15, 0.55 - age * 0.05); dot(g.x, g.y, 0.3, '#d9c7a4'); ctx.globalAlpha = 1;
  }
  for (const d of seenHounds) { dot(d.x, d.y, 0.38, '#2b1d14'); dot(d.x, d.y, 0.3, '#c98b4b'); }
  dot(h.hare.x, h.hare.y, 0.4, '#1a120c'); dot(h.hare.x, h.hare.y, 0.32, h.horn && mode === 'play' ? '#ffd76a' : '#f2e6cf');
  if (flash > 0) { ctx.fillStyle = `rgba(255,207,90,${flash * 0.25})`; ctx.fillRect(0, 0, innerWidth, innerHeight); }
}

function hud() {
  const h = hunt;
  $('clover').textContent = `Clover ${h.eaten} / ${h.c.CLOVER}`;
  const nextHorn = h.c.HORN.find((n) => n > h.turn);
  const inN = nextHorn ? nextHorn - h.turn : null;
  $('horn').textContent = inN ? (inN === 1 ? 'Horn next turn' : `Horn in ${inN}`) : 'No more horns';
  $('horn').classList.toggle('soon', inN === 1);
  $('dawn').textContent = `Dawn in ${h.c.TURNS - h.turn}`;
}

function horn() {
  flash = 1;
  const fade = () => { flash = Math.max(0, flash - 0.08); draw(); if (flash > 0) requestAnimationFrame(fade); };
  requestAnimationFrame(fade);
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain(), now = audio.currentTime;
    o.type = 'sawtooth'; o.frequency.setValueAtTime(330, now); o.frequency.linearRampToValueAtTime(392, now + 0.25);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.12, now + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    o.connect(g).connect(audio.destination); o.start(now); o.stop(now + 0.75);
  } catch { /* no sound available */ }
}

function act(move) {
  if (mode !== 'play') { newHunt(); return; }
  step(hunt, move, hounds);
  if (hunt.horn) horn();
  hud(); draw();
  if (hunt.outcome) finish();
}

function finish() {
  mode = 'end';
  const h = hunt, best = store.get();
  let title, line;
  if (h.outcome === 'home') {
    const left = h.c.TURNS - h.turn;
    title = 'Home safe';
    line = `Back in your form with ${left} turns of dark to spare.` + (left > best ? ' Your best yet.' : best ? ` Your best is ${best}.` : '');
    if (left > best) store.set(left);
  } else if (h.outcome === 'caught') { title = 'Caught'; line = `The hounds had you on turn ${h.turn}, with ${h.eaten} of ${h.c.CLOVER} clover eaten.`; }
  else { title = 'Dawn'; line = 'The sun came up with you still out in the meadow. The hounds go home, and so do you, hungry.'; }
  $('title').textContent = title; $('line').textContent = line; $('how').textContent = ''; $('go').textContent = 'Press a key or tap for the next meadow';
  setTimeout(() => { $('card').hidden = false; }, 350);
}

const KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'stay' };
addEventListener('keydown', (e) => {
  const dir = KEYS[e.code];
  if (!dir && mode === 'play') return;
  e.preventDefault();
  if (mode !== 'play') { if (!e.repeat) newHunt(); return; }
  if (dir === 'stay') { act('stay'); return; }
  const v = view();
  const [sx, sy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  act(moveFor(sx, sy, v));
});
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const start = down; down = null;
  if (mode !== 'play') { newHunt(); return; }
  const v = view(), dx = e.clientX - start.x, dy = e.clientY - start.y;
  if (Math.hypot(dx, dy) > 24) { act(moveFor(dx, dy, v)); return; }      // a swipe
  // a tap beside the hare, judged where the finger landed (a release drifts)
  const [hx, hy] = toScreen(v, hunt.hare.x, hunt.hare.y);
  const cx = start.x - (hx + v.tile / 2), cy = start.y - (hy + v.tile / 2);
  if (Math.hypot(cx, cy) < v.tile * 0.5) { act('stay'); return; }
  act(moveFor(cx, cy, v));
});
$('card').addEventListener('pointerup', (e) => { e.stopPropagation(); if (mode !== 'play') newHunt(); });
$('wait').addEventListener('click', () => act('stay'));
addEventListener('resize', draw);
draw();

// For the browser tests.
window.__game = {
  get mode() { return mode; }, state: () => hunt, view, act, newHunt,
  autoplay() { const b = hareBot(); while (mode === 'play') act(b(hunt)); return hunt.outcome; },
};
