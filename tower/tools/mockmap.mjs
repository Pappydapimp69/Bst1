// Draws a mock of the proposed Opticon map as one page: rings divided by
// fences with a few crossings that cannot be walked around, solid walls that
// block the tower's line of sight, and the squares that are hidden or exposed
// for one position of the gaze. A picture for discussion, not the game's map
// generator: `node tools/mockmap.mjs [seed]` writes mock/map.html.
import { writeFileSync, mkdirSync } from 'node:fs';
import { makeStream, next } from '../../src/rng.js';

const N = 35, C = 17, S = 20;
const seed = process.argv[2] || 'v2-65';
const rng = makeStream(seed, 'map');
const pick = (n) => Math.floor(next(rng) * n);
const FLOOR = '.', FENCE = 'f', SOLID = '#', DOOR = 'D', GLASS = 'G', TOWER = 'T', YARD = 'y', LAMP = 'L', EXIT = 'E';
const ring = (x, y) => Math.max(Math.abs(x - C), Math.abs(y - C));
const t = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => {
  const d = ring(x, y);
  return d <= 2 ? TOWER : d <= 4 ? YARD : d === 8 || d === 12 ? FENCE : d === 17 ? SOLID : FLOOR;
}));
const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? SOLID : t[y][x]);

// The tiles of one ring boundary in order round the ring, corners left out so
// every crossing is a straight step through.
function boundary(d) {
  const out = [];
  for (let i = -d + 1; i < d; i++) out.push([C + i, C - d]);
  for (let i = -d + 1; i < d; i++) out.push([C + d, C + i]);
  for (let i = d - 1; i > -d; i--) out.push([C + i, C + d]);
  for (let i = d - 1; i > -d; i--) out.push([C - d, C + i]);
  return out;
}
// Each boundary gets five crossings spread round it (one open gap, two locked
// doors, two windows) and solid stretches between them that cast shadows.
const crossings = [];
for (const d of [8, 12]) {
  const b = boundary(d), kinds = [FLOOR, DOOR, GLASS, DOOR, GLASS], start = pick(b.length);
  const cross = kinds.map((k, i) => (start + Math.floor((i + 0.15 + next(rng) * 0.7) * b.length / 5)) % b.length);
  cross.forEach((where, i) => { const [x, y] = b[where]; t[y][x] = kinds[i]; });
  // Between the crossings the wall alternates solid stretches, which hide
  // what is behind them, with barred ones the tower sees through. Windows and
  // the open gap sit in solid wall, so each is a clear break in it.
  let run = 0, solid = true;
  for (let i = 0; i < b.length; i++) {
    const [x, y] = b[(start + i) % b.length];
    if (run <= 0) { solid = !solid; run = d === 8 ? (solid ? 1 + pick(2) : 4 + pick(4)) : (solid ? 3 + pick(3) : 2 + pick(3)); }
    run--;
    if (t[y][x] === FENCE && solid) t[y][x] = SOLID;
  }
  for (const where of cross) for (const o of [-1, 1]) { const [x, y] = b[(where + o + b.length) % b.length]; if (t[y][x] === FENCE) t[y][x] = SOLID; }
  crossings.push(...cross.map((where) => b[where]));
}
// Solid partition walls pointing at the tower divide each ring into cells, as
// the walls between cells do in a radial prison. Edge-on to the tower they
// hide almost nothing from it, but they stop movement round the ring except
// through one opening each: a plain gap, or sometimes a locked door.
for (const [lo, hi, cells] of [[5, 7, 4], [9, 11, 10], [13, 16, 16]]) {
  const turn = next(rng) * Math.PI * 2, gapless = pick(cells);
  for (let c = 0; c < cells; c++) {
    const a = turn + (c + (next(rng) - 0.5) * 0.35) * Math.PI * 2 / cells, ux = Math.cos(a), uy = Math.sin(a), m = Math.max(Math.abs(ux), Math.abs(uy));
    const tiles = [];
    for (let d = lo; d <= hi; d++) tiles.push([C + Math.round(ux * d / m), C + Math.round(uy * d / m)]);
    if (tiles.some(([x, y]) => crossings.some(([cx, cy]) => Math.max(Math.abs(cx - x), Math.abs(cy - y)) <= 2))) continue;
    const gap = pick(tiles.length);
    tiles.forEach(([x, y], i) => { if (t[y][x] === FLOOR) t[y][x] = i !== gap ? SOLID : c !== gapless && next(rng) < 0.3 ? DOOR : FLOOR; });
  }
}
// Inside the rings: lone solid blocks to hide behind, and lamps.
function scatter(count, place) {
  for (let tries = 0, done = 0; done < count && tries < 4000; tries++) {
    const x = 1 + pick(N - 2), y = 1 + pick(N - 2);
    if (t[y][x] === FLOOR && place(x, y)) done++;
  }
}
const free = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].every(([a, b]) => [FLOOR, FENCE].includes(at(x + a, y + b)));
scatter(9, (x, y) => free(x, y) && (t[y][x] = SOLID));
const lamps = [];
scatter(11, (x, y) => free(x, y) && lamps.every((l) => Math.hypot(l.x - x, l.y - y) > 7) && (t[y][x] = LAMP) && lamps.push({ x, y }));
const exitSide = pick(4), [ex, ey] = [[C + pick(9) - 4, 0], [N - 1, C + pick(9) - 4], [C + pick(9) - 4, N - 1], [0, C + pick(9) - 4]][exitSide];
t[ey][ex] = EXIT;
{ const inx = ex + Math.sign(C - ex) * (ex === 0 || ex === N - 1), iny = ey + Math.sign(C - ey) * (ey === 0 || ey === N - 1); t[iny][inx] = FLOOR; }
const spawn = [[C + 1, C + 6], [C - 6, C + 1], [C - 1, C - 6], [C + 6, C - 1]][exitSide];
for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (t[spawn[1] + b][spawn[0] + a] !== LAMP) t[spawn[1] + b][spawn[0] + a] = FLOOR;
const gaze = exitSide; // the tower is looking at the side the gate is on, so the way out runs through its view

// Sight: a straight line from the tower's centre, stopped by anything solid.
const blocks = (k) => k === SOLID || k === DOOR; // a lamp post is too thin to hide behind
function line(x0, y0, x1, y1) {
  const out = [], dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  while (x !== x1 || y !== y1) { const e2 = 2 * err; if (e2 > -dy) { err -= dy; x += sx; } if (e2 < dx) { err += dx; y += sy; } out.push([x, y]); }
  return out;
}
const clear = (x0, y0, x, y) => line(x0, y0, x, y).slice(0, -1).every(([a, b]) => !blocks(t[b][a]));
const inGaze = (x, y) => { const dx = x - C, dy = y - C; return [dy < 0 && Math.abs(dx) <= -dy, dx > 0 && Math.abs(dy) <= dx, dy > 0 && Math.abs(dx) <= dy, dx < 0 && Math.abs(dy) <= -dx][gaze]; };
const walk = (k) => k === FLOOR || k === EXIT;
const state = t.map((row, y) => row.map((k, x) => {
  if (!walk(k)) return '';
  const lit = lamps.some((l) => Math.max(Math.abs(l.x - x), Math.abs(l.y - y)) <= 3 && clear(l.x, l.y, x, y));
  if (!inGaze(x, y)) return lit ? 'lit' : '';
  return !clear(C, C, x, y) ? 'hidden' : lit ? 'exposed' : 'dark';
}));

// Two routes to the gate: the quiet one may use locked doors, the loud one windows.
function route(use, weight) {
  const key = (x, y) => y * N + x, dist = new Map([[key(...spawn), 0]]), from = new Map(), open = [spawn];
  while (open.length) {
    open.sort((a, b) => dist.get(key(...a)) - dist.get(key(...b)));
    const [x, y] = open.shift();
    if (x === ex && y === ey) break;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + a, Y = y + b, k = at(X, Y);
      if (!(walk(k) || k === use)) continue;
      const cost = dist.get(key(x, y)) + (k === use ? 3 : weight[state[Y][X]] ?? 1);
      if (cost < (dist.get(key(X, Y)) ?? Infinity)) { dist.set(key(X, Y), cost); from.set(key(X, Y), [x, y]); open.push([X, Y]); }
    }
  }
  const path = [];
  for (let p = [ex, ey]; p; p = from.get(key(...p))) path.unshift(p);
  return path.length > 1 ? path : [];
}
const quiet = route(DOOR, { exposed: 40, dark: 4, lit: 3 });
const loud = route(GLASS, { exposed: 2.5, dark: 1.2, lit: 1 });
const count = (p, s) => p.filter(([x, y]) => state[y][x] === s).length;
const through = (p, k) => p.filter(([x, y]) => t[y][x] === k).length;
const some = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

// How the map measures up, for choosing between seeds: how much solid wall
// there is, how much of the walkable floor the tower could ever see, and how
// much of what lies in its gaze right now is hidden.
let solidIn = 0, floorN = 0, seenN = 0, gazeN = 0, hiddenN = 0;
for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
  if (t[y][x] === SOLID) solidIn++;
  if (!walk(t[y][x])) continue;
  floorN++;
  if (clear(C, C, x, y)) seenN++;
  if (state[y][x] === 'hidden') hiddenN++;
  if (inGaze(x, y)) gazeN++;
}

// ---- Draw.
const r = (x, y, cls) => `<rect x="${x * S}" y="${y * S}" width="${S}" height="${S}" class="${cls}"/>`;
let g = '';
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const k = t[y][x], s = state[y][x];
  if (k === TOWER) { g += r(x, y, 'tower'); continue; }
  if (k === YARD) { g += r(x, y, 'yard'); continue; }
  g += r(x, y, 'floor' + (s === 'lit' || s === 'exposed' ? ' lit' : ''));
  if (s === 'hidden') g += r(x, y, 'hidden');
  if (s === 'dark') g += r(x, y, 'seen');
  if (s === 'exposed') g += r(x, y, 'exposed') + `<circle cx="${x * S + S / 2}" cy="${y * S + S / 2}" r="2.2" class="dot"/>`;
  const across = Math.abs(y - C) > Math.abs(x - C); // the boundary runs left to right here
  const bar = () => across ? `<rect x="${x * S}" y="${y * S + 8.5}" width="${S}" height="3" class="fence"/>` : `<rect x="${x * S + 8.5}" y="${y * S}" width="3" height="${S}" class="fence"/>`;
  if (k === FENCE) g += Math.abs(y - C) === Math.abs(x - C) ? `<rect x="${x * S + 8.5}" y="${y * S + 8.5}" width="3" height="3" class="fence"/><rect x="${x * S + (x > C ? 0 : 8.5)}" y="${y * S + 8.5}" width="11.5" height="3" class="fence"/><rect x="${x * S + 8.5}" y="${y * S + (y > C ? 0 : 8.5)}" width="3" height="11.5" class="fence"/>` : bar();
  if (k === SOLID) g += `<rect x="${x * S + 1}" y="${y * S + 1}" width="${S - 2}" height="${S - 2}" rx="2" class="solid"/>`;
  if (k === DOOR) g += bar() + `<rect x="${x * S + 3}" y="${y * S + 3}" width="${S - 6}" height="${S - 6}" rx="2" class="door"/><circle cx="${x * S + S / 2}" cy="${y * S + S / 2}" r="2.4" class="keyhole"/>`;
  if (k === GLASS) g += bar() + `<rect x="${x * S + 3}" y="${y * S + 3}" width="${S - 6}" height="${S - 6}" rx="1" class="glass"/><path d="M${x * S + 5} ${y * S + S - 5} L${x * S + S - 5} ${y * S + 5}" class="pane"/>`;
  if (k === LAMP) g += `<circle cx="${x * S + S / 2}" cy="${y * S + S / 2}" r="5" class="lamp"/>`;
  if (k === EXIT) g += r(x, y, 'exit') + `<text x="${x * S + S / 2}" y="${y * S + S / 2 + 4.5}" class="glyph">G</text>`;
}
const edge = 17.5 * S, cx = C * S + S / 2, corners = [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]][gaze];
const wedge = `<path d="M${cx} ${cx} L${cx + corners[0] * edge} ${cx + corners[1] * edge} M${cx} ${cx} L${cx + corners[2] * edge} ${cx + corners[3] * edge}" class="wedge"/>`;
const pts = (p) => p.map(([x, y]) => `${x * S + S / 2},${y * S + S / 2}`).join(' ');
const eye = `<circle cx="${cx}" cy="${cx}" r="16" class="eyeball"/><circle cx="${cx + [0, 6, 0, -6][gaze]}" cy="${cx + [-6, 0, 6, 0][gaze]}" r="6" class="pupil"/>`;
const me = `<circle cx="${spawn[0] * S + S / 2}" cy="${spawn[1] * S + S / 2}" r="6.5" class="me"/>`;
const svg = `<svg viewBox="0 0 ${N * S} ${N * S}" role="img" aria-label="Mock map: a tower in the middle, three rings of floor divided by two fences, and a gate on the outer wall">
<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="hatchbg"/><rect width="2.2" height="6" class="hatchline"/></pattern></defs>
${g}${wedge}<polyline points="${pts(quiet)}" class="path quiet"/><polyline points="${pts(loud)}" class="path loud"/>${eye}${me}</svg>`;

const sw = (inner) => `<svg viewBox="0 0 20 20" aria-hidden="true"><defs><pattern id="hatchk" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="hatchbg"/><rect width="2.2" height="6" class="hatchline"/></pattern></defs>${inner}</svg>`;
const legend = [
  [sw(`<rect width="20" height="20" class="floor"/><rect x="0" y="8.5" width="20" height="3" class="fence"/>`), 'Fence', 'Stops you, not the gaze. Divides the rings.'],
  [sw(`<rect width="20" height="20" class="floor"/><rect x="1" y="1" width="18" height="18" rx="2" class="solid"/>`), 'Solid wall', 'Stops you and the gaze. Casts a shadow away from the tower.'],
  [sw(`<rect width="20" height="20" class="floor"/><rect width="20" height="20" fill="url(#hatchk)"/>`), 'Hidden', 'Inside the gaze but behind something solid. Safe, lit or not.'],
  [sw(`<rect width="20" height="20" class="floor lit"/><rect width="20" height="20" class="exposed"/><circle cx="10" cy="10" r="2.2" class="dot"/>`), 'Exposed', 'In the gaze, in the open and lit. Caught on the scan.'],
  [sw(`<rect width="20" height="20" class="floor"/><rect width="20" height="20" class="seen"/>`), 'In view, dark', 'The gaze reaches it, but only noise gives you away.'],
  [sw(`<rect width="20" height="20" class="floor"/><rect x="3" y="3" width="14" height="14" rx="2" class="door"/><circle cx="10" cy="10" r="2.4" class="keyhole"/>`), 'Locked door', 'Needs a pick. Silent, and blocks the gaze while shut.'],
  [sw(`<rect width="20" height="20" class="floor"/><rect x="3" y="3" width="14" height="14" rx="1" class="glass"/><path d="M5 15 L15 5" class="pane"/>`), 'Window', 'Break it to cross. Loud, and the gaze passes through.'],
  [sw(`<rect width="20" height="20" class="floor lit"/><circle cx="10" cy="10" r="5" class="lamp"/>`), 'Lamp', 'Lights the squares around it that it can see.'],
];
const html = `<title>Opticon Mock Map</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
  /* One night plan of the prison, centred, with its key underneath. A single dark look by choice: the map is a night scene. */
  :root { --night: #0e131f; --panel: #161d2e; --floor: #1d2740; --floorlit: #4a4226; --line: #33405f; --ink: #e8e4d6; --dim: #9aa5bf;
    --stone: #c9c2ae; --fence: #6f7fa6; --door: #d9962f; --glass: #6fd0e0; --lamp: #ffd35a; --eye: #e5533c; --quiet: #86e0b4; --loud: #6fd0e0;
    --display: "Space Grotesk", system-ui, sans-serif; --body: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; color-scheme: dark; }
  body { background: var(--night); color: var(--ink); font: 15px/1.5 var(--body); padding-block: 20px 32px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  main { max-width: 46rem; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
  h1 { margin: 0; font: 600 26px/1.15 var(--display); text-wrap: balance; }
  p { margin: 0; color: var(--dim); max-width: 65ch; text-wrap: pretty; }
  p b { color: var(--ink); font-weight: 600; }
  .map { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 8px; }
  .map svg { display: block; width: 100%; height: auto; }
  .floor { fill: var(--floor); stroke: var(--night); stroke-width: .6; } .floor.lit { fill: var(--floorlit); }
  .tower { fill: #2b3654; } .yard { fill: #121829; }
  .hatchbg { fill: #0b0f19; } .hatchline { fill: #4d5d86; } .hidden { fill: url(#hatch); opacity: .92; }
  .seen { fill: var(--eye); opacity: .13; } .exposed { fill: var(--eye); opacity: .5; } .dot { fill: #fff; }
  .fence { fill: var(--fence); } .solid { fill: var(--stone); } .door { fill: var(--door); } .keyhole { fill: #2a1c05; }
  .glass { fill: var(--glass); fill-opacity: .35; stroke: var(--glass); stroke-width: 1.5; } .pane { stroke: #fff; stroke-width: 1.2; fill: none; }
  .lamp { fill: var(--lamp); } .exit { fill: var(--quiet); } .glyph { font: 700 13px var(--display); fill: #062015; text-anchor: middle; }
  .wedge { fill: none; stroke: var(--eye); stroke-width: 2; stroke-dasharray: 2 6; stroke-linecap: round; }
  .eyeball { fill: var(--ink); } .pupil { fill: var(--eye); } .me { fill: #fff; stroke: var(--night); stroke-width: 2; }
  .path { fill: none; stroke-width: 3.2; stroke-linejoin: round; stroke-linecap: round; } .path.quiet { stroke: var(--quiet); } .path.loud { stroke: var(--loud); stroke-dasharray: 1 7; stroke-width: 4; }
  .routes { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 12px; }
  .routes div { border-left: 4px solid var(--quiet); padding-left: 12px; } .routes div.l { border-left-style: dotted; border-color: var(--loud); }
  .routes h2, .key h2 { margin: 0 0 2px; font: 600 15px var(--display); color: var(--ink); }
  .key { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 10px 20px; margin: 0; padding: 0; list-style: none; }
  .key li { display: grid; grid-template-columns: 28px 1fr; gap: 10px; align-items: start; min-width: 0; }
  .key svg { width: 28px; height: 28px; border-radius: 4px; }
  .key span { color: var(--dim); display: block; font-size: 14px; }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Space+Grotesk:wght@600;700&display=swap">
<main>
  <h1>Opticon mock map</h1>
  <p>The tower's eye is looking ${['north', 'east', 'south', 'west'][gaze]}, between the dotted red lines. You are the white dot in the inner ring, and the gate, marked G, is on the outer wall. <b>Each ring wall can only be crossed at five places:</b> one open gap, two locked doors and two windows. Solid walls pointing at the tower divide every ring into cells.</p>
  <div class="map">${svg}</div>
  <div class="routes">
    <div><h2>Quiet route, solid line</h2><p>${quiet.length - 1} steps through ${some(through(quiet, DOOR), 'locked door')}, crossing ${some(count(quiet, 'exposed'), 'exposed square')}. Needs picks.</p></div>
    <div class="l"><h2>Loud route, dotted line</h2><p>${loud.length - 1} steps through ${some(through(loud, GLASS), 'broken window')}, crossing ${some(count(loud, 'exposed'), 'exposed square')}. Every break is heard.</p></div>
  </div>
  <ul class="key">${legend.map(([s, name, text]) => `<li>${s}<div><h2>${name}</h2><span>${text}</span></div></li>`).join('')}</ul>
  <p>This map has ${solidIn} solid wall squares inside the outer wall. From the tower, ${Math.round(seenN / floorN * 100)}% of the floor can be seen at some point in its sweep, and ${Math.round(hiddenN / gazeN * 100)}% of what is in its gaze right now is hidden.</p>
  <p>A mock for discussion, drawn by a script from the proposed rules. It is not in the game yet.</p>
</main>
`;
mkdirSync(new URL('../mock/', import.meta.url), { recursive: true });
writeFileSync(new URL('../mock/map.html', import.meta.url), html);
console.log(JSON.stringify({ seed, solid: solidIn, towerSees: +(seenN / floorN).toFixed(2), hiddenInGaze: +(hiddenN / gazeN).toFixed(2), quiet: quiet.length - 1, qExposed: count(quiet, 'exposed'), qDoors: through(quiet, DOOR), loud: loud.length - 1, lExposed: count(loud, 'exposed'), lWindows: through(loud, GLASS) }));
