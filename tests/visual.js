// Visual check of the garden over several nights: walk a loop each night (driving the real path), then screenshot.
const { chromium, open } = require('./lib');
(async () => {
  const b = await chromium.launch();
  for (const [name, vp, touch] of [['portrait', { width: 390, height: 844 }, true], ['desktop', { width: 1280, height: 720 }, false]]) {
    const { ctx, page, errors } = await open(b, { viewport: vp, hasTouch: touch, isMobile: touch });
    await page.waitForTimeout(750);
    await page.click('#tNew');
    await page.waitForFunction(() => __lt.mode === 'play');
    await page.evaluate(() => __lt.skipTutorial());
    for (let night = 0; night < 3; night++) {
      await page.evaluate(() => { G.path = [{ x: 40, y: 40 }, { x: 55, y: 55 }, { x: 40, y: 62 }, { x: 25, y: 45 }, { x: 40, y: 40 }, { x: 55, y: 55 }, { x: 62, y: 66 }, { x: 40, y: 40 }, { x: 27, y: 25 }]; window.__ltSpeed = 2; });
      await page.waitForFunction(() => __lt.pathLen === 0, null, { timeout: 60000 });
      if (night === 2) { await page.evaluate(() => { window.__ltSpeed = 1; G.path = [{ x: 45, y: 48 }]; }); await page.waitForTimeout(4000); await page.screenshot({ path: `/home/user/Bst1/shots/${name}-garden-night3.png` }); break; }
      await page.evaluate(() => __lt.tideTo(0.999));
      await page.waitForFunction(() => __lt.overlay === 'dawn');
      await page.waitForTimeout(800);
      await page.click('#dNext');
      await page.waitForFunction(() => __lt.mode === 'play' && !__lt.overlay);
    }
    console.log(name, errors);
    await ctx.close();
  }
  await b.close();
})();
