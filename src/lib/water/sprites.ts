import type { FishKind, Kind } from "./things";
import koiUrl from "../../assets/sprites/koi.webp";
import tangUrl from "../../assets/sprites/tang.webp";
import perchUrl from "../../assets/sprites/perch.webp";
import sharkUrl from "../../assets/sprites/shark.webp";
import sharkBiteUrl from "../../assets/sprites/shark_bite.webp";
import ball0Url from "../../assets/sprites/ball0.webp";
import ball1Url from "../../assets/sprites/ball1.webp";
import ballShadeUrl from "../../assets/sprites/ball_shade.webp";
import ring0Url from "../../assets/sprites/ring0.webp";
import ring1Url from "../../assets/sprites/ring1.webp";
import duckUrl from "../../assets/sprites/duck.webp";
import boatUrl from "../../assets/sprites/boat.webp";

/**
 * Pre-rendered sprites (see assets/sprites/README.md for how they were made).
 * Everything is top-down with the nose / bow pointing to +x.
 */

/** Fish sheet: `cols` tail-beat phases x `rows` bend levels (0 = straight, 2 = hard turn, banked), plus one still frame at (col 0, row `rows`). */
export type FishSheet = { url: string; cw: number; ch: number; cols: number; rows: number; lenPx: number };
/** Baked from the real skeletal animations of the clown fish / shark FBX (tools/sprites/bake_anim.py). The three clown fish are one model in three colours: original, purple (`tang`) and yellow (`perch`). */
const CLOWN = { cw: 288, ch: 208, cols: 8, rows: 3, lenPx: 224 };
export const FISH_SHEET: Record<FishKind, FishSheet> = {
  koi: { url: koiUrl, ...CLOWN },
  tang: { url: tangUrl, ...CLOWN },
  perch: { url: perchUrl, ...CLOWN },
  shark: { url: sharkUrl, cw: 480, ch: 256, cols: 8, rows: 3, lenPx: 400 },
};
/** Shark bite ("ham, ham"): two jaw snaps from the rig's bite clip, the shark rolled to show its teeth; `frames` in `cols` columns, same scale as the shark sheet. */
export const SHARK_BITE = { url: sharkBiteUrl, cw: 512, ch: 352, cols: 7, frames: 28, lenPx: 400, seconds: 1.17 };
/** The body is this fraction of its length behind the nose at the rotation pivot (sprite centre). */
export const FISH_PIVOT = 0.444;

/** Rolling ball: `frames` roll angles in one row, drawn rotated to the direction of travel. Shading sheet = [shadow | gloss]. */
export const BALL = { urls: [ball0Url, ball1Url], shade: ballShadeUrl, size: 256, frames: 16, sphere: 0.91 };
/** Life ring: one still per colour; `extent` = sprite width in ring radii. */
export const RING = { urls: [ring0Url, ring1Url], size: 448, extent: 2.16 };
/** Toys that turn to face their heading: `frames` pre-rendered headings laid out in `cols` columns; `unit` = model unit in radii. */
export const HEADING = {
  duck: { url: duckUrl, size: 256, extent: 2.9, frames: 16, cols: 8, unit: 0.92 },
  boat: { url: boatUrl, size: 288, extent: 3.3, frames: 16, cols: 8, unit: 0.92 },
};

const cache = new Map<string, HTMLImageElement>();

/** The loaded image, or null while it is still loading (and outside the browser). */
export function sprite(url: string): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  let img = cache.get(url);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = url;
    cache.set(url, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Start loading what a kind needs, so it is ready by the time the first frame is drawn. */
export function preloadKind(kind: Kind, skin = 0) {
  const urls: string[] = [];
  if (kind === "ball") urls.push(BALL.urls[skin] ?? BALL.urls[0] ?? "", BALL.shade);
  else if (kind === "ring") urls.push(RING.urls[skin] ?? RING.urls[0] ?? "");
  else if (kind === "duck" || kind === "boat") urls.push(HEADING[kind].url);
  else { urls.push(FISH_SHEET[kind].url); if (kind === "shark") urls.push(SHARK_BITE.url); }
  for (const u of urls) if (u) sprite(u);
}
