// Hare & Hounds tests. Two of them check lessons bs held as untested research:
// that Albert Ford's shadowcasting gives symmetric sight where a plain line
// does not (bst1-89), and that reopening spare connectors is what gives a
// rooms-and-mazes map its alternative routes (bst1-93).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeMap, floorTiles, distances, chokepoints, isFloor } from '../src/map.js';
import { fov, lineOfSight } from '../src/fov.js';
import { createHunt, step, hounds, watched, visibleHounds, fingerprint, C } from '../src/sim.js';
import { hareBot } from '../src/bot.js';
import { rates } from '../tools/hunt.mjs';

test('the hunt is pure: no ambient randomness, clock or DOM', () => {
  for (const f of ['map.js', 'fov.js', 'sim.js', 'bot.js']) {
    const src = readFileSync(new URL('../src/' + f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    for (const banned of ['Math.random', 'Date.', 'performance.', 'document', 'window']) assert.ok(!src.includes(banned), `${f} uses ${banned}`);
  }
});

test('every map is one connected meadow', () => {
  for (let s = 0; s < 40; s++) {
    const m = makeMap('c' + s), t = floorTiles(m), d = distances(m, t[0][0], t[0][1]);
    assert.equal(t.filter(([x, y]) => d[y * m.w + x] >= 0).length, t.length, `seed c${s}`);
  }
});

test('bst1-93: the reopen chance sets how many alternative routes there are', () => {
  const avg = (loop) => { let c = 0; for (let s = 0; s < 30; s++) c += chokepoints(makeMap('r' + s, { loop })); return c / 30; };
  const tree = avg(0), some = avg(0.12), many = avg(0.3);
  // A spanning tree alone leaves a third of the meadow as single-file chokepoints;
  // each step up in reopen chance removes most of the rest.
  assert.ok(tree > 0.25, `tree ${tree}`);
  assert.ok(some < tree / 4, `0.12: ${some} vs ${tree}`);
  assert.ok(many < some, `0.3: ${many} vs ${some}`);
});

test('bst1-89: symmetric shadowcasting sight is symmetric, a plain line is not', () => {
  let pairs = 0, asym = 0, lineAsym = 0;
  for (const seed of ['s1', 's2', 's3']) {
    const m = makeMap(seed), t = floorTiles(m);
    const v = new Map(t.map(([x, y]) => [y * m.w + x, fov(m, x, y)]));
    for (const [ax, ay] of t) for (const [bx, by] of t) {
      pairs++;
      if (v.get(ay * m.w + ax).has(by * m.w + bx) !== v.get(by * m.w + bx).has(ay * m.w + ax)) asym++;
      if (lineOfSight(m, ax, ay, bx, by) !== lineOfSight(m, bx, by, ax, ay)) lineAsym++;
    }
  }
  assert.equal(asym, 0, `${asym} of ${pairs} pairs see one way only`);
  assert.ok(lineAsym > 1000, `a plain line should break symmetry somewhere: ${lineAsym}`);
});

test('sight is limited by the lantern', () => {
  const m = makeMap('s1'), [x, y] = floorTiles(m)[10];
  const near = fov(m, x, y, 2);
  for (const k of near) { const tx = k % m.w, ty = (k - tx) / m.w; assert.ok((tx - x) ** 2 + (ty - y) ** 2 <= 4); }
  assert.ok(fov(m, x, y).size > near.size);
});

test('a hound the hare can see within its lantern can see the hare: the drawn danger is the real danger', () => {
  for (let s = 0; s < 20; s++) {
    const h = createHunt('v' + s), bot = hareBot();
    while (!h.outcome && h.turn < 60) {
      const seen = watched(h).has(h.hare.y * h.map.w + h.hare.x);
      const close = visibleHounds(h).filter((d) => (d.x - h.hare.x) ** 2 + (d.y - h.hare.y) ** 2 <= h.c.SIGHT ** 2);
      assert.equal(seen, close.length > 0, `seed v${s} turn ${h.turn}`);
      step(h, bot(h), hounds);
    }
  }
});

test('the hare wins by eating the clover and getting home; a hound beside it catches it', () => {
  const h = createHunt('w', { HOUNDS: 0 }), bot = hareBot();
  while (!h.outcome) step(h, bot(h), hounds);
  assert.equal(h.outcome, 'home'); assert.equal(h.eaten, C.CLOVER);
  const g = createHunt('w');
  g.hounds[0].x = g.hare.x + 1; g.hounds[0].y = g.hare.y;
  if (!isFloor(g.map, g.hare.x + 1, g.hare.y)) { g.hounds[0].x = g.hare.x; g.hounds[0].y = g.hare.y + 1; }
  step(g, 'stay', () => {});
  assert.equal(g.outcome, 'caught');
});

test('the horn reveals the hare to the hounds on its turns only', () => {
  const h = createHunt('horn', { SIGHT: 0 });
  while (h.turn < C.HORN[0] - 1) step(h, 'stay', () => {});
  assert.equal(h.known, null);
  step(h, 'stay', () => {});
  assert.deepEqual([h.known.x, h.known.y, h.known.turn], [h.hare.x, h.hare.y, C.HORN[0]]);
});

test('the same seed and moves give the same hunt', () => {
  const run = () => { const h = createHunt('same'), b = hareBot(); while (!h.outcome) step(h, b(h), hounds); return fingerprint(h); };
  assert.equal(run(), run());
});

test('hidden movement is the hare\'s defence: revealing it costs it most of its wins', () => {
  const never = rates({ REVEAL: 'never' }, 80).home, horn = rates({ REVEAL: 'horn' }, 80).home;
  assert.ok(never > 0.25, `unrevealed hares get home ${never}`);
  assert.ok(horn < never / 2, `horn ${horn} vs never ${never}`);
});

test('random play on many meadows always ends cleanly', () => {
  const moves = ['stay', 'up', 'right', 'down', 'left'];
  for (let s = 0; s < 60; s++) {
    const h = createHunt('rnd' + s);
    let k = s * 7 + 1;
    while (!h.outcome) { k = (k * 1103515245 + 12345) >>> 0; step(h, moves[k % 5], hounds); }
    assert.ok(['caught', 'home', 'dawn'].includes(h.outcome));
    assert.ok(h.turn <= h.c.TURNS);
  }
});

test('bst1-76 tested: whether the hare is ever revealed matters, how often does not', () => {
  const every = (n) => ({ REVEAL: 'horn', HORN: Array.from({ length: 200 }, (_, i) => n * (i + 1)) });
  const often = rates(every(4), 200).home, rarely = rates(every(32), 200).home, never = rates({ REVEAL: 'never' }, 200).home;
  // Scotland Yard's schedule suggests reveal spacing tunes the balance. Here a
  // horn every 4 turns and one every 32 leave the hare about the same chance,
  // while never revealing it nearly doubles that chance.
  assert.ok(Math.abs(often - rarely) < 0.05, `every 4: ${often}, every 32: ${rarely}`);
  assert.ok(never > 1.6 * Math.max(often, rarely), `never ${never}`);
});
