import { HistoryBar, useSelection } from "./HistoryTools";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fmt } from "../engine/analyze";
import { paper, type PaperState, type PaperTrade } from "../lib/api";
import { useQuotes } from "../lib/live";

const money = (x: number) => `${x < -0.004 ? "−" : ""}$${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TFS = ["5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w", "1M"];

function unrealized(t: PaperTrade, price: number) {
  return (t.dir === "long" ? price - t.entry : t.entry - price) * t.qty_open;
}

export default function Paper({ appKey, onNeedKey, watchlist, onOpenMarket }: { appKey: string; onNeedKey: () => void; watchlist: { id: string; label: string }[]; onOpenMarket: (id: string) => void }) {
  const [st, setSt] = useState<PaperState | null>(null);
  const hs = useSelection();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<"open" | "history" | "activity">("open");

  const load = useCallback(async () => {
    if (!appKey) return;
    try { setSt(await paper.state(appKey)); setErr(""); } catch (e) { setErr((e as Error).message); }
  }, [appKey]);

  useEffect(() => {
    if (!appKey) return;
    // Sync the server with live prices when the page opens, then refresh every 20 s.
    paper.tick(appKey).catch(() => {}).finally(load);
    const id = window.setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [appKey, load]);

  const live = useQuotes(useMemo(() => [...new Set((st?.open ?? []).map((t) => t.symbol))], [st?.open]));

  if (!appKey) return (
    <section className="view empty">
      <h2>Paper trading</h2>
      <p>Practise with $10,000 of pretend money. Viko places trades from its tips, follows live prices, and closes them at the stop or targets, even when the app is closed. Add your app key in Settings to start.</p>
      <button className="btn primary" onClick={onNeedKey}>Open settings</button>
    </section>
  );
  if (!st) return <section className="view"><h2>Paper trading</h2><p className="ctx-note">{err || "Loading your paper account…"}</p></section>;

  const acc = st.account;
  const openPnl = st.open.reduce((s, t) => s + unrealized(t, live[t.symbol]?.price ?? t.last_price ?? t.entry) + 0, 0);
  const equity = Number(acc.balance) + openPnl;
  const rawRet = (equity / Number(acc.starting_balance) - 1) * 100;
  const ret = Math.abs(rawRet) < 0.005 ? 0 : rawRet;
  const closed = st.closed;
  const wins = closed.filter((t) => Number(t.realized) > 0).length;
  const total = closed.reduce((s, t) => s + Number(t.realized), 0);

  const set = async (b: Record<string, unknown>, label: string) => {
    setBusy(label);
    try { await paper.settings(appKey, b); await load(); } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };
  const close = async (id: string) => {
    setBusy(id);
    try { await paper.close(appKey, id); await load(); } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };
  const syncWatch = () => set({ watchlist }, "watch");
  const runNow = async () => { setBusy("run"); try { await paper.tick(appKey, true); await load(); } catch (e) { setErr((e as Error).message); } setBusy(""); };

  return (
    <section className="view paper">
      <header className="view-head">
        <div><h2>Paper trading</h2><p>Pretend money, real live prices. The stop-loss trails each hour's best price exactly like real trades (risk halved, then break-even, then profit locked), and half of each trade closes at target 1.</p></div>
      </header>
      {err && <p className="err">{err}</p>}

      <div className="stats">
        <div><span className="mono big">{money(equity)}</span><span>account value</span></div>
        <div><span className={`mono big ${ret >= 0 ? "bull" : "bear"}`}>{ret >= 0 ? "+" : ""}{ret.toFixed(2)}%</span><span>since start ({money(Number(acc.starting_balance))})</span></div>
        <div><span className={`mono big ${openPnl >= 0 ? "bull" : "bear"}`}>{money(openPnl)}</span><span>open profit/loss, live</span></div>
        <div><span className="mono big">{closed.length ? `${wins}/${closed.length}` : "–"}</span><span>winning trades{closed.length ? `, ${money(total)} total` : ""}</span></div>
      </div>

      <div className="autopilot card">
        <div className="ap-row">
          <div>
            <h3>Autopilot</h3>
            <p className="ctx-note">Every 15 minutes Viko scans your {acc.watchlist.length} watchlist markets and opens a paper trade {acc.auto_level === "practice" ? "for approved setups and for clean practice setups (65% or more of the rules, trigger fired, reward at least 2× the risk)" : "only when a setup is approved (80% or more)"}. It stays out of trades when big news (like US inflation or a rate decision) is due within 2 hours. It runs on the server, so your phone can be off.{acc.last_scan ? ` Last scan ${new Date(acc.last_scan).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : ""}</p>
          </div>
          <button role="switch" aria-checked={acc.autopilot} className={`switch ${acc.autopilot ? "on" : ""}`} onClick={() => set({ autopilot: !acc.autopilot }, "ap")} disabled={busy === "ap"}><span /></button>
        </div>
        <div className="ap-row wrap">
          <div className="seg" role="radiogroup" aria-label="Which setups the autopilot trades">
            {(["practice", "approved"] as const).map((l) => <button key={l} role="radio" aria-checked={acc.auto_level === l} className={acc.auto_level === l ? "on" : ""} onClick={() => set({ auto_level: l }, "lvl")}>{l === "practice" ? "Practice (65%+)" : "Strict (80%+)"}</button>)}
          </div>
          <div className="seg" role="group" aria-label="Timeframes the autopilot scans">
            {TFS.map((t) => { const on = acc.auto_tfs.includes(t); return <button key={t} aria-pressed={on} className={on ? "on" : ""} onClick={() => set({ auto_tfs: on ? acc.auto_tfs.filter((x) => x !== t) : [...acc.auto_tfs, t] }, "tf")}>{t}</button>; })}
          </div>
          <label className="inline">Risk per trade
            <select value={acc.risk_pct} onChange={(e) => set({ risk_pct: Number(e.target.value) }, "risk")}>{[0.5, 1, 1.5, 2].map((r) => <option key={r} value={r}>{r}%</option>)}</select>
          </label>
          <button className="btn ghost" onClick={syncWatch} disabled={busy === "watch"}>{busy === "watch" ? "Syncing…" : "Use my current watchlist"}</button>
          <button className="btn ghost" onClick={runNow} disabled={busy === "run"}>{busy === "run" ? "Scanning…" : "Scan now"}</button>
        </div>
      </div>

      <div className="seg tabs-seg" role="tablist">
        {(["open", "history", "activity"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "open" ? `Open (${st.open.length})` : t === "history" ? `History (${closed.length})` : "Activity"}</button>)}
      </div>

      {tab === "open" && (st.open.length === 0
        ? <p className="ctx-note empty-line">No open paper trades. Approved setups will appear here automatically, or tap "Paper trade this" on any tip.</p>
        : <ul className="positions">{st.open.map((t) => {
          const price = live[t.symbol]?.price ?? t.last_price ?? t.entry;
          const pnl = unrealized(t, price) + Number(t.realized);
          const long = t.dir === "long";
          // Bar runs from the original stop (left, red) to target 2 (right, green) for buys and sells alike.
          const span = (t.target2 - t.initial_stop) || 1;
          const pos = Math.min(100, Math.max(0, ((price - t.initial_stop) / span) * 100));
          const entryPos = Math.min(100, Math.max(0, ((t.entry - t.initial_stop) / span) * 100));
          return (
            <li key={t.id} className="pos">
              <div className="pos-top">
                <button className="link pos-name" onClick={() => onOpenMarket(t.symbol)}><b>{t.label}</b> <span className={`tag ${long ? "ok" : "no"}`}>{long ? "Buy" : "Sell"}</span>{t.source === "auto" && <span className="tag watch">Autopilot</span>}</button>
                <span className={`mono pnl ${pnl >= 0 ? "bull" : "bear"}`}>{money(pnl)}</span>
              </div>
              <div className="track" aria-label="Price between stop and target 2">
                <span className="tr-entry" style={{ left: `${entryPos}%` }} />
                <span className="tr-now" style={{ left: `${pos}%` }} />
              </div>
              <dl className="pos-grid mono">
                <div><dt>Entry</dt><dd>{fmt(t.entry)}</dd></div>
                <div><dt>Now</dt><dd>{fmt(price)}</dd></div>
                <div><dt>Stop{t.t1_hit ? " (moved)" : ""}</dt><dd className="bear">{fmt(t.stop)}</dd></div>
                <div><dt>{t.t1_hit ? "Target 2" : "Target 1"}</dt><dd className="bull">{fmt(t.t1_hit ? t.target2 : t.target1)}</dd></div>
              </dl>
              <p className="pos-meta">{t.setup} on {t.tf}, opened {new Date(t.opened_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}{t.t1_hit ? ". Half already banked at target 1." : "."}{t.close_by ? ` Closes by ${new Date(t.close_by).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })} at the latest.` : ""}</p>
              {t.tip && <details className="pos-tip"><summary>The tip behind this trade</summary><p>{t.tip}</p></details>}
              <button className="btn ghost" onClick={() => close(t.id)} disabled={busy === t.id}>{busy === t.id ? "Closing…" : "Close at market price"}</button>
            </li>
          );
        })}</ul>)}

      {tab === "history" && (closed.length === 0
        ? <p className="ctx-note empty-line">Closed trades will show here with their result.</p>
        : <>
        <HistoryBar count={closed.length} selected={[...hs.sel]} allSelected={hs.sel.size === closed.length} onSelectAll={(on) => hs.setAll(closed.map((t) => t.id), on)}
          onDelete={async (b) => { await paper.deleteHistory(appKey, b); hs.clear(); await load(); }} />
        <table className="tbl compact hist-tbl">
          <thead><tr><th aria-label="Select" /><th>Closed</th><th>Market</th><th>Side</th><th className="r">Entry → exit</th><th>Why</th><th className="r">Result</th><th aria-label="Delete" /></tr></thead>
          <tbody>{closed.map((t) => (
            <tr key={t.id} className={hs.has(t.id) ? "picked" : ""}><td><input type="checkbox" checked={hs.has(t.id)} onChange={() => hs.toggle(t.id)} aria-label={`Select ${t.label}`} /></td><td className="mono">{t.closed_at?.slice(5, 16).replace("T", " ")}</td><td><b>{t.label}</b><span className="sub">{t.tf}{t.source === "auto" ? ", autopilot" : ""}</span></td><td>{t.dir === "long" ? "Buy" : "Sell"}</td>
              <td className="r mono">{fmt(t.entry)} → {fmt(t.exit_price ?? 0)}</td><td>{t.close_reason === "target2" ? "Target 2" : t.close_reason === "stop" ? (t.t1_hit ? "Stop at entry" : "Stop-loss") : t.close_reason === "manual" ? "You closed it" : t.close_reason === "time" ? "Time limit" : t.close_reason === "trailing" ? "Trailing stop (profit locked)" : t.close_reason}</td>
              <td className={`r mono ${Number(t.realized) >= 0 ? "bull" : "bear"}`}>{money(Number(t.realized))}</td>
              <td><button className="link" onClick={async () => { await paper.deleteHistory(appKey, { ids: [t.id] }); await load(); }}>Delete</button></td></tr>
          ))}</tbody>
        </table></>)}

      {tab === "activity" && <ul className="feed">{st.events.map((e) => <li key={e.id}><span className="mono">{new Date(e.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>{e.message}</li>)}</ul>}

      <details className="danger">
        <summary>Start over</summary>
        <p className="ctx-note">Deletes every paper trade and resets the account.</p>
        <div className="row">{[1000, 10000, 100000].map((b) => <button key={b} className="btn ghost" onClick={() => set({ reset: { starting_balance: b } }, "reset")}>Reset to {money(b)}</button>)}</div>
      </details>
    </section>
  );
}
