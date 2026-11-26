import { useEffect, useMemo, useRef, useState } from "react";
import type { Tf } from "../engine/types";
import { analyze } from "../engine/analyze";
import { CATALOG, getCandles, getPicks, MARKETS, type AutoPick, type Instrument, type Market } from "../lib/api";
import { isFresh } from "./Picks";
import type { PaperPick } from "./PaperTicket";
import { applyFilters, FilterBar, nameOf, OppList, TF_LABEL, TFS, useFilters, type Filters, type Opp } from "./Opps";

type Common = { appKey: string; account: number; riskPct: number; onNeedKey: () => void; onOpen: (id: string, tf: Tf) => void; onReal: (p: AutoPick[]) => void; onPaper: (p: PaperPick[]) => void };
const ago = (ms: number) => { const m = Math.round(ms / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
const countBy = (list: Opp[], f: Filters) => Object.fromEntries((["All", ...MARKETS] as const).map((m) => [m, applyFilters(list, { ...f, market: m }).length]));

/** Every market and timeframe from the background scan, keeping only the strongest setups. */
export default function HighPerformers(p: Common) {
  const [opps, setOpps] = useState<Opp[]>([]);
  const [at, setAt] = useState(0);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [f, set] = useFilters("hpFilters", { min: 80 });
  const load = async () => {
    try {
      const j = await getPicks();
      const now = Date.now();
      setOpps(j.rows.filter((r) => r.setup && isFresh(r, now)).map((r) => ({ symbol: r.symbol, label: r.label, name: nameOf(r.symbol, r.market), market: r.market, tf: r.tf, price: r.price, setup: r.setup!, newsWarn: r.news_warn, checkedAt: Date.parse(r.scanned_at) })));
      setAt(j.rows.reduce((m, r) => Math.max(m, Date.parse(r.scanned_at)), 0)); setErr("");
    } catch (e) { setErr((e as Error).message); }
    setLoading(false);
  };
  useEffect(() => { load(); const t = setInterval(load, 120000); return () => clearInterval(t); }, []);
  const list = useMemo(() => applyFilters(opps, f), [opps, f]);
  const counts = useMemo(() => countBy(opps, f), [opps, f]);

  return (
    <section className="view hp">
      <header className="view-head">
        <div>
          <h2>High performers</h2>
          <p>The strongest setups across all {CATALOG.length} markets and 9 timeframes, ranked best first. Viko re-checks them every 15 minutes in the background{at ? `; last check ${ago(Date.now() - at)}` : ""}. Filter by category, timeframe and score, then trade one or tick several.</p>
        </div>
      </header>
      <FilterBar f={f} set={set} counts={counts} />
      <p className="picks-note">The score is how many book rules and indicator checks agree, not the chance of winning. "Ready" means the entry signal has fired, the price is still between the stop and target 1, and the reward is at least 1.5× the risk. "Approved" means it is also inside Viko's tested edge (daily-chart wave-3 buys in an uptrend in stocks, funds, indices or commodities), the only kind that made money in testing. The score alone did not predict wins.</p>
      {err && <p className="err">{err}</p>}
      {loading ? <p className="muted">Loading the latest scan…</p> : (
        <>
          <p className="scan-sum">{list.length} {list.length === 1 ? "market" : "markets"} at {f.min}%+{f.market !== "All" ? ` in ${f.market}` : ""}{f.tf !== "Any" ? ` on the ${TF_LABEL[f.tf]} chart` : ""}.</p>
          <OppList {...p} list={list} empty={<><h3>Nothing at {f.min}% or more with these filters</h3><p>Try a lower score, all timeframes, or untick "only ones ready to trade now". Clean setups are rare; Viko won't lower its bar on its own.</p></>} />
        </>
      )}
    </section>
  );
}

type Source = "watchlist" | Market | "all";
/** Live scan: reads fresh candles now, on the markets and timeframes you choose. */
export function LiveScan({ watchlist, ...p }: Common & { watchlist: Instrument[] }) {
  const [source, setSource] = useState<Source>("watchlist");
  const [tfs, setTfs] = useState<Tf[]>(["1h", "4h"]);
  const [f, set] = useFilters("scanFilters", { min: 70, readyOnly: false, bestPerMarket: true });
  const [opps, setOpps] = useState<Opp[]>([]);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);
  const [busy, setBusy] = useState(false);
  const stop = useRef(false);
  const markets = source === "watchlist" ? watchlist : source === "all" ? CATALOG : CATALOG.filter((c) => c.market === source);
  const jobs = markets.length * tfs.length;

  const run = async () => {
    stop.current = false; setBusy(true); setOpps([]); setDone(0); setFailed(0);
    const queue = markets.flatMap((m) => tfs.map((tf) => [m, tf] as const));
    const out: Opp[] = [];
    let i = 0, n = 0, bad = 0;
    const worker = async () => {
      while (i < queue.length && !stop.current) {
        const [m, tf] = queue[i++];
        try {
          const c = await getCandles(m.id, tf);
          const best = analyze(c, tf, undefined, m.id).best;
          if (best) out.push({ symbol: m.id, label: m.label, name: m.name, market: m.market, tf, price: c[c.length - 1].c, setup: best, checkedAt: Date.now() });
        } catch { bad++; }
        n++;
        if (n % 4 === 0 || n === queue.length) { setOpps([...out]); setDone(n); setFailed(bad); }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    setOpps([...out]); setDone(n); setFailed(bad); setBusy(false);
  };
  const list = useMemo(() => applyFilters(opps, f), [opps, f]);

  return (
    <section className="view">
      <header className="view-head">
        <div><h2>Scan</h2><p>Run the full rulebook right now on the markets and timeframes you choose, ranked from best to worst. For an instant view of everything, use High performers (it reads the background scan).</p></div>
      </header>
      <div className="card opp-filters">
        <div className="auto-field"><span className="auto-label">Markets to scan</span>
          <div className="seg wrap" role="radiogroup" aria-label="Markets to scan">
            {([["watchlist", `My watchlist (${watchlist.length})`], ...MARKETS.map((m) => [m, `${m} (${CATALOG.filter((c) => c.market === m).length})`]), ["all", `All ${CATALOG.length}`]] as [Source, string][]).map(([v, l]) => <button key={v} role="radio" aria-checked={source === v} className={source === v ? "on" : ""} onClick={() => setSource(v)} disabled={busy}>{l}</button>)}
          </div>
        </div>
        <div className="auto-field"><span className="auto-label">Timeframes (pick one or more)</span>
          <div className="seg wrap" role="group" aria-label="Timeframes">{TFS.map((t) => { const on = tfs.includes(t); return <button key={t} aria-pressed={on} className={on ? "on" : ""} disabled={busy} onClick={() => setTfs(on ? (tfs.length > 1 ? tfs.filter((x) => x !== t) : tfs) : TFS.filter((x) => x === t || tfs.includes(x)))}>{TF_LABEL[t]}</button>; })}</div>
        </div>
        <div className="scan-go">
          <span className="sub">{jobs} chart{jobs === 1 ? "" : "s"} to read{jobs > 150 ? `, about ${Math.ceil(jobs / 120)} min` : ""}.</span>
          {busy ? <button className="btn" onClick={() => { stop.current = true; }}>Stop ({done}/{jobs})</button> : <button className="btn primary" onClick={run} disabled={!jobs}>Scan now</button>}
        </div>
        {busy && <div className="scan-prog" aria-label="Progress"><i style={{ width: `${(done / Math.max(1, jobs)) * 100}%` }} /></div>}
      </div>
      {(opps.length > 0 || done > 0) && (
        <>
          <FilterBar f={f} set={set} showTf={tfs.length > 1} counts={countBy(opps, f)} />
          <p className="scan-sum">{busy ? `Reading charts… ${done} of ${jobs}. ` : `Done: ${done} charts read${failed ? `, ${failed} had no data` : ""}. `}{list.length} at {f.min}%+.</p>
          <OppList {...p} list={list} empty={<><h3>Nothing at {f.min}% or more yet</h3><p>{busy ? "Still scanning…" : "Try a lower score, more timeframes, or a bigger set of markets."}</p></>} />
        </>
      )}
    </section>
  );
}
