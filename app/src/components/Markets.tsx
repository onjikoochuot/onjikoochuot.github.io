import { useMemo, useState } from "react";
import { fmt } from "../engine/analyze";
import { CATALOG, MARKETS, type Instrument, type Market } from "../lib/api";
import { useQuotes } from "../lib/live";

export default function Markets({ list, onOpen, onToggle }: { list: Instrument[]; onOpen: (i: Instrument) => void; onToggle: (i: Instrument) => void }) {
  const [m, setM] = useState<Market | "Watchlist">("Watchlist");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const base = m === "Watchlist" ? list : [...CATALOG, ...list.filter((x) => !CATALOG.some((c) => c.id === x.id))].filter((x) => x.market === m);
    const s = q.trim().toLowerCase();
    return s ? base.filter((x) => x.label.toLowerCase().includes(s) || x.name.toLowerCase().includes(s)) : base;
  }, [m, q, list]);
  const quotes = useQuotes(useMemo(() => rows.map((r) => r.id), [rows]));
  const starred = new Set(list.map((x) => x.id));
  return (
    <section className="view">
      <header className="view-head">
        <div><h2>Markets</h2><p>{CATALOG.length} markets with live prices: crypto streams tick by tick, everything else refreshes every 30 seconds. Star a market to add it to your watchlist, scanner and autopilot.</p></div>
      </header>
      <div className="mk-filters">
        <div className="chips" role="tablist">
          {(["Watchlist", ...MARKETS] as const).map((x) => <button key={x} role="tab" aria-selected={m === x} className={`chip ${m === x ? "on" : ""}`} onClick={() => setM(x)}>{x}</button>)}
        </div>
        <input className="mk-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" aria-label="Filter markets" />
      </div>
      <ul className="mk-list">
        {rows.map((r) => {
          const qt = quotes[r.id];
          return (
            <li key={r.id}>
              <button className="mk-main" onClick={() => onOpen(r)}>
                <span className="mk-name"><b>{r.label}</b><span>{r.name}</span></span>
                <span className="mk-px mono">{qt ? fmt(qt.price) : "…"}</span>
                <span className={`mk-ch mono ${qt ? (qt.change >= 0 ? "bull" : "bear") : ""}`}>{qt ? `${qt.change >= 0 ? "+" : ""}${qt.change.toFixed(2)}%` : ""}</span>
              </button>
              <button className={`star ${starred.has(r.id) ? "on" : ""}`} aria-pressed={starred.has(r.id)} aria-label={`${starred.has(r.id) ? "Remove" : "Add"} ${r.label} ${starred.has(r.id) ? "from" : "to"} watchlist`} onClick={() => onToggle(r)}>{starred.has(r.id) ? "★" : "☆"}</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
