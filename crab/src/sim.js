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
  ORBIT: 170, ORBIT_FAR: 330, GULL_SPEED: 170, GULL_TURN: 2.4, TRAIL: 0.9, REACH: 240,
  WIND: 48, DIVE_SPEED: 300, GAP: 150, HIT_R: 18, HIT_PER_SHELL: 6,
  COOL: 270, COOL_PER_SHELL: 0.5, REST: 480,
  RING_DROP: 70,
  // The crab's home shell: each size up carries one more but is slower and
  // a bigger target.
  SHELL_MAX: 4, SHELL_SLOW: 0.04, SHELL_HIT: 3,
  // A bigger empty shell washes up once a run, with a line of crabs waiting
  // behind it; reach it with empty claws before the first of them gives up.
  VAC_TICKS: 720, LINE: 2,
  // The garrison: crabs who joined the castle. A guard takes as many pecks as
  // its shell is big, then is stunned until it recovers.
  GUARDS_MAX: 8, GUARD_RECOVER: 1200,
  // Thief gulls land on the castle, peck the guards, then steal shells from
  // the tier being built until the crab chases them off.
  PECK: 60, STEAL_MAX: 3, SHOO_R: 56, RAID_FAR: 260, RAID_CHANCE: 0.5, RAID_OVER_DIVE: 0.3,
  // A stinging anemone, found now and then near the water, arms one guard; a
  // stung gull leaves the beach for a while.
  ANEMONE_CHANCE: 0.6, STING_AWAY: 1200,
};

// The castle outlasts a run. Each finished ring stays standing for the next,
// and each new ring sits lower on the beach, so the tide reaches it sooner and
// the same crab has less time. Losing a run knocks down the newest ring.
export const RINGS = [
  { name: 'the keep', stands: 'The keep stands' },
  { name: 'the curtain wall', stands: 'The curtain wall stands' },
  { name: 'the towers', stands: 'The towers stand' },
  { name: 'the second keep', stands: 'The second keep stands' },
  { name: 'the outer wall', stands: 'The outer wall stands' },
];
export function ringPlace(ring) {
  const foot = C.CASTLE_FOOT + ring * C.RING_DROP;
  return {
    goal: { x: C.CASTLE_X, y: C.CASTLE_Y + ring * C.RING_DROP },
    foot,
    // The sea comes in at the same pace, so a lower ring is reached sooner.
    tideTicks: Math.round(C.TIDE_TICKS * (C.TIDE_START - foot) / (C.TIDE_START - C.CASTLE_FOOT)),
  };
}
const ROT_C = 0.9999500004166653, ROT_S = 0.009999833334166664;   // cos and sin of 0.01 rad

// Upgrades bought between runs with banked shells. Each one eases a single job
// the load does, a small step per level, three levels at most; a run stays
// winnable with none of them.
export const UPGRADES = [
  { id: 'reach', name: 'Long claws', what: 'Pick up shells from further away', cost: [15, 35, 70] },
  { id: 'legs', name: 'Strong legs', what: 'Each shell carried slows you less', cost: [20, 40, 80] },
  { id: 'grip', name: 'Tight grip', what: 'Keep a shell when a gull hits you', cost: [20, 45, 90] },
  { id: 'shell', name: 'Hard shell', what: 'Shake off a hit sooner', cost: [15, 30, 60] },
  { id: 'feet', name: 'Wading feet', what: 'Walk faster in the wet', cost: [10, 25, 50] },
];
export function crabStats(up = {}, shell = 1) {
  const lv = (id) => Math.max(0, Math.min(3, up[id] | 0));
  const big = Math.max(1, Math.min(C.SHELL_MAX, shell | 0)) - 1;
  return {
    pickR: C.PICK_R + 6 * lv('reach'),
    loadSlow: C.LOAD_SLOW * (1 - 0.25 * lv('legs')),
    maxCarry: C.MAX_CARRY + big,
    shellSlow: 1 - C.SHELL_SLOW * big,
    hitBase: C.HIT_R + C.SHELL_HIT * big,
    keep: lv('grip'),
    stun: C.STUN - 15 * lv('shell'),
    wetSlow: C.WET_SLOW + 0.1 * lv('feet'),
  };
}

// home: what the crab brings from past runs: its shell size, its garrison of
// { size, armed, home } and spare anemones not yet given to a guard.
export function createWorld(seed, upgrades = {}, ring = 0, home = {}) {
  ring = Math.max(0, Math.min(RINGS.length - 1, ring | 0));
  const at = ringPlace(ring), gy = at.goal.y;
  const s = {
    ring, goal: at.goal, foot: at.foot, tideTicks: at.tideTicks,
    seed: String(seed), tick: 0, phase: 'wait', startTick: 0, endTick: 0,
    rng: { wash: makeStream(seed, 'wash'), gulls: makeStream(seed, 'gulls'), finds: makeStream(seed, 'finds') },
    crab: { x: C.CASTLE_X, y: gy + 200, px: C.CASTLE_X, py: gy + 200, vx: 0, vy: 0, fx: 0, fy: 1, stun: 0 },
    up: upgrades, shell: Math.max(1, Math.min(C.SHELL_MAX, home.shell | 0 || 1)),
    guards: [], spare: home.spare | 0, vacancy: null, anemone: null, carryAnemone: false,
    k: null, carry: 0, built: 0, shells: [], gulls: [], rest: 0, gap: 0, nextId: 1, events: [],
    // Where the gulls think the crab is: a point that trails behind it, so a
    // crab that keeps moving is never quite where they are circling.
    trail: { x: C.CASTLE_X, y: gy + 200 },
  };
  // The first shell lies between the crab and the plain way down the beach;
  // nothing else moves until it has been carried home.
  s.shells.push({ id: s.nextId++, x: C.CASTLE_X, y: gy + 320, wait: 0 });
  const lo = Math.max(600, at.foot + 200);
  for (let i = 0; i < 5; i++) s.shells.push({ id: s.nextId++, x: 60 + next(s.rng.wash) * (C.W - 120), y: lo + next(s.rng.wash) * (850 - lo), wait: 0 });
  s.k = crabStats(upgrades, s.shell);
  for (const g of (home.guards || []).slice(0, C.GUARDS_MAX)) addGuard(s, g.size, g.home | 0, !!g.armed);
  for (const g of s.guards) if (!g.armed && s.spare > 0) { g.armed = true; s.spare--; }
  // When this run's finds turn up, in ticks after the tide starts.
  s.vacAt = Math.round(s.tideTicks * (0.15 + 0.3 * next(s.rng.finds)));
  s.anemAt = next(s.rng.finds) < C.ANEMONE_CHANCE ? Math.round(s.tideTicks * (0.2 + 0.4 * next(s.rng.finds))) : -1;
  return s;
}

// Where the sea has got to. `calm` is the line the tide itself has reached;
// the waves ride a little either side of it.
export function tideAt(s, tick = s.tick) {
  if (s.phase === 'wait') return { calm: C.TIDE_START, line: C.TIDE_START, u: 0 };
  const end = s.phase === 'play' ? tick : s.endTick;
  const foot = s.foot ?? C.CASTLE_FOOT, u = Math.min(1, (end - s.startTick) / (s.tideTicks ?? C.TIDE_TICKS));
  const calm = C.TIDE_START - (C.TIDE_START - foot) * u;
  const w = ((tick - s.startTick) % C.WAVE_TICKS) / C.WAVE_TICKS;
  const tri = w < 0.5 ? 1 - 4 * w : 4 * w - 3;                    // 1 at the crest, -1 at the ebb
  return { calm, line: calm - tri * C.WAVE_AMP, u };
}

export const tierOf = (built) => Math.min(C.TIERS, Math.floor((built * C.TIERS) / C.NEED));
export const hitRadius = (carry, k) => (k ? k.hitBase : C.HIT_R) + C.HIT_PER_SHELL * carry;
export const speedWith = (carry, wet, k = crabStats()) => C.CRAB_MAX * (k.shellSlow ?? 1) * (1 - k.loadSlow * carry) * (wet ? k.wetSlow : 1);

function washUp(s, calm) {
  for (let i = 0; i < C.SHELLS_PER_WAVE && s.shells.length < C.SHELLS_ON_BEACH; i++) {
    const x = 40 + next(s.rng.wash) * (C.W - 80);
    const y = Math.max(s.foot + 40, calm - 15 - next(s.rng.wash) * 95);
    s.shells.push({ id: s.nextId++, x, y, wait: 0 });
  }
}

function newGull(s) {
  let ux = next(s.rng.gulls) * 2 - 1, uy = next(s.rng.gulls) * 2 - 1;
  const l = Math.hypot(ux, uy) || 1;
  ux /= l; uy /= l;
  const x = next(s.rng.gulls) * C.W, y = -80;
  return { id: s.nextId++, x, y, px: x, py: y, ux, uy, h: Math.PI / 2, state: 'circle', t: 0, ax: 0, ay: 0, cool: C.COOL * (0.5 + next(s.rng.gulls) * 0.5) };
}

function toward(g, tx, ty, speed, dt) {
  const dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy), stepLen = speed * dt;
  if (d <= stepLen) { g.x = tx; g.y = ty; return true; }
  g.x += (dx / d) * stepLen; g.y += (dy / d) * stepLen;
  return false;
}

// Fly toward a point with a turning circle: the heading turns at most
// GULL_TURN radians a second, so a sharp change of course loses a gull.
function glide(g, tx, ty, speed, dt) {
  const dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy);
  if (d < 1) return;
  let turn = Math.atan2(dy, dx) - g.h;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  const most = C.GULL_TURN * dt;
  g.h += Math.max(-most, Math.min(most, turn));
  const v = Math.min(speed, d * 3) * dt;           // ease in near the spot instead of overshooting it
  g.x += Math.cos(g.h) * v; g.y += Math.sin(g.h) * v;
}

function addGuard(s, size, home, armed = false) {
  if (s.guards.length >= C.GUARDS_MAX) return false;
  size = Math.max(1, Math.min(C.SHELL_MAX, size | 0));
  s.guards.push({ id: s.nextId++, size, hp: size, stun: 0, armed, used: false, home, x: 0, y: 0 });
  // The garrison stands in a row along the front of the ring being built.
  const n = s.guards.length;
  s.guards.forEach((g, i) => { g.x = s.goal.x + (i - (n - 1) / 2) * 38; g.y = s.goal.y + 66; });
  return true;
}

function dropLoad(s) {
  const c = s.crab;
  const kept = Math.min(s.k.keep, s.carry - 1);           // the gull always gets at least one
  if (s.carryAnemone) { s.carryAnemone = false; s.events.push({ type: 'anemonelost' }); }
  s.events.push({ type: 'hit', x: c.x, y: c.y, lost: s.carry - kept });
  s.carry = kept; c.stun = s.k.stun; c.vx = 0; c.vy = 0;
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
  const wet = c.y > tide.line, top = speedWith(s.carry, wet, s.k), drag = C.CRAB_ACC / top;
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
    for (let i = s.shells.length - 1; i >= 0 && s.carry < s.k.maxCarry; i--) {
      const sh = s.shells[i];
      if (sh.wait === 0 && Math.hypot(c.x - sh.x, c.y - sh.y) < s.k.pickR) {
        s.shells.splice(i, 1); s.carry++;
        s.events.push({ type: 'pick', x: sh.x, y: sh.y, carry: s.carry });
      }
    }
    const a = s.anemone;
    if (a && s.carry < s.k.maxCarry && Math.hypot(c.x - a.x, c.y - a.y) < s.k.pickR) {
      s.anemone = null; s.carry++; s.carryAnemone = true;     // it takes a place in the load
      s.events.push({ type: 'anemone', x: a.x, y: a.y, carry: s.carry });
    }
  }
  if (s.carry > 0 && Math.hypot(c.x - s.goal.x, c.y - s.goal.y) < C.CASTLE_R + C.CRAB_R) {
    const before = tierOf(s.built), n = s.carry - (s.carryAnemone ? 1 : 0);
    s.built = Math.min(C.NEED, s.built + n);
    s.events.push({ type: 'build', n, built: s.built });
    if (s.carryAnemone) {
      s.carryAnemone = false;
      const g = s.guards.find((q) => !q.armed);
      if (g) g.armed = true; else s.spare++;
      s.events.push({ type: 'arm', id: g ? g.id : 0, x: g ? g.x : s.goal.x, y: g ? g.y : s.goal.y });
    }
    s.carry = 0;
    if (s.phase === 'wait') { s.phase = 'play'; s.startTick = s.tick; s.events.push({ type: 'tide' }); }
    if (s.built >= C.NEED) {
      s.phase = 'won'; s.endTick = s.tick;
      s.events.push({ type: 'won', spare: s.tideTicks - (s.tick - s.startTick) });
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
  // Finds.
  const el = s.tick - s.startTick;
  if (el === s.vacAt) {
    const size = Math.min(C.SHELL_MAX, s.shell + 1), line = [];
    for (let i = 0; i < C.LINE; i++) line.push(Math.max(1, size - 2 - i));
    s.vacancy = { x: 90 + next(s.rng.finds) * (C.W - 180), y: Math.max(s.foot + 70, tide.calm - 55), size, t: C.VAC_TICKS, line };
    s.events.push({ type: 'vacancy', x: s.vacancy.x, y: s.vacancy.y });
  }
  if (el === s.anemAt) {
    s.anemone = { x: 70 + next(s.rng.finds) * (C.W - 140), y: Math.max(s.foot + 60, tide.calm - 35) };
    s.events.push({ type: 'anemonewash', x: s.anemone.x, y: s.anemone.y });
  }
  const v = s.vacancy;
  if (v) {
    v.t--;
    if (s.carry === 0 && c.stun === 0 && Math.hypot(c.x - v.x, c.y - v.y) < C.PICK_R + 14) {
      // The chain: the crab moves up, each crab in line takes the shell left
      // by the one ahead, and the whole line follows it home to the castle.
      const grew = v.size > s.shell;
      if (grew) { s.shell = v.size; s.k = crabStats(s.up, s.shell); }
      let joined = 0;
      for (const sz of v.line) if (addGuard(s, sz + 1, s.ring > 0 ? s.ring - 1 : 0)) joined++;
      s.events.push({ type: 'chain', x: v.x, y: v.y, grew, joined, size: s.shell });
      s.vacancy = null;
    } else if (v.t <= 0 || v.y > tide.calm + C.SWEPT_DEPTH) {
      s.events.push({ type: 'chainlost', x: v.x, y: v.y });
      s.vacancy = null;
    }
  }
  if (s.anemone && s.anemone.y > tide.calm + C.SWEPT_DEPTH) { s.events.push({ type: 'swept', x: s.anemone.x, y: s.anemone.y }); s.anemone = null; }
  for (const g of s.guards) if (g.stun > 0 && --g.stun === 0) { g.hp = g.size; s.events.push({ type: 'recover', id: g.id }); }

  if (tide.u >= 1) { s.phase = 'lost'; s.endTick = s.tick; s.events.push({ type: 'lost', built: s.built }); return s; }

  // Gulls. They want shells, so they only trouble a crab that is carrying.
  // They take turns: one gull at a time may wind up or dive, and after each
  // strike the whole flock waits GAP ticks before any gull may choose the crab.
  const kt = Math.min(1, dt / C.TRAIL);
  s.trail.x += (c.x - s.trail.x) * kt; s.trail.y += (c.y - s.trail.y) * kt;
  if (s.gap > 0) s.gap--;
  let busy = s.gulls.some((g) => g.state !== 'circle' && g.state !== 'gone');
  const per = C.NEED / C.TIERS, floor = tierOf(s.built) * per;
  const loot = s.built - floor;                      // shells a thief could take from the tier being built
  const farHome = Math.hypot(c.x - s.goal.x, c.y - s.goal.y) > C.RAID_FAR;
  const want = C.GULLS[Math.min(C.GULLS.length - 1, tierOf(s.built))];
  while (s.gulls.length < want) s.gulls.push(newGull(s));
  for (const g of s.gulls) {
    g.px = g.x; g.py = g.y;
    if (g.state === 'circle') {
      const nx = g.ux * ROT_C - g.uy * ROT_S, ny = g.ux * ROT_S + g.uy * ROT_C, nl = Math.hypot(nx, ny);
      g.ux = nx / nl; g.uy = ny / nl;
      const r = s.rest > 0 || g.cool > C.COOL * 0.6 ? C.ORBIT_FAR : C.ORBIT;
      glide(g, s.trail.x + g.ux * r, s.trail.y + g.uy * r, C.GULL_SPEED, dt);
      if (g.cool > 0) g.cool -= 1 + C.COOL_PER_SHELL * s.carry;
      // A gull can only choose a crab it has caught up with: outrun the flock
      // and none of them can strike until they close in again.
      const near = Math.hypot(g.x - c.x, g.y - c.y) < C.REACH;
      if (g.cool <= 0 && !busy && s.gap === 0 && s.rest === 0) {
        // Either go for the crab's load, or, while the crab is far from home,
        // raid the castle instead.
        const attack = near && s.carry > 0 && c.stun === 0, canRaid = farHome && loot > 0;
        let choice = null;
        if (attack) choice = canRaid && next(s.rng.gulls) < C.RAID_OVER_DIVE ? 'raid' : 'wind';
        else if (canRaid) { if (next(s.rng.gulls) < C.RAID_CHANCE) choice = 'raid'; else g.cool = C.COOL * 0.5; }
        if (choice === 'wind') {
          busy = true;
          // The gull picks its spot the moment it chooses the crab, and the crab
          // stops dead: the ring is locked there and shrinks, so the player has the
          // whole wind-up to get out of it.
          g.state = 'wind'; g.t = C.WIND; g.ax = c.x; g.ay = c.y; c.vx = 0; c.vy = 0;
          s.events.push({ type: 'wind', id: g.id });
        } else if (choice === 'raid') {
          busy = true;
          g.state = 'raid'; g.t = 600; g.stolen = 0;
          g.ax = s.goal.x + (next(s.rng.gulls) - 0.5) * 120; g.ay = s.goal.y + 40;
          s.events.push({ type: 'raid', id: g.id });
        }
      }
    } else if (g.state === 'wind') {
      // The warning: a counted wind-up in which the gull cannot strike, aimed
      // at the spot locked when it began.
      if (s.carry === 0) { g.state = 'circle'; g.cool = C.COOL * 0.3; s.gap = C.GAP >> 1; continue; }
      if (--g.t <= 0) {
        g.state = 'dive';
        s.events.push({ type: 'dive', id: g.id });
      }
    } else if (g.state === 'dive') {
      if (toward(g, g.ax, g.ay, C.DIVE_SPEED, dt)) {
        if (s.carry > 0 && c.stun === 0 && Math.hypot(c.x - g.ax, c.y - g.ay) < hitRadius(s.carry, s.k)) dropLoad(s);
        else s.events.push({ type: 'miss', x: g.ax, y: g.ay });
        g.state = 'circle'; g.cool = C.COOL; s.gap = C.GAP;
        g.h = Math.atan2(g.y - c.y, g.x - c.x);          // pull up and away from the strike
      }
    } else if (g.state === 'raid' || g.state === 'perch') {
      if (Math.hypot(c.x - g.x, c.y - g.y) < C.SHOO_R && c.stun === 0) {      // chased off
        g.state = 'circle'; g.cool = C.COOL; s.gap = C.GAP; g.h = -Math.PI / 2;
        s.events.push({ type: 'shoo', x: g.x, y: g.y });
        continue;
      }
      if (g.state === 'raid') {
        glide(g, g.ax, g.ay, C.GULL_SPEED * 1.2, dt);
        if (Math.hypot(g.x - g.ax, g.y - g.ay) < 8 || --g.t <= 0) {
          g.x = g.ax; g.y = g.ay; g.state = 'perch'; g.t = C.PECK;
          s.events.push({ type: 'perch', x: g.x, y: g.y });
        }
        continue;
      }
      if (--g.t > 0) continue;
      g.t = C.PECK;
      // Guards first: each takes as many pecks as its shell is big.
      let best = null, bd = Infinity;
      for (const q of s.guards) { const d = Math.hypot(q.x - g.x, q.y - g.y); if (q.stun === 0 && d < bd) { bd = d; best = q; } }
      if (best) {
        best.hp--;
        s.events.push({ type: 'peck', id: best.id, x: best.x, y: best.y });
        if (best.hp <= 0) { best.stun = C.GUARD_RECOVER; s.events.push({ type: 'stunned', id: best.id, x: best.x, y: best.y }); }
        if (best.armed && !best.used) {
          best.used = true;                       // the anemone stings once a run
          g.state = 'gone'; g.t = C.STING_AWAY; s.gap = C.GAP; g.h = -Math.PI / 2;
          s.events.push({ type: 'sting', id: best.id, x: best.x, y: best.y });
        }
      } else if (loot > 0 && g.stolen < C.STEAL_MAX) {
        s.built--; g.stolen++;
        s.events.push({ type: 'steal', x: g.x, y: g.y, built: s.built });
      } else {
        g.state = 'circle'; g.cool = C.COOL; s.gap = C.GAP; g.h = -Math.PI / 2;
        s.events.push({ type: 'leave', x: g.x, y: g.y });
      }
    } else if (g.state === 'gone') {
      glide(g, g.x, -160, C.GULL_SPEED * 1.4, dt);
      if (--g.t <= 0) { g.state = 'circle'; g.cool = C.COOL; }
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
