import { describe, it, expect } from "vitest";
import { trailStop, nextPeak } from "../src/engine/trail";

// Long: entry 100, stop 95 (risk 5), target 1 = 110 (R1 = 10), target 2 = 120
const L = { dir: "long" as const, entry: 100, initialStop: 95, stop: 95, target1: 110, target2: 120, t1Hit: false };
// Short mirror: entry 100, stop 105, target 1 = 90, target 2 = 80
const S = { dir: "short" as const, entry: 100, initialStop: 105, stop: 105, target1: 90, target2: 80, t1Hit: false };

describe("trailing stop", () => {
  it("does nothing until the trade is halfway to target 1", () => {
    expect(trailStop({ ...L, peak: 104, price: 104 })).toBeNull();
  });
  it("halves the risk halfway to target 1", () => {
    const r = trailStop({ ...L, peak: 105, price: 105 })!;
    expect(r.stop).toBeCloseTo(97.5); expect(r.locksProfit).toBe(false);
  });
  it("moves to break-even at 80% of the way to target 1", () => {
    expect(trailStop({ ...L, peak: 108, price: 108 })!.stop).toBeCloseTo(100);
  });
  it("locks in half the best gain after target 1, and keeps room below the price", () => {
    const r = trailStop({ ...L, stop: 100, t1Hit: true, peak: 111, price: 110.5 })!;
    expect(r.stop).toBeCloseTo(105.5); expect(r.locksProfit).toBe(true);
  });
  it("raises to target 1 when 60% of the way to target 2", () => {
    expect(trailStop({ ...L, stop: 106, t1Hit: true, peak: 116, price: 116 })!.stop).toBeCloseTo(110);
  });
  it("never moves backwards after the price falls", () => {
    expect(trailStop({ ...L, stop: 106, t1Hit: true, peak: 112, price: 104 })).toBeNull();
  });
  it("never puts the stop within a quarter of R1 of the price", () => {
    const r = trailStop({ ...L, stop: 95, peak: 109, price: 101 });
    expect(r).not.toBeNull(); expect(r!.stop).toBeLessThanOrEqual(101 - 2.5 + 1e-9);
  });
  it("mirrors exactly for shorts", () => {
    expect(trailStop({ ...S, peak: 95, price: 95 })!.stop).toBeCloseTo(102.5);
    expect(trailStop({ ...S, peak: 92, price: 92 })!.stop).toBeCloseTo(100);
    expect(trailStop({ ...S, stop: 100, t1Hit: true, peak: 89, price: 89.5 })!.stop).toBeCloseTo(94.5);
  });
  it("tracks the best price per direction", () => {
    expect(nextPeak("long", 105, 103, 108)).toBe(108);
    expect(nextPeak("short", 95, 97, 92)).toBe(92);
    expect(nextPeak("long", null, 100)).toBe(100);
  });
});
