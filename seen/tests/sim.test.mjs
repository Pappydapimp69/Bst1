// The claim under test: a tower that models only the player catches habit and
// cannot catch chance, and the game is tuned so chance play usually escapes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStream, next } from '../../src/rng.js';
import { createRun, step, newModel, habits, ROOMS, HOURS } from '../src/sim.js';

// Each player is a function of what a person could see: the run so far, the
// short door and the door the tower named. None can read the sealed guess.
const BOTS = {
  chance: (s, r) => Math.floor(next(r) * 3),
  alwaysShort: (s) => s.short,
  alwaysLeft: () => 0,
  stayOrShift: (s) => { const l = s.history.at(-1); return l ? (l.seen ? (l.pick + 1) % 3 : l.pick) : 1; },
  defier: (s) => (s.short !== s.claim ? s.short : (s.claim + 1) % 3),
  believer: (s) => s.claim,
  hurried: (s, r) => (next(r) < 0.75 ? s.short : Math.floor(next(r) * 3)),
  alternator: (s) => { const l = s.history.at(-1); return l && l.pick === l.short ? (s.short + 1) % 3 : s.short; },
};

function career(bot, seed, runs = 30) {
  const model = newModel(), r = makeStream(seed, 'bot');
  const out = [];
  for (let i = 0; i < runs; i++) {
    const s = createRun(seed + ':' + i, model);
    while (s.status === 'play') step(s, bot(s, r), next(r) < 0.3);
    out.push({ escaped: s.status === 'escaped', seen: s.seen, rooms: s.history.length });
  }
  return { out, model };
}
function measure(name, from = 10) {
  let esc = 0, seen = 0, rooms = 0, n = 0;
  for (let k = 0; k < 40; k++) {
    for (const run of career(BOTS[name], 'm' + k).out.slice(from)) { esc += run.escaped; seen += run.seen; rooms += run.rooms; n++; }
  }
  return { escape: esc / n, seenRate: seen / rooms };
}

test('the same seed, model and picks give the same run', () => {
  const a = career(BOTS.hurried, 'same', 5), b = career(BOTS.hurried, 'same', 5);
  assert.deepEqual(a.out, b.out);
  assert.deepEqual(a.model, b.model);
  assert.deepEqual(JSON.parse(JSON.stringify(a.model)), a.model, 'the model is plain JSON');
});

test('chance cannot be read: seen about one room in three, escapes more often than not', () => {
  const m = measure('chance');
  console.log('chance', m);
  assert.ok(Math.abs(m.seenRate - 1 / 3) < 0.03, `seen ${m.seenRate}`);
  assert.ok(m.escape > 0.5 && m.escape < 0.75, `escape ${m.escape}`);
});

test('habit is read: every habitual player is seen far more than chance and rarely escapes', () => {
  for (const name of Object.keys(BOTS)) {
    if (name === 'chance') continue;
    const m = measure(name);
    console.log(name, m);
    assert.ok(m.seenRate > 0.55, `${name} seen ${m.seenRate}`);
    assert.ok(m.escape < 0.2, `${name} escape ${m.escape}`);
  }
});

test('the tower can say the habit it caught in words', () => {
  const said = habits(career(BOTS.alwaysShort, 'words').model).map((h) => h.text);
  assert.deepEqual(said, ['You take the short way'], 'said once, not three ways');
  const stay = habits(career(BOTS.stayOrShift, 'words').model, { most: 9 }).map((h) => h.text);
  assert.ok(stay.some((t) => t.startsWith('After I see you, you change doors')), stay.join(' / '));
  assert.deepEqual(habits(career(BOTS.chance, 'words', 60).model), [], 'and finds none in chance');
});

test('a run ends at dawn or after the last room', () => {
  const s = createRun('end');
  while (s.status === 'play') step(s, 0);
  assert.ok(s.status === 'dawn' ? s.hours > HOURS : s.room === ROOMS);
  assert.equal(step(s, 0), null);
});
