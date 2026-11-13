import { describe, it, expect } from "vitest";
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
import { PHYS, fishIntent, makeThing, SIZE_FACTOR } from "../lib/water/objects";
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
