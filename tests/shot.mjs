// Quick screenshot helper: node tests/shot.mjs "<query>" out.png [waitMs] [w] [h]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [q = '', out = 'shot.png', wait = '3000', w = '1280', h = '720'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(`http://localhost:8123/index.html${q}`);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
if (errors.length) console.log(errors.join('\n'));
console.log('ok');
await browser.close();
