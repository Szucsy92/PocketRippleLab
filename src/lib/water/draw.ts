import { hEq, isFish, type Thing } from "./things";

/**
 * Soft shadows cast onto the floor, refracted by the water in the renderer. They follow the light and the object's
 * height, never the phone's tilt (tilt only moves the eye). `light` uses the settings convention (x right, y up).
 */
export function drawUnder(ctx: CanvasRenderingContext2D, things: Thing[], scale: number, depth = 1, light = { x: -0.45, y: 0.55 }) {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const off = 10 + depth * 30;
  const len = Math.hypot(light.x, light.y) || 1;
  const dirX = -light.x / len * 0.57, dirY = light.y / len * 0.57; // away from the light, in screen px (y down)
  for (const t of things) {
    // A fish deep in the water is close to the floor: its shadow is tight and dark; at the surface it floats away and blurs.
    const fz = isFish(t.kind) ? t.z : 0;
    const high = isFish(t.kind) ? 0 : Math.max(0, t.h - hEq(t)) / Math.max(1, t.r); // how far a toy is lifted out of the water
    const lifted = (1 + Math.min(2.5, high * 1.2)) * (1 - fz * 0.75);
    const x = t.x + dirX * off * lifted;
    const y = t.y + dirY * off * lifted;
    const blur = t.r * (0.5 + depth * 0.6) * lifted * (1 - fz * 0.3);
    const alpha = (0.42 - depth * 0.14) * (1 + fz * 0.15) / (1 + high * 0.5);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t.angle);
    const long = t.kind === "duck" ? 1.05 : t.kind === "boat" ? 1.15 : isFish(t.kind) ? 1.3 : 1;
    const wide = t.kind === "duck" ? 0.78 : t.kind === "boat" ? 0.5 : isFish(t.kind) ? 0.4 : 1;
    ctx.scale(long, wide);
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
