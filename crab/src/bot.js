// Players built from two knobs, so different ways of playing can be run
// against each other. A bot performs only the acts a person can: it steers,
// and it answers a dive only after a reaction delay.
import { C, tideAt, tierOf } from './sim.js';

// Ways of deciding how many shells to gather before heading home. The fixed
// habits ignore the sky; `read` looks at it.
export const HABITS = {
  one: () => 1, two: () => 2, three: () => 3, four: () => 4, five: () => 5, six: () => 6,
  read: (q) => (q.rest ? 6 : [6, 4, 3, 2][Math.min(3, q.gulls)]),
};

// habit: a function from the situation to a load. react: ticks after a gull
// commits before the bot starts its dodge (human reaction is 9 to 18 ticks).
export function makeBot({ habit = HABITS.read, react = 10 } = {}) {
  let dodge = null;
  const seen = new Map();
  return function bot(s) {
    const c = s.crab, tide = tideAt(s);
    let want = habit({ gulls: s.gulls.length, rest: s.rest > 0, tier: tierOf(s.built), carry: s.carry });
    want = Math.max(1, Math.min(s.k ? s.k.maxCarry : C.MAX_CARRY, want, C.NEED - s.built));

    let tx = s.goal.x, ty = s.goal.y;
    if (s.carry < want) {
      let best = null, bd = Infinity;
      for (const sh of s.shells) {
        const wet = sh.y > tide.line ? 120 : 0;
        const d = Math.hypot(sh.x - c.x, sh.y - c.y) + wet + 0.35 * Math.max(0, sh.y - c.y);
        if (d < bd) { bd = d; best = sh; }
      }
      if (best) { tx = best.x; ty = best.y; }
      else if (s.carry === 0) { tx = c.x; ty = Math.min(tide.calm - 60, c.y + 100); }
    }
    let dx = tx - c.x, dy = ty - c.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;

    // Dodging: once a dive has been committed for `react` ticks, break away
    // from the point the gull is aimed at.
    let diving = false;
    for (const g of s.gulls) {
      if (g.state !== 'dive') { seen.delete(g.id); continue; }
      diving = true;
      if (!seen.has(g.id)) seen.set(g.id, s.tick);
      if (s.tick - seen.get(g.id) >= react && s.carry > 0) {
        let ox = c.x - g.ax, oy = c.y - g.ay;
        const ol = Math.hypot(ox, oy);
        if (ol < 1) { ox = -dy; oy = dx; } else { ox /= ol; oy /= ol; }
        dodge = { x: ox, y: oy };
      }
    }
    if (!diving) dodge = null;
    return dodge ? { x: dodge.x, y: dodge.y } : { x: dx, y: dy };
  };
}
