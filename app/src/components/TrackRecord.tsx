import { useEffect, useMemo, useRef, useState } from "react";
import type { Tf } from "../engine/types";
import { costsFor } from "../engine/costs";
import type { CalMsg, CalTrade } from "../engine/calibrate.worker";
import { auto, CATALOG, getCandles, PAPER, type AutoHistory } from "../lib/api";

/** One finished trade, from any source, in the shape the report needs. */
type Row = { score: number; tf: string; symbol: string; label: string; win: boolean; pnl: number | null; r: number | null; fees: number; reason: string | null; at: number };
type PaperRow = { id: string; symbol: string; label: string; tf: string; score: number; entry: number; initial_stop: number; qty: number; realized: number; fees: number | null; close_reason: string | null; closed_at: string };

const BANDS = [
  { key: "90", label: "90–100", test: (s: number) => s >= 90 },
  { key: "80", label: "80–89", test: (s: number) => s >= 80 && s < 90 },
  { key: "70", label: "70–79", test: (s: number) => s >= 70 && s < 80 },
  { key: "lo", label: "Under 70", test: (s: number) => s < 70 },
];
const ENOUGH = 30;

function marketKind(symbol: string): string {
  const c = costsFor(symbol).label;
  return c.startsWith("major") ? "Major coins" : c.startsWith("smaller") ? "Smaller coins" : c.startsWith("currency") ? "Currencies" : c.startsWith("commodity") ? "Commodities" : "Stocks and indices";
}
const REASON: Record<string, string> = { target1: "Target 1", target2: "Target 2", trailing: "Trailing stop (profit locked)", stop: "Stop-loss", time: "Time limit", manual: "Closed by you" };

type Stat = { n: number; wins: number; winRate: number | null; avgR: number | null; pnl: number; fees: number };
function stat(rows: Row[]): Stat {
  const rs = rows.filter((r) => r.r !== null).map((r) => r.r!);
  const wins = rows.filter((r) => r.win).length;
  return { n: rows.length, wins, winRate: rows.length ? wins / rows.length : null, avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null, pnl: rows.reduce((a, r) => a + (r.pnl ?? 0), 0), fees: rows.reduce((a, r) => a + r.fees, 0) };
}
const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
const rr = (x: number | null) => (x === null ? "–" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}R`);
const usd = (x: number) => `${x >= 0 ? "+" : "−"}$${Math.abs(x).toFixed(2)}`;

function verdict(s: Stat): string {
  if (s.n === 0) return "No trades yet";
  if (s.n < ENOUGH) return `Too early: ${ENOUGH - s.n} more trades needed`;
  if (s.avgR !== null) return s.avgR > 0.1 ? "Making money after costs" : s.avgR > -0.1 ? "About break-even" : "Losing money";
  return s.pnl > 0 ? "Making money" : "Losing money";
}

function BandTable({ rows, showR, showFees, money = true }: { rows: Row[]; showR: boolean; showFees: boolean; money?: boolean }) {
  return (
    <table className="tbl compact tr-table">
      <thead><tr><th>Score</th><th className="r">Trades</th><th className="r">Won</th>{showR && <th className="r">Average result</th>}{money && <th className="r">Profit / loss</th>}{showFees && <th className="r">Costs paid</th>}<th className="tr-verdict">What it says</th></tr></thead>
      <tbody>{BANDS.map((b) => {
        const s = stat(rows.filter((r) => b.test(r.score)));
        return (
          <tr key={b.key}><td><span className="mono">{b.label}</span><small className="tr-v-inline">{verdict(s)}</small></td><td className="r mono">{s.n}</td><td className="r mono">{pct(s.winRate)}</td>{showR && <td className={`r mono ${s.avgR !== null ? (s.avgR > 0 ? "bull" : "bear") : ""}`}>{rr(s.avgR)}</td>}
            {money && <td className={`r mono ${s.pnl > 0 ? "bull" : s.pnl < 0 ? "bear" : ""}`}>{s.n ? usd(s.pnl) : "–"}</td>}{showFees && <td className="r mono">{s.n ? `$${s.fees.toFixed(2)}` : "–"}</td>}<td className="sub tr-verdict">{verdict(s)}</td></tr>
        );
      })}</tbody>
    </table>
  );
}

function Breakdown({ title, rows, by, showR, money = true }: { title: string; rows: Row[]; by: (r: Row) => string; showR: boolean; money?: boolean }) {
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) m.set(by(r), [...(m.get(by(r)) ?? []), r]);
    return [...m.entries()].map(([k, v]) => [k, stat(v)] as const).sort((a, b) => b[1].n - a[1].n);
  }, [rows, by]);
  if (!groups.length) return null;
  return (
    <div className="tr-break">
      <h4>{title}</h4>
      <table className="tbl compact tr-table">
        <thead><tr><th></th><th className="r">Trades</th><th className="r">Won</th>{showR && <th className="r">Average</th>}{money && <th className="r">Profit / loss</th>}</tr></thead>
        <tbody>{groups.map(([k, s]) => <tr key={k}><td>{k}</td><td className="r mono">{s.n}</td><td className="r mono">{pct(s.winRate)}</td>{showR && <td className="r mono">{rr(s.avgR)}</td>}{money && <td className={`r mono ${s.pnl > 0 ? "bull" : s.pnl < 0 ? "bear" : ""}`}>{usd(s.pnl)}</td>}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Summary({ rows, showR, tested }: { rows: Row[]; showR: boolean; tested?: string }) {
  const s = stat(rows);
  return (
    <div className="stats">
      <div><span className="mono big">{s.n}</span><span>{tested ? "setups taken and finished" : "finished trades"}</span></div>
      <div><span className="mono big">{pct(s.winRate)}</span><span>closed in profit</span></div>
      {showR ? <div><span className="mono big">{rr(s.avgR)}</span><span>average result per trade, after costs</span></div> : <div><span className="mono big">{s.n ? usd(s.pnl / s.n) : "–"}</span><span>average per trade</span></div>}
      {tested ? <div><span className="mono big">{tested}</span><span>tested</span></div>
        : <div><span className={`mono big ${s.pnl > 0 ? "bull" : s.pnl < 0 ? "bear" : ""}`}>{s.n ? usd(s.pnl) : "–"}</span><span>total profit / loss{s.fees ? `, after $${s.fees.toFixed(2)} costs` : ""}</span></div>}
    </div>
  );
}

// ---------- The history test: replay the rules on past prices and see how each score band did ----------
const MAJOR_IDS = ["crypto:BTCUSDT", "crypto:ETHUSDT", "crypto:SOLUSDT", "crypto:XRPUSDT", "yahoo:GC=F", "yahoo:EURUSD=X", "yahoo:GBPUSD=X", "yahoo:^GSPC"];
const SMALL_IDS = CATALOG.filter((c) => c.market === "Crypto" && costsFor(c.id).label.startsWith("smaller")).slice(0, 8).map((c) => c.id);

function HistoryTest() {
  const [tf, setTf] = useState<Tf>("1h");
  const [set, setSet] = useState<"main" | "wide">("main");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [res, setRes] = useState<{ tf: Tf; trades: CalTrade[]; markets: number } | null>(null);
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);

  const run = async () => {
    setErr(""); setRes(null);
    const ids = set === "main" ? MAJOR_IDS : [...MAJOR_IDS, ...SMALL_IDS];
    const markets: { symbol: string; label: string; candles: Awaited<ReturnType<typeof getCandles>> }[] = [];
    for (const [i, id] of ids.entries()) {
      const inst = CATALOG.find((c) => c.id === id);
      setBusy(`Loading prices ${i + 1} of ${ids.length}…`);
      try { markets.push({ symbol: id, label: inst?.label ?? id, candles: await getCandles(id, tf) }); } catch { /* skip a market whose prices won't load */ }
    }
    if (!markets.length) { setBusy(""); setErr("Couldn't load any price history. Check your connection and try again."); return; }
    worker.current?.terminate();
    const w = new Worker(new URL("../engine/calibrate.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (e: MessageEvent<CalMsg>) => {
      if (e.data.kind === "progress") setBusy(`Replaying ${e.data.label} (${e.data.done + 1} of ${e.data.total})…`);
      else { setRes({ tf, trades: e.data.trades, markets: markets.length }); setBusy(""); w.terminate(); }
    };
    w.onerror = () => { setErr("The history test stopped unexpectedly. Try fewer markets."); setBusy(""); };
    w.postMessage({ tf, markets });
  };

  const rows: Row[] = (res?.trades ?? []).filter((t) => t.result !== "open").map((t) => ({ score: t.score, tf: res!.tf, symbol: t.symbol, label: t.label, win: t.result === "win", pnl: null, r: t.rNet, fees: 0, reason: t.result, at: t.t }));
  const best = BANDS.map((b) => ({ b, s: stat(rows.filter((r) => b.test(r.score))) }));
  const hi = best.find((x) => x.b.key === "80")!.s, lo = best.find((x) => x.b.key === "lo")!.s;
  return (
    <section className="card tr-section">
      <h3>History test: does a higher score actually do better?</h3>
      <p className="sub">Viko replays its rules candle by candle on past prices (it only sees the past each time) and records every setup it would have taken, with its score. A trade counts as a win if it reaches target 1 before the stop-loss. Results are after estimated fees and slippage. This takes about a minute.</p>
      <div className="row tr-controls">
        <div className="seg" role="radiogroup" aria-label="Timeframe">{(["15m", "1h", "4h", "1d"] as Tf[]).map((t) => <button key={t} role="radio" aria-checked={tf === t} className={tf === t ? "on" : ""} onClick={() => setTf(t)} disabled={!!busy}>{t}</button>)}</div>
        <div className="seg" role="radiogroup" aria-label="Markets">{([["main", `Main markets (${MAJOR_IDS.length})`], ["wide", `Plus smaller coins (${MAJOR_IDS.length + SMALL_IDS.length})`]] as const).map(([v, l]) => <button key={v} role="radio" aria-checked={set === v} className={set === v ? "on" : ""} onClick={() => setSet(v)} disabled={!!busy}>{l}</button>)}</div>
        <button className="btn primary" onClick={run} disabled={!!busy}>{busy ? "Testing…" : "Run history test"}</button>
      </div>
      {busy && <p className="sub" aria-live="polite">{busy}</p>}
      {err && <p className="err">{err}</p>}
      {res && (
        <>
          <Summary rows={rows} showR tested={`${res.markets} markets, ${res.tf}`} />
          <BandTable rows={rows} showR showFees={false} money={false} />
          <p className="ctx-note">
            {rows.length < ENOUGH ? `Only ${rows.length} finished trades in this test, too few to judge. Try a lower timeframe or more markets.`
              : hi.n >= 10 && lo.n >= 10 && hi.avgR !== null && lo.avgR !== null
                ? hi.avgR > lo.avgR + 0.05 ? `Good sign: setups scoring 80–89 averaged ${rr(hi.avgR)} against ${rr(lo.avgR)} for those under 70, so a higher score did mean better trades here.` : `Warning: setups scoring 80–89 averaged ${rr(hi.avgR)}, no better than ${rr(lo.avgR)} for those under 70. On this timeframe, the score isn't separating good trades from bad ones.`
                : "Not enough trades in every score band to compare them yet. Try a lower timeframe or more markets."}
            {" "}A win here is target 1 only; the trailing stop in live trading can do better or worse. Past results don't guarantee future ones.
          </p>
          <Breakdown title="By market" rows={rows} by={(r) => r.label} showR money={false} />
        </>
      )}
    </section>
  );
}

// ---------- The page ----------
export function TrackRecord({ appKey, onNeedKey }: { appKey: string; onNeedKey: () => void }) {
  const [src, setSrc] = useState<"paper" | "real">("paper");
  const [paperRows, setPaperRows] = useState<Row[] | null>(null);
  const [realRows, setRealRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!appKey) return;
    setErr("");
    fetch(`${PAPER}/report`, { headers: { "x-viko-key": appKey } }).then((r) => r.json()).then((j: { trades?: PaperRow[]; error?: string }) => {
      if (j.error) throw new Error(j.error);
      setPaperRows((j.trades ?? []).map((t) => {
        const risk = Math.abs(t.entry - t.initial_stop) * t.qty;
        return { score: t.score, tf: t.tf, symbol: t.symbol, label: t.label, win: t.realized > 0, pnl: t.realized, r: risk > 0 ? t.realized / risk : null, fees: Number(t.fees ?? 0), reason: t.close_reason, at: Date.parse(t.closed_at) };
      }));
    }).catch((e) => setErr((e as Error).message));
    auto.history(appKey).then((h: { rows: AutoHistory[] }) => setRealRows(h.rows.map((t) => ({ score: t.score, tf: t.tf, symbol: t.symbol, label: t.label, win: t.pnl > 0, pnl: t.pnl, r: null, fees: 0, reason: t.close_reason, at: Date.parse(t.closed_at) })))).catch(() => setRealRows([]));
  }, [appKey]);

  const rows = (src === "paper" ? paperRows : realRows) ?? [];
  const showR = src === "paper";
  return (
    <section className="view">
      <header className="view-head">
        <div><h2>Track record</h2><p>How Viko's trades have actually turned out, grouped by the score they had when opened. A score counts how many of Viko's rules agree; it is not a chance of winning. This page shows whether higher scores really win more often.</p></div>
      </header>

      <section className="card tr-section">
        <div className="row tr-controls">
          <h3>Your trades</h3>
          <div className="seg" role="radiogroup" aria-label="Which trades">{([["paper", "Paper"], ["real", "Real money"]] as const).map(([v, l]) => <button key={v} role="radio" aria-checked={src === v} className={src === v ? "on" : ""} onClick={() => setSrc(v)}>{l}</button>)}</div>
        </div>
        {!appKey ? <p className="sub">Add your app key in Settings to see your trades. <button className="btn ghost" onClick={onNeedKey}>Open settings</button></p>
          : err ? <p className="err">{err}</p>
          : (src === "paper" ? paperRows : realRows) === null ? <p className="sub">Loading…</p>
          : (
            <>
              <Summary rows={rows} showR={showR} />
              <BandTable rows={rows} showR={showR} showFees={src === "paper"} />
              <p className="ctx-note">
                {rows.length < ENOUGH ? `${rows.length} finished trade${rows.length === 1 ? "" : "s"} so far. Results start to mean something at about ${ENOUGH} trades per score band, so keep going before trusting these numbers.` : "Compare the bands: if 80+ doesn't beat the lower scores over many trades, the score isn't adding an edge."}
                {showR ? " Average result is in units of risk (R): +1R means you made what you had risked; −1R means the stop-loss was hit in full. Profit and loss include fees and slippage." : " Real-money results are what your broker reported."}
                {" "}Trades you delete from the history list still count here.
              </p>
              {rows.length > 0 && (
                <div className="tr-breaks">
                  <Breakdown title="By timeframe" rows={rows} by={(r) => r.tf} showR={showR} />
                  <Breakdown title="By market type" rows={rows} by={(r) => marketKind(r.symbol)} showR={showR} />
                  <Breakdown title="How trades ended" rows={rows} by={(r) => REASON[r.reason ?? ""] ?? r.reason ?? "Other"} showR={showR} />
                </div>
              )}
            </>
          )}
      </section>

      <HistoryTest />

      <section className="card tr-section">
        <h3>Costs Viko assumes</h3>
        <p className="sub">Paper trades, ticket previews and the history test all subtract these, per side of a trade. Real brokers vary, so treat them as estimates.</p>
        <ul className="tr-costs">
          <li><b>Major coins</b> (BTC, ETH, SOL, BNB, XRP): 0.05% fee, 0.02% slippage</li>
          <li><b>Smaller coins</b>: 0.05% fee, 0.08% slippage</li>
          <li><b>Currencies</b>: 0.01% spread, 0.01% slippage</li>
          <li><b>Commodities</b> (gold, oil…): 0.02% spread, 0.02% slippage</li>
          <li><b>Stocks and indices</b>: 0.05% spread, 0.03% slippage</li>
        </ul>
        <p className="sub">Slippage applies to market orders: entries, stop-losses, time limits and manual closes. Targets are limit orders and fill at the target price.</p>
      </section>
    </section>
  );
}
