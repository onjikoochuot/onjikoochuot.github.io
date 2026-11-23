import { useEffect, useMemo, useState } from "react";
import type { Setup, Tf } from "../engine/types";
import { fmt } from "../engine/analyze";
import { duration, makeTip, TF_HOURS } from "../engine/layman";
import type { BnTradeIdea } from "./Binance";
import { getPicks, getQuotes, paper, save, store, type AutoPick, type PickRow, type Quote } from "../lib/api";

const TFS: Tf[] = ["5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w", "1M"];
const TF_NAME: Record<Tf, string> = { "5m": "5-min", "15m": "15-min", "30m": "30-min", "1h": "1-hour", "2h": "2-hour", "4h": "4-hour", "1d": "daily", "1w": "weekly", "1M": "monthly" };
const DAY_TFS: Tf[] = ["5m", "15m", "30m", "1h", "2h"];
type Tab = "top" | "combined" | "day";
type Bar = 95 | 90 | 80;

const toSetup = (r: PickRow) => ({ ...r.setup!, checks: [], labels: [] }) as unknown as Setup;
const gain = (dir: string, from: number, to: number) => (dir === "long" ? to - from : from - to) / from;
const pct = (x: number) => `${x >= 0 ? "+" : "−"}${(Math.abs(x) * 100).toFixed(1)}%`;
const ago = (ms: number) => { const m = Math.round(ms / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
const lean = (r?: PickRow) => (r && r.setup && !r.hard_fail && (r.score ?? 0) >= 55 ? r.dir : null);

/** A row is still usable if it was scanned recently and its chart is still printing candles (market open). */
function isFresh(r: PickRow, now: number) {
  const h = TF_HOURS[r.tf];
  if (now - Date.parse(r.scanned_at) > Math.max(45 * 60000, 2 * h * 3600000)) return false;
  const quiet = r.tf === "1M" ? 40 * 86400 : r.tf === "1w" ? 10 * 86400 : r.tf === "1d" ? 4 * 86400 : 3 * h * 3600 + 20 * 60;
  return now / 1000 - r.candle_t <= quiet;
}

export const ideaOf = (r: PickRow, price?: number): BnTradeIdea => ({ symbol: r.symbol, label: r.label, dir: r.setup!.dir, entry: price ?? r.setup!.entry, stop: r.setup!.stop, target1: r.setup!.target1, target2: r.setup!.target2, setup: `${r.setup!.name} (${r.setup!.degree}), ${r.tf}`, score: r.setup!.score });

export const pickOf = (r: PickRow): AutoPick => { const s = r.setup!; return { symbol: r.symbol, label: r.label, market: r.market, tf: r.tf, dir: s.dir, score: s.score, name: `${s.name} (${s.degree})`, stop: s.stop, target1: s.target1, target2: s.target2, expectBars: s.expectBars ?? 3 }; };
type Sel = { has: (r: PickRow) => boolean; toggle: (r: PickRow) => void };

export default function Picks({ appKey, onNeedKey, account, riskPct, onOpen, onReal }: { appKey: string; onNeedKey: () => void; account: number; riskPct: number; onOpen: (id: string, tf: Tf) => void; onBinance?: (i: BnTradeIdea) => void; onReal: (p: AutoPick[]) => void }) {
  const [rows, setRows] = useState<PickRow[]>([]);
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>(() => store("picksTab", "top"));
  const [bar, setBar] = useState<Bar>(() => store("picksBar", 95));
  const [msg, setMsg] = useState("");
  const [placing, setPlacing] = useState("");
  const [picked, setPicked] = useState<Record<string, PickRow>>({});
  const sel: Sel = { has: (r) => !!picked[r.symbol + r.tf], toggle: (r) => setPicked((m) => { const k = r.symbol + r.tf, n = { ...m }; if (n[k]) delete n[k]; else n[k] = r; return n; }) };
  const chosen = Object.values(picked);

  const load = async () => {
    try { const j = await getPicks(); setRows(j.rows); setNow(Date.now()); setErr(""); }
    catch (e) { setErr((e as Error).message); }
    setLoading(false);
  };
  useEffect(() => { load(); const t = setInterval(load, 120000); return () => clearInterval(t); }, []);
  useEffect(() => save("picksTab", tab), [tab]);
  useEffect(() => save("picksBar", bar), [bar]);

  const fresh = useMemo(() => rows.filter((r) => isFresh(r, now)), [rows, now]);
  const approved = (min: number) => fresh.filter((r) => r.verdict === "APPROVED" && (r.score ?? 0) >= min).sort((a, b) => (b.score! - a.score!) || (b.rr1! - a.rr1!));
  const lastScan = rows.reduce((m, r) => Math.max(m, Date.parse(r.scanned_at)), 0);

  const paperIt = async (r: PickRow) => {
    if (!appKey) { onNeedKey(); return; }
    const s = r.setup!;
    const tip = makeTip(toSetup(r), r.label, r.tf, Math.floor(now / 1000), account, riskPct);
    setPlacing(r.symbol + r.tf); setMsg("");
    try {
      await paper.open(appKey, { symbol: r.symbol, label: r.label, tf: r.tf, dir: s.dir, stop: s.stop, target1: s.target1, target2: s.target2, setup: `${s.name} (${s.degree}), from Today's picks`, score: s.score, tip: [tip.headline, ...tip.steps].join("\n"), source: "manual" });
      setMsg(`Paper trade opened on ${r.label}. See it under Paper trading.`);
    } catch (e) { setMsg((e as Error).message); }
    setPlacing("");
  };

  return (
    <section className="view picks">
      <header className="view-head">
        <div>
          <h2>Today's picks</h2>
          <p>Viko checks all 373 markets on all 9 timeframes in the background, every 15 minutes, and keeps only the setups the books approve. Tick the ones you like and trade them together with real money. {lastScan ? `Last check ${ago(now - lastScan)}.` : ""}</p>
        </div>
        <div className="picks-bar">
          <span>Only show</span>
          <div className="seg" role="group" aria-label="Minimum score">
            {([95, 90, 80] as Bar[]).map((b) => <button key={b} className={bar === b ? "on" : ""} aria-pressed={bar === b} onClick={() => setBar(b)}>{b}%+</button>)}
          </div>
        </div>
      </header>
      <p className="picks-note">The % is how many of the Elliott Wave and Wyckoff rules agree, not a promise of profit. No method wins every time, so always use the stop-loss.</p>

      <div className="seg picks-tabs" role="tablist">
        {([["top", "Top picks"], ["combined", "All timeframes agree"], ["day", "Plan my day"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {err && <p className="err">{err}</p>}
      {msg && <p className="ok-msg">{msg}</p>}
      {loading && <p className="muted">Loading the latest scan…</p>}

      {!loading && tab === "top" && <TopPicks sel={sel} onReal={onReal} list={approved(bar)} below={bar > 80 ? approved(80).filter((r) => r.score! < bar) : []} bar={bar} now={now} account={account} riskPct={riskPct} onOpen={onOpen} onPaper={paperIt} placing={placing} />}
      {!loading && tab === "combined" && <Combined fresh={fresh} onOpen={onOpen} />}
      {chosen.length > 0 && (
        <div className="sel-bar" role="region" aria-label="Selected picks">
          <span><b>{chosen.length}</b> selected: {chosen.map((r) => r.label).join(", ")}</span>
          <span className="pick-btns"><button className="btn" onClick={() => setPicked({})}>Clear</button><button className="btn primary" onClick={() => onReal(chosen.map(pickOf))}>Trade {chosen.length === 1 ? "it" : `all ${chosen.length}`} with real money</button></span>
        </div>
      )}
      {!loading && tab === "day" && <DayPlan onReal={onReal} fresh={fresh} bar={bar} now={now} onOpen={onOpen} onPaper={paperIt} placing={placing} />}
    </section>
  );
}

function PickHead({ r }: { r: PickRow }) {
  const s = r.setup!;
  return (
    <div className="pick-head">
      <div>
        <h3>{r.label} <span className="sub">{TF_NAME[r.tf]} chart</span></h3>
        <p className="sub">{s.name}, {s.degree.toLowerCase()} · {r.market}</p>
      </div>
      <div className="pick-badges">
        <span className={`tag ${s.dir === "long" ? "ok" : "sell"}`}>{s.dir === "long" ? "Buy" : "Sell"}</span>
        <span className="pick-score mono">{s.score}%</span>
      </div>
    </div>
  );
}

function Levels({ r }: { r: PickRow }) {
  const s = r.setup!;
  return (
    <dl className="pick-levels mono">
      <div><dt>Entry</dt><dd>{fmt(s.entry)}</dd></div>
      <div><dt>Stop-loss</dt><dd className="neg">{fmt(s.stop)} <small>{pct(gain(s.dir, s.entry, s.stop))}</small></dd></div>
      <div><dt>Target 1</dt><dd className="pos-c">{fmt(s.target1)} <small>{pct(gain(s.dir, s.entry, s.target1))}</small></dd></div>
      <div><dt>Target 2</dt><dd className="pos-c">{fmt(s.target2)} <small>{pct(gain(s.dir, s.entry, s.target2))}</small></dd></div>
    </dl>
  );
}

function NewsWarn({ r }: { r: PickRow }) {
  if (!r.news_warn) return null;
  const m = r.news_warn.match(/^(.*) is due (.*)$/);
  const at = m ? new Date(m[2]) : null;
  return <p className="pick-warn">Big news first: {m ? m[1] : r.news_warn}{at ? ` at ${at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : ""}. Wait until it's out.</p>;
}

function TopPicks({ sel, onReal, list, below, bar, now, account, riskPct, onOpen, onPaper, placing }: { list: PickRow[]; below: PickRow[]; bar: Bar; now: number; account: number; riskPct: number; onOpen: (id: string, tf: Tf) => void; onPaper: (r: PickRow) => void; placing: string; sel: Sel; onReal: (p: AutoPick[]) => void }) {
  const card = (r: PickRow, dim = false) => {
    const tip = makeTip(toSetup(r), r.label, r.tf, Math.floor(now / 1000), account, riskPct);
    return (
      <article key={r.symbol + r.tf} className={`card pick ${dim ? "dim" : ""} ${sel.has(r) ? "picked" : ""}`}>
        <PickHead r={r} />
        <label className="check pick-sel"><input type="checkbox" checked={sel.has(r)} onChange={() => sel.toggle(r)} /> Select to trade with others</label>
        <Levels r={r} />
        <NewsWarn r={r} />
        <ol className="tip-steps">{tip.steps.slice(0, 4).map((x) => <li key={x}>{x}</li>)}</ol>
        <div className="pick-foot">
          <span className="sub">Checked {ago(now - Date.parse(r.scanned_at))} at {fmt(r.price)}</span>
          <span className="pick-btns">
            <button className="btn" onClick={() => onOpen(r.symbol, r.tf)}>Open chart</button>
            <button className="btn" onClick={() => onPaper(r)} disabled={placing === r.symbol + r.tf}>{placing === r.symbol + r.tf ? "Placing…" : "Paper trade"}</button>
            <button className="btn primary" onClick={() => onReal([pickOf(r)])}>Real money</button>
          </span>
        </div>
      </article>
    );
  };
  return (
    <>
      {list.length === 0 && (
        <div className="empty-pick">
          <h3>Nothing scores {bar}% or more right now</h3>
          <p>That's normal: setups this clean are rare, and Viko won't lower its bar to fill the page. It checks again every 15 minutes.{below.length ? " Below are the approved setups just under your bar." : ""}</p>
        </div>
      )}
      <div className="pick-grid">{list.map((r) => card(r))}</div>
      {below.length > 0 && (
        <>
          <h3 className="pick-sec">Approved, but under {bar}%</h3>
          <div className="pick-grid">{below.map((r) => card(r, true))}</div>
        </>
      )}
    </>
  );
}

function TfDots({ by, focus }: { by: Partial<Record<Tf, PickRow>>; focus?: Tf }) {
  return (
    <div className="tf-dots" aria-label="Direction on each timeframe">
      {TFS.map((t) => {
        const d = lean(by[t]);
        return (
          <span key={t} className={`tf-dot ${d === "long" ? "up" : d === "short" ? "down" : ""} ${focus === t ? "focus" : ""}`} title={`${TF_NAME[t]}: ${d === "long" ? "leans up" : d === "short" ? "leans down" : "no clear direction"}`}>
            <b>{d === "long" ? "▲" : d === "short" ? "▼" : "·"}</b>{t}
          </span>
        );
      })}
    </div>
  );
}

function agreeText(agree: number, against: number) {
  const n = (k: number, one: string, many: string) => `${k} other timeframe${k === 1 ? "" : "s"} ${k === 1 ? one : many}`;
  const opp = `${against} point${against === 1 ? "s" : ""} the other way`;
  if (against) return agree ? `${n(agree, "agrees", "agree")}, but ${opp}. Use a smaller size, or wait.` : `No other timeframe agrees, and ${opp}. Treat this one with care.`;
  if (agree >= 3) return `${n(agree, "agrees", "agree")} and none disagree. This is as aligned as it gets.`;
  return agree ? `${n(agree, "agrees", "agree")} and none disagree.` : "No other timeframe confirms it yet.";
}

function Combined({ fresh, onOpen }: { fresh: PickRow[]; onOpen: (id: string, tf: Tf) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, Partial<Record<Tf, PickRow>>>();
    for (const r of fresh) { const g = m.get(r.symbol) ?? {}; g[r.tf] = r; m.set(r.symbol, g); }
    const strong: { by: Partial<Record<Tf, PickRow>>; r: PickRow; agree: number; against: number }[] = [];
    const lining: { by: Partial<Record<Tf, PickRow>>; label: string; symbol: string; dir: "long" | "short"; agree: number }[] = [];
    for (const [symbol, by] of m) {
      const best = Object.values(by).filter((r) => r!.verdict === "APPROVED").sort((a, b) => b!.score! - a!.score!)[0];
      const count = (d: string) => TFS.filter((t) => lean(by[t]) === d).length;
      if (best) {
        const agree = count(best.dir!) - 1, against = count(best.dir === "long" ? "short" : "long");
        strong.push({ by, r: best, agree, against });
      } else {
        for (const d of ["long", "short"] as const) {
          const a = count(d), o = count(d === "long" ? "short" : "long");
          if (a >= 4 && o === 0) lining.push({ by, symbol, label: Object.values(by)[0]!.label, dir: d, agree: a });
        }
      }
    }
    strong.sort((a, b) => (b.agree - 2 * b.against) - (a.agree - 2 * a.against) || b.r.score! - a.r.score!);
    lining.sort((a, b) => b.agree - a.agree);
    return { strong, lining: lining.slice(0, 10) };
  }, [fresh]);

  return (
    <>
      <p className="muted">A trade is stronger when the shorter and longer charts point the same way. ▲ means that timeframe leans up, ▼ down, · no clear direction.</p>
      {groups.strong.length === 0 && <div className="empty-pick"><h3>No approved setups right now</h3><p>Check the markets lining up below: they are the ones to watch.</p></div>}
      <div className="pick-grid">
        {groups.strong.map(({ by, r, agree, against }) => (
          <article key={r.symbol} className="card pick">
            <PickHead r={r} />
            <TfDots by={by} focus={r.tf} />
            <p className={`pick-agree ${against ? "warn" : ""}`}>
              {agreeText(agree, against)}
            </p>
            <Levels r={r} />
            <NewsWarn r={r} />
            <div className="pick-foot"><span /><button className="btn" onClick={() => onOpen(r.symbol, r.tf)}>Open chart</button></div>
          </article>
        ))}
      </div>
      {groups.lining.length > 0 && (
        <>
          <h3 className="pick-sec">Lining up, not approved yet</h3>
          <p className="muted">Most timeframes already point the same way, but no chart has fired its entry signal. Wait for an approval here before trading.</p>
          <div className="lining">
            {groups.lining.map((g) => (
              <button key={g.symbol + g.dir} className="lining-row" onClick={() => onOpen(g.symbol, "1h")}>
                <span><b>{g.label}</b> <span className={`tag ${g.dir === "long" ? "ok" : "sell"}`}>{g.dir === "long" ? "Leaning up" : "Leaning down"}</span></span>
                <TfDots by={g.by} />
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function DayPlan({ onReal, fresh, bar, now, onOpen, onPaper, placing }: { fresh: PickRow[]; bar: Bar; now: number; onOpen: (id: string, tf: Tf) => void; onPaper: (r: PickRow) => void; placing: string; onReal: (p: AutoPick[]) => void }) {
  const [amount, setAmount] = useState<number>(() => store("dayAmount", 10000));
  const [cur, setCur] = useState<string>(() => store("dayCur", "KES"));
  const [count, setCount] = useState<number>(() => store("dayCount", 2));
  const [canShort, setCanShort] = useState<boolean>(() => store("dayShort", false));
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  useEffect(() => { save("dayAmount", amount); save("dayCur", cur); save("dayCount", count); save("dayShort", canShort); }, [amount, cur, count, canShort]);

  const end = new Date(now); end.setHours(23, 59, 0, 0);
  const hoursLeft = (end.getTime() - now) / 3600000;
  const est = (r: PickRow) => (r.setup!.expectBars ?? 3) * TF_HOURS[r.tf];
  const pool = (min: number) => {
    const seen = new Set<string>();
    return fresh
      .filter((r) => DAY_TFS.includes(r.tf) && r.verdict === "APPROVED" && (r.score ?? 0) >= min && (canShort || r.dir === "long") && est(r) <= hoursLeft)
      .sort((a, b) => (b.score! - a.score!) || (b.rr1! - a.rr1!))
      .filter((r) => (seen.has(r.symbol) ? false : (seen.add(r.symbol), true)));
  };
  const chosen = pool(bar).slice(0, count);
  const near = bar > 80 ? pool(80).filter((r) => r.score! < bar).slice(0, 3) : [];
  const ids = [...chosen, ...near].map((r) => r.symbol).join(",");
  useEffect(() => { if (ids) getQuotes(ids.split(",")).then(setQuotes).catch(() => {}); }, [ids]);

  const money = (x: number) => `${cur} ${Math.abs(x).toLocaleString(undefined, { maximumFractionDigits: x !== 0 && Math.abs(x) < 10 ? 2 : 0 })}`;
  const per = chosen.length ? amount / chosen.length : amount;
  const plan = (r: PickRow, alloc: number) => {
    const s = r.setup!;
    const loss = alloc * Math.abs(gain(s.dir, s.entry, s.stop));
    const p1 = alloc * gain(s.dir, s.entry, s.target1);
    const p2 = alloc / 2 * gain(s.dir, s.entry, s.target1) + alloc / 2 * gain(s.dir, s.entry, s.target2);
    const live = quotes[r.symbol]?.price;
    const moved = live !== undefined && gain(s.dir, s.entry, live) > 0.5 * gain(s.dir, s.entry, s.target1);
    const broken = live !== undefined && gain(s.dir, s.entry, live) <= gain(s.dir, s.entry, s.stop);
    const from = new Date(now + est(r) * 0.6 * 3600000), to = new Date(Math.min(end.getTime(), now + est(r) * 1.6 * 3600000));
    const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return { s, loss, p1, p2, live, moved, broken, window: `${t(from)} and ${t(to)}` };
  };
  const plans = chosen.map((r) => ({ r, ...plan(r, per) }));
  const best = plans.reduce((a, p) => a + p.p2, 0), first = plans.reduce((a, p) => a + p.p1, 0), worst = plans.reduce((a, p) => a + p.loss, 0);

  return (
    <>
      <form className="card day-form" onSubmit={(e) => e.preventDefault()}>
        <label>How much do you want to put in today?
          <span className="money-in">
            <input value={cur} onChange={(e) => setCur(e.target.value.toUpperCase().slice(0, 4))} aria-label="Currency" className="cur" />
            <input type="number" min={1} step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} aria-label="Amount" />
          </span>
        </label>
        <label>Split it across
          <span className="seg">{[1, 2, 3].map((n) => <button type="button" key={n} className={count === n ? "on" : ""} onClick={() => setCount(n)}>{n} trade{n > 1 ? "s" : ""}</button>)}</span>
        </label>
        <label className="check"><input type="checkbox" checked={canShort} onChange={(e) => setCanShort(e.target.checked)} /> My broker lets me sell short (CFDs or futures)</label>
        <p className="sub">Only same-day setups ({DAY_TFS.join(", ")} charts) expected to reach target 1 before midnight ({duration(hoursLeft)} left). Profit figures are before broker fees.</p>
      </form>

      {plans.length === 0 ? (
        <div className="empty-pick">
          <h3>No trade today at {bar}% or more</h3>
          <p>None of today's short-term setups meets your bar and can finish before midnight{canShort ? "" : " (buy trades only)"}. Keeping your {money(amount)} is the right call. Viko checks again every 15 minutes.</p>
          {near.length > 0 && <p>Closest, under your bar: {near.map((r) => `${r.label} ${r.tf} (${r.score}%)`).join(", ")}. Switch to {near[0].score! >= 90 ? "90" : "80"}%+ above to see the plan for them.</p>}
        </div>
      ) : (
        <>
          <div className="day-sum card">
            <div><span className="sub">If every trade reaches target 1</span><b className="pos-c mono">+{money(first)}</b></div>
            <div><span className="sub">If they run to target 2</span><b className="pos-c mono">+{money(best)}</b></div>
            <div><span className="sub">If every stop-loss is hit</span><b className="neg mono">−{money(worst)}</b></div>
            <div><button className="btn primary" onClick={() => onReal(plans.filter((p) => !p.broken).map((p) => pickOf(p.r)))}>Trade this plan with real money</button></div>
          </div>
          <div className="pick-grid">
            {plans.map(({ r, s, loss, p1, p2, live, moved, broken, window }, i) => (
              <article key={r.symbol} className="card pick">
                <PickHead r={r} />
                <ol className="tip-steps">
                  <li>{s.dir === "long" ? "Buy" : "Sell short"} <b>{r.label}</b> with <b>{money(per)}</b> at about <b className="mono">{fmt(s.entry)}</b>{live !== undefined ? <> (live now: <span className="mono">{fmt(live)}</span>)</> : null}.</li>
                  <li>Set the stop-loss at <b className="mono">{fmt(s.stop)}</b>. If it's hit you lose about <b className="neg">{money(loss)}</b>.</li>
                  <li>{s.dir === "long" ? "Sell" : "Buy back"} half at <b className="mono">{fmt(s.target1)}</b> (about <b className="pos-c">+{money(p1 / 2)}</b>), then move the stop to your entry price.</li>
                  <li>{s.dir === "long" ? "Sell" : "Buy back"} the rest at <b className="mono">{fmt(s.target2)}</b>. Both targets together: about <b className="pos-c">+{money(p2)}</b>.</li>
                  <li>Expect target 1 roughly between {window}. Close whatever is still open before you sleep.</li>
                </ol>
                {broken && <p className="pick-warn">The price has already passed the stop-loss since the scan. Skip this one.</p>}
                {!broken && moved && <p className="pick-warn">The price has already moved more than halfway to target 1. Don't chase it: skip, or wait for a pullback near {fmt(s.entry)}.</p>}
                <NewsWarn r={r} />
                <div className="pick-foot">
                  <span className="sub">Pick {i + 1} of {plans.length}</span>
                  <span className="pick-btns">
                    <button className="btn" onClick={() => onOpen(r.symbol, r.tf)}>Open chart</button>
                    <button className="btn" onClick={() => onPaper(r)} disabled={placing === r.symbol + r.tf}>{placing === r.symbol + r.tf ? "Placing…" : "Practise on paper"}</button>
                    {!broken && <button className="btn primary" onClick={() => onReal([pickOf(r)])}>Real money</button>}
                  </span>
                </div>
              </article>
            ))}
          </div>
          {plans.length < count && <p className="muted">Only {plans.length} setup{plans.length === 1 ? "" : "s"} met the bar today, so the full amount is split across {plans.length === 1 ? "that one" : "those"}. You can also keep part of it aside.</p>}
        </>
      )}
    </>
  );
}
