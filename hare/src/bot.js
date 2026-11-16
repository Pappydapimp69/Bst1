// A hare good enough to judge the hunt's balance against. It heads for the
// nearest clover (then home) and, using what symmetric sight lets it know,
// refuses to step into a tile a hound it can see is watching, and keeps its
// distance from the hounds it has seen.
import { MOVES, visibleHounds, hornNow } from './sim.js';
import { distances, isFloor } from './map.js';
import { fov } from './fov.js';

export function hareBot({ caution = 1 } = {}) {
  const lastSeen = new Map();
  return (h) => {
    const m = h.map;
    for (const [i, d] of h.hounds.entries()) if (visibleHounds(h).includes(d)) lastSeen.set(i, { x: d.x, y: d.y, turn: h.turn });
    for (const [i, s] of lastSeen) if (h.turn - s.turn > 6) lastSeen.delete(i);
    const threats = [...lastSeen.values()];
    const danger = new Set();
    for (const t of threats) for (const k of fov(m, t.x, t.y, h.c.SIGHT + 1)) danger.add(k);
    // Go for the clover it can reach well before any hound it knows of: after
    // a horn the hounds cut off the nearest one, so a reading hare goes wide.
    const mine = distances(m, h.hare.x, h.hare.y);
    const theirs = threats.map((t) => distances(m, t.x, t.y));
    const margin = ([x, y]) => {
      const me = mine[y * m.w + x];
      const them = theirs.length ? Math.min(...theirs.map((d) => d[y * m.w + x])) : 99;
      return me - Math.min(them, 99) * 0.8 * caution;
    };
    const target = h.eaten >= h.c.CLOVER || !h.clover.length ? h.home
      : h.clover.reduce((a, b) => (margin(a) <= margin(b) ? a : b));
    const blocked = (x, y) => caution > 0 && danger.has(y * m.w + x) && !(x === target[0] && y === target[1]);
    let dist = distances(m, target[0], target[1], blocked);
    if (dist[h.hare.y * m.w + h.hare.x] < 0) dist = distances(m, target[0], target[1]);
    let best = 'stay', bestScore = Infinity;
    for (const [name, [dx, dy]] of Object.entries(MOVES)) {
      const x = h.hare.x + dx, y = h.hare.y + dy;
      if (!isFloor(m, x, y)) continue;
      const toGo = dist[y * m.w + x] < 0 ? 999 : dist[y * m.w + x];
      let fear = 0;
      for (const t of threats) { const g = Math.abs(t.x - x) + Math.abs(t.y - y); if (g < 4) fear += (4 - g) * 3 * caution; }
      if (danger.has(y * m.w + x)) fear += 4 * caution;
      const s = toGo + fear;
      if (s < bestScore) { bestScore = s; best = name; }
    }
    return best;
  };
}
