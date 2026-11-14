// The whole game as a pure simulation on a fixed tick. No wall clock, no
// ambient randomness, no DOM: the same seed and inputs give the same run in
// Node and in a browser. tests/sim.test.mjs scans this file to keep it so.
import { makeStream, next } from './rng.js';

export const C = {
  TICK: 1 / 60,
  W: 2400, H: 1600,
  MOTH_R: 10, MOTH_ACC: 1400, MOTH_MAX: 260,
  POLLEN_N: 6, POLLEN_R: 26, POLLEN_GAIN: 0.22,
  // Pollen stays this far inside the hedge: well over the moth's radius, so a
  // grain against the wall can be reached from any approach angle.
  POLLEN_MARGIN: 60,
  DRAIN: 0.045, DRAIN_PER_WAVE: 0.007, DRAIN_MAX: 0.14,
  BAT_R: 14, BAT_SPEED: 150, BAT_SPEED_PER_WAVE: 10, BAT_SPEED_MAX: 225,
  BAT_ACC: 220, BAT_CAP: 10, BAT_RING: 520, BAT_WARM: 60, BAT_GAP: 45,
  HIT_COST: 0.3, HIT_SAFE: 90,
  GRACE: 180, TENSE: 20 * 60, REST: 6 * 60,
};
const CYCLE = C.TENSE + C.REST;

export function createWorld(seed) {
  const s = {
    seed: String(seed), tick: 0,
    rng: { pollen: makeStream(seed, 'pollen'), bats: makeStream(seed, 'bats') },
    moth: { x: C.W / 2, y: C.H / 2, px: C.W / 2, py: C.H / 2, vx: 0, vy: 0, safe: 0 },
    glow: 1, score: 0, pollen: [], bats: [], batGap: 0, nextId: 1,
    over: false, events: [],
  };
  for (let i = 0; i < C.POLLEN_N; i++) s.pollen.push(placePollen(s));
  return s;
}

// Tense and release: a flat opening, then waves that climb and ease off, each
// starting a little below the last one's peak.
export function waveAt(tick) {
  const t = Math.max(0, tick - C.GRACE);
  const wave = Math.floor(t / CYCLE);
  const phase = t % CYCLE;
  const rest = tick < C.GRACE || phase >= C.TENSE;
  const p = Math.min(1, phase / C.TENSE);
  const bats = rest ? 0 : Math.min(C.BAT_CAP, Math.floor(1 + 0.5 * wave + p * (1.5 + 0.5 * wave)));
  return { wave, rest, bats, p };
}

function placePollen(s) {
  const m = C.POLLEN_MARGIN;
  let x = 0, y = 0;
  for (let i = 0; i < 12; i++) {
    x = m + next(s.rng.pollen) * (C.W - 2 * m);
    y = m + next(s.rng.pollen) * (C.H - 2 * m);
    if (Math.hypot(x - s.moth.x, y - s.moth.y) < 300) continue;
    if (s.pollen.some((p) => Math.hypot(x - p.x, y - p.y) < 150)) continue;
    break;
  }
  return { id: s.nextId++, x, y };
}

function spawnBat(s) {
  // A point on a ring round the moth, by rejection so no trig is involved.
  let u = 0, v = 0, l = 0;
  do {
    u = next(s.rng.bats) * 2 - 1;
    v = next(s.rng.bats) * 2 - 1;
    l = Math.hypot(u, v);
  } while (l < 0.1 || l > 1);
  const x = s.moth.x + (u / l) * C.BAT_RING, y = s.moth.y + (v / l) * C.BAT_RING;
  // The warning is part of the simulation: a tick-counted entry during which
  // the bat cannot strike, not a fade drawn over a live enemy.
  s.bats.push({ id: s.nextId++, x, y, px: x, py: y, vx: 0, vy: 0, warm: C.BAT_WARM, leaving: false });
  s.events.push({ type: 'warn', x, y });
}

export function step(s, input) {
  if (s.over) return s;
  s.events = [];
  s.tick++;
  const dt = C.TICK, m = s.moth, w = waveAt(s.tick);
  if (!w.rest && w.p === 0) s.events.push({ type: 'wave', wave: w.wave });

  // Moth: thrust along the held direction against drag.
  let ix = Number.isFinite(input && input.x) ? input.x : 0;
  let iy = Number.isFinite(input && input.y) ? input.y : 0;
  const il = Math.hypot(ix, iy);
  if (il > 1) { ix /= il; iy /= il; }
  m.px = m.x; m.py = m.y;
  const drag = C.MOTH_ACC / C.MOTH_MAX;
  m.vx += (ix * C.MOTH_ACC - m.vx * drag) * dt;
  m.vy += (iy * C.MOTH_ACC - m.vy * drag) * dt;
  m.x += m.vx * dt; m.y += m.vy * dt;
  if (m.x < C.MOTH_R) { m.x = C.MOTH_R; m.vx = 0; }
  if (m.x > C.W - C.MOTH_R) { m.x = C.W - C.MOTH_R; m.vx = 0; }
  if (m.y < C.MOTH_R) { m.y = C.MOTH_R; m.vy = 0; }
  if (m.y > C.H - C.MOTH_R) { m.y = C.H - C.MOTH_R; m.vy = 0; }
  if (m.safe > 0) m.safe--;

  // Bats.
  const speed = Math.min(C.BAT_SPEED_MAX, C.BAT_SPEED + C.BAT_SPEED_PER_WAVE * w.wave);
  let hunting = 0;
  for (const b of s.bats) {
    b.px = b.x; b.py = b.y;
    if (w.rest) b.leaving = true;
    if (!b.leaving) hunting++;
    if (b.warm > 0) { b.warm--; continue; }
    let dx = m.x - b.x, dy = m.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    if (b.leaving) { dx = -dx; dy = -dy; }
    const ax = (dx / d) * speed - b.vx, ay = (dy / d) * speed - b.vy;
    const al = Math.hypot(ax, ay) || 1, k = Math.min(1, (C.BAT_ACC * dt) / al);
    b.vx += ax * k; b.vy += ay * k;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.leaving) { if (d > 900) b.gone = true; continue; }
    if (m.safe === 0 && Math.hypot(m.x - b.x, m.y - b.y) < C.MOTH_R + C.BAT_R) {
      s.glow -= C.HIT_COST;
      m.safe = C.HIT_SAFE;
      b.leaving = true;
      s.events.push({ type: 'hit', x: m.x, y: m.y });
    }
  }
  s.bats = s.bats.filter((b) => !b.gone);
  if (s.batGap > 0) s.batGap--;
  if (hunting < w.bats && s.batGap === 0) { spawnBat(s); s.batGap = C.BAT_GAP; }

  // Pollen.
  for (let i = 0; i < s.pollen.length; i++) {
    const p = s.pollen[i];
    if (Math.hypot(m.x - p.x, m.y - p.y) < C.POLLEN_R) {
      s.score++;
      s.glow = Math.min(1, s.glow + C.POLLEN_GAIN);
      s.events.push({ type: 'pollen', x: p.x, y: p.y });
      s.pollen[i] = { id: 0, x: -9999, y: -9999 };
      s.pollen[i] = placePollen(s);
    }
  }

  // The light burns down; faster each wave.
  s.glow -= Math.min(C.DRAIN_MAX, C.DRAIN + C.DRAIN_PER_WAVE * w.wave) * dt;
  if (s.glow <= 0) { s.glow = 0; s.over = true; s.events.push({ type: 'over' }); }
  return s;
}

// A number that changes if any part of the run drifts.
export function fingerprint(s) {
  let h = 2166136261;
  const add = (n) => { h = Math.imul(h ^ (Math.round(n) | 0), 16777619); };
  add(s.tick); add(s.score); add(s.glow * 1e6);
  add(s.moth.x * 64); add(s.moth.y * 64);
  for (const p of s.pollen) { add(p.x * 64); add(p.y * 64); }
  for (const b of s.bats) { add(b.x * 64); add(b.y * 64); add(b.warm); }
  for (const k of Object.keys(s.rng)) for (const n of s.rng[k]) add(n);
  return h >>> 0;
}
