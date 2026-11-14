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
import { PHYS, fishIntent, fishDecision, makeThing, updateThings, drawSurface, drawUnder, headingFrame, fishPose, FISH_SHEET, BALL, HEADING, SIZE_FACTOR, FISH, type Kind, type World } from "../lib/water/objects";
describe("Toys", () => {
  it("offers 4 toys and 4 fish incl. a shark", () => expect(Object.keys(PHYS).sort()).toEqual(["ball", "boat", "duck", "koi", "perch", "ring", "shark", "tang"]));
  it("makes things 3x bigger", () => { expect(SIZE_FACTOR).toBe(3); expect(makeThing("ball", 0, 0, 1).r).toBeGreaterThan(20 * 3 * 0.9); });
  it("gentle fish flee a moving finger, come to a still one", () => {
    expect(fishIntent("koi", 100, 100, [{ x: 200, y: 100, speed: 300 }], 0).vx).toBeLessThan(0);
    expect(fishIntent("koi", 100, 100, [{ x: 400, y: 100, speed: 0 }], 0).vx).toBeGreaterThan(0);
  });
  it("only the shark hunts a moving finger", () => {
    const r = fishIntent("shark", 100, 100, [{ x: 300, y: 100, speed: 300 }], 0);
    expect(r.mode).toBe("hunt"); expect(r.vx).toBeGreaterThan(0);
  });
  it("carries light toys further than heavy ones", () => {
    expect(PHYS.ball.push).toBeGreaterThan(PHYS.duck.push);
    expect(PHYS.ring.push).toBeGreaterThan(PHYS.boat.push);
  });
});

describe("Fish behaviour", () => {
  const world = (): World => ({ things: [], width: 460, height: 800, cell: 2.3, tilt: { x: 0, y: 0 }, touches: [] });
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
  it("decides by trait: the shark rarely surfaces, nobody inspects without a target", () => {
    expect(fishDecision("koi", 0.1, 0.5, false).action).toBe("surface");
    expect(fishDecision("shark", 0.1, 0.5, false).action).not.toBe("surface");
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

describe("Photoreal sprites", () => {
  const world = (): World => ({ things: [], width: 460, height: 800, cell: 2.3, tilt: { x: 0, y: 0 }, touches: [] });
  const fakeCtx = () => {
    const calls: string[] = [];
    const ctx = new Proxy({ canvas: { width: 460, height: 800 } } as Record<string, unknown>, {
      get: (o, k: string) => (k in o ? o[k] : (...a: unknown[]) => { calls.push(k); return k.startsWith("create") ? { addColorStop: () => {} } : a[0]; }),
      set: (o, k: string, v) => { o[k] = v; return true; },
    });
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  };
  it("draws every kind without errors, also before the sprites have loaded", () => {
    const w = world(), sim = new WaterSim(200, 360);
    for (const k of ["duck", "boat", "ball", "ring", ...FISH] as Kind[]) w.things.push(makeThing(k, 200, 300, 1));
    updateThings(w, sim, 1 / 60);
    const { ctx } = fakeCtx();
    expect(() => { drawUnder(ctx, w.things, 1); drawSurface(ctx, w.things, 2, { x: 0.2, y: -0.1 }); }).not.toThrow();
  });
  it("picks the nearest pre-rendered heading", () => {
    expect(headingFrame(0, 16)).toEqual({ idx: 0, rest: 0 });
    expect(headingFrame(Math.PI, 16).idx).toBe(8);
    expect(headingFrame(-0.1, 16).idx).toBe(0);
    expect(headingFrame(Math.PI * 2 - 0.05, 16).idx).toBe(0);
    const h = headingFrame(0.3, 16);
    expect(Math.abs(h.rest)).toBeLessThan(Math.PI / 16 + 1e-9);
  });
  it("describes fish poses: bank by turn, mirror by side, still tail when hovering", () => {
    const base = { turn: 0, speed: 60, tail: 0, side: -1 };
    expect(fishPose(base, 8).bendRow).toBe(0);
    expect(fishPose({ ...base, turn: 1 }, 8).bendRow).toBe(1);
    expect(fishPose({ ...base, turn: -5 }, 8).bendRow).toBe(2);
    expect(fishPose({ ...base, side: 1 }, 8).mirror).toBe(true);
    expect(fishPose({ ...base, side: 1 }, 8).colA).toBe(4); // mirrored pose = opposite tail phase
    expect(fishPose({ ...base, speed: 0 }, 8).amp).toBeLessThan(0.3);
    expect(fishPose({ ...base, speed: 0, turn: 3 }, 8).amp).toBe(1); // no ghosting while turning
    expect(fishPose({ ...base, tail: Math.PI }, 8).colA).toBe(4);
  });
  it("describes sprite sheets consistently", () => {
    for (const k of FISH) { expect(FISH_SHEET[k].cols * FISH_SHEET[k].cw).toBeLessThanOrEqual(4096); expect(FISH_SHEET[k].lenPx).toBeLessThan(FISH_SHEET[k].cw); }
    expect(BALL.urls).toHaveLength(2);
    expect(HEADING.duck.frames).toBe(HEADING.duck.cols * 2);
    expect(HEADING.boat.frames).toBe(HEADING.boat.cols * 2);
  });
  it("a ball rolls in its direction of travel", () => {
    const w = world(), sim = new WaterSim(200, 360);
    const b = makeThing("ball", 200, 300, 1);
    b.vx = 0; b.vy = 300; w.things.push(b);
    for (let i = 0; i < 10; i++) updateThings(w, sim, 1 / 30);
    expect(Math.cos(b.angle - Math.atan2(b.vy, b.vx))).toBeGreaterThan(0.9);
    expect(b.spin).toBeGreaterThan(0.5);
  });
});
