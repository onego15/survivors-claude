// Core simulation for AYATORI YAKO. Pure logic: no DOM, so it can run headless for tests.
import {
  TAU, clamp, dist2, makeRng, segIntersect, polyArea, polyCentroid, polyBBox, pointInPoly,
  polyPerimeter, distSegSq, SpatialHash,
} from './util.js';
import {
  UPGRADES, EVOLUTIONS, CHARACTERS, ENEMIES, WAVES, EVENTS, BOSS_TIMES, RUN_LENGTH,
  MAX_WEAPONS, MAX_PASSIVES,
} from './data.js';

const PT_SPACING = 7;
const THREAD_MAX_AGE = 9;
const MIN_LOOP_AREA = 1700;
const CINCH = 0.16;

let nextId = 1;

export class Game {
  constructor(opts = {}) {
    this.seed = opts.seed ?? ((Math.random() * 1e9) | 0);
    this.rng = makeRng(this.seed);
    this.char = CHARACTERS.find((c) => c.id === (opts.char || 'yui')) || CHARACTERS[0];
    this.meta = opts.meta || {};
    this.view = { w: 1280, h: 760 };
    this.hash = new SpatialHash(64);

    this.state = 'play';
    this.time = 0;
    this.realTime = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNext = this.xpFor(1);
    this.pendingLevels = 0;
    this.choices = null;
    this.chest = null;
    this.rerolls = this.meta.reroll || 0;
    this.revives = this.meta.revive ? 1 : 0;
    this.hitstop = 0;
    this.slowmo = 0;

    this.levels = {};
    this.weapons = [];
    this.passives = [];
    this.evolved = {};

    this.player = {
      x: 0, y: 0, vx: 0, vy: 0, r: 12, hp: 100, maxHp: 100, inv: 0, face: 1,
      dashT: 0, dashCd: 0, dashDx: 0, dashDy: 0, moving: false, slowed: 0, regenAcc: 0,
    };
    this.thread = [];          // [{x,y,t}]
    this.threadLen = 0;
    this.enemies = [];
    this.shots = [];           // player projectiles
    this.ebullets = [];        // enemy projectiles
    this.pickups = [];
    this.zones = [];           // seal fields / black holes
    this.knots = [];           // pending cinch animations
    this.blasts = [];          // delayed explosions
    this.cranes = [];
    this.webs = [];            // boss hazards
    this.telegraphs = [];      // boss attack warnings
    this.fx = [];              // events for renderer / audio

    this.combo = 0;
    this.comboT = 0;
    this.bestKnot = 0;
    this.knotCount = 0;
    this.greatKnots = 0;
    this.totalDamage = 0;
    this.dmgBySource = {};
    this.spawnAcc = 0;
    this.eventIdx = 0;
    this.bossIdx = 0;
    this.boss = null;
    this.bossesDefeated = 0;
    this.won = false;
    this.endTimer = 0;
    this.weaponTimers = {};
    this.needleFrenzy = 0;
    this.foxAngle = 0;
    this.foxPhase = 0;
    this.stats = {};

    this.addUpgrade(this.char.start);
    if (this.char.charm) this.addUpgrade(this.char.charm);
    this.recalcStats();
    this.player.hp = this.player.maxHp;
  }

  // ---------------------------------------------------------------- progression
  xpFor(lv) { return Math.floor(5 + lv * 4.2 + Math.pow(lv, 1.72) * 0.55); }

  lv(id) { return this.levels[id] || 0; }

  recalcStats() {
    const m = this.meta, c = this.char.mods || {};
    const s = this.stats;
    const oldMax = this.player.maxHp;
    s.maxHp = 100 + (c.maxHp || 0) + (m.hp || 0) * 10 + this.lv('vigor') * 20;
    s.speed = 205 * (1 + 0.08 * this.lv('swift')) * (c.speed || 1) * (1 + 0.03 * (m.speed || 0));
    s.magnet = 72 * (1 + 0.35 * this.lv('magnet')) * (1 + 0.12 * (m.magnet || 0));
    s.armor = this.lv('ward');
    s.invTime = 0.5 * (1 + 0.1 * this.lv('ward'));
    s.regen = 0.25 * this.lv('vigor');
    s.threadLen = (960 + 14 * (this.level - 1)) * (1 + 0.18 * this.lv('longthread')) * (c.threadLen || 1) * (1 + 0.06 * (m.thread || 0)) * (this.evolved.razor ? 1.3 : 1);
    s.knotMul = (1 + 0.15 * this.lv('steel')) * (1 + 0.06 * (m.knot || 0));
    s.cdMul = 1 - 0.08 * this.lv('haste');
    s.crit = 0.04 + 0.06 * this.lv('luck');
    s.xpMul = 1 + 0.05 * (m.xp || 0);
    s.choices = this.lv('luck') >= 3 ? 4 : 3;
    this.player.maxHp = s.maxHp;
    if (s.maxHp > oldMax) this.player.hp += s.maxHp - oldMax;
    this.player.hp = Math.min(this.player.hp, s.maxHp);
  }

  addUpgrade(id) {
    if (EVOLUTIONS[id]) {
      const ev = EVOLUTIONS[id];
      this.evolved[ev.from] = true;
      this.emit({ type: 'evolve', id, from: ev.from });
      this.recalcStats();
      return;
    }
    const up = UPGRADES[id];
    if (!this.levels[id]) {
      if (up.kind === 'passive') this.passives.push(id); else this.weapons.push(id);
    }
    this.levels[id] = (this.levels[id] || 0) + 1;
    this.recalcStats();
  }

  availableEvolutions() {
    const out = [];
    for (const w of this.weapons) {
      const up = UPGRADES[w];
      if (up.evolve && !this.evolved[w] && this.lv(w) >= up.max && this.lv(up.evolve.with) > 0) out.push(up.evolve.into);
    }
    return out;
  }

  buildPool() {
    const pool = [];
    for (const [id, up] of Object.entries(UPGRADES)) {
      const l = this.lv(id);
      if (l >= up.max) continue;
      if (l === 0) {
        if (up.kind === 'passive' && this.passives.length >= MAX_PASSIVES) continue;
        if (up.kind !== 'passive' && this.weapons.length >= MAX_WEAPONS) continue;
      }
      let w = l > 0 ? 1.35 : 1;
      if (up.kind === 'art' && l === 0) w *= 1.15;
      pool.push({ id, w });
    }
    return pool;
  }

  rollChoices() {
    const n = this.stats.choices;
    const out = [];
    const evos = this.availableEvolutions();
    if (evos.length) out.push(evos[Math.floor(this.rng() * evos.length)]);
    const pool = this.buildPool();
    while (out.length < n && pool.length) {
      let tot = 0; for (const p of pool) tot += p.w;
      let r = this.rng() * tot, k = 0;
      for (; k < pool.length - 1; k++) { r -= pool[k].w; if (r <= 0) break; }
      out.push(pool[k].id); pool.splice(k, 1);
    }
    if (out.length === 0) out.push('_heal', '_spool');
    return out;
  }

  openLevelUp() {
    this.state = 'levelup';
    this.choices = this.rollChoices();
  }

  reroll() {
    if (this.state !== 'levelup' || this.rerolls <= 0) return false;
    this.rerolls--;
    this.choices = this.rollChoices();
    return true;
  }

  choose(i) {
    if (this.state !== 'levelup' || !this.choices) return;
    const id = this.choices[i];
    if (id == null) return;
    this.applyChoice(id);
    this.pendingLevels--;
    this.choices = null;
    if (this.pendingLevels > 0) this.openLevelUp(); else this.state = 'play';
  }

  applyChoice(id) {
    if (id === '_heal') { this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40); this.emit({ type: 'heal' }); }
    else if (id === '_spool') { this.bonusSpools = (this.bonusSpools || 0) + 15; }
    else this.addUpgrade(id);
  }

  openChest(count) {
    const items = [];
    for (let i = 0; i < count; i++) {
      const evos = this.availableEvolutions().filter((e) => !items.includes(e));
      if (evos.length) { const e = evos[0]; items.push(e); this.addUpgrade(e); continue; }
      const pool = this.buildPool().filter((p) => this.lv(p.id) > 0 || this.weapons.length + this.passives.length < 4);
      const owned = pool.filter((p) => this.lv(p.id) > 0);
      const src = owned.length ? owned : pool;
      if (!src.length) { items.push('_heal'); this.applyChoice('_heal'); continue; }
      const pick = src[Math.floor(this.rng() * src.length)].id;
      items.push(pick); this.addUpgrade(pick);
    }
    this.chest = { items };
    this.state = 'chest';
    this.emit({ type: 'chest', items });
  }

  closeChest() {
    if (this.state !== 'chest') return;
    this.chest = null;
    this.state = 'play';
    if (this.pendingLevels > 0) this.openLevelUp();
  }

  emit(e) { this.fx.push(e); }

  // ---------------------------------------------------------------- main update
  update(dt, input) {
    this.realTime += dt;
    if (this.state === 'dead' || this.state === 'win') return;
    if (this.state !== 'play') return;
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    if (this.slowmo > 0) { this.slowmo -= dt; dt *= 0.35; }
    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) { this.state = 'win'; this.emit({ type: 'win' }); return; }
    }
    this.time += dt;

    this.hash.clear();
    for (const e of this.enemies) if (!e.boss) this.hash.insert(e);

    this.updatePlayer(dt, input || { x: 0, y: 0 });
    this.updateThread();
    this.updateDirector(dt);
    this.updateEnemies(dt);
    this.updateWeapons(dt);
    this.updateShots(dt);
    this.updateKnots(dt);
    this.updateBlasts(dt);
    this.updateZones(dt);
    this.updateCranes(dt);
    this.updateHazards(dt);
    this.updateEBullets(dt);
    this.updatePickups(dt);

    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }

    // cleanup
    if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);

    if (this.player.hp <= 0 && this.state === 'play') {
      if (this.revives > 0) {
        this.revives--;
        this.player.hp = this.player.maxHp * 0.6;
        this.player.inv = 2.5;
        this.ringBlast(this.player.x, this.player.y, 400, 9999, true);
        this.emit({ type: 'revive' });
      } else {
        this.state = 'dead';
        this.emit({ type: 'dead' });
      }
    }
    if (this.state === 'play' && this.pendingLevels > 0 && !this.endTimer) this.openLevelUp();
  }

  // ---------------------------------------------------------------- player
  updatePlayer(dt, input) {
    const p = this.player, s = this.stats;
    p.inv = Math.max(0, p.inv - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.slowed = Math.max(0, p.slowed - dt);
    let ix = input.x || 0, iy = input.y || 0;
    const il = Math.hypot(ix, iy);
    if (il > 1) { ix /= il; iy /= il; }
    p.moving = il > 0.05;
    if (input.dash && p.dashCd <= 0 && p.dashT <= 0) {
      let dx = ix, dy = iy;
      if (!p.moving) { dx = p.vx; dy = p.vy; const l = Math.hypot(dx, dy); if (l < 1) { dx = p.face; dy = 0; } else { dx /= l; dy /= l; } }
      else { const l = Math.hypot(dx, dy); dx /= l; dy /= l; }
      p.dashT = 0.17; p.dashDx = dx; p.dashDy = dy;
      p.dashCd = 2.0 * s.cdMul;
      this.emit({ type: 'dash', x: p.x, y: p.y });
    }
    let spd = s.speed * (p.slowed > 0 ? 0.55 : 1);
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dashDx * spd * 3.3; p.vy = p.dashDy * spd * 3.3;
    } else {
      // light acceleration for weight, but snappy
      const tx = ix * spd, ty = iy * spd;
      const k = Math.min(1, dt * 18);
      p.vx += (tx - p.vx) * k; p.vy += (ty - p.vy) * k;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (Math.abs(p.vx) > 5) p.face = p.vx > 0 ? 1 : -1;
    if (s.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + s.regen * dt);
  }

  hurtPlayer(dmg, srcX, srcY) {
    const p = this.player;
    if (p.inv > 0 || p.dashT > 0 || this.endTimer > 0) return;
    const d = Math.max(1, dmg - this.stats.armor);
    p.hp -= d;
    p.inv = this.stats.invTime;
    this.emit({ type: 'hurt', dmg: d, x: p.x, y: p.y });
  }

  // ---------------------------------------------------------------- thread & loops
  updateThread() {
    const p = this.player, th = this.thread, now = this.time;
    // age-out
    while (th.length > 1 && now - th[0].t > THREAD_MAX_AGE) this.dropFront();
    if (th.length === 0) { th.push({ x: p.x, y: p.y, t: now, d: 0 }); return; }
    const last = th[th.length - 1];
    const dx = p.x - last.x, dy = p.y - last.y;
    const d = Math.hypot(dx, dy);
    if (d < PT_SPACING) return;
    // subdivide fast movement (dash) for robust intersection
    const steps = Math.min(8, Math.floor(d / PT_SPACING));
    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      const nx = last.x + dx * f, ny = last.y + dy * f;
      if (this.addThreadPoint(nx, ny, now)) break;
    }
    // trim length
    const maxLen = this.stats.threadLen;
    while (th.length > 2 && this.threadLen > maxLen) this.dropFront();
  }

  dropFront() {
    const th = this.thread;
    if (th.length > 1) this.threadLen -= th[1].d;
    th.shift();
    if (th.length) th[0].d = 0;
  }

  // returns true if a loop closed (thread reset)
  addThreadPoint(x, y, t) {
    const th = this.thread;
    const n = th.length;
    const a = th[n - 1];
    // check new segment a->(x,y) against older segments (skip adjacent)
    for (let i = n - 3; i >= 0; i--) {
      const s0 = th[i], s1 = th[i + 1];
      const hit = segIntersect(a.x, a.y, x, y, s0.x, s0.y, s1.x, s1.y);
      if (!hit) continue;
      const poly = [hit.x, hit.y];
      for (let k = i + 1; k < n; k++) poly.push(th[k].x, th[k].y);
      const area = polyArea(poly);
      if (area < MIN_LOOP_AREA) continue;
      this.closeLoop(poly, area);
      this.thread = [{ x: hit.x, y: hit.y, t, d: 0 }, { x, y, t, d: Math.hypot(x - hit.x, y - hit.y) }];
      this.threadLen = this.thread[1].d;
      return true;
    }
    const d = Math.hypot(x - a.x, y - a.y);
    th.push({ x, y, t, d });
    this.threadLen += d;
    return false;
  }

  // Remove thread up to index i (inclusive) — the older part is severed
  cutThread(i, x, y) {
    const th = this.thread;
    if (i < 0 || i >= th.length - 1) return;
    let removed = 0;
    for (let k = 1; k <= i + 1 && k < th.length; k++) removed += th[k].d;
    th.splice(0, i + 1);
    this.threadLen = Math.max(0, this.threadLen - removed);
    if (th.length) th[0].d = 0;
    this.emit({ type: 'cut', x, y });
  }

  // Nearest older thread point that would close a loop with the player (for UI preview)
  previewLoop() {
    const th = this.thread, p = this.player;
    const n = th.length;
    if (n < 12) return null;
    let best = -1, bd = 46 * 46;
    for (let i = 0; i < n - 10; i++) {
      const d = dist2(th[i].x, th[i].y, p.x, p.y);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return null;
    const poly = [];
    for (let k = best; k < n; k++) poly.push(th[k].x, th[k].y);
    poly.push(p.x, p.y);
    if (polyArea(poly) < MIN_LOOP_AREA) return null;
    return poly;
  }

  closeLoop(poly, area) {
    const c = polyCentroid(poly);
    const bb = polyBBox(poly);
    const knot = {
      id: nextId++, poly, bb, cx: c.x, cy: c.y, area, perim: polyPerimeter(poly),
      t: 0, delay: CINCH + (this.lv('gravity') ? 0.08 : 0), ratio: 1, echo: false,
    };
    this.knots.push(knot);
    this.knotCount++;
    this.emit({ type: 'knotStart', poly, cx: c.x, cy: c.y });

    // Harvest pickups inside the loop
    for (const pk of this.pickups) {
      if (pk.x >= bb.x0 && pk.x <= bb.x1 && pk.y >= bb.y0 && pk.y <= bb.y1 && pointInPoly(pk.x, pk.y, poly)) pk.attract = true;
    }
    // Gravity: pull nearby enemies into the loop
    const gl = this.lv('gravity');
    if (gl) {
      const st = UPGRADES.gravity.stat(gl - 1);
      const rad = Math.sqrt(area / Math.PI);
      const reach = rad + st.reach * (this.evolved.gravity ? 1.4 : 1);
      this.hash.query(c.x, c.y, reach, (e) => {
        if (e.boss || e.dead) return;
        if (dist2(e.x, e.y, c.x, c.y) > reach * reach) return;
        e.pull = { x: c.x + (this.rng() - 0.5) * rad * 0.8, y: c.y + (this.rng() - 0.5) * rad * 0.8, t: knot.delay };
      });
      this.emit({ type: 'gravity', x: c.x, y: c.y, r: reach });
    }
  }

  updateKnots(dt) {
    for (const k of this.knots) {
      k.t += dt;
      if (!k.applied && k.t >= k.delay) { k.applied = true; this.snapKnot(k); }
    }
    this.knots = this.knots.filter((k) => !k.applied);
  }

  snapKnot(k) {
    const { poly, bb } = k;
    const captured = [];
    let weight = 0;
    this.hash.queryRect(bb.x0, bb.y0, bb.x1, bb.y1, (e) => {
      if (e.dead) return;
      if (pointInPoly(e.x, e.y, poly)) { captured.push(e); weight += e.boss ? 6 : e.elite ? 3 : 1; }
    });
    // bosses may be bigger than a hash cell; check them explicitly
    if (this.boss && !this.boss.dead && !captured.includes(this.boss) && pointInPoly(this.boss.x, this.boss.y, poly)) {
      captured.push(this.boss); weight += 6;
    }
    const n = captured.length;
    if (!k.echo) {
      if (this.comboT > 0) this.combo++; else this.combo = 1;
      this.comboT = 2.6;
    }
    const mult = Math.min(1 + 0.1 * Math.max(0, weight - 1), 5);
    const comboMul = 1 + Math.min(this.combo - 1, 10) * 0.06;
    const crit = this.rng() < this.stats.crit;
    const base = (18 + this.level * 2.4) * this.stats.knotMul;
    const dmg = base * mult * comboMul * (crit ? 2 : 1) * k.ratio;
    for (const e of captured) {
      this.damage(e, dmg, 'knot', { crit, big: true, nokb: true });
      e.stun = Math.max(e.stun || 0, 0.35);
    }
    if (!k.echo) this.bestKnot = Math.max(this.bestKnot, n);
    this.emit({ type: 'knot', poly, cx: k.cx, cy: k.cy, n, dmg, crit, echo: k.echo, combo: this.combo, mult, area: k.area });

    if (n >= 8 && !k.echo) this.hitstop = Math.min(0.08, 0.03 + n * 0.002);
    if (n >= 15 && !k.echo) {
      this.greatKnots++;
      this.emit({ type: 'greatKnot', n, cx: k.cx, cy: k.cy });
      if (this.rng() < 0.4) this.dropPickup(k.cx, k.cy, 'heal', 30);
    }
    if (k.echo) {
      // echoes trigger only the cheap arts
      return;
    }
    this.triggerArts(k, captured, dmg);
  }

  triggerArts(k, captured, dmg) {
    const capSet = new Set(captured);
    // Burst
    const bl = this.lv('burst');
    if (bl) {
      const st = UPGRADES.burst.stat(bl - 1);
      const ev = this.evolved.burst;
      const R = st.radius * (ev ? 1.6 : 1), D = st.dmg * (ev ? 1.6 : 1) * this.stats.knotMul;
      let cnt = 0;
      for (const e of captured) {
        if (cnt++ > 26) break;
        this.blasts.push({ x: e.x, y: e.y, r: R, dmg: D, t: 0.05 + cnt * 0.012, kind: ev ? 'bloom' : 'burst' });
        if (ev && cnt < 12) {
          for (let j = 0; j < 3; j++) {
            const a = this.rng() * TAU;
            this.blasts.push({ x: e.x + Math.cos(a) * R * 0.9, y: e.y + Math.sin(a) * R * 0.9, r: R * 0.6, dmg: D * 0.6, t: 0.22 + j * 0.06, kind: 'bloom2' });
          }
        }
      }
    }
    // Thunder
    const tl = this.lv('thunder');
    if (tl) {
      const st = UPGRADES.thunder.stat(tl - 1);
      const ev = this.evolved.thunder;
      const arcs = ev ? st.arcs + 5 : st.arcs;
      const chain = ev ? 5 : st.chain;
      const range = ev ? 460 : st.range;
      const D = st.dmg * (ev ? 1.4 : 1);
      const cand = [];
      this.hash.query(k.cx, k.cy, range, (e) => {
        if (e.dead || capSet.has(e)) return;
        const d = dist2(e.x, e.y, k.cx, k.cy);
        if (d < range * range) cand.push([d, e]);
      });
      const bo = this.boss;
      if (bo && !bo.dead && !capSet.has(bo) && dist2(bo.x, bo.y, k.cx, k.cy) < range * range) cand.push([0, bo]);
      cand.sort((a, b) => a[0] - b[0]);
      const used = new Set();
      for (let i = 0; i < Math.min(arcs, cand.length); i++) {
        let e = cand[i][1];
        if (used.has(e)) continue;
        const pts = [k.cx, k.cy, e.x, e.y];
        used.add(e); this.damage(e, D, 'thunder', {});
        for (let c = 0; c < chain; c++) {
          let best = null, bd = 150 * 150;
          this.hash.query(e.x, e.y, 150, (o) => {
            if (o.dead || used.has(o)) return;
            const d = dist2(o.x, o.y, e.x, e.y);
            if (d < bd) { bd = d; best = o; }
          });
          if (!best) break;
          used.add(best); this.damage(best, D * 0.8, 'thunder', {});
          pts.push(best.x, best.y); e = best;
        }
        this.emit({ type: 'arc', pts, ev });
      }
      if (cand.length === 0) this.emit({ type: 'arc', pts: [k.cx, k.cy, k.cx + (this.rng() - 0.5) * 120, k.cy - 140], ev });
    }
    // Seal field
    const sl = this.lv('seal');
    if (sl) {
      const st = UPGRADES.seal.stat(sl - 1);
      const ev = this.evolved.seal;
      if (this.zones.filter((z) => z.kind === 'seal').length > 7) this.zones.shift();
      this.zones.push({ kind: 'seal', poly: k.poly, bb: k.bb, cx: k.cx, cy: k.cy, life: ev ? st.life + 4 : st.life, max: ev ? st.life + 4 : st.life,
        dps: st.dps * (ev ? 1.5 : 1) * this.stats.knotMul, slow: st.slow, kekkai: ev, tick: 0 });
    }
    // Gravity evolved: black hole
    if (this.evolved.gravity) {
      this.zones.push({ kind: 'hole', cx: k.cx, cy: k.cy, r: 240, life: 2.6, max: 2.6, dps: 40 * this.stats.knotMul, tick: 0 });
    }
    // Petals
    const pl = this.lv('petal');
    if (pl) {
      const st = UPGRADES.petal.stat(pl - 1);
      const ev = this.evolved.petal;
      const count = Math.min(60, st.count * (ev ? 2 : 1));
      const poly = k.poly, np = poly.length / 2;
      for (let i = 0; i < count; i++) {
        const idx = Math.floor((i / count) * np) * 2;
        const x = poly[idx], y = poly[idx + 1];
        let dx = x - k.cx, dy = y - k.cy; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const sp = 360 + this.rng() * 80;
        this.shots.push({ kind: 'petal', x, y, vx: dx * sp, vy: dy * sp, r: 9, dmg: st.dmg * (ev ? 1.3 : 1), pierce: st.pierce + (ev ? 2 : 0), life: ev ? 1.6 : 0.95, homing: ev, hit: new Set(), rot: this.rng() * TAU });
      }
    }
    // Echo
    const el = this.lv('echo');
    if (el) {
      const st = UPGRADES.echo.stat(el - 1);
      const ev = this.evolved.echo;
      const count = ev ? 3 : st.echoes;
      for (let i = 0; i < count; i++) {
        this.knots.push({ ...k, id: nextId++, t: -(0.45 + i * 0.4), applied: false, echo: true, ratio: ev ? 0.85 : st.ratio });
      }
    }
    // Cranes
    const cl = this.lv('shiki');
    if (cl) {
      const st = UPGRADES.shiki.stat(cl - 1);
      const ev = this.evolved.shiki;
      const num = Math.min(st.cap, st.base + Math.floor(captured.length / st.per)) - (ev ? 1 : 0);
      const alive = this.cranes.length;
      for (let i = 0; i < Math.max(ev ? 1 : 1, num) && alive + i < 14; i++) {
        const a = this.rng() * TAU;
        this.cranes.push({ x: k.cx, y: k.cy, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: st.life + (ev ? 2 : 0), dmg: st.dmg * (ev ? 2.2 : 1), phoenix: ev, target: null, cd: 0, r: ev ? 22 : 12 });
      }
    }
    // Charms react to loops
    if (this.lv('needle')) {
      this.needleFrenzy = 2.2;
      if (this.evolved.needle) {
        const D = UPGRADES.needle.stat(this.lv('needle') - 1).dmg * 1.3;
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * TAU;
          this.shots.push({ kind: 'needle', x: this.player.x, y: this.player.y, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, r: 6, dmg: D, pierce: 3, life: 1.0, hit: new Set(), rot: a });
        }
      }
    }
    if (this.lv('bell')) this.weaponTimers.bell = 0;
  }

  // ---------------------------------------------------------------- damage
  damage(e, amount, src, opts = {}) {
    if (e.dead || amount <= 0) return;
    if (e.boss && e.invuln > 0) return;
    e.hp -= amount;
    e.flash = 0.1;
    this.totalDamage += amount;
    this.dmgBySource[src] = (this.dmgBySource[src] || 0) + amount;
    if (!opts.nokb && !e.boss && opts.kx !== undefined) {
      const m = e.def.mass * (e.elite ? 3 : 1);
      e.kx += opts.kx / m; e.ky += opts.ky / m;
    }
    if (opts.big || amount >= 8 || e.boss) this.emit({ type: 'hit', x: e.x, y: e.y - e.r, dmg: amount, crit: opts.crit, big: opts.big, src });
    if (e.hp <= 0) this.kill(e, src);
  }

  kill(e, src) {
    e.dead = true;
    this.kills++;
    this.emit({ type: 'kill', x: e.x, y: e.y, kind: e.type, elite: e.elite, boss: e.boss, r: e.r, src });
    if (e.boss) { this.onBossDead(e); return; }
    let v = e.xp * (e.elite ? 12 : 1);
    this.dropPickup(e.x, e.y, 'xp', v);
    if (e.elite) this.dropPickup(e.x, e.y, 'chest', 1);
    else if (this.rng() < 0.0035) this.dropPickup(e.x, e.y, 'heal', 25);
    else if (this.rng() < 0.0015) this.dropPickup(e.x, e.y, 'charm', 0);
  }

  dropPickup(x, y, kind, v) {
    if (kind === 'xp' && this.pickups.length > 420) {
      // merge into an existing nearby bead to cap object count
      let best = null, bd = Infinity;
      for (let i = 0; i < this.pickups.length; i += 3) {
        const p = this.pickups[i];
        if (p.kind !== 'xp' || p.attract) continue;
        const d = dist2(p.x, p.y, x, y);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) { best.v += v; return; }
    }
    const a = this.rng() * TAU;
    this.pickups.push({ kind, x, y, v, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, attract: false, t: 0 });
  }

  ringBlast(x, y, r, dmg, pushBullets) {
    this.hash.query(x, y, r, (e) => {
      if (e.dead) return;
      const d2 = dist2(e.x, e.y, x, y);
      if (d2 > (r + e.r) * (r + e.r)) return;
      const d = Math.sqrt(d2) || 1;
      this.damage(e, e.boss ? Math.min(dmg, 300) : dmg, 'bell', { kx: ((e.x - x) / d) * 420, ky: ((e.y - y) / d) * 420 });
    });
    const b = this.boss;
    if (b && !b.dead && dist2(b.x, b.y, x, y) < (r + b.r) ** 2) this.damage(b, Math.min(dmg, 300), 'bell', {});
    if (pushBullets) this.ebullets = this.ebullets.filter((b) => dist2(b.x, b.y, x, y) > r * r);
  }

  // ---------------------------------------------------------------- director
  hpScale() { const t = this.time; return 1 + t / 95 + Math.pow(t / 300, 2) * 1.6; }
  dmgScale() { return 1 + this.time / 420; }

  currentWave() {
    let w = WAVES[0];
    for (const x of WAVES) if (this.time >= x.t) w = x;
    return w;
  }

  updateDirector(dt) {
    // bosses
    if (this.bossIdx < BOSS_TIMES.length && this.time >= BOSS_TIMES[this.bossIdx] && !this.boss) {
      const id = ['obasami', 'hyakume', 'jorou'][this.bossIdx];
      this.bossIdx++;
      this.spawnBoss(id);
    }
    // scripted events
    while (this.eventIdx < EVENTS.length && this.time >= EVENTS[this.eventIdx].t) {
      this.runEvent(EVENTS[this.eventIdx++]);
    }
    const w = this.currentWave();
    const cap = 140 + this.time * 0.42;
    let rate = w.rate;
    if (this.boss) rate *= this.boss.def.boss === 3 ? 0.45 : 0.55;
    if (this.endTimer > 0) rate = 0;
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.enemies.length >= cap) continue;
      this.spawnEnemy(this.pickWeighted(w.w));
    }
  }

  pickWeighted(w) {
    let tot = 0; for (const k in w) tot += w[k];
    let r = this.rng() * tot;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return Object.keys(w)[0];
  }

  spawnRadius() { return Math.hypot(this.view.w, this.view.h) / 2 + 60; }

  spawnEnemy(type, x, y, opts = {}) {
    const def = ENEMIES[type];
    if (x === undefined) {
      const a = this.rng() * TAU, R = this.spawnRadius();
      // bias spawns toward movement direction a little
      x = this.player.x + Math.cos(a) * R; y = this.player.y + Math.sin(a) * R;
    }
    const hs = def.boss ? 1 : this.hpScale();
    const elite = !!opts.elite;
    const e = {
      id: nextId++, type, def, x, y, vx: 0, vy: 0, kx: 0, ky: 0,
      r: def.r * (elite ? 1.55 : 1), hp: def.hp * hs * (elite ? 11 : 1), maxHp: 0,
      spd: def.spd * (0.92 + this.rng() * 0.16) * (elite ? 0.9 : 1), dmg: def.dmg * (def.boss ? 1 : this.dmgScale()) * (elite ? 1.4 : 1),
      xp: def.xp, elite, boss: def.boss || 0, flash: 0, stun: 0, slow: 0, timer: this.rng() * 2, state: 0,
      phase: this.rng() * TAU, razorCd: 0, foxCd: 0, hitCd: 0, dead: false,
    };
    e.maxHp = e.hp;
    if (opts.vx !== undefined) { e.vx = opts.vx; e.vy = opts.vy; }
    this.enemies.push(e);
    return e;
  }

  runEvent(ev) {
    const p = this.player;
    if (ev.type === 'ring') {
      const R = Math.min(this.view.w, this.view.h) * 0.62;
      for (let i = 0; i < ev.count; i++) {
        const a = (i / ev.count) * TAU;
        this.spawnEnemy(ev.kind, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R);
      }
      this.emit({ type: 'warn', text: '包囲！ 大きな輪で一網打尽にしよう' });
    } else if (ev.type === 'school') {
      const a = this.rng() * TAU;
      const R = this.spawnRadius();
      const sx = p.x + Math.cos(a) * R, sy = p.y + Math.sin(a) * R;
      const dirx = -Math.cos(a), diry = -Math.sin(a);
      const nx = -diry, ny = dirx;
      for (let i = 0; i < ev.count; i++) {
        const row = Math.floor(i / 6), col = (i % 6) - 2.5;
        this.spawnEnemy('kamiuo', sx + nx * col * 30 - dirx * row * 34, sy + ny * col * 30 - diry * row * 34,
          { vx: dirx * 150, vy: diry * 150 });
      }
      this.emit({ type: 'warn', text: '紙魚の群れが来る' });
    } else if (ev.type === 'elite') {
      this.spawnEnemy(ev.kind, undefined, undefined, { elite: true });
    }
  }

  spawnBoss(id) {
    const p = this.player;
    const a = this.rng() * TAU;
    const b = this.spawnEnemy(id, p.x + Math.cos(a) * 520, p.y + Math.sin(a) * 520);
    b.invuln = 1.2;
    b.state = 'enter'; b.timer = 1.2;
    this.boss = b;
    this.webs = [];
    this.emit({ type: 'bossSpawn', id, name: b.def.name, title: b.def.title });
  }

  onBossDead(b) {
    this.boss = null;
    this.bossesDefeated++;
    this.webs = [];
    this.telegraphs = [];
    this.ebullets = [];
    this.emit({ type: 'bossDead', id: b.type, x: b.x, y: b.y });
    this.hitstop = 0.12;
    if (b.def.boss === 3) {
      this.won = true;
      this.endTimer = 3.2;
      this.slowmo = 1.2;
      // clear the field
      for (const e of this.enemies) if (!e.dead && e !== b) { e.dead = true; this.emit({ type: 'kill', x: e.x, y: e.y, kind: e.type, r: e.r, src: 'end' }); }
    } else {
      this.dropPickup(b.x, b.y, 'chest', 3);
      for (let i = 0; i < 14; i++) this.dropPickup(b.x + (this.rng() - 0.5) * 80, b.y + (this.rng() - 0.5) * 80, 'xp', Math.ceil(b.xp / 14) * 3);
    }
  }

  // ---------------------------------------------------------------- enemies
  updateEnemies(dt) {
    const p = this.player;
    const despawn2 = (this.spawnRadius() + 500) ** 2;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt);
      e.timer -= dt;
      let sp = e.spd * (e.slow > 0 ? 0.55 : 1) * (e.tangle > 0 ? 0.3 : 1);
      e.slow = Math.max(0, e.slow - dt);
      if (e.tangle > 0) e.tangle -= dt;
      e.razorCd -= dt; e.foxCd -= dt; e.hitCd -= dt;
      if (e.invuln > 0) e.invuln -= dt;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let tx = 0, ty = 0; // desired velocity

      if (e.pull) {
        e.pull.t -= dt;
        const k = Math.min(1, dt * 14);
        e.x += (e.pull.x - e.x) * k; e.y += (e.pull.y - e.y) * k;
        if (e.pull.t <= 0) e.pull = null;
        continue;
      }
      if (e.stun > 0) { e.stun -= dt; sp *= 0.1; }

      if (e.boss) { this.updateBoss(e, dt, dx, dy, d); }
      else switch (e.def.ai) {
        case 'chase': {
          const wob = Math.sin(this.time * 2 + e.phase) * 0.25;
          tx = (dx / d) * sp + (-dy / d) * sp * wob; ty = (dy / d) * sp + (dx / d) * sp * wob;
          break;
        }
        case 'dasher': {
          if (e.state === 0) {
            tx = (dx / d) * sp; ty = (dy / d) * sp;
            if (d < 300 && e.timer <= 0) { e.state = 1; e.timer = 0.55; e.ax = dx / d; e.ay = dy / d; }
          } else if (e.state === 1) {
            tx = 0; ty = 0; e.ax = dx / d; e.ay = dy / d;
            if (e.timer <= 0) { e.state = 2; e.timer = 0.5; this.emit({ type: 'dashE', x: e.x, y: e.y }); }
          } else {
            tx = e.ax * 330 * (e.elite ? 1.1 : 1); ty = e.ay * 330;
            if (e.timer <= 0) { e.state = 0; e.timer = 2.2 + this.rng(); }
          }
          break;
        }
        case 'ranged': {
          const want = 240;
          const f = d > want + 30 ? 1 : d < want - 40 ? -1 : 0;
          tx = (dx / d) * sp * f + (-dy / d) * sp * 0.5; ty = (dy / d) * sp * f + (dx / d) * sp * 0.5;
          if (e.timer <= 0 && d < 520) {
            e.timer = 2.6 + this.rng() * 0.8;
            const s = 175;
            const shots = e.elite ? 5 : 1;
            for (let i = 0; i < shots; i++) {
              const a = Math.atan2(dy, dx) + (i - (shots - 1) / 2) * 0.22;
              this.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 8, dmg: e.dmg * 1.3, life: 4, kind: 'fire' });
            }
            this.emit({ type: 'eshot', x: e.x, y: e.y });
          }
          break;
        }
        case 'cutter': {
          // hunt the thread
          const th = this.thread;
          let target = null;
          if (th.length > 8) {
            let bd = 380 * 380;
            for (let i = 0; i < th.length - 4; i += 3) {
              const q = th[i]; const dd = dist2(q.x, q.y, e.x, e.y);
              if (dd < bd) { bd = dd; target = i; }
            }
          }
          if (target !== null) {
            const q = th[target];
            const qx = q.x - e.x, qy = q.y - e.y, ql = Math.hypot(qx, qy) || 1;
            tx = (qx / ql) * sp * 1.1; ty = (qy / ql) * sp * 1.1;
            // snip
            if (e.timer <= 0) {
              for (let i = Math.max(0, target - 6); i < Math.min(th.length - 2, target + 6); i++) {
                if (dist2(th[i].x, th[i].y, e.x, e.y) < (e.r + 5) ** 2) { this.cutThread(i, th[i].x, th[i].y); e.timer = 3.2; e.stun = 1.4; break; }
              }
            }
          } else { tx = (dx / d) * sp; ty = (dy / d) * sp; }
          break;
        }
        case 'school': {
          tx = e.vx; ty = e.vy;
          if (dist2(e.x, e.y, p.x, p.y) > despawn2) e.dead = true;
          break;
        }
      }

      if (!e.boss) {
        // separation
        let sx = 0, sy = 0;
        const rr = e.r * 2;
        this.hash.query(e.x, e.y, rr, (o) => {
          if (o === e || o.dead) return;
          const ox = e.x - o.x, oy = e.y - o.y;
          const dd = ox * ox + oy * oy;
          const min = e.r + o.r;
          if (dd < min * min && dd > 0.01) {
            const dl = Math.sqrt(dd);
            const push = (min - dl) / min;
            const w = o.boss ? 4 : (o.def.mass / (e.def.mass + o.def.mass)) * 2;
            sx += (ox / dl) * push * w; sy += (oy / dl) * push * w;
          }
        });
        tx += sx * 120; ty += sy * 120;
        const k = Math.min(1, dt * 8);
        e.vx += (tx - e.vx) * k; e.vy += (ty - e.vy) * k;
        if (e.def.ai === 'school') { e.vx = tx; e.vy = ty; }
        e.x += (e.vx + e.kx) * dt; e.y += (e.vy + e.ky) * dt;
        const kd = Math.pow(0.0008, dt);
        e.kx *= kd; e.ky *= kd;
        // recycle enemies left far behind
        if (e.def.ai !== 'school' && dist2(e.x, e.y, p.x, p.y) > despawn2) {
          const a = Math.atan2(p.vy || 0.01, p.vx || 0.01) + (this.rng() - 0.5) * 1.6;
          const R = this.spawnRadius();
          e.x = p.x + Math.cos(a) * R; e.y = p.y + Math.sin(a) * R;
        }
      }

      // contact with player
      const cr = e.r + p.r - 3;
      if (dist2(e.x, e.y, p.x, p.y) < cr * cr && !e.pull) this.hurtPlayer(e.dmg, e.x, e.y);
    }
  }

  // ---------------------------------------------------------------- bosses
  updateBoss(b, dt, dx, dy, d) {
    const p = this.player;
    const hpf = b.hp / b.maxHp;
    const mv = (vx, vy, k = 4) => { const kk = Math.min(1, dt * k); b.vx += (vx - b.vx) * kk; b.vy += (vy - b.vy) * kk; };
    if (b.state === 'enter') {
      mv(0, 0);
      if (b.timer <= 0) { b.state = 'idle'; b.timer = 1.5; }
    } else if (b.def.ai === 'boss_scissors') {
      if (b.state === 'idle') {
        mv((dx / d) * b.spd, (dy / d) * b.spd);
        if (b.timer <= 0) {
          b.state = 'aim'; b.timer = hpf < 0.5 ? 0.6 : 0.85; b.charges = hpf < 0.5 ? 2 : 1;
          b.ax = dx / d; b.ay = dy / d;
          this.telegraphs.push({ kind: 'line', x: b.x, y: b.y, dx: b.ax, dy: b.ay, len: 640, w: b.r * 1.6, t: b.timer, max: b.timer, owner: b.id });
          this.emit({ type: 'telegraph', x: b.x, y: b.y });
        }
        b.summon = (b.summon ?? 6) - dt;
        if (b.summon <= 0) {
          b.summon = 8;
          for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; this.spawnEnemy('hasami', b.x + Math.cos(a) * 90, b.y + Math.sin(a) * 90); }
        }
      } else if (b.state === 'aim') {
        mv(0, 0, 10);
        const tg = this.telegraphs.find((t) => t.owner === b.id);
        if (tg) { tg.x = b.x; tg.y = b.y; }
        if (b.timer <= 0) { b.state = 'charge'; b.timer = 0.62; this.emit({ type: 'snip', x: b.x, y: b.y }); }
      } else if (b.state === 'charge') {
        b.vx = b.ax * 640; b.vy = b.ay * 640;
        // cut the thread along the way
        const th = this.thread;
        for (let i = 0; i < th.length - 2; i += 2) {
          if (dist2(th[i].x, th[i].y, b.x, b.y) < (b.r + 6) ** 2) { this.cutThread(i, th[i].x, th[i].y); break; }
        }
        if (b.timer <= 0) {
          b.charges--;
          if (b.charges > 0) {
            b.state = 'aim'; b.timer = 0.45; b.ax = dx / d; b.ay = dy / d;
            this.telegraphs.push({ kind: 'line', x: b.x, y: b.y, dx: b.ax, dy: b.ay, len: 640, w: b.r * 1.6, t: 0.45, max: 0.45, owner: b.id });
          } else { b.state = 'recover'; b.timer = 0.9; }
        }
      } else if (b.state === 'recover') {
        mv(0, 0, 6);
        if (b.timer <= 0) { b.state = 'idle'; b.timer = 2.4 + this.rng(); }
      }
    } else if (b.def.ai === 'boss_lantern') {
      const want = 280;
      const f = d > want + 40 ? 1 : d < want - 60 ? -0.8 : 0;
      mv((dx / d) * b.spd * f + (-dy / d) * 30, (dy / d) * b.spd * f + (dx / d) * 30, 2);
      b.ringT = (b.ringT ?? 2) - dt;
      b.aimT = (b.aimT ?? 3.2) - dt;
      b.sumT = (b.sumT ?? 5) - dt;
      if (b.ringT <= 0) {
        b.ringT = hpf < 0.5 ? 2.3 : 3.0;
        const n = hpf < 0.5 ? 22 : 16;
        b.rot = (b.rot || 0) + 0.21;
        for (let i = 0; i < n; i++) {
          const a = b.rot + (i / n) * TAU;
          this.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, r: 9, dmg: 12, life: 6, kind: 'eye' });
        }
        this.emit({ type: 'eshot', x: b.x, y: b.y, big: true });
      }
      if (b.aimT <= 0) {
        b.aimT = hpf < 0.5 ? 1.7 : 2.4;
        const base = Math.atan2(dy, dx);
        for (let i = -2; i <= 2; i++) {
          const a = base + i * 0.16;
          this.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, r: 8, dmg: 12, life: 4, kind: 'fire' });
        }
      }
      if (b.sumT <= 0) {
        b.sumT = 7;
        for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; this.spawnEnemy('chochin', b.x + Math.cos(a) * 100, b.y + Math.sin(a) * 100); }
      }
      if (hpf < 0.5) {
        b.spiralT = (b.spiralT ?? 0) - dt;
        if (b.spiralT <= 0) {
          b.spiralT = 0.11;
          b.spa = (b.spa || 0) + 0.37;
          for (let k = 0; k < 2; k++) {
            const a = b.spa + k * Math.PI;
            this.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, r: 7, dmg: 10, life: 6, kind: 'eye' });
          }
        }
      }
    } else if (b.def.ai === 'boss_spider') {
      const phase = hpf > 0.55 ? 1 : hpf > 0.25 ? 2 : 3;
      if (phase !== b.phaseN) {
        if (b.phaseN) this.emit({ type: 'warn', text: phase === 2 ? '夜織が糸を張り巡らせる…' : '夜織が怒り狂う！' });
        b.phaseN = phase;
      }
      const spd = b.spd * (phase === 3 ? 1.5 : phase === 2 ? 1.2 : 1);
      if (b.state === 'idle') {
        mv((dx / d) * spd, (dy / d) * spd, 3);
        b.webT = (b.webT ?? 1.5) - dt;
        b.shotT = (b.shotT ?? 3) - dt;
        b.sumT = (b.sumT ?? 5) - dt;
        if (b.webT <= 0) {
          b.webT = phase === 1 ? 4.2 : phase === 2 ? 3.0 : 2.4;
          const lines = phase === 1 ? 1 : 2;
          for (let i = 0; i < lines; i++) {
            const a = this.rng() * Math.PI;
            const off = (this.rng() - 0.5) * 260;
            const cx = p.x + Math.cos(a + Math.PI / 2) * off, cy = p.y + Math.sin(a + Math.PI / 2) * off;
            const L = 420 + this.rng() * 200;
            const web = { x0: cx - Math.cos(a) * L, y0: cy - Math.sin(a) * L, x1: cx + Math.cos(a) * L, y1: cy + Math.sin(a) * L, t: 0, arm: 0.9, life: 9 };
            this.webs.push(web);
          }
          if (this.webs.length > 6) this.webs.splice(0, this.webs.length - 6);
          this.emit({ type: 'webPlace' });
        }
        if (b.shotT <= 0) {
          b.shotT = phase === 3 ? 1.6 : 2.6;
          const base = Math.atan2(dy, dx);
          const n = phase === 3 ? 7 : 3;
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.28;
            this.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, r: 10, dmg: 12, life: 4, kind: 'web' });
          }
        }
        if (b.sumT <= 0) {
          b.sumT = phase === 1 ? 7 : 5;
          const n = phase === 1 ? 6 : 9;
          for (let i = 0; i < n; i++) { const a = (i / n) * TAU; this.spawnEnemy('kumo', b.x + Math.cos(a) * 80, b.y + Math.sin(a) * 80); }
        }
        if (b.timer <= 0 && d < 520) {
          b.state = 'crouch'; b.timer = 0.9;
          b.tx = p.x + p.vx * 0.3; b.ty = p.y + p.vy * 0.3;
          this.telegraphs.push({ kind: 'circle', x: b.tx, y: b.ty, r: 120, t: 0.9, max: 0.9, owner: b.id });
        }
      } else if (b.state === 'crouch') {
        mv(0, 0, 10);
        if (b.timer <= 0) { b.state = 'leap'; b.timer = 0.38; b.sx = b.x; b.sy = b.y; }
      } else if (b.state === 'leap') {
        const f = 1 - b.timer / 0.38;
        b.x = b.sx + (b.tx - b.sx) * f; b.y = b.sy + (b.ty - b.sy) * f;
        b.vx = 0; b.vy = 0;
        b.air = Math.sin(f * Math.PI);
        if (b.timer <= 0) {
          b.air = 0;
          b.state = 'idle'; b.timer = phase === 3 ? 2.6 : 4.2;
          this.emit({ type: 'slam', x: b.x, y: b.y, r: 120 });
          if (dist2(p.x, p.y, b.x, b.y) < 130 * 130) this.hurtPlayer(26, b.x, b.y);
          // cut thread under the landing
          const th = this.thread;
          for (let i = th.length - 3; i >= 0; i--) if (dist2(th[i].x, th[i].y, b.x, b.y) < 120 * 120) { this.cutThread(i, th[i].x, th[i].y); break; }
          if (phase >= 2) {
            for (let i = 0; i < 12; i++) {
              const a = (i / 12) * TAU;
              this.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, r: 9, dmg: 11, life: 4, kind: 'web' });
            }
          }
        }
        return;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
  }

  updateHazards(dt) {
    for (const t of this.telegraphs) t.t -= dt;
    this.telegraphs = this.telegraphs.filter((t) => t.t > 0);
    const p = this.player, th = this.thread;
    for (const w of this.webs) {
      w.t += dt;
      if (w.t < w.arm) continue;
      if (w.t > w.life) continue;
      if (distSegSq(p.x, p.y, w.x0, w.y0, w.x1, w.y1) < 16 * 16) p.slowed = 0.3;
      // webs sever the thread where it crosses
      for (let i = th.length - 2; i >= 0; i--) {
        const a = th[i], c = th[i + 1];
        if (segIntersect(a.x, a.y, c.x, c.y, w.x0, w.y0, w.x1, w.y1)) { this.cutThread(i, a.x, a.y); break; }
      }
    }
    this.webs = this.webs.filter((w) => w.t < w.life);
  }

  // ---------------------------------------------------------------- weapons
  nearestEnemies(x, y, n, range) {
    const out = [];
    this.hash.query(x, y, range, (e) => {
      if (e.dead) return;
      const d = dist2(e.x, e.y, x, y);
      if (d < range * range) out.push([d, e]);
    });
    if (this.boss && !this.boss.dead && !out.some((o) => o[1] === this.boss)) {
      const d = dist2(this.boss.x, this.boss.y, x, y); if (d < range * range) out.push([d, this.boss]);
    }
    out.sort((a, b) => a[0] - b[0]);
    return out.slice(0, n).map((o) => o[1]);
  }

  updateWeapons(dt) {
    const p = this.player, s = this.stats, T = this.weaponTimers;
    this.needleFrenzy = Math.max(0, this.needleFrenzy - dt);
    // Needles
    const nl = this.lv('needle');
    if (nl) {
      const st = UPGRADES.needle.stat(nl - 1);
      const ev = this.evolved.needle;
      const cd = (ev ? 0.28 : st.cd) * s.cdMul / (this.needleFrenzy > 0 ? 2.6 : 1);
      T.needle = (T.needle ?? 0.5) - dt;
      if (T.needle <= 0) {
        T.needle = cd;
        const count = st.count + (ev ? 2 : 0);
        const targets = this.nearestEnemies(p.x, p.y, count, 560);
        for (let i = 0; i < count; i++) {
          const t = targets[i % Math.max(1, targets.length)];
          let a;
          if (t) a = Math.atan2(t.y - p.y, t.x - p.x) + (i >= targets.length ? (this.rng() - 0.5) * 0.4 : 0);
          else a = this.rng() * TAU;
          if (!t && !this.needleFrenzy) continue;
          this.shots.push({ kind: 'needle', x: p.x, y: p.y, vx: Math.cos(a) * 640, vy: Math.sin(a) * 640, r: 6, dmg: st.dmg * (ev ? 1.3 : 1), pierce: st.pierce + (ev ? 1 : 0), life: 0.9, hit: new Set(), rot: a });
        }
        this.emit({ type: 'needle' });
      }
    }
    // Bell
    const bl = this.lv('bell');
    if (bl) {
      const st = UPGRADES.bell.stat(bl - 1);
      const ev = this.evolved.bell;
      T.bell = (T.bell ?? st.cd) - dt;
      if (T.bell <= 0) {
        T.bell = st.cd * s.cdMul;
        const R = st.radius * (ev ? 1.5 : 1);
        this.ringBlast(p.x, p.y, R, st.dmg * (ev ? 1.7 : 1), ev);
        this.emit({ type: 'bell', x: p.x, y: p.y, r: R, ev });
      }
    }
    // Foxfire
    const fl = this.lv('foxfire');
    if (fl) {
      const st = UPGRADES.foxfire.stat(fl - 1);
      const ev = this.evolved.foxfire;
      const frac = clamp(this.threadLen / s.threadLen, 0, 1);
      this.foxAngle += dt * (2.2 + frac * 2.4);
      this.foxPhase += dt * 0.55;
      const orbs = this.foxOrbs(st, ev);
      for (const o of orbs) {
        this.hash.query(o.x, o.y, 16 + 30, (e) => {
          if (e.dead || e.foxCd > 0) return;
          if (dist2(e.x, e.y, o.x, o.y) < (e.r + 14) ** 2) {
            e.foxCd = 0.45;
            const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
            this.damage(e, st.dmg * (ev ? 1.5 : 1), 'foxfire', { kx: ((e.x - p.x) / d) * 120, ky: ((e.y - p.y) / d) * 120 });
          }
        });
        if (this.boss && !this.boss.dead && this.boss.foxCd <= 0 && dist2(this.boss.x, this.boss.y, o.x, o.y) < (this.boss.r + 14) ** 2) {
          this.boss.foxCd = 0.3; this.damage(this.boss, st.dmg * (ev ? 1.5 : 1), 'foxfire', {});
        }
      }
    }
    // Thread contact: enemies get tangled (slowed) by the thread; Razor Thread also cuts them
    const rl = this.lv('razor');
    const st = rl ? UPGRADES.razor.stat(rl - 1) : null;
    const D = rl ? st.dmg * (this.evolved.razor ? 2 : 1) : 0;
    const th = this.thread;
    for (let i = 0; i < th.length - 3; i += 2) {
      const q = th[i];
      this.hash.query(q.x, q.y, 40, (e) => {
        if (e.dead || e.tangleMark === this.time) return;
        if (dist2(e.x, e.y, q.x, q.y) >= (e.r + 6) ** 2) return;
        e.tangleMark = this.time;
        if (e.def.ai !== 'cutter') e.tangle = 0.35;
        if (rl && e.razorCd <= 0) { e.razorCd = st.tick; this.damage(e, D, 'razor', {}); }
      });
    }
    const b = this.boss;
    if (rl && b && !b.dead && b.razorCd <= 0) {
      for (let i = 0; i < th.length; i += 3) {
        if (dist2(b.x, b.y, th[i].x, th[i].y) < (b.r + 6) ** 2) { b.razorCd = st.tick; this.damage(b, D, 'razor', {}); break; }
      }
    }
  }

  foxOrbs(st, ev) {
    const p = this.player, out = [];
    for (let i = 0; i < st.count; i++) {
      const a = this.foxAngle + (i / st.count) * TAU;
      out.push({ x: p.x + Math.cos(a) * st.radius, y: p.y + Math.sin(a) * st.radius });
    }
    if (ev && this.thread.length > 6) {
      // a procession of foxfires travels along the thread
      const th = this.thread;
      const n = 6;
      for (let i = 0; i < n; i++) {
        const f = (this.foxPhase + i / n) % 1;
        const idx = Math.floor(f * (th.length - 1));
        out.push({ x: th[idx].x, y: th[idx].y, trail: true });
      }
    }
    return out;
  }

  updateShots(dt) {
    for (const s of this.shots) {
      s.life -= dt;
      if (s.homing) {
        if (!s.tgt || s.tgt.dead) {
          const t = this.nearestEnemies(s.x, s.y, 1, 300)[0];
          s.tgt = t && !s.hit.has(t) ? t : null;
        }
        if (s.tgt) {
          const a = Math.atan2(s.tgt.y - s.y, s.tgt.x - s.x);
          const sp = Math.hypot(s.vx, s.vy);
          const cur = Math.atan2(s.vy, s.vx);
          let da = a - cur; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
          const na = cur + clamp(da, -8 * dt, 8 * dt);
          s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
        }
      }
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.rot += dt * (s.kind === 'petal' ? 9 : 0);
      this.hash.query(s.x, s.y, s.r + 30, (e) => {
        if (s.life <= 0 || e.dead || s.hit.has(e)) return;
        if (dist2(e.x, e.y, s.x, s.y) < (e.r + s.r) ** 2) {
          s.hit.add(e);
          const sp = Math.hypot(s.vx, s.vy) || 1;
          this.damage(e, s.dmg, s.kind, { kx: (s.vx / sp) * 90, ky: (s.vy / sp) * 90 });
          s.pierce--;
          if (s.pierce <= 0) s.life = 0;
        }
      });
      const b = this.boss;
      if (b && !b.dead && s.life > 0 && !s.hit.has(b) && dist2(b.x, b.y, s.x, s.y) < (b.r + s.r) ** 2) {
        s.hit.add(b); this.damage(b, s.dmg, s.kind, {}); s.pierce--; if (s.pierce <= 0) s.life = 0;
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  updateBlasts(dt) {
    for (const b of this.blasts) {
      b.t -= dt;
      if (b.t > 0 || b.done) continue;
      b.done = true;
      this.hash.query(b.x, b.y, b.r + 30, (e) => {
        if (e.dead) return;
        if (dist2(e.x, e.y, b.x, b.y) < (b.r + e.r) ** 2) {
          const d = Math.hypot(e.x - b.x, e.y - b.y) || 1;
          this.damage(e, b.dmg, 'burst', { kx: ((e.x - b.x) / d) * 200, ky: ((e.y - b.y) / d) * 200 });
        }
      });
      const bo = this.boss;
      if (bo && !bo.dead && dist2(bo.x, bo.y, b.x, b.y) < (b.r + bo.r) ** 2) this.damage(bo, b.dmg * 0.5, 'burst', {});
      this.emit({ type: 'blast', x: b.x, y: b.y, r: b.r, kind: b.kind });
    }
    this.blasts = this.blasts.filter((b) => !b.done);
  }

  updateZones(dt) {
    const p = this.player;
    for (const z of this.zones) {
      z.life -= dt;
      z.tick -= dt;
      const doTick = z.tick <= 0;
      if (doTick) z.tick = 0.25;
      if (z.kind === 'seal') {
        const { bb, poly } = z;
        this.hash.queryRect(bb.x0, bb.y0, bb.x1, bb.y1, (e) => {
          if (e.dead || !pointInPoly(e.x, e.y, poly)) return;
          e.slow = 0.2;
          if (z.kekkai && !e.boss) {
            const dx = e.x - z.cx, dy = e.y - z.cy, d = Math.hypot(dx, dy) || 1;
            e.kx += (dx / d) * 900 * dt / e.def.mass; e.ky += (dy / d) * 900 * dt / e.def.mass;
          }
          if (doTick) this.damage(e, z.dps * 0.25, 'seal', {});
        });
        const b = this.boss;
        if (doTick && b && !b.dead && pointInPoly(b.x, b.y, poly)) { b.slow = 0.3; this.damage(b, z.dps * 0.25, 'seal', {}); }
        if (z.kekkai && p.x > bb.x0 && p.x < bb.x1 && p.y > bb.y0 && p.y < bb.y1 && pointInPoly(p.x, p.y, poly)) {
          p.hp = Math.min(p.maxHp, p.hp + 3 * dt);
          this.ebullets = this.ebullets.filter((bl) => !(bl.x > bb.x0 && bl.x < bb.x1 && bl.y > bb.y0 && bl.y < bb.y1 && pointInPoly(bl.x, bl.y, poly)));
        }
      } else if (z.kind === 'hole') {
        this.hash.query(z.cx, z.cy, z.r, (e) => {
          if (e.dead || e.boss) return;
          const dx = z.cx - e.x, dy = z.cy - e.y, d = Math.hypot(dx, dy) || 1;
          if (d > z.r) return;
          const f = 520 * (1 - d / z.r) + 80;
          e.kx = (dx / d) * f; e.ky = (dy / d) * f;
          if (doTick && d < 70) this.damage(e, z.dps * 0.25, 'gravity', {});
        });
        if (doTick && this.boss && !this.boss.dead && dist2(this.boss.x, this.boss.y, z.cx, z.cy) < 90 * 90) this.damage(this.boss, z.dps * 0.25, 'gravity', {});
      }
    }
    this.zones = this.zones.filter((z) => z.life > 0);
  }

  updateCranes(dt) {
    for (const c of this.cranes) {
      c.life -= dt; c.cd -= dt;
      if (!c.target || c.target.dead) c.target = this.nearestEnemies(c.x, c.y, 1, 500)[0] || null;
      let ax = 0, ay = 0;
      if (c.target) {
        const dx = c.target.x - c.x, dy = c.target.y - c.y, d = Math.hypot(dx, dy) || 1;
        ax = (dx / d) * 1600; ay = (dy / d) * 1600;
        if (d < c.target.r + c.r && c.cd <= 0) {
          c.cd = 0.18;
          this.damage(c.target, c.dmg, 'shiki', { kx: (dx / d) * 150, ky: (dy / d) * 150 });
          if (c.phoenix) this.blasts.push({ x: c.x, y: c.y, r: 55, dmg: c.dmg * 0.5, t: 0, kind: 'fire' });
          c.target = null;
          c.vx = -c.vx * 0.4; c.vy = -c.vy * 0.4;
        }
      } else {
        const dx = this.player.x - c.x, dy = this.player.y - c.y;
        ax = dx * 4; ay = dy * 4;
      }
      c.vx += ax * dt; c.vy += ay * dt;
      const sp = Math.hypot(c.vx, c.vy), max = c.phoenix ? 560 : 480;
      if (sp > max) { c.vx *= max / sp; c.vy *= max / sp; }
      c.x += c.vx * dt; c.y += c.vy * dt;
    }
    this.cranes = this.cranes.filter((c) => c.life > 0);
  }

  updateEBullets(dt) {
    const p = this.player;
    for (const b of this.ebullets) {
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.r - 4) ** 2) {
        if (p.inv <= 0 && p.dashT <= 0) {
          this.hurtPlayer(b.dmg, b.x, b.y);
          if (b.kind === 'web') p.slowed = 1.2;
          b.life = 0;
        }
      }
    }
    this.ebullets = this.ebullets.filter((b) => b.life > 0);
  }

  updatePickups(dt) {
    const p = this.player, mag = this.stats.magnet;
    for (const k of this.pickups) {
      k.t += dt;
      const dx = p.x - k.x, dy = p.y - k.y;
      const d2 = dx * dx + dy * dy;
      if (!k.attract && d2 < mag * mag) k.attract = true;
      if (k.attract) {
        const d = Math.sqrt(d2) || 1;
        const sp = 260 + k.t * 40 + (this.magnetAll ? 600 : 0);
        k.vx += (dx / d) * sp * dt * 9; k.vy += (dy / d) * sp * dt * 9;
        const v = Math.hypot(k.vx, k.vy), mx = 700 + k.t * 50;
        if (v > mx) { k.vx *= mx / v; k.vy *= mx / v; }
        if (d < p.r + 10) { this.collect(k); continue; }
      } else {
        k.vx *= Math.pow(0.02, dt); k.vy *= Math.pow(0.02, dt);
      }
      k.x += k.vx * dt; k.y += k.vy * dt;
    }
    this.pickups = this.pickups.filter((k) => !k.taken);
    if (this.magnetAll) this.magnetAll = this.pickups.some((k) => k.kind === 'xp');
  }

  collect(k) {
    k.taken = true;
    if (k.kind === 'xp') {
      this.xp += k.v * this.stats.xpMul;
      while (this.xp >= this.xpNext) {
        this.xp -= this.xpNext;
        this.level++;
        this.xpNext = this.xpFor(this.level);
        this.pendingLevels++;
        this.recalcStats();
        this.emit({ type: 'levelup', level: this.level });
      }
      this.emit({ type: 'pickup', kind: 'xp', v: k.v });
    } else if (k.kind === 'heal') {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + k.v);
      this.emit({ type: 'heal', x: k.x, y: k.y });
    } else if (k.kind === 'chest') {
      this.openChest(k.v);
    } else if (k.kind === 'charm') {
      for (const q of this.pickups) if (q.kind === 'xp') q.attract = true;
      this.magnetAll = true;
      this.emit({ type: 'magnet' });
    }
  }

  // summary for the results screen / meta currency
  results() {
    const spools = Math.floor(this.kills / 22 + this.time / 8 + this.level * 2 + this.bossesDefeated * 45 + (this.won ? 160 : 0) + (this.bonusSpools || 0));
    return {
      won: this.won, time: this.time, kills: this.kills, level: this.level, bestKnot: this.bestKnot,
      knots: this.knotCount, greatKnots: this.greatKnots, bosses: this.bossesDefeated, spools,
      dmg: this.dmgBySource, char: this.char.id, weapons: this.weapons.slice(), passives: this.passives.slice(), evolved: { ...this.evolved },
    };
  }
}

export { RUN_LENGTH };
