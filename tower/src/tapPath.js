// tapPath.js — turn a tapped square or a drawn line into a staged path.
// Pure logic over the game state, so it runs in Node tests. A path is the same
// shape main.js already stages from the keys: [{x, y, dir}] from the prisoner.
import { DIR_VEC } from "./map.js";
import { isWalkable } from "./rules.js";

const key = (x, y) => x + "," + y;

// Every square the prisoner can walk to with `mp` steps, each with the
// shortest path to it. Looks no further than the steps available, so a tap
// never reveals anything about the map beyond one turn's reach.
export function reachable(game, from, mp) {
  const found = new Map([[key(from.x, from.y), []]]);
  let edge = [{ x: from.x, y: from.y, path: [] }];
  for (let step = 0; step < mp; step++) {
    const next = [];
    for (const at of edge) {
      for (let dir = 0; dir < 4; dir++) {
        const x = at.x + DIR_VEC[dir].dx, y = at.y + DIR_VEC[dir].dy;
        if (found.has(key(x, y)) || !isWalkable(game, x, y)) continue;
        const path = [...at.path, { x, y, dir }];
        found.set(key(x, y), path);
        next.push({ x, y, path });
      }
    }
    edge = next;
  }
  return found;
}

// A tap: the path to the tapped square, or, when it is out of reach, to the
// reachable square nearest to it (the shorter walk on a tie).
export function pathToward(game, from, target, mp) {
  const found = reachable(game, from, mp);
  const direct = found.get(key(target.x, target.y));
  if (direct) return direct;
  let best = [], bestD = Math.hypot(target.x - from.x, target.y - from.y);
  for (const path of found.values()) {
    if (!path.length) continue;
    const tip = path[path.length - 1];
    const d = Math.hypot(target.x - tip.x, target.y - tip.y);
    if (d < bestD - 1e-9) { best = path; bestD = d; }
  }
  return best;
}

// A drag: the finger has moved onto `tile`. Stepping back onto the square
// before the tip undoes a step, a neighbouring square adds one, and a square
// further off (a fast finger skips squares) is joined by the shortest walk the
// remaining steps allow. Returns the new path, or the old one if nothing fits.
export function extendByDrag(game, from, path, tile, mp) {
  const tip = path.length ? path[path.length - 1] : from;
  if (tile.x === tip.x && tile.y === tip.y) return path;
  const back = path.length > 1 ? path[path.length - 2] : from;
  if (path.length && tile.x === back.x && tile.y === back.y) return path.slice(0, -1);
  const at = path.findIndex((s) => s.x === tile.x && s.y === tile.y);
  if (at >= 0) return path.slice(0, at + 1);
  if (tile.x === from.x && tile.y === from.y) return [];
  const more = reachable(game, tip, mp - path.length).get(key(tile.x, tile.y));
  if (!more) return path;
  return [...path, ...more];
}
