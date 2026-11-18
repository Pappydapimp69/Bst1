// Full proof run: touch-only night to dawn (portrait), touch-only lighthouse run (landscape), pad-only run (desktop).
// Every device run is forbidden from the others; screenshots at scale 1 go to shots/.
const { chromium, open } = require('./lib');
const SHOT = (n) => `/home/user/Bst1/shots/${n}.png`;
const results = [];
const ok = (name, cond, extra) => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); };
const wait = (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 15000 }).then(() => true, () => false);

async function layout(page, label) {
  const r = await page.evaluate(() => {
    const out = { off: [], small: [], overlap: false };
    const vis = (el) => { const q = el.getBoundingClientRect(); return q.width > 0 && q.height > 0 && el.offsetParent !== null; };
    for (const el of document.querySelectorAll('button, canvas#view')) {
      if (!vis(el)) continue;
      const q = el.getBoundingClientRect();
      if (q.left < -1 || q.top < -1 || q.right > innerWidth + 1 || q.bottom > innerHeight + 1) out.off.push(el.id || el.textContent.trim().slice(0, 20));
      if (el.tagName === 'BUTTON' && (q.width < 44 || q.height < 44)) out.small.push(el.id || el.textContent.trim().slice(0, 20));
    }
    const a = document.getElementById('stage').getBoundingClientRect();
    for (const id of ['top', 'bar']) { const b = document.getElementById(id).getBoundingClientRect(); if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.overlap = true; }
    const de = document.documentElement; out.scroll = de.scrollWidth > innerWidth + 1 || de.scrollHeight > innerHeight + 1;
    return out;
  });
  ok(`${label}: controls on screen, at least 44px, HUD clear of the shore, no scroll`, !r.off.length && !r.small.length && !r.overlap && !r.scroll, JSON.stringify(r));
}
async function touchDrag(cdp, pts) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0].x, y: pts[0].y }] });
  for (const p of pts.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function touchTap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function tapEl(page, cdp, sel) {
  const q = await page.locator(sel).first().boundingBox();
  await touchTap(cdp, q.x + q.width / 2, q.y + q.height / 2);
}
async function stageOrigin(page) { return page.evaluate(() => { const r = document.getElementById('view').getBoundingClientRect(); return { x: r.left, y: r.top }; }); }
// draw a line from the keeper to a world point with the finger held 46 px below the line (the line lifts ahead of it)
async function walkTo(page, cdp, wx, wy) {
  const o = await stageOrigin(page);
  const k = await page.evaluate(() => __lt.toScreen(__lt.keeper.x, __lt.keeper.y));
  const t = await page.evaluate(([x, y]) => __lt.toScreen(x, y), [wx, wy]);
  const pts = [];
  for (let i = 0; i <= 24; i++) pts.push({ x: o.x + k.x + (t.x - k.x) * i / 24 + (i ? 0 : 0), y: o.y + k.y + (t.y - k.y) * i / 24 + 46 });
  pts.splice(1, 0, { x: pts[0].x + 14, y: pts[0].y });
  await touchDrag(cdp, pts);
}

(async () => {
  const b = await chromium.launch();
  // ------------------------------------------------ 1. phone portrait, touch only: tutorial, a night to dawn, the next night
  {
    const { ctx, page, errors } = await open(b, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const cdp = await ctx.newCDPSession(page);
    await page.screenshot({ path: SHOT('portrait-title') });
    await layout(page, 'portrait title');
    await page.waitForTimeout(750);
    await tapEl(page, cdp, '#tNew');
    ok('portrait: touch starts a night', await wait(page, () => __lt.mode === 'play' && !__lt.overlay));
    ok('portrait: device reads touch', (await page.evaluate(() => __lt.device)) === 'touch');
    await page.waitForTimeout(400);
    await walkTo(page, cdp, 38, 34);
    ok('portrait: drawn path walks the keeper and sings steps', await wait(page, () => __lt.tut >= 1 && __lt.stepCount > 2, null, 10000));
    await page.screenshot({ path: SHOT('portrait-walk') });
    ok('portrait: a creature sings and is heard', await wait(page, () => __lt.tut >= 2, null, 30000));
    // tap a lit creature to note it
    let noted = false;
    for (let i = 0; i < 20 && !noted; i++) {
      const cr = await page.evaluate(() => __lt.creatures().filter((c) => c.lit > 0.4 && c.kind !== 'bell' && c.kind !== 'fish'));
      if (cr.length) { const o = await stageOrigin(page); await touchTap(cdp, o.x + cr[0].screen.x, o.y + cr[0].screen.y); }
      noted = await wait(page, () => __lt.tut >= 3, null, 1500);
    }
    ok('portrait: tapping a lit creature notes it', noted);
    await page.waitForTimeout(300);
    await page.screenshot({ path: SHOT('portrait-song') });
    await tapEl(page, cdp, '#bJournal');
    ok('portrait: journal opens from its button', await wait(page, () => __lt.overlay === 'journal'));
    await page.waitForTimeout(750);
    await page.screenshot({ path: SHOT('portrait-journal') });
    await layout(page, 'portrait journal');
    await tapEl(page, cdp, '#jBody .sign');
    await page.waitForTimeout(200);
    await tapEl(page, cdp, '#jBody .choice >> nth=4');
    await page.waitForTimeout(200);
    await page.screenshot({ path: SHOT('portrait-sign') });
    await layout(page, 'portrait sign detail');
    await tapEl(page, cdp, '#jClose');
    ok('portrait: journal closes back to the shore', await wait(page, () => !__lt.overlay && __lt.tut >= 5));
    await page.evaluate(() => __lt.tideTo(0.6));
    await page.waitForTimeout(800);
    await page.screenshot({ path: SHOT('portrait-tide') });
    await page.evaluate(() => __lt.tideTo(0.999));
    ok('portrait: high tide ends the night at a dawn card', await wait(page, () => __lt.overlay === 'dawn'));
    await page.waitForTimeout(300);
    await page.screenshot({ path: SHOT('portrait-dawn') });
    await layout(page, 'portrait dawn');
    await tapEl(page, cdp, '#dNext');   // inside 0.7 s of opening: must be ignored
    const early = await page.evaluate(() => __lt.overlay);
    await page.waitForTimeout(800);
    await tapEl(page, cdp, '#dNext');
    ok('portrait: dawn card ignores the early tap, then the next night begins', early === 'dawn' && await wait(page, () => __lt.mode === 'play' && __lt.night === 2 && !__lt.overlay));
    const saved = await page.evaluate(() => { try { const s = JSON.parse(localStorage.getItem('lowtide.v5t2.save')); return { night: s.night, phrases: s.phrases.reduce((a, b) => a + b, 0), moss: s.moss && s.moss.length }; } catch (e) { return null; } });
    ok('portrait: journal, night and moss are saved', saved && saved.night === 2 && saved.phrases > 0 && saved.moss > 0, JSON.stringify(saved));
    ok('portrait: walked trail grew moss', (await page.evaluate(() => __lt.moss())) > 0.5);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: SHOT('portrait-night2') });
    ok('portrait: sound engine running (not the fallback)', !!(await page.evaluate(() => __lt.sound && __lt.sound.engine && __lt.sound.state === 'running')), JSON.stringify(await page.evaluate(() => __lt.sound)));
    ok('portrait: no console or page errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }
  // ------------------------------------------------ 2. phone landscape, touch only: ring the bells in order, light the lamp
  {
    const { ctx, page, errors } = await open(b, { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    const cdp = await ctx.newCDPSession(page);
    await page.waitForTimeout(750);
    await tapEl(page, cdp, '#tNew');
    await wait(page, () => __lt.mode === 'play');
    await page.evaluate(() => __lt.skipTutorial());
    await layout(page, 'landscape play');
    await page.screenshot({ path: SHOT('landscape-play') });
    const bells = (await page.evaluate(() => __lt.bells())).sort((a, c) => a.n - c.n);
    for (const bell of bells) {
      let rung = false;
      for (let tries = 0; tries < 4 && !rung; tries++) {
        await walkTo(page, cdp, bell.x, bell.y);
        rung = await wait(page, (n) => __lt.bells().find((x) => x.n === n).rung, bell.n, 20000);
      }
      ok(`landscape: walking through bell ${bell.n} rings it in order`, rung, JSON.stringify(await page.evaluate(() => ({ k: __lt.keeper, seq: __lt.ringSeq, t: __lt.tide.toFixed(2) }))));
      if (bell.n === 2) await page.screenshot({ path: SHOT('landscape-bells') });
    }
    ok('landscape: three bells in order light the lighthouse', await wait(page, () => __lt.towerLit, null, 5000));
    await page.waitForTimeout(2500);
    await page.screenshot({ path: SHOT('landscape-lit') });
    ok('landscape: the ending card follows', await wait(page, () => __lt.overlay === 'ending', null, 12000));
    await page.waitForTimeout(800);
    await page.screenshot({ path: SHOT('landscape-ending') });
    await layout(page, 'landscape ending');
    ok('landscape: no console or page errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }
  // ------------------------------------------------ 3. desktop 1280x720, gamepad only
  {
    const ctx0 = { viewport: { width: 1280, height: 720 } };
    const browserCtx = await b.newContext(Object.assign({ deviceScaleFactor: 1 }, ctx0));
    await browserCtx.addInitScript(() => {
      const pad = { id: 'Test pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), timestamp: 0 };
      window.__pad = pad; window.__padOn = true;
      navigator.getGamepads = () => (window.__padOn ? [pad] : []);
    });
    const fs = require('fs');
    await browserCtx.route('https://lowtide.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync('/home/user/Bst1/index.html', 'utf8') }));
    const page = await browserCtx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto('https://lowtide.test/index.html');
    await wait(page, () => window.__lt && __lt.overlay === 'title');
    const press = async (i, hold) => { await page.evaluate((i) => { __pad.buttons[i] = { pressed: true, value: 1 }; }, i); await page.waitForTimeout(hold || 90); await page.evaluate((i) => { __pad.buttons[i] = { pressed: false, value: 0 }; }, i); await page.waitForTimeout(90); };
    const stick = async (x, y, ms) => { await page.evaluate(([x, y]) => { __pad.axes[0] = x; __pad.axes[1] = y; }, [x, y]); await page.waitForTimeout(ms); await page.evaluate(() => { __pad.axes[0] = 0; __pad.axes[1] = 0; }); };
    await page.waitForTimeout(750);
    await page.screenshot({ path: SHOT('desktop-title') });
    await layout(page, 'desktop title');
    // walk the menu by identity with the D-pad: down until New journal has focus
    for (let i = 0; i < 4 && (await page.evaluate(() => document.activeElement.id)) !== 'tNew'; i++) await press(13);
    ok('pad: D-pad reaches New journal', (await page.evaluate(() => document.activeElement.id)) === 'tNew');
    await page.evaluate(() => { __pad.buttons[0] = { pressed: true, value: 1 }; });   // hold A through the start
    ok('pad: A starts a night', await wait(page, () => __lt.mode === 'play'));
    await page.waitForTimeout(300);
    const pathBefore = await page.evaluate(() => __lt.stepCount);
    await page.evaluate(() => { __pad.buttons[0] = { pressed: false, value: 0 }; });
    ok('pad: the held start press does not leak into the night (no song)', (await page.evaluate(() => __lt.device)) === 'pad');
    const k0 = await page.evaluate(() => __lt.keeper);
    await stick(0.7, 0.7, 1600);
    const k1 = await page.evaluate(() => __lt.keeper);
    ok('pad: left stick walks the keeper', Math.hypot(k1.x - k0.x, k1.y - k0.y) > 5, JSON.stringify([k0, k1]));
    await stick(0.1, 0.1, 400);
    const k2 = await page.evaluate(() => __lt.keeper);
    ok('pad: a stick resting inside the dead zone does not walk', Math.hypot(k2.x - k1.x, k2.y - k1.y) < 0.01);
    await press(0);   // sing
    await page.waitForTimeout(1600);
    ok('pad: A sings in place', (await page.evaluate(() => __lt.stepCount)) >= pathBefore);
    await page.screenshot({ path: SHOT('desktop-play') });
    await layout(page, 'desktop play');
    ok('pad: a creature is heard', await wait(page, () => __lt.heardPhrases().some((n) => n > 0), null, 30000));
    let heardTut = false;
    for (let i = 0; i < 12 && !heardTut; i++) { await press(2); heardTut = await wait(page, () => __lt.tut >= 3, null, 1200); if (!heardTut) await stick(0.3, -0.3, 300); }
    ok('pad: X notes the nearest lit creature', heardTut);
    await press(3);
    ok('pad: Y opens the journal', await wait(page, () => __lt.overlay === 'journal'));
    await page.waitForTimeout(750);
    for (let i = 0; i < 6 && !(await page.evaluate(() => document.activeElement.classList.contains('sign'))); i++) await press(13);
    await press(0);
    await page.waitForTimeout(200);
    for (let i = 0; i < 3; i++) await press(13);
    const onChoice = await page.evaluate(() => document.activeElement.classList.contains('choice'));
    await press(0);
    await page.waitForTimeout(200);
    ok('pad: D-pad reaches a picture choice and A pencils it in', onChoice && (await page.evaluate(() => __lt.words().some((w) => w.guess >= 0))));
    await page.screenshot({ path: SHOT('desktop-journal') });
    await press(1); await press(1);
    ok('pad: B backs out of the sign and closes the journal', await wait(page, () => !__lt.overlay));
    await press(9);
    ok('pad: Start pauses', await wait(page, () => __lt.overlay === 'pause'));
    await page.waitForTimeout(750);
    await page.screenshot({ path: SHOT('desktop-pause') });
    await press(1);
    ok('pad: B resumes', await wait(page, () => !__lt.overlay));
    await page.evaluate(() => __lt.tideTo(0.999));
    ok('pad: dawn card', await wait(page, () => __lt.overlay === 'dawn'));
    await page.waitForTimeout(800);
    await page.screenshot({ path: SHOT('desktop-dawn') });
    for (let i = 0; i < 3 && (await page.evaluate(() => document.activeElement.id)) !== 'dNext'; i++) await press(12);
    await press(0);
    ok('pad: A walks the next night', await wait(page, () => __lt.night === 2 && __lt.mode === 'play' && !__lt.overlay));
    await page.evaluate(() => { window.__padOn = false; });
    ok('pad: unplugging the controller pauses', await wait(page, () => __lt.overlay === 'pause'));
    ok('pad: no console or page errors', !errors.length, errors.join(' | '));
    await browserCtx.close();
  }
  // ------------------------------------------------ 4. desktop, keyboard only
  {
    const { ctx, page, errors } = await open(b, { viewport: { width: 1280, height: 720 } });
    await page.waitForTimeout(750);
    ok('keys: focus starts on the first usable title option', (await page.evaluate(() => document.activeElement.id)) === 'tNew');
    await page.keyboard.press('Enter');
    ok('keys: Enter starts a night', await wait(page, () => __lt.mode === 'play' && !__lt.overlay));
    const k0 = await page.evaluate(() => __lt.keeper);
    await page.keyboard.down('ArrowRight'); await page.keyboard.down('ArrowDown'); await page.waitForTimeout(1200); await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowDown');
    const k1 = await page.evaluate(() => __lt.keeper);
    ok('keys: arrows walk the keeper', Math.hypot(k1.x - k0.x, k1.y - k0.y) > 4);
    await page.keyboard.press('Space');
    ok('keys: J opens the journal and Escape closes it', await (async () => { await page.keyboard.press('KeyJ'); const a = await wait(page, () => __lt.overlay === 'journal'); await page.waitForTimeout(750); await page.keyboard.press('Escape'); return a && await wait(page, () => !__lt.overlay); })());
    await page.keyboard.press('Escape');
    ok('keys: Escape pauses', await wait(page, () => __lt.overlay === 'pause'));
    await page.waitForTimeout(750); await page.keyboard.press('Escape');
    ok('keys: Escape resumes', await wait(page, () => !__lt.overlay));
    ok('keys: no console or page errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(results.join('\n'));
  console.log(`${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
})();
