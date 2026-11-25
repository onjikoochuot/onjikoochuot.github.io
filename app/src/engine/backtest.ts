import type { Candle, Setup, Tf } from "./types";
import { analyze } from "./analyze";

export type Trade = { i: number; t: number; dir: Setup["dir"]; name: string; degree: string; score: number; entry: number; stop: number; target1: number; exitI: number; result: "win" | "loss" | "open"; r: number };
export type BacktestResult = { trades: Trade[]; wins: number; losses: number; winRate: number | null; avgR: number | null; expectancy: number | null; barsTested: number; level: "APPROVED" | "WATCH+" };

/**
 * Walk-forward replay: at every bar the engine only sees candles up to that bar.
 * An approved setup enters at that bar's close; the trade is a win if target 1
 * is reached before the stop, a loss if the stop is hit first (same bar = loss).
 */
export function backtest(c: Candle[], tf: Tf, opts: { start?: number; level?: "APPROVED" | "WATCH+"; maxHold?: number; onProgress?: (f: number) => void; symbol?: string } = {}): BacktestResult {
  const start = Math.max(220, opts.start ?? 220);
  const level = opts.level ?? "APPROVED";
  const maxHold = opts.maxHold ?? 120;
  const trades: Trade[] = [];
  let busyUntil = -1;
  for (let i = start; i < c.length - 1; i++) {
    if (opts.onProgress && i % 25 === 0) opts.onProgress((i - start) / (c.length - start));
    if (i <= busyUntil) continue;
    const a = analyze(c.slice(Math.max(0, i - 899), i + 1), tf, undefined, opts.symbol);
    const s = a.setups.find((x) => (level === "APPROVED" ? x.verdict === "APPROVED" : x.verdict !== "NO TRADE" && x.triggered && x.rr1 >= 2 && !x.hardFail));
    if (!s) continue;
    const long = s.dir === "long";
    const entry = c[i].c;
    let result: Trade["result"] = "open", exitI = Math.min(c.length - 1, i + maxHold), r = 0;
    for (let k = i + 1; k < c.length && k <= i + maxHold; k++) {
      const hitStop = long ? c[k].l <= s.stop : c[k].h >= s.stop;
      const hitT1 = long ? c[k].h >= s.target1 : c[k].l <= s.target1;
      if (hitStop) { result = "loss"; exitI = k; r = -1; break; }
      if (hitT1) { result = "win"; exitI = k; r = Math.abs(s.target1 - entry) / Math.abs(entry - s.stop); break; }
    }
    if (result === "open") { const last = c[exitI].c; r = ((long ? last - entry : entry - last) / Math.abs(entry - s.stop)); }
    trades.push({ i, t: c[i].t, dir: s.dir, name: s.name, degree: s.degree, score: s.score, entry, stop: s.stop, target1: s.target1, exitI, result, r });
    busyUntil = exitI;
  }
  const closed = trades.filter((t) => t.result !== "open");
  const wins = closed.filter((t) => t.result === "win").length;
  const losses = closed.length - wins;
  const avgR = closed.length ? closed.reduce((s, t) => s + t.r, 0) / closed.length : null;
  return { trades, wins, losses, winRate: closed.length ? wins / closed.length : null, avgR, expectancy: avgR, barsTested: c.length - 1 - start, level };
}
