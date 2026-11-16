// Draws Bentham's own Panopticon as a top-down plan for Opticon's map, to his
// Letter III dimensions (1787), with a faint grid of 3-foot squares to show
// how it sits on the game's board: `node tools/benthammap.mjs` writes mock/map.html.
import { writeFileSync, mkdirSync } from 'node:fs';

// Feet, from Bentham's Letter III: 100 ft across, lodge 35 ft across, area 14 ft
// wide, 48 cells 13 ft deep with a grating facing the lodge, partitions carried
// a few feet past the grating. The outer wall takes what is left of the radius.
const R = 50, LODGE = 17.5, GRATE = LODGE + 14, CELLS = 48, BACK = GRATE + 13, PAST = 3;
const YARD = 64, SQ = 3, PX = 7;
const PASSAGE = 180, PLAYER = 292.5, GATE = 0, LOOK = 270; // compass degrees
const pt = (r, a) => [r * Math.sin(a * Math.PI / 180), -r * Math.cos(a * Math.PI / 180)];
const P = (r, a) => pt(r, a).map((v) => (v * PX).toFixed(1)).join(' ');
const arc = (r, a0, a1) => `M${P(r, a0)} A${r * PX} ${r * PX} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${P(r, a1)}`;
const wedge = (r0, r1, a0, a1) => `M${P(r0, a0)} L${P(r1, a0)} A${r1 * PX} ${r1 * PX} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${P(r1, a1)} L${P(r0, a1)} A${r0 * PX} ${r0 * PX} 0 ${a1 - a0 > 180 ? 1 : 0} 0 ${P(r0, a0)} Z`;
const W = 360 / CELLS;
const cellAt = (a) => Math.floor(((a % 360) + 360) % 360 / W);
const passageCell = cellAt(PASSAGE), playerCell = cellAt(PLAYER);
const mid = (c) => (c + 0.5) * W;

let g = '';
// The yard and its wall are the game's, so the way out has somewhere to go.
g += `<circle r="${YARD * PX}" class="yard"/>`;
g += `<path d="${arc(YARD, GATE + 4, GATE + 356)}" class="yardwall"/>`;
g += `<path d="${arc(YARD, GATE - 4, GATE + 4)}" class="gate"/>`;
// The building: floor of the cells and the area, the gaze's quarter over them.
g += `<circle r="${R * PX}" class="outer"/><circle r="${BACK * PX}" class="floor"/>`;
g += `<path d="${wedge(LODGE, BACK, LOOK - 45, LOOK + 45)}" class="seen"/>`;
// Cells: grating toward the lodge, a window in the outer wall, partitions as radii.
for (let c = 0; c < CELLS; c++) {
  const a0 = c * W, a1 = a0 + W, m = mid(c);
  if (c === passageCell) {
    g += `<path d="${wedge(BACK, R, a0 + 0.6, a1 - 0.6)}" class="floor"/>`;
    g += `<path d="${wedge(R - 1.2, R, a0 + 1.2, a1 - 1.2)}" class="door"/>`;
    continue;
  }
  g += `<path d="${arc(GRATE, a0, a1)}" class="grate"/>`;
  g += `<path d="${arc(GRATE, m - 1.3, m + 1.3)}" class="cellgate"/>`;
  g += `<path d="${arc(R - 2.5, m - 1.6, m + 1.6)}" class="window"/>`;
  if (c === playerCell) g += `<path d="${wedge(GRATE, BACK, a0 + 0.4, a1 - 0.4)}" class="mine"/>`;
}
for (let c = 0; c < CELLS; c++) {
  const a = c * W;
  g += `<path d="M${P(GRATE - PAST, a)} L${P(BACK, a)}" class="partition"/>`;
}
// The lodge: blinds all round, two crossing walls making quarters, lamps outside its windows.
g += `<circle r="${LODGE * PX}" class="lodge"/>`;
g += `<path d="${wedge(1.5, LODGE - 0.6, LOOK - 45, LOOK + 45)}" class="lit-quarter"/>`;
for (const a of [45, 135]) g += `<path d="M${P(LODGE, a)} L${P(LODGE, a + 180)}" class="quarterwall"/>`;
g += `<circle r="${LODGE * PX}" class="blinds"/>`;
for (let i = 0; i < 8; i++) { const [x, y] = pt(LODGE + 1.6, i * 45 + 22.5); g += `<circle cx="${x * PX}" cy="${y * PX}" r="5" class="lamp"/>`; }
{ const [x, y] = pt(LODGE * 0.55, LOOK); g += `<circle cx="${x * PX}" cy="${y * PX}" r="9" class="eye"/><circle cx="${x * PX + Math.sin(LOOK * Math.PI / 180) * 3}" cy="${y * PX}" r="4" class="pupil"/>`; }
// Two ways out of the prisoner's cell.
const quiet = [[(GRATE + BACK) / 2, mid(playerCell)], [GRATE, mid(playerCell)], [GRATE - 5, mid(playerCell)]];
for (let a = mid(playerCell); a > PASSAGE + 1; a -= 3) quiet.push([GRATE - 5, a]);
quiet.push([GRATE - 5, mid(passageCell)], [R + 1, mid(passageCell)]);
for (let a = mid(passageCell); a > GATE + 6; a -= 4) quiet.push([R + 6, a]);
quiet.push([R + 6, GATE + 4], [YARD, GATE]);
const loud = [[(GRATE + BACK) / 2, mid(playerCell)], [R + 1, mid(playerCell)], [R + 6, mid(playerCell) + 6]];
for (let a = mid(playerCell) + 6; a < 356; a += 4) loud.push([R + 6, a]);
loud.push([R + 6, 357], [YARD, GATE]);
const line = (pts) => pts.map(([r, a]) => P(r, a)).join(' ');
g += `<polyline points="${line(quiet)}" class="route quiet"/><polyline points="${line(loud)}" class="route loud"/>`;
{ const [x, y] = pt((GRATE + BACK) / 2, mid(playerCell)); g += `<circle cx="${x * PX}" cy="${y * PX}" r="7" class="me"/>`; }
// The board: 3-foot squares, faint, over everything.
g += `<g class="grid">`;
for (let v = -YARD; v <= YARD; v += SQ) g += `<path d="M${v * PX} ${-YARD * PX} V${YARD * PX} M${-YARD * PX} ${v * PX} H${YARD * PX}"/>`;
g += `</g>`;
const label = (r, a, text, cls = '') => { const [x, y] = pt(r, a); return `<text x="${(x * PX).toFixed(0)}" y="${(y * PX).toFixed(0)}" class="label ${cls}">${text}</text>`; };
g += label(LODGE * 0.55, 90, 'LODGE') + label(GRATE - 7, 45, 'AREA') + label(YARD - 4, 140, 'YARD') + label(R + 4, 196, 'PASSAGE', 'small');

const vb = YARD * PX + 4;
const svg = `<svg viewBox="${-vb} ${-vb} ${vb * 2} ${vb * 2}" role="img" aria-label="Plan of Bentham's Panopticon: a central lodge in quarters, an open ring of floor, and a ring of 48 cells with barred fronts and outer windows, inside a walled yard">${g}</svg>`;

const sw = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" class="floor"/>${inner}</svg>`;
const key = [
  [sw(`<rect width="24" height="24" class="lodge"/><path d="M2 2 L22 22 M22 2 L2 22" class="quarterwall"/>`), 'Lodge', 'The inspector sits in one of four quarters, behind blinds, so you never know which.'],
  [sw(`<rect width="24" height="24" class="seen"/>`), 'The quarter in view', 'Everything here is seen, cell and area alike. There is no cover in it.'],
  [sw(`<path d="M0 12 H24" class="grate"/><path d="M8 12 H16" class="cellgate"/>`), 'Grating and cell gate', 'Bars face the lodge and hide nothing. The gate is locked: a pick opens it quietly.'],
  [sw(`<path d="M12 0 V24" class="partition"/>`), 'Partition', 'Solid, between cells, a few feet past the bars, so prisoners never see each other.'],
  [sw(`<path d="M2 12 H22" class="window"/>`), 'Window', 'In the outer wall, lighting you from behind. Break it and you are out, loudly.'],
  [sw(`<rect x="4" y="6" width="16" height="12" class="door"/>`), 'Passage', 'The one way in or out, a cell wide, from the yard to the area.'],
];
const html = `<title>Opticon Mock Map</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
  /* One plan, centred, with its key beneath: a night drawing of the building. Single dark look by choice. */
  :root { --night: #0e131f; --panel: #161d2e; --yard: #141a28; --floor: #1f2943; --line: #33405f; --ink: #e8e4d6; --dim: #9aa5bf;
    --stone: #b6af9a; --bars: #8fa0c8; --glass: #6fd0e0; --lamp: #ffd35a; --eye: #e5533c; --quiet: #86e0b4; --door: #d9962f;
    --display: "Space Grotesk", system-ui, sans-serif; --body: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; color-scheme: dark; }
  body { background: var(--night); color: var(--ink); font: 15px/1.5 var(--body); padding-block: 20px 32px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  main { max-width: 46rem; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
  h1 { margin: 0; font: 600 26px/1.15 var(--display); text-wrap: balance; }
  p { margin: 0; color: var(--dim); max-width: 65ch; text-wrap: pretty; } p b { color: var(--ink); font-weight: 600; }
  .map { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 8px; }
  .map svg { display: block; width: 100%; height: auto; }
  .yard { fill: var(--yard); } .yardwall { fill: none; stroke: var(--stone); stroke-width: 10; } .gate { fill: none; stroke: var(--quiet); stroke-width: 10; }
  .outer { fill: var(--stone); } .floor { fill: var(--floor); } .mine { fill: #2d3a5e; }
  .seen { fill: var(--eye); opacity: .22; }
  .grate { fill: none; stroke: var(--bars); stroke-width: 3; stroke-dasharray: 2 3; } .cellgate { fill: none; stroke: var(--door); stroke-width: 5; }
  .window { fill: none; stroke: var(--glass); stroke-width: 6; } .partition { stroke: var(--stone); stroke-width: 5; }
  .door { fill: var(--door); }
  .lodge { fill: #2b3654; } .lit-quarter { fill: #3a4670; } .quarterwall { stroke: var(--stone); stroke-width: 5; }
  .blinds { fill: none; stroke: var(--ink); stroke-width: 3; stroke-dasharray: 1 5; }
  .lamp { fill: var(--lamp); } .eye { fill: var(--ink); } .pupil { fill: var(--eye); } .me { fill: #fff; stroke: var(--night); stroke-width: 2.5; }
  .route { fill: none; stroke-width: 4; stroke-linejoin: round; stroke-linecap: round; } .route.quiet { stroke: var(--quiet); } .route.loud { stroke: var(--glass); stroke-dasharray: 1 9; stroke-width: 5; }
  .grid path { stroke: #ffffff; stroke-opacity: .05; stroke-width: 1; fill: none; }
  .label { font: 700 15px var(--display); fill: var(--dim); letter-spacing: .12em; text-anchor: middle; dominant-baseline: middle; } .label.small { font-size: 11px; }
  .routes, .key { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 12px 20px; margin: 0; padding: 0; list-style: none; }
  .routes div { border-left: 4px solid var(--quiet); padding-left: 12px; } .routes div.l { border-left-style: dotted; border-color: var(--glass); }
  .routes h2, .key h2 { margin: 0 0 2px; font: 600 15px var(--display); color: var(--ink); }
  .key li { display: grid; grid-template-columns: 28px 1fr; gap: 10px; align-items: start; min-width: 0; }
  .key svg { width: 28px; height: 28px; border-radius: 4px; } .key span { color: var(--dim); display: block; font-size: 14px; }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Space+Grotesk:wght@600;700&display=swap">
<main>
  <h1>Opticon mock map</h1>
  <p>Bentham's own Panopticon, drawn to the sizes in his 1787 letters: a round building ${R * 2} feet across, an inspector's lodge ${LODGE * 2} feet across in the middle, an open ring of floor ${GRATE - LODGE} feet wide, and one ring of ${CELLS} cells, each ${BACK - GRATE} feet deep. The faint squares are the game's board, three feet to a square. <b>The inspector is in the west quarter tonight</b>, shaded red. You are the white dot, in your cell.</p>
  <div class="map">${svg}</div>
  <div class="routes">
    <div><h2>Quiet way, solid line</h2><p>Pick your cell gate, cross the open area round to the passage, and walk out into the yard. Silent, but the area is always in view of whichever quarter the inspector is in.</p></div>
    <div class="l"><h2>Loud way, dotted line</h2><p>Break your window and drop into the yard. Short, and nothing inside sees you go, but the whole building hears the glass.</p></div>
  </div>
  <ul class="key">${key.map(([s, n, t]) => `<li>${s}<div><h2>${n}</h2><span>${t}</span></div></li>`).join('')}</ul>
  <p>Bentham's: the round plan, the lodge in quarters with blinds and lamps outside its windows, the area, the barred cells with outer windows, the partitions, the single passage. The game's: the yard, its wall and gate, and the routes. He also drew a second storey of cells reached by a gallery, left out here.</p>
</main>
`;
mkdirSync(new URL('../mock/', import.meta.url), { recursive: true });
writeFileSync(new URL('../mock/map.html', import.meta.url), html);
console.log('wrote mock/map.html');
