import { qRandom, qYawPitchRoll, type Quat, type Vec3 } from "./gl/mat";

export type Kind = "duck" | "boat" | "ball" | "ring" | FishKind;
export type FishKind = "koi" | "tang" | "perch" | "shark";
export const FISH: FishKind[] = ["koi", "tang", "perch", "shark"];
export const isFish = (k: Kind): k is FishKind => (FISH as string[]).includes(k);

export type Thing = {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  angle: number;
  color: string;
  phase: number;
  lift: number;
  /** Toys: 3D orientation (world frame: x right, y up, z toward the viewer) and angular velocity (rad/s). */
  q: Quat;
  w: Vec3;
  /** Toys: height of the model origin above the water surface (px) and its vertical speed; `air` while out of the water. */
  h: number;
  hv: number;
  air: boolean;
  grabbed: number | null;
  wakeT: number;
  /** Fish: wander target heading, fear (0..1), tail beat phase. */
  wander: number;
  fear: number;
  tail: number;
  bite: number;
  /** Fish: depth under the surface (0 = at the surface, 1 = deep), its goal and vertical speed. */
  z: number;
  zGoal: number;
  zv: number;
  /** Fish brain: decision timer, rest / surfacing / gulp timers, panic boost, swim speed, turn rate, focus target id. */
  mind: number;
  restT: number;
  surfT: number;
  popT: number;
  boost: number;
  speed: number;
  turn: number;
  focus: number | null;
  /** Fish: which way it last turned (+1 clockwise / -1), picks the mirrored sprite pose. Ball/ring: colour variant 0 or 1. */
  side: number;
  skin: number;
};

let nextId = 1;
/** Drawn nose-to-tail length of each fish in radii (the fish meshes are normalised to length 1). */
export const FISH_LEN: Record<FishKind, number> = { koi: 2.8, tang: 2.5, perch: 2.7, shark: 3.4 };
export const isFloating = (k: Kind) => !isFish(k);
/** Every toy and fish is 3x the original size. */
export const SIZE_FACTOR = 3;

/** Feel constants: lighter toys get carried further by the waves. */
export const PHYS: Record<Kind, { push: number; drag: number; size: number; flow: number }> = {
  ball: { push: 3400, drag: 0.7, size: 20, flow: 12 },
  ring: { push: 3000, drag: 0.85, size: 30, flow: 11 },
  duck: { push: 2000, drag: 1.25, size: 26, flow: 8 },
  boat: { push: 1700, drag: 1.1, size: 32, flow: 7 },
  koi: { push: 500, drag: 2.2, size: 18, flow: 3 },
  tang: { push: 500, drag: 2.2, size: 14, flow: 3 },
  perch: { push: 500, drag: 2.2, size: 15, flow: 3 },
  shark: { push: 250, drag: 1.8, size: 30, flow: 1.5 },
};

/**
 * How each toy sits in the water. `waterline` = model-space height of the water plane when it floats upright (in radii,
 * must match the mesh pack), `draft` = how far it can rise out of the water before it is fully airborne (radii),
 * `kr` = righting stiffness (rad/s)^2 (0 = a ball rolls freely), `cd` = tilt damping, `cy` = yaw damping.
 */
export const BODY: Record<Kind, { waterline: number; draft: number; kr: number; cd: number; cy: number }> = {
  ball: { waterline: -0.72, draft: 0.35, kr: 0, cd: 0.4, cy: 0.6 },
  ring: { waterline: -0.08, draft: 0.25, kr: 60, cd: 3.4, cy: 1.2 },
  duck: { waterline: 0.62, draft: 0.5, kr: 48, cd: 3.2, cy: 1.6 },
  boat: { waterline: 0.16, draft: 0.45, kr: 34, cd: 3.4, cy: 1.8 },
  koi: { waterline: 0, draft: 0, kr: 0, cd: 0, cy: 0 },
  tang: { waterline: 0, draft: 0, kr: 0, cd: 0, cy: 0 },
  perch: { waterline: 0, draft: 0, kr: 0, cd: 0, cy: 0 },
  shark: { waterline: 0, draft: 0, kr: 0, cd: 0, cy: 0 },
};
/** Height (px) of a toy's model origin above the water surface when it floats at rest. */
export const hEq = (t: Pick<Thing, "kind" | "r">) => -BODY[t.kind].waterline * t.r;

export type Touch = { x: number; y: number; speed: number };

export function makeThing(kind: Kind, x: number, y: number, scale: number): Thing {
  const z0 = isFish(kind) ? (kind === "shark" ? 0.6 : 0.35) + Math.random() * 0.3 : 0;
  const t: Thing = {
    id: nextId++, kind, x, y, vx: 0, vy: 0,
    r: PHYS[kind].size * SIZE_FACTOR * scale * (0.92 + Math.random() * 0.16),
    angle: Math.random() * Math.PI * 2,
    wander: Math.random() * Math.PI * 2, fear: 0, tail: Math.random() * 6, bite: 0,
    z: 0, zGoal: 0, zv: 0, mind: Math.random() * 2, restT: 0, surfT: 0, popT: 0.2, boost: 0, speed: 0, turn: 0, focus: null,
    side: Math.random() < 0.5 ? 1 : -1, skin: Math.random() < 0.5 ? 0 : 1,
    color: kind === "duck" ? "#ffc93c" : kind === "ring" ? "#ffcf1f" : kind === "ball" ? "#e8322b" : "#b5763f",
    phase: Math.random() * 10, lift: 0,
    q: [0, 0, 0, 1], w: [0, 0, 0], h: 0, hv: 0, air: false,
    grabbed: null, wakeT: 0,
  };
  t.z = t.zGoal = z0;
  if (!isFish(kind)) {
    // A new toy is dropped in from a little above the water: it splashes, wobbles and settles.
    t.q = kind === "ball" ? qRandom() : qYawPitchRoll(-t.angle, 0, 0);
    t.h = hEq(t) + t.r * 2.2;
    t.air = true;
  }
  return t;
}

export type World = {
  things: Thing[];
  width: number;
  height: number;
  cell: number;
  touches: Touch[];
};

