import { describe, it, expect } from "vitest";
import { BACKGROUNDS, LIQUIDS, DEFAULT_SETTINGS, SETTINGS_HOLD_MS } from "../lib/water/settings";
import { WaterSim } from "../lib/water/sim";

describe("Water rules", () => {
  it("offers no more than five background colors", () => expect(BACKGROUNDS.length).toBeLessThanOrEqual(5));
  it("offers no more than five liquid choices", () => expect(LIQUIDS.length).toBeLessThanOrEqual(5));
  it("defaults to transparent water", () => expect(LIQUIDS[DEFAULT_SETTINGS.liquid]?.hex).toBe("transparent"));
  it("requires a three-second hold", () => expect(SETTINGS_HOLD_MS).toBe(3000));
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