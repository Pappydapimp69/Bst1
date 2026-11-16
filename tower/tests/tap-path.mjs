// tap-path.mjs — tap a square or draw a line to plan the prisoner's move.
// First the path logic in Node, then the real page: a mouse tap, a second tap
// to go, a drawn line, a touch tap that must count once, and a drag that
// starts off the prisoner, which must still turn the camera and plan nothing.
// Run: node tests/tap-path.mjs
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium, chromiumPath } from "./browser.mjs";
import { generateMap, MAP_DEFAULTS } from "../src/map.js";
import { createGame } from "../src/rules.js";
import { reachable, pathToward, extendByDrag } from "../src/tapPath.js";

let ok = true;
function check(cond, label) {
  console.log(cond ? `  ✓ ${label}` : `  ✗ ${label}`);
  if (!cond) ok = false;
}

// ---- Logic: a clearing with one wall in it.
{
  const map = generateMap(7, { ...MAP_DEFAULTS, prisonerCount: 1 });
  const g = createGame(map, { prisoners: map.spawns });
  const p = g.prisoners[0];
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { g.map.tiles[p.y + dy][p.x + dx] = 0; g.map.objects[p.y + dy][p.x + dx] = 0; }
  g.map.tiles[p.y][p.x + 1] = 1; // a wall directly east
  const at = (dx, dy) => ({ x: p.x + dx, y: p.y + dy });
  const steps = (pa) => pa.map((s) => `${s.x - p.x},${s.y - p.y}`).join(" ");
  const reach = reachable(g, p, 3);
  check(reach.has(`${p.x},${p.y - 3}`) && !reach.has(`${p.x},${p.y - 4}`) && !reach.has(`${p.x + 1},${p.y}`), "reach is three steps and never includes a wall");
  check(pathToward(g, p, at(0, -2), 3).length === 2, "a tap two squares away plans two steps");
  const round = pathToward(g, p, at(2, 0), 3);
  check(round.length === 3 && !round.some((s) => s.x === p.x + 1 && s.y === p.y) && Math.abs(round[2].x - (p.x + 2)) + Math.abs(round[2].y - p.y) === 1, "a square behind a wall is walked round, not through, as far as the steps go");
  const far = pathToward(g, p, at(0, -4), 3);
  check(far.length === 3 && steps(far) === "0,-1 0,-2 0,-3", "a tap out of reach plans the full walk toward it");
  check(pathToward(g, p, at(1, 0), 3).length === 0, "a tap on a wall beside you plans nothing nearer than where you stand");
  check(far.every((s, i) => { const prev = i ? far[i - 1] : p; return Math.abs(s.x - prev.x) + Math.abs(s.y - prev.y) === 1; }), "every planned step is to a neighbouring square");
  let d = extendByDrag(g, p, [], at(0, 1), 3);
  d = extendByDrag(g, p, d, at(-1, 1), 3);
  check(steps(d) === "0,1 -1,1", "a drawn line is kept square by square");
  check(steps(extendByDrag(g, p, d, at(0, 1), 3)) === "0,1", "drawing back over the last square undoes it");
  check(steps(extendByDrag(g, p, d, at(-1, 2), 3)) === "0,1 -1,1 -1,2" && extendByDrag(g, p, extendByDrag(g, p, d, at(-1, 2), 3), at(-1, 3), 3).length === 3, "the line stops at the steps you have");
  check(steps(extendByDrag(g, p, [], at(-1, -1), 3)).split(" ").length === 2, "a fast finger that skips a square is joined up");
  check(extendByDrag(g, p, d, p, 3).length === 0, "drawing back onto the prisoner clears the plan");
}

// ---- The real page.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("nf"); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ executablePath: chromiumPath, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"] });

async function boot(options) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`, { waitUntil: "networkidle" });
  // Through the intro and the menu the way a player goes: hold, pick, hold.
  await page.waitForTimeout(500);
  await page.keyboard.down("Space"); await page.waitForTimeout(800); await page.keyboard.up("Space");
  await page.waitForTimeout(300);
  await page.click('[data-diff="medium"]');
  await page.click("#playPrisoner");
  await page.hover("#btnStart");
  await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
  await page.waitForFunction(() => window.__opticon?.game, null, { timeout: 15000 });
  await page.evaluate(() => window.__opticon.renderer.skipIntro());
  await page.waitForFunction(() => window.__opticon.game && !window.__opticon.cutsceneActive);
  await page.evaluate(() => {
    const app = window.__opticon, g = app.game, p = g.prisoners[0];
    g.turn = "Prisoner"; g.activePrisoner = 0; p.mp = 3; p.custody = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { g.map.tiles[p.y + dy][p.x + dx] = 0; g.map.objects[p.y + dy][p.x + dx] = 0; }
  });
  await page.waitForTimeout(600); // let the camera settle on the prisoner
  return { page, context, errors };
}
const me = (page) => page.evaluate(() => { const p = window.__opticon.game.prisoners[0]; return { x: p.x, y: p.y }; });
const plan = (page) => page.evaluate(() => window.__opticon.stagedPath.map((s) => ({ x: s.x, y: s.y })));
const spot = (page, t) => page.evaluate(([x, y]) => window.__opticon.renderer.tileToScreen(x, y), [t.x, t.y]);

{
  const { page, context, errors } = await boot({});
  const p0 = await me(page);
  const round = await page.evaluate(([x, y]) => { const r = window.__opticon.renderer, s = r.tileToScreen(x, y); return r.screenToTile(s.x, s.y); }, [p0.x + 2, p0.y - 1]);
  check(round && round.x === p0.x + 2 && round.y === p0.y - 1, "a point on screen maps back to the square drawn there");

  const target = { x: p0.x, y: p0.y - 2 };
  let s = await spot(page, target);
  await page.mouse.click(s.x, s.y);
  let pl = await plan(page);
  check(pl.length === 2 && pl[1].x === target.x && pl[1].y === target.y, "mouse: tapping a square plans the walk to it");
  check((await me(page)).y === p0.y, "…and does not move the prisoner yet");
  s = await spot(page, target);
  await page.mouse.click(s.x, s.y);
  await page.waitForFunction(([x, y]) => { const p = window.__opticon.game.prisoners[0]; return p.x === x && p.y === y; }, [target.x, target.y], { timeout: 5000 }).catch(() => {});
  const p1 = await me(page);
  check(p1.x === target.x && p1.y === target.y && (await plan(page)).length === 0, "mouse: tapping the end of the plan walks it");

  // Draw: press on the prisoner and drag across two squares.
  await page.evaluate(() => { const g = window.__opticon.game; g.turn = "Prisoner"; g.prisoners[0].mp = 3; });
  await page.waitForTimeout(900);
  const a = await spot(page, p1), b = await spot(page, { x: p1.x + 1, y: p1.y }), c = await spot(page, { x: p1.x + 1, y: p1.y + 1 });
  const az = await page.evaluate(() => window.__opticon.renderer.orbit.az);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.mouse.up();
  pl = await plan(page);
  check(pl.length === 2 && pl[0].x === p1.x + 1 && pl[0].y === p1.y && pl[1].y === p1.y + 1, "mouse: a line drawn from the prisoner becomes the plan, square by square");
  check(az === await page.evaluate(() => window.__opticon.renderer.orbit.az), "…and drawing does not turn the camera");
  check((await me(page)).x === p1.x, "…and lifting the finger does not walk it");

  // A drag that starts on empty floor still turns the camera and plans nothing.
  await page.evaluate(() => { window.__opticon.stagedPath = []; });
  const e = await spot(page, { x: p1.x - 2, y: p1.y - 2 });
  await page.mouse.move(e.x, e.y); await page.mouse.down(); await page.mouse.move(e.x + 120, e.y + 10, { steps: 6 }); await page.mouse.up();
  check(az !== await page.evaluate(() => window.__opticon.renderer.orbit.az) && (await plan(page)).length === 0, "a drag that starts off the prisoner turns the camera and plans nothing");
  check(errors.length === 0, "no page errors with the mouse" + (errors.length ? ": " + errors[0] : ""));
  await context.close();
}

{
  const { page, context, errors } = await boot({ hasTouch: true, isMobile: true, viewport: { width: 812, height: 375 } });
  const p0 = await me(page);
  const target = { x: p0.x - 1, y: p0.y };
  const s = await spot(page, target);
  await page.touchscreen.tap(s.x, s.y);
  await page.waitForTimeout(300);
  const pl = await plan(page);
  const still = await me(page);
  check(pl.length === 1 && pl[0].x === target.x && still.x === p0.x, "touch: one tap plans and counts once (it does not also walk)");
  check(errors.length === 0, "no page errors on touch" + (errors.length ? ": " + errors[0] : ""));
  await context.close();
}

await browser.close();
server.close();
console.log(ok ? "\ntap-path: all passed" : "\ntap-path: FAILED");
process.exit(ok ? 0 : 1);
