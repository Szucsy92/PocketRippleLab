import { preloadKind } from "./sprites";

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
  spin: number;
  color: string;
  phase: number;
  lift: number;
  /** 3D rocking (spring), driven by waves and tilt changes. */
  rockX: number;
  rockY: number;
  rockVX: number;
  rockVY: number;
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

export type Touch = { x: number; y: number; speed: number };

export function makeThing(kind: Kind, x: number, y: number, scale: number): Thing {
  const z0 = isFish(kind) ? (kind === "shark" ? 0.6 : 0.35) + Math.random() * 0.3 : 0;
  const t: Thing = {
    id: nextId++, kind, x, y, vx: 0, vy: 0,
    r: PHYS[kind].size * SIZE_FACTOR * scale * (0.92 + Math.random() * 0.16),
    angle: Math.random() * Math.PI * 2, spin: 0,
    wander: Math.random() * Math.PI * 2, fear: 0, tail: Math.random() * 6, bite: 0,
    z: 0, zGoal: 0, zv: 0, mind: Math.random() * 2, restT: 0, surfT: 0, popT: 0.2, boost: 0, speed: 0, turn: 0, focus: null,
    side: Math.random() < 0.5 ? 1 : -1, skin: Math.random() < 0.5 ? 0 : 1,
    color: kind === "duck" ? "#ffc93c" : kind === "ring" ? "#ffcf1f" : kind === "ball" ? "#e8322b" : "#b5763f",
    phase: Math.random() * 10, lift: 0,
    rockX: 0, rockY: 0, rockVX: 0, rockVY: 0,
    grabbed: null, wakeT: 0,
  };
  t.z = t.zGoal = z0;
  preloadKind(kind, t.skin);
  return t;
}

export type World = {
  things: Thing[];
  width: number;
  height: number;
  cell: number;
  tilt: { x: number; y: number };
  touches: Touch[];
};

