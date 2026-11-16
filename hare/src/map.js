// Hedgerow maps, built the way Bob Nystrom's "Rooms and Mazes" (2014) builds
// dungeons: odd-aligned rooms (here, fields), a maze of lanes carved through
// the rest, then one gap opened per pair of regions as a spanning tree, with a
// chance to reopen each gap the tree did not need. That chance, LOOP, is what
// sets how many alternative routes the hare has. Dead-end lanes are filled in.
import { makeStream, next } from '../../src/rng.js';

export const W = 33, H = 23;
export const WALL = 0, FLOOR = 1;

export function makeMap(seed, { loop = 0.12, attempts = 60 } = {}) {
  const r = makeStream(seed, 'map');
  const int = (n) => Math.floor(next(r) * n);
  const grid = new Uint8Array(W * H);          // all hedge
  const region = new Int32Array(W * H).fill(-1);
  let regions = 0;
  const rooms = [];
  const at = (x, y) => y * W + x;
  const inside = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1;
  const carve = (x, y, id) => { grid[at(x, y)] = FLOOR; region[at(x, y)] = id; };

  for (let i = 0; i < attempts; i++) {
    const w = 3 + 2 * int(3), h = 3 + 2 * int(2);
    const x = 1 + 2 * int((W - w - 1) / 2), y = 1 + 2 * int((H - h - 1) / 2);
    if (rooms.some((o) => x < o.x + o.w + 1 && o.x < x + w + 1 && y < o.y + o.h + 1 && o.y < y + h + 1)) continue;
    const id = regions++;
    rooms.push({ x, y, w, h, id });
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) carve(xx, yy, id);
  }

  // A growing-tree maze from every untouched odd cell, each its own region.
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) {
    if (grid[at(x, y)] !== WALL) continue;
    const id = regions++;
    carve(x, y, id);
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const open = dirs.filter(([dx, dy]) => inside(cx + 2 * dx, cy + 2 * dy) && grid[at(cx + 2 * dx, cy + 2 * dy)] === WALL);
      if (!open.length) { stack.pop(); continue; }
      const [dx, dy] = open[int(open.length)];
      carve(cx + dx, cy + dy, id); carve(cx + 2 * dx, cy + 2 * dy, id);
      stack.push([cx + 2 * dx, cy + 2 * dy]);
    }
  }

  // Connectors: a hedge tile between two different regions.
  const connectors = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (grid[at(x, y)] !== WALL) continue;
    const near = new Set();
    for (const [dx, dy] of dirs) { const g = region[at(x + dx, y + dy)]; if (g >= 0) near.add(g); }
    if (near.size >= 2) connectors.push({ x, y, regions: [...near] });
  }

  // Spanning tree from a random field; spare connectors reopen with chance LOOP.
  const merged = Array.from({ length: regions }, (_, i) => i);
  const root = (i) => { while (merged[i] !== i) i = merged[i] = merged[merged[i]]; return i; };
  let main = rooms.length ? rooms[int(rooms.length)].id : 0;
  let left = connectors.slice(), opened = 0, extra = 0;
  while (left.length) {
    const touching = left.filter((c) => c.regions.some((g) => root(g) === root(main)));
    if (!touching.length) break;
    const c = touching[int(touching.length)];
    carve(c.x, c.y, root(main)); opened++;
    for (const g of c.regions) merged[root(g)] = root(main);
    main = root(main);
    left = left.filter((o) => {
      if (o === c) return false;
      if (o.regions.every((g) => root(g) === main)) {     // would make a loop
        if (next(r) < loop) { carve(o.x, o.y, main); extra++; }
        return false;
      }
      return true;
    });
  }

  // Fill dead-end lanes back in until none are left (fields keep their corners).
  for (let changed = true; changed;) {
    changed = false;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (grid[at(x, y)] !== FLOOR) continue;
      let exits = 0;
      for (const [dx, dy] of dirs) if (grid[at(x + dx, y + dy)] === FLOOR) exits++;
      if (exits <= 1) { grid[at(x, y)] = WALL; changed = true; }
    }
  }
  return { w: W, h: H, grid, rooms, opened, extra, loop };
}

export const isFloor = (m, x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.grid[y * m.w + x] === FLOOR;

export function floorTiles(m) {
  const out = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (isFloor(m, x, y)) out.push([x, y]);
  return out;
}

// Breadth-first distances over floor from (x, y); -1 where unreachable.
export function distances(m, x, y, blocked) {
  const d = new Int32Array(m.w * m.h).fill(-1);
  const q = [y * m.w + x]; d[q[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], cx = c % m.w, cy = (c - cx) / m.w;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cx + dx, ny = cy + dy, n = ny * m.w + nx;
      if (isFloor(m, nx, ny) && d[n] < 0 && !(blocked && blocked(nx, ny))) { d[n] = d[c] + 1; q.push(n); }
    }
  }
  return d;
}

// Chokepoints: floor tiles whose loss cuts the map in two. A map with
// alternative routes has few; a pure tree of lanes is almost all chokepoints.
export function chokepoints(m) {
  const tiles = floorTiles(m);
  const [sx, sy] = tiles[0];
  let cuts = 0;
  for (const [x, y] of tiles) {
    const start = x === sx && y === sy ? tiles[1] : tiles[0];
    const d = distances(m, start[0], start[1], (bx, by) => bx === x && by === y);
    let reached = 0;
    d.forEach((v) => { if (v >= 0) reached++; });
    if (reached < tiles.length - 1) cuts++;
  }
  return cuts / tiles.length;
}
