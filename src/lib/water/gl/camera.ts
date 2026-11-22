export type Eye = { x: number; y: number; h: number; floor: number };
export type MoodName = "sea" | "lake" | null | undefined;

/**
 * The same box view the floor shader uses: the screen is the opening of a box, tilting the phone only moves the eye.
 * Returns the eye position (screen px) and height above the surface, plus the depth of the floor in px, so
 * objects float, hang and swim in exactly the same space as the floor and walls drawn by the water shader.
 * `parallax` is the tilt (-1..1 per axis), `depth` the 0..1 depth setting.
 */
export function eyeFor(W: number, H: number, parallax: { x: number; y: number }, depth: number, mood: MoodName): Eye {
  const boxD = 0.25 + depth * 0.75;
  const relief = mood === "sea" || mood === "lake" ? 0.6 : 1;
  const clamp = (v: number) => Math.max(-0.6, Math.min(0.6, v));
  const sx = clamp(parallax.x * boxD * 0.7 * relief);
  const sy = clamp(parallax.y * boxD * 0.7 * relief);
  const persp = boxD * 0.45 * relief;
  return { x: W / 2 - (sx * H) / persp, y: H / 2 - (sy * H) / persp, h: H * boxD * (1 / persp - 1), floor: boxD * H };
}

/**
 * Toys float at the surface, so the eye only changes how their shape is sheared; a full-strength window projection
 * would smear a ball into an egg at steep tilts. Their eye therefore moves only part of the way (fish and the floor
 * use the full eye, so depth stays consistent).
 */
export const TOY_VIEW_GAIN = 0.5;
export function toyEye(W: number, H: number, eye: Eye): Eye {
  return { ...eye, x: W / 2 + (eye.x - W / 2) * TOY_VIEW_GAIN, y: H / 2 + (eye.y - H / 2) * TOY_VIEW_GAIN };
}
