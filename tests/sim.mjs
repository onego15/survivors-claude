// Headless balance / robustness simulation.
// Usage: node tests/sim.mjs [runs=8] [build=all] [skill=1]
import { Game } from '../src/game.js';
import { Bot, BUILDS } from '../src/bot.js';
import { CHARACTERS } from '../src/data.js';

const runs = +(process.argv[2] || 8);
const buildArg = process.argv[3] || 'all';
const skill = +(process.argv[4] || 1);
const builds = buildArg === 'all' ? Object.keys(BUILDS) : [buildArg];
const DT = 1 / 60;
const MAX_T = 900;

function runOne(seed, build, charId) {
  const g = new Game({ seed, char: charId, meta: {} });
  const bot = new Bot(g, build, { skill });
  let steps = 0, maxEnemies = 0, maxShots = 0, maxBullets = 0;
  const t0 = performance.now();
  let slowest = 0;
  const bossT = [];
  while (g.state !== 'dead' && g.state !== 'win' && g.time < MAX_T) {
    if (g.state === 'levelup') { g.choose(bot.pickChoice(g.choices)); continue; }
    if (g.state === 'chest') { g.closeChest(); continue; }
    const s0 = performance.now();
    g.update(DT, bot.input(DT));
    const s1 = performance.now() - s0;
    if (s1 > slowest) slowest = s1;
    g.fx.length = 0;
    steps++;
    maxEnemies = Math.max(maxEnemies, g.enemies.length);
    maxShots = Math.max(maxShots, g.shots.length);
    maxBullets = Math.max(maxBullets, g.ebullets.length);
    if (g.boss && !bossT.includes(g.boss.type)) bossT.push(g.boss.type);
    for (const e of g.enemies) if (!Number.isFinite(e.x) || !Number.isFinite(e.hp)) throw new Error('NaN enemy ' + e.type);
    if (!Number.isFinite(g.player.x) || !Number.isFinite(g.player.hp)) throw new Error('NaN player');
  }
  const r = g.results();
  return {
    seed, build, char: charId, state: g.state, time: g.time.toFixed(0), lvl: g.level, kills: g.kills, knots: g.knotCount,
    best: g.bestKnot, bosses: g.bossesDefeated, maxE: maxEnemies, maxShots, maxBullets, msPerStep: ((performance.now() - t0) / steps).toFixed(3),
    worstStep: slowest.toFixed(1), weapons: g.weapons.map((w) => w + g.lv(w) + (g.evolved[w] ? '*' : '')).join(','),
    passives: g.passives.map((w) => w + g.lv(w)).join(','),
    dmg: Object.entries(r.dmg).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + ':' + (v / 1000).toFixed(0) + 'k').join(' '),
    bossHp: g.boss ? `${g.boss.type} ${(g.boss.hp / g.boss.maxHp * 100).toFixed(0)}%` : '',
  };
}

const results = [];
let seed = 1000;
for (const build of builds) {
  for (let i = 0; i < runs; i++) {
    const charId = build === 'razor' ? 'shirogane' : build === 'seal' ? 'ai' : 'yui';
    const r = runOne(seed++, build, charId);
    results.push(r);
    console.log(JSON.stringify(r));
  }
}
const wins = results.filter((r) => r.state === 'win').length;
console.log(`\nwins ${wins}/${results.length}`);
for (const b of builds) {
  const rs = results.filter((r) => r.build === b);
  const avgT = rs.reduce((s, r) => s + +r.time, 0) / rs.length;
  console.log(`${b}: wins ${rs.filter((r) => r.state === 'win').length}/${rs.length} avgTime ${avgT.toFixed(0)} avgBosses ${(rs.reduce((s, r) => s + r.bosses, 0) / rs.length).toFixed(2)}`);
}
