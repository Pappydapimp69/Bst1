// What a hound can see, by Albert Ford's symmetric shadowcasting
// (albertford.com/shadowcasting): a floor tile is visible only when its centre
// lies inside the swept slopes, which makes sight between floor tiles
// symmetric. If a hound can see the hare, the hare can see that hound, so the
// danger the page draws is exactly the danger there is. Slopes are kept as
// integer fractions so no rounding can break the symmetry.
import { isFloor } from './map.js';

const QUADS = [
  (ox, oy, row, col) => [ox + col, oy - row],
  (ox, oy, row, col) => [ox + row, oy + col],
  (ox, oy, row, col) => [ox + col, oy + row],
  (ox, oy, row, col) => [ox - row, oy + col],
];

// Every tile seen from (ox, oy) within `radius`, as a Set of y * w + x.
export function fov(m, ox, oy, radius = Infinity) {
  const seen = new Set([oy * m.w + ox]);
  const r2 = radius * radius;
  const maxDepth = Math.min(Math.max(m.w, m.h), radius);
  for (const tf of QUADS) {
    const wall = (row, col) => { const [x, y] = tf(ox, oy, row, col); return !isFloor(m, x, y); };
    const reveal = (row, col) => {
      const [x, y] = tf(ox, oy, row, col);
      if (x >= 0 && y >= 0 && x < m.w && y < m.h && row * row + col * col <= r2) seen.add(y * m.w + x);
    };
    // slopes as [numerator, denominator], denominator > 0
    const scan = (depth, sn, sd, en, ed) => {
      if (depth > maxDepth) return;
      const minCol = Math.floor((2 * depth * sn + sd) / (2 * sd));
      const maxCol = Math.ceil((2 * depth * en - ed) / (2 * ed));
      let prev = null;                                     // null, 'wall' or 'floor'
      for (let col = minCol; col <= maxCol; col++) {
        const isWall = wall(depth, col);
        const symmetric = col * sd >= depth * sn && col * ed <= depth * en;
        if (isWall || symmetric) reveal(depth, col);
        if (prev === 'wall' && !isWall) { sn = 2 * col - 1; sd = 2 * depth; }
        if (prev === 'floor' && isWall) scan(depth + 1, sn, sd, 2 * col - 1, 2 * depth);
        prev = isWall ? 'wall' : 'floor';
      }
      if (prev === 'floor') scan(depth + 1, sn, sd, en, ed);
    };
    scan(1, -1, 1, 1, 1);
  }
  return seen;
}

// The usual shortcut, for comparison only: a Bresenham line from eye to tile,
// blocked by any hedge strictly between. It is not symmetric.
export function lineOfSight(m, x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  while (!(x === x1 && y === y1)) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    if ((x !== x1 || y !== y1) && !isFloor(m, x, y)) return false;
  }
  return true;
}
