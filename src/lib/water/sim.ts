/**
 * Height-field wave simulation (discrete wave equation, c²=0.5 – unconditionally
 * stable for this stencil). Edges mirror their own value, which gives
 * Neumann boundaries: waves reflect off the screen edges.
 */
function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

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
        p[i] = (((c[l] ?? 0) + (c[r] ?? 0) + (c[i + up] ?? 0) + (c[i + dn] ?? 0)) * 0.5 - (p[i] ?? 0)) * damping;
      }
    }
    this.cur = p;
    this.prev = c;
  }

  /**
   * Broad, soft impact bowl with a subtle displaced-water lip.
   * Negative strength pushes the centre down and lifts the surrounding ring.
   */
  disturb(cx: number, cy: number, radius: number, strength: number) {
    const { w, h, cur } = this;
    const r = Math.max(1, radius);
    // Include the outer lip in the influence area; the wider footprint avoids
    // the sharp pin-prick look of a small, centre-peaked impulse.
    const extent = r * 1.18;
    const x0 = Math.max(0, Math.floor(cx - extent));
    const x1 = Math.min(w - 1, Math.ceil(cx + extent));
    const y0 = Math.max(0, Math.floor(cy - extent));
    const y1 = Math.min(h - 1, Math.ceil(cy + extent));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d >= 1.18) continue;
        // A broad, almost level impact basin with a smooth shoulder.
        const bowl = 1 - smoothstep(0.28, 1.0, d);
        // Small raised rim models the water displaced by the impact.
        const rimDist = (d - 0.88) / 0.19;
        const rim = Math.exp(-rimDist * rimDist) * 0.24;
        const profile = bowl - rim;
        cur[y * w + x] = (cur[y * w + x] ?? 0) + strength * profile;
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
      for (let x = 0; x < w; x++) cur[y * w + x] = (cur[y * w + x] ?? 0) - dx * (x - cx) - by;
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
    const a = (cur[i] ?? 0) + ((cur[i + 1] ?? 0) - (cur[i] ?? 0)) * tx;
    const b = (cur[i + w] ?? 0) + ((cur[i + w + 1] ?? 0) - (cur[i + w] ?? 0)) * tx;
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
