import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { C, createWorld, step, tideAt, tierOf, hitRadius, speedWith, fingerprint } from '../src/sim.js';
import { makeBot, HABITS } from '../src/bot.js';
import { makeStream, next } from '../../src/rng.js';
import { score, play } from '../tools/tournament.mjs';
import { GOLDEN } from './golden.mjs';

const idle = { x: 0, y: 0 };
function started(seed) {                 // a world with the first shell delivered
  const w = createWorld(seed), bot = makeBot({ habit: HABITS.one });
  while (w.phase === 'wait') step(w, bot(w));
  return w;
}

test('the simulation is pure: no ambient randomness, wall clock or DOM', () => {
  for (const f of ['sim.js', 'bot.js']) {
    const src = readFileSync(new URL('../src/' + f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    for (const banned of ['Math.random', 'Date.', 'performance.', 'document', 'window', 'setTimeout'])
      assert.ok(!src.includes(banned), `${f} uses ${banned}`);
  }
});

test('a replay matches its golden fingerprint', () => {
  const w = createWorld(GOLDEN.seed), bot = makeBot();
  for (let i = 0; i < GOLDEN.ticks; i++) step(w, bot(w));
  assert.equal(w.tick, GOLDEN.ticks, 'the golden run is still in play at its last tick');
  assert.equal(fingerprint(w), GOLDEN.fingerprint);
});

test('nothing starts until the first shell is carried home', () => {
  const w = createWorld('gate');
  for (let i = 0; i < 1200; i++) step(w, idle);
  assert.equal(w.phase, 'wait');
  assert.equal(tideAt(w).calm, C.TIDE_START, 'the tide waits');
  assert.equal(w.gulls.length, 0, 'the gulls wait');
  // Walking straight down the beach from the start gathers the first shell,
  // and walking back up hands it in: the plain path teaches the whole loop.
  for (let i = 0; i < 200 && w.carry === 0; i++) step(w, { x: 0, y: 1 });
  assert.equal(w.carry, 1);
  for (let i = 0; i < 400 && w.phase === 'wait'; i++) step(w, { x: 0, y: -1 });
  assert.equal(w.phase, 'play');
  assert.equal(w.built, 1);
});

test('the castle can be finished, and the tide takes one left alone', () => {
  const won = play('win', { habit: HABITS.read, react: 10 });
  assert.ok(won.won && won.spare > 0);
  const w = started('lose');
  while (w.phase === 'play') step(w, idle);
  assert.equal(w.phase, 'lost');
  assert.equal(w.endTick - w.startTick, C.TIDE_TICKS, 'the tide arrives exactly on time');
  const frozen = fingerprint(w);
  step(w, { x: 1, y: 1 });
  assert.equal(fingerprint(w), frozen, 'nothing moves once the run is over');
});

test('gulls only trouble a crab that is carrying, and never strike in the wind-up', () => {
  const w = started('gull');
  w.built = 20; w.carry = 0;                               // two gulls' worth of castle
  for (let i = 0; i < 1500; i++) {
    step(w, idle);
    assert.ok(!w.gulls.some((g) => g.state !== 'circle'), 'an empty-handed crab is left alone');
  }
  w.carry = 4; w.crab.y = 600;
  let winds = 0, hit = false;
  for (let i = 0; i < 1500 && !hit; i++) {
    const winding = w.gulls.some((g) => g.state === 'wind');
    step(w, idle);
    if (winding) winds++;
    hit = w.events.some((e) => e.type === 'hit');
  }
  assert.ok(hit, 'a loaded crab that stands still is hit');
  assert.ok(winds >= C.WIND, `the warning lasted ${winds} ticks, at least the full wind-up`);
  assert.ok(C.WIND * C.TICK > 0.3, 'the warning is longer than the slowest human reaction');
  assert.equal(w.carry, 0, 'the whole load is lost');
  assert.ok(w.crab.stun > 0);
});

test('the load does all its jobs: slower, a bigger target, and gulls sooner', () => {
  for (let n = 1; n <= C.MAX_CARRY; n++) {
    assert.ok(speedWith(n, false) < speedWith(n - 1, false));
    assert.ok(hitRadius(n) > hitRadius(n - 1));
  }
  assert.ok(speedWith(C.MAX_CARRY, false) > 0.75 * C.CRAB_MAX, 'the slowdown alone must not decide the best load');
  assert.ok(speedWith(0, true) < speedWith(0, false), 'wading is slower than walking');
  const dives = (carry) => {
    const w = started('dives'); w.built = 10; w.crab.y = 600;
    let n = 0;
    for (let i = 0; i < 3000; i++) { w.carry = carry; w.crab.stun = 0; step(w, idle); n += w.events.filter((e) => e.type === 'dive').length; }
    return n;
  };
  assert.ok(dives(6) > dives(1) * 1.5, 'a heavy load draws clearly more dives');
});

test('each finished tier scatters the gulls for a breath', () => {
  const w = started('tier'); w.built = 19; w.carry = 3; w.rest = 0;
  w.crab.x = C.CASTLE_X; w.crab.y = C.CASTLE_Y + 40;
  step(w, idle);
  assert.ok(w.events.some((e) => e.type === 'tier' && e.tier === 2));
  assert.equal(w.rest, C.REST - 1);
  w.carry = 5; w.crab.y = 600;
  for (let i = 0; i < C.REST - 5; i++) { step(w, idle); assert.ok(!w.events.some((e) => e.type === 'wind'), 'no gull winds up during the rest'); }
});

test('tournament: no fixed habit wins; reading the sky beats them all', () => {
  const seeds = Array.from({ length: 16 }, (_, i) => 'p' + i);
  for (const react of [2, 10]) {
    const r = Object.fromEntries(Object.keys(HABITS).map((k) => [k, score({ habit: HABITS[k], react }, seeds)]));
    const fixed = ['one', 'two', 'three', 'four', 'five', 'six'];
    const bestFixed = Math.max(...fixed.map((k) => r[k].spare));
    assert.ok(r.read.spare > bestFixed + 5, `react ${react}: reading the sky (${r.read.spare.toFixed(1)}) should clearly beat the best fixed habit (${bestFixed.toFixed(1)})`);
    assert.ok(r.read.wins === 1, 'and always finish');
    assert.ok(r.one.spare < r.three.spare && r.six.spare < r.three.spare, 'both the timid and the greedy habit do worse than the middle');
    assert.ok(r.one.spare < 0.15 * C.TIDE_TICKS * C.TICK, 'one shell at a time barely makes it, if at all');
  }
  const slowGreedy = score({ habit: HABITS.six, react: 10 }, seeds);
  assert.ok(slowGreedy.wins < 0.8, 'greed with ordinary reactions often loses the castle');
});

test('fuzz: random play over many seeds keeps every invariant', () => {
  for (let seed = 0; seed < 40; seed++) {
    const w = createWorld('fuzz' + seed), r = makeStream(seed, 'fuzz-player'), bot = makeBot({ habit: HABITS.four });
    let held = { x: 0, y: 0 }, lastBuilt = 0;
    for (let i = 0; i < 6000 && w.phase !== 'won' && w.phase !== 'lost'; i++) {
      const roll = next(r);
      if (roll < 0.03) held = { x: next(r) * 4 - 2, y: next(r) * 4 - 2 };
      else if (roll < 0.035) held = { x: NaN, y: undefined };
      else if (roll < 0.04) held = null;
      else if (roll < 0.08) held = bot(w);
      step(w, held);
      const c = w.crab, where = `seed ${seed} tick ${w.tick}`;
      assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), where);
      assert.ok(c.x >= C.CRAB_R && c.x <= C.W - C.CRAB_R && c.y >= C.CRAB_R && c.y <= C.H - C.CRAB_R, where);
      assert.ok(w.carry >= 0 && w.carry <= C.MAX_CARRY, where);
      assert.ok(w.built >= lastBuilt && w.built <= C.NEED, where);
      assert.ok(w.shells.length <= C.SHELLS_ON_BEACH + 6, where);
      assert.ok(w.gulls.length <= Math.max(...C.GULLS), where);
      assert.equal(tierOf(w.built) <= C.TIERS, true, where);
      for (const e of w.events) if (e.type === 'hit') assert.ok(e.lost > 0 && w.carry === 0, where);
      lastBuilt = w.built;
    }
  }
});
