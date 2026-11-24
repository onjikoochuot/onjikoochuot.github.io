import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Analysis, Candle, Tf } from "./engine/types";
import { analyze, fmt } from "./engine/analyze";
import { makeTip, TF_HOURS } from "./engine/layman";
import { CATALOG, DEFAULT_WATCHLIST, getCandles, getNews, HTF, journal, MARKETS, paper, save, searchSymbols, store, type Instrument, type NewsBrief } from "./lib/api";
import { useLiveCandles, useQuotes } from "./lib/live";
import Chart, { type Indicators } from "./components/Chart";
import NewsPanel from "./components/NewsPanel";
import OrderTicket from "./components/OrderTicket";
import { ContextCards, Ledger, VerdictPanel } from "./components/Panels";
import { Backtest, Journal, Rulebook } from "./components/Views";
import TipCard from "./components/TipCard";
import Paper from "./components/Paper";
import Markets from "./components/Markets";
import Picks from "./components/Picks";
import AutoTrade from "./components/AutoTrade";
import { BinanceTicket, type BnTradeIdea } from "./components/Binance";
import RealTrade from "./components/RealTrade";
import MyTrades from "./components/MyTrades";
import PhoneSetup, { takeSetupKey } from "./components/PhoneSetup";
import PaperTicket, { type PaperPick } from "./components/PaperTicket";
import Alerts from "./components/Alerts";
import HighPerformers, { LiveScan } from "./components/HighPerformers";
import type { AutoPick } from "./lib/api";
import Brokers from "./components/Brokers";
import Guide from "./components/Guide";

const TFS: Tf[] = ["5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w", "1M"];
const TF_LABEL: Record<Tf, string> = { "5m": "5 minutes", "15m": "15 minutes", "30m": "30 minutes", "1h": "1 hour", "2h": "2 hours", "4h": "4 hours", "1d": "Daily", "1w": "Weekly", "1M": "Monthly" };
const VIEWS = ["analyse", "picks", "top", "auto", "trades", "paper", "brokers", "alerts", "scan", "markets", "backtest", "journal", "rules", "guide"] as const;
type View = typeof VIEWS[number];
const VIEW_LABEL: Record<View, string> = { analyse: "Analyse", picks: "Today's picks", top: "High performers", trades: "My trades", alerts: "Alerts", auto: "Auto-trade", brokers: "Brokers", guide: "How to use", markets: "Markets", paper: "Paper trading", scan: "Scan", backtest: "Backtest", journal: "Journal", rules: "How it decides" };
const viewFromHash = (): View => { const raw = location.hash.slice(1); const h = (raw === "binance" ? "brokers" : raw) as View; return VIEWS.includes(h) ? h : "analyse"; };

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const ICONS: Partial<Record<View | "more", string>> = {
  analyse: "M3 17l5-6 4 4 7-9M3 21h18",
  picks: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z",
  auto: "M13 2L4 14h7l-1 8 9-12h-7z",
  trades: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
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
  const [ind, setInd] = useState<Indicators>(() => store("ind", { ema: true, bb: false, rsi: false }));
  const [news, setNews] = useState<NewsBrief | null>(null);
  const [newsErr, setNewsErr] = useState("");
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsTick, setNewsTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setNewsTick((n) => n + 1), 10 * 60000); return () => clearInterval(t); }, []);
  const [ticket, setTicket] = useState<"long" | "short" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [bnIdea, setBnIdea] = useState<BnTradeIdea | null>(null);
  const [realPicks, setRealPicks] = useState<AutoPick[] | null>(null);
  const [paperPicks, setPaperPicks] = useState<PaperPick[] | null>(null);
  const [account, setAccount] = useState<number>(() => store("account", 10000));
  const [riskPct, setRiskPct] = useState<number>(() => store("risk", 1));
  const [setupDone, setSetupDone] = useState(false);
  const [setupNote] = useState(() => { const k = takeSetupKey(); if (k) save("jkey", k); return k ? "This device is set up with your app key. Install it from Settings → Install on this device." : ""; });
  const [jkey, setJkey] = useState<string>(() => store("jkey", ""));
  const [saving, setSaving] = useState("");
  const [placing, setPlacing] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"));
  const applyTheme = (t: "light" | "dark", saveIt: boolean) => {
    document.documentElement.setAttribute("data-theme", t);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#0E1A21" : "#EBF0EF");
    if (saveIt) { try { localStorage.setItem("viko-theme", t); } catch { /* private mode */ } }
    setTheme(t);
  };
  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.add("theme-anim");
    applyTheme(theme === "dark" ? "light" : "dark", true);
    setTimeout(() => root.classList.remove("theme-anim"), 350);
  };
  // Install as an app: Android/desktop Chrome hand us a prompt; iPhone needs Safari's Share menu.
  const [installEvt, setInstallEvt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  const [installed, setInstalled] = useState(() => matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
  useEffect(() => {
    const f = (e: Event) => { e.preventDefault(); setInstallEvt(e as Event & { prompt: () => Promise<void> }); };
    const g = () => { setInstalled(true); setInstallEvt(null); };
    addEventListener("beforeinstallprompt", f); addEventListener("appinstalled", g);
    return () => { removeEventListener("beforeinstallprompt", f); removeEventListener("appinstalled", g); };
  }, []);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  // Follow the device setting until a choice is saved.
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: light)");
    const f = (e: MediaQueryListEvent) => { try { if (!localStorage.getItem("viko-theme")) applyTheme(e.matches ? "light" : "dark", false); } catch { /* ignore */ } };
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);

  // Tell an open window (or the installed app) when a newer version has been published.
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    const mine = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute("src");
    if (!mine) return;
    const check = async () => {
      try {
        const html = await (await fetch(`./?check=${Date.now()}`, { cache: "no-store" })).text();
        const live = html.match(/src="([^"]*\/assets\/[^"]+\.js)"/)?.[1];
        if (live && live !== mine) setUpdateReady(true);
      } catch { /* offline */ }
    };
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    const t = setInterval(check, 5 * 60000);
    addEventListener("focus", check); document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); removeEventListener("focus", check); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  useEffect(() => { const f = () => setView(viewFromHash()); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  useEffect(() => { setRealPicks(null); setPaperPicks(null); setBnIdea(null); }, [view]); // a ticket never follows you to another page
  useEffect(() => save("watchlist2", list), [list]);
  useEffect(() => save("ind", ind), [ind]);
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
  // News, calendar and AI opinion for this market; re-fetched when the market, timeframe or chart call changes.
  const techKey = setup ? `${setup.verdict}|${setup.dir}|${setup.name}` : "none";
  useEffect(() => {
    if (!analysis) return;
    let stop = false;
    setNewsLoading(true); setNewsErr("");
    const tech = setup ? { verdict: setup.verdict, dir: setup.dir, score: setup.score, setup: setup.name, price: analysis.last.c } : null;
    const id = window.setTimeout(() => getNews(inst, tf, tech).then((n) => { if (!stop) setNews(n); }).catch((e) => { if (!stop) setNewsErr((e as Error).message); }).finally(() => { if (!stop) setNewsLoading(false); }), 400);
    return () => { stop = true; clearTimeout(id); };
  }, [inst.id, tf, techKey, !!analysis, newsTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setNews(null); }, [inst.id]);
  const newsCtx = news ? { events: news.events, stance: news.opinion.stance, moodLabel: news.moodLabel } : undefined;
  const tip = useMemo(() => (analysis ? makeTip(setup, inst.label, tf, Math.floor(Date.now() / 1000), account, riskPct, newsCtx) : null), [analysis, setup, inst.label, tf, account, riskPct, news]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (v: View) => { location.hash = v; setView(v); setMoreOpen(false); window.scrollTo({ top: 0 }); };
  const [railOpen, setRailOpen] = useState(false);
  const open = (i: Instrument) => { setInst(i); go("analyse"); setRailOpen(false); };
  const openById = (id: string) => { const i = [...list, ...CATALOG].find((x) => x.id === id); if (i) open(i); };
  const toggle = (i: Instrument) => setList((l) => (l.some((x) => x.id === i.id) ? l.filter((x) => x.id !== i.id) : [...l, i]));
  const [expanded, setExpanded] = useState<string[]>(() => store("railOpen", []));
  useEffect(() => save("railOpen", expanded), [expanded]);
  const railItems = (m: string) => { const mine = list.filter((x) => x.market === m); return expanded.includes(m) ? [...mine, ...CATALOG.filter((x) => x.market === m && !mine.some((y) => y.id === x.id))] : mine; };
  const quotes = useQuotes(useMemo(() => [...new Set([...list.map((x) => x.id), ...CATALOG.filter((x) => expanded.includes(x.market)).map((x) => x.id)])], [list, expanded]));

  const saveSignal = async () => {
    if (!setup || !analysis) return;
    if (!jkey) { setSettingsOpen(true); return; }
    setSaving("Saving…");
    try {
      await journal.add(jkey, { symbol: inst.id, timeframe: tf, direction: setup.dir, verdict: setup.verdict, score: setup.score, entry: setup.entry, stop: setup.stop, target1: setup.target1, target2: setup.target2, rr: Number(setup.rr1.toFixed(2)), setup: `${setup.name} (${setup.degree})`, payload: { checks: setup.checks, labels: setup.labels, wyckoff: analysis.wyckoff } });
      setSaving("Saved");
    } catch (e) { setSaving(""); setErr((e as Error).message); }
  };
  const paperTrade = () => {
    if (!setup || !tip) return;
    setPaperPicks([{ symbol: inst.id, label: inst.label, market: inst.market, tf, dir: setup.dir, score: setup.score, name: `${setup.name} (${setup.degree})${setup.verdict === "APPROVED" ? "" : `, practice at ${setup.score}%`}`, stop: setup.stop, target1: setup.target1, target2: setup.target2, expectBars: setup.expectBars ?? 3, entry: lastPrice ?? setup.entry, tip: [tip.headline, ...tip.steps].join("\n") }]);
  };
  const canPaper = !!setup && !setup.hardFail && setup.triggered && setup.rr1 > 0;
  const placeOrder = async (o: { dir: "long" | "short"; stop: number; target1: number; target2: number; fromSetup: boolean; amount: number }) => {
    if (!jkey) { setTicket(null); setSettingsOpen(true); return; }
    setPlacing(true); setErr(""); setNote("");
    try {
      await paper.open(jkey, { symbol: inst.id, label: inst.label, tf, dir: o.dir, stop: o.stop, target1: o.target1, target2: o.target2, setup: o.fromSetup && setup ? `Manual order on ${setup.name} (${setup.score}%)` : "Manual order", score: o.fromSetup && setup ? setup.score : 0, tip: "", source: "manual", amount: o.amount });
      setNote(`Paper ${o.dir === "long" ? "buy" : "sell"} placed on ${inst.label}.`); setTicket(null);
    } catch (e) { setErr((e as Error).message); setTicket(null); }
    setPlacing(false);
  };

  const liveText = status === "live" ? "Live" : status === "polling" ? "Live, every 30 s" : "Connecting";
  const lastPrice = candles.length ? candles[candles.length - 1].c : analysis?.last.c;
  const realTrade = () => setup && setRealPicks([{ symbol: inst.id, label: inst.label, market: inst.market, tf, dir: setup.dir, score: setup.score, name: `${setup.name} (${setup.degree})`, stop: setup.stop, target1: setup.target1, target2: setup.target2, expectBars: setup.expectBars ?? 3 }]);
  const tipEl = tip && <TipCard tip={tip} onPaper={canPaper ? paperTrade : undefined} onReal={canPaper ? realTrade : undefined} paperLabel={setup?.verdict === "APPROVED" ? "Paper trade this" : "Practise this on paper"} busy={placing} />;

  return (
    <div className="app">
      {updateReady && (
        <div className="update-bar" role="status">
          <span>A new version of Viko is ready.</span>
          <button className="btn primary" onClick={() => location.reload()}>Reload</button>
        </div>
      )}
      <header className="top">
        <button className="rail-toggle" onClick={() => setRailOpen(true)} aria-expanded={railOpen} aria-controls="markets-panel"><Icon d="M4 6h16M4 12h16M4 18h16" /><span>Markets</span></button>
        <a className="brand" href="#analyse" onClick={() => go("analyse")} aria-label="Viko home">
          <svg viewBox="0 0 40 20" aria-hidden="true"><path d="M1 15 L8 5 L13 11 L22 2 L27 9 L32 6 L39 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
          <span>Viko</span>
        </a>
        <nav className="tabs" aria-label="Sections">
          {VIEWS.map((v) => <a key={v} href={`#${v}`} className={view === v ? "on" : ""} aria-current={view === v ? "page" : undefined} onClick={() => go(v)}>{VIEW_LABEL[v]}</a>)}
        </nav>
        <div className="top-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button className="btn ghost" onClick={() => setSettingsOpen(true)}>Settings</button>
        </div>
      </header>

      <div className="body">
        {railOpen && <div className="rail-backdrop" onClick={() => setRailOpen(false)} aria-hidden="true" />}
        <aside id="markets-panel" className={`rail ${railOpen ? "open" : ""}`} aria-label="Markets">
          <div className="rail-head"><b>Markets</b><button className="link" onClick={() => setRailOpen(false)}>Close</button></div>
          <SymbolSearch onPick={(i) => { if (!list.some((x) => x.id === i.id)) setList([...list, i]); open(i); }} />
          <div className="rail-list">
            {MARKETS.map((m) => {
              const items = railItems(m);
              const all = CATALOG.filter((x) => x.market === m).length;
              const isOpen = expanded.includes(m);
              return (
                <div key={m} className="rail-group">
                  <h4>{m}<button className="rail-more" onClick={() => setExpanded(isOpen ? expanded.filter((x) => x !== m) : [...expanded, m])} aria-expanded={isOpen}>{isOpen ? "Show less" : `See all ${all}`}</button></h4>
                  <ul>{items.map((i) => {
                    const q = quotes[i.id];
                    return (
                      <li key={i.id}><button className={i.id === inst.id ? "on" : ""} onClick={() => open(i)} aria-current={i.id === inst.id} title={i.name}>
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
          {setupNote && !setupDone && <p className="ok-msg setup-note">{setupNote} <button className="link" onClick={() => { setSetupDone(true); setSettingsOpen(true); }}>Open Settings</button></p>}
          {view === "analyse" && (
            <>
              <div className="toolbar">
                <h1>{inst.label}<span>{inst.name}</span></h1>
                <p className={`live ${status}`} title={tickAt ? `Last update ${new Date(tickAt).toLocaleTimeString()}` : undefined}><i aria-hidden="true" />{liveText}{lastPrice !== undefined && <b className="mono">{fmt(lastPrice)}</b>}<Countdown tf={tf} crypto={inst.id.startsWith("crypto:")} /></p>
                <div className="seg" role="radiogroup" aria-label="Timeframe">
                  {TFS.map((t) => <button key={t} role="radio" aria-checked={tf === t} className={tf === t ? "on" : ""} onClick={() => setTf(t)}>{t}</button>)}
                </div>
                <div className="ind-chips" role="group" aria-label="Indicators">
                  {([["ema", "EMA"], ["bb", "Bollinger"], ["rsi", "RSI"]] as const).map(([k, l]) => <button key={k} aria-pressed={ind[k]} className={`chip sm ${ind[k] ? "on" : ""}`} onClick={() => setInd({ ...ind, [k]: !ind[k] })}>{l}</button>)}
                </div>
                <div className="trade-btns">
                  <button className="btn buy-btn" onClick={() => setTicket("long")} disabled={!lastPrice}>Buy</button>
                  <button className="btn sell-btn" onClick={() => setTicket("short")} disabled={!lastPrice}>Sell</button>
                  {canPaper && <button className="btn primary" onClick={realTrade} title="Viko places it on Binance or Deriv and manages the stop-loss and profit">Real money</button>}
                </div>
                <button className={`star big ${list.some((x) => x.id === inst.id) ? "on" : ""}`} onClick={() => toggle(inst)}>{list.some((x) => x.id === inst.id) ? "★ Watching" : "☆ Watch"}</button>
              </div>
              {err && <p className="err">{err}</p>}
              {note && <p className="okmsg">{note} <button className="link" onClick={() => go("paper")}>Follow it in Paper trading</button></p>}
              <div className="analyse">
                <div className="chart-wrap">
                  <div className="tip-mobile">{tipEl}</div>
                  {candles.length > 0 ? <Chart candles={candles} analysis={analysis} setup={setup} ind={ind} theme={theme} /> : <div className="chart placeholder">{loading ? "Fetching candles…" : "No data"}</div>}
                  <p className="legend"><span className="lg-wave">Wave count</span><span className="lg-wy">Wyckoff events</span><span className="lg-lv">Entry, stop and targets</span></p>
                </div>
                <div className="side">
                  <div className="tip-desktop">{tipEl}</div>
                  {analysis && <VerdictPanel symbol={inst.label} tfLabel={TF_LABEL[tf]} analysis={analysis} setup={setup} onPick={setPick} account={account} riskPct={riskPct} onSave={saveSignal} saving={saving} />}
                  <NewsPanel news={news} loading={newsLoading} error={newsErr} setup={setup} />
                </div>
              </div>
              {analysis && <ContextCards analysis={analysis} />}
              {setup && <Ledger setup={setup} />}
            </>
          )}
          {view === "picks" && <Picks appKey={jkey} onNeedKey={() => setSettingsOpen(true)} account={account} riskPct={riskPct} onOpen={(id, t) => { setTf(t); openById(id); }} onBinance={setBnIdea} onReal={setRealPicks} onPaper={setPaperPicks} />}
          {view === "auto" && <AutoTrade appKey={jkey} onNeedKey={() => setSettingsOpen(true)} onOpen={(id, t) => { setTf(t as Tf); openById(id); }} />}
          {view === "brokers" && <Brokers appKey={jkey} onNeedKey={() => setSettingsOpen(true)} />}
          {view === "guide" && <Guide go={go} />}
          {view === "trades" && <MyTrades appKey={jkey} onNeedKey={() => setSettingsOpen(true)} onOpen={(id, t) => { setTf(t as Tf); openById(id); }} go={go} />}
          {view === "alerts" && <Alerts appKey={jkey} onNeedKey={() => setSettingsOpen(true)} />}
          {view === "markets" && <Markets list={list} onOpen={open} onToggle={toggle} />}
          {view === "paper" && <Paper appKey={jkey} onNeedKey={() => setSettingsOpen(true)} watchlist={list.map((x) => ({ id: x.id, label: x.label }))} onOpenMarket={openById} />}
          {view === "scan" && <LiveScan watchlist={list} appKey={jkey} account={account} riskPct={riskPct} onNeedKey={() => setSettingsOpen(true)} onOpen={(id, t) => { setTf(t); openById(id); }} onReal={setRealPicks} onPaper={setPaperPicks} />}
          {view === "top" && <HighPerformers appKey={jkey} account={account} riskPct={riskPct} onNeedKey={() => setSettingsOpen(true)} onOpen={(id, t) => { setTf(t); openById(id); }} onReal={setRealPicks} onPaper={setPaperPicks} />}
          {view === "backtest" && <Backtest symbol={inst.id} label={inst.label} tf={tf} />}
          {view === "journal" && <Journal keyValue={jkey} onNeedKey={() => setSettingsOpen(true)} />}
          {view === "rules" && <Rulebook />}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Main">
        {(["analyse", "picks", "trades", "paper"] as const).map((v) => (
          <a key={v} href={`#${v}`} className={view === v ? "on" : ""} aria-current={view === v ? "page" : undefined} onClick={() => go(v)}>
            <Icon d={ICONS[v]!} /><span>{v === "paper" ? "Paper" : v === "picks" ? "Picks" : v === "trades" ? "My trades" : VIEW_LABEL[v]}</span>
          </a>
        ))}
        <button className={["auto", "top", "alerts", "guide", "brokers", "markets", "scan", "backtest", "journal", "rules"].includes(view) ? "on" : ""} onClick={() => setMoreOpen(true)} aria-haspopup="dialog"><Icon d={ICONS.more!} /><span>More</span></button>
      </nav>

      {moreOpen && (
        <div className="modal sheet-modal" role="dialog" aria-modal="true" aria-label="More" onClick={() => setMoreOpen(false)}>
          <div className="sheet bottom" onClick={(e) => e.stopPropagation()}>
            {(["auto", "top", "alerts", "brokers", "guide", "scan", "markets", "backtest", "journal", "rules"] as const).map((v) => <button key={v} className="sheet-item" onClick={() => go(v)}>{VIEW_LABEL[v]}</button>)}
            <button className="sheet-item" onClick={() => { setMoreOpen(false); setSettingsOpen(true); }}>Settings</button>
          </div>
        </div>
      )}

      {paperPicks && <PaperTicket picks={paperPicks} appKey={jkey} onClose={() => setPaperPicks(null)} onNeedKey={() => { setPaperPicks(null); setSettingsOpen(true); }} onDone={() => { setPaperPicks(null); go("paper"); }} />}
      {realPicks && <RealTrade picks={realPicks} appKey={jkey} onClose={() => setRealPicks(null)} onNeedKey={() => { setRealPicks(null); setSettingsOpen(true); }} onWatch={() => { setRealPicks(null); save("autoTab", "running"); go("auto"); }} />}
      {bnIdea && <BinanceTicket idea={bnIdea} appKey={jkey} onClose={() => setBnIdea(null)} onNeedKey={() => { setBnIdea(null); setSettingsOpen(true); }} />}
      {ticket && lastPrice !== undefined && analysis && (
        <OrderTicket side={ticket} label={inst.label} price={lastPrice} atr={analysis.ind.atr[analysis.ind.atr.length - 1]} setup={setup} account={account} riskPct={riskPct} busy={placing} onClose={() => setTicket(null)} onPlace={placeOrder} />
      )}

      {settingsOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="set-h" onKeyDown={(e) => e.key === "Escape" && setSettingsOpen(false)}>
          <div className="sheet">
            <h2 id="set-h">Settings</h2>
            <label>App key<input type="password" value={jkey} onChange={(e) => setJkey(e.target.value.trim())} autoComplete="off" /><small>Unlocks paper trading and your journal. Stored only in this browser.</small></label>
            <PhoneSetup appKey={jkey} />
            <label>Account size for position sizing<input type="number" min={0} value={account} onChange={(e) => setAccount(Number(e.target.value))} /></label>
            <label>Risk per trade, %<input type="number" min={0.1} max={5} step={0.1} value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} /><small>Villahermosa recommends no more than 1% (ch. 27).</small></label>
            <h3>Install on this device</h3>
            {installed ? <p className="ctx-note">Viko is installed. Open it from your home screen.</p>
              : installEvt ? <button className="btn primary" onClick={() => installEvt.prompt().catch(() => {})}>Install Viko</button>
              : isIOS ? <ol className="install-steps"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (the square with an arrow).</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>
              : <ol className="install-steps"><li>Open this page in <b>Chrome</b>.</li><li>Tap the <b>⋮</b> menu at the top right.</li><li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li></ol>}
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

/** Time left until the current candle closes. Exact for crypto (UTC-aligned bars); approximate for intraday bars elsewhere. */
function Countdown({ tf, crypto }: { tf: Tf; crypto: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const sec = TF_HOURS[tf] * 3600;
  if (!crypto && sec >= 86400) return null;
  const offset = tf === "1w" ? 4 * 86400 : 0; // weekly bars open Monday 00:00 UTC; the Unix epoch was a Thursday
  const d = new Date(now), nextMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
  const left = tf === "1M" ? Math.ceil(nextMonth - now / 1000) : Math.ceil(sec - ((now / 1000 - offset) % sec));
  const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
  const txt = tf === "1w" || tf === "1M" ? `${Math.floor(left / 86400)}d ${Math.floor((left % 86400) / 3600)}h` : h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return <span className="countdown">candle closes in <span className="mono">{txt}</span></span>;
}

function ThemeToggle({ theme, onToggle }: { theme: "light" | "dark"; onToggle: () => void }) {
  const dark = theme === "dark";
  return (
    <button type="button" className="theme-toggle" onClick={onToggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={dark}>
      <svg className="ti-moon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M21 14.2A8.5 8.5 0 0 1 9.8 3a.6.6 0 0 0-.8-.7A10 10 0 1 0 21.7 15a.6.6 0 0 0-.7-.8z" /></svg>
      <svg className="ti-sun" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="4.6" fill="currentColor" /><g stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1.8v2.4M12 19.8v2.4M1.8 12h2.4M19.8 12h2.4M4.8 4.8l1.7 1.7M17.5 17.5l1.7 1.7M4.8 19.2l1.7-1.7M17.5 6.5l1.7-1.7" /></g></svg>
    </button>
  );
}
