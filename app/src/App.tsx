import { useEffect, useMemo, useRef, useState } from "react";
import type { Analysis, Candle, Tf } from "./engine/types";
import { analyze, fmt } from "./engine/analyze";
import { DEFAULT_WATCHLIST, getCandles, HTF, journal, save, searchSymbols, store, type Instrument, type Market } from "./lib/api";
import Chart from "./components/Chart";
import { ContextCards, Ledger, VerdictPanel } from "./components/Panels";
import { Backtest, Journal, Rulebook, Scanner } from "./components/Views";

const TFS: Tf[] = ["1h", "4h", "1d", "1w"];
const TF_LABEL: Record<Tf, string> = { "1h": "1 hour", "4h": "4 hours", "1d": "Daily", "1w": "Weekly" };
const VIEWS = ["analyse", "scan", "backtest", "journal", "rules"] as const;
type View = typeof VIEWS[number];
const VIEW_LABEL: Record<View, string> = { analyse: "Analyse", scan: "Scan", backtest: "Backtest", journal: "Journal", rules: "How it decides" };
const MARKETS: Market[] = ["Crypto", "Stocks", "Forex", "Commodities"];

const viewFromHash = (): View => { const h = location.hash.slice(1) as View; return VIEWS.includes(h) ? h : "analyse"; };

export default function App() {
  const [view, setView] = useState<View>(viewFromHash);
  const [list, setList] = useState<Instrument[]>(() => store("watchlist", DEFAULT_WATCHLIST));
  const [inst, setInst] = useState<Instrument>(() => store("inst", DEFAULT_WATCHLIST[0]));
  const [tf, setTf] = useState<Tf>(() => store("tf", "1d"));
  const [candles, setCandles] = useState<Candle[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [showEma, setShowEma] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [account, setAccount] = useState<number>(() => store("account", 1000));
  const [riskPct, setRiskPct] = useState<number>(() => store("risk", 1));
  const [jkey, setJkey] = useState<string>(() => store("jkey", ""));
  const [saving, setSaving] = useState("");

  useEffect(() => { const f = () => setView(viewFromHash()); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  useEffect(() => save("watchlist", list), [list]);
  useEffect(() => { save("inst", inst); save("tf", tf); }, [inst, tf]);
  useEffect(() => { save("account", account); save("risk", riskPct); save("jkey", jkey); }, [account, riskPct, jkey]);

  const load = async () => {
    setLoading(true); setErr(""); setPick(null); setSaving("");
    try {
      const c = await getCandles(inst.id, tf);
      const h = HTF[tf];
      const hc = h ? await getCandles(inst.id, h).catch(() => undefined) : undefined;
      setCandles(c);
      setAnalysis(analyze(c, tf, hc));
    } catch (e) { setErr((e as Error).message); setAnalysis(null); setCandles([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [inst.id, tf]); // eslint-disable-line react-hooks/exhaustive-deps

  const setup = useMemo(() => (analysis ? analysis.setups.find((s) => s.id === pick) ?? analysis.best : null), [analysis, pick]);
  const go = (v: View) => { location.hash = v; setView(v); };
  const open = (i: Instrument) => { setInst(i); go("analyse"); };

  const saveSignal = async () => {
    if (!setup || !analysis) return;
    if (!jkey) { setSettingsOpen(true); return; }
    setSaving("Saving…");
    try {
      await journal.add(jkey, { symbol: inst.id, timeframe: tf, direction: setup.dir, verdict: setup.verdict, score: setup.score, entry: setup.entry, stop: setup.stop, target1: setup.target1, target2: setup.target2, rr: Number(setup.rr1.toFixed(2)), setup: `${setup.name} (${setup.degree})`, payload: { checks: setup.checks, labels: setup.labels, wyckoff: analysis.wyckoff } });
      setSaving("Saved");
    } catch (e) { setSaving(""); setErr((e as Error).message); }
  };

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#analyse" onClick={() => go("analyse")} aria-label="Viko home">
          <svg viewBox="0 0 40 20" aria-hidden="true"><path d="M1 15 L8 5 L13 11 L22 2 L27 9 L32 6 L39 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
          <span>Viko</span>
        </a>
        <nav className="tabs" aria-label="Sections">
          {VIEWS.map((v) => <a key={v} href={`#${v}`} className={view === v ? "on" : ""} aria-current={view === v ? "page" : undefined} onClick={() => setView(v)}>{VIEW_LABEL[v]}</a>)}
        </nav>
        <button className="btn ghost" onClick={() => setSettingsOpen(true)}>Settings</button>
      </header>

      <div className="body">
        <aside className="rail" aria-label="Watchlist">
          <SymbolSearch onPick={(i) => { if (!list.some((x) => x.id === i.id)) setList([...list, i]); open(i); }} />
          <div className="rail-list">
          {MARKETS.map((m) => {
            const items = list.filter((x) => x.market === m);
            if (!items.length) return null;
            return (
              <div key={m} className="rail-group">
                <h4>{m}</h4>
                <ul>{items.map((i) => (
                  <li key={i.id}><button className={i.id === inst.id ? "on" : ""} onClick={() => open(i)} aria-current={i.id === inst.id}>
                    <b>{i.label}</b><span>{i.name}</span>
                  </button></li>
                ))}</ul>
              </div>
            );
          })}
          </div>
        </aside>

        <main className="main">
          {view === "analyse" && (
            <>
              <div className="toolbar">
                <h1>{inst.label}<span>{inst.name}</span></h1>
                <div className="seg" role="radiogroup" aria-label="Timeframe">
                  {TFS.map((t) => <button key={t} role="radio" aria-checked={tf === t} className={tf === t ? "on" : ""} onClick={() => setTf(t)}>{t}</button>)}
                </div>
                <label className="chk"><input type="checkbox" checked={showEma} onChange={(e) => setShowEma(e.target.checked)} /> EMA 50/200</label>
                <button className="btn ghost" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
              </div>
              {err && <p className="err">{err}</p>}
              <div className="analyse">
                <div className="chart-wrap">
                  {candles.length > 0 ? <Chart candles={candles} analysis={analysis} setup={setup} showEma={showEma} /> : <div className="chart placeholder">{loading ? "Fetching candles…" : "No data"}</div>}
                  <p className="legend"><span className="lg-wave">Wave count</span><span className="lg-wy">Wyckoff events</span><span className="lg-lv">Entry, stop and targets</span>{analysis && <span className="mono">Last close {fmt(analysis.last.c)}, {new Date(analysis.last.t * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</span>}</p>
                </div>
                {analysis && <VerdictPanel symbol={inst.label} tfLabel={TF_LABEL[tf]} analysis={analysis} setup={setup} onPick={setPick} account={account} riskPct={riskPct} onSave={saveSignal} saving={saving} />}
              </div>
              {analysis && <ContextCards analysis={analysis} />}
              {setup && <Ledger setup={setup} />}
            </>
          )}
          {view === "scan" && <Scanner list={list} tf={tf} onOpen={open} />}
          {view === "backtest" && <Backtest symbol={inst.id} label={inst.label} tf={tf} />}
          {view === "journal" && <Journal keyValue={jkey} onNeedKey={() => setSettingsOpen(true)} />}
          {view === "rules" && <Rulebook />}
        </main>
      </div>

      {settingsOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="set-h" onKeyDown={(e) => e.key === "Escape" && setSettingsOpen(false)}>
          <div className="sheet">
            <h2 id="set-h">Settings</h2>
            <label>Account size<input type="number" min={0} value={account} onChange={(e) => setAccount(Number(e.target.value))} /></label>
            <label>Risk per trade, %<input type="number" min={0.1} max={5} step={0.1} value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} /><small>Villahermosa recommends no more than 1% (ch. 27).</small></label>
            <label>Journal key<input type="password" value={jkey} onChange={(e) => setJkey(e.target.value.trim())} autoComplete="off" /><small>Unlocks your saved setups in Supabase. Stored only in this browser.</small></label>
            <h3>Watchlist</h3>
            <ul className="wl-edit">{list.map((i) => <li key={i.id}><span>{i.label}</span><button className="link" onClick={() => setList(list.filter((x) => x.id !== i.id))}>Remove</button></li>)}</ul>
            <div className="row"><button className="link" onClick={() => setList(DEFAULT_WATCHLIST)}>Reset watchlist</button><button className="btn primary" onClick={() => setSettingsOpen(false)} autoFocus>Done</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function SymbolSearch({ onPick }: { onPick: (i: Instrument) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Instrument[]>([]);
  const t = useRef<number | undefined>(undefined);
  useEffect(() => {
    clearTimeout(t.current);
    if (q.trim().length < 2) { setRes([]); return; }
    t.current = window.setTimeout(() => searchSymbols(q).then(setRes), 300);
  }, [q]);
  return (
    <div className="search">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a market: BTC, AAPL, EURUSD" aria-label="Find a market" />
      {res.length > 0 && (
        <ul className="results" role="listbox">
          {res.map((r) => <li key={r.id}><button onClick={() => { onPick(r); setQ(""); setRes([]); }}><b>{r.label}</b><span>{r.name}, {r.market.toLowerCase()}</span></button></li>)}
        </ul>
      )}
    </div>
  );
}
