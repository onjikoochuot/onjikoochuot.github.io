import { useEffect, useState } from "react";
import { fmt } from "../engine/analyze";
import { paper, type AutoPick, type PendingOrder } from "../lib/api";

export type Wait = { mode: "now" | "price" | "confirm"; level: number | null; hours: number; minScore: number; askFirst: boolean; askMinutes: number; noAnswer: "wait" | "cancel" };
type P = AutoPick & { price?: number; entryLevel?: number; triggered?: boolean };

/** The best default: wait for Viko's trigger level when the setup hasn't fired yet, otherwise open now. Real money asks you first by default. */
export function defaultWait(picks: P[], kind: "paper" | "real" = "paper"): Wait {
  const p = picks[0];
  const base = { hours: 72, minScore: 80, askFirst: kind === "real", askMinutes: 60, noAnswer: "wait" as const };
  if (picks.length === 1 && p && p.triggered === false && p.entryLevel && p.entryLevel > 0) return { mode: "price", level: p.entryLevel, ...base };
  return { mode: "now", level: null, ...base };
}

/** The extra fields a waiting order sends to the server. */
export const waitFields = (w: Wait) => ({ waitFor: w.mode, level: w.level, hours: w.hours, minScore: w.minScore, askFirst: w.askFirst, askMinutes: w.askMinutes, noAnswer: w.noAnswer });

/** Is the waiting price between the stop-loss and target 1? Returns a problem, or "". */
export function levelProblem(p: P, level: number | null): string {
  if (!(level && level > 0)) return "Enter the price to wait for.";
  const long = p.dir === "long";
  if (long ? level <= p.stop : level >= p.stop) return `That's ${long ? "at or below" : "at or above"} the stop-loss (${fmt(p.stop)}).`;
  if (long ? level >= p.target1 : level <= p.target1) return `That's already past target 1 (${fmt(p.target1)}).`;
  return "";
}

export function waitSentence(p: P, w: Wait): string {
  const then = w.askFirst ? " Viko then asks you before opening it." : "";
  if (w.mode === "confirm") return `Waits until Viko re-reads the ${p.tf} chart and approves the setup at ${w.minScore}%+ with its trigger fired.${then}`;
  if (w.mode === "price" && w.level) {
    const up = p.price != null ? w.level > p.price : false;
    return `Waits until the price ${up ? "rises" : "dips"} to ${fmt(w.level)}${p.price != null ? ` (now ${fmt(p.price)})` : ""}.${then}`;
  }
  return "";
}

function Seg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg" role="radiogroup" aria-label={label}>{options.map(([v, l]) => <button type="button" key={String(v)} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

/** "When to open": now, at a price you choose, or when Viko confirms; then open automatically or ask you first. Shared by the paper and real-money tickets. */
export default function WhenToOpen({ picks, value, onChange }: { picks: P[]; value: Wait; onChange: (w: Wait) => void }) {
  const many = picks.length > 1, p = picks[0]!;
  const opts: [Wait["mode"], string][] = many ? [["now", "Now"], ["confirm", "When Viko confirms"]] : [["now", "Now"], ["price", "At my price"], ["confirm", "When Viko confirms"]];
  const suggested = p.entryLevel && p.triggered === false ? p.entryLevel : p.price != null ? (p.dir === "long" ? p.price - (p.price - p.stop) * 0.3 : p.price + (p.stop - p.price) * 0.3) : null;
  const problem = !many && value.mode === "price" ? levelProblem(p, value.level) : "";
  const set = (x: Partial<Wait>) => onChange({ ...value, ...x });
  return (
    <div className="auto-field wto">
      <span className="auto-label">When to open</span>
      <Seg label="When to open" value={value.mode} options={opts} onChange={(m) => set({ mode: m, level: m === "price" ? value.level ?? (suggested ? Number(suggested.toPrecision(6)) : null) : value.level })} />
      {value.mode === "now" && <small className="sub">{p.triggered === false ? "Careful: Viko's entry trigger hasn't fired yet on this chart. Waiting is usually better." : "Opens straight away at the live price."}</small>}
      {value.mode === "price" && (
        <>
          <span className="money-in wto-level"><input className="cur" value="at" readOnly aria-label="" /><input type="number" step="any" inputMode="decimal" value={value.level ?? ""} onChange={(e) => set({ level: Number(e.target.value) || null })} aria-label="Entry price to wait for" /></span>
          {problem ? <small className="err">{problem}</small> : <small className="sub">{waitSentence(p, { ...value, askFirst: false })}{p.entryLevel && p.triggered === false ? ` Viko's own trigger level is ${fmt(p.entryLevel)}.` : ""} Stop-loss {fmt(p.stop)} and targets stay the same.</small>}
        </>
      )}
      {value.mode === "confirm" && (
        <small className="sub">Viko re-reads the chart every 5 minutes and acts only when the setup is approved ({value.minScore}%+) and its trigger has fired, using the stop-loss and targets from that moment. If the setup never confirms, nothing is traded.</small>
      )}
      {value.mode !== "now" && (
        <>
          <span className="auto-label wto-sub">When the entry comes</span>
          <Seg label="When the entry comes" value={value.askFirst ? "ask" : "auto"} options={[["ask", "Ask me first"], ["auto", "Open it automatically"]]} onChange={(v) => set({ askFirst: v === "ask" })} />
          {value.askFirst ? (
            <>
              <small className="sub">Viko sends you an alert (and shows it at the top of the app). You see the live price, change the amount if you want, then Approve or Skip. Nothing is traded without your OK.</small>
              <span className="auto-label wto-sub">Time to answer</span>
              <Seg label="Time to answer" value={value.askMinutes} options={[[15, "15 min"], [60, "1 hour"], [240, "4 hours"]]} onChange={(v) => set({ askMinutes: v })} />
              <span className="auto-label wto-sub">If I don't answer in time</span>
              <Seg label="If I don't answer in time" value={value.noAnswer} options={[["wait", "Keep waiting for the entry"], ["cancel", "Cancel it"]]} onChange={(v) => set({ noAnswer: v })} />
            </>
          ) : <small className="sub">Viko opens it by itself the moment the entry comes, even if you're asleep. You get an alert when it opens.</small>}
          <span className="auto-label wto-sub">Give up after</span>
          <Seg label="Give up after" value={value.hours} options={[[24, "1 day"], [72, "3 days"], [168, "1 week"]]} onChange={(v) => set({ hours: v })} />
          <small className="sub">Checked every 5 minutes. Cancelled at no cost if the price hits the stop-loss first or time runs out. You can change the amount or cancel any time before it opens. Once open, it's managed like any other trade: trailing stop-loss, take-profit, alerts.</small>
        </>
      )}
    </div>
  );
}

// ---------- The list of waiting orders ----------
const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const left = (iso: string) => { const h = (Date.parse(iso) - Date.now()) / 3600000; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`; };
const BROKER_NAME: Record<string, string> = { binance: "Binance", bybit: "Bybit", mt5: "MT5", deriv: "Deriv" };
const STATUS: Record<string, string> = { opened: "Opened", cancelled: "Cancelled", expired: "Gave up", failed: "Failed", skipped: "Skipped" };
const amountOf = (o: PendingOrder) => Number(o.kind === "paper" ? o.amount : o.cfg?.amount ?? 0);
const accountOf = (o: PendingOrder) => (o.kind === "paper" ? "Paper" : o.cfg?.mode === "live" ? "Real money" : "Demo");
const money = (o: PendingOrder, x: number) => (o.kind === "paper" ? `$${x.toFixed(2)}` : `${x.toFixed(2)}`);
const usd = (x: number) => `${x < 0 ? "−" : "+"}$${Math.abs(x).toFixed(2)}`;
const brokerOf = (o: PendingOrder) => (o.cfg?.broker === "both" ? "your brokers" : BROKER_NAME[o.cfg?.broker ?? ""] ?? o.cfg?.broker ?? "");

/** An order whose entry has come and that waits for your OK: live price, amount you can change, Approve / Skip. */
function AskCard({ o, appKey, onChanged }: { o: PendingOrder; appKey: string; onChanged: () => void }) {
  const [amount, setAmount] = useState(amountOf(o));
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const lv = o.ask_levels ?? { stop: o.stop, target1: o.target1, target2: o.target2, score: o.score, name: o.name };
  const price = Number(o.last_price ?? o.ask_price ?? 0);
  const live = o.kind === "real" && o.cfg?.mode === "live";
  const pct = (to: number) => (price ? Math.abs(to - price) / price : 0);
  const act = async (what: "approve" | "skip") => {
    setBusy(what); setErr("");
    try {
      if (what === "approve") { const r = await paper.pendingApprove(appKey, o.id, amount); setOk(r.note); }
      else { await paper.pendingSkip(appKey, o.id); setOk("Skipped. Nothing was traded."); }
      setTimeout(onChanged, 1500);
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };
  return (
    <li className="ask-card">
      <div className="wait-top">
        <b>{o.label}</b>
        <span className={`tag ${o.dir === "long" ? "ok" : "sell"}`}>{o.dir === "long" ? "Buy" : "Sell"}</span>
        <span className="tag no">{o.tf}</span>
        <span className={`tag ${live ? "sell" : "no"}`}>{accountOf(o)}</span>
        <span className="tag watch">Needs your OK{o.ask_until ? `: ${left(o.ask_until)} left` : ""}</span>
      </div>
      <p>The entry came at <b className="mono">{fmt(Number(o.ask_price))}</b>{o.wait_for === "confirm" ? ` and Viko confirmed the setup at ${lv.score}%` : ""}. Price now <b className="mono">{fmt(price)}</b>. Stop-loss <span className="mono neg">{fmt(lv.stop)}</span>, target 1 <span className="mono pos-c">{fmt(lv.target1)}</span>, target 2 <span className="mono pos-c">{fmt(lv.target2)}</span>.</p>
      {ok ? <p className="ok-msg">{ok}</p> : (
        <>
          <div className="ask-row">
            <label className="auto-field"><span className="auto-label">Amount{o.kind === "real" ? ` (${brokerOf(o)})` : ""}</span>
              <span className="money-in"><input className="cur" value={o.kind === "paper" ? "$" : "amt"} readOnly aria-label="" /><input type="number" min={1} step="any" inputMode="decimal" value={amount || ""} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} aria-label="Amount to trade" /></span>
            </label>
            {o.kind === "paper" && amount > 0 && price > 0 && (
              <dl className="pick-levels mono ask-figs">
                <div><dt>Profit at target 1</dt><dd className="pos-c">{usd((amount / 2) * pct(lv.target1))}</dd></div>
                <div><dt>If it runs to target 2</dt><dd className="pos-c">{usd((amount / 2) * pct(lv.target1) + (amount / 2) * pct(lv.target2))}</dd></div>
                <div><dt>If stopped</dt><dd className="neg">{usd(-amount * pct(lv.stop))}</dd></div>
              </dl>
            )}
          </div>
          {o.kind === "real" && <p className="sub">Viko sets the leverage from your risk choice, exactly as on the trade ticket, and checks your daily limits and balance before placing it.</p>}
          {live && <label className="check bn-agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I understand this trades my real money and that I can lose it.</label>}
          {err && <p className="err">{err}</p>}
          <div className="rt-actions">
            <button className="btn" disabled={!!busy} onClick={() => act("skip")}>{busy === "skip" ? "Skipping…" : "Skip"}</button>
            <button className={`btn primary ${live ? "sell-btn" : ""}`} disabled={!!busy || !(amount > 0) || (live && !agree)} onClick={() => act("approve")}>{busy === "approve" ? "Opening…" : `Approve: ${o.dir === "long" ? "buy" : "sell"} ${money(o, amount)}`}</button>
          </div>
          <p className="sub">Viko re-checks the price when you press Approve and refuses if the trade is no longer worth taking. {o.no_answer === "wait" ? "If you don't answer, it goes back to waiting for the entry." : "If you don't answer, it's cancelled."}</p>
        </>
      )}
    </li>
  );
}

/** A waiting order: what it waits for, with the amount and "ask me first" you can change, and Cancel. */
function WaitRow({ o, appKey, onChanged }: { o: PendingOrder; appKey: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(amountOf(o));
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState(o.ask_first); // shown straight away; the server confirms it
  useEffect(() => setAsk(o.ask_first), [o.ask_first]);
  const run = async (f: () => Promise<unknown>, undo?: () => void) => { setErr(""); try { await f(); setEditing(false); onChanged(); } catch (e) { undo?.(); setErr((e as Error).message); } };
  return (
    <li>
      <div className="wait-top">
        <b>{o.label}</b>
        <span className={`tag ${o.dir === "long" ? "ok" : "sell"}`}>{o.dir === "long" ? "Buy" : "Sell"}</span>
        <span className="tag no">{o.tf}</span>
        <span className="tag no">{accountOf(o)}</span>
        <button className="btn ghost small" onClick={() => run(() => paper.pendingCancel(appKey, o.id))}>Cancel</button>
      </div>
      <p className="sub">
        {o.wait_for === "price" ? `Opens at ${fmt(Number(o.level))}` : `Opens when Viko confirms at ${o.min_score}%+`}
        {o.last_price != null ? `; price now ${fmt(Number(o.last_price))}` : ""}. Stop-loss {fmt(Number(o.stop))}, target 1 {fmt(Number(o.target1))}.
        {" "}Gives up in {left(o.expires_at)}.{o.note ? ` ${o.note}` : ""}
      </p>
      <div className="wait-ctl">
        {editing ? (
          <>
            <span className="money-in small-in"><input className="cur" value={o.kind === "paper" ? "$" : "amt"} readOnly aria-label="" /><input type="number" min={1} step="any" inputMode="decimal" autoFocus value={amount || ""} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} aria-label="New amount" /></span>
            <button className="btn small primary" disabled={!(amount > 0)} onClick={() => run(() => paper.pendingEdit(appKey, { id: o.id, amount }))}>Save</button>
            <button className="btn small ghost" onClick={() => { setEditing(false); setAmount(amountOf(o)); }}>Cancel</button>
          </>
        ) : (
          <span>Amount <b className="mono">{money(o, amountOf(o))}</b>{o.kind === "real" ? ` on ${brokerOf(o)}` : ""} <button className="link" onClick={() => setEditing(true)}>Change</button></span>
        )}
        <label className="check"><input type="checkbox" checked={ask} onChange={(e) => { const v = e.target.checked; setAsk(v); run(() => paper.pendingEdit(appKey, { id: o.id, askFirst: v }), () => setAsk(!v)); }} /> Ask me before opening</label>
      </div>
      {err && <p className="err">{err}</p>}
    </li>
  );
}

/** Orders waiting for their entry: the ones that need your OK first, then the rest, then what happened to recent ones. */
export function WaitingOrders({ appKey, kind }: { appKey: string; kind?: "paper" | "real" }) {
  const [d, setD] = useState<{ waiting: PendingOrder[]; recent: PendingOrder[] } | null>(null);
  const [err, setErr] = useState("");
  // Also tells the banner at the top, so it updates the moment you approve or skip.
  const load = () => paper.pendingList(appKey).then((r) => { const x = { waiting: r?.waiting ?? [], recent: r?.recent ?? [] }; setD(x); setErr(""); window.dispatchEvent(new CustomEvent("viko:pending", { detail: x.waiting.filter((o) => o.status === "asking") })); }).catch((e) => setErr((e as Error).message));
  useEffect(() => { if (!appKey) return; load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, [appKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return err ? <p className="err">{err}</p> : null;
  const mine = (o: PendingOrder) => !kind || o.kind === kind;
  const asking = d.waiting.filter((o) => mine(o) && o.status === "asking");
  const waiting = d.waiting.filter((o) => mine(o) && o.status === "waiting");
  const recent = d.recent.filter(mine);
  if (!asking.length && !waiting.length && !recent.length) return null;
  return (
    <section className={`card waiting ${asking.length ? "has-ask" : ""}`} id="waiting">
      {asking.length > 0 && (
        <>
          <h3>Needs your approval <span className="tag watch">{asking.length}</span></h3>
          <ul className="wait-list">{asking.map((o) => <AskCard key={o.id} o={o} appKey={appKey} onChanged={load} />)}</ul>
        </>
      )}
      <h3>Waiting for entry {waiting.length > 0 && <span className="tag no">{waiting.length}</span>}</h3>
      {err && <p className="err">{err}</p>}
      {waiting.length === 0 && <p className="sub">Nothing waiting right now.</p>}
      <ul className="wait-list">{waiting.map((o) => <WaitRow key={o.id} o={o} appKey={appKey} onChanged={load} />)}</ul>
      {recent.length > 0 && (
        <details className="wait-recent">
          <summary>Recently finished ({recent.length})</summary>
          <ul className="wait-list">{recent.map((o) => (
            <li key={o.id}><b>{o.label}</b> <span className={`tag ${o.status === "opened" ? "ok" : "no"}`}>{STATUS[o.status] ?? o.status}</span> <span className="sub">{o.done_at ? ago(o.done_at) : ""}: {o.note}</span></li>
          ))}</ul>
        </details>
      )}
    </section>
  );
}

/** A strip at the top of every page when a waiting order needs your OK. */
export function ApprovalBanner({ appKey, go }: { appKey: string; go: (v: "paper" | "trades") => void }) {
  const [asking, setAsking] = useState<PendingOrder[]>([]);
  useEffect(() => {
    if (!appKey) return;
    const load = () => paper.pendingList(appKey).then((x) => setAsking((x?.waiting ?? []).filter((o) => o.status === "asking"))).catch(() => {});
    const fresh = (e: Event) => setAsking((e as CustomEvent<PendingOrder[]>).detail);
    window.addEventListener("viko:pending", fresh);
    load(); const id = setInterval(load, 60000); return () => { clearInterval(id); window.removeEventListener("viko:pending", fresh); };
  }, [appKey]);
  if (!asking.length) return null;
  const first = asking[0]!;
  return (
    <p className="ok-msg ask-banner" role="status">
      {asking.length === 1 ? `${first.label} reached your entry and needs your OK (${first.ask_until ? left(first.ask_until) : ""} left).` : `${asking.length} trades reached their entry and need your OK.`}
      {" "}<button className="btn small primary" onClick={() => go(first.kind === "paper" ? "paper" : "trades")}>Review</button>
    </p>
  );
}
