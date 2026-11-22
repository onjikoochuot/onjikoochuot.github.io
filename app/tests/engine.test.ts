import { describe, it, expect } from "vitest";
import { analyze } from "../src/engine/analyze";
import { backtest } from "../src/engine/backtest";
import { monowaves } from "../src/engine/waves";
import { computeIndicators } from "../src/engine/indicators";
import type { Candle } from "../src/engine/types";

// Deterministic generator: piecewise legs with noise, volume higher on impulse legs.
function series(legs: [number, number, number][], seed = 7): Candle[] {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: Candle[] = []; let p = legs[0][0]; let t = 1_600_000_000;
  for (const [, to, bars] of legs) {
    const from = p;
    for (let b = 1; b <= bars; b++) {
      const target = from + ((to - from) * b) / bars;
      const o = p, c = target * (1 + (rnd() - 0.5) * 0.004);
      const h = Math.max(o, c) * (1 + rnd() * 0.004), l = Math.min(o, c) * (1 - rnd() * 0.004);
      const v = (to > from ? 1500 : 800) * (0.7 + rnd() * 0.6);
      out.push({ t: (t += 86400), o, h, l, c, v }); p = c;
    }
  }
  return out;
}

describe("engine", () => {
  // downtrend, then impulse 1-2 and start of 3
  const c = series([[200, 200, 1], [200, 120, 120], [120, 150, 25], [150, 128, 18], [128, 160, 30], [160, 140, 20], [140, 175, 25], [175, 150, 20], [150, 190, 30], [190, 170, 25], [170, 210, 25], [210, 190, 15], [190, 196, 6]]);
  it("finds monowaves alternating H/L", () => {
    const ind = computeIndicators(c);
    const pv = monowaves(c, ind.atr, 3.6);
    expect(pv.length).toBeGreaterThan(5);
    for (let i = 1; i < pv.length; i++) expect(pv[i].kind).not.toBe(pv[i - 1].kind);
  });
  it("produces setups with bounded scores and coherent levels", () => {
    const a = analyze(c, "1d");
    expect(a.setups.length).toBeGreaterThan(0);
    for (const s of a.setups) {
      expect(s.score).toBeGreaterThanOrEqual(0); expect(s.score).toBeLessThanOrEqual(100);
      if (s.dir === "long") { expect(s.stop).toBeLessThan(s.target1); } else { expect(s.stop).toBeGreaterThan(s.target1); }
      if (s.verdict === "APPROVED") { expect(s.hardFail).toBe(false); expect(s.score).toBeGreaterThanOrEqual(80); expect(s.rr1).toBeGreaterThanOrEqual(2); expect(s.triggered).toBe(true); }
    }
    console.log(a.setups.slice(0, 5).map((s) => `${s.verdict} ${s.dir} ${s.name} [${s.degree}] score=${s.score} rr=${s.rr1.toFixed(2)} hard=${s.hardFail}`).join("\n"));
    console.log("wyckoff", a.wyckoff.kind, a.wyckoff.phase, a.wyckoff.events.map((e) => e.code).join(","), "htf", a.htfTrend);
  });
  it("short mirror produces no negative prices", () => {
    const a = analyze(c, "1d");
    for (const s of a.setups) for (const x of [s.entry, s.stop, s.target1, s.target2]) expect(x).toBeGreaterThan(0);
  });
  it("backtest runs walk-forward fast", () => {
    const long = series(Array.from({ length: 40 }, (_, k) => [0, 100 + 30 * Math.sin(k / 2) + k * 2, 12 + (k % 5) * 4] as [number, number, number]), 11);
    const t0 = performance.now();
    const r = backtest(long, "1d", { level: "WATCH+" });
    console.log("bars", long.length, "ms", Math.round(performance.now() - t0), "trades", r.trades.length, "win", r.winRate, "avgR", r.avgR);
    expect(r.barsTested).toBeGreaterThan(0);
  });
});
