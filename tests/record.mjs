// Records real gameplay frame-by-frame (bot-driven autoplay of the actual game build).
// node tests/record.mjs "<query>" outDir frames [fps] [w] [h] [warmupFrames]
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [q, outDir, frames = '300', fps = '20', w = '960', h = '540', warm = '0'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', (e) => console.log('pageerror', e.stack));
await page.goto(`http://localhost:8123/index.html${q}&capture`);
await page.waitForTimeout(1500);
const ms = 1000 / +fps;
for (let i = 0; i < +warm; i++) await page.evaluate((m) => window.__frame(m), ms);
for (let i = 0; i < +frames; i++) {
  await page.evaluate((m) => window.__frame(m), ms);
  await page.screenshot({ path: `${outDir}/f${String(i).padStart(4, '0')}.png` });
}
const info = await page.evaluate(() => { const g = window.__ayatori.game; return { t: g.time, lvl: g.level, kills: g.kills, knots: g.knotCount, best: g.bestKnot, state: g.state }; });
console.log(JSON.stringify(info));
await browser.close();
