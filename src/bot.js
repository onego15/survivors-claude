// Autoplay AI. Used for automated playtests (Node + browser) and the title-screen attract mode.
// Strategy: run laps around a centre so the thread closes loops; the chasing crowd spirals
// into each lap. Sidestep enemies/bullets that are directly ahead and dash through walls of enemies.
import { TAU, dist2 } from './util.js';
import { UPGRADES } from './data.js';

export const BUILDS = {
  burst: ['burst', 'steel', 'longthread', 'echo', 'needle', 'vigor', 'gravity', 'swift', 'luck', 'magnet', 'thunder', 'haste'],
  thunder: ['thunder', 'haste', 'longthread', 'gravity', 'magnet', 'steel', 'bell', 'ward', 'vigor', 'echo', 'luck', 'swift'],
  seal: ['seal', 'ward', 'longthread', 'petal', 'swift', 'shiki', 'vigor', 'steel', 'luck', 'foxfire', 'magnet', 'haste'],
  razor: ['razor', 'longthread', 'foxfire', 'magnet', 'swift', 'needle', 'haste', 'steel', 'vigor', 'echo', 'luck', 'ward'],
  random: null,
};

export class Bot {
  constructor(game, build = 'random', opts = {}) {
    this.g = game;
    this.build = build;
    this.dir = 1;
    this.skill = opts.skill ?? 1; // 0..1, lower = sloppier
    this.t = 0;
    this.center = null;
    this.lapKnots = -1;
    this.lapStart = 0;
  }

  pickChoice(choices) {
    const g = this.g;
    const evo = choices.findIndex((c) => !UPGRADES[c] && !c.startsWith('_'));
    if (evo >= 0) return evo;
    const pri = BUILDS[this.build];
    if (pri) {
      let best = -1, bs = Infinity;
      choices.forEach((c, i) => { const k = pri.indexOf(c); const sc = k < 0 ? 100 + i : k; if (sc < bs) { bs = sc; best = i; } });
      return best;
    }
    return Math.floor(g.rng() * choices.length);
  }

  input(dt) {
    const g = this.g, p = g.player;
    this.t += dt;
    const boss = g.boss && !g.boss.dead ? g.boss : null;
    // crowd centre
    let sx = 0, sy = 0, n = 0;
    for (const e of g.enemies) {
      if (dist2(e.x, e.y, p.x, p.y) < 380 * 380) { sx += e.x; sy += e.y; n++; }
    }
    const bossStill = boss && (boss.state === 'recover' || boss.state === 'rest' || boss.state === 'enter');
    const R = this.R = boss ? boss.r + (boss.bound > 0 ? 40 : boss.def.ai === 'boss_lantern' ? 120 : 70) : Math.max(95, Math.min(230, (g.stats.threadLen * 0.68) / TAU));
    let mx, my;
    if (n === 0 && !boss) {
      // nothing nearby: collect pickups
      let best = null, bd = Infinity;
      for (const k of g.pickups) { const d = dist2(k.x, k.y, p.x, p.y); if (d < bd) { bd = d; best = k; } }
      let tx, ty;
      if (best && bd < 700 * 700) { tx = best.x - p.x; ty = best.y - p.y; }
      else { tx = Math.cos(this.t * 0.4); ty = Math.sin(this.t * 0.4); }
      const l = Math.hypot(tx, ty) || 1;
      mx = tx / l; my = ty / l;
      this.center = null;
    } else {
      const cx0 = boss ? boss.x : sx / n, cy0 = boss ? boss.y : sy / n;
      if (!this.center || g.knotCount !== this.lapKnots || this.t - this.lapStart > (TAU * R) / g.stats.speed + 1.5) {
        this.lapKnots = g.knotCount; this.lapStart = this.t;
        if (boss) this.center = { x: cx0, y: cy0 };
        else {
          // put the lap so that the player stands on the circle and the circle overlaps the crowd
          const ax = cx0 - p.x, ay = cy0 - p.y, al = Math.hypot(ax, ay) || 1;
          const f = Math.min(1, al / R);
          const ux = ax / al, uy = ay / al;
          const px = -uy * this.dir, py = ux * this.dir;
          const vx = ux * f + px * (1 - f), vy = uy * f + py * (1 - f), vl = Math.hypot(vx, vy) || 1;
          this.center = { x: p.x + (vx / vl) * R, y: p.y + (vy / vl) * R };
        }
      }
      
      if (boss) { this.center.x = boss.x; this.center.y = boss.y; }
      const c = this.center;
      const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy) || 1;
      const ang = Math.atan2(dy, dx);
      if (this.lapStart === this.t || this.startAng === undefined || this.lapId !== this.lapStart) { this.lapId = this.lapStart; this.startAng = ang; this.swept = 0; this.prevAng = ang; }
      let da = ang - this.prevAng; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      this.swept += da * this.dir; this.prevAng = ang;
      const prog = this.swept / TAU;
      if (prog > 0.75 && g.thread.length > 10) {
        // head for an early part of our own thread to tie the knot
        const th = g.thread;
        let acc = 0, k = 0;
        for (k = 1; k < th.length - 1; k++) { acc += th[k].d; if (acc > 90) break; }
        const tx = th[k].x - p.x, ty = th[k].y - p.y;
        const l = Math.hypot(tx, ty) || 1; mx = tx / l; my = ty / l;
        if (prog > 1.5) this.center = null; // give up on this lap
      } else {
        const want = prog < 0.12 ? R : R * 1.08;
        mx = (-dy / d) * this.dir + (dx / d) * ((want - d) / want) * 2.2;
        my = (dx / d) * this.dir + (dy / d) * ((want - d) / want) * 2.2;
        const l = Math.hypot(mx, my) || 1; mx /= l; my /= l;
      }
    }

    // Sample candidate headings, predict a short way ahead and pick the safest one that
    // still follows the planned lap.
    const near = [];
    for (const e of g.enemies) if (dist2(e.x, e.y, p.x, p.y) < 260 * 260) near.push(e);
    for (const bl of g.ebullets) if (dist2(bl.x, bl.y, p.x, p.y) < 260 * 260) near.push(bl);
    const sp = g.stats.speed;
    let best = null, bestScore = -Infinity, worst = 0;
    const N = 20;
    const hpf = p.hp / p.maxHp;
    const caution = g.god ? 0 : hpf > 0.6 ? 0.35 : hpf > 0.35 ? 0.7 : 1;
    for (let i = 0; i <= N; i++) {
      let vx, vy;
      if (i === N) { vx = mx; vy = my; } else { const a = (i / N) * TAU; vx = Math.cos(a); vy = Math.sin(a); }
      let pen = 0;
      for (const tt of [0.12, 0.25, 0.4]) {
        const qx = p.x + vx * sp * tt, qy = p.y + vy * sp * tt;
        for (const e of near) {
          const ex = e.x + (e.vx || 0) * tt, ey = e.y + (e.vy || 0) * tt;
          const rr = (e.r || 8) + p.r + 14;
          const d2 = (ex - qx) ** 2 + (ey - qy) ** 2;
          if (d2 < rr * rr) { const o = rr - Math.sqrt(d2); pen += o * o * (e.def ? (e.boss ? 3 : 1) : 1.6) / (tt * 4); }
        }
        for (const t of g.telegraphs) {
          if (t.kind === 'circle') { if (dist2(t.x, t.y, qx, qy) < (t.r + 20) ** 2) pen += 400; }
          else {
            const ux = qx - t.x, uy = qy - t.y, along = ux * t.dx + uy * t.dy;
            if (along > -30 && along < t.len && Math.abs(ux * -t.dy + uy * t.dx) < t.w + 25) pen += 400;
          }
        }
        for (const w of g.webs) {
          if (w.t < w.arm * 0.4) continue;
          const vx2 = w.x1 - w.x0, vy2 = w.y1 - w.y0, L = Math.hypot(vx2, vy2);
          const along = ((qx - w.x0) * vx2 + (qy - w.y0) * vy2) / L;
          if (along > 0 && along < L && Math.abs(((qx - w.x0) * -vy2 + (qy - w.y0) * vx2) / L) < 20) pen += 60;
        }
      }
      const score = (vx * mx + vy * my) * 100 - pen * (0.4 + this.skill * 0.6) * caution;
      if (score > bestScore) { bestScore = score; best = [vx, vy]; }
      if (i === N) worst = pen;
    }
    mx = best[0]; my = best[1];
    if (this.skill < 1) { const a = Math.sin(this.t * 2.3) * (1 - this.skill) * 1.2; const c = Math.cos(a), s = Math.sin(a); [mx, my] = [mx * c - my * s, mx * s + my * c]; }
    const dash = this.skill > 0.5 && bestScore < -150;
    return { x: mx, y: my, dash };
  }
}
