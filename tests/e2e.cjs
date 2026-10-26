// Browser end-to-end check: title -> run -> death -> results -> retry -> new run.
// Requires a static server at http://localhost:8123 (python3 -m http.server 8123).
// node tests/e2e.cjs [baseUrl]
const { chromium } = require('playwright');
(async () => {
  const base = process.argv[2] || 'http://localhost:8123/';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
  const ok = (c, m) => { if (!c) { console.log('FAIL', m, errs); process.exit(1); } console.log('ok ', m); };
  await p.goto(base + '?test&run&char=yui&seed=5');
  await p.waitForTimeout(1500);
  ok(await p.evaluate(() => window.__ayatori.mode === 'run'), 'run started');
  // let the player stand still until the horde kills them
  await p.evaluate(() => { const g = window.__ayatori.game; g.player.hp = 1; g.player.inv = 0; });
  await p.waitForFunction(() => window.__ayatori.game.state === 'dead', null, { timeout: 60000 });
  await p.waitForSelector('[data-a="retry"]', { timeout: 10000 });
  ok(true, 'results screen shown after death');
  const first = await p.evaluate(() => window.__ayatori.game);
  await p.click('[data-a="retry"]');
  await p.waitForTimeout(1000);
  const st = await p.evaluate(() => ({ mode: window.__ayatori.mode, state: window.__ayatori.game.state, t: window.__ayatori.game.time, hp: window.__ayatori.game.player.hp }));
  ok(st.mode === 'run' && st.state === 'play' && st.t < 5 && st.hp > 1, 'retry starts a fresh run ' + JSON.stringify(st));
  ok(errs.length === 0, 'no page errors');
  await b.close();
})();
