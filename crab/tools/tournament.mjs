// The policy tournament: every habit of play over the same seeds, at a quick
// and an ordinary reaction time. A design where one fixed habit wins has no
// decision in it; this one is tuned so that reading the sky beats every habit
// that ignores it. `npm run tournament` prints the table.
import { createWorld, step, C } from '../src/sim.js';
import { makeBot, HABITS } from '../src/bot.js';

export function play(seed, policy) {
  const s = createWorld(seed), bot = makeBot(policy);
  let hits = 0;
  while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < 60 * 60 * 8) {
    step(s, bot(s));
    for (const e of s.events) if (e.type === 'hit') hits++;
  }
  const spare = s.phase === 'won' ? (C.TIDE_TICKS - (s.endTick - s.startTick)) * C.TICK : 0;
  return { won: s.phase === 'won', spare, built: s.built, hits };
}

export function score(policy, seeds) {
  const runs = seeds.map((seed) => play(seed, policy));
  const mean = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  return { wins: mean((r) => (r.won ? 1 : 0)), spare: mean((r) => r.spare), built: mean((r) => r.built), hits: mean((r) => r.hits) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = Array.from({ length: 30 }, (_, i) => 't' + i);
  console.log('habit  react | wins  seconds to spare  built  hits');
  for (const react of [2, 10, 16]) for (const name of Object.keys(HABITS)) {
    const r = score({ habit: HABITS[name], react }, seeds);
    console.log(name.padEnd(6), String(react).padEnd(5), '|', (r.wins * 100).toFixed(0).padStart(3) + '%', r.spare.toFixed(1).padStart(10), r.built.toFixed(1).padStart(11), r.hits.toFixed(1).padStart(5));
  }
}
