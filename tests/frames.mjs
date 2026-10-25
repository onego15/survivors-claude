// Capture a burst of frames: node tests/frames.mjs "<query>" outPrefix count intervalMs [startWait]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [q = '', out = '/tmp/f', count = '6', interval = '250', startWait = '3000', w = '1280', h = '720'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.stack));
await page.goto(`http://localhost:8123/index.html${q}`);
await page.waitForTimeout(+startWait);
for (let i = 0; i < +count; i++) {
  await page.screenshot({ path: `${out}${i}.png` });
  await page.waitForTimeout(+interval);
}
const info = await page.evaluate(() => { const g = window.__ayatori.game; return { t: g.time, fps: 0, enemies: g.enemies.length, lvl: g.level, state: g.state }; });
console.log(JSON.stringify(info));
if (errors.length) console.log(errors.join('\n'));
await browser.close();
