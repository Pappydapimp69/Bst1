import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { C, createWorld, step, waveAt, fingerprint } from '../src/sim.js';
import { botInput } from '../src/bot.js';
import { makeStream, next } from '../src/rng.js';
import { createLoop } from '../src/loop.js';
import { followCamera } from '../src/camera.js';
import { createHold, stickInput } from '../src/input.js';
import { load, save } from '../src/save.js';
import { play, median } from '../tools/balance.mjs';
import { GOLDEN } from './golden.mjs';


function replay(seed, ticks) {
  const w = createWorld(seed);
  for (let i = 0; i < ticks && !w.over; i++) step(w, botInput(w));
  return w;
}

test('the simulation is pure: no ambient randomness, wall clock or DOM', () => {
  for (const f of ['sim.js', 'rng.js', 'bot.js']) {
    const src = readFileSync(new URL('../src/' + f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    for (const banned of ['Math.random', 'Date.', 'performance.', 'document', 'window', 'setTimeout'])
      assert.ok(!src.includes(banned), `${f} uses ${banned}`);
  }
});

test('a replay matches its golden fingerprint', () => {
  const w = replay(GOLDEN.seed, GOLDEN.ticks);
  assert.equal(w.tick, GOLDEN.ticks, 'the golden run should still be alive at its last tick');
  assert.equal(fingerprint(w), GOLDEN.fingerprint);
});

test('a saved and reloaded world continues exactly', () => {
  const a = replay('save', 900);
  const b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 900; i++) { step(a, botInput(a)); step(b, botInput(b)); }
  assert.equal(fingerprint(a), fingerprint(b));
});

test('random streams: named, independent, and distinct for small seeds', () => {
  const a = makeStream(1, 'pollen'), b = makeStream(1, 'pollen'), c = makeStream(1, 'bats');
  assert.equal(next(a), next(b));
  next(c); next(c); next(c);                       // another consumer drawing more
  assert.equal(next(a), next(b));                  // does not shift this one
  const firsts = new Set();
  for (let s = 0; s < 200; s++) firsts.add(Math.floor(next(makeStream(s, 'pollen')) * 1000));
  assert.ok(firsts.size > 150, `small seeds gave only ${firsts.size} distinct first draws`);
  assert.equal(a.length, 4);
  assert.ok(a.every(Number.isInteger));
});

test('fuzz: random play over many seeds keeps every invariant', () => {
  for (let seed = 0; seed < 60; seed++) {
    const w = createWorld('fuzz' + seed), r = makeStream(seed, 'fuzz-player');
    let held = { x: 0, y: 0 };
    for (let i = 0; i < 4000 && !w.over; i++) {
      const roll = next(r);
      if (roll < 0.05) held = { x: next(r) * 4 - 2, y: next(r) * 4 - 2 };
      else if (roll < 0.06) held = { x: NaN, y: undefined };
      else if (roll < 0.07) held = null;
      const warming = new Set(w.bats.filter((b) => b.warm > 1).map((b) => b.id));
      step(w, held);
      const m = w.moth, where = `seed ${seed} tick ${w.tick}`;
      assert.ok(Number.isFinite(m.x) && Number.isFinite(m.y), where);
      assert.ok(m.x >= C.MOTH_R && m.x <= C.W - C.MOTH_R && m.y >= C.MOTH_R && m.y <= C.H - C.MOTH_R, where);
      assert.ok(w.glow >= 0 && w.glow <= 1, where);
      assert.equal(w.pollen.length, C.POLLEN_N, where);
      assert.ok(w.bats.filter((b) => !b.leaving).length <= C.BAT_CAP, where);
      assert.ok(Math.hypot(m.vx, m.vy) <= C.MOTH_MAX + 1e-6, where);
      for (const p of w.pollen) assert.ok(p.x >= C.POLLEN_MARGIN && p.x <= C.W - C.POLLEN_MARGIN && p.y >= C.POLLEN_MARGIN && p.y <= C.H - C.POLLEN_MARGIN, where);
      // A bat still in its warning cannot have been the one that struck.
      for (const b of w.bats) if (warming.has(b.id)) assert.ok(!b.leaving || waveAt(w.tick).rest, where);
      if (w.events.some((e) => e.type === 'hit')) assert.ok(m.safe === C.HIT_SAFE, where);
    }
  }
});

test('a bat cannot strike during its warning', () => {
  const w = createWorld('warn');
  w.tick = C.GRACE + 10;
  w.bats.push({ id: 99, x: w.moth.x, y: w.moth.y, px: 0, py: 0, vx: 0, vy: 0, warm: C.BAT_WARM, leaving: false });
  for (let i = 0; i < C.BAT_WARM - 1; i++) { step(w, { x: 0, y: 0 }); assert.ok(!w.events.some((e) => e.type === 'hit')); }
  let hit = false;
  for (let i = 0; i < 5; i++) { step(w, { x: 0, y: 0 }); hit ||= w.events.some((e) => e.type === 'hit'); }
  assert.ok(hit, 'once awake, the bat on top of the moth strikes');
});

test('pollen against the hedge can be gathered from the wall side', () => {
  const w = createWorld('edge');
  w.pollen[0] = { id: 1, x: C.POLLEN_MARGIN, y: C.H / 2 };
  w.moth.x = C.MOTH_R; w.moth.y = C.H / 2;           // pinned to the wall
  for (let i = 0; i < 120 && w.score === 0; i++) step(w, { x: 1, y: 0 });
  assert.equal(w.score, 1);
  assert.ok(C.POLLEN_MARGIN - C.MOTH_R > C.POLLEN_R, 'the margin clears the pickup radius');
});

test('waves build and ease off: each starts below the last one\'s peak', () => {
  assert.equal(waveAt(C.GRACE - 1).bats, 0, 'a flat opening');
  const cycle = C.TENSE + C.REST;
  for (let n = 0; n < 12; n++) {
    const start = waveAt(C.GRACE + n * cycle).bats, peak = waveAt(C.GRACE + n * cycle + C.TENSE - 1).bats;
    assert.ok(peak > start || peak === C.BAT_CAP, `wave ${n} climbs`);
    assert.equal(waveAt(C.GRACE + n * cycle + C.TENSE).bats, 0, `wave ${n} ends in a rest`);
    if (n > 0) {
      const lastPeak = waveAt(C.GRACE + (n - 1) * cycle + C.TENSE - 1).bats;
      assert.ok(start < lastPeak, `wave ${n} starts below wave ${n - 1}'s peak`);
    }
  }
  assert.ok(C.BAT_SPEED_MAX < C.MOTH_MAX, 'a moth at full speed always outruns a bat');
});

test('balance: skill is what keeps the light alive', () => {
  const seeds = Array.from({ length: 12 }, (_, i) => 't' + i);
  const idle = median(seeds.map((s) => play(s, 'idle').seconds));
  const flail = median(seeds.map((s) => play(s, 'flail').seconds));
  const bot = median(seeds.map((s) => play(s, 'bot').seconds));
  assert.ok(idle < 25 && flail < 30, `doing nothing must not last: idle ${idle}, flail ${flail}`);
  assert.ok(bot > 8 * Math.max(idle, flail), `good play should far outlast it: bot ${bot}`);
  assert.ok(bot < 480, `even good play must end, so a run has a score: bot ${bot}`);
});

test('loop: fixed steps, capped frames, and hand stepping adds no extra ticks', () => {
  let steps = 0, alphas = [];
  const loop = createLoop({ dt: 1 / 60, step: () => steps++, render: (a) => alphas.push(a) });
  loop.frame(0); assert.equal(steps, 0);
  loop.frame(1000 / 60 * 2.5); assert.equal(steps, 2);
  assert.ok(Math.abs(alphas.at(-1) - 0.5) < 1e-6, 'the leftover half step is carried and blended');
  loop.frame(1000 / 60 * 3); assert.equal(steps, 3);
  loop.frame(60000);                                 // a long stall
  assert.equal(steps, 3 + 15, 'a stall is capped at a quarter second of steps');
  loop.frame(60008); loop.stepBy(5); const after = steps;
  loop.frame(60500); loop.frame(61000);
  assert.equal(steps, after, 'frames between hand steps run nothing');
  loop.resume(); loop.frame(70000); loop.frame(70000 + 1000 / 60 + 0.01);
  assert.equal(steps, after + 1);
});

test('camera: still inside the dead zone, moves at its edge, stays in the world', () => {
  const view = { w: 900, h: 600 }, world = { w: 2400, h: 1600 };
  let cam = { x: 1200, y: 800 };
  cam = followCamera(cam, { x: 1250, y: 820 }, view, world);
  assert.deepEqual(cam, { x: 1200, y: 800 });
  cam = followCamera(cam, { x: 1400, y: 800 }, view, world);
  assert.equal(cam.x, 1400 - 900 * 0.22 / 2);
  cam = followCamera(cam, { x: 10, y: 10 }, view, world);
  assert.deepEqual(cam, { x: 450, y: 300 });
  assert.deepEqual(followCamera(cam, { x: 5, y: 5 }, { w: 3000, h: 2000 }, world), { x: 1200, y: 800 });
});

test('input: every method holds through one controller', () => {
  const hold = createHold();
  hold.set('keys', 1, 0);
  assert.deepEqual(hold.vector(), { x: 1, y: 0 });
  hold.set('touch', 0, 1);
  const v = hold.vector();
  assert.ok(Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-9, 'combined holds never exceed full thrust');
  hold.release('keys');
  assert.deepEqual(hold.vector(), { x: 0, y: 1 });
  hold.releaseAll();
  assert.deepEqual(hold.vector(), { x: 0, y: 0 });
  assert.deepEqual(hold.seen.sort(), ['keys', 'touch']);
});

test('storage: namespaced keys, and a throwing store never breaks the game', () => {
  const map = new Map();
  const store = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
  assert.equal(load('best', 0, store), 0);
  assert.equal(save('best', 41, store), true);
  assert.equal(load('best', 0, store), 41);
  assert.deepEqual([...map.keys()], ['bst1.glowmoth.best']);
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  assert.equal(load('best', 7, broken), 7);
  assert.equal(save('best', 9, broken), false);
  map.set('bst1.glowmoth.best', '{not json');
  assert.equal(load('best', 3, store), 3);
});

test('sticks: a radial dead zone keeps the angle, ignores jitter and starts from zero', () => {
  const angle = ([x, y]) => Math.atan2(y, x);
  // A push just off the horizontal: per-axis dead zones would zero the small
  // axis and snap it flat; a radial one keeps its direction exactly.
  const [px, py] = stickInput(0.9, 0.15, 0.2);
  assert.ok(py > 0, 'the small axis survives');
  assert.ok(Math.abs(angle([px, py]) - Math.atan2(0.15, 0.9)) < 1e-12, 'the angle is kept');
  const perAxis = (v, d) => (Math.abs(v) > d ? v : 0);
  assert.equal(perAxis(0.15, 0.2), 0, 'for contrast: per-axis would have snapped it to the cardinal');
  // Resting jitter inside the dead zone does nothing, in any direction.
  for (let a = 0; a < 6.3; a += 0.3) assert.deepEqual(stickInput(0.19 * Math.cos(a), 0.19 * Math.sin(a), 0.2), [0, 0]);
  // Just past the edge the output is tiny, not a jump to 0.2; full travel is full.
  assert.ok(Math.hypot(...stickInput(0.21, 0, 0.2)) < 0.02);
  assert.ok(Math.abs(Math.hypot(...stickInput(0.6, 0.8, 0.2)) - 1) < 1e-12);
  assert.ok(Math.abs(Math.hypot(...stickInput(3, 4, 0.2)) - 1) < 1e-12, 'past full travel stays at one');
  // The touch stick's 12 percent dead zone: a thumb wobbling 7 px on a 64 px reach is still.
  assert.deepEqual(stickInput(7 / 64, 0, 0.12), [0, 0]);
});
