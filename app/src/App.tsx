import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Analysis, Candle, Tf } from "./engine/types";
import { analyze, fmt } from "./engine/analyze";
import { makeTip } from "./engine/layman";
import { CATALOG, DEFAULT_WATCHLIST, getCandles, HTF, journal, MARKETS, paper, save, searchSymbols, store, type Instrument } from "./lib/api";
import { useLiveCandles, useQuotes } from "./lib/live";
import Chart from "./components/Chart";
import { ContextCards, Ledger, VerdictPanel } from "./components/Panels";
import { Backtest, Journal, Rulebook, Scanner } from "./components/Views";
import TipCard from "./components/TipCard";
import Paper from "./components/Paper";
import Markets from "./components/Markets";

const TFS: Tf[] = ["1h", "4h", "1d", "1w"];
const TF_LABEL: Record<Tf, string> = { "1h": "1 hour", "4h": "4 hours", "1d": "Daily", "1w": "Weekly" };
const VIEWS = ["analyse", "markets", "paper", "scan", "backtest", "journal", "rules"] as const;
type View = typeof VIEWS[number];
const VIEW_LABEL: Record<View, string> = { analyse: "Analyse", markets: "Markets", paper: "Paper trading", scan: "Scan", backtest: "Backtest", journal: "Journal", rules: "How it decides" };
const viewFromHash = (): View => { const h = location.hash.slice(1) as View; return VIEWS.includes(h) ? h : "analyse"; };

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const ICONS: Partial<Record<View | "more", string>> = {
  analyse: "M3 17l5-6 4 4 7-9M3 21h18",
  markets: "M4 6h16M4 12h16M4 18h10",
  paper: "M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h5",
  scan: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

export default function App() {
  const [view, setView] = useState<View>(viewFromHash);
  const [list, setList] = useState<Instrument[]>(() => store("watchlist2", DEFAULT_WATCHLIST));
  const [inst, setInst] = useState<Instrument>(() => store("inst", DEFAULT_WATCHLIST[0]));
  const [tf, setTf] = useState<Tf>(() => store("tf", "1d"));
  const [base, setBase] = useState<Candle[]>([]);
  const [htfC, setHtfC] = useState<Candle[] | undefined>();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [showEma, setShowEma] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [account, setAccount] = useState<number>(() => store("account", 10000));
  const [riskPct, setRiskPct] = useState<number>(() => store("risk", 1));
  const [jkey, setJkey] = useState<string>(() => store("jkey", ""));
  const [saving, setSaving] = useState("");
  const [placing, setPlacing] = useState(false);

  useEffect(() => { const f = () => setView(viewFromHash()); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  useEffect(() => save("watchlist2", list), [list]);
  useEffect(() => { save("inst", inst); save("tf", tf); }, [inst, tf]);
  useEffect(() => { save("account", account); save("risk", riskPct); save("jkey", jkey); }, [account, riskPct, jkey]);
  // Keep the server-side autopilot scanning the same watchlist you see.
  useEffect(() => {
    if (!jkey) return;
    const id = window.setTimeout(() => paper.settings(jkey, { watchlist: list.map((x) => ({ id: x.id, label: x.label })) }).catch(() => {}), 1500);
    return () => clearTimeout(id);
  }, [list, jkey]);

  const load = async () => {
    setLoading(true); setErr(""); setPick(null); setSaving(""); setNote("");
    try {
      const c = await getCandles(inst.id, tf);
      const h = HTF[tf];
      const hc = h ? await getCandles(inst.id, h).catch(() => undefined) : undefined;
      setHtfC(hc); setBase(c);
      setAnalysis(analyze(c, tf, hc));
    } catch (e) { setErr((e as Error).message); setAnalysis(null); setBase([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [inst.id, tf]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live candles; re-run the rulebook on every candle close and at most every 10 s in between.
  const lastRun = useRef(0);
  const liveRef = useRef<Candle[]>([]);
  const rerun = useCallback(() => { if (liveRef.current.length) { setAnalysis(analyze(liveRef.current, tf, htfC)); lastRun.current = Date.now(); } }, [tf, htfC]);
  const { candles, status, tickAt } = useLiveCandles(inst.id, tf, base, rerun);
  liveRef.current = candles;
  useEffect(() => { if (candles.length && candles !== base && Date.now() - lastRun.current > 10_000) rerun(); }, [candles, base, rerun]);

  const setup = useMemo(() => (analysis ? analysis.setups.find((s) => s.id === pick) ?? analysis.best : null), [analysis, pick]);
  const tip = useMemo(() => (analysis ? makeTip(setup, inst.label, tf, Math.floor(Date.now() / 1000), account, riskPct) : null), [analysis, setup, inst.label, tf, account, riskPct]);
  const go = (v: View) => { location.hash = v; setView(v); setMoreOpen(false); window.scrollTo({ top: 0 }); };
  const open = (i: Instrument) => { setInst(i); go("analyse"); };
  const openById = (id: string) => { const i = [...list, ...CATALOG].find((x) => x.id === id); if (i) open(i); };
  const toggle = (i: Instrument) => setList((l) => (l.some((x) => x.id === i.id) ? l.filter((x) => x.id !== i.id) : [...l, i]));
  const quotes = useQuotes(useMemo(() => list.map((x) => x.id), [list]));

  const saveSignal = async () => {
    if (!setup || !analysis) return;
    if (!jkey) { setSettingsOpen(true); return; }
    setSaving("Saving…");
    try {
      await journal.add(jkey, { symbol: inst.id, timeframe: tf, direction: setup.dir, verdict: setup.verdict, score: setup.score, entry: setup.entry, stop: setup.stop, target1: setup.target1, target2: setup.target2, rr: Number(setup.rr1.toFixed(2)), setup: `${setup.name} (${setup.degree})`, payload: { checks: setup.checks, labels: setup.labels, wyckoff: analysis.wyckoff } });
      setSaving("Saved");
    } catch (e) { setSaving(""); setErr((e as Error).message); }
  };
  const paperTrade = async () => {
    if (!setup || !tip) return;
    if (!jkey) { setSettingsOpen(true); return; }
    setPlacing(true); setErr(""); setNote("");
    try {
      await paper.open(jkey, { symbol: inst.id, label: inst.label, tf, dir: setup.dir, stop: setup.stop, target1: setup.target1, target2: setup.target2, setup: `${setup.name} (${setup.degree})${setup.verdict === "APPROVED" ? "" : `, practice at ${setup.score}%`}`, score: setup.score, tip: [tip.headline, ...tip.steps].join("\n"), source: "manual" });
      setNote(`Paper trade placed on ${inst.label}.`);
    } catch (e) { setErr((e as Error).message); }
    setPlacing(false);
  };
  const canPaper = !!setup && !setup.hardFail && setup.triggered && setup.rr1 > 0;

  const liveText = status === "live" ? "Live" : status === "polling" ? "Live, every 30 s" : "Connecting";
  const lastPrice = candles.length ? candles[candles.length - 1].c : analysis?.last.c;
  const tipEl = tip && <TipCard tip={tip} onPaper={canPaper ? paperTrade : undefined} paperLabel={setup?.verdict === "APPROVED" ? "Paper trade this" : "Practise this on paper"} busy={placing} />;

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#analyse" onClick={() => go("analyse")} aria-label="Viko home">
          <svg viewBox="0 0 40 20" aria-hidden="true"><path d="M1 15 L8 5 L13 11 L22 2 L27 9 L32 6 L39 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
          <span>Viko</span>
        </a>
        <nav className="tabs" aria-label="Sections">
          {VIEWS.map((v) => <a key={v} href={`#${v}`} className={view === v ? "on" : ""} aria-current={view === v ? "page" : undefined} onClick={() => go(v)}>{VIEW_LABEL[v]}</a>)}
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
                  <ul>{items.map((i) => {
                    const q = quotes[i.id];
                    return (
                      <li key={i.id}><button className={i.id === inst.id ? "on" : ""} onClick={() => open(i)} aria-current={i.id === inst.id}>
                        <b>{i.label}</b>
                        <span className="rq">{q ? <><span className="mono">{fmt(q.price)}</span><span className={`mono ${q.change >= 0 ? "bull" : "bear"}`}>{q.change >= 0 ? "+" : ""}{q.change.toFixed(1)}%</span></> : i.name}</span>
                      </button></li>
                    );
                  })}</ul>
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
                <p className={`live ${status}`} title={tickAt ? `Last update ${new Date(tickAt).toLocaleTimeString()}` : undefined}><i aria-hidden="true" />{liveText}{lastPrice !== undefined && <b className="mono">{fmt(lastPrice)}</b>}</p>
                <div className="seg" role="radiogroup" aria-label="Timeframe">
                  {TFS.map((t) => <button key={t} role="radio" aria-checked={tf === t} className={tf === t ? "on" : ""} onClick={() => setTf(t)}>{t}</button>)}
                </div>
                <label className="chk"><input type="checkbox" checked={showEma} onChange={(e) => setShowEma(e.target.checked)} /> EMA 50/200</label>
                <button className={`star big ${list.some((x) => x.id === inst.id) ? "on" : ""}`} onClick={() => toggle(inst)}>{list.some((x) => x.id === inst.id) ? "★ Watching" : "☆ Watch"}</button>
              </div>
              {err && <p className="err">{err}</p>}
              {note && <p className="okmsg">{note} <button className="link" onClick={() => go("paper")}>Follow it in Paper trading</button></p>}
              <div className="analyse">
                <div className="chart-wrap">
                  <div className="tip-mobile">{tipEl}</div>
                  {candles.length > 0 ? <Chart candles={candles} analysis={analysis} setup={setup} showEma={showEma} /> : <div className="chart placeholder">{loading ? "Fetching candles…" : "No data"}</div>}
                  <p className="legend"><span className="lg-wave">Wave count</span><span className="lg-wy">Wyckoff events</span><span className="lg-lv">Entry, stop and targets</span></p>
                </div>
                <div className="side">
                  <div className="tip-desktop">{tipEl}</div>
                  {analysis && <VerdictPanel symbol={inst.label} tfLabel={TF_LABEL[tf]} analysis={analysis} setup={setup} onPick={setPick} account={account} riskPct={riskPct} onSave={saveSignal} saving={saving} />}
                </div>
              </div>
              {analysis && <ContextCards analysis={analysis} />}
              {setup && <Ledger setup={setup} />}
            </>
          )}
          {view === "markets" && <Markets list={list} onOpen={open} onToggle={toggle} />}
          {view === "paper" && <Paper appKey={jkey} onNeedKey={() => setSettingsOpen(true)} watchlist={list.map((x) => ({ id: x.id, label: x.label }))} onOpenMarket={openById} />}
          {view === "scan" && <Scanner list={list} tf={tf} onOpen={open} />}
          {view === "backtest" && <Backtest symbol={inst.id} label={inst.label} tf={tf} />}
          {view === "journal" && <Journal keyValue={jkey} onNeedKey={() => setSettingsOpen(true)} />}
          {view === "rules" && <Rulebook />}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Main">
        {(["analyse", "markets", "paper", "scan"] as const).map((v) => (
          <a key={v} href={`#${v}`} className={view === v ? "on" : ""} aria-current={view === v ? "page" : undefined} onClick={() => go(v)}>
            <Icon d={ICONS[v]!} /><span>{v === "paper" ? "Paper" : VIEW_LABEL[v]}</span>
          </a>
        ))}
        <button className={["backtest", "journal", "rules"].includes(view) ? "on" : ""} onClick={() => setMoreOpen(true)} aria-haspopup="dialog"><Icon d={ICONS.more!} /><span>More</span></button>
      </nav>

      {moreOpen && (
        <div className="modal sheet-modal" role="dialog" aria-modal="true" aria-label="More" onClick={() => setMoreOpen(false)}>
          <div className="sheet bottom" onClick={(e) => e.stopPropagation()}>
            {(["backtest", "journal", "rules"] as const).map((v) => <button key={v} className="sheet-item" onClick={() => go(v)}>{VIEW_LABEL[v]}</button>)}
            <button className="sheet-item" onClick={() => { setMoreOpen(false); setSettingsOpen(true); }}>Settings</button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="set-h" onKeyDown={(e) => e.key === "Escape" && setSettingsOpen(false)}>
          <div className="sheet">
            <h2 id="set-h">Settings</h2>
            <label>App key<input type="password" value={jkey} onChange={(e) => setJkey(e.target.value.trim())} autoComplete="off" /><small>Unlocks paper trading and your journal. Stored only in this browser.</small></label>
            <label>Account size for position sizing<input type="number" min={0} value={account} onChange={(e) => setAccount(Number(e.target.value))} /></label>
            <label>Risk per trade, %<input type="number" min={0.1} max={5} step={0.1} value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} /><small>Villahermosa recommends no more than 1% (ch. 27).</small></label>
            <h3>Watchlist ({list.length})</h3>
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
    const s = q.toLowerCase();
    const local = CATALOG.filter((x) => x.label.toLowerCase().includes(s) || x.name.toLowerCase().includes(s)).slice(0, 5);
    setRes(local);
    t.current = window.setTimeout(() => searchSymbols(q).then((r) => setRes([...local, ...r.filter((x) => !local.some((l) => l.id === x.id))].slice(0, 10))), 300);
  }, [q]);
  return (
    <div className="search">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a market: BTC, Apple, EURUSD" aria-label="Find a market" />
      {res.length > 0 && (
        <ul className="results" role="listbox">
          {res.map((r) => <li key={r.id}><button onClick={() => { onPick(r); setQ(""); setRes([]); }}><b>{r.label}</b><span>{r.name}, {r.market.toLowerCase()}</span></button></li>)}
        </ul>
      )}
    </div>
  );
}
