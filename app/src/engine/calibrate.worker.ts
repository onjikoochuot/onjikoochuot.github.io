// Runs the history test off the main thread so the app stays responsive.
import { backtest } from "./backtest";
import { costsFor, roundTripPct } from "./costs";
import type { Candle, Tf } from "./types";

export type CalTrade = { symbol: string; label: string; t: number; dir: string; score: number; result: "win" | "loss" | "open"; r: number; rNet: number };
export type CalIn = { tf: Tf; markets: { symbol: string; label: string; candles: Candle[] }[] };
export type CalMsg = { kind: "progress"; done: number; total: number; label: string } | { kind: "done"; trades: CalTrade[] };

self.onmessage = (e: MessageEvent<CalIn>) => {
  const { tf, markets } = e.data;
  const trades: CalTrade[] = [];
  markets.forEach((m, i) => {
    (self as unknown as Worker).postMessage({ kind: "progress", done: i, total: markets.length, label: m.label } satisfies CalMsg);
    if (m.candles.length < 260) return;
    const res = backtest(m.candles, tf, { level: "WATCH+", symbol: m.symbol });
    const c = costsFor(m.symbol);
    for (const t of res.trades) {
      // Costs in units of risk: a win exits at the target (limit order), a loss or an unfinished trade exits at market.
      const costR = (roundTripPct(c, t.result !== "win") * t.entry) / Math.abs(t.entry - t.stop);
      trades.push({ symbol: m.symbol, label: m.label, t: t.t, dir: t.dir, score: t.score, result: t.result, r: t.r, rNet: t.r - costR });
    }
  });
  (self as unknown as Worker).postMessage({ kind: "done", trades } satisfies CalMsg);
};
