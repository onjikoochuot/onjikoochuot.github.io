import { useEffect, useState } from "react";
import { fmt } from "../engine/analyze";
import { paper, type AutoPick, type PendingOrder } from "../lib/api";

export type Wait = { mode: "now" | "price" | "confirm"; level: number | null; hours: number; minScore: number };
type P = AutoPick & { price?: number; entryLevel?: number; triggered?: boolean };

/** The best default: wait for Viko's trigger level when the setup hasn't fired yet, otherwise open now. */
export function defaultWait(picks: P[]): Wait {
  const p = picks[0];
  if (picks.length === 1 && p && p.triggered === false && p.entryLevel && p.entryLevel > 0) return { mode: "price", level: p.entryLevel, hours: 72, minScore: 80 };
  return { mode: "now", level: null, hours: 72, minScore: 80 };
}

/** Is the waiting price between the stop-loss and target 1? Returns a problem, or "". */
export function levelProblem(p: P, level: number | null): string {
  if (!(level && level > 0)) return "Enter the price to wait for.";
  const long = p.dir === "long";
  if (long ? level <= p.stop : level >= p.stop) return `That's ${long ? "at or below" : "at or above"} the stop-loss (${fmt(p.stop)}).`;
  if (long ? level >= p.target1 : level <= p.target1) return `That's already past target 1 (${fmt(p.target1)}).`;
  return "";
}

export function waitSentence(p: P, w: Wait): string {
  if (w.mode === "confirm") return `Opens when Viko re-reads the ${p.tf} chart and approves the setup at ${w.minScore}%+ with its trigger fired.`;
  if (w.mode === "price" && w.level) {
    const up = p.price != null ? w.level > p.price : p.dir === "long" ? w.level > (p.entryLevel ?? w.level) : false;
    return `Opens when the price ${up ? "rises" : "dips"} to ${fmt(w.level)}${p.price != null ? ` (now ${fmt(p.price)})` : ""}.`;
  }
  return "";
}

/** "When to open": now, at a price you choose, or when Viko confirms the setup. Shared by the paper and real-money tickets. */
export default function WhenToOpen({ picks, value, onChange }: { picks: P[]; value: Wait; onChange: (w: Wait) => void }) {
  const many = picks.length > 1, p = picks[0]!;
  const opts: [Wait["mode"], string][] = many ? [["now", "Now"], ["confirm", "When Viko confirms"]] : [["now", "Now"], ["price", "At my price"], ["confirm", "When Viko confirms"]];
  const suggested = p.entryLevel && p.triggered === false ? p.entryLevel : p.price != null ? (p.dir === "long" ? p.price - (p.price - p.stop) * 0.3 : p.price + (p.stop - p.price) * 0.3) : null;
  const problem = !many && value.mode === "price" ? levelProblem(p, value.level) : "";
  return (
    <div className="auto-field wto">
      <span className="auto-label">When to open</span>
      <div className="seg" role="radiogroup" aria-label="When to open">
        {opts.map(([m, l]) => <button type="button" key={m} role="radio" aria-checked={value.mode === m} className={value.mode === m ? "on" : ""}
          onClick={() => onChange({ ...value, mode: m, level: m === "price" ? value.level ?? (suggested ? Number(suggested.toPrecision(6)) : null) : value.level })}>{l}</button>)}
      </div>
      {value.mode === "now" && <small className="sub">{p.triggered === false ? "Careful: Viko's entry trigger hasn't fired yet on this chart. Waiting is usually better." : "Opens straight away at the live price."}</small>}
      {value.mode === "price" && (
        <>
          <span className="money-in wto-level"><input className="cur" value="at" readOnly aria-label="" /><input type="number" step="any" inputMode="decimal" value={value.level ?? ""} onChange={(e) => onChange({ ...value, level: Number(e.target.value) || null })} aria-label="Entry price to wait for" /></span>
          {problem ? <small className="err">{problem}</small> : <small className="sub">{waitSentence(p, value)}{p.entryLevel && p.triggered === false ? ` Viko's own trigger level is ${fmt(p.entryLevel)}.` : ""} Stop-loss {fmt(p.stop)} and targets stay the same.</small>}
        </>
      )}
      {value.mode === "confirm" && (
        <small className="sub">Viko re-reads the chart every 5 minutes and opens only when the setup is approved ({value.minScore}%+) and its trigger has fired, using the stop-loss and targets from that moment. If the setup never confirms, nothing is traded.</small>
      )}
      {value.mode !== "now" && (
        <>
          <div className="seg wto-hours" role="radiogroup" aria-label="Give up after">
            {([[24, "Wait 1 day"], [72, "3 days"], [168, "1 week"]] as [number, string][]).map(([h, l]) => <button type="button" key={h} role="radio" aria-checked={value.hours === h} className={value.hours === h ? "on" : ""} onClick={() => onChange({ ...value, hours: h })}>{l}</button>)}
          </div>
          <small className="sub">Checked every 5 minutes. Cancelled automatically, at no cost, if the price hits the stop-loss first or the time runs out. Once it opens, it's managed like any other trade: trailing stop-loss, take-profit, alerts.</small>
        </>
      )}
    </div>
  );
}

const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const left = (iso: string) => { const h = (Date.parse(iso) - Date.now()) / 3600000; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`; };
const BROKER_NAME: Record<string, string> = { binance: "Binance", bybit: "Bybit", mt5: "MT5", deriv: "Deriv" };
const STATUS: Record<string, string> = { opened: "Opened", cancelled: "Cancelled", expired: "Gave up", failed: "Failed" };

/** Orders waiting for their entry, with a Cancel button, plus what happened to recent ones. */
export function WaitingOrders({ appKey, kind }: { appKey: string; kind?: "paper" | "real" }) {
  const [d, setD] = useState<{ waiting: PendingOrder[]; recent: PendingOrder[] } | null>(null);
  const [err, setErr] = useState("");
  const load = () => paper.pendingList(appKey).then(setD).catch((e) => setErr((e as Error).message));
  useEffect(() => { if (!appKey) return; load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [appKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return err ? <p className="err">{err}</p> : null;
  const mine = (o: PendingOrder) => !kind || o.kind === kind;
  const waiting = d.waiting.filter(mine), recent = d.recent.filter(mine);
  if (!waiting.length && !recent.length) return null;
  const cancel = async (id: string) => { try { await paper.pendingCancel(appKey, id); load(); } catch (e) { setErr((e as Error).message); } };
  return (
    <section className="card waiting">
      <h3>Waiting for entry {waiting.length > 0 && <span className="tag watch">{waiting.length}</span>}</h3>
      {err && <p className="err">{err}</p>}
      {waiting.length === 0 && <p className="sub">Nothing waiting right now.</p>}
      <ul className="wait-list">{waiting.map((o) => (
        <li key={o.id}>
          <div className="wait-top">
            <b>{o.label}</b>
            <span className={`tag ${o.dir === "long" ? "ok" : "sell"}`}>{o.dir === "long" ? "Buy" : "Sell"}</span>
            <span className="tag no">{o.tf}</span>
            <span className="tag no">{o.kind === "paper" ? "Paper" : o.cfg?.mode === "live" ? "Real money" : "Demo"}</span>
            <button className="btn ghost small" onClick={() => cancel(o.id)}>Cancel</button>
          </div>
          <p className="sub">
            {o.wait_for === "price" ? `Opens at ${fmt(Number(o.level))}` : `Opens when Viko confirms at ${o.min_score}%+`}
            {o.last_price != null ? `; price now ${fmt(Number(o.last_price))}` : ""}. Stop-loss {fmt(Number(o.stop))}, target 1 {fmt(Number(o.target1))}.
            {" "}{o.kind === "paper" ? `$${Number(o.amount).toFixed(2)} paper money. ` : `${Number(o.cfg?.amount ?? 0).toFixed(2)} on ${o.cfg?.broker === "both" ? "your brokers" : BROKER_NAME[o.cfg?.broker ?? ""] ?? o.cfg?.broker}. `}
            Gives up in {left(o.expires_at)}.{o.note ? ` ${o.note}` : ""}
          </p>
        </li>
      ))}</ul>
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
