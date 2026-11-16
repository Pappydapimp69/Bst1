// Hare & Hounds, turn by turn. The hare must nibble three clover patches and
// get home to its form; three hounds hunt it by sight. Hounds see only within
// their lantern radius and only along symmetric sight lines, and the hunt horn
// forces the hare's position into the open on a fixed schedule, the way
// Scotland Yard surfaces Mr. X on set moves. Everything here is pure: the same
// seed and moves give the same hunt.
import { makeMap, floorTiles, distances, isFloor } from './map.js';
import { fov } from './fov.js';
import { makeStream, next } from '../../src/rng.js';

export const C = {
  HOUNDS: 3,
  SIGHT: 4,                 // a hound's lantern radius, in tiles
  CLOVER: 2,
  LOOP: 0.12,               // chance to reopen a spare gap in the hedges
  REVEAL: 'horn',           // 'never' | 'horn' | 'always'
  HORN: [3, 8, 13, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84, 90, 96, 102, 108, 114, 120, 126, 132, 138, 144, 150, 156],
  TURNS: 160,               // dawn: a hare still out at this turn is safe but scoreless
};
export const MOVES = { stay: [0, 0], up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

export function createHunt(seed, opts = {}) {
  const c = { ...C, ...opts };
  const map = makeMap(seed, { loop: c.LOOP });
  const r = makeStream(seed, 'place');
  const pick = (list) => list[Math.floor(next(r) * list.length)];
  const fields = map.rooms.filter((o) => isFloor(map, o.x + 1, o.y + 1));
  const centre = (o) => [o.x + (o.w >> 1), o.y + (o.h >> 1)];
  // Home is a field; the hounds start in the field farthest from it, and
  // clover grows in the fields in between, never in either.
  const home = centre(pick(fields));
  const dh = distances(map, home[0], home[1]);
  const byFar = fields.map((o) => [o, dh[centre(o)[1] * map.w + centre(o)[0]]]).filter(([, d]) => d > 0).sort((a, b) => b[1] - a[1]);
  const kennel = centre(byFar[0][0]);
  const middle = byFar.slice(1).map(([o]) => o);
  const clover = [];
  while (clover.length < c.CLOVER && middle.length) clover.push(centre(middle.splice(Math.floor(next(r) * middle.length), 1)[0]));
  const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const hounds = [];
  for (const [dx, dy] of offsets) {
    if (hounds.length === c.HOUNDS) break;
    if (isFloor(map, kennel[0] + dx, kennel[1] + dy)) hounds.push({ x: kennel[0] + dx, y: kennel[1] + dy, goal: null });
  }
  return { c, map, rng: makeStream(seed, 'hounds'), turn: 0, hare: { x: home[0], y: home[1] }, home, clover, eaten: 0,
    hounds, known: null, seenNow: false, outcome: null, log: [] };
}

// Tiles any hound can see right now: exactly where the hare would be spotted.
export function watched(h) {
  const all = new Set();
  for (const d of h.hounds) for (const t of fov(h.map, d.x, d.y, h.c.SIGHT)) all.add(t);
  return all;
}
// Hounds the hare can see. Sight is symmetric, so a hound inside its lantern
// range and in view can also see the hare.
export function visibleHounds(h) {
  const mine = fov(h.map, h.hare.x, h.hare.y);
  return h.hounds.filter((d) => mine.has(d.y * h.map.w + d.x));
}
export const hornNow = (h) => h.c.REVEAL === 'always' || (h.c.REVEAL === 'horn' && h.c.HORN.includes(h.turn));

// A hound on the hare's tile, or beside it once the hounds have run, has it:
// moving on a grid, an equal-speed chaser could otherwise trail one tile
// behind forever.
const caught = (h, reach = 0) => h.hounds.some((d) => Math.abs(d.x - h.hare.x) + Math.abs(d.y - h.hare.y) <= reach);

// One turn: the hare moves, then each hound.
export function step(h, move, houndBrain) {
  if (h.outcome) return h;
  const [dx, dy] = MOVES[move] || MOVES.stay;
  if (isFloor(h.map, h.hare.x + dx, h.hare.y + dy)) { h.hare.x += dx; h.hare.y += dy; }
  if (caught(h)) return end(h, 'caught');
  const ci = h.clover.findIndex(([x, y]) => x === h.hare.x && y === h.hare.y);
  if (ci >= 0) { h.clover.splice(ci, 1); h.eaten++; }
  if (h.eaten >= h.c.CLOVER && h.hare.x === h.home[0] && h.hare.y === h.home[1]) return end(h, 'home');
  h.turn++;
  const seen = watched(h).has(h.hare.y * h.map.w + h.hare.x);
  h.seenNow = seen;
  h.horn = hornNow(h);
  if (seen || h.horn) h.known = { x: h.hare.x, y: h.hare.y, turn: h.turn };
  houndBrain(h);
  if (caught(h, 1)) return end(h, 'caught');
  if (h.turn >= h.c.TURNS) return end(h, 'dawn');
  return h;
}
function end(h, outcome) { h.outcome = outcome; return h; }

// The hounds' shared brain. When the hare is known, the nearest hound runs at
// where it was and the others cut it off at the places it must still visit
// (its nearest clover, then home); a hound that reaches a stale mark and finds
// nothing searches a random spot.
export function hounds(h) {
  const m = h.map;
  const tiles = h.fields || (h.fields = floorTiles(m));
  if (h.known && h.known.turn === h.turn) {
    const k = h.known;
    const dk = distances(m, k.x, k.y);
    const order = h.hounds.slice().sort((a, b) => dk[a.y * m.w + a.x] - dk[b.y * m.w + b.x]);
    const ahead = h.clover.slice().sort((a, b) => dk[a[1] * m.w + a[0]] - dk[b[1] * m.w + b[0]]);
    ahead.push(h.home);
    order.forEach((d, i) => { d.goal = i === 0 ? [k.x, k.y] : ahead[Math.min(i - 1, ahead.length - 1)]; });
  }
  const taken = new Set();
  for (const d of h.hounds) {
    if (!d.goal || (d.x === d.goal[0] && d.y === d.goal[1])) d.goal = tiles[Math.floor(next(h.rng) * tiles.length)];
    const dist = distances(m, d.goal[0], d.goal[1]);
    let best = null, bestD = dist[d.y * m.w + d.x];
    for (const [ex, ey] of Object.values(MOVES)) {
      const nx = d.x + ex, ny = d.y + ey, nd = dist[ny * m.w + nx];
      if (isFloor(m, nx, ny) && nd >= 0 && nd < bestD && !taken.has(ny * m.w + nx)) { best = [nx, ny]; bestD = nd; }
    }
    if (best) { d.x = best[0]; d.y = best[1]; }
    taken.add(d.y * m.w + d.x);
  }
}

export function fingerprint(h) {
  const parts = [h.turn, h.hare.x, h.hare.y, h.eaten, h.outcome, ...h.hounds.flatMap((d) => [d.x, d.y])];
  let x = 2166136261;
  for (const ch of parts.join(',')) x = Math.imul(x ^ ch.charCodeAt(0), 16777619) >>> 0;
  return x.toString(16);
}
