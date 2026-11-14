// Browser tests for Crab Castle. Each input method gets its own run in which
// no other method is touched, and every wait polls the game's own state
// through window.__game, never a wall clock.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { serve } from '../../tools/serve.mjs';
import { GOLDEN } from './golden.mjs';

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
    await page.goto(url + 'crab/?seed=play');
    await page.waitForFunction(() => window.__game && window.__game.mode === 'title');
    await body(page, context);
    assert.deepEqual(errors, [], 'no page errors');
    results.push(['ok', name]);
  } catch (e) {
    results.push(['FAIL', name, e.message]);
  } finally { await context.close(); }
}

const crabY = (page) => page.evaluate(() => window.__game.state().crab.y);
const moved = (page, from, by) => page.waitForFunction(
  ([from, by]) => { const y = window.__game.state().crab.y; return by > 0 ? y > from + by : y < from + by; }, [from, by], { timeout: 15000 });

await run('keyboard only: the plain path down and back starts the tide', {}, async (page) => {
  const y0 = await crabY(page);
  await page.keyboard.down('ArrowDown');
  await page.waitForFunction(() => window.__game.mode === 'play');
  await page.waitForFunction(() => window.__game.state().carry === 1, null, { timeout: 15000 });
  assert.ok((await crabY(page)) > y0);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__game.state().phase === 'play', null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.__game.state().built), 1);
  assert.deepEqual(await page.evaluate(() => window.__game.seen), ['keys']);
  assert.equal(await page.textContent('#count'), '1 / 50');
});

await run('mouse only', {}, async (page) => {
  const y0 = await crabY(page);
  await page.mouse.move(450, 650);
  await page.mouse.down();
  await page.waitForFunction(() => window.__game.mode === 'play');
  await moved(page, y0, 60);
  await page.mouse.up();
  assert.deepEqual(await page.evaluate(() => window.__game.seen), ['mouse']);
  assert.equal(await page.evaluate(() => window.__game.audio), 'running', 'sound starts on the first gesture');
});

await run('touch only', { hasTouch: true, isMobile: true, viewport: { width: 390, height: 780 } }, async (page, context) => {
  const cdp = await context.newCDPSession(page);
  const y0 = await crabY(page);
  assert.equal(await page.evaluate(() => window.__game.touch), false, 'touch is not assumed before a touch');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 500 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 580 }] });
  await page.waitForFunction(() => window.__game.mode === 'play');
  await moved(page, y0, 60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual(await page.evaluate(() => window.__game.seen), ['touch']);
  assert.equal(await page.evaluate(() => window.__game.touch), true);
});

await run('a finished castle wins, saves the best, and a new run starts clean', {}, async (page) => {
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.mode === 'play');
  assert.equal(await page.evaluate(() => window.__game.autoplay({ react: 10 })), 'won');
  assert.equal(await page.evaluate(() => window.__game.mode), 'end');
  assert.equal(await page.textContent('#title'), 'The castle stands');
  assert.match(await page.textContent('#line'), /Finished with \d+ seconds to spare\. Your best yet\./);
  assert.ok(Number(await page.evaluate(() => localStorage.getItem('bst1.crabcastle.best'))) > 0);
  assert.equal(await page.textContent('#count'), '50 / 50');
  await page.waitForFunction(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); return window.__game.mode === 'play'; }, null, { polling: 100 });
  const fresh = await page.evaluate(() => window.__game.state());
  assert.equal(fresh.built, 0); assert.equal(fresh.phase, 'wait'); assert.equal(fresh.gulls.length, 0);
});

await run('a castle left unfinished is lost to the tide', {}, async (page) => {
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.mode === 'play');
  // Deliver the first shell, then stand still and let the tide come.
  await page.evaluate(() => { const g = window.__game; while (g.state().phase === 'wait') { const s = g.state(); g.hold.set('bot', 0, s.carry ? -1 : 1); g.stepBy(1); } g.hold.release('bot'); });
  await page.evaluate(() => { const g = window.__game; while (g.mode === 'play') g.stepBy(120); });
  assert.equal(await page.textContent('#title'), 'The tide took it');
  assert.match(await page.textContent('#line'), /^1 of 50 shells were in place\./);
});

for (const [w, h] of [[320, 568], [390, 780], [780, 390], [900, 700], [1920, 1080]]) {
  await run(`the beach fits and hud pieces do not overlap at ${w}x${h}`, { viewport: { width: w, height: h } }, async (page) => {
    const boxes = await page.evaluate(() => ['stats', 'buttons'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, r.left, r.top, r.right, r.bottom]; }));
    for (const [id, l, t, r, b] of boxes) assert.ok(l >= 0 && t >= 0 && r <= w && b <= h, `${id} is on screen`);
    const [, al, at, ar, ab] = boxes[0], [, cl, ct, cr, cb] = boxes[1];
    assert.ok(ar <= cl || cr <= al || ab <= ct || cb <= at, 'stats overlap buttons');
    const v = await page.evaluate(() => window.__game.view());
    assert.ok(v.ox >= -0.5 && v.oy >= -0.5 && 720 * v.scale <= w + 1 && 960 * v.scale <= h + 1, 'the whole beach is inside the screen');
    const card = await page.evaluate(() => { const r = document.getElementById('card').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
    assert.ok(card[0] >= 0 && card[1] >= 0 && card[2] <= w && card[3] <= h, 'the title card is on screen');
  });
}

await run('the browser reproduces the golden replay', {}, async (page) => {
  const fp = await page.evaluate(([seed, ticks]) => window.__game.replay(seed, ticks), [GOLDEN.seed, GOLDEN.ticks]);
  assert.equal(fp, GOLDEN.fingerprint);
});

await browser.close();
server.close();
for (const r of results) console.log(r.join('  '));
process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
