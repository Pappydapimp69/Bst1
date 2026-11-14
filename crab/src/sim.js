// Crab Castle as a pure simulation on a fixed tick: no wall clock, no ambient
// randomness, no DOM. A crab carries shells up the beach to build a castle
// before the tide reaches it. Everything turns on the load: each shell carried
// builds the castle faster, but slows the crab, brings the gulls down sooner,
// makes it a bigger target, and is lost with the rest if a gull connects.
import { makeStream, next } from '../../src/rng.js';

export const C = {
  TICK: 1 / 60,
  W: 720, H: 960,
  CASTLE_X: 360, CASTLE_Y: 130, CASTLE_R: 64, CASTLE_FOOT: 215,
  NEED: 50, TIERS: 5,
  TIDE_START: 905, TIDE_TICKS: 180 * 60, WAVE_TICKS: 240, WAVE_AMP: 16,
  CRAB_R: 14, CRAB_ACC: 2000, CRAB_MAX: 190, LOAD_SLOW: 0.03, WET_SLOW: 0.55,
  MAX_CARRY: 6, PICK_R: 24, STUN: 70,
  SHELLS_PER_WAVE: 3, SHELLS_ON_BEACH: 12, SWEPT_DEPTH: 70,
  GULLS: [0, 1, 2, 2, 3],
  ORBIT: 170, ORBIT_FAR: 330, GULL_SPEED: 260,
  WIND: 48, DIVE_SPEED: 430, LEAD: 0.25, HIT_R: 18, HIT_PER_SHELL: 6,
  COOL: 270, COOL_PER_SHELL: 0.5, REST: 480,
};
const ROT_C = 0.9998000066665778, ROT_S = 0.01999866669333308;   // cos and sin of 0.02 rad

export function createWorld(seed) {
  const s = {
    seed: String(seed), tick: 0, phase: 'wait', startTick: 0, endTick: 0,
    rng: { wash: makeStream(seed, 'wash'), gulls: makeStream(seed, 'gulls') },
    crab: { x: C.CASTLE_X, y: 330, px: C.CASTLE_X, py: 330, vx: 0, vy: 0, fx: 0, fy: 1, stun: 0 },
    carry: 0, built: 0, shells: [], gulls: [], rest: 0, nextId: 1, events: [],
  };
  // The first shell lies between the crab and the plain way down the beach;
  // nothing else moves until it has been carried home.
  s.shells.push({ id: s.nextId++, x: C.CASTLE_X, y: 450, wait: 0 });
  for (let i = 0; i < 5; i++) s.shells.push({ id: s.nextId++, x: 60 + next(s.rng.wash) * (C.W - 120), y: 600 + next(s.rng.wash) * 250, wait: 0 });
  return s;
}

// Where the sea has got to. `calm` is the line the tide itself has reached;
// the waves ride a little either side of it.
export function tideAt(s, tick = s.tick) {
  if (s.phase === 'wait') return { calm: C.TIDE_START, line: C.TIDE_START, u: 0 };
  const end = s.phase === 'play' ? tick : s.endTick;
  const u = Math.min(1, (end - s.startTick) / C.TIDE_TICKS);
  const calm = C.TIDE_START - (C.TIDE_START - C.CASTLE_FOOT) * u;
  const w = ((tick - s.startTick) % C.WAVE_TICKS) / C.WAVE_TICKS;
  const tri = w < 0.5 ? 1 - 4 * w : 4 * w - 3;                    // 1 at the crest, -1 at the ebb
  return { calm, line: calm - tri * C.WAVE_AMP, u };
}

export const tierOf = (built) => Math.min(C.TIERS, Math.floor((built * C.TIERS) / C.NEED));
export const hitRadius = (carry) => C.HIT_R + C.HIT_PER_SHELL * carry;
export const speedWith = (carry, wet) => C.CRAB_MAX * (1 - C.LOAD_SLOW * carry) * (wet ? C.WET_SLOW : 1);

function washUp(s, calm) {
  for (let i = 0; i < C.SHELLS_PER_WAVE && s.shells.length < C.SHELLS_ON_BEACH; i++) {
    const x = 40 + next(s.rng.wash) * (C.W - 80);
    const y = Math.max(C.CASTLE_FOOT + 40, calm - 15 - next(s.rng.wash) * 95);
    s.shells.push({ id: s.nextId++, x, y, wait: 0 });
  }
}

function newGull(s) {
  let ux = next(s.rng.gulls) * 2 - 1, uy = next(s.rng.gulls) * 2 - 1;
  const l = Math.hypot(ux, uy) || 1;
  ux /= l; uy /= l;
  const x = next(s.rng.gulls) * C.W, y = -80;
  return { id: s.nextId++, x, y, px: x, py: y, ux, uy, state: 'circle', t: 0, ax: 0, ay: 0, cool: C.COOL * (0.5 + next(s.rng.gulls) * 0.5) };
}

function toward(g, tx, ty, speed, dt) {
  const dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy), stepLen = speed * dt;
  if (d <= stepLen) { g.x = tx; g.y = ty; return true; }
  g.x += (dx / d) * stepLen; g.y += (dy / d) * stepLen;
  return false;
}

function dropLoad(s) {
  const c = s.crab;
  s.events.push({ type: 'hit', x: c.x, y: c.y, lost: s.carry });
  s.carry = 0; c.stun = C.STUN; c.vx = 0; c.vy = 0;
}

export function step(s, input) {
  if (s.phase === 'won' || s.phase === 'lost') return s;
  s.events = [];
  s.tick++;
  const dt = C.TICK, c = s.crab;
  const tide = tideAt(s);

  // The crab.
  let ix = Number.isFinite(input && input.x) ? input.x : 0;
  let iy = Number.isFinite(input && input.y) ? input.y : 0;
  const il = Math.hypot(ix, iy);
  if (il > 1) { ix /= il; iy /= il; }
  if (c.stun > 0) { c.stun--; ix = 0; iy = 0; }
  if (il > 0.2) { c.fx = ix / Math.hypot(ix, iy); c.fy = iy / Math.hypot(ix, iy); }
  c.px = c.x; c.py = c.y;
  const wet = c.y > tide.line, top = speedWith(s.carry, wet), drag = C.CRAB_ACC / top;
  c.vx += (ix * C.CRAB_ACC - c.vx * drag) * dt;
  c.vy += (iy * C.CRAB_ACC - c.vy * drag) * dt;
  c.x += c.vx * dt; c.y += c.vy * dt;
  if (c.x < C.CRAB_R) { c.x = C.CRAB_R; c.vx = 0; }
  if (c.x > C.W - C.CRAB_R) { c.x = C.W - C.CRAB_R; c.vx = 0; }
  if (c.y < C.CRAB_R) { c.y = C.CRAB_R; c.vy = 0; }
  if (c.y > C.H - C.CRAB_R) { c.y = C.H - C.CRAB_R; c.vy = 0; }

  // Gathering and building.
  for (const sh of s.shells) if (sh.wait > 0) sh.wait--;
  if (c.stun === 0) {
    for (let i = s.shells.length - 1; i >= 0 && s.carry < C.MAX_CARRY; i--) {
      const sh = s.shells[i];
      if (sh.wait === 0 && Math.hypot(c.x - sh.x, c.y - sh.y) < C.PICK_R) {
        s.shells.splice(i, 1); s.carry++;
        s.events.push({ type: 'pick', x: sh.x, y: sh.y, carry: s.carry });
      }
    }
  }
  if (s.carry > 0 && Math.hypot(c.x - C.CASTLE_X, c.y - C.CASTLE_Y) < C.CASTLE_R + C.CRAB_R) {
    const before = tierOf(s.built);
    s.built = Math.min(C.NEED, s.built + s.carry);
    s.events.push({ type: 'build', n: s.carry, built: s.built });
    s.carry = 0;
    if (s.phase === 'wait') { s.phase = 'play'; s.startTick = s.tick; s.events.push({ type: 'tide' }); }
    if (s.built >= C.NEED) {
      s.phase = 'won'; s.endTick = s.tick;
      s.events.push({ type: 'won', spare: C.TIDE_TICKS - (s.tick - s.startTick) });
      return s;
    }
    if (tierOf(s.built) > before) {
      s.rest = C.REST;                           // a tier finished: the gulls scatter for a breath
      for (const g of s.gulls) { if (g.state === 'wind') g.state = 'circle'; g.cool = Math.max(g.cool, C.COOL); }
      s.events.push({ type: 'tier', tier: tierOf(s.built) });
    }
  }
  if (s.phase !== 'play') return s;
  if (s.rest > 0) s.rest--;

  // The sea.
  if ((s.tick - s.startTick) % C.WAVE_TICKS === 0) washUp(s, tide.calm);
  for (let i = s.shells.length - 1; i >= 0; i--) {
    if (s.shells[i].y > tide.calm + C.SWEPT_DEPTH) { s.events.push({ type: 'swept', x: s.shells[i].x, y: s.shells[i].y }); s.shells.splice(i, 1); }
  }
  if (tide.u >= 1) { s.phase = 'lost'; s.endTick = s.tick; s.events.push({ type: 'lost', built: s.built }); return s; }

  // Gulls. They want shells, so they only trouble a crab that is carrying.
  const want = C.GULLS[Math.min(C.GULLS.length - 1, tierOf(s.built))];
  while (s.gulls.length < want) s.gulls.push(newGull(s));
  for (const g of s.gulls) {
    g.px = g.x; g.py = g.y;
    if (g.state === 'circle') {
      const nx = g.ux * ROT_C - g.uy * ROT_S, ny = g.ux * ROT_S + g.uy * ROT_C, nl = Math.hypot(nx, ny);
      g.ux = nx / nl; g.uy = ny / nl;
      const r = s.rest > 0 || g.cool > C.COOL * 0.6 ? C.ORBIT_FAR : C.ORBIT;
      toward(g, c.x + g.ux * r, c.y + g.uy * r, C.GULL_SPEED, dt);
      if (g.cool > 0) g.cool -= 1 + C.COOL_PER_SHELL * s.carry;
      if (g.cool <= 0 && s.carry > 0 && s.rest === 0 && c.stun === 0) {
        g.state = 'wind'; g.t = C.WIND; g.ax = c.x; g.ay = c.y;
        s.events.push({ type: 'wind', id: g.id });
      }
    } else if (g.state === 'wind') {
      // The warning: a counted wind-up in which the gull cannot strike. Its
      // mark follows the crab, and it commits to a point only at the end.
      if (s.carry === 0) { g.state = 'circle'; g.cool = C.COOL * 0.3; continue; }
      g.ax = c.x; g.ay = c.y;
      if (--g.t <= 0) {
        g.ax = c.x + c.vx * C.LEAD; g.ay = c.y + c.vy * C.LEAD;
        g.state = 'dive';
        s.events.push({ type: 'dive', id: g.id });
      }
    } else if (g.state === 'dive') {
      if (toward(g, g.ax, g.ay, C.DIVE_SPEED, dt)) {
        if (s.carry > 0 && c.stun === 0 && Math.hypot(c.x - g.ax, c.y - g.ay) < hitRadius(s.carry)) dropLoad(s);
        else s.events.push({ type: 'miss', x: g.ax, y: g.ay });
        g.state = 'circle'; g.cool = C.COOL;
      }
    }
  }
  return s;
}

export function fingerprint(s) {
  let h = 2166136261;
  const add = (n) => { h = Math.imul(h ^ (Math.round(n) | 0), 16777619); };
  add(s.tick); add(s.built); add(s.carry); add(s.phase.length);
  add(s.crab.x * 64); add(s.crab.y * 64);
  for (const p of s.shells) { add(p.x * 64); add(p.y * 64); }
  for (const g of s.gulls) { add(g.x * 64); add(g.y * 64); add(g.cool * 8); }
  for (const k of Object.keys(s.rng)) for (const n of s.rng[k]) add(n);
  return h >>> 0;
}
