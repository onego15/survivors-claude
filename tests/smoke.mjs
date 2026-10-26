// Fast smoke test used in CI: verifies the core loop runs without errors and that
// key systems (loop closing, level-ups, chests, bosses, retry) behave.
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Bot } from '../src/bot.js';
import { UPGRADES, EVOLUTIONS } from '../src/data.js';

const DT = 1 / 60;
function play(g, bot, until) {
  while (g.state !== 'dead' && g.state !== 'win' && g.time < until) {
    if (g.state === 'levelup') { g.choose(bot.pickChoice(g.choices)); continue; }
    if (g.state === 'chest') { g.closeChest(); continue; }
    g.update(DT, bot.input(DT));
    g.fx.length = 0;
    assert.ok(Number.isFinite(g.player.x) && Number.isFinite(g.player.hp), 'player state finite');
  }
}

// 1. A scripted circle closes a loop and damages enemies inside it
{
  const g = new Game({ seed: 1, char: 'yui' });
  for (let i = 0; i < 6; i++) g.spawnEnemy('sumi', 40 + (i % 3) * 20, 40 + Math.floor(i / 3) * 20);
  let knots = 0;
  for (let f = 0; f < 60 * 4; f++) {
    const a = (f / 60) * 2.4; // run a circle of radius ~85 around (40,50)
    g.update(DT, { x: -Math.sin(a), y: Math.cos(a) });
    knots += g.fx.filter((e) => e.type === 'knot').length;
    g.fx.length = 0;
  }
  assert.ok(knots >= 1, 'running in a circle closes at least one loop');
  assert.ok(g.kills >= 3, `loop kills enemies inside (kills=${g.kills})`);
  console.log('ok  loop closing', { knots, kills: g.kills });
}

// 2. Every upgrade and evolution can be applied together without breaking the sim
{
  const g = new Game({ seed: 2, char: 'yui', god: true });
  for (const id of Object.keys(UPGRADES)) for (let i = 0; i < UPGRADES[id].max; i++) { g.levels[id] = (g.levels[id] || 0) + 1; if (!g.weapons.includes(id) && UPGRADES[id].kind !== 'passive') g.weapons.push(id); if (!g.passives.includes(id) && UPGRADES[id].kind === 'passive') g.passives.push(id); }
  for (const ev of Object.keys(EVOLUTIONS)) g.addUpgrade(ev);
  g.recalcStats();
  g.time = 300;
  const bot = new Bot(g, 'random');
  play(g, bot, 400);
  assert.notEqual(g.state, 'dead');
  console.log('ok  all upgrades + evolutions', { kills: g.kills, knots: g.knotCount, maxShots: g.shots.length });
}

// 3. Normal bot runs for a few minutes per character without exceptions
for (const [char, build] of [['yui', 'burst'], ['shirogane', 'razor'], ['ai', 'seal']]) {
  const g = new Game({ seed: 10, char });
  const bot = new Bot(g, build);
  play(g, bot, 150);
  assert.ok(g.level >= 3, `${char} levels up (lv=${g.level})`);
  assert.ok(g.knotCount >= 5, `${char} closes loops (${g.knotCount})`);
  console.log('ok  run', char, { t: Math.round(g.time), lvl: g.level, knots: g.knotCount, state: g.state });
}

// 4. Full progression with an invulnerable bot: all three bosses appear and the run can be won
{
  const g = new Game({ seed: 3, char: 'yui', god: true });
  const bot = new Bot(g, 'burst');
  const bosses = new Set();
  while (g.state !== 'win' && g.time < 1500) {
    if (g.state === 'levelup') { g.choose(bot.pickChoice(g.choices)); continue; }
    if (g.state === 'chest') { g.closeChest(); continue; }
    g.update(DT, bot.input(DT));
    for (const e of g.fx) if (e.type === 'bossSpawn') bosses.add(e.id);
    g.fx.length = 0;
  }
  assert.equal(bosses.size, 3, 'all bosses spawned');
  assert.equal(g.state, 'win', `run reaches the ending (t=${Math.round(g.time)})`);
  const r = g.results();
  assert.ok(r.won && r.spools > 0);
  console.log('ok  full run to ending', { t: Math.round(g.time), lvl: g.level, kills: g.kills });
}
console.log('smoke: all passed');
