// Browser tests for Hare and Hounds: each input method on its own, the end
// cards, the stored best, and the board fitting every screen.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { serve } from '../../tools/serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const { server, url } = await serve();
const browser = await chromium.launch();
const results = [];

async function run(name, contextOptions, body) {
  const context = await browser.newContext({ viewport: { width: 900, height: 700 }, ...contextOptions });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(url + 'hare/?seed=play');
    await page.waitForFunction(() => window.__game && window.__game.mode === 'title');
    await body(page, context);
    assert.deepEqual(errors, [], 'no page errors');
    results.push(['ok', name]);
  } catch (e) {
    results.push(['FAIL', name, e.message]);
  } finally { await context.close(); }
}
const hare = (page) => page.evaluate(() => { const h = window.__game.state(); return [h.hare.x, h.hare.y, h.turn]; });
// A direction the hare can actually move from where it stands, in map terms.
const open = (page) => page.evaluate(() => {
  const h = window.__game.state(), m = h.map, ok = (x, y) => m.grid[y * m.w + x] === 1;
  return [['up', 0, -1], ['right', 1, 0], ['down', 0, 1], ['left', -1, 0]].find(([, dx, dy]) => ok(h.hare.x + dx, h.hare.y + dy));
});
// The screen centre of a map tile, turned with the board on portrait screens.
const centre = (page, x, y) => page.evaluate(([x, y]) => {
  const v = window.__game.view(), m = window.__game.state().map;
  const [px, py] = v.turned ? [v.ox + (m.h - 1 - y) * v.tile, v.oy + x * v.tile] : [v.ox + x * v.tile, v.oy + y * v.tile];
  return [px + v.tile / 2, py + v.tile / 2, v.tile, v.turned];
}, [x, y]);

await run('keyboard: a key starts the hunt and an arrow moves the hare one tile', {}, async (page) => {
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.mode === 'play');
  const [x, y] = await hare(page), [dir, dx, dy] = await open(page);
  const key = { up: 'ArrowUp', right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft' }[dir];
  await page.keyboard.press(key);
  assert.deepEqual(await hare(page), [x + dx, y + dy, 1]);
  await page.keyboard.press('Space');
  assert.equal((await hare(page))[2], 2, 'Space waits a turn');
});

await run('mouse: a click beside the hare moves it', {}, async (page) => {
  await page.mouse.click(5, 300);
  await page.waitForFunction(() => window.__game.mode === 'play');
  const [x, y] = await hare(page), [, dx, dy] = await open(page);
  const [cx, cy] = await centre(page, x + dx, y + dy);
  await page.mouse.click(cx, cy);
  assert.deepEqual((await hare(page)).slice(0, 2), [x + dx, y + dy]);
});

await run('touch on a turned phone board: a swipe moves the hare', { hasTouch: true, isMobile: true, viewport: { width: 390, height: 780 } }, async (page, context) => {
  const cdp = await context.newCDPSession(page);
  const touch = async (steps) => { for (const [type, p] of steps) await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [p] : [] }); };
  await touch([['touchStart', { x: 200, y: 400 }], ['touchEnd', null]]);
  await page.waitForFunction(() => window.__game.mode === 'play');
  assert.equal((await page.evaluate(() => window.__game.view())).turned, true, 'portrait turns the board');
  const [x, y] = await hare(page), [, dx, dy] = await open(page);
  const [ax, ay] = await centre(page, x, y), [bx, by] = await centre(page, x + dx, y + dy);
  const sx = Math.sign(bx - ax) * 60, sy = Math.sign(by - ay) * 60;
  await touch([['touchStart', { x: 200, y: 400 }], ['touchMove', { x: 200 + sx, y: 400 + sy }], ['touchEnd', null]]);
  assert.deepEqual((await hare(page)).slice(0, 2), [x + dx, y + dy]);
});

await run('a hare that gets home wins and its best is kept', {}, async (page) => {
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.mode === 'play');
  await page.evaluate(() => { window.__game.state().hounds.length = 0; });
  assert.equal(await page.evaluate(() => window.__game.autoplay()), 'home');
  await page.waitForFunction(() => !document.getElementById('card').hidden);
  assert.equal(await page.textContent('#title'), 'Home safe');
  assert.ok(Number(await page.evaluate(() => localStorage.getItem('bst1.hare.best'))) > 0);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.mode === 'play' && window.__game.state().turn === 0);
});

await run('a caught hare is told so', {}, async (page) => {
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.mode === 'play');
  await page.evaluate(() => { const h = window.__game.state(); h.hounds[0].x = h.hare.x; h.hounds[0].y = h.hare.y; window.__game.act('stay'); });
  await page.waitForFunction(() => !document.getElementById('card').hidden);
  assert.equal(await page.textContent('#title'), 'Caught');
});

for (const [w, h] of [[320, 568], [390, 780], [780, 390], [900, 700], [1920, 1080]]) {
  await run(`the meadow and the hud fit at ${w}x${h}`, { viewport: { width: w, height: h } }, async (page) => {
    await page.keyboard.press('Space');
    const v = await page.evaluate(() => window.__game.view());
    assert.ok(v.ox >= 0 && v.ox + v.cols * v.tile <= w && v.oy + v.rows * v.tile <= h, 'the board is on screen');
    const box = (id) => page.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }, id);
    const s = await box('stats'), b = await box('buttons');
    assert.ok(s[3] <= v.oy + 1 && b[3] <= v.oy + 1, 'the hud sits above the board');
    assert.ok(s[2] <= b[0], 'stats and the wait button do not overlap');
  });
}

await browser.close();
server.close();
for (const r of results) console.log(r.join('  '));
process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
