import { useEffect, useState } from "react";
import type { Candle, Tf } from "../engine/types";
import { fmt } from "../engine/analyze";
import { backtest, type BacktestResult } from "../engine/backtest";
import { costsFor, roundTripPct } from "../engine/costs";
import { getCandles, journal, type JournalRow } from "../lib/api";

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
      setRes(backtest(c, tf, { level, symbol }));
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const closed = res ? res.wins + res.losses : 0;
  // Average result after estimated fees and slippage, in units of risk.
  const cst = costsFor(symbol);
  const fin = res ? res.trades.filter((t) => t.result !== "open") : [];
  const netR = fin.length ? fin.reduce((a, t) => a + t.r - (roundTripPct(cst, t.result !== "win") * t.entry) / Math.abs(t.entry - t.stop), 0) / fin.length : null;
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
            <div><span className="mono big">{res.avgR === null ? "–" : `${res.avgR >= 0 ? "+" : ""}${res.avgR.toFixed(2)}R`}</span><span>average result per trade{netR !== null ? `; ${netR >= 0 ? "+" : ""}${netR.toFixed(2)}R after costs` : ""}</span></div>
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
      <p>A setup is approved only when: no rule marked "must pass" is broken; the entry trigger (a significant reversal bar, Wyckoff ch. 27) has fired; the reward to target 1 is at least 1.5× the risk; and it is inside Viko's <b>tested edge</b>. Anything less is "watch" or "no trade".</p>
      <h3>The tested edge (Nov 2026)</h3>
      <p>Viko's research lab replayed these rules candle by candle on 15 years of real prices: 43 markets (crypto, forex, gold and commodities, stock indices, large stocks) on 15-minute, 1-hour, 4-hour and daily charts, 7,689 setups, each managed exactly like a live trade (half at target 1, trailing stop, target 2, time limit) after fees and slippage. Overall the setups lost a little (−0.03R a trade), the rule score did not predict results, forex and short timeframes lost the most, and sell setups lost on every timeframe. One kind made money consistently, including on the most recent 30% of the data it was never tuned on: <b>daily-chart wave-3 buys with price above its 200-day average and a stop at least 2× the average daily range away, outside forex</b>. Over 419 such trades, 45% won and the average was +0.29R after costs (+0.26R on the recent data; 23 of 30 markets positive). That is a modest, real edge, not a guarantee: some years lost money. The lab re-runs regularly, and the rule will change if the evidence does.</p>
      <h3>What the score means</h3>
      <p>It means 80% of the rules agree, by weight. Neither Neely nor Villahermosa gives win-rate figures, so no honest tool can claim "80% chance of success" from these books alone. The Backtest tab measures the real hit rate of the approved setups on each market's history. Treat that number, not the dial, as your estimate of the odds, and only once it rests on 30 or more trades. In the 15-year test, higher scores did not win more often, which is why approval now depends on the tested edge.</p>
      <h3>The Elliott rules, as Neely wrote them</h3>
      <p>Every Neely rule in the checklist cites the page of <i>Mastering Elliott Wave</i> it comes from. Rules marked "must pass" void a setup outright:</p>
      <ul className="rules-list">
        <li>Essential Construction Rules (p. 5-2): wave 2 never retraces all of wave 1; wave 3 is longer than wave 2; wave 4 never retraces all of wave 3; wave 5 is at least 38.2% of wave 4; wave 3 is never the shortest.</li>
        <li>Similarity &amp; Balance (p. 4-3): neighbouring waves must relate by at least a third in price or time, or they are not the same degree.</li>
        <li>Rule of Alternation (p. 5-5): waves 2 and 4 must differ in price, time or severity.</li>
        <li>Extension Rule (p. 5-4): in a finished impulse one wave is at least 161.8% of the next longest.</li>
        <li>Overlap Rule (p. 5-8): in a trending impulse wave 4 stays out of wave 2's zone; overlap means a terminal impulse.</li>
        <li>Channeling (p. 5-9 to 5-10): a break of the 0-2 line inside wave 2's zone means wave 2 isn't over; a break of the 2-4 line before a new high means wave 4 isn't over.</li>
        <li>Zigzags and flats (p. 5-17 to 5-21): a zigzag's wave a retraces at most 61.8% of the prior impulse, b at most 61.8% of a, and c goes beyond a; a flat's b retraces at least 61.8% of a and c is at least 38.2% of a. Flats are named by b's strength (61.8–80%, 81–100%, over 100%).</li>
        <li>Post-pattern confirmation (p. 6-1 to 6-3): an impulse is confirmed when the 2-4 line breaks in no more time than wave 5 took; a zigzag or flat when the 0-B line breaks in no more time than wave c took.</li>
        <li>Targets follow the Rule of Equality and Neely's Fibonacci notes (p. 5-8, 5-11, 5-12) and the Stage 2 retracement requirements (p. 6-2).</li>
      </ul>
      <h3>How a running trade is managed</h3>
      <p>Every 5 minutes for real-money and demo trades (every 15-minute candle for paper trades), on every broker, Viko records the best price the trade has reached and moves the stop-loss only in the trade's favour:</p>
      <ul>
        <li>Halfway to target 1: the stop moves halfway between the original stop and the entry, so the risk is cut in half.</li>
        <li>80% of the way to target 1: the stop moves to the entry price, so the trade can no longer lose.</li>
        <li>Target 1: half the position is taken as profit, and the stop locks in half of the best gain so far, rising as the price does.</li>
        <li>60% of the way to target 2: the stop is at least at target 1.</li>
        <li>The stop always stays at least a quarter of the entry-to-target-1 distance away from the price, so ordinary swings don't knock the trade out. It never moves backwards.</li>
        <li>Binance, Bybit and MT5 hold the stop on the broker itself. Deriv's stop can only be a loss amount, so once the stop is past the entry Viko closes the Deriv contract itself if the price falls back to it.</li>
      </ul>
      <p>This applies to Auto-trade, every Real money button and paper trades. Orders placed by hand on the Binance tab are not managed.</p>
      <h3>Where Viko simplifies the book</h3>
      <p>Neely builds counts from monowaves plotted on cash data, then compacts them into larger patterns with Structure labels (chapters 3, 7 and 8). Viko finds monowaves with a volatility-scaled swing filter at three sizes and tests standard patterns only. It doesn't yet count complex corrections (double and triple threes), triangles or the advanced logic of chapters 9 to 12. When a market is in one of those, Viko says "no trade" rather than guess.</p>
      <h3>Wyckoff</h3>
      <p>Wyckoff rules (phases A–E, climaxes, springs and upthrusts, tests, effort and result, significant bars, entries and stops) come from Rubén Villahermosa, <i>The Wyckoff Methodology in Depth</i>, and cite the chapter on each line of the checklist.</p>
      <h3>Indicators (safety filter)</h3>
      <p>EMA 20/50/200, RSI, MACD, ATR and Bollinger Bands come from neither book, so they never create a trade on their own. They act as a safety filter on top of the book rules:</p>
      <ul>
        <li>Six checks: price on the trade's side of the 200 EMA (counts double), 20 EMA leading the 50 EMA, RSI between 45 and 72 (momentum without being stretched), MACD momentum agreeing, the stop at least ¾ ATR away (outside normal noise), and price not beyond the outer Bollinger band (not chasing).</li>
        <li>Together they are about a quarter of the score, so a setup the indicators dislike scores lower.</li>
        <li>Veto: if more than half of them disagree, the setup can't be approved, however well the waves and Wyckoff line up. It stays "Get ready" until they turn.</li>
      </ul>
    </section>
  );
}
