import { drawFish } from "./draw-fish";
import { drawToy } from "./draw-toys";
import { isFish, type Thing } from "./things";

type V = { x: number; y: number };

/** Soft shadows cast onto the floor – refracted by the water in the renderer. */
export function drawUnder(ctx: CanvasRenderingContext2D, things: Thing[], scale: number, tilt: V = { x: 0, y: 0 }, depth = 1) {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const off = 10 + depth * 30;
  for (const t of things) {
    // A fish deep in the water is close to the floor: its shadow is tight and dark; at the surface it floats away and blurs.
    const fz = isFish(t.kind) ? t.z : 0;
    const lifted = (t.grabbed !== null ? 1.8 : 1) * (1 - fz * 0.75);
    const x = t.x + (0.35 + tilt.x * 0.25) * off * lifted;
    const y = t.y + (0.45 + tilt.y * 0.25) * off * lifted;
    const blur = t.r * (0.5 + depth * 0.6) * lifted * (1 - fz * 0.3);
    const alpha = (0.42 - depth * 0.14) * (1 + fz * 0.15);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t.angle);
    const sx = t.kind === "duck" ? 1.05 : t.kind === "boat" ? 1.15 : isFish(t.kind) ? 1.3 : 1;
    const sy = t.kind === "duck" ? 0.78 : t.kind === "boat" ? 0.5 : isFish(t.kind) ? 0.4 : 1;
    ctx.scale(sx, sy);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, t.r + blur);
    if (t.kind === "ring") {
      const inner = (t.r * 0.32) / (t.r + blur);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(inner, "rgba(0,0,0,0.02)");
      g.addColorStop(0.62, `rgba(0,0,0,${alpha})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
    } else {
      g.addColorStop(0, `rgba(0,0,0,${alpha})`);
      g.addColorStop(0.55, `rgba(0,0,0,${alpha * 0.7})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, t.r + blur, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Fish first (deepest at the back), then the floating toys on top. */
export function drawSurface(ctx: CanvasRenderingContext2D, things: Thing[], dpr: number, tilt: V = { x: 0, y: 0 }) {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const fish = things.filter((t) => isFish(t.kind)).sort((a, b) => b.z - a.z);
  for (const t of fish) drawFish(ctx, t, tilt);
  for (const t of things) if (!isFish(t.kind)) drawToy(ctx, t, tilt);
}
