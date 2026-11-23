import type { Kind } from "../things";
import ballPack from "../../../assets/models/ball.prm?url";
import ringPack from "../../../assets/models/ring.prm?url";
import duckPack from "../../../assets/models/duck.prm?url";
import boatPack from "../../../assets/models/boat.prm?url";
import clownPack from "../../../assets/models/clown.prm?url";
import ball0 from "../../../assets/models/ball0.webp";
import ball1 from "../../../assets/models/ball1.webp";
import ring0 from "../../../assets/models/ring0.webp";
import ring1 from "../../../assets/models/ring1.webp";
import duckBase from "../../../assets/models/duck_base.webp";
import duckRough from "../../../assets/models/duck_rough.webp";
import duckNormal from "../../../assets/models/duck_normal.webp";
import boatWood from "../../../assets/models/boat_wood.webp";
import koiTex from "../../../assets/models/koi.webp";
import tangTex from "../../../assets/models/tang.webp";
import perchTex from "../../../assets/models/perch.webp";
import alienPack from "../../../assets/models/alien.prm?url";
import alienTex from "../../../assets/models/alien.webp";
import alienRough from "../../../assets/models/alien_rough.webp";
import alienNormal from "../../../assets/models/alien_normal.webp";
import fishNormal from "../../../assets/models/fish_normal.webp";

/**
 * Every toy and fish is a mesh pack (tools/models). The clown fish (koi / tang / perch) is one mesh in three colours.
 * Pack mesh data and texture file names are resolved through these two tables.
 */
export type ModelKey = "ball" | "ring" | "duck" | "boat" | "clown" | "alien";
export const PACKS: Record<ModelKey, string> = { ball: ballPack, ring: ringPack, duck: duckPack, boat: boatPack, clown: clownPack, alien: alienPack };
export const TEXTURES: Record<string, string> = {
  "ball0.webp": ball0, "ball1.webp": ball1, "ring0.webp": ring0, "ring1.webp": ring1,
  "duck_base.webp": duckBase, "duck_rough.webp": duckRough, "duck_normal.webp": duckNormal, "boat_wood.webp": boatWood,
  "koi.webp": koiTex, "tang.webp": tangTex, "perch.webp": perchTex, "alien.webp": alienTex, "alien_rough.webp": alienRough, "alien_normal.webp": alienNormal, "fish_normal.webp": fishNormal,
};

export function modelKey(kind: Kind): ModelKey {
  return kind === "koi" || kind === "tang" || kind === "perch" ? "clown" : kind;
}
/** Which entry of a texture array (colour variant) this object uses. */
export function variantOf(kind: Kind, skin: number): number {
  if (kind === "tang") return 1;
  if (kind === "perch") return 2;
  if (kind === "ball" || kind === "ring") return skin ? 1 : 0;
  return 0;
}
