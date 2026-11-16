// Browser tests. Each input method gets its own run in which no other method
// is touched, so a touch-only bug cannot pass on a mouse run. Every wait polls
// the game's own tick and state through window.__game, never a wall clock.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { serve } from '../tools/serve.mjs';
import { GOLDEN } from './golden.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const { server, url } = await serve();
const browser = await chromium.launch();
const results = [];

async function run(name, contextOptions, body) {
  const context = await browser.newContext({ viewport: { width: 900, height: 600 }, ...contextOptions });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(url + '?seed=play');
    await page.waitForFunction(() => window.__game && window.__game.mode === 'title');
    await body(page, context);
    assert.deepEqual(errors, [], 'no page errors');
    results.push(['ok', name]);
  } catch (e) {
    results.push(['FAIL', name, e.message]);
  } finally { await context.close(); }
}

const mothX = (page) => page.evaluate(() => window.__game.state().moth.x);
const moved = (page, from, by) => page.waitForFunction(
  ([from, by]) => { const x = window.__game.state().moth.x; return by > 0 ? x > from + by : x < from + by; }, [from, by], { timeout: 15000 });

await run('keyboard only', {}, async (page) => {
  const x0 = await mothX(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__game.mode === 'play');
  await moved(page, x0, 120);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('KeyA');
  const x1 = await mothX(page);
  await moved(page, x1, -60);
  assert.deepEqual(await page.evaluate(() => window.__game.seen), ['keys']);
  assert.equal(await page.evaluate(() => window.__game.touch), false);
  // Losing focus releases the hold even though no keyup arrives.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.evaluate(() => window.__game.stepBy(120));
  const v = await page.evaluate(() => window.__game.state().moth.vx);
  assert.ok(Math.abs(v) < 1, `moth still drifting at ${v} after blur`);
  // The player's own motion choice overrides the system setting, and is kept.
  assert.equal(await page.evaluate(() => window.__game.calm), false);
  await page.click('#motion');
  assert.equal(await page.evaluate(() => window.__game.calm), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('bst1.glowmoth.calm')), 'true');
});

await run('mouse only', {}, async (page) => {
  const x0 = await mothX(page);
  await page.mouse.move(800, 300);
  await page.mouse.down();
  await page.waitForFunction(() => window.__game.mode === 'play');
  await moved(page, x0, 120);
  await page.mouse.up();
  assert.deepEqual(await page.evaluate(() => window.__game.seen), ['mouse']);
  assert.equal(await page.evaluate(() => window.__game.touch), false);
  assert.equal(await page.evaluate(() => window.__game.audio), 'running', 'sound starts on the first gesture');
  // A hidden page suspends the audio context instead of only muting it.
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => window.__game.audio === 'suspended');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => window.__game.audio === 'running');
});

await run('touch only', { hasTouch: true, isMobile: true, viewport: { width: 390, height: 780 } }, async (page, context) => {
  const cdp = await context.newCDPSession(page);
  const x0 = await mothX(page);
  assert.equal(await page.evaluate(() => window.__game.touch), false, 'touch is not assumed before a touch');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 600 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 220, y: 600 }] });
  await page.waitForFunction(() => window.__game.mode === 'play');
  await moved(page, x0, -120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual(await page.evaluate(() => window.__game.seen), ['touch']);
  assert.equal(await page.evaluate(() => window.__game.touch), true);
});

await run('system reduced motion is the default', { reducedMotion: 'reduce' }, async (page) => {
  assert.equal(await page.evaluate(() => window.__game.calm), true);
  await page.click('#motion');
  assert.equal(await page.evaluate(() => window.__game.calm), false, 'and the player can turn it back on');
});

await run('a run ends, saves its best, and a new run starts clean', {}, async (page) => {
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.mode === 'play');
  // Hand stepping: exactly the ticks asked for, however many frames pass.
  await page.evaluate(() => window.__game.stepBy(10));
  const t = await page.evaluate(() => window.__game.tick);
  await page.waitForFunction(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(true)))));
  assert.equal(await page.evaluate(() => window.__game.tick), t);
  await page.evaluate(() => { while (window.__game.mode === 'play') window.__game.stepBy(60); });
  assert.equal(await page.evaluate(() => window.__game.mode), 'over');
  assert.equal(await page.isVisible('#overlay'), true);
  const ended = await page.evaluate(() => window.__game.state());
  assert.ok(ended.over && ended.glow === 0);
  await page.waitForFunction(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); return window.__game.mode === 'play'; }, null, { polling: 100 });
  const fresh = await page.evaluate(() => window.__game.state());
  assert.equal(fresh.score, 0); assert.equal(fresh.glow <= 1 && fresh.glow > 0.9, true); assert.equal(fresh.bats.length, 0);
  assert.ok(fresh.tick < 60, 'the new run starts from a new world');
});

await run('camera holds in the dead zone and the pixel ratio is honoured', { deviceScaleFactor: 2 }, async (page, context) => {
  const size = await page.evaluate(() => ({ w: document.getElementById('game').width, dpr: window.__game.view().dpr }));
  assert.equal(size.dpr, 2); assert.equal(size.w, 1800);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__game.mode === 'play');
  await page.evaluate(() => window.__game.stepBy(12));
  const a = await page.evaluate(() => ({ cam: window.__game.camera(), x: window.__game.state().moth.x }));
  assert.equal(a.cam.x, 1200, 'a small move does not move the camera');
  assert.ok(a.x > 1200);
  await page.evaluate(() => window.__game.stepBy(120));
  const b = await page.evaluate(() => window.__game.camera());
  assert.ok(b.x > 1200, 'past the edge of the dead zone it follows');
  // A pixel-ratio change with no resize event (a window dragged to another
  // monitor) must still resize the canvas.
  await page.evaluate(() => { window.__resizes = 0; window.addEventListener('resize', () => window.__resizes++); });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 600, deviceScaleFactor: 3, mobile: false });
  await page.waitForFunction(() => document.getElementById('game').width === 2700);
  assert.equal(await page.evaluate(() => window.__resizes), 0, 'no resize event fired for the ratio change');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 600, deviceScaleFactor: 1.5, mobile: false });
  await page.waitForFunction(() => document.getElementById('game').width === 1350);
});

for (const [w, h] of [[320, 568], [390, 780], [780, 390], [900, 600], [1920, 1080]]) {
  await run(`hud pieces do not overlap at ${w}x${h}`, { viewport: { width: w, height: h } }, async (page) => {
    const boxes = await page.evaluate(() => ['stats', 'bar', 'buttons'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, r.left, r.top, r.right, r.bottom]; }));
    for (const [id, l, t, r, b] of boxes) assert.ok(l >= 0 && t >= 0 && r <= w && b <= h, `${id} is on screen`);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const [a, al, at, ar, ab] = boxes[i], [c, cl, ct, cr, cb] = boxes[j];
      assert.ok(ar <= cl || cr <= al || ab <= ct || cb <= at, `${a} overlaps ${c}`);
    }
  });
}

await run('an error thrown in one frame costs that frame, not the game', {}, async (page) => {
  // The page's own error listener would fail the run; this error is the point.
  page.removeAllListeners('pageerror');
  const thrown = [];
  page.on('pageerror', (e) => thrown.push(String(e)));
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__game.mode === 'play');
  await page.evaluate(() => {
    const proto = CanvasRenderingContext2D.prototype, real = proto.fillRect;
    let armed = true;
    proto.fillRect = function (...a) { if (armed) { armed = false; throw new Error('one bad frame'); } return real.apply(this, a); };
  });
  await page.waitForFunction(() => true);
  const t0 = await page.evaluate(() => window.__game.tick);
  await page.waitForFunction((t0) => window.__game.tick > t0 + 30, t0, { timeout: 10000 });
  await page.keyboard.up('ArrowRight');
  assert.equal(thrown.length, 1, 'exactly the one injected error');
  assert.match(thrown[0], /one bad frame/);
});

await run('every button is a full touch target, 44 by 44 or more', { hasTouch: true, isMobile: true, viewport: { width: 390, height: 780 } }, async (page) => {
  const sizes = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return [b.id, r.width, r.height]; }));
  assert.ok(sizes.length > 0);
  for (const [id, w, h] of sizes) assert.ok(w >= 44 && h >= 44, `${id} is ${w}x${h}`);
});

await run('the browser reproduces the golden replay', {}, async (page) => {
  const fp = await page.evaluate(([seed, ticks]) => window.__game.replay(seed, ticks), [GOLDEN.seed, GOLDEN.ticks]);
  assert.equal(fp, GOLDEN.fingerprint);
});

await browser.close();
server.close();
for (const r of results) console.log(r.join('  '));
process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
