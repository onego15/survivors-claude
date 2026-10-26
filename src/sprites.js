// Procedurally painted sprites. Everything is drawn once into offscreen canvases at startup.
// Art direction: "night parade" — ink-black silhouettes, washi paper, vermilion and gold accents,
// soft spirit-light glows.

const S = 2; // supersampling factor for sprites

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  return c;
}

export const PAL = {
  ink: '#120f1c', ink2: '#221d33', paper: '#f3ead6', paper2: '#e2d3b4', red: '#e8473f', vermilion: '#ff5a3c',
  gold: '#ffcf5a', cyan: '#7fe3ff', violet: '#b48cff', moss: '#2c3b3a', night: '#0d1220',
};

function glowSprite(color, size = 128) {
  const c = cv(size, size), g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, color.replace('ALPHA', '1'));
  gr.addColorStop(0.25, color.replace('ALPHA', '0.55'));
  gr.addColorStop(0.6, color.replace('ALPHA', '0.15'));
  gr.addColorStop(1, color.replace('ALPHA', '0'));
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}

function eye(g, x, y, r, look = 0, angry = false, color = '#fff', pupil = '#1a0f12') {
  g.fillStyle = color;
  g.beginPath(); g.ellipse(x, y, r, r * 1.05, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = pupil;
  g.beginPath(); g.arc(x + look * r * 0.3, y + r * 0.1, r * 0.55, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath(); g.arc(x + look * r * 0.3 - r * 0.2, y - r * 0.15, r * 0.18, 0, Math.PI * 2); g.fill();
  if (angry) {
    g.strokeStyle = '#120f1c'; g.lineWidth = r * 0.35; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - r * 1.1, y - r * 1.3); g.lineTo(x + r * 0.9, y - r * 0.8); g.stroke();
  }
}

// Each painter draws centred at (0,0) for an enemy of radius r, frame f (0/1)
export const painters = {
  sumi(g, r, f) {
    const sq = f ? 1.08 : 0.95;
    g.save(); g.scale(1 / sq, sq);
    const grd = g.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.2);
    grd.addColorStop(0, '#4a3f6b'); grd.addColorStop(0.5, '#1d1830'); grd.addColorStop(1, '#09070f');
    g.fillStyle = grd;
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const w = 1 + Math.sin(a * 5 + f) * 0.06 + (a > 0.3 && a < 2.8 ? Math.sin(a * 9) * 0.08 : 0);
      g.lineTo(Math.cos(a) * r * w, Math.sin(a) * r * w * 0.95);
    }
    g.fill();
    // drips
    g.fillStyle = '#0c0a14';
    for (const [dx, l] of [[-0.5, 0.45], [0.1, 0.65], [0.55, 0.35]]) {
      g.beginPath(); g.ellipse(r * dx, r * (0.85 + l * 0.5 * (f ? 1.2 : 1)), r * 0.12, r * l * 0.5, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(200,190,255,0.35)';
    g.beginPath(); g.ellipse(-r * 0.4, -r * 0.5, r * 0.28, r * 0.14, -0.5, 0, Math.PI * 2); g.fill();
    g.restore();
    eye(g, -r * 0.32, -r * 0.08, r * 0.24, 0.3, true);
    eye(g, r * 0.3, -r * 0.08, r * 0.24, 0.3, false);
    g.strokeStyle = '#ff5a6e'; g.lineWidth = r * 0.1;
    g.beginPath(); g.arc(0, r * 0.32, r * 0.22, 0.2, Math.PI - 0.2); g.stroke();
  },
  chochin(g, r, f) {
    const h = r * 1.25, w = r * 0.95;
    // glow inside
    g.fillStyle = '#2a1408';
    g.fillRect(-w * 0.45, -h - r * 0.18, w * 0.9, r * 0.2);
    g.fillRect(-w * 0.45, h - r * 0.04, w * 0.9, r * 0.2);
    const grd = g.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.3);
    grd.addColorStop(0, '#fff2b0'); grd.addColorStop(0.45, '#ff9a3c'); grd.addColorStop(1, '#c4321f');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(120,30,10,0.55)'; g.lineWidth = r * 0.07;
    for (let i = -3; i <= 3; i++) {
      const y = (i / 3.6) * h;
      const ww = w * Math.sqrt(1 - (y / h) ** 2);
      g.beginPath(); g.moveTo(-ww, y); g.quadraticCurveTo(0, y + r * 0.12, ww, y); g.stroke();
    }
    // big single eye and lolling tongue
    eye(g, 0, -r * 0.25, r * 0.36, f ? 0.4 : -0.4, false, '#fffbe8');
    g.fillStyle = '#ff3d6b';
    g.beginPath(); g.moveTo(-r * 0.25, r * 0.38); g.quadraticCurveTo(0, r * (1.25 + f * 0.15), r * 0.25, r * 0.38); g.fill();
    g.fillStyle = '#3b0a0a';
    g.beginPath(); g.ellipse(0, r * 0.38, r * 0.34, r * 0.12, 0, 0, Math.PI); g.fill();
  },
  kasa(g, r, f) {
    // one-legged paper umbrella spirit
    g.strokeStyle = '#6b4a2a'; g.lineWidth = r * 0.16; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, r * 0.2); g.lineTo(f ? r * 0.15 : -r * 0.1, r * 1.25); g.stroke();
    g.fillStyle = '#e8d8b0';
    g.beginPath(); g.ellipse(f ? r * 0.15 : -r * 0.1, r * 1.3, r * 0.3, r * 0.12, 0, 0, Math.PI * 2); g.fill();
    const grd = g.createLinearGradient(0, -r * 1.2, 0, r * 0.5);
    grd.addColorStop(0, '#b45cff'); grd.addColorStop(1, '#5a1f8f');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(0, -r * 1.25);
    const segs = 7;
    for (let i = 0; i <= segs; i++) {
      const a = Math.PI + (i / segs) * Math.PI;
      const x = Math.cos(a) * r * 1.25, y = Math.sin(a) * r * 0.3 + r * 0.35;
      g.lineTo(x, y);
    }
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(30,5,50,0.6)'; g.lineWidth = r * 0.06;
    for (let i = 1; i < segs; i++) {
      const a = Math.PI + (i / segs) * Math.PI;
      g.beginPath(); g.moveTo(0, -r * 1.25); g.lineTo(Math.cos(a) * r * 1.25, Math.sin(a) * r * 0.3 + r * 0.35); g.stroke();
    }
    eye(g, 0, -r * 0.25, r * 0.3, 0.2, true, '#fff8e0');
    g.fillStyle = '#ff4060';
    g.beginPath(); g.ellipse(r * 0.05, r * 0.2, r * 0.18, r * 0.09 + f * r * 0.05, 0, 0, Math.PI * 2); g.fill();
  },
  omote(g, r, f) {
    // dark cloth
    g.fillStyle = '#1c1426';
    g.beginPath();
    g.moveTo(-r * 1.05, -r * 0.2);
    g.quadraticCurveTo(-r * 1.2, r * 1.0, -r * 0.6, r * (1.3 + f * 0.1));
    g.lineTo(-r * 0.2, r * 1.0); g.lineTo(r * 0.2, r * (1.35 - f * 0.1)); g.lineTo(r * 0.6, r * 1.0);
    g.quadraticCurveTo(r * 1.2, r * 1.0, r * 1.05, -r * 0.2);
    g.fill();
    // mask
    const grd = g.createRadialGradient(-r * 0.2, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    grd.addColorStop(0, '#fffaf0'); grd.addColorStop(1, '#d9ccb0');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(0, -r * 0.1, r * 0.82, r * 1.0, 0, 0, Math.PI * 2); g.fill();
    // horns
    g.fillStyle = '#f0e2c0';
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(s * r * 0.45, -r * 0.85); g.quadraticCurveTo(s * r * 0.8, -r * 1.4, s * r * 0.95, -r * 1.55); g.quadraticCurveTo(s * r * 0.75, -r * 1.0, s * r * 0.7, -r * 0.7); g.fill();
    }
    // red markings
    g.strokeStyle = '#d42a3a'; g.lineWidth = r * 0.09; g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.beginPath(); g.arc(s * r * 0.45, r * 0.25, r * 0.16, 0, Math.PI * 1.6); g.stroke();
      g.beginPath(); g.moveTo(s * r * 0.15, -r * 0.62); g.lineTo(s * r * 0.55, -r * 0.48); g.stroke();
    }
    // eyes: dark slits glowing
    for (const s of [-1, 1]) {
      g.fillStyle = '#120a10';
      g.beginPath(); g.ellipse(s * r * 0.33, -r * 0.25, r * 0.2, r * 0.1, s * 0.25, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffd34d';
      g.beginPath(); g.arc(s * r * 0.33, -r * 0.25, r * 0.06, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#3a0c14';
    g.beginPath(); g.ellipse(0, r * 0.5, r * 0.22, r * (0.07 + f * 0.04), 0, 0, Math.PI * 2); g.fill();
  },
  hasami(g, r, f) {
    const open = f ? 0.55 : 0.25;
    for (const s of [-1, 1]) {
      g.save(); g.rotate(s * open);
      const grd = g.createLinearGradient(0, -r * 1.5, 0, 0);
      grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#8796ad');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(s * r * 0.22, -r * 0.2); g.lineTo(s * r * 0.06, -r * 1.55); g.lineTo(-s * r * 0.08, -r * 0.2); g.closePath(); g.fill();
      g.strokeStyle = '#d6283a'; g.lineWidth = r * 0.2;
      g.beginPath(); g.ellipse(-s * r * 0.25, r * 0.7, r * 0.32, r * 0.42, 0, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    g.fillStyle = '#20182c';
    g.beginPath(); g.arc(0, 0, r * 0.32, 0, Math.PI * 2); g.fill();
    eye(g, 0, 0, r * 0.22, 0, false, '#ffe3e3', '#d0102a');
  },
  onibi(g, r, f) {
    const grd = g.createRadialGradient(0, r * 0.2, r * 0.1, 0, 0, r * 1.4);
    grd.addColorStop(0, '#f2fffb'); grd.addColorStop(0.35, '#6af2d0'); grd.addColorStop(0.75, '#1f7fa8'); grd.addColorStop(1, 'rgba(20,60,120,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, -r * (1.7 + f * 0.2));
    g.bezierCurveTo(r * 0.5, -r * 0.9, r * 1.15, -r * 0.3, r * 0.95, r * 0.4);
    g.bezierCurveTo(r * 0.8, r * 1.0, -r * 0.8, r * 1.0, -r * 0.95, r * 0.4);
    g.bezierCurveTo(-r * 1.15, -r * 0.3, -r * 0.3, -r * (0.8 + f * 0.3), 0, -r * (1.7 + f * 0.2));
    g.fill();
    g.fillStyle = '#062a33';
    g.beginPath(); g.ellipse(-r * 0.3, r * 0.1, r * 0.13, r * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(r * 0.3, r * 0.1, r * 0.13, r * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(0, r * 0.5, r * 0.15, r * 0.1 + f * r * 0.05, 0, 0, Math.PI * 2); g.fill();
  },
  kamiuo(g, r, f) {
    // origami paper fish, facing right
    g.save(); g.scale(1, f ? 0.9 : 1);
    g.fillStyle = '#f6efe0';
    g.beginPath(); g.moveTo(r * 1.3, 0); g.lineTo(0, -r * 0.7); g.lineTo(-r * 0.8, 0); g.lineTo(0, r * 0.7); g.closePath(); g.fill();
    g.fillStyle = '#d8ccb2';
    g.beginPath(); g.moveTo(r * 1.3, 0); g.lineTo(0, r * 0.7); g.lineTo(-r * 0.8, 0); g.closePath(); g.fill();
    g.fillStyle = '#e94a5a';
    g.beginPath(); g.moveTo(-r * 0.7, 0); g.lineTo(-r * 1.4, -r * (0.65 - f * 0.2)); g.lineTo(-r * 1.25, 0); g.lineTo(-r * 1.4, r * (0.65 - f * 0.2)); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(120,90,60,0.5)'; g.lineWidth = r * 0.06;
    g.beginPath(); g.moveTo(0, -r * 0.7); g.lineTo(0, r * 0.7); g.stroke();
    g.fillStyle = '#1a1020'; g.beginPath(); g.arc(r * 0.65, -r * 0.12, r * 0.12, 0, Math.PI * 2); g.fill();
    g.restore();
  },
  kumo(g, r, f) {
    g.strokeStyle = '#100b16'; g.lineWidth = r * 0.14; g.lineCap = 'round';
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const a = -0.9 + i * 0.6 + (f && i % 2 ? 0.2 : 0);
      g.beginPath(); g.moveTo(0, 0);
      g.quadraticCurveTo(s * Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.0 - r * 0.6, s * Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.2 + r * 0.2);
      g.stroke();
    }
    g.fillStyle = '#1b1426'; g.beginPath(); g.ellipse(0, r * 0.15, r * 0.75, r * 0.65, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8213d';
    g.beginPath(); g.moveTo(0, -r * 0.1); g.lineTo(r * 0.2, r * 0.18); g.lineTo(0, r * 0.45); g.lineTo(-r * 0.2, r * 0.18); g.fill();
    g.fillStyle = '#ffcf4a';
    for (const [x, y] of [[-0.2, -0.35], [0.2, -0.35], [-0.08, -0.48], [0.08, -0.48]]) { g.beginPath(); g.arc(x * r, y * r, r * 0.08, 0, Math.PI * 2); g.fill(); }
  },
};

function bake(name, r, f, flash) {
  const pad = 2.2;
  const size = r * 2 * pad * S;
  const c = cv(size, size), g = c.getContext('2d');
  g.translate(size / 2, size / 2); g.scale(S, S);
  // ink outline: draw the shape slightly larger in dark first
  painters[name](g, r, f);
  if (flash) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(-size, -size, size * 2, size * 2);
  }
  return c;
}

function outlined(src) {
  // add a crisp ink rim around the sprite for readability against the background
  const c = cv(src.width, src.height), g = c.getContext('2d');
  const o = 2.2 * S;
  g.globalAlpha = 1;
  for (const [dx, dy] of [[o, 0], [-o, 0], [0, o], [0, -o], [o * 0.7, o * 0.7], [-o * 0.7, o * 0.7], [o * 0.7, -o * 0.7], [-o * 0.7, -o * 0.7]]) g.drawImage(src, dx, dy);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#07050c'; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  g.drawImage(src, 0, 0);
  return c;
}

// ---------------------------------------------------------------- props & ground
function paintGround(size = 512) {
  const c = cv(size, size), g = c.getContext('2d');
  g.fillStyle = '#1e2d36'; g.fillRect(0, 0, size, size);
  const rnd = mulberry(7);
  // ink-wash blotches, wrapped so the tile is seamless
  const blot = (x, y, r, col) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  };
  for (let i = 0; i < 26; i++) blot(rnd() * size, rnd() * size, 60 + rnd() * 140, rnd() < 0.5 ? 'rgba(52,78,80,0.5)' : 'rgba(10,14,26,0.4)');
  for (let i = 0; i < 14; i++) blot(rnd() * size, rnd() * size, 30 + rnd() * 60, 'rgba(70,90,80,0.18)');
  // moss specks & grass strokes
  for (let i = 0; i < 900; i++) {
    const x = rnd() * size, y = rnd() * size;
    g.fillStyle = rnd() < 0.5 ? 'rgba(90,130,110,0.18)' : 'rgba(5,8,14,0.25)';
    g.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 160; i++) {
    const x = rnd() * size, y = rnd() * size, h = 4 + rnd() * 8;
    g.strokeStyle = `rgba(${80 + rnd() * 40},${120 + rnd() * 40},${105 + rnd() * 30},${0.12 + rnd() * 0.12})`;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (rnd() - 0.5) * 4, y - h * 0.6, x + (rnd() - 0.5) * 6, y - h); g.stroke();
  }
  return c;
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const propPainters = {
  lantern(g) { // stone toro
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(0, 30, 26, 8, 0, 0, Math.PI * 2); g.fill();
    const stone = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x - w / 2, y, w, h); };
    stone(0, 18, 34, 10, '#4b5058'); stone(0, 4, 10, 16, '#5b616b');
    stone(0, -2, 26, 7, '#4f545d');
    // fire box
    g.fillStyle = '#ffcf6a'; g.fillRect(-9, -18, 18, 16);
    g.fillStyle = '#5b616b'; g.fillRect(-11, -18, 4, 16); g.fillRect(7, -18, 4, 16);
    g.fillStyle = '#ff9a3a'; g.fillRect(-4, -14, 8, 9);
    // roof
    g.fillStyle = '#626873';
    g.beginPath(); g.moveTo(-22, -18); g.quadraticCurveTo(0, -28, 22, -18); g.lineTo(14, -26); g.lineTo(-14, -26); g.closePath(); g.fill();
    g.fillStyle = '#6d737e'; g.beginPath(); g.arc(0, -30, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(120,170,120,0.35)'; g.fillRect(-17, 18, 9, 3); g.fillRect(4, -2, 8, 2);
  },
  torii(g) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(0, 60, 70, 12, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#b8322a';
    g.fillRect(-46, -40, 9, 100); g.fillRect(37, -40, 9, 100);
    g.fillRect(-56, -28, 112, 8);
    g.fillStyle = '#1a1214';
    g.beginPath(); g.moveTo(-72, -50); g.quadraticCurveTo(0, -38, 72, -50); g.lineTo(68, -40); g.quadraticCurveTo(0, -30, -68, -40); g.closePath(); g.fill();
    g.fillStyle = '#d2463a'; g.fillRect(-60, -42, 120, 6);
    g.fillStyle = '#2a1a16'; g.fillRect(-49, 52, 15, 8); g.fillRect(34, 52, 15, 8);
  },
  lily(g, rnd) { // red spider lilies cluster
    for (let k = 0; k < 4; k++) {
      const x = (rnd() - 0.5) * 34, y = (rnd() - 0.5) * 18;
      g.strokeStyle = '#3f6b45'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x, y + 14); g.lineTo(x + (rnd() - 0.5) * 4, y); g.stroke();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rnd();
        g.strokeStyle = i % 2 ? '#ff3b3b' : '#d81e2c'; g.lineWidth = 1.8;
        g.beginPath(); g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(a) * 7, y + Math.sin(a) * 5 - 3, x + Math.cos(a) * 11, y + Math.sin(a) * 8 - 6);
        g.stroke();
      }
      g.fillStyle = '#ffd0b0'; g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill();
    }
  },
  stone(g, rnd) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(2, 7, 16, 5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#39424a'; g.beginPath(); g.ellipse(0, 0, 13 + rnd() * 5, 8 + rnd() * 3, rnd() - 0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(160,190,160,0.25)'; g.beginPath(); g.ellipse(-3, -3, 7, 3, -0.3, 0, Math.PI * 2); g.fill();
  },
  grass(g, rnd) {
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const x = (rnd() - 0.5) * 22;
      g.strokeStyle = `rgba(${60 + rnd() * 40},${110 + rnd() * 50},${90 + rnd() * 30},0.8)`; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, 8); g.quadraticCurveTo(x + (rnd() - 0.5) * 8, -2, x + (rnd() - 0.5) * 14, -10 - rnd() * 8); g.stroke();
    }
  },
  jizo(g) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(0, 18, 18, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#596069'; g.beginPath(); g.ellipse(0, 4, 11, 15, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(0, -12, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c8302c'; g.beginPath(); g.moveTo(-10, -4); g.lineTo(10, -4); g.lineTo(0, 8); g.closePath(); g.fill();
    g.fillStyle = '#3a3f46'; g.fillRect(-5, -13, 3, 1.5); g.fillRect(2, -13, 3, 1.5);
  },
};

function bakeProp(name, seed, w, h) {
  const c = cv(w * S, h * S), g = c.getContext('2d');
  g.translate(w * S / 2, h * S / 2); g.scale(S, S);
  propPainters[name](g, mulberry(seed));
  return c;
}

// ---------------------------------------------------------------- pickups
function bakeBead(color, r) {
  const size = r * 6 * S;
  const c = cv(size, size), g = c.getContext('2d');
  g.translate(size / 2, size / 2); g.scale(S, S);
  const gl = g.createRadialGradient(0, 0, 0, 0, 0, r * 3);
  gl.addColorStop(0, color + 'aa'); gl.addColorStop(1, color + '00');
  g.fillStyle = gl; g.beginPath(); g.arc(0, 0, r * 3, 0, Math.PI * 2); g.fill();
  const gr = g.createRadialGradient(-r * 0.3, -r * 0.4, 0, 0, 0, r);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, color); gr.addColorStop(1, '#10203a');
  g.fillStyle = gr;
  // magatama-ish comma bead
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(r * 0.3, r * 0.9); g.quadraticCurveTo(r * 0.4, r * 1.9, -r * 0.6, r * 1.8); g.quadraticCurveTo(r * 0.1, r * 1.4, -r * 0.3, r * 0.9); g.fill();
  return c;
}

function bakeOnigiri() {
  const c = cv(40 * S, 40 * S), g = c.getContext('2d');
  g.translate(20 * S, 20 * S); g.scale(S, S);
  g.fillStyle = 'rgba(255,230,180,0.3)'; g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fbfaf2';
  g.beginPath(); g.moveTo(0, -12); g.quadraticCurveTo(13, 6, 10, 10); g.quadraticCurveTo(0, 14, -10, 10); g.quadraticCurveTo(-13, 6, 0, -12); g.fill();
  g.fillStyle = '#1d2a22'; g.fillRect(-6, 3, 12, 9);
  g.fillStyle = '#e04050'; g.beginPath(); g.arc(0, -2, 2, 0, Math.PI * 2); g.fill();
  return c;
}

function bakeChest() {
  const c = cv(56 * S, 56 * S), g = c.getContext('2d');
  g.translate(28 * S, 28 * S); g.scale(S, S);
  g.fillStyle = 'rgba(255,210,90,0.35)'; g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1a0f12'; g.fillRect(-16, -8, 32, 20);
  g.fillStyle = '#2a171c'; g.fillRect(-17, -14, 34, 8);
  g.strokeStyle = '#ffcf5a'; g.lineWidth = 1.2; g.strokeRect(-16, -8, 32, 20); g.strokeRect(-17, -14, 34, 8);
  g.fillStyle = '#e8473f'; g.fillRect(-2, -14, 4, 26); g.fillRect(-16, 0, 32, 3);
  g.beginPath(); g.arc(0, -15, 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffd96a'; g.beginPath(); g.arc(-9, 5, 1.5, 0, 7); g.arc(9, 5, 1.5, 0, 7); g.fill();
  return c;
}

function bakeOfuda() {
  const c = cv(36 * S, 44 * S), g = c.getContext('2d');
  g.translate(18 * S, 22 * S); g.scale(S, S);
  g.fillStyle = 'rgba(160,220,255,0.3)'; g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f4ead2'; g.fillRect(-7, -16, 14, 32);
  g.fillStyle = '#d0302c'; g.font = 'bold 10px serif'; g.textAlign = 'center'; g.fillText('魂', 0, -2);
  g.fillRect(-5, 6, 10, 1.5); g.fillRect(-5, 10, 10, 1.5);
  return c;
}

// ---------------------------------------------------------------- build all
export function buildSprites(ENEMIES) {
  const sp = { enemies: {}, glow: {}, props: {}, pickups: {} };
  const radii = {};
  for (const [id, def] of Object.entries(ENEMIES)) {
    if (!painters[id]) continue;
    for (const elite of [false, true]) {
      const r = def.r * (elite ? 1.55 : 1);
      const key = id + (elite ? '_e' : '');
      sp.enemies[key] = [0, 1].map((f) => outlined(bake(id, r, f, false)));
      sp.enemies[key + '_f'] = [0, 1].map((f) => bake(id, r, f, true));
      radii[key] = r;
    }
  }
  sp.radii = radii;
  const gl = {
    white: 'rgba(255,255,255,ALPHA)', red: 'rgba(255,70,90,ALPHA)', gold: 'rgba(255,200,90,ALPHA)', cyan: 'rgba(110,230,255,ALPHA)',
    violet: 'rgba(190,140,255,ALPHA)', green: 'rgba(120,255,200,ALPHA)', pink: 'rgba(255,150,210,ALPHA)', orange: 'rgba(255,140,60,ALPHA)',
    silver: 'rgba(200,225,255,ALPHA)', blue: 'rgba(110,150,255,ALPHA)',
  };
  for (const [k, v] of Object.entries(gl)) sp.glow[k] = glowSprite(v);
  sp.ground = paintGround();
  sp.props.lantern = bakeProp('lantern', 1, 60, 80);
  sp.props.torii = bakeProp('torii', 2, 160, 140);
  sp.props.lily = [1, 2, 3].map((s) => bakeProp('lily', s, 60, 50));
  sp.props.stone = [4, 5, 6].map((s) => bakeProp('stone', s, 44, 30));
  sp.props.grass = [7, 8, 9, 10].map((s) => bakeProp('grass', s, 40, 34));
  sp.props.jizo = bakeProp('jizo', 11, 40, 50);
  sp.pickups.xp = [bakeBead('#6fe0ff', 4), bakeBead('#7dffb0', 5), bakeBead('#c79bff', 6), bakeBead('#ffcf5a', 7.5)];
  sp.pickups.heal = bakeOnigiri();
  sp.pickups.chest = bakeChest();
  sp.pickups.charm = bakeOfuda();
  return sp;
}

export { S as SPRITE_SCALE };
