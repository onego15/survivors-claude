// Shared math / geometry helpers. No DOM access here so the core can run headless in Node.

export const TAU = Math.PI * 2;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
export function len(x, y) { return Math.sqrt(x * x + y * y); }
export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
export function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

// Small, fast seeded PRNG (mulberry32)
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.int = (lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  return rng;
}

export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Segment intersection: returns t along segment A (p1->p2) and u along B (p3->p4), or null.
export function segIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
  const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

// Flat polygon: [x0,y0,x1,y1,...]
export function polyArea(p) {
  let a = 0;
  const n = p.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    a += p[i] * p[j + 1] - p[j] * p[i + 1];
  }
  return Math.abs(a) / 2;
}

export function polyCentroid(p) {
  let cx = 0, cy = 0, a = 0;
  const n = p.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    const f = p[i] * p[j + 1] - p[j] * p[i + 1];
    cx += (p[i] + p[j]) * f; cy += (p[i + 1] + p[j + 1]) * f; a += f;
  }
  if (Math.abs(a) < 1e-6) {
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i += 2) { sx += p[i]; sy += p[i + 1]; }
    return { x: sx / (n / 2), y: sy / (n / 2) };
  }
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function polyBBox(p) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
    if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1];
  }
  return { x0, y0, x1, y1 };
}

export function pointInPoly(x, y, p) {
  let inside = false;
  const n = p.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polyPerimeter(p) {
  let s = 0;
  const n = p.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    s += Math.hypot(p[j] - p[i], p[j + 1] - p[i + 1]);
  }
  return s;
}

// Distance from point to segment, squared
export function distSegSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l = dx * dx + dy * dy;
  let t = l > 0 ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}

// Uniform-grid spatial hash for circles. Rebuilt every frame.
export class SpatialHash {
  constructor(cell = 64) {
    this.cell = cell;
    this.map = new Map();
    this.pool = [];
  }
  clear() {
    for (const arr of this.map.values()) { arr.length = 0; this.pool.push(arr); }
    this.map.clear();
  }
  key(cx, cy) { return (cx + 32768) * 65536 + (cy + 32768); }
  insert(o) {
    const cx = Math.floor(o.x / this.cell), cy = Math.floor(o.y / this.cell);
    const k = this.key(cx, cy);
    let arr = this.map.get(k);
    if (!arr) { arr = this.pool.pop() || []; this.map.set(k, arr); }
    arr.push(o);
  }
  // Calls fn(o) for objects whose cell overlaps the query circle (caller does exact test).
  query(x, y, r, fn) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.map.get(this.key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) if (fn(arr[i]) === false) return;
      }
    }
  }
  queryRect(x0, y0, x1, y1, fn) {
    const c = this.cell;
    const cx0 = Math.floor(x0 / c), cx1 = Math.floor(x1 / c);
    const cy0 = Math.floor(y0 / c), cy1 = Math.floor(y1 / c);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const arr = this.map.get(this.key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) fn(arr[i]);
      }
    }
  }
}
