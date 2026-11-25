import { describe, expect, it } from "vitest";
import { testedEdge } from "../src/engine/analyze";

const s = { dir: "long" as const, name: "Wave 3 entry", stop: 90 };
describe("tested edge", () => {
  it("accepts a daily wave-3 buy above the 200-day average with a wide stop", () => {
    expect(testedEdge(s, "1d", 100, 95, 4, "crypto:BTCUSDT").ok).toBe(true);
  });
  it("rejects each condition the lab found losing", () => {
    expect(testedEdge(s, "1h", 100, 95, 4, "crypto:BTCUSDT").ok).toBe(false); // not daily
    expect(testedEdge({ ...s, dir: "short", stop: 110 }, "1d", 100, 105, 4).ok).toBe(false); // sells
    expect(testedEdge({ ...s, name: "Wave 5 entry" }, "1d", 100, 95, 4).ok).toBe(false); // not wave 3
    expect(testedEdge(s, "1d", 100, 105, 4).ok).toBe(false); // below the 200-day average
    expect(testedEdge(s, "1d", 100, 95, 6).ok).toBe(false); // stop only 10 vs 2x ATR = 12
    expect(testedEdge(s, "1d", 100, 95, 4, "yahoo:EURUSD=X").ok).toBe(false); // forex
  });
});
