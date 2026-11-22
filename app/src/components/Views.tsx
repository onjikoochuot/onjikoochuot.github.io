import { useEffect, useState } from "react";
import type { Candle, Setup, Tf } from "../engine/types";
import { analyze, fmt } from "../engine/analyze";
import { backtest, type BacktestResult } from "../engine/backtest";
import { getCandles, journal, type Instrument, type JournalRow } from "../lib/api";

type Row = { inst: Instrument; best: Setup | null; last: number; err?: string };

export function Scanner({ list, tf, onOpen }: { list: Instrument[]; tf: Tf; onOpen: (i: Instrument) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setRows([]);
    const out: Row[] = [];
    let idx = 0;
    const worker = async () => {
      while (idx < list.length) {
        const inst = list[idx++];
        try {
          const c = await getCandles(inst.id, tf);
          const a = analyze(c, tf);
          out.push({ inst, best: a.best, last: a.last.c });
        } catch (e) { out.push({ inst, best: null, last: NaN, err: (e as Error).message }); }
        setRows([...out]);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setBusy(false);
  };
  const order = { APPROVED: 0, WATCH: 1, "NO TRADE": 2 } as const;
  const sorted = [...rows].sort((a, b) => (a.best ? order[a.best.verdict] : 3) - (b.best ? order[b.best.verdict] : 3) || (b.best?.score ?? 0) - (a.best?.score ?? 0));
  const approved = rows.filter((r) => r.best?.verdict === "APPROVED").length;
  return (
    <section className="view">
      <header className="view-head">
        <div><h2>Scan the watchlist</h2><p>Runs the full rulebook on {list.length} markets on the {tf} timeframe and ranks them. Only setups at 80% or more with a fired trigger are approved.</p></div>
        <button className="btn primary" onClick={run} disabled={busy}>{busy ? `Scanning ${rows.length}/${list.length}` : "Scan now"}</button>
      </header>
      {rows.length > 0 && <p className="scan-sum">{approved ? `${approved} approved setup${approved > 1 ? "s" : ""}.` : busy ? "Reading charts…" : "Nothing passes the 80% bar right now. That is the gate doing its job: no trade is a position."}</p>}
      <table className="tbl">
        <thead><tr><th>Market</th><th>Verdict</th><th>Setup</th><th className="r">Confluence</th><th className="r">Reward:risk</th><th className="r">Last</th></tr></thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.inst.id} onClick={() => onOpen(r.inst)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen(r.inst)}>
              <td><b>{r.inst.label}</b><span className="sub">{r.inst.name}</span></td>
              <td>{r.err ? <span className="tag no">Data error</span> : r.best ? <span className={`tag ${r.best.verdict === "APPROVED" ? "ok" : r.best.verdict === "WATCH" ? "watch" : "no"}`}>{r.best.verdict === "APPROVED" ? (r.best.dir === "long" ? "Buy" : "Sell") : r.best.verdict === "WATCH" ? "Watch" : "No trade"}</span> : <span className="tag no">No count</span>}</td>
              <td>{r.err ? <span className="sub">{r.err}</span> : r.best ? `${r.best.dir === "long" ? "Long" : "Short"}: ${r.best.name}` : "–"}</td>
              <td className="r mono">{r.best ? `${r.best.score}%` : "–"}</td>
              <td className="r mono">{r.best ? r.best.rr1.toFixed(1) : "–"}</td>
              <td className="r mono">{fmt(r.last)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function Backtest({ symbol, label, tf }: { symbol: string; label: string; tf: Tf }) {
  const [res, setRes] = useState<BacktestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState<"APPROVED" | "WATCH+">("APPROVED");
  const [err, setErr] = useState("");
  const [candles, setCandles] = useState<Candle[] | null>(null);
  useEffect(() => { setRes(null); setCandles(null); }, [symbol, tf]);
  const run = async () => {
    setBusy(true); setErr("");
    try {
      const c = candles ?? (await getCandles(symbol, tf));
      setCandles(c);
      await new Promise((r) => setTimeout(r, 30));
      setRes(backtest(c, tf, { level }));
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const closed = res ? res.wins + res.losses : 0;
  return (
    <section className="view">
      <header className="view-head">
        <div><h2>How has the rulebook done on {label}?</h2><p>Replays the engine candle by candle over the history on {tf}, seeing only the past each time. A trade wins if target 1 is hit before the stop.</p></div>
        <div className="row">
          <div className="seg" role="radiogroup" aria-label="Which signals to test">
            {(["APPROVED", "WATCH+"] as const).map((l) => <button key={l} role="radio" aria-checked={level === l} className={level === l ? "on" : ""} onClick={() => { setLevel(l); setRes(null); }}>{l === "APPROVED" ? "Approved only" : "Approved and watch"}</button>)}
          </div>
          <button className="btn primary" onClick={run} disabled={busy}>{busy ? "Replaying…" : "Run backtest"}</button>
        </div>
      </header>
      {err && <p className="err">{err}</p>}
      {res && (
        <>
          <div className="stats">
            <div><span className="mono big">{res.winRate === null ? "–" : `${Math.round(res.winRate * 100)}%`}</span><span>hit target 1 first</span></div>
            <div><span className="mono big">{closed}</span><span>closed trades</span></div>
            <div><span className="mono big">{res.avgR === null ? "–" : `${res.avgR >= 0 ? "+" : ""}${res.avgR.toFixed(2)}R`}</span><span>average result per trade</span></div>
            <div><span className="mono big">{res.barsTested}</span><span>candles replayed</span></div>
          </div>
          <p className="ctx-note">{closed < 30 ? `Only ${closed} closed trades: too few to trust the percentage. Try "Approved and watch", a lower timeframe, or other markets.` : "A sample of 30 or more trades starts to mean something. Past results don't guarantee future ones."}</p>
          {res.trades.length > 0 && (
            <table className="tbl compact">
              <thead><tr><th>Date</th><th>Side</th><th>Setup</th><th className="r">Score</th><th className="r">Entry</th><th className="r">Result</th></tr></thead>
              <tbody>{[...res.trades].reverse().map((t) => (
                <tr key={t.i}><td className="mono">{new Date(t.t * 1000).toISOString().slice(0, 10)}</td><td>{t.dir === "long" ? "Long" : "Short"}</td><td>{t.name}</td><td className="r mono">{t.score}%</td><td className="r mono">{fmt(t.entry)}</td>
                  <td className={`r mono ${t.result === "win" ? "bull" : t.result === "loss" ? "bear" : ""}`}>{t.result === "open" ? "open" : `${t.r >= 0 ? "+" : ""}${t.r.toFixed(2)}R`}</td></tr>
              ))}</tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

export function Journal({ keyValue, onNeedKey }: { keyValue: string; onNeedKey: () => void }) {
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!keyValue) return;
    journal.list(keyValue).then(setRows).catch((e) => setErr(e.message));
  }, [keyValue]);
  if (!keyValue) return (
    <section className="view empty"><h2>Your trade journal</h2><p>Saved setups are stored in your Supabase database. Add your journal key in Settings to open it.</p><button className="btn primary" onClick={onNeedKey}>Open settings</button></section>
  );
  const mark = async (id: string, outcome: string) => {
    try { const r = await journal.update(keyValue, id, { outcome }); setRows(rows.map((x) => (x.id === id ? r : x))); } catch (e) { setErr((e as Error).message); }
  };
  const closed = rows.filter((r) => r.outcome === "win" || r.outcome === "loss");
  const wins = closed.filter((r) => r.outcome === "win").length;
  return (
    <section className="view">
      <header className="view-head"><div><h2>Your trade journal</h2><p>{rows.length} saved setups. {closed.length ? `Your own record: ${wins} of ${closed.length} closed trades won.` : "Mark trades as won or lost to build your own track record."}</p></div></header>
      {err && <p className="err">{err}</p>}
      <table className="tbl">
        <thead><tr><th>Saved</th><th>Market</th><th>Setup</th><th className="r">Score</th><th className="r">Entry / stop / T1</th><th>Outcome</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>
            <td className="mono">{r.created_at.slice(0, 16).replace("T", " ")}</td>
            <td><b>{r.symbol.split(":")[1]}</b><span className="sub">{r.timeframe}, {r.direction}</span></td>
            <td>{r.setup}<span className="sub">{r.verdict.toLowerCase()}</span></td>
            <td className="r mono">{r.score}%</td>
            <td className="r mono">{fmt(r.entry)} / {fmt(r.stop)} / {fmt(r.target1)}</td>
            <td><select value={r.outcome} onChange={(e) => mark(r.id, e.target.value)} aria-label="Outcome">
              {["open", "win", "loss", "skipped"].map((o) => <option key={o} value={o}>{o}</option>)}
            </select></td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  );
}

export function Rulebook() {
  return (
    <section className="view prose">
      <h2>How the verdict is reached</h2>
      <p>Every chart goes through the same three stages. First, price is broken into monowaves at three degrees of trend (minor, intermediate, primary). Then each degree is tested against four Elliott setups, in both directions: the start of wave 3, the start of wave 5, a finished a-b-c correction inside a trend, and a finished five-wave impulse confirmed by a 2-4 trendline break. Finally every candidate is scored against the books.</p>
      <h3>The gate</h3>
      <p>A setup is approved only when all four of these hold: no rule marked "must pass" is broken; at least 80% of the weighted book rules agree; the entry trigger (a significant reversal bar, Wyckoff ch. 27) has fired; and the reward to target 1 is at least twice the risk. Anything less is "watch" or "no trade".</p>
      <h3>What the 80% means</h3>
      <p>It means 80% of the rules agree, by weight. Neither Neely nor Villahermosa gives win-rate figures, so no honest tool can claim "80% chance of success" from these books alone. The Backtest tab measures the real hit rate of the approved setups on each market's history. Treat that number, not the dial, as your estimate of the odds, and only once it rests on 30 or more trades.</p>
      <h3>Sources</h3>
      <p>Wyckoff rules (phases A–E, climaxes, springs and upthrusts, tests, effort and result, significant bars, entries and stops) are taken from Rubén Villahermosa, <i>The Wyckoff Methodology in Depth</i>, and cite the chapter on each line of the checklist. Elliott rules follow Glenn Neely, <i>Mastering Elliott Wave</i>: the Essential Construction Rules for impulses, the Rules of Extension, Overlap, Alternation and Similarity & Balance, the zigzag/flat distinction at a 61.8% wave-b retracement, and the Stage-1 post-pattern confirmation.</p>
      <p className="fine">The project copy of Neely's book is a scanned PDF with no text layer, so the Neely rules were encoded from the published method rather than checked page by page against your copy. Send a text-searchable copy and they can be verified line by line.</p>
      <h3>Supplementary indicators</h3>
      <p>EMA 20/50/200, RSI, MACD, Bollinger Bands and ATR are displayed for reference. They don't affect the verdict, because they come from neither book.</p>
    </section>
  );
}
