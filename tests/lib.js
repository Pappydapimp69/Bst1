// Shared test setup: serve index.html from a real origin (the audio worklet will not load from file://).
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const PAGE = path.join(__dirname, '..', 'index.html');
const URL0 = 'https://lowtide.test/index.html';
async function open(browser, opts) {
  const ctx = await browser.newContext(Object.assign({ deviceScaleFactor: 1 }, opts));
  await ctx.route('https://lowtide.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(PAGE, 'utf8') }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL0);
  await page.waitForFunction(() => window.__lt && window.__lt.overlay === 'title');
  return { ctx, page, errors };
}
module.exports = { chromium, open };
