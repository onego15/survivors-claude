// Fully synthesized audio (WebAudio): koto plucks, taiko, bells, a breathy flute, and a
// procedural "night festival" soundtrack in the Japanese In scale that intensifies with the run.

const IN_SCALE = [0, 1, 5, 7, 8]; // D Eb G A Bb (miyako-bushi)
const ROOT = 62; // D4

function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function scaleNote(deg, oct = 0) {
  const n = IN_SCALE.length;
  const o = Math.floor(deg / n);
  const d = ((deg % n) + n) % n;
  return ROOT + IN_SCALE[d] + 12 * (o + oct);
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.6;
    this.sfxVol = 0.8;
    this.intensity = 0;
    this.playing = false;
    this.step = 0;
    this.limits = {};
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.music = ctx.createGain(); this.music.gain.value = this.musicVol * 0.5; this.music.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
    // reverb
    this.verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.verb.buffer = ir;
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.35;
    this.verbIn.connect(this.verb); this.verb.connect(this.master);
    // noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;
  }

  setVolumes(music, sfx) {
    this.musicVol = music; this.sfxVol = sfx;
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(music * 0.5, this.ctx.currentTime, 0.05);
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
  }

  // ---------------------------------------------------------------- instruments
  out(bus, verb = 0.3) {
    const g = this.ctx.createGain();
    g.connect(bus);
    if (verb > 0) { const s = this.ctx.createGain(); s.gain.value = verb; g.connect(s); s.connect(this.verbIn); }
    return g;
  }

  pluck(freq, t, vol = 0.3, bus = this.sfx, decay = 1.2, verb = 0.35) {
    const c = this.ctx;
    const o1 = c.createOscillator(), o2 = c.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'triangle';
    o1.frequency.value = freq; o2.frequency.value = freq * 2.003;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(freq * 9, t); f.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.2), t + decay * 0.5);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
    const g2 = c.createGain(); g2.gain.value = 0.35;
    o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(this.out(bus, verb));
    o1.start(t); o2.start(t); o1.stop(t + decay + 0.05); o2.stop(t + decay + 0.05);
  }

  taiko(t, vol = 0.6, pitch = 1, bus = this.sfx) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140 * pitch, t); o.frequency.exponentialRampToValueAtTime(48 * pitch, t + 0.25);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g); g.connect(this.out(bus, 0.25));
    o.start(t); o.stop(t + 0.6);
    const n = c.createBufferSource(); n.buffer = this.noise;
    const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 900;
    const ng = c.createGain(); ng.gain.setValueAtTime(vol * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    n.connect(nf); nf.connect(ng); ng.connect(this.out(bus, 0.1));
    n.start(t); n.stop(t + 0.15);
  }

  ka(t, vol = 0.2, bus = this.sfx) { // rim click
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2800; f.Q.value = 3;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(f); f.connect(g); g.connect(this.out(bus, 0.15));
    n.start(t, Math.random()); n.stop(t + 0.06);
  }

  bell(freq, t, vol = 0.25, dur = 2.2, bus = this.sfx) {
    const c = this.ctx;
    const out = this.out(bus, 0.5);
    for (const [ratio, amp] of [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq * ratio;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * amp, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur / ratio ** 0.5);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + dur);
    }
  }

  flute(freq, t, dur, vol = 0.12, bus = this.music) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const vib = c.createOscillator(); vib.frequency.value = 5.2;
    const vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(freq * 0.012, t + dur * 0.6);
    vib.connect(vg); vg.connect(o.frequency);
    // slight scoop up into the note (shakuhachi meri/kari feel)
    o.frequency.setValueAtTime(freq * 0.97, t); o.frequency.linearRampToValueAtTime(freq, t + 0.08);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.07); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
    const n = c.createBufferSource(); n.buffer = this.noise;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = freq * 2; nf.Q.value = 1.5;
    const ng = c.createGain(); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(vol * 0.25, t + 0.05); ng.gain.linearRampToValueAtTime(0, t + dur);
    const out = this.out(bus, 0.6);
    o.connect(g); g.connect(out); n.connect(nf); nf.connect(ng); ng.connect(out);
    o.start(t); vib.start(t); n.start(t, Math.random() * 0.5);
    o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05); n.stop(t + dur + 0.05);
  }

  drone(t, dur, vol = 0.05) {
    const c = this.ctx;
    const out = this.out(this.music, 0.5);
    for (const m of [ROOT - 24, ROOT - 17]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.1);
    }
  }

  noiseSweep(t, from, to, dur, vol = 0.2) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f); f.connect(g); g.connect(this.out(this.sfx, 0.3));
    n.start(t); n.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- SFX
  limit(key, perSec) {
    const now = this.ctx.currentTime;
    const l = this.limits[key] || (this.limits[key] = { t: 0 });
    if (now - l.t < 1 / perSec) return false;
    l.t = now; return true;
  }

  handle(fx) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01;
    for (const e of fx) {
      switch (e.type) {
        case 'knotStart':
          this.noiseSweep(t, 600, 3200, 0.16, 0.12);
          break;
        case 'knot': {
          if (e.echo) { this.pluck(mtof(scaleNote(7)), t, 0.12, this.sfx, 0.8, 0.7); break; }
          const n = Math.min(e.n, 30);
          this.taiko(t, 0.55 + Math.min(0.35, n * 0.02), 1);
          const notes = 2 + Math.min(6, Math.floor(n / 3));
          const base = Math.min(e.combo || 1, 6);
          for (let i = 0; i < notes; i++) this.pluck(mtof(scaleNote(base + i * 2, 0)), t + i * 0.045, 0.16, this.sfx, 1.4);
          if (n >= 15) this.bell(mtof(ROOT + 12), t + 0.05, 0.22, 3);
          if (e.crit) this.bell(mtof(ROOT + 24), t, 0.12, 1.2);
          break;
        }
        case 'kill':
          if (e.boss) { this.taiko(t, 0.9, 0.7); this.bell(mtof(ROOT), t + 0.1, 0.35, 4); this.bell(mtof(ROOT + 7), t + 0.4, 0.25, 4); break; }
          if (this.limit('kill', 18)) this.pluck(mtof(scaleNote(5 + Math.floor(Math.random() * 5), 1)), t, 0.04, this.sfx, 0.25, 0.1);
          break;
        case 'hit':
          if (e.src !== 'knot' && this.limit('hit', 14)) this.ka(t, 0.06);
          break;
        case 'hurt':
          this.taiko(t, 0.5, 0.6); this.noiseSweep(t, 800, 200, 0.2, 0.15);
          break;
        case 'pickup':
          if (this.limit('pickup', 22)) {
            const k = (this.pickupStep = ((this.pickupStep || 0) + 1) % 10);
            this.pluck(mtof(scaleNote(5 + k, 1)), t, 0.04, this.sfx, 0.3, 0.2);
          }
          break;
        case 'levelup':
          for (let i = 0; i < 5; i++) this.pluck(mtof(scaleNote(i * 2, 1)), t + i * 0.06, 0.12, this.sfx, 1.6);
          this.bell(mtof(ROOT + 24), t + 0.3, 0.12, 2);
          break;
        case 'evolve':
          for (let i = 0; i < 8; i++) this.pluck(mtof(scaleNote(i, 1)), t + i * 0.05, 0.12, this.sfx, 1.8);
          this.bell(mtof(ROOT + 12), t + 0.4, 0.3, 4); this.taiko(t + 0.4, 0.7, 0.8);
          break;
        case 'blast':
          if (this.limit('blast', 10)) { this.taiko(t, 0.18, 1.6); this.noiseSweep(t, 2000, 300, 0.18, 0.08); }
          break;
        case 'arc':
          if (this.limit('arc', 8)) this.noiseSweep(t, 5000, 1500, 0.12, 0.1);
          break;
        case 'bell':
          this.bell(mtof(ROOT + 31), t, 0.08, 0.8); this.bell(mtof(ROOT + 36), t + 0.02, 0.05, 0.6);
          break;
        case 'cut':
          if (this.limit('cut', 6)) { this.noiseSweep(t, 6000, 2000, 0.08, 0.15); this.pluck(mtof(ROOT - 2), t, 0.1, this.sfx, 0.3, 0.1); }
          break;
        case 'dash':
          this.noiseSweep(t, 400, 2400, 0.18, 0.12);
          break;
        case 'needle':
          if (this.limit('needle', 8)) this.ka(t, 0.03);
          break;
        case 'eshot':
          if (this.limit('eshot', 6)) this.pluck(mtof(ROOT - 12), t, e.big ? 0.08 : 0.04, this.sfx, 0.3, 0.2);
          break;
        case 'bossSpawn':
          this.taiko(t, 0.9, 0.6); this.taiko(t + 0.35, 0.9, 0.6); this.taiko(t + 0.7, 1, 0.5);
          this.bell(mtof(ROOT - 12), t, 0.3, 5);
          break;
        case 'slam':
          this.taiko(t, 0.8, 0.5);
          break;
        case 'telegraph': case 'snip':
          this.noiseSweep(t, 3000, 6000, 0.25, 0.08);
          break;
        case 'chest':
          for (let i = 0; i < 6; i++) this.bell(mtof(scaleNote(i * 2, 1)), t + i * 0.08, 0.08, 1.5);
          break;
        case 'heal':
          this.bell(mtof(ROOT + 19), t, 0.1, 1.2);
          break;
        case 'greatKnot':
          this.taiko(t + 0.1, 0.6, 0.8);
          break;
        case 'dead':
          this.bell(mtof(ROOT - 12), t, 0.3, 5); this.flute(mtof(ROOT - 2), t + 0.3, 2.4, 0.12, this.sfx);
          break;
        case 'win':
          for (let i = 0; i < 10; i++) this.pluck(mtof(scaleNote(i, 0)), t + i * 0.09, 0.12, this.sfx, 2);
          break;
        case 'warn':
          this.taiko(t, 0.5, 0.9); this.taiko(t + 0.18, 0.4, 0.9);
          break;
        case 'gravity':
          this.noiseSweep(t, 3000, 200, 0.25, 0.12);
          break;
      }
    }
  }

  ui(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    if (kind === 'hover') this.pluck(mtof(scaleNote(7, 0)), t, 0.04, this.sfx, 0.3, 0.2);
    else if (kind === 'select') { this.pluck(mtof(scaleNote(5, 0)), t, 0.12, this.sfx, 1); this.pluck(mtof(scaleNote(7, 0)), t + 0.05, 0.1, this.sfx, 1); }
    else if (kind === 'back') this.pluck(mtof(scaleNote(2, 0)), t, 0.08, this.sfx, 0.6);
    else if (kind === 'open') this.bell(mtof(ROOT + 24), t, 0.06, 1);
  }

  // ---------------------------------------------------------------- music
  startMusic() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 40);
  }

  stopMusic() {
    this.playing = false;
    clearInterval(this.timer);
  }

  setIntensity(v) { this.intensity = v; }

  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const bpm = [96, 104, 112, 120, 84][this.intensity] || 100;
    const sixteenth = 60 / bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step++;
    }
  }

  playStep(s, t, dur) {
    const I = this.intensity; // 0 calm, 1 mid, 2 boss, 3 final boss, 4 title
    const bar = Math.floor(s / 16), pos = s % 16;
    const M = this.music;
    const phrase = Math.floor(bar / 4) % 4;
    // drone every 4 bars
    if (pos === 0 && bar % 4 === 0) this.drone(t, dur * 64, I >= 2 ? 0.05 : 0.035);
    // koto ostinato
    const ost = [[0, 2, 4, 2], [0, 3, 5, 3], [-1, 2, 4, 1], [0, 2, 5, 4]][phrase];
    if (I === 4) {
      if (pos % 4 === 0) this.pluck(mtof(scaleNote(ost[(pos / 4) % 4] + (bar % 2 ? 2 : 0), -1)), t, 0.07, M, 2.2, 0.6);
    } else if (pos % 2 === 0) {
      const k = ost[(pos / 2) % 4] + (pos >= 8 ? 1 : 0);
      if (I >= 1 || pos % 4 === 0) this.pluck(mtof(scaleNote(k, -1)), t, I >= 2 ? 0.075 : 0.06, M, 0.9, 0.35);
    }
    // taiko
    const kick = [
      [0], [0, 10], [0, 6, 8, 14], [0, 3, 6, 8, 11, 14], [],
    ][I];
    if (kick.includes(pos)) this.taiko(t, I >= 2 ? 0.35 : 0.28, 1, M);
    if (I >= 1 && I !== 4 && (pos === 4 || pos === 12)) this.ka(t, 0.07, M);
    if (I >= 2 && I !== 4 && pos % 2 === 1) this.ka(t, 0.03, M);
    // flute melody: sparse phrases, more frequent with intensity
    if (pos === 0 && (bar % (I >= 2 ? 2 : 4) === 2 || I === 4 && bar % 2 === 1)) {
      const seed = (bar * 7919) % 97;
      const notes = 3 + (seed % 3);
      let deg = 5 + (seed % 4);
      for (let i = 0; i < notes; i++) {
        const len = [3, 2, 4, 6][(seed + i) % 4];
        const at = t + i * dur * 4;
        this.flute(mtof(scaleNote(deg, 1)), at, dur * len * 1.4, I >= 2 ? 0.07 : 0.06, M);
        deg += [1, -1, 2, -2, 1][(seed + i) % 5];
      }
    }
    // high bell accents on boss themes
    if (I >= 3 && I !== 4 && pos === 0 && bar % 2 === 0) this.bell(mtof(ROOT + 12 + (bar % 4 ? 5 : 0)), t, 0.05, 2, M);
  }
}
