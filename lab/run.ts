// Viko research lab: replays the engine bar by bar on real price history and records every setup it
// could have taken, with its features and its outcome under Viko's real trade management (half at
// target 1, trailing stop, target 2, time limit) after fees and slippage. Runs on GitHub Actions,
// which can download market data. Usage: node lab/dist/run.js <group> <out.jsonl>
import { analyze } from "../app/src/engine/analyze";
import { trailStop } from "../app/src/engine/trail";
import { costsFor, marketFill } from "../app/src/engine/costs";
import type { Candle, Tf } from "../app/src/engine/types";
import { writeFileSync, appendFileSync } from "node:fs";

const GROUPS: Record<string, string[]> = {
  majors: ["crypto:BTCUSDT", "crypto:ETHUSDT", "crypto:SOLUSDT", "crypto:BNBUSDT", "crypto:XRPUSDT"],
  alts: ["crypto:ADAUSDT", "crypto:DOGEUSDT", "crypto:AVAXUSDT", "crypto:LINKUSDT", "crypto:LTCUSDT", "crypto:DOTUSDT", "crypto:NEARUSDT", "crypto:ATOMUSDT"],
  fx: ["yahoo:EURUSD=X", "yahoo:GBPUSD=X", "yahoo:USDJPY=X", "yahoo:AUDUSD=X", "yahoo:USDCAD=X", "yahoo:USDCHF=X", "yahoo:NZDUSD=X", "yahoo:EURJPY=X"],
  commod: ["yahoo:GC=F", "yahoo:SI=F", "yahoo:CL=F", "yahoo:NG=F", "yahoo:HG=F"],
  indices: ["yahoo:^GSPC", "yahoo:^NDX", "yahoo:^DJI", "yahoo:^GDAXI", "yahoo:^FTSE", "yahoo:^N225"],
  stocks: ["yahoo:AAPL", "yahoo:MSFT", "yahoo:NVDA", "yahoo:AMZN", "yahoo:TSLA", "yahoo:META"],
  // Wider universe, daily only: is the edge real across many more markets, and how often does it fire?
  stocks2: ["yahoo:GOOGL", "yahoo:JPM", "yahoo:V", "yahoo:UNH", "yahoo:XOM", "yahoo:JNJ", "yahoo:PG", "yahoo:HD", "yahoo:COST", "yahoo:AVGO", "yahoo:AMD", "yahoo:NFLX", "yahoo:KO", "yahoo:PEP", "yahoo:WMT", "yahoo:BAC", "yahoo:CRM", "yahoo:ORCL", "yahoo:ADBE", "yahoo:LLY"],
  alts2: ["crypto:TRXUSDT", "crypto:BCHUSDT", "crypto:XLMUSDT", "crypto:UNIUSDT", "crypto:AAVEUSDT", "crypto:FILUSDT", "crypto:ETCUSDT", "crypto:HBARUSDT", "crypto:ICPUSDT", "crypto:APTUSDT"],
  world: ["yahoo:^RUT", "yahoo:^STOXX50E", "yahoo:^HSI", "yahoo:^NSEI", "yahoo:PA=F", "yahoo:PL=F", "yahoo:ZC=F", "yahoo:ZW=F", "yahoo:KC=F", "yahoo:BZ=F"],
};
GROUPS.weekly = Object.entries(GROUPS).filter(([g]) => g !== "fx").flatMap(([, v]) => v); // every non-forex market, weekly chart
const GROUP_TFS: Record<string, Tf[]> = { stocks2: ["1d"], alts2: ["1d"], world: ["1d"], weekly: ["1w"] };
const TFS_DEFAULT: Tf[] = (process.env.LAB_TFS?.split(",") as Tf[]) ?? ["15m", "1h", "4h", "1d"];
const TF_SEC: Record<string, number> = { "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800 };
const WINDOW = 900; // candles the engine sees each time (the live app loads about this many)
const MAX_HOLD: Record<string, number> = { "15m": 288, "1h": 168, "4h": 90, "1d": 60, "1w": 26 }; // bars: 3d, 7d, 15d, 60d

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function getJson(url: string): Promise<any> {
  for (let a = 0; a < 4; a++) {
    try { const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } }); if (r.ok) return await r.json(); } catch { /* retry */ }
    await sleep(1500 * (a + 1));
  }
  throw new Error("fetch failed " + url);
}

async function binance(sym: string, tf: Tf, want: number): Promise<Candle[]> {
  const out: Candle[] = []; let end: number | undefined;
  while (out.length < want) {
    const u = `https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${tf}&limit=1000${end ? `&endTime=${end}` : ""}`;
    const k: any[] = await getJson(u);
    if (!k.length) break;
    out.unshift(...k.map((x) => ({ t: Math.floor(x[0] / 1000), o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] })));
    end = k[0][0] - 1;
    if (k.length < 1000) break;
  }
  return out.slice(0, -1); // drop the unfinished candle
}

async function yahoo(sym: string, tf: Tf): Promise<Candle[]> {
  const iv = tf === "1w" ? "1wk" : tf === "1d" ? "1d" : tf === "15m" ? "15m" : "60m";
  const range = tf === "1w" ? "max" : tf === "1d" ? "15y" : tf === "15m" ? "60d" : "730d";
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${iv}&range=${range}`);
  const r = j.chart?.result?.[0]; if (!r) return [];
  const q = r.indicators.quote[0];
  let c: Candle[] = r.timestamp.map((t: number, i: number) => ({ t, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] ?? 0 }))
    .filter((x: Candle) => [x.o, x.h, x.l, x.c].every((v) => typeof v === "number" && v > 0));
  if (tf === "4h") { // build 4-hour candles from hourly ones
    const m = new Map<number, Candle>();
    for (const x of c) { const k = Math.floor(x.t / 14400) * 14400; const b = m.get(k); if (!b) m.set(k, { ...x, t: k }); else { b.h = Math.max(b.h, x.h); b.l = Math.min(b.l, x.l); b.c = x.c; b.v += x.v; } }
    c = [...m.values()].sort((a, b) => a.t - b.t);
  }
  return c.slice(0, -1);
}

/** ADX(14), Wilder smoothing, at the last candle. */
function adx(c: Candle[], n = 14): number | null {
  if (c.length < n * 3) return null;
  let trS = 0, pS = 0, mS = 0, adxV = 0; const dx: number[] = [];
  for (let i = 1; i < c.length; i++) {
    const up = c[i].h - c[i - 1].h, dn = c[i - 1].l - c[i].l;
    const tr = Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
    const p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0;
    if (i <= n) { trS += tr; pS += p; mS += m; continue; }
    trS = trS - trS / n + tr; pS = pS - pS / n + p; mS = mS - mS / n + m;
    const pdi = (100 * pS) / trS, mdi = (100 * mS) / trS;
    dx.push(pdi + mdi > 0 ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0);
    if (dx.length === n) adxV = dx.reduce((a, b) => a + b, 0) / n; else if (dx.length > n) adxV = (adxV * (n - 1) + dx[dx.length - 1]) / n;
  }
  return dx.length >= n ? +adxV.toFixed(1) : null;
}

/** Alternative exit from the web research: half at target 1, the rest on a 2.5×ATR chandelier trail (ATR fixed at entry), target 2, time limit. */
function manageAtr(c: Candle[], i: number, s: { dir: "long" | "short"; stop: number; target1: number; target2: number }, sym: string, maxHold: number, atr: number) {
  const long = s.dir === "long", cost = costsFor(sym);
  const entry = marketFill(c[i].c, long ? "buy" : "sell", cost), risk = Math.abs(entry - s.stop);
  if (!(risk > 0) || !(atr > 0)) return null;
  let stop = s.stop, best = c[i].c, half = false, pnl = -entry * cost.fee, left = 1, exitI = i;
  const close = (px: number, part: number, market: boolean) => { const fill = market ? marketFill(px, long ? "sell" : "buy", cost) : px; pnl += part * ((long ? fill - entry : entry - fill) - fill * cost.fee); left -= part; };
  for (let k = i + 1; k < c.length && k <= i + maxHold; k++) {
    const b = c[k]; exitI = k;
    if (long ? b.l <= stop : b.h >= stop) { close(stop, left, true); break; }
    if (!half && (long ? b.h >= s.target1 : b.l <= s.target1)) { close(s.target1, 0.5, false); half = true; }
    if (half && (long ? b.h >= s.target2 : b.l <= s.target2)) { close(s.target2, left, false); break; }
    best = long ? Math.max(best, b.c) : Math.min(best, b.c);
    const cand = long ? best - 2.5 * atr : best + 2.5 * atr;
    if (long ? cand > stop : cand < stop) stop = cand;
  }
  if (left > 1e-9) close(c[exitI].c, left, true);
  return +(pnl / risk).toFixed(4);
}

const kindOf = (s: string) => { const l = costsFor(s).label; return l.startsWith("major") ? "major" : l.startsWith("smaller") ? "alt" : l.startsWith("currency") ? "fx" : l.startsWith("commodity") ? "commod" : "stock/index"; };

/** Viko's real management, candle by candle: half at target 1, trailing stop on the rest, target 2, time limit. Returns R after costs. */
function manage(c: Candle[], i: number, s: { dir: "long" | "short"; stop: number; target1: number; target2: number }, sym: string, maxHold: number) {
  const long = s.dir === "long", cost = costsFor(sym);
  const entry = marketFill(c[i].c, long ? "buy" : "sell", cost);
  const risk = Math.abs(entry - s.stop);
  if (!(risk > 0)) return null;
  let stop = s.stop, peak = entry, half = false, pnl = -entry * cost.fee, left = 1, exitI = i, how = "time";
  const gain = (px: number) => (long ? px - entry : entry - px);
  const close = (px: number, part: number, market: boolean) => { const fill = market ? marketFill(px, long ? "sell" : "buy", cost) : px; pnl += part * (gain(fill) - fill * cost.fee); left -= part; };
  let t1First: boolean | null = null;
  for (let k = i + 1; k < c.length && k <= i + maxHold; k++) {
    const b = c[k];
    const stopHit = long ? b.l <= stop : b.h >= stop;
    if (stopHit) { close(stop, left, true); exitI = k; how = stop === s.stop ? "stop" : (long ? stop > entry : stop < entry) ? "trail-profit" : "trail"; if (t1First === null) t1First = false; break; }
    if (!half && (long ? b.h >= s.target1 : b.l <= s.target1)) { close(s.target1, 0.5, false); half = true; if (t1First === null) t1First = true; }
    if (half && (long ? b.h >= s.target2 : b.l <= s.target2)) { close(s.target2, left, false); exitI = k; how = "t2"; break; }
    peak = long ? Math.max(peak, b.h) : Math.min(peak, b.l);
    const tr = trailStop({ dir: s.dir, entry, initialStop: s.stop, stop, target1: s.target1, target2: s.target2, peak, price: b.c, t1Hit: half });
    if (tr) stop = tr.stop;
    exitI = k;
  }
  if (left > 1e-9) { close(c[exitI].c, left, true); }
  return { rNet: pnl / risk, t1First, how, bars: exitI - i };
}

async function main() {
  const [group, out] = process.argv.slice(2);
  const syms = process.env.LAB_SYMS?.split(",") ?? GROUPS[group]; if (!syms) throw new Error("unknown group " + group);
  writeFileSync(out, "");
  for (const sym of syms) for (const tf of (GROUP_TFS[group] ?? TFS_DEFAULT)) {
    const t0 = Date.now();
    let c: Candle[] = [];
    try { c = sym.startsWith("crypto:") ? await binance(sym.slice(7), tf, tf === "1d" ? 3000 : 4000) : await yahoo(sym.slice(6), tf); } catch (e) { console.log(`${sym} ${tf}: ${(e as Error).message}`); continue; }
    if (c.length < (tf === "1w" ? 260 : 400)) { console.log(`${sym} ${tf}: only ${c.length} candles, skipped`); continue; }
    let busyUntil = -1, n = 0;
    for (let i = tf === "1w" ? 220 : 300; i < c.length - 2; i++) {
      if (i <= busyUntil) continue;
      const win = c.slice(Math.max(0, i + 1 - WINDOW), i + 1);
      const a = analyze(win, tf, undefined, sym);
      // every setup Viko would show as tradeable now (not only approved), so the lab can learn which features matter
      const s = a.setups.find((x) => x.triggered && !x.hardFail && x.verdict !== "NO TRADE" && x.rr1 >= 1.5);
      if (!s) continue;
      const m = manage(c, i, s, sym, MAX_HOLD[tf]);
      if (!m) continue;
      const atr = a.ind.atr[a.ind.atr.length - 1] ?? null;
      const checks: Record<string, number | null> = {};
      for (const k of s.checks) checks[k.id] = k.pass === null ? null : k.pass ? 1 : 0;
      const wy = a.wyckoff;
      // Extra features for the research queue (recorded, not used by the engine yet)
      const j = i, cl = c[j].c;
      const ret63 = j >= 63 ? +((cl / c[j - 63].c - 1) * 100).toFixed(2) : null;
      const sma100 = j >= 100 ? c.slice(j - 99, j + 1).reduce((x, b) => x + b.c, 0) / 100 : null;
      const vol20 = c.slice(Math.max(0, j - 20), j).reduce((x, b) => x + b.v, 0) / Math.min(20, j);
      const volRatio = vol20 > 0 ? +(c[j].v / vol20).toFixed(2) : null;
      const don20 = Math.max(...c.slice(Math.max(0, j - 20), j).map((b) => b.h)), donL20 = Math.min(...c.slice(Math.max(0, j - 20), j).map((b) => b.l));
      const donBreak = s.dir === "long" ? cl > don20 : cl < donL20;
      const L = Object.fromEntries(s.labels.map((l) => [l.text, l.p]));
      const w2Depth = L["0"] != null && L["1"] != null && L["2"] != null && L["1"] !== L["0"] ? +(Math.abs(L["1"] - L["2"]) / Math.abs(L["1"] - L["0"])).toFixed(3) : null;
      const brokeW1 = L["1"] != null ? (s.dir === "long" ? cl > L["1"] : cl < L["1"]) : null;
      const atrRel = (() => { const xs = a.ind.atr.slice(-120).filter((v) => v > 0).sort((p, q) => p - q); return xs.length > 20 && atr ? +(xs.filter((v) => v <= atr).length / xs.length).toFixed(2) : null; })();
      const vol20r = (() => { const r = (k: number) => Math.log(c[k].c / c[k - 1].c); if (j < 140) return null; const sd = (a0: number, len: number) => { const xs: number[] = []; for (let k = a0 - len + 1; k <= a0; k++) xs.push(r(k)); const m = xs.reduce((p, q) => p + q, 0) / xs.length; return Math.sqrt(xs.reduce((p, q) => p + (q - m) ** 2, 0) / xs.length); }; const meds: number[] = []; for (let k = j - 120; k <= j; k += 5) meds.push(sd(k, 20)); meds.sort((p, q) => p - q); return +(sd(j, 20) / meds[Math.floor(meds.length / 2)]).toFixed(2); })();
      const extra = { ret63, aboveSma100: sma100 ? cl > sma100 : null, adx: adx(win), volRatio, donBreak, w2Depth, brokeW1, atrPct: atrRel, volRegime: vol20r, rNetAtr: manageAtr(c, i, s, sym, MAX_HOLD[tf], atr ?? 0), weekday: new Date(c[i].t * 1000).getUTCDay() };
      appendFileSync(out, JSON.stringify({
        sym, kind: kindOf(sym), tf, t: c[i].t, dir: s.dir, name: s.name, pattern: s.pattern, degree: s.degree, score: s.score, verdict: s.verdict, edge: s.edge?.ok ?? null, rr1: +s.rr1.toFixed(2), rr2: +s.rr2.toFixed(2),
        stopPct: +(Math.abs(c[i].c - s.stop) / c[i].c * 100).toFixed(3), stopAtr: atr ? +(Math.abs(c[i].c - s.stop) / atr).toFixed(2) : null,
        wyKind: wy.kind, wyPhase: wy.phase, wyBias: wy.bias, htf: a.htfTrend, checks, ...extra, ...m,
      }) + "\n");
      n++;
      busyUntil = i + Math.max(1, Math.min(m.bars, MAX_HOLD[tf])); // one trade at a time per market and timeframe
    }
    console.log(`${sym} ${tf}: ${c.length} candles, ${n} trades, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
