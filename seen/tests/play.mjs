// Browser tests for Seen: the real page, played by mouse and by keyboard, and
// the bundled single file. Waits poll the game's own state, never a clock.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { serve } from '../../tools/serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const { server, url } = await serve();
const browser = await chromium.launch();
const results = [];
const shots = process.env.SHOTS;

async function run(name, path, options, body) {
  const context = await browser.newContext({ viewport: { width: 420, height: 800 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(url + path);
    await page.waitForFunction(() => window.__game && window.__game.mode === 'title');
    await body(page);
    assert.deepEqual(errors, [], 'no page errors');
    results.push(['ok', name]);
  } catch (e) { results.push(['FAIL', name, e.message]); } finally { await context.close(); }
}
const ready = (page) => page.waitForFunction(() => window.__game.mode !== 'play' || !window.__game.locked);

async function night(page, pick) {
  await page.click('#go');
  for (;;) {
    await ready(page);
    if (await page.evaluate(() => window.__game.mode) !== 'play') break;
    await pick(page);
  }
}

await run('mouse: always the lit door is read within a night and named in words', 'seen/?seed=play&fast', {}, async (page) => {
  if (shots) await page.screenshot({ path: shots + '/title.png' });
  await night(page, (p) => p.click('.door.short'));
  await night(page, async (p) => {
    if (shots && await p.evaluate(() => window.__game.state().room) === 3) await p.screenshot({ path: shots + '/room.png' });
    await p.click('.door.short');
  });
  const m = await page.evaluate(() => window.__game.model());
  assert.equal(m.runs, 2);
  assert.ok(m.hits / m.rooms > 0.6, `seen ${m.hits} of ${m.rooms}`);
  assert.match(await page.textContent('#habits'), /You take the short way/);
  assert.match(await page.textContent('#truth'), /It is this game/);
  if (shots) await page.screenshot({ path: shots + '/end.png', fullPage: true });
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.mode === 'title');
  assert.match(await page.textContent('#truth'), /I remember you: 2 nights/);
  await page.click('#forget');
  assert.equal(await page.evaluate(() => window.__game.model().rooms), 0);
});

await run('keyboard only: number and arrow keys choose doors to the end of a night', 'seen/?seed=keys&fast', {}, async (page) => {
  await page.keyboard.press('Enter');
  const keys = ['1', '2', '3', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
  for (let i = 0; ; i++) {
    await ready(page);
    if (await page.evaluate(() => window.__game.mode) !== 'play') break;
    const before = await page.evaluate(() => window.__game.state().history.length);
    await page.keyboard.press(keys[i % keys.length]);
    await page.waitForFunction((n) => window.__game.state().history.length > n, before);
  }
  assert.equal(await page.evaluate(() => window.__game.mode), 'over');
});

await run('a sealed door stays on screen long enough to read', 'seen/?seed=slow', { viewport: { width: 900, height: 700 } }, async (page) => {
  await page.click('#go');
  await page.click('.door[data-door="1"]');
  await page.waitForSelector('.door.sealed');
  assert.match(await page.textContent('#note'), /I sealed the (left|middle|right) door/);
  if (shots) await page.screenshot({ path: shots + '/reveal-wide.png' });
  await page.waitForFunction(() => window.__game.state().room === 1 && !window.__game.locked);
});

await run('the bundled single page plays', 'dist/seen.html?seed=bundle&fast', {}, async (page) => {
  await night(page, (p) => p.click('.door[data-door="0"]'));
  assert.equal(await page.evaluate(() => window.__game.mode), 'over');
});

await browser.close();
server.close();
for (const r of results) console.log(...r);
if (results.some((r) => r[0] !== 'ok')) process.exit(1);
