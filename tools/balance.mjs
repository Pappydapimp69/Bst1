// The balance benchmark: the same seeds played three ways. The gap between a
// moth that does nothing and one that plays well is what skill is worth.
import { createWorld, step, C } from '../src/sim.js';
import { botInput } from '../src/bot.js';
import { makeStream, next } from '../src/rng.js';

export function play(seed, kind, maxTicks = 60 * 60 * 10) {
  const s = createWorld(seed);
  const r = makeStream(seed, 'flail');   // the player's own stream, not the world's
  let held = { x: 0, y: 0 };
  while (!s.over && s.tick < maxTicks) {
    if (kind === 'bot') held = botInput(s);
    else if (kind === 'flail' && s.tick % 30 === 0) held = { x: next(r) * 2 - 1, y: next(r) * 2 - 1 };
    step(s, held);
  }
  return { seconds: s.tick * C.TICK, score: s.score };
}

export function median(a) { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; }

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = Array.from({ length: 40 }, (_, i) => 'b' + i);
  for (const kind of ['idle', 'flail', 'bot']) {
    const runs = seeds.map((s) => play(s, kind));
    const t = runs.map((r) => r.seconds), sc = runs.map((r) => r.score);
    console.log(kind.padEnd(6), 'seconds median', median(t).toFixed(1), 'min', Math.min(...t).toFixed(1), 'max', Math.max(...t).toFixed(1), '| score median', median(sc));
  }
}
