import { useEffect, useMemo, useState } from "react";
import { fmt } from "../engine/analyze";
import { auto, save, store, type AutoCfg, type AutoEvent, type AutoHistory, type AutoPlan, type AutoPosition, type AutoPreview } from "../lib/api";

type Tab = "start" | "running" | "results" | "connect";
const HORIZONS: [AutoCfg["horizon"], string][] = [["24h", "24 hours"], ["48h", "48 hours"], ["72h", "72 hours"], ["1w", "1 week"], ["1m", "1 month"]];
const STRICT = [80, 85, 90, 95];
const RISKS: [AutoCfg["risk"], string, string][] = [["careful", "Careful", "lose about 10% of a trade's money if its stop is hit"], ["balanced", "Balanced", "about 20%"], ["bold", "Bold", "about 35%"]];
const DEFAULT: AutoCfg = { broker: "binance", mode: "demo", amount: 100, count: 2, horizon: "48h", strict: 85, risk: "balanced" };
const cur = (broker: string) => (broker === "binance" ? "USDT" : "USD");
const money = (x: number | null | undefined, c = "") => (x == null ? "–" : `${x >= 0 ? "" : "−"}${Math.abs(x).toFixed(2)}${c ? ` ${c}` : ""}`);
const signed = (x: number | null | undefined, c = "") => (x == null ? "–" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}${c ? ` ${c}` : ""}`);
const left = (iso: string, now: number) => { const ms = Date.parse(iso) - now; if (ms <= 0) return "now"; const h = ms / 3600000; return h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min` : `${Math.round(h / 24)} days`; };
const hrs = (h: number) => (h < 1 ? `${Math.max(5, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);

export default function AutoTrade({ appKey, onNeedKey, onOpen }: { appKey: string; onNeedKey: () => void; onOpen: (id: string, tf: string) => void }) {
  const [tab, setTab] = useState<Tab>(() => store("autoTab", "start"));
  useEffect(() => save("autoTab", tab), [tab]);
  return (
    <section className="view auto">
      <header className="view-head">
        <div><h2>Auto-trade</h2><p>Choose your money, how long, and how strict. Viko picks the trades, places them on Binance or Deriv, moves the stop-loss as they go, takes profit, and closes everything when your time is up.</p></div>
      </header>
      <div className="seg picks-tabs" role="tablist">
        {([["start", "Start"], ["running", "Running"], ["results", "Results"], ["connect", "Connect"]] as [Tab, string][]).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {!appKey && <p className="err">Add your app key in Settings first. <button className="link" onClick={onNeedKey}>Open Settings</button></p>}
      {appKey && tab === "start" && <Start appKey={appKey} onStarted={() => setTab("running")} />}
      {appKey && tab === "running" && <Running appKey={appKey} onOpen={onOpen} />}
      {appKey && tab === "results" && <Results appKey={appKey} />}
      {appKey && tab === "connect" && <Connect appKey={appKey} />}
    </section>
  );
}

function Choice<T extends string | number>({ label, value, options, onChange, help }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; help?: string }) {
  return (
    <div className="auto-field">
      <span className="auto-label">{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>{options.map(([v, l]) => <button type="button" key={String(v)} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>
      {help && <small className="sub">{help}</small>}
    </div>
  );
}

function Start({ appKey, onStarted }: { appKey: string; onStarted: () => void }) {
  const [cfg, setCfg] = useState<AutoCfg>(() => store("autoCfg", DEFAULT));
  const set = (p: Partial<AutoCfg>) => setCfg((c) => { const n = { ...c, ...p }; save("autoCfg", n); return n; });
  const [pv, setPv] = useState<AutoPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const c = cur(cfg.broker);

  useEffect(() => {
    if (!(cfg.amount > 0)) return;
    let stop = false;
    setLoading(true); setErr("");
    const t = setTimeout(() => auto.preview(appKey, cfg).then((p) => { if (!stop) setPv(p); }).catch((e) => { if (!stop) setErr((e as Error).message); }).finally(() => { if (!stop) setLoading(false); }), 500);
    return () => { stop = true; clearTimeout(t); };
  }, [appKey, cfg]);

  const live = cfg.mode === "live";
  const totals = pv ? pv.trades.reduce((a, t) => ({ loss: a.loss + t.loss, p1: a.p1 + t.profit1, p2: a.p2 + t.profit2 }), { loss: 0, p1: 0, p2: 0 }) : null;
  const go = async () => {
    setBusy(true); setErr(""); setDone("");
    try {
      const r = await auto.start(appKey, cfg);
      setDone(r.placed ? `Started. ${r.placed} trade${r.placed > 1 ? "s" : ""} placed${r.placed < cfg.count ? "; Viko will add the rest when they qualify" : ""}.` : "Started. Nothing qualifies yet, so Viko is watching and will enter as soon as a setup meets your bar.");
      setTimeout(onStarted, 1400);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <>
      <div className="card auto-form">
        <Choice label="Where" value={cfg.broker} options={[["binance", "Binance (crypto)"], ["deriv", "Deriv (forex, gold, crypto, indices)"]]} onChange={(broker) => set({ broker })} />
        <Choice label="Account" value={cfg.mode} options={[["demo", "Demo (practice money)"], ["live", "Live (real money)"]]} onChange={(mode) => { set({ mode }); setAgree(false); }} />
        <div className="auto-field">
          <span className="auto-label">Money to invest</span>
          <span className="money-in"><input className="cur" value={c} readOnly aria-label="Currency" /><input type="number" min={1} step="any" inputMode="decimal" value={cfg.amount} onChange={(e) => set({ amount: Math.max(0, Number(e.target.value)) })} aria-label="Amount" /></span>
        </div>
        <Choice label="Number of trades" value={cfg.count} options={[[1, "1"], [2, "2"], [3, "3"]]} onChange={(count) => set({ count })} help={`${money(cfg.amount / cfg.count, c)} each`} />
        <Choice label="Come back in" value={cfg.horizon} options={HORIZONS} onChange={(horizon) => set({ horizon })} />
        <Choice label="How strict" value={cfg.strict} options={STRICT.map((s) => [s, `${s}%+`] as [number, string])} onChange={(strict) => set({ strict })} help="Share of the book rules that must agree. Higher means fewer, cleaner trades." />
        <Choice label="Risk" value={cfg.risk} options={RISKS.map(([v, l]) => [v, l] as [AutoCfg["risk"], string])} onChange={(risk) => set({ risk })} help={`Sets the leverage so a trade that hits its stop-loss loses ${RISKS.find((r) => r[0] === cfg.risk)![2]}.`} />
      </div>

      <h3 className="pick-sec">What Viko would do now</h3>
      {loading && <p className="muted">Checking the latest scan, live prices and news…</p>}
      {err && <p className="err">{err}</p>}
      {pv && !loading && (
        pv.trades.length === 0 ? (
          <div className="empty-pick">
            <h3>Nothing meets {cfg.strict}% for {pv.horizon} right now</h3>
            <p>You can still start. Viko will keep checking every 5 minutes for the first half of your window and enter as soon as a setup meets your bar. If none appears, your money is never used.</p>
            {pv.skipped.length > 0 && <p className="sub">{pv.skipped.join(" ")}</p>}
          </div>
        ) : (
          <>
            <div className="pick-grid">
              {pv.trades.map((t) => (
                <article key={t.symbol} className="card pick">
                  <div className="pick-head">
                    <div><h3>{t.label} <span className="sub">{t.tf} chart</span></h3><p className="sub">{t.setup}</p></div>
                    <div className="pick-badges"><span className={`tag ${t.dir === "long" ? "ok" : "sell"}`}>{t.dir === "long" ? "Buy" : "Sell"}</span><span className="pick-score mono">{t.score}%</span></div>
                  </div>
                  <dl className="pick-levels mono">
                    <div><dt>Money</dt><dd>{money(t.money, c)}</dd></div>
                    <div><dt>{cfg.broker === "binance" ? "Leverage" : "Multiplier"}</dt><dd>{t.leverage}x</dd></div>
                    <div><dt>If stopped</dt><dd className="neg">{signed(-t.loss)}</dd></div>
                    <div><dt>Target 1 / both</dt><dd className="pos-c">{signed(t.profit1)} / {signed(t.profit2)}</dd></div>
                  </dl>
                  <p className="sub">{t.agree ? `${t.agree} other timeframe${t.agree > 1 ? "s" : ""} agree${t.agree > 1 ? "" : "s"}${t.against ? `, ${t.against} disagree` : ""}. ` : ""}Expected in roughly {hrs(t.hours[0])} to {hrs(t.hours[1])}.</p>
                  {t.opinion && <p className="auto-opinion"><b>News view ({t.stance}):</b> {t.opinion}</p>}
                </article>
              ))}
            </div>
            {totals && (
              <div className="day-sum card">
                <div><span className="sub">If every trade reaches target 1</span><b className="pos-c mono">{signed(totals.p1, c)}</b></div>
                <div><span className="sub">If they run to target 2</span><b className="pos-c mono">{signed(totals.p2, c)}</b></div>
                <div><span className="sub">If every stop-loss is hit</span><b className="neg mono">{signed(-totals.loss, c)}</b></div>
              </div>
            )}
            {pv.trades.length < cfg.count && <p className="muted">Only {pv.trades.length} of {cfg.count} qualify now. Viko fills the rest later if one appears.</p>}
          </>
        )
      )}

      <div className={`card auto-go ${live ? "live" : ""}`}>
        <ul className="auto-rules">
          <li>Stop-loss is set on {cfg.broker === "binance" ? "Binance" : "Deriv"} the moment each trade opens.</li>
          <li>At target 1, half is taken as profit and the stop moves to the entry price{cfg.broker === "binance" ? "; later it is raised to target 1" : ""}.</li>
          <li>Trades are skipped when big news is due or the news mood is against them.</li>
          <li>Everything still open is closed when your {HORIZONS.find((h) => h[0] === cfg.horizon)![1]} are up. You can collect early any time.</li>
        </ul>
        {live && <label className="check bn-agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I understand this trades my real money and that I can lose it.</label>}
        {done && <p className="ok-msg">{done}</p>}
        <button className={`btn primary auto-btn ${live ? "sell-btn" : ""}`} disabled={busy || !(cfg.amount > 0) || (live && !agree)} onClick={go}>
          {busy ? "Starting…" : live ? `Trade ${money(cfg.amount, c)} of real money` : `Start auto-trading ${money(cfg.amount, c)} (demo)`}
        </button>
      </div>
    </>
  );
}

function Running({ appKey, onOpen }: { appKey: string; onOpen: (id: string, tf: string) => void }) {
  const [st, setSt] = useState<{ plans: AutoPlan[]; positions: AutoPosition[]; events: AutoEvent[]; now: number } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const load = async (refresh: boolean) => { try { setSt(await auto.state(appKey, refresh)); setErr(""); } catch (e) { setErr((e as Error).message); } };
  useEffect(() => { load(true); const t = setInterval(() => load(true), 60000); return () => clearInterval(t); }, [appKey]);
  const collect = async (b: { plan_id?: string; position_id?: string }, what: string) => {
    if (!confirm(`Close ${what} now at the current price and keep the result?`)) return;
    setBusy(b.plan_id ?? b.position_id ?? "");
    try { await auto.close(appKey, b); await load(false); } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };
  if (!st) return <p className="muted">{err || "Loading your plans…"}</p>;
  const active = st.plans.filter((p) => p.status === "active");
  const recent = st.plans.filter((p) => p.status !== "active").slice(0, 5);
  const planCard = (p: AutoPlan) => {
    const pos = st.positions.filter((x) => x.plan_id === p.id);
    const c = cur(p.broker);
    const openPnl = pos.filter((x) => x.status === "open").reduce((a, x) => a + (x.last_pnl ?? 0), 0);
    const closedPnl = pos.filter((x) => x.status === "closed").reduce((a, x) => a + (x.pnl ?? 0), 0);
    const total = openPnl + closedPnl;
    return (
      <article key={p.id} className="card auto-plan">
        <div className="pick-head">
          <div>
            <h3>{money(p.amount, c)} on {p.broker === "binance" ? "Binance" : "Deriv"} <span className={`bn-mode ${p.mode === "live" ? "live" : ""}`}>{p.mode === "live" ? "LIVE" : "Demo"}</span></h3>
            <p className="sub">{p.count} trade{p.count > 1 ? "s" : ""}, {p.strict}%+ only, {p.risk} risk. {p.status === "active" ? `Ends in ${left(p.ends_at, st.now)}.` : `Finished ${new Date(p.closed_at ?? p.ends_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}.`}</p>
          </div>
          <div className="auto-total"><span className="sub">{p.status === "active" ? "So far" : "Result"}</span><b className={`mono ${total >= 0 ? "pos-c" : "neg"}`}>{signed(total, c)}</b></div>
        </div>
        {pos.length === 0 && p.status === "active" && <p className="muted">Watching for a setup that meets {p.strict}%. New entries until {new Date(p.enter_until).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}.</p>}
        {pos.map((x) => (
          <div key={x.id} className={`auto-pos ${x.status}`}>
            <div className="auto-pos-head">
              <button className="link" onClick={() => onOpen(x.symbol, x.tf)}><b>{x.label}</b></button>
              <span className={`tag ${x.dir === "long" ? "ok" : "sell"}`}>{x.dir === "long" ? "Buy" : "Sell"} {x.leverage}x</span>
              {x.t1_hit && <span className="tag ok">Target 1 hit</span>}
              <b className={`mono ${((x.status === "open" ? x.last_pnl : x.pnl) ?? 0) >= 0 ? "pos-c" : "neg"}`}>{signed(x.status === "open" ? x.last_pnl : x.pnl, c)}</b>
            </div>
            <div className="auto-pos-levels mono">
              <span>Entry {fmt(x.entry)}</span><span>Now {fmt(x.last_price ?? x.entry)}</span>
              <span className={x.stop !== x.initial_stop ? "moved" : ""}>Stop {fmt(x.stop)}{x.stop !== x.initial_stop ? " (moved)" : ""}</span>
              <span>Targets {fmt(x.target1)} / {fmt(x.target2)}</span>
            </div>
            {x.status === "open"
              ? <button className="btn" disabled={busy === x.id} onClick={() => collect({ position_id: x.id }, `${x.label}`)}>{busy === x.id ? "Closing…" : "Collect now"}</button>
              : <span className="sub">Closed: {x.close_reason}</span>}
          </div>
        ))}
        {p.status === "active" && <div className="row"><span /><button className="btn" disabled={busy === p.id} onClick={() => collect({ plan_id: p.id }, "every trade in this plan")}>{busy === p.id ? "Closing…" : "Collect everything now"}</button></div>}
      </article>
    );
  };
  return (
    <>
      {err && <p className="err">{err}</p>}
      {active.length === 0 ? <div className="empty-pick"><h3>No plan is running</h3><p>Start one from the Start tab.</p></div> : active.map(planCard)}
      {recent.length > 0 && <><h3 className="pick-sec">Recently finished</h3>{recent.map(planCard)}</>}
      {st.events.length > 0 && (
        <>
          <h3 className="pick-sec">What Viko did</h3>
          <ul className="feed">{st.events.slice(0, 25).map((e) => <li key={e.id}><time>{new Date(e.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time> {e.message}</li>)}</ul>
        </>
      )}
      <p className="sub">Prices and results refresh every minute while this screen is open. Viko also checks every 5 minutes when it's closed.</p>
    </>
  );
}

type Period = "day" | "week" | "month" | "year";
function periodKey(iso: string, p: Period) {
  const d = new Date(iso);
  if (p === "day") return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  if (p === "month") return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
  if (p === "year") return String(d.getFullYear());
  const m = new Date(d); m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `Week of ${m.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

function Results({ appKey }: { appKey: string }) {
  const [rows, setRows] = useState<AutoHistory[] | null>(null);
  const [err, setErr] = useState("");
  const [broker, setBroker] = useState<string>("all");
  const [mode, setMode] = useState<string>("all");
  const [period, setPeriod] = useState<Period>("week");
  useEffect(() => { auto.history(appKey).then((j) => setRows(j.rows)).catch((e) => setErr((e as Error).message)); }, [appKey]);
  const list = useMemo(() => (rows ?? []).filter((r) => (broker === "all" || r.broker === broker) && (mode === "all" || r.mode === mode)), [rows, broker, mode]);
  const groups = useMemo(() => {
    const m = new Map<string, AutoHistory[]>();
    for (const r of list) { const k = periodKey(r.closed_at, period); m.set(k, [...(m.get(k) ?? []), r]); }
    return [...m.entries()].map(([k, rs]) => ({ k, n: rs.length, invested: rs.reduce((a, r) => a + r.stake, 0), pnl: rs.reduce((a, r) => a + (r.pnl ?? 0), 0), wins: rs.filter((r) => (r.pnl ?? 0) > 0).length }));
  }, [list, period]);
  if (err) return <p className="err">{err}</p>;
  if (!rows) return <p className="muted">Loading results…</p>;
  const invested = list.reduce((a, r) => a + r.stake, 0), pnl = list.reduce((a, r) => a + (r.pnl ?? 0), 0), wins = list.filter((r) => (r.pnl ?? 0) > 0).length;
  const best = list.reduce<AutoHistory | null>((a, r) => (!a || r.pnl > a.pnl ? r : a), null), worst = list.reduce<AutoHistory | null>((a, r) => (!a || r.pnl < a.pnl ? r : a), null);
  const maxAbs = Math.max(1, ...groups.map((g) => Math.abs(g.pnl)));
  return (
    <>
      <div className="auto-filters">
        <Choice label="Broker" value={broker} options={[["all", "All"], ["binance", "Binance"], ["deriv", "Deriv"]]} onChange={setBroker} />
        <Choice label="Account" value={mode} options={[["all", "All"], ["demo", "Demo"], ["live", "Live"]]} onChange={setMode} />
        <Choice label="Group by" value={period} options={[["day", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Year"]]} onChange={setPeriod} />
      </div>
      {list.length === 0 ? <div className="empty-pick"><h3>No finished trades yet</h3><p>Results appear here as soon as the first auto-trade closes.</p></div> : (
        <>
          <div className="auto-kpis">
            <div className="card"><span className="sub">Money put in</span><b className="mono">{invested.toFixed(2)}</b></div>
            <div className="card"><span className="sub">Profit / loss</span><b className={`mono ${pnl >= 0 ? "pos-c" : "neg"}`}>{signed(pnl)}</b></div>
            <div className="card"><span className="sub">Return</span><b className={`mono ${pnl >= 0 ? "pos-c" : "neg"}`}>{invested ? `${pnl >= 0 ? "+" : "−"}${Math.abs(pnl / invested * 100).toFixed(1)}%` : "–"}</b></div>
            <div className="card"><span className="sub">Trades won</span><b className="mono">{wins} of {list.length} ({Math.round(wins / list.length * 100)}%)</b></div>
            <div className="card"><span className="sub">Best trade</span><b className="mono pos-c">{best ? `${best.label} ${signed(best.pnl)}` : "–"}</b></div>
            <div className="card"><span className="sub">Worst trade</span><b className="mono neg">{worst ? `${worst.label} ${signed(worst.pnl)}` : "–"}</b></div>
          </div>
          <p className="sub">Amounts are in each broker's currency (USDT on Binance, USD on Deriv), which are about equal.</p>
          <table className="tbl auto-periods">
            <thead><tr><th>{period[0].toUpperCase() + period.slice(1)}</th><th className="r">Trades</th><th className="r">Put in</th><th className="r">Won</th><th>Profit / loss</th></tr></thead>
            <tbody>{groups.map((g) => (
              <tr key={g.k} style={{ cursor: "default" }}>
                <td>{g.k}</td><td className="r mono">{g.n}</td><td className="r mono">{g.invested.toFixed(2)}</td><td className="r mono">{Math.round(g.wins / g.n * 100)}%</td>
                <td><span className="pl-bar"><i className={g.pnl >= 0 ? "up" : "down"} style={{ width: `${Math.abs(g.pnl) / maxAbs * 100}%` }} /></span><b className={`mono ${g.pnl >= 0 ? "pos-c" : "neg"}`}>{signed(g.pnl)}</b></td>
              </tr>
            ))}</tbody>
          </table>
          <h3 className="pick-sec">Every finished trade</h3>
          <table className="tbl compact">
            <thead><tr><th>Closed</th><th>Market</th><th>Side</th><th className="r">Put in</th><th>How it ended</th><th className="r">Result</th></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.id} style={{ cursor: "default" }}>
                <td>{new Date(r.closed_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}<span className="sub">{r.broker} {r.mode}</span></td>
                <td>{r.label}<span className="sub">{r.tf}</span></td><td>{r.dir === "long" ? "Buy" : "Sell"} {r.leverage}x</td>
                <td className="r mono">{r.stake.toFixed(2)}</td><td>{r.close_reason}</td><td className={`r mono ${r.pnl >= 0 ? "pos-c" : "neg"}`}>{signed(r.pnl)}</td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}
    </>
  );
}

function Connect({ appKey }: { appKey: string }) {
  const [res, setRes] = useState<Record<string, string>>({});
  const test = async (broker: string, mode: string) => {
    const k = `${broker}-${mode}`;
    setRes((r) => ({ ...r, [k]: "Checking…" }));
    try { const j = await auto.connect(appKey, broker, mode); setRes((r) => ({ ...r, [k]: `Connected. Balance ${j.balance.toFixed(2)} ${j.currency}${j.account ? ` (account ${j.account})` : ""}.` })); }
    catch (e) { setRes((r) => ({ ...r, [k]: (e as Error).message })); }
  };
  const row = (broker: string, mode: string, label: string) => {
    const k = `${broker}-${mode}`, v = res[k];
    return <li key={k}><button className="btn" onClick={() => test(broker, mode)}>Test {label}</button> <span className={v?.startsWith("Connected") ? "pos-c" : v && v !== "Checking…" ? "neg" : "sub"}>{v ?? ""}</span></li>;
  };
  return (
    <>
      <div className="card">
        <h3>Check your connections</h3>
        <ul className="auto-tests">{row("binance", "demo", "Binance demo")}{row("binance", "live", "Binance live")}{row("deriv", "demo", "Deriv demo")}{row("deriv", "live", "Deriv real")}</ul>
      </div>
      <div className="card bn-steps">
        <h3>Binance</h3>
        <ol className="install-steps">
          <li><b>Demo:</b> sign in at <a href="https://demo.binance.com" target="_blank" rel="noreferrer">demo.binance.com</a> → profile icon → <b>Demo Trading API</b> → <b>Create API</b>. Tick <b>Enable Futures</b>. Copy both keys.</li>
          <li><b>Live:</b> on binance.com → profile → <b>API Management</b> → <b>Create API</b>. Tick <b>Enable Futures</b>, leave <b>Enable Withdrawals off</b>. Move USDT into your <b>USDⓈ-M Futures</b> wallet.</li>
          <li>Open your <a href="https://supabase.com/dashboard/project/fkrgiaeglingmogcsyik/functions/secrets" target="_blank" rel="noreferrer">Supabase secrets page</a> and add <code>BINANCE_DEMO_KEY</code>, <code>BINANCE_DEMO_SECRET</code> (and later <code>BINANCE_LIVE_KEY</code>, <code>BINANCE_LIVE_SECRET</code>).</li>
        </ol>
      </div>
      <div className="card bn-steps">
        <h3>Deriv</h3>
        <ol className="install-steps">
          <li>Sign in at <a href="https://developers.deriv.com" target="_blank" rel="noreferrer">developers.deriv.com</a> with your Deriv login. Open the <b>Dashboard</b> and register a new application of type <b>PAT</b> (personal access token). Copy its <b>App ID</b>.</li>
          <li>Still in the dashboard, generate a <b>token</b> for that app with the <b>trade</b> scope. Copy it.</li>
          <li>Add two secrets on the <a href="https://supabase.com/dashboard/project/fkrgiaeglingmogcsyik/functions/secrets" target="_blank" rel="noreferrer">Supabase secrets page</a>: <code>DERIV_APP_ID</code> and <code>DERIV_TOKEN</code>. One token covers both your demo and your real account.</li>
          <li>For real money, you need a real Deriv <b>Options</b> account with funds (deposit with M-Pesa in Deriv's cashier). Your demo account comes with practice money already.</li>
        </ol>
      </div>
      <p className="ctx-note">Keys and tokens go only into Supabase secrets. Never paste them into chat, email, or this app.</p>
    </>
  );
}
