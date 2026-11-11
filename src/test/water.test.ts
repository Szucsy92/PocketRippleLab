import { describe, it, expect } from "vitest";
import { BACKGROUNDS, LIQUIDS, DEFAULT_SETTINGS, SETTINGS_HOLD_MS, MOODS, applyMood, clampSettings, lightFromDisk, WATER_COLORS } from "../lib/water/settings";
import { WaterSim } from "../lib/water/sim";
import { Rainfall } from "../lib/water/rain";

describe("Water rules", () => {
  it("offers no more than five background colors", () => expect(BACKGROUNDS.length).toBeLessThanOrEqual(5));
  it("offers no more than five liquid choices", () => expect(LIQUIDS.length).toBeLessThanOrEqual(5));
  it("defaults to transparent water", () => expect(LIQUIDS[DEFAULT_SETTINGS.liquid]?.hex).toBe("transparent"));
  it("requires a three-second hold", () => expect(SETTINGS_HOLD_MS).toBe(3000));
  it("offers the three agreed moods", () => expect(MOODS.map((m) => m.id)).toEqual(["stream", "ocean", "rain"]));
  it("sets shallow slow long-lived stream water", () => {
    const stream = applyMood(DEFAULT_SETTINGS, "stream");
    expect(stream.depth).toBe(0.2);
    expect(stream.waveSpeed).toBe(1);
    expect(stream.waveLife).toBe(0.85);
  });
  it("sets deep fast ocean water", () => {
    const ocean = applyMood(DEFAULT_SETTINGS, "ocean");
    expect(ocean.depth).toBe(0.85);
    expect(ocean.waveSpeed).toBe(2.75);
  });
  it("uses the specified optical colors", () => expect(WATER_COLORS).toEqual({ shallow: "#7fffd4", deep: "#003366", opacity: 0.85 }));
  it("starts gentle rain automatically when its mood is selected", () => {
    const rainy = applyMood({ ...DEFAULT_SETTINGS, rainMode: "touch" }, "rain");
    expect(rainy.rainMode).toBe("auto");
    const rain = new Rainfall();
    expect(rain.step(1, rainy.rainMode, false)).toBe(5);
  });
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