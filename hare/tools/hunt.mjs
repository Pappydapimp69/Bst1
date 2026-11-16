// The design check for the hunt: how often the hounds catch a capable hare
// when the hare is never revealed, revealed on the horn schedule, or always in
// view. `npm run hunt`.
import { createHunt, step, hounds } from '../src/sim.js';
import { hareBot } from '../src/bot.js';

export function play(seed, opts = {}, bot = hareBot()) {
  const h = createHunt(seed, opts);
  while (!h.outcome) step(h, bot(h), hounds);
  return h;
}

export function rates(opts = {}, n = 200, botOpts) {
  const out = { caught: 0, home: 0, dawn: 0 };
  for (let i = 0; i < n; i++) out[play('hunt-' + i, opts, hareBot(botOpts)).outcome]++;
  for (const k in out) out[k] /= n;
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const REVEAL of ['never', 'horn', 'always']) console.log(REVEAL.padEnd(7), JSON.stringify(rates({ REVEAL })));
}
