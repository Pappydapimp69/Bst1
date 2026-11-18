const { chromium, open } = require('./lib');
(async () => {
  const b = await chromium.launch();
  for (const [name, vp, touch] of [['portrait', { width: 390, height: 844 }, true], ['desktop', { width: 1280, height: 720 }, false]]) {
    const { ctx, page, errors } = await open(b, { viewport: vp, hasTouch: touch, isMobile: touch });
    await page.screenshot({ path: `/home/user/Bst1/shots/q-${name}-title.png` });
    await page.waitForTimeout(750);
    if (touch) await page.tap('#tNew'); else await page.click('#tNew');
    await page.waitForFunction(() => window.__lt.mode === 'play');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `/home/user/Bst1/shots/q-${name}-play.png` });
    console.log(name, JSON.stringify(await page.evaluate(() => ({ k: __lt.keeper, sound: __lt.sound, cr: __lt.creatures().length, bells: __lt.bells().map(b=>[b.n,b.h.toFixed(2)]) }))), errors);
    await ctx.close();
  }
  await b.close();
})();
