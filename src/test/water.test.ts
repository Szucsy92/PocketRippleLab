import { describe, it, expect, vi } from "vitest";
import { BACKGROUNDS, LIQUIDS, DEFAULT_SETTINGS, SETTINGS_HOLD_MS, MOODS, applyMood, clampSettings, lightFromDisk, WATER_COLORS } from "../lib/water/settings";
import { WaterSim } from "../lib/water/sim";
import { Rainfall } from "../lib/water/rain";

describe("Water rules", () => {
  it("offers no more than five background colors", () => expect(BACKGROUNDS.length).toBeLessThanOrEqual(5));
  it("offers no more than five liquid choices", () => expect(LIQUIDS.length).toBeLessThanOrEqual(5));
  it("defaults to transparent water", () => expect(LIQUIDS[DEFAULT_SETTINGS.liquid]?.hex).toBe("transparent"));
  it("requires a three-second hold", () => expect(SETTINGS_HOLD_MS).toBe(3000));
  it("offers pool, lake and seabed worlds", () => expect(MOODS.map((m) => m.id).sort()).toEqual(["lake", "pool", "sea"]));
  it("defaults to maximum depth, slowest speed and longest waves", () => {
    expect(DEFAULT_SETTINGS.depth).toBe(1);
    expect(DEFAULT_SETTINGS.waveSpeed).toBe(1);
    expect(DEFAULT_SETTINGS.waveLife).toBe(1);
  });
  it("keeps the chosen depth when switching worlds", () => expect(applyMood({ ...DEFAULT_SETTINGS, depth: 0.4 }, "sea").depth).toBe(0.4));
  it("uses the specified optical colors", () => expect(WATER_COLORS).toEqual({ shallow: "#7fffd4", deep: "#003366", opacity: 0.85 }));
  it("keeps touch-only rain dry when not touched", () => {
    const rain = new Rainfall();
    rain.touch(1);
    expect(rain.step(1, "touch", false)).toBe(0);
    expect(rain.step(1, "touch", true)).toBeGreaterThan(0);
  });
  it("increases automatic rainfall with repeated touch", () => {
    const rain = new Rainfall();
    const initial = rain.rate("auto", true);
    rain.touch();
    const first = rain.rate("auto", true);
    rain.touch();
    expect(first).toBeGreaterThan(initial);
    expect(rain.rate("auto", true)).toBeGreaterThan(first);
  });
  it("relaxes automatic rain after release", () => {
    const rain = new Rainfall();
    rain.touch(1);
    const intense = rain.rate("auto", false);
    rain.step(4, "auto", false);
    expect(rain.rate("auto", false)).toBeLessThan(intense);
    expect(rain.rate("auto", false)).toBeGreaterThanOrEqual(5);
  });
  it("clamps optical controls and migrates previous saved settings", () => {
    expect(clampSettings({ depth: 4 }).depth).toBe(1);
    expect(clampSettings({ depth: -1 }).depth).toBe(0);
    expect(clampSettings({ liquid: 0 }).light).toEqual(DEFAULT_SETTINGS.light);
    expect(Math.hypot(...Object.values(lightFromDisk(2, 2)))).toBeCloseTo(1);
  });
  it("creates a tangential current that fades and clears", () => {
    const sim = new WaterSim(80, 80);
    sim.swirl(40, 40, 12, 0);
    const flow = sim.flow(40, 45);
    expect(flow[0]).toBeLessThan(0);
    expect(flow[1]).toBe(0);
    sim.ageCurrents(1);
    expect(Math.abs(sim.flow(40, 45)[0])).toBeLessThan(Math.abs(flow[0]));
    sim.clear();
    expect(sim.flow(40, 45)).toEqual([0, 0]);
  });
  it("mirrors the edge instead of losing the wave outside", () => {
    const sim = new WaterSim(5, 5);
    sim.damping = 1;
    sim.cur[10] = 2;
    sim.step();
    expect(sim.cur[10]).toBe(1);
    expect(sim.cur[11]).toBe(1);
  });
  it("creates a broad rounded impact with a raised outer lip", () => {
    const sim = new WaterSim(41, 41);
    sim.disturb(20, 20, 10, -5);
    expect(sim.cur[20 * 41 + 20]).toBeLessThan(0);
    expect(sim.cur[20 * 41 + 20 + 9]).toBeGreaterThan(0);
    expect(sim.cur[20 * 41 + 20 + 13]).toBe(0);
  });
});
import { PHYS, BODY, fishIntent, fishDecision, makeThing, updateThings, drawUnder, eyeFor, poseOf, tumble, swimAmp, SIZE_FACTOR, FISH, hEq, type Kind, type World } from "../lib/water/objects";
import { project, qRot, qAxisAngle, qMul, viewProj } from "../lib/water/gl/mat";
import { clipMean, framePositions, parsePack, scaleBend } from "../lib/water/gl/pack";
import { toyEye } from "../lib/water/gl/camera";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
describe("Toys", () => {
  it("offers 4 toys and 4 fish incl. an alien fish", () => expect(Object.keys(PHYS).sort()).toEqual(["alien", "ball", "boat", "duck", "koi", "perch", "ring", "tang"]));
  it("makes things 3x bigger", () => { expect(SIZE_FACTOR).toBe(3); expect(makeThing("ball", 0, 0, 1).r).toBeGreaterThan(20 * 3 * 0.9); });
  it("gentle fish flee a moving finger, come to a still one", () => {
    expect(fishIntent("koi", 100, 100, [{ x: 200, y: 100, speed: 300 }], 0).vx).toBeLessThan(0);
    expect(fishIntent("koi", 100, 100, [{ x: 400, y: 100, speed: 0 }], 0).vx).toBeGreaterThan(0);
  });
  it("the alien fish is a gentle fish too: it flees a moving finger and comes to a still one, never hunts", () => {
    const fleeing = fishIntent("alien", 100, 100, [{ x: 200, y: 100, speed: 300 }], 0);
    expect(fleeing.mode).toBe("flee"); expect(fleeing.vx).toBeLessThan(0);
    const coming = fishIntent("alien", 100, 100, [{ x: 400, y: 100, speed: 0 }], 0);
    expect(coming.mode).toBe("come"); expect(coming.vx).toBeGreaterThan(0);
  });
  it("carries light toys further than heavy ones", () => {
    expect(PHYS.ball.push).toBeGreaterThan(PHYS.duck.push);
    expect(PHYS.ring.push).toBeGreaterThan(PHYS.boat.push);
  });
});

describe("Fish behaviour", () => {
  const world = (): World => ({ things: [], width: 460, height: 800, cell: 2.3, touches: [] });
  const run = (w: World, sim: WaterSim, seconds: number, each: () => void) => {
    for (let i = 0; i < seconds * 30; i++) { updateThings(w, sim, 1 / 30); sim.step(); each(); }
  };
  it("sometimes surfaces, sometimes swims deep", () => {
    let seed = 7;
    const rnd = vi.spyOn(Math, "random").mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
    const w = world(), sim = new WaterSim(200, 360);
    const koi = makeThing("koi", 200, 400, 1);
    w.things.push(koi);
    let lo = 1, hi = 0;
    run(w, sim, 120, () => { lo = Math.min(lo, koi.z); hi = Math.max(hi, koi.z); });
    rnd.mockRestore();
    expect(lo).toBeLessThan(0.15);
    expect(hi).toBeGreaterThan(0.6);
  });
  it("turns at a limited rate and stays inside the pool", () => {
    let seed = 3;
    const rnd = vi.spyOn(Math, "random").mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
    const w = world(), sim = new WaterSim(200, 360);
    for (const k of FISH) w.things.push(makeThing(k, 230, 400, 1));
    let maxTurn = 0, out = 0;
    const prev = new Map<number, number>();
    run(w, sim, 60, () => {
      for (const t of w.things) {
        const p = prev.get(t.id);
        if (p !== undefined) maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(t.angle - p), Math.cos(t.angle - p))) * 30);
        prev.set(t.id, t.angle);
        if (t.x < 0 || t.x > w.width || t.y < 0 || t.y > w.height || !Number.isFinite(t.z)) out++;
        expect(t.z).toBeGreaterThanOrEqual(0);
        expect(t.z).toBeLessThanOrEqual(1);
      }
    });
    rnd.mockRestore();
    expect(maxTurn).toBeLessThan(11); // flee: 2.8 rad/s * 3.5
    expect(out).toBe(0);
  });
  it("swims smoothly: a calm heading, a slow steady tail beat, no dashing while cruising", () => {
    let seed = 11;
    const rnd = vi.spyOn(Math, "random").mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
    const w = world(), sim = new WaterSim(200, 360);
    for (const k of ["koi", "tang", "alien"] as Kind[]) w.things.push(makeThing(k, 150 + Math.random() * 160, 250 + Math.random() * 300, 1));
    const dt = 1 / 60;
    const h = new Map<number, { a: number[]; tail: number[]; sp: number[] }>();
    for (let i = 0; i < 60 * 40; i++) {
      updateThings(w, sim, dt); sim.step();
      if (i < 60 * 5) continue;
      for (const t of w.things) { const e = h.get(t.id) ?? { a: [], tail: [], sp: [] }; e.a.push(t.angle); e.tail.push(t.tail); e.sp.push(t.speed); h.set(t.id, e); }
    }
    rnd.mockRestore();
    const wrap = (d: number) => Math.atan2(Math.sin(d), Math.cos(d));
    for (const e of h.values()) {
      const turn: number[] = [], acc: number[] = [], tailRate: number[] = [];
      for (let i = 1; i < e.a.length; i++) { turn.push(wrap(e.a[i]! - e.a[i - 1]!) / dt); tailRate.push((e.tail[i]! - e.tail[i - 1]!) / dt); }
      for (let i = 1; i < turn.length; i++) acc.push((turn[i]! - turn[i - 1]!) / dt);
      const rms = Math.sqrt(acc.reduce((p, c) => p + c * c, 0) / acc.length);
      expect(rms).toBeLessThan(8); // it was ~30 rad/s^2 with the twitchy steering
      expect(Math.max(...tailRate)).toBeLessThan(7.5); // under ~1.2 beats per second
      expect(Math.min(...tailRate)).toBeGreaterThan(2);
      expect(Math.max(...e.sp)).toBeLessThan(110); // walls and schooling steer, they do not make it dash
    }
  });
  it("a scared fish dives", () => {
    const w = world(), sim = new WaterSim(200, 360);
    const f = makeThing("tang", 200, 400, 1);
    f.z = f.zGoal = 0.05;
    w.things.push(f);
    w.touches = [{ x: 260, y: 400, speed: 400 }];
    run(w, sim, 2, () => {});
    expect(f.z).toBeGreaterThan(0.5);
  });
  it("a gentle fish rises to a still finger", () => {
    const w = world(), sim = new WaterSim(200, 360);
    const f = makeThing("koi", 200, 400, 1);
    f.z = f.zGoal = 0.8;
    w.things.push(f);
    w.touches = [{ x: 330, y: 400, speed: 0 }];
    run(w, sim, 3, () => {});
    expect(f.z).toBeLessThan(0.3);
  });
  it("decides by trait: the deep alien surfaces less than the koi, nobody inspects without a target", () => {
    expect(fishDecision("koi", 0.1, 0.5, false).action).toBe("surface");
    expect(fishDecision("alien", 0.15, 0.5, false).action).not.toBe("surface");
    expect(fishDecision("koi", 0.6, 0.5, false).action).toBe("swim");
    expect(fishDecision("koi", 0.55, 0.5, true).action).toBe("inspect");
  });
  it("fish at very different depths do not bump", () => {
    const w = world(), sim = new WaterSim(200, 360);
    const a = makeThing("koi", 200, 400, 1), b = makeThing("koi", 205, 400, 1);
    a.z = a.zGoal = 0.1; b.z = b.zGoal = 0.9;
    w.things.push(a, b);
    updateThings(w, sim, 1 / 60);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(20);
  });
});

describe("3D toys", () => {
  const world = (): World => ({ things: [], width: 460, height: 800, cell: 2.3, touches: [] });
  const run = (w: World, sim: WaterSim, seconds: number) => { for (let i = 0; i < seconds * 60; i++) { updateThings(w, sim, 1 / 60); sim.step(); } };
  const upZ = (q: Parameters<typeof qRot>[0]) => qRot(q, [0, 0, 1])[2];
  const quiet = () => { const sim = new WaterSim(200, 360); sim.damping = 0.97; return sim; };

  it("a new toy is dropped in: it falls, splashes and settles upright at its waterline", () => {
    const w = world(), sim = quiet();
    const d = makeThing("duck", 230, 400, 1);
    w.things.push(d);
    expect(d.h).toBeGreaterThan(hEq(d) + d.r);
    let minH = d.h, wasAir = d.air, ripple = 0;
    for (let i = 0; i < 60 * 6; i++) { updateThings(w, sim, 1 / 60); sim.step(); minH = Math.min(minH, d.h); ripple = Math.max(ripple, ...Array.from(sim.cur).map(Math.abs)); }
    expect(wasAir).toBe(true);
    expect(minH).toBeLessThan(hEq(d) + 1);
    expect(Math.abs(d.h - hEq(d))).toBeLessThan(d.r * 0.3);
    expect(upZ(d.q)).toBeGreaterThan(0.9);
    expect(ripple).toBeGreaterThan(0.5); // the impact rippled the water
  });
  it("a toy that lands upside down flips back over by itself (not the ball: it has no up)", () => {
    for (const kind of ["duck", "boat", "ring"] as const) {
      const w = world(), sim = quiet();
      const t = makeThing(kind, 230, 400, 1);
      t.h = hEq(t); t.air = false; t.hv = 0;
      t.q = qMul(qAxisAngle(1, 0, 0, Math.PI * 0.97), t.q); // belly up
      t.w = [0.3, 0.2, 0];
      w.things.push(t);
      expect(upZ(t.q)).toBeLessThan(-0.9);
      run(w, sim, 4);
      expect(upZ(t.q)).toBeGreaterThan(0.85);
    }
  });
  it("a thrown toy wobbles: it tilts after the drop, then calms down", () => {
    const w = world(), sim = quiet();
    const b = makeThing("boat", 230, 400, 1);
    b.h = hEq(b); b.air = false; b.vx = 500; b.vy = -300;
    tumble(b);
    w.things.push(b);
    let worst = 1;
    for (let i = 0; i < 60 * 5; i++) { updateThings(w, sim, 1 / 60); sim.step(); if (i < 90) worst = Math.min(worst, upZ(b.q)); }
    expect(worst).toBeLessThan(0.98);
    expect(upZ(b.q)).toBeGreaterThan(0.9);
  });
  it("a held toy is lifted out of the water and falls back when let go", () => {
    const w = world(), sim = quiet();
    const d = makeThing("duck", 230, 400, 1);
    d.h = hEq(d); d.air = false; d.grabbed = 1;
    w.things.push(d);
    run(w, sim, 0.6);
    expect(d.h).toBeGreaterThan(hEq(d) + d.r * 0.5);
    d.grabbed = null;
    run(w, sim, 3);
    expect(Math.abs(d.h - hEq(d))).toBeLessThan(d.r * 0.3);
  });
  it("tilting the phone never moves or tilts a toy (the camera is the only thing that changes)", () => {
    // updateThings takes no tilt at all; the world has no tilt field and a still toy stays where it is
    const w = world(), sim = quiet();
    const t = makeThing("ball", 380, 700, 1);
    t.h = hEq(t); t.air = false;
    w.things.push(t);
    const x = t.x, y = t.y;
    run(w, sim, 3);
    expect(Math.hypot(t.x - x, t.y - y)).toBeLessThan(3);
    expect("tilt" in w).toBe(false);
  });
  it("keeps every toy inside the pool when thrown at the wall", () => {
    const w = world(), sim = quiet();
    const t = makeThing("ring", 230, 400, 1);
    t.vx = 1200; t.vy = 900; w.things.push(t);
    run(w, sim, 4);
    expect(t.x).toBeGreaterThanOrEqual(t.r - 1); expect(t.x).toBeLessThanOrEqual(w.width - t.r + 1);
    expect(t.y).toBeGreaterThanOrEqual(t.r - 1); expect(t.y).toBeLessThanOrEqual(w.height - t.r + 1);
  });
  it("a rolling ball spins along its drift", () => {
    const w = world(), sim = quiet();
    const b = makeThing("ball", 230, 400, 1);
    b.h = hEq(b); b.air = false; b.vx = 300; b.vy = 0; w.things.push(b);
    for (let i = 0; i < 20; i++) updateThings(w, sim, 1 / 60);
    expect(Math.abs(b.w[1])).toBeGreaterThan(0.5); // spin about the horizontal axis across the motion
  });
  it("draws shadows for everything without errors", () => {
    const w = world();
    for (const k of ["duck", "boat", "ball", "ring", ...FISH] as Kind[]) w.things.push(makeThing(k, 200, 300, 1));
    const ctx = new Proxy({ canvas: { width: 460, height: 800 } } as Record<string, unknown>, {
      get: (o, k: string) => (k in o ? o[k] : (...a: unknown[]) => (k.startsWith("create") ? { addColorStop: () => {} } : a[0])),
      set: (o, k: string, v) => { o[k] = v; return true; },
    }) as unknown as CanvasRenderingContext2D;
    expect(() => drawUnder(ctx, w.things, 1, 0.5, { x: -0.7, y: 0.7 })).not.toThrow();
  });
});

describe("Camera", () => {
  const W = 390, H = 844;
  it("has no tilt: the eye sits over the middle and objects at the surface never move", () => {
    const e = eyeFor(W, H, { x: 0, y: 0 }, 0.5, null);
    expect(e.x).toBeCloseTo(W / 2); expect(e.y).toBeCloseTo(H / 2);
    const t = eyeFor(W, H, { x: 0.7, y: -0.4 }, 0.5, null);
    const p = project(W, H, t.x, t.y, t.h, [120, -300, 0]);
    expect(p.x).toBeCloseTo(120); expect(p.y).toBeCloseTo(300);
  });
  it("tilt only moves the eye: the same point is seen from another angle", () => {
    const a = project(W, H, ...(([e]) => [e.x, e.y, e.h] as const)([eyeFor(W, H, { x: 0, y: 0 }, 0.5, null)]), [120, -300, 80]);
    const t = eyeFor(W, H, { x: 0.5, y: 0.3 }, 0.5, null);
    const b = project(W, H, t.x, t.y, t.h, [120, -300, 80]);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(5);
  });
  it("matches the floor shader: a floor point lands where the shader's parallax puts it", () => {
    for (const [depth, mood, par] of [[0.35, null, { x: 0.4, y: -0.2 }], [1, "sea", { x: -0.6, y: 0.5 }], [0.7, "lake", { x: 0.1, y: 0.3 }]] as const) {
      const e = eyeFor(W, H, par, depth, mood);
      const boxD = 0.25 + depth * 0.75, relief = mood ? 0.6 : 1;
      const cl = (v: number) => Math.max(-0.6, Math.min(0.6, v));
      const sPhys = { x: cl(par.x * boxD * 0.7 * relief), y: cl(par.y * boxD * 0.7 * relief) }, persp = boxD * 0.45 * relief;
      for (const [px, py] of [[50, 100], [300, 700], [195, 422]] as const) {
        // shader: the pixel (px, py) shows the floor at px + sh
        const sh = { x: sPhys.x * H + (px - W / 2) * persp, y: sPhys.y * H + (py - H / 2) * persp };
        const floorPoint = project(W, H, e.x, e.y, e.h, [px + sh.x, -(py + sh.y), -e.floor]);
        // the floor point q appears at q - sh(q): check the inverse relation for the point that is displayed at (px, py)
        const q = { x: px + sh.x, y: py + sh.y };
        const shq = { x: sPhys.x * H + (q.x - W / 2) * persp, y: sPhys.y * H + (q.y - H / 2) * persp };
        expect(floorPoint.x).toBeCloseTo(q.x - shq.x, 3);
        expect(floorPoint.y).toBeCloseTo(q.y - shq.y, 3);
      }
    }
  });
  it("the off-axis projection maps the screen rectangle on the surface to clip space", () => {
    const e = eyeFor(W, H, { x: 0.3, y: 0.2 }, 0.6, null);
    const m = viewProj(new Float32Array(16), W, H, e.x, e.y, e.h);
    const clip = (x: number, y: number, z: number) => {
      const wx = x, wy = -y;
      const c = [0, 1, 2, 3].map((r) => m[r]! * wx + m[4 + r]! * wy + m[8 + r]! * z + m[12 + r]!);
      return [c[0]! / c[3]!, c[1]! / c[3]!];
    };
    const [x0, y0] = clip(0, 0, 0), [x1, y1] = clip(W, H, 0);
    expect(x0).toBeCloseTo(-1); expect(y0).toBeCloseTo(1); expect(x1).toBeCloseTo(1); expect(y1).toBeCloseTo(-1);
  });
  it("toys use a gentler eye than the floor, fish the full one", () => {
    const e = eyeFor(W, H, { x: 0.8, y: 0 }, 0.5, null), t = toyEye(W, H, e);
    expect(Math.abs(t.x - W / 2)).toBeLessThan(Math.abs(e.x - W / 2));
    expect(t.h).toBe(e.h);
  });
  it("fish hang below the surface and shift with the eye (parallax)", () => {
    const f = makeThing("koi", 195, 422, 1);
    f.z = 0.6;
    const e0 = eyeFor(W, H, { x: 0, y: 0 }, 0.5, null), e1 = eyeFor(W, H, { x: 0.6, y: 0 }, 0.5, null);
    const p0 = poseOf(f, e0).pos, p1 = poseOf(f, e1).pos;
    expect(p0[2]).toBeLessThan(-50);
    const a = project(W, H, e0.x, e0.y, e0.h, p0), b = project(W, H, e1.x, e1.y, e1.h, p1);
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(10);
  });
});

describe("Mesh packs", () => {
  const dir = new URL("../assets/models/", import.meta.url);
  const load = (name: string) => {
    let buf = readFileSync(new URL(name, dir));
    if (buf.subarray(0, 4).toString() === "PRMZ") buf = inflateRawSync(buf.subarray(8));
    return parsePack(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  };
  it("have the waterline the physics expects", () => {
    expect(load("ball.prm").waterline).toBeCloseTo(BODY.ball.waterline, 2);
    expect(load("ring.prm").waterline).toBeCloseTo(BODY.ring.waterline, 2);
    expect(load("duck.prm").waterline).toBeCloseTo(BODY.duck.waterline, 2);
    expect(load("boat.prm").waterline).toBeCloseTo(BODY.boat.waterline, 1);
  });
  it("are about one radius big and drawn from valid indices", () => {
    for (const n of ["ball", "ring", "duck", "boat"]) {
      const p = load(`${n}.prm`);
      const maxR = Math.max(...[0, 1, 2].map((a) => Math.max(Math.abs(p.lo[a]!), Math.abs(p.lo[a]! + p.span[a]!))));
      expect(maxR).toBeGreaterThan(0.6); expect(maxR).toBeLessThan(2.6);
      let top = 0; for (const i of p.idx) top = Math.max(top, i);
      expect(top).toBeLessThan(p.verts);
      expect(p.parts.reduce((a, q) => a + q.count, 0)).toBe(p.idx.length);
    }
  });
  it("hold animated fish: a swim loop each (the alien reuses the clown fish's motion), no bite", () => {
    const c = load("clown.prm"), a = load("alien.prm");
    expect(c.frames).toBe(24); expect(c.clips["swim"]?.loop).toBe(true);
    expect(a.frames).toBe(24); expect(a.clips["swim"]?.count).toBe(24); expect(a.clips["swim"]?.cycles).toBe(1); // the alien swims with the clown fish's motion
    for (const p of [c, a]) { expect(p.span[0]).toBeGreaterThan(0.8); expect(p.clips["bite"]).toBeUndefined(); } // about one length long
  });
  it("the swim amplitude grows with the speed, and the neutral pose is straighter than a baked frame", () => {
    expect(swimAmp(0)).toBeCloseTo(0.15, 2);
    expect(swimAmp(55)).toBeGreaterThan(0.3); expect(swimAmp(55)).toBeLessThan(0.6);
    expect(swimAmp(480)).toBe(1);
    expect(swimAmp(80)).toBeGreaterThan(swimAmp(40));
    for (const name of ["clown.prm", "alien.prm"]) {
      const p = load(name), clip = p.clips["swim"]!;
      const neutral = clipMean(p, clip);
      const f0 = new Float32Array(p.verts * 3);
      framePositions(p, 0, 0, 0, f0);
      const spread = (a: Float32Array) => { let lo = 1e9, hi = -1e9; for (let i = 1; i < a.length; i += 3) { lo = Math.min(lo, a[i]!); hi = Math.max(hi, a[i]!); } return hi - lo; };
      expect(spread(neutral.pos)).toBeLessThan(spread(f0) * 0.75);
      scaleBend(f0, neutral.pos, 0);
      expect(Math.abs(f0[100]! - neutral.pos[100]!)).toBeLessThan(1e-6); // amp 0 = the neutral pose
    }
  });
  it("the clown fish is right side up: its long dorsal fin is on top, the short pelvic fin below", () => {
    const p = load("clown.prm");
    const pts: number[][] = [];
    for (let i = 0; i < p.verts; i++) pts.push([0, 1, 2].map((a) => p.lo[a]! + (p.pos[i * 3 + a]! / 65535) * p.span[a]!));
    const zmax = Math.max(...pts.map((v) => v[2]!)), zmin = Math.min(...pts.map((v) => v[2]!));
    const spread = (sel: (v: number[]) => boolean) => { const xs = pts.filter(sel).map((v) => v[0]!); return Math.max(...xs) - Math.min(...xs); };
    expect(spread((v) => v[2]! > 0.8 * zmax)).toBeGreaterThan(spread((v) => v[2]! < 0.8 * zmin));
  });
});
