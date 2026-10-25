// Canvas renderer: world, thread, effects and particles.
import { TAU, clamp, hash2, easeOutCubic, easeOutBack } from './util.js';
import { buildSprites, painters, SPRITE_SCALE } from './sprites.js';
import { ENEMIES, UPGRADES, EVOLUTIONS } from './data.js';

const CHUNK = 420;
const SRC_COLOR = {
  knot: '#ffffff', burst: '#ff9a4a', thunder: '#a8e0ff', seal: '#c9a2ff', gravity: '#8ff5d4', petal: '#ffb3dc',
  shiki: '#fff6e0', razor: '#e6f0ff', needle: '#d8e6ff', bell: '#ffd76a', foxfire: '#7fd8ff',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sp = buildSprites(ENEMIES);
    this.groundPattern = this.ctx.createPattern(this.sp.ground, 'repeat');
    this.cam = { x: 0, y: 0 };
    this.zoom = 1;
    this.shake = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.flash = 0; this.flashColor = '255,255,255';
    this.hurtFlash = 0;
    this.particles = [];
    this.texts = [];
    this.cinches = [];
    this.snaps = [];
    this.arcs = [];
    this.rings = [];
    this.after = [];
    this.time = 0;
    this.settings = { shake: 1, numbers: true };
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr); this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.dpr = dpr; this.w = w; this.h = h;
    let zoom = h / 760;
    if (w / zoom < 720) zoom = w / 720;
    this.zoom = zoom;
  }

  viewSize() { return { w: this.w / this.zoom, h: this.h / this.zoom }; }

  reset(game) {
    this.particles.length = 0; this.texts.length = 0; this.cinches.length = 0; this.snaps.length = 0;
    this.arcs.length = 0; this.rings.length = 0; this.after.length = 0;
    this.cam.x = game.player.x; this.cam.y = game.player.y;
    this.shake = 0; this.flash = 0; this.hurtFlash = 0;
  }

  addShake(v) { this.shake = Math.min(1.2, this.shake + v * this.settings.shake); }

  // ---------------------------------------------------------------- particles
  part(o) {
    if (this.particles.length > 1400) this.particles.shift();
    this.particles.push(o);
  }

  burst(x, y, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = (opts.speed || 150) * (0.3 + Math.random() * 0.9);
      this.part({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (opts.up || 0), life: opts.life * (0.6 + Math.random() * 0.6), max: opts.life,
        size: opts.size * (0.6 + Math.random() * 0.8), color: opts.color, kind: opts.kind || 'spark', drag: opts.drag ?? 3, g: opts.grav || 0,
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10,
      });
    }
  }

  text(x, y, str, opts = {}) {
    if (this.texts.length > 90) this.texts.shift();
    this.texts.push({ x, y, str, life: opts.life || 0.8, max: opts.life || 0.8, size: opts.size || 16, color: opts.color || '#fff', vy: opts.vy ?? -50, stroke: opts.stroke || '#0b0812', pop: opts.pop ?? 1 });
  }

  consume(game, fx) {
    const charGlow = game.char.glow;
    for (const e of fx) {
      switch (e.type) {
        case 'knotStart':
          this.cinches.push({ poly: e.poly, cx: e.cx, cy: e.cy, t: 0, dur: 0.2 });
          break;
        case 'knot': {
          const n = e.n;
          this.snaps.push({ poly: e.poly, cx: e.cx, cy: e.cy, t: 0, n, crit: e.crit, echo: e.echo, combo: e.combo, color: charGlow });
          this.rings.push({ x: e.cx, y: e.cy, r0: 10, r1: Math.sqrt(e.area / Math.PI) * 1.4 + 30, t: 0, dur: 0.45, color: e.echo ? '255,230,140' : '255,255,255', w: e.echo ? 3 : 6 });
          // sparks along the perimeter
          const p = e.poly, np = p.length / 2;
          const step = Math.max(1, Math.floor(np / 40));
          for (let i = 0; i < np; i += step) {
            const x = p[i * 2], y = p[i * 2 + 1];
            const dx = x - e.cx, dy = y - e.cy, l = Math.hypot(dx, dy) || 1;
            this.part({ x, y, vx: (-dx / l) * 220, vy: (-dy / l) * 220, life: 0.35, max: 0.35, size: 3, color: e.echo ? '#ffe9a0' : '#ffffff', kind: 'spark', drag: 4, g: 0, rot: 0, vr: 0 });
          }
          if (!e.echo) {
            this.addShake(Math.min(0.5, 0.08 + n * 0.018));
            if (n >= 3) {
              const label = n >= 15 ? '大結び！' : n >= 8 ? '結び！' : '';
              this.text(e.cx, e.cy - 30, `${n}体${label ? ' ' + label : ''}`, { size: n >= 15 ? 34 : n >= 8 ? 26 : 20, color: n >= 15 ? '#ffd76a' : '#fff', life: 1.1, vy: -40, pop: 1.6 });
            }
            if (e.combo >= 2) this.text(e.cx, e.cy + 6, `連 ×${e.combo}`, { size: 16, color: '#ff9fb0', life: 0.9, vy: -30 });
            if (n >= 15) { this.flash = 0.35; this.flashColor = '255,235,190'; }
          }
          break;
        }
        case 'greatKnot':
          this.burst(e.cx, e.cy, 40, { speed: 380, life: 0.9, size: 5, color: '#ffd76a', kind: 'spark', drag: 2 });
          break;
        case 'hit':
          if (this.settings.numbers && (e.big || e.crit || e.dmg >= 25)) {
            const big = e.big;
            this.text(e.x + (Math.random() - 0.5) * 16, e.y, Math.round(e.dmg).toString(), {
              size: e.crit ? 22 : big ? 17 : 13, color: e.crit ? '#ffd23f' : big ? '#ffffff' : (SRC_COLOR[e.src] || '#ddd'), life: 0.6, vy: -70, pop: e.crit ? 1.5 : 1.15,
            });
          }
          break;
        case 'kill': {
          const r = e.r || 12;
          const col = e.kind === 'chochin' ? '#ff8a3a' : e.kind === 'onibi' ? '#6af2d0' : e.kind === 'kamiuo' ? '#f6efe0' : e.kind === 'hasami' ? '#d6e0ee' : '#2a2240';
          this.burst(e.x, e.y, e.elite ? 26 : 7, { speed: 160 + r * 4, life: 0.5, size: r * 0.35, color: col, kind: 'ink', drag: 5 });
          this.burst(e.x, e.y, e.elite ? 16 : 4, { speed: 120, life: 0.6, size: 2.4, color: '#9fe8ff', kind: 'spark', drag: 3, up: 40 });
          if (e.elite) { this.addShake(0.25); this.rings.push({ x: e.x, y: e.y, r0: 10, r1: 120, t: 0, dur: 0.5, color: '255,210,120', w: 5 }); }
          if (e.boss) {
            this.addShake(1); this.flash = 0.8; this.flashColor = '255,240,220';
            this.burst(e.x, e.y, 120, { speed: 520, life: 1.4, size: 6, color: '#ffd76a', kind: 'spark', drag: 1.5 });
            this.burst(e.x, e.y, 60, { speed: 300, life: 1.2, size: 10, color: '#1b1428', kind: 'ink', drag: 3 });
            for (let i = 0; i < 4; i++) this.rings.push({ x: e.x, y: e.y, r0: 20, r1: 260 + i * 120, t: -i * 0.12, dur: 0.8, color: '255,220,160', w: 8 });
          }
          break;
        }
        case 'blast': {
          const isBloom = e.kind === 'bloom' || e.kind === 'bloom2';
          const col = isBloom ? ['#ffd76a', '#ff6b8a', '#8ad8ff', '#b7ff8a'][Math.floor(Math.random() * 4)] : e.kind === 'fire' ? '#ff9a3a' : '#ff8a4a';
          this.rings.push({ x: e.x, y: e.y, r0: e.r * 0.2, r1: e.r, t: 0, dur: 0.28, color: isBloom ? '255,220,170' : '255,170,110', w: 4, fill: true });
          this.burst(e.x, e.y, isBloom ? 14 : 6, { speed: e.r * 5, life: 0.45, size: 3, color: col, kind: 'spark', drag: 3.5 });
          break;
        }
        case 'arc':
          this.arcs.push({ pts: e.pts, t: 0, dur: e.ev ? 0.35 : 0.25, seed: Math.random() * 1000, ev: e.ev });
          for (let i = 2; i < e.pts.length; i += 2) this.burst(e.pts[i], e.pts[i + 1], 4, { speed: 160, life: 0.3, size: 2.5, color: '#c6ecff', kind: 'spark' });
          break;
        case 'bell':
          this.rings.push({ x: e.x, y: e.y, r0: 20, r1: e.r, t: 0, dur: 0.4, color: e.ev ? '255,240,180' : '255,215,110', w: e.ev ? 10 : 5 });
          break;
        case 'gravity':
          this.rings.push({ x: e.x, y: e.y, r0: e.r, r1: 10, t: 0, dur: 0.3, color: '140,255,210', w: 3 });
          break;
        case 'cut':
          this.burst(e.x, e.y, 10, { speed: 200, life: 0.35, size: 2.5, color: '#ff5a6e', kind: 'spark' });
          this.text(e.x, e.y - 10, '断', { size: 18, color: '#ff6b7a', life: 0.6, vy: -40 });
          break;
        case 'hurt':
          this.hurtFlash = 0.35; this.addShake(0.25);
          this.text(e.x, e.y - 20, '-' + Math.round(e.dmg), { size: 16, color: '#ff5a6e', life: 0.6, vy: -60 });
          break;
        case 'levelup':
          this.rings.push({ x: game.player.x, y: game.player.y, r0: 10, r1: 140, t: 0, dur: 0.5, color: '255,220,120', w: 6 });
          this.burst(game.player.x, game.player.y, 30, { speed: 260, life: 0.8, size: 3.5, color: '#ffd76a', kind: 'spark', up: 80 });
          break;
        case 'evolve':
          this.flash = 0.9; this.flashColor = '255,255,255'; this.addShake(0.6);
          this.rings.push({ x: game.player.x, y: game.player.y, r0: 10, r1: 400, t: 0, dur: 0.8, color: '255,240,200', w: 12 });
          break;
        case 'dash':
          this.burst(e.x, e.y, 10, { speed: 120, life: 0.35, size: 3, color: '#ffffff', kind: 'spark' });
          break;
        case 'slam':
          this.addShake(0.6);
          this.rings.push({ x: e.x, y: e.y, r0: 20, r1: e.r * 1.3, t: 0, dur: 0.4, color: '200,170,255', w: 8 });
          this.burst(e.x, e.y, 30, { speed: 300, life: 0.6, size: 6, color: '#2b2140', kind: 'ink' });
          break;
        case 'bossSpawn':
          this.addShake(0.7);
          break;
        case 'bossDead':
          break;
        case 'heal':
          this.burst(game.player.x, game.player.y, 16, { speed: 90, life: 0.8, size: 3, color: '#8dffb0', kind: 'spark', up: 80 });
          break;
        case 'revive':
          this.flash = 1; this.flashColor = '255,250,230';
          this.rings.push({ x: game.player.x, y: game.player.y, r0: 10, r1: 420, t: 0, dur: 0.7, color: '255,240,200', w: 14 });
          break;
        case 'snip':
          this.burst(e.x, e.y, 14, { speed: 260, life: 0.4, size: 3, color: '#ffffff', kind: 'spark' });
          break;
      }
    }
  }

  // ---------------------------------------------------------------- main draw
  draw(game, dt, opts = {}) {
    this.time += dt;
    const ctx = this.ctx, p = game.player;
    // camera
    const lead = 0.18;
    const tx = p.x + p.vx * lead, ty = p.y + p.vy * lead;
    const k = 1 - Math.pow(0.0005, dt);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const sh = this.shake * this.shake * 18;
    this.shakeX = (Math.random() - 0.5) * 2 * sh; this.shakeY = (Math.random() - 0.5) * 2 * sh;
    const z = this.zoom;
    const vw = this.w / z, vh = this.h / z;
    const camX = this.cam.x + this.shakeX, camY = this.cam.y + this.shakeY;
    const x0 = camX - vw / 2, y0 = camY - vh / 2, x1 = x0 + vw, y1 = y0 + vh;
    this.view = { x0, y0, x1, y1 };

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    // ---- ground (screen space pattern scrolled with camera)
    ctx.save();
    ctx.scale(z, z);
    ctx.translate(-x0, -y0);
    ctx.fillStyle = this.groundPattern;
    ctx.fillRect(x0, y0, vw, vh);
    this.drawProps(ctx, x0, y0, x1, y1, 'under');

    // ---- zones
    for (const zn of game.zones) this.drawZone(ctx, zn);
    // ---- webs & telegraphs
    this.drawHazards(ctx, game);
    // ---- loop preview
    if (opts.preview !== false) this.drawPreview(ctx, game);
    // ---- pickups
    this.drawPickups(ctx, game, x0, y0, x1, y1);
    // ---- thread (under entities so enemies read on top)
    this.drawThread(ctx, game);
    // ---- entities sorted by y
    const ents = [];
    const m = 80;
    for (const e of game.enemies) if (e.x > x0 - m && e.x < x1 + m && e.y > y0 - m && e.y < y1 + m) ents.push(e);
    ents.sort((a, b) => a.y - b.y);
    // shadows
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    for (const e of ents) { if (e.def.ai === 'school' || e.def.ai === 'ranged') continue; const r = e.r; ctx.moveTo(e.x + r, e.y + r * 0.8); ctx.ellipse(e.x, e.y + r * 0.8, r, r * 0.35, 0, 0, TAU); }
    ctx.fill();
    let playerDrawn = false;
    for (const e of ents) {
      if (!playerDrawn && e.y > p.y) { this.drawPlayer(ctx, game); playerDrawn = true; }
      if (e.boss) this.drawBoss(ctx, game, e);
      else this.drawEnemy(ctx, game, e);
    }
    if (!playerDrawn) this.drawPlayer(ctx, game);
    this.drawProps(ctx, x0, y0, x1, y1, 'over');

    // ---- additive layer: shots, cranes, foxfire, effects
    ctx.globalCompositeOperation = 'lighter';
    this.drawGlowLights(ctx, game, ents);
    this.drawShots(ctx, game);
    this.drawFoxfire(ctx, game);
    this.drawCranes(ctx, game);
    this.drawCinches(ctx, game, dt);
    this.drawSnaps(ctx, game, dt);
    this.drawArcs(ctx, dt);
    this.drawRings(ctx, dt);
    this.drawParticles(ctx, dt, true);
    ctx.globalCompositeOperation = 'source-over';
    this.drawParticles(ctx, 0, false);
    // enemy bullets on top for readability
    this.drawEBullets(ctx, game);
    this.drawTexts(ctx, dt);
    this.drawOffscreen(ctx, game, x0, y0, x1, y1, camX, camY, vw, vh);
    ctx.restore();

    // ---- screen space post
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const vg = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    vg.addColorStop(0, 'rgba(5,4,14,0)'); vg.addColorStop(1, 'rgba(5,4,14,0.62)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, this.w, this.h);
    if (this.hurtFlash > 0) {
      this.hurtFlash -= dt;
      const hg = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.7);
      hg.addColorStop(0, 'rgba(255,30,60,0)'); hg.addColorStop(1, `rgba(255,30,60,${this.hurtFlash * 1.1})`);
      ctx.fillStyle = hg; ctx.fillRect(0, 0, this.w, this.h);
    }
    const lowHp = p.hp / p.maxHp;
    if (lowHp < 0.3 && game.state === 'play') {
      const a = (0.3 - lowHp) * (0.6 + Math.sin(this.time * 6) * 0.3);
      const hg = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.7);
      hg.addColorStop(0, 'rgba(200,0,40,0)'); hg.addColorStop(1, `rgba(200,0,40,${a})`);
      ctx.fillStyle = hg; ctx.fillRect(0, 0, this.w, this.h);
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(${this.flashColor},${Math.min(0.7, this.flash * 0.6)})`;
      ctx.fillRect(0, 0, this.w, this.h);
      this.flash -= dt * 1.6;
    }
  }

  worldToScreen(x, y) { return { x: (x - this.view.x0) * this.zoom, y: (y - this.view.y0) * this.zoom }; }

  // ---------------------------------------------------------------- background props
  drawProps(ctx, x0, y0, x1, y1, layer) {
    const cx0 = Math.floor((x0 - 100) / CHUNK), cx1 = Math.floor((x1 + 100) / CHUNK);
    const cy0 = Math.floor((y0 - 100) / CHUNK), cy1 = Math.floor((y1 + 100) / CHUNK);
    const S = SPRITE_SCALE, sp = this.sp.props;
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const bx = cx * CHUNK, by = cy * CHUNK;
        const n = 5 + Math.floor(hash2(cx, cy, 1) * 5);
        for (let i = 0; i < n; i++) {
          const r = hash2(cx, cy, 10 + i);
          const px = bx + hash2(cx, cy, 30 + i) * CHUNK, py = by + hash2(cx, cy, 60 + i) * CHUNK;
          let img;
          let tall = false;
          if (r < 0.03) { img = sp.torii; tall = true; }
          else if (r < 0.1) { img = sp.lantern; tall = true; }
          else if (r < 0.14) { img = sp.jizo; tall = true; }
          else if (r < 0.32) img = sp.lily[i % 3];
          else if (r < 0.48) img = sp.stone[i % 3];
          else img = sp.grass[i % 4];
          if ((layer === 'over') !== false && layer === 'over') continue; // all props drawn under entities
          ctx.drawImage(img, px - img.width / S / 2, py - img.height / S / 2, img.width / S, img.height / S);
          if (img === sp.lantern) {
            ctx.globalCompositeOperation = 'lighter';
            const flick = 0.75 + Math.sin(this.time * 7 + i) * 0.08 + Math.sin(this.time * 13 + cx) * 0.05;
            const g = this.sp.glow.orange;
            ctx.globalAlpha = 0.55 * flick;
            ctx.drawImage(g, px - 90, py - 100, 180, 180);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          }
          if (img === sp.lily[i % 3] && r < 0.2) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.18;
            ctx.drawImage(this.sp.glow.red, px - 30, py - 30, 60, 60);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          }
          if (tall) {/* tall props stay under; enemies drawn above for clarity */}
        }
      }
    }
  }

  // ---------------------------------------------------------------- thread
  smoothPath(ctx, pts, from, to) {
    ctx.moveTo(pts[from].x, pts[from].y);
    for (let i = from + 1; i < to - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[to - 1].x, pts[to - 1].y);
  }

  drawThread(ctx, game) {
    const th = game.thread;
    if (th.length < 2) return;
    const pts = th.concat([{ x: game.player.x, y: game.player.y }]);
    const n = pts.length;
    const col = game.char.glow;
    const frac = game.threadLen / game.stats.threadLen;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    // draw in chunks so the oldest part fades out (it is about to be reeled in)
    const chunks = 6;
    for (let c = 0; c < chunks; c++) {
      const a = Math.floor((c / chunks) * (n - 1)), b = Math.min(n, Math.floor(((c + 1) / chunks) * (n - 1)) + 2);
      if (b - a < 2) continue;
      const f = (c + 1) / chunks;
      const fade = frac > 0.85 ? clamp(f * 1.6 - 0.2, 0.15, 1) : clamp(0.35 + f, 0.35, 1);
      ctx.beginPath(); this.smoothPath(ctx, pts, a, b);
      ctx.strokeStyle = col + (0.10 * fade) + ')'; ctx.lineWidth = 14; ctx.stroke();
      ctx.strokeStyle = col + (0.35 * fade) + ')'; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = `rgba(255,240,245,${0.85 * fade})`; ctx.lineWidth = 1.6; ctx.stroke();
    }
    // travelling shimmer beads
    const t = this.time * 1.3;
    for (let i = 0; i < 5; i++) {
      const f = (t * 0.5 + i / 5) % 1;
      const idx = Math.floor(f * (n - 1));
      const q = pts[idx];
      ctx.globalAlpha = 0.8;
      ctx.drawImage(this.sp.glow.white, q.x - 7, q.y - 7, 14, 14);
    }
    ctx.globalAlpha = 1;
    // razor glints
    if (game.lv('razor')) {
      for (let i = 0; i < n; i += 9) {
        const q = pts[i];
        const s = 2 + Math.sin(this.time * 12 + i) * 1.5;
        ctx.strokeStyle = 'rgba(230,245,255,0.8)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(q.x - s * 2, q.y); ctx.lineTo(q.x + s * 2, q.y); ctx.moveTo(q.x, q.y - s * 2); ctx.lineTo(q.x, q.y + s * 2); ctx.stroke();
      }
    }
    // tail knot (the free end)
    ctx.globalCompositeOperation = 'source-over';
    const tail = pts[0];
    ctx.fillStyle = col + '0.9)';
    ctx.beginPath(); ctx.arc(tail.x, tail.y, 2.5, 0, TAU); ctx.fill();
  }

  drawPreview(ctx, game) {
    const poly = game.previewLoop();
    if (!poly) return;
    const pulse = 0.5 + Math.sin(this.time * 14) * 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(poly[0], poly[1]);
    for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1]);
    ctx.closePath();
    ctx.fillStyle = game.char.glow + (0.06 + pulse * 0.05) + ')';
    ctx.fill();
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -this.time * 40;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    // closing point
    const x = poly[0], y = poly[1];
    ctx.strokeStyle = `rgba(255,230,160,${0.5 + pulse * 0.5})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 9 + pulse * 4, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- zones & hazards
  polyPath(ctx, p) {
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.closePath();
  }

  drawZone(ctx, z) {
    const a = clamp(z.life / Math.min(0.6, z.max), 0, 1);
    if (z.kind === 'seal') {
      this.polyPath(ctx, z.poly);
      const kk = z.kekkai;
      ctx.fillStyle = kk ? `rgba(220,190,255,${0.16 * a})` : `rgba(160,110,255,${0.14 * a})`;
      ctx.fill();
      ctx.setLineDash([10, 6]);
      ctx.lineDashOffset = this.time * 30;
      ctx.strokeStyle = kk ? `rgba(255,240,255,${0.8 * a})` : `rgba(200,160,255,${0.7 * a})`;
      ctx.lineWidth = kk ? 3 : 2;
      ctx.stroke();
      ctx.setLineDash([]);
      // sigil at the centre
      ctx.save();
      ctx.translate(z.cx, z.cy); ctx.rotate(this.time * 0.6);
      ctx.strokeStyle = `rgba(210,170,255,${0.45 * a})`; ctx.lineWidth = 1.5;
      const R = 26;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 5; i++) { const ang = (i * 2 * TAU) / 5 - Math.PI / 2; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(ang) * R, Math.sin(ang) * R); }
      ctx.closePath(); ctx.stroke();
      ctx.restore();
    } else if (z.kind === 'hole') {
      ctx.save();
      ctx.translate(z.cx, z.cy);
      const R = 46 + Math.sin(this.time * 9) * 4;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 2.2);
      g.addColorStop(0, `rgba(0,0,0,${0.95 * a})`); g.addColorStop(0.4, `rgba(10,30,30,${0.8 * a})`); g.addColorStop(0.7, `rgba(80,255,200,${0.25 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 2.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(140,255,215,${0.6 * a})`; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(0, 0, R * (0.8 + i * 0.5), this.time * (3 + i) + i, this.time * (3 + i) + i + 2.2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawHazards(ctx, game) {
    for (const w of game.webs) {
      const armed = w.t >= w.arm;
      const fade = clamp((w.life - w.t) / 0.8, 0, 1);
      ctx.lineCap = 'round';
      if (!armed) {
        ctx.strokeStyle = `rgba(255,80,120,${0.3 + Math.sin(this.time * 30) * 0.2})`; ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath(); ctx.moveTo(w.x0, w.y0); ctx.lineTo(w.x1, w.y1); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = `rgba(230,220,255,${0.75 * fade})`; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(w.x0, w.y0); ctx.lineTo(w.x1, w.y1); ctx.stroke();
        ctx.strokeStyle = `rgba(190,120,255,${0.25 * fade})`; ctx.lineWidth = 9;
        ctx.stroke();
        // dew beads
        const L = Math.hypot(w.x1 - w.x0, w.y1 - w.y0);
        ctx.fillStyle = `rgba(255,255,255,${0.7 * fade})`;
        for (let d = 0; d < L; d += 36) { const f = d / L; ctx.beginPath(); ctx.arc(w.x0 + (w.x1 - w.x0) * f, w.y0 + (w.y1 - w.y0) * f, 1.8, 0, TAU); ctx.fill(); }
      }
    }
    for (const t of game.telegraphs) {
      const f = 1 - t.t / t.max;
      const a = 0.25 + f * 0.45 + Math.sin(this.time * 30) * 0.08;
      if (t.kind === 'line') {
        ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(Math.atan2(t.dy, t.dx));
        ctx.fillStyle = `rgba(255,40,70,${a * 0.35})`; ctx.fillRect(0, -t.w / 2, t.len, t.w);
        ctx.fillStyle = `rgba(255,60,90,${a})`; ctx.fillRect(0, -t.w / 2, t.len * f, t.w);
        ctx.strokeStyle = `rgba(255,120,140,${a})`; ctx.lineWidth = 2; ctx.strokeRect(0, -t.w / 2, t.len, t.w);
        ctx.restore();
      } else {
        ctx.fillStyle = `rgba(255,40,70,${a * 0.3})`; ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,90,110,${a})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.stroke();
        ctx.fillStyle = `rgba(255,60,90,${a * 0.5})`; ctx.beginPath(); ctx.arc(t.x, t.y, t.r * f, 0, TAU); ctx.fill();
      }
    }
  }

  // ---------------------------------------------------------------- pickups
  drawPickups(ctx, game, x0, y0, x1, y1) {
    const S = SPRITE_SCALE, sp = this.sp.pickups;
    for (const k of game.pickups) {
      if (k.x < x0 - 40 || k.x > x1 + 40 || k.y < y0 - 40 || k.y > y1 + 40) continue;
      const bob = Math.sin(this.time * 4 + k.x * 0.05) * 2;
      let img;
      if (k.kind === 'xp') img = sp.xp[k.v >= 25 ? 3 : k.v >= 8 ? 2 : k.v >= 3 ? 1 : 0];
      else img = sp[k.kind];
      const w = img.width / S, h = img.height / S;
      let sc = 1;
      if (k.kind === 'chest') sc = 1 + Math.sin(this.time * 5) * 0.06;
      ctx.drawImage(img, k.x - (w * sc) / 2, k.y - (h * sc) / 2 + bob, w * sc, h * sc);
      if (k.kind === 'chest') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 + Math.sin(this.time * 5) * 0.2;
        ctx.drawImage(this.sp.glow.gold, k.x - 50, k.y - 50, 100, 100);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  // ---------------------------------------------------------------- player
  drawPlayer(ctx, game) {
    const p = game.player, ch = game.char;
    const t = this.time;
    if (p.inv > 0 && p.dashT <= 0 && Math.floor(t * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    const moving = Math.hypot(p.vx, p.vy) > 30;
    const bob = moving ? Math.abs(Math.sin(t * 13)) * 2.5 : Math.sin(t * 3) * 1;
    // dash afterimages
    if (p.dashT > 0) this.after.push({ x: p.x, y: p.y, t: 0.25, face: p.face });
    for (const a of this.after) {
      a.t -= 1 / 60;
      ctx.globalAlpha = Math.max(0, a.t * 2.4);
      ctx.fillStyle = ch.color;
      ctx.beginPath(); ctx.ellipse(a.x, a.y - 12, 10, 15, 0, 0, TAU); ctx.fill();
    }
    this.after = this.after.filter((a) => a.t > 0);
    ctx.globalAlpha = p.inv > 0 && p.dashT <= 0 && Math.floor(t * 20) % 2 === 0 ? 0.45 : 1;

    ctx.save();
    ctx.translate(p.x, p.y);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 9, 13, 4.5, 0, 0, TAU); ctx.fill();
    // dash cooldown ring
    if (p.dashCd > 0) {
      const f = 1 - p.dashCd / (2.0 * game.stats.cdMul);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 9, 17, 6, 0, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke();
    }
    ctx.scale(p.face, 1);
    ctx.translate(0, -bob);
    // trailing ribbon (scarf), waves opposite the movement
    const sway = Math.sin(t * 9) * 3;
    ctx.strokeStyle = ch.thread; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-3, -16);
    ctx.bezierCurveTo(-12, -14 + sway, -16, -6 - sway, -24 - (moving ? 4 : 0), -10 + sway);
    ctx.stroke();
    // body: haori
    const body = ctx.createLinearGradient(0, -16, 0, 8);
    body.addColorStop(0, '#f4efe6'); body.addColorStop(1, '#cfc4b4');
    ctx.fillStyle = '#1d1828';
    ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(-11, 7); ctx.lineTo(11, 7); ctx.lineTo(9, -6); ctx.closePath(); ctx.fill(); // hakama
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(-8, -15); ctx.lineTo(-12, 1); ctx.quadraticCurveTo(0, 4, 12, 1); ctx.lineTo(8, -15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = ch.color;
    ctx.fillRect(-11, -2, 22, 2.2);
    ctx.beginPath(); ctx.moveTo(-3, -15); ctx.lineTo(0, -8); ctx.lineTo(3, -15); ctx.closePath(); ctx.fill();
    // legs
    ctx.fillStyle = '#1d1828';
    const step = moving ? Math.sin(t * 13) * 2.5 : 0;
    ctx.fillRect(-6 + step, 6, 4, 4); ctx.fillRect(2 - step, 6, 4, 4);
    // head
    ctx.fillStyle = '#ffe7d2';
    ctx.beginPath(); ctx.arc(1, -22, 7.5, 0, TAU); ctx.fill();
    // hair: bob cut
    ctx.fillStyle = '#1a1424';
    ctx.beginPath();
    ctx.arc(0, -23, 8.6, Math.PI * 0.95, Math.PI * 2.08);
    ctx.lineTo(9, -17); ctx.quadraticCurveTo(5, -19, 4, -24); ctx.quadraticCurveTo(-3, -22, -9, -16);
    ctx.closePath(); ctx.fill();
    // hair ornament
    ctx.fillStyle = ch.color;
    ctx.beginPath(); ctx.arc(-6, -29, 2.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd76a'; ctx.beginPath(); ctx.arc(-6, -29, 1, 0, TAU); ctx.fill();
    // eye
    ctx.fillStyle = '#2a1a30';
    ctx.fillRect(5, -22, 1.8, 2.6);
    // spool in hands with glowing thread origin
    ctx.fillStyle = '#7a5532';
    ctx.fillRect(7, -9, 6, 7);
    ctx.fillStyle = ch.thread; ctx.fillRect(7.5, -7.5, 5, 4);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    const glowKey = game.char.id === 'yui' ? 'red' : game.char.id === 'ai' ? 'blue' : 'silver';
    ctx.drawImage(this.sp.glow[glowKey], p.x - 40, p.y - 52, 80, 80);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // magnet radius hint (very faint)
  }

  // ---------------------------------------------------------------- enemies
  drawEnemy(ctx, game, e) {
    const key = e.type + (e.elite ? '_e' : '');
    const frames = this.sp.enemies[e.flash > 0 ? key + '_f' : key];
    if (!frames) return;
    const f = Math.floor(this.time * 6 + e.phase * 3) % 2;
    const img = frames[f];
    const S = SPRITE_SCALE;
    const w = img.width / S, h = img.height / S;
    const bob = e.def.ai === 'ranged' ? Math.sin(this.time * 3 + e.phase) * 4 - 6 : Math.abs(Math.sin(this.time * 8 + e.phase)) * -2;
    ctx.save();
    ctx.translate(e.x, e.y + bob);
    if (e.def.ai === 'school') ctx.rotate(Math.atan2(e.vy, e.vx));
    else if (e.vx < -5) ctx.scale(-1, 1);
    if (e.def.ai === 'dasher' && e.state === 1) {
      const s = 1 + Math.sin(this.time * 40) * 0.08;
      ctx.scale(1.15 * s, 0.85);
    }
    if (e.stun > 0) ctx.rotate(Math.sin(this.time * 30) * 0.15);
    if (e.slow > 0 && e.def.ai !== 'cutter') ctx.globalAlpha = 0.92;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (e.elite) {
      // elite aura & hp
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + Math.sin(this.time * 6) * 0.1;
      ctx.drawImage(this.sp.glow.gold, e.x - e.r * 2.5, e.y - e.r * 2.5, e.r * 5, e.r * 5);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      const f2 = e.hp / e.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - 20, e.y - e.r - 16, 40, 5);
      ctx.fillStyle = '#ffcf5a'; ctx.fillRect(e.x - 19, e.y - e.r - 15, 38 * f2, 3);
    }
    if (e.def.ai === 'cutter' && e.timer > 0.9) {
      ctx.fillStyle = '#ff6b7a'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('✂', e.x, e.y - e.r - 6);
    }
  }

  drawBoss(ctx, game, b) {
    const t = this.time;
    const r = b.r;
    ctx.save();
    ctx.translate(b.x, b.y - (b.air || 0) * 70);
    if (b.air) ctx.scale(1 + b.air * 0.15, 1 + b.air * 0.15);
    // aura
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45;
    const gk = b.type === 'obasami' ? 'red' : b.type === 'hyakume' ? 'orange' : 'violet';
    ctx.drawImage(this.sp.glow[gk], -r * 3, -r * 3, r * 6, r * 6);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (b.flash > 0) ctx.filter = 'brightness(2.2)';
    if (b.type === 'obasami') {
      const open = b.state === 'aim' ? 0.75 + Math.sin(t * 30) * 0.05 : b.state === 'charge' ? 0.15 : 0.35 + Math.sin(t * 4) * 0.1;
      ctx.rotate(b.state === 'charge' || b.state === 'aim' ? Math.atan2(b.ay, b.ax) + Math.PI / 2 : Math.sin(t * 2) * 0.2);
      this.paintScissors(ctx, r * 0.9, open);
    } else if (b.type === 'hyakume') {
      ctx.translate(0, Math.sin(t * 2) * 6);
      painters.chochin(ctx, r, Math.floor(t * 4) % 2);
      // many eyes
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4 + 0.5;
        const ex = Math.cos(a) * r * 0.62 * ((i % 3) / 3 + 0.4), ey = Math.sin(a) * r * 0.7 * ((i % 3) / 3 + 0.4) + r * 0.05;
        const blink = Math.sin(t * 2 + i * 1.7) > 0.95 ? 0.15 : 1;
        ctx.save(); ctx.translate(ex, ey); ctx.scale(1, blink);
        ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.12, r * 0.1, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c0102a'; ctx.beginPath(); ctx.arc(Math.cos(t + i) * r * 0.03, 0, r * 0.06, 0, TAU); ctx.fill();
        ctx.restore();
      }
    } else if (b.type === 'jorou') {
      this.paintSpider(ctx, r, b);
    }
    ctx.filter = 'none';
    ctx.restore();
  }

  paintScissors(ctx, r, open) {
    for (const s of [-1, 1]) {
      ctx.save(); ctx.rotate(s * open);
      const grd = ctx.createLinearGradient(0, -r * 1.6, 0, 0);
      grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.6, '#b9c6d8'); grd.addColorStop(1, '#5d6a80');
      ctx.fillStyle = '#07050c';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * r * 0.3, -r * 0.2); ctx.lineTo(s * r * 0.08, -r * 1.75); ctx.lineTo(-s * r * 0.12, -r * 0.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * r * 0.25, -r * 0.2); ctx.lineTo(s * r * 0.07, -r * 1.65); ctx.lineTo(-s * r * 0.09, -r * 0.2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#07050c'; ctx.lineWidth = r * 0.3;
      ctx.beginPath(); ctx.ellipse(-s * r * 0.3, r * 0.75, r * 0.36, r * 0.46, s * 0.2, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#c8202f'; ctx.lineWidth = r * 0.2;
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = '#20182c'; ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe3e3'; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d0102a'; ctx.beginPath(); ctx.arc(0, 0, r * 0.12, 0, TAU); ctx.fill();
    // knotted cord
    ctx.strokeStyle = '#ffcf5a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, r * 0.3); ctx.bezierCurveTo(r * 0.3, r * 1.2, -r * 0.4, r * 1.3, r * 0.1, r * 1.8); ctx.stroke();
  }

  paintSpider(ctx, r, b) {
    const t = this.time;
    const walk = Math.hypot(b.vx, b.vy) > 10 ? 1 : 0.3;
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const base = -0.95 + i * 0.6;
      const sw = Math.sin(t * 10 * walk + i * 1.6 + (s > 0 ? Math.PI : 0)) * 0.18 * walk;
      const a = base + sw;
      const kx = s * Math.cos(a) * r * 1.3, ky = Math.sin(a) * r * 1.1 - r * 0.7;
      const fx = s * Math.cos(a) * r * 2.0, fy = Math.sin(a) * r * 1.4 + r * 0.4;
      ctx.strokeStyle = '#07050c'; ctx.lineWidth = r * 0.17;
      ctx.beginPath(); ctx.moveTo(s * r * 0.3, 0); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.strokeStyle = '#2b1f3a'; ctx.lineWidth = r * 0.1;
      ctx.beginPath(); ctx.moveTo(s * r * 0.3, 0); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.fillStyle = '#c8202f'; ctx.beginPath(); ctx.arc(kx, ky, r * 0.06, 0, TAU); ctx.fill();
    }
    // abdomen
    const ab = ctx.createRadialGradient(-r * 0.2, r * 0.3, r * 0.1, 0, r * 0.55, r);
    ab.addColorStop(0, '#3b2c55'); ab.addColorStop(1, '#0c0814');
    ctx.fillStyle = ab; ctx.beginPath(); ctx.ellipse(0, r * 0.6, r * 0.85, r * 0.95, 0, 0, TAU); ctx.fill();
    // golden striped pattern
    ctx.strokeStyle = '#ffcf5a'; ctx.lineWidth = r * 0.07;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, r * (0.35 + i * 0.3), r * (0.7 - i * 0.12), r * 0.12, 0, 0.2, Math.PI - 0.2); ctx.stroke(); }
    ctx.fillStyle = '#e8213d';
    ctx.beginPath(); ctx.moveTo(0, r * 0.95); ctx.lineTo(r * 0.16, r * 1.2); ctx.lineTo(0, r * 1.45); ctx.lineTo(-r * 0.16, r * 1.2); ctx.fill();
    // cephalothorax with mask face
    ctx.fillStyle = '#16101f'; ctx.beginPath(); ctx.ellipse(0, -r * 0.2, r * 0.55, r * 0.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f6eee0'; ctx.beginPath(); ctx.ellipse(0, -r * 0.28, r * 0.36, r * 0.42, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a1424';
    ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.55); ctx.quadraticCurveTo(0, -r * 0.95, r * 0.4, -r * 0.55); ctx.quadraticCurveTo(0, -r * 0.7, -r * 0.4, -r * 0.55); ctx.fill();
    const rage = (b.phaseN || 1) >= 3;
    for (const s of [-1, 1]) {
      ctx.fillStyle = rage ? '#ff2040' : '#ffcf5a';
      ctx.beginPath(); ctx.ellipse(s * r * 0.15, -r * 0.35, r * 0.08, r * 0.04, s * 0.4, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#c8202f'; ctx.beginPath(); ctx.ellipse(0, -r * 0.08, r * 0.07, r * 0.04, 0, 0, TAU); ctx.fill();
    // fangs
    ctx.fillStyle = '#efe6d6';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * r * 0.12, r * 0.08); ctx.lineTo(s * r * 0.06, r * 0.3); ctx.lineTo(s * r * 0.02, r * 0.08); ctx.fill(); }
  }

  drawGlowLights(ctx, game, ents) {
    // soft light around glowing enemies (lanterns & wisps)
    for (const e of ents) {
      if (e.type === 'chochin') { ctx.globalAlpha = 0.28; ctx.drawImage(this.sp.glow.orange, e.x - e.r * 3, e.y - e.r * 3, e.r * 6, e.r * 6); }
      else if (e.type === 'onibi') { ctx.globalAlpha = 0.35; ctx.drawImage(this.sp.glow.cyan, e.x - e.r * 3.5, e.y - e.r * 3.5 - 6, e.r * 7, e.r * 7); }
    }
    ctx.globalAlpha = 1;
  }

  drawShots(ctx, game) {
    for (const s of game.shots) {
      if (s.kind === 'needle') {
        const a = Math.atan2(s.vy, s.vx);
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(a);
        ctx.strokeStyle = 'rgba(200,225,255,0.35)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(6, 0); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(8, 0); ctx.stroke();
        ctx.restore();
      } else if (s.kind === 'petal') {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
        ctx.globalAlpha = Math.min(1, s.life * 3);
        ctx.drawImage(this.sp.glow.pink, -14, -14, 28, 28);
        ctx.fillStyle = '#ffd0e6';
        ctx.beginPath(); ctx.moveTo(0, -7); ctx.quadraticCurveTo(6, -2, 0, 7); ctx.quadraticCurveTo(-6, -2, 0, -7); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      }
    }
  }

  drawFoxfire(ctx, game) {
    const fl = game.lv('foxfire');
    if (!fl) return;
    const st = UPGRADES.foxfire.stat(fl - 1);
    const orbs = game.foxOrbs(st, game.evolved.foxfire);
    for (const o of orbs) {
      const s = o.trail ? 30 : 38;
      ctx.drawImage(this.sp.glow.cyan, o.x - s / 2, o.y - s / 2 - 4, s, s);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this.sp.glow.white, o.x - 7, o.y - 9, 14, 14);
      ctx.globalAlpha = 1;
      if (Math.random() < 0.3) this.part({ x: o.x, y: o.y, vx: (Math.random() - 0.5) * 20, vy: -40, life: 0.4, max: 0.4, size: 2.5, color: '#7fd8ff', kind: 'spark', drag: 1, g: 0, rot: 0, vr: 0 });
    }
  }

  drawCranes(ctx, game) {
    for (const c of game.cranes) {
      const a = Math.atan2(c.vy, c.vx);
      const flap = Math.sin(this.time * 18 + c.x * 0.01);
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(a);
      const s = c.phoenix ? 1.9 : 1;
      ctx.scale(s, s);
      ctx.drawImage(this.sp.glow[c.phoenix ? 'orange' : 'white'], -18, -18, 36, 36);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = c.phoenix ? '#ffb84a' : '#fbf6ea';
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-4, -2); ctx.lineTo(-10, 0); ctx.lineTo(-4, 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c.phoenix ? '#ff6a3a' : '#e8dfcc';
      ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-4, -11 * flap); ctx.lineTo(-6, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-4, 11 * flap); ctx.lineTo(-6, 0); ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
      if (c.phoenix && Math.random() < 0.6) this.part({ x: c.x, y: c.y, vx: -c.vx * 0.1, vy: -c.vy * 0.1, life: 0.5, max: 0.5, size: 4, color: '#ff9a3a', kind: 'spark', drag: 2, g: 0, rot: 0, vr: 0 });
    }
  }

  drawCinches(ctx, game, dt) {
    for (const c of this.cinches) {
      c.t += dt;
      const f = clamp(c.t / c.dur, 0, 1);
      const s = 1 - easeOutCubic(f) * 0.35;
      ctx.save(); ctx.translate(c.cx, c.cy); ctx.scale(s, s); ctx.translate(-c.cx, -c.cy);
      this.polyPath(ctx, c.poly);
      ctx.strokeStyle = game.char.glow + (0.9 * (1 - f * 0.5)) + ')'; ctx.lineWidth = 6 / s; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2 / s; ctx.stroke();
      ctx.fillStyle = game.char.glow + (0.12 + f * 0.25) + ')'; ctx.fill();
      ctx.restore();
    }
    this.cinches = this.cinches.filter((c) => c.t < c.dur);
  }

  drawSnaps(ctx, game, dt) {
    for (const s of this.snaps) {
      s.t += dt;
      const f = s.t / 0.6;
      if (f >= 1) continue;
      const a = 1 - f;
      ctx.save();
      const sc = 0.65 - f * 0.25;
      ctx.translate(s.cx, s.cy); ctx.scale(sc, sc); ctx.translate(-s.cx, -s.cy);
      this.polyPath(ctx, s.poly);
      ctx.fillStyle = s.echo ? `rgba(255,230,150,${a * 0.25})` : s.color + (a * 0.45) + ')';
      ctx.fill();
      ctx.restore();
      if (!s.echo) {
        // kanji stamp
        const st = easeOutBack(clamp(s.t / 0.18, 0, 1));
        const size = (30 + Math.min(s.n, 30) * 2.2) * (s.crit ? 1.3 : 1);
        ctx.save();
        ctx.translate(s.cx, s.cy); ctx.scale(st, st); ctx.rotate(-0.12);
        ctx.globalAlpha = a;
        ctx.font = `900 ${size}px "Zen Antique", "Yu Mincho", serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = s.crit ? 'rgba(255,215,90,0.95)' : 'rgba(255,240,240,0.9)';
        ctx.fillText('結', 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
    this.snaps = this.snaps.filter((s) => s.t < 0.6);
  }

  drawArcs(ctx, dt) {
    for (const a of this.arcs) {
      a.t += dt;
      const f = 1 - a.t / a.dur;
      if (f <= 0) continue;
      const p = a.pts;
      for (const pass of [[8, 0.25], [2.5, 0.95]]) {
        ctx.strokeStyle = `rgba(170,225,255,${pass[1] * f})`; ctx.lineWidth = pass[0];
        ctx.beginPath(); ctx.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length; i += 2) {
          const x0 = p[i - 2], y0 = p[i - 1], x1 = p[i], y1 = p[i + 1];
          const segs = 6;
          for (let s = 1; s <= segs; s++) {
            const t = s / segs;
            const j = s === segs ? 0 : (hash2(i, s, Math.floor(a.seed + this.time * 30)) - 0.5) * 26;
            const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
            ctx.lineTo(x0 + (x1 - x0) * t + (nx / nl) * j, y0 + (y1 - y0) * t + (ny / nl) * j);
          }
        }
        ctx.stroke();
      }
    }
    this.arcs = this.arcs.filter((a) => a.t < a.dur);
  }

  drawRings(ctx, dt) {
    for (const r of this.rings) {
      r.t += dt;
      if (r.t < 0) continue;
      const f = clamp(r.t / r.dur, 0, 1);
      const rad = r.r0 + (r.r1 - r.r0) * easeOutCubic(f);
      ctx.strokeStyle = `rgba(${r.color},${(1 - f) * 0.9})`;
      ctx.lineWidth = r.w * (1 - f) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(1, rad), 0, TAU); ctx.stroke();
      if (r.fill) { ctx.fillStyle = `rgba(${r.color},${(1 - f) * 0.3})`; ctx.fill(); }
    }
    this.rings = this.rings.filter((r) => r.t < r.dur);
  }

  drawParticles(ctx, dt, additive) {
    const ps = this.particles;
    for (const q of ps) {
      if ((q.kind === 'ink') === additive) continue;
      if (dt > 0 || !additive) {
        // update only once per frame (in the additive pass) unless ink
      }
      const a = clamp(q.life / q.max, 0, 1);
      if (q.kind === 'ink') {
        ctx.globalAlpha = a;
        ctx.fillStyle = q.color;
        ctx.beginPath(); ctx.ellipse(q.x, q.y, q.size, q.size * 0.8, q.rot, 0, TAU); ctx.fill();
      } else {
        ctx.globalAlpha = a;
        const s = q.size * 3;
        ctx.fillStyle = q.color;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (0.5 + a * 0.5), 0, TAU); ctx.fill();
        ctx.globalAlpha = a * 0.5;
        ctx.drawImage(this.sp.glow.white, q.x - s, q.y - s, s * 2, s * 2);
      }
    }
    ctx.globalAlpha = 1;
    if (additive) {
      const step = dt;
      for (const q of ps) {
        q.life -= step;
        const d = Math.exp(-q.drag * step);
        q.vx *= d; q.vy *= d; q.vy += q.g * step;
        q.x += q.vx * step; q.y += q.vy * step; q.rot += q.vr * step;
      }
      this.particles = ps.filter((q) => q.life > 0);
    }
  }

  drawEBullets(ctx, game) {
    for (const b of game.ebullets) {
      const col = b.kind === 'web' ? 'violet' : b.kind === 'eye' ? 'red' : 'orange';
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.sp.glow[col], b.x - b.r * 3, b.y - b.r * 3, b.r * 6, b.r * 6);
      ctx.globalCompositeOperation = 'source-over';
      // dark rim + bright core: readable on any background
      ctx.fillStyle = '#12060c';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 1.5, 0, TAU); ctx.fill();
      ctx.fillStyle = b.kind === 'web' ? '#e6d8ff' : b.kind === 'eye' ? '#ff5577' : '#ffb054';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.45, 0, TAU); ctx.fill();
      if (b.kind === 'eye') { ctx.fillStyle = '#300'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.22, 0, TAU); ctx.fill(); }
    }
  }

  drawTexts(ctx, dt) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      t.life -= dt;
      t.y += t.vy * dt; t.vy *= Math.exp(-3 * dt);
      const age = t.max - t.life;
      const pop = age < 0.12 ? 1 + (t.pop - 1) * (1 - age / 0.12) : 1;
      const a = clamp(t.life / (t.max * 0.4), 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `800 ${Math.round(t.size * pop)}px "Zen Kaku Gothic New", sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = t.stroke; ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  drawOffscreen(ctx, game, x0, y0, x1, y1, cx, cy, vw, vh) {
    const marks = [];
    if (game.boss && !game.boss.dead) marks.push({ x: game.boss.x, y: game.boss.y, color: '#ff4060', icon: '妖' });
    for (const k of game.pickups) if (k.kind === 'chest') marks.push({ x: k.x, y: k.y, color: '#ffcf5a', icon: '宝' });
    for (const m of marks) {
      if (m.x > x0 + 20 && m.x < x1 - 20 && m.y > y0 + 20 && m.y < y1 - 20) continue;
      const dx = m.x - cx, dy = m.y - cy;
      const s = Math.min((vw / 2 - 30) / Math.abs(dx || 1e-6), (vh / 2 - 30) / Math.abs(dy || 1e-6));
      const px = cx + dx * s, py = cy + dy * s;
      const a = Math.atan2(dy, dx);
      ctx.save(); ctx.translate(px, py);
      ctx.fillStyle = m.color;
      ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(4, -8); ctx.lineTo(4, 8); ctx.fill();
      ctx.rotate(-a);
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
      ctx.fillStyle = '#120f1c'; ctx.font = '700 12px "Zen Kaku Gothic New", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(m.icon, 0, 1);
      ctx.restore();
    }
  }
}
