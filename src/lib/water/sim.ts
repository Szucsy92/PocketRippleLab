/**
 * Height-field wave simulation (discrete wave equation, c²=0.5 – unconditionally
 * stable for this stencil). Edges mirror their own value, which gives
 * Neumann boundaries: waves reflect off the screen edges.
 */
export class WaterSim {
  w: number;
  h: number;
  cur: Float32Array;
  prev: Float32Array;
  damping = 0.99;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.cur = new Float32Array(w * h);
    this.prev = new Float32Array(w * h);
  }

  step() {
    const { w, h, damping } = this;
    const c = this.cur;
    const p = this.prev;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      const up = y > 0 ? -w : 0;
      const dn = y < h - 1 ? w : 0;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const l = x > 0 ? i - 1 : i;
        const r = x < w - 1 ? i + 1 : i;
        p[i] = ((c[l] + c[r] + c[i + up] + c[i + dn]) * 0.5 - p[i]) * damping;
      }
    }
    this.cur = p;
    this.prev = c;
  }

  /** Smooth cosine bump. Negative strength = pushed-down water. */
  disturb(cx: number, cy: number, radius: number, strength: number) {
    const { w, h, cur } = this;
    const r = Math.max(1, radius);
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d < 1) cur[y * w + x] += strength * 0.5 * (1 + Math.cos(Math.PI * d));
      }
    }
  }

  /** Tilt: the resting surface becomes a plane; shifting it releases slosh from the edges. */
  shiftPlane(dx: number, dy: number) {
    const { w, h, cur } = this;
    const cx = w / 2;
    const cy = h / 2;
    for (let y = 0; y < h; y++) {
      const by = dy * (y - cy);
      for (let x = 0; x < w; x++) cur[y * w + x] -= dx * (x - cx) + by;
    }
  }

  sample(x: number, y: number) {
    const { w, h, cur } = this;
    const fx = Math.min(w - 1.001, Math.max(0, x));
    const fy = Math.min(h - 1.001, Math.max(0, y));
    const ix = fx | 0;
    const iy = fy | 0;
    const tx = fx - ix;
    const ty = fy - iy;
    const i = iy * w + ix;
    const a = cur[i] + (cur[i + 1] - cur[i]) * tx;
    const b = cur[i + w] + (cur[i + w + 1] - cur[i + w]) * tx;
    return a + (b - a) * ty;
  }

  gradient(x: number, y: number): [number, number] {
    return [
      (this.sample(x + 1, y) - this.sample(x - 1, y)) * 0.5,
      (this.sample(x, y + 1) - this.sample(x, y - 1)) * 0.5,
    ];
  }

  clear() {
    this.cur.fill(0);
    this.prev.fill(0);
  }
}
