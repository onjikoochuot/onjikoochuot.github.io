import { useEffect, useState } from "react";
import { fmt } from "../engine/analyze";
import { BrokerSelect, brokerLabel, curFor } from "../lib/brokers";
import { auto, save, store, type AutoCfg, type AutoPick, type AutoPreview, type AutoPreviewTrade } from "../lib/api";

const RISKS: [AutoCfg["risk"], string, string][] = [["careful", "Careful", "10%"], ["balanced", "Balanced", "20%"], ["bold", "Bold", "35%"], ["max", "Max profit", "50%"]];
const SPLITS: [AutoCfg["alloc"], string, string][] = [
  ["equal", "Split it equally", "Your amount is shared equally between the trades."],
  ["each", "Same amount on each", "Every trade gets the full amount, so the total is amount × trades."],
  ["score", "More on the strongest", "Higher-scoring setups get a bigger share."],
];
type Saved = { broker: AutoCfg["broker"]; mode: AutoCfg["mode"]; amount: number; risk: AutoCfg["risk"]; alloc: AutoCfg["alloc"] };
const DEF: Saved = { broker: "both", mode: "live", amount: 50, risk: "balanced", alloc: "equal" };
const curOf = curFor;
const signed = (x: number, c = "") => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}${c ? ` ${c}` : ""}`;
const when = (ms: number) => {
  const d = new Date(ms), far = ms - Date.now() > 45 * 86400000;
  return d.toLocaleString(undefined, far ? { day: "numeric", month: "short", year: "numeric" } : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const span = (h: number) => (h < 1 ? `${Math.max(5, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} hours` : h < 24 * 60 ? `${Math.round(h / 24)} days` : `${Math.round(h / 730)} months`);

/** One ticket for "trade this with real money": from a chart's tip or from one or many of Today's picks. */
export default function RealTrade({ picks, appKey, onClose, onNeedKey, onWatch }: { picks: AutoPick[]; appKey: string; onClose: () => void; onNeedKey: () => void; onWatch: () => void }) {
  const [s, setS] = useState<Saved>(() => ({ ...DEF, ...store<Partial<Saved>>("realTrade", {}) }));
  const set = (p: Partial<Saved>) => setS((c) => { const n = { ...c, ...p }; save("realTrade", n); return n; });
  const [pv, setPv] = useState<AutoPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const many = picks.length > 1;
  const live = s.mode === "live";
  const cfg: AutoCfg = { broker: s.broker, mode: s.mode, amount: s.amount, count: picks.length, horizon: "48h", strict: 65, risk: s.risk, alloc: many ? s.alloc : "equal", custom: null, fallback: false, picks };
  const key = JSON.stringify(cfg);

  useEffect(() => {
    if (!appKey || !(s.amount > 0)) return;
    let stop = false;
    setLoading(true); setErr("");
    const t = setTimeout(() => auto.preview(appKey, cfg).then((p) => { if (!stop) setPv(p); }).catch((e) => { if (!stop) setErr((e as Error).message); }).finally(() => { if (!stop) setLoading(false); }), 500);
    return () => { stop = true; clearTimeout(t); };
  }, [appKey, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const trades = pv?.trades ?? [];
  const c = trades.length ? (trades.every((t) => curOf(t.broker) === "USD") ? "USD" : "USDT") : s.broker === "both" ? "USDT" : curOf(s.broker);
  const tot = trades.reduce((a, t) => ({ money: a.money + t.money, loss: a.loss + t.loss, p1: a.p1 + t.profit1, p2: a.p2 + t.profit2, h0: Math.max(a.h0, t.hours[0]), h1: Math.max(a.h1, t.hours[1]) }), { money: 0, loss: 0, p1: 0, p2: 0, h0: 0, h1: 0 });
  const now = Date.now();
  const notConnected = pv?.connected && (s.broker === "both" ? !Object.values(pv.connected).some(Boolean) : !pv.connected[s.broker]);

  const go = async () => {
    setBusy(true); setErr("");
    try {
      const r = await auto.start(appKey, cfg);
      setDone(`${r.placed} trade${r.placed === 1 ? "" : "s"} placed${live ? " with real money" : " on demo"}. Viko now trails the stop-loss to protect and lock in profit, and takes profit for you.`);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rt-h" onKeyDown={(e) => e.key === "Escape" && onClose()} onClick={onClose}>
      <div className="sheet ticket rt-ticket" onClick={(e) => e.stopPropagation()}>
        <p className={`bn-mode ${live ? "live" : ""}`}>{live ? "Real money" : "Demo: practice money"}</p>
        <h2 id="rt-h">{many ? `Trade ${picks.length} picks` : `${picks[0].dir === "long" ? "Buy" : "Sell"} ${picks[0].label}`}</h2>
        <p className="sub">{many ? picks.map((p) => `${p.label} (${p.dir === "long" ? "buy" : "sell"}, ${p.tf})`).join(", ") : `${picks[0].name}, ${picks[0].tf} chart, ${picks[0].score}%`}. Viko uses its own entry, stop-loss and targets; you only choose the money.</p>

        {!appKey ? <p className="err">Add your app key in Settings first. <button className="link" onClick={onNeedKey}>Open Settings</button></p> : done ? (
          <>
            <p className="ok-msg">{done}</p>
            <p>Come back around <b>{when(now + tot.h0 * 3600000)}</b>. You can check progress or collect early any time under Auto-trade → Running.</p>
            <div className="rt-actions"><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={onWatch}>Watch it now</button></div>
          </>
        ) : (
          <>
            <div className="rt-form">
              <label className="auto-field">
                <span className="auto-label">{many && s.alloc === "each" ? "Money per trade" : "How much to trade"}</span>
                <span className="money-in"><input className="cur" value={c} readOnly aria-label="Currency" /><input type="number" min={1} step="any" inputMode="decimal" autoFocus value={s.amount || ""} onChange={(e) => set({ amount: Math.max(0, Number(e.target.value)) })} aria-label="Amount" /></span>
              </label>
              <Seg label="Account" value={s.mode} options={[["live", "Real money"], ["demo", "Demo"]]} onChange={(mode) => { set({ mode }); setAgree(false); }} />
              <BrokerSelect value={s.broker} onChange={(broker) => set({ broker })} />
              {many && <Seg label="Share the money" value={s.alloc} options={SPLITS.map(([v, l]) => [v, l] as [AutoCfg["alloc"], string])} onChange={(alloc) => set({ alloc })} />}
              <Seg label="Risk" value={s.risk} options={RISKS.map(([v, l]) => [v, l] as [AutoCfg["risk"], string])} onChange={(risk) => set({ risk })} help={`Leverage is set so hitting the stop-loss loses about ${RISKS.find((r) => r[0] === s.risk)![2]} of the money (less if the stop is far away, never past liquidation).`} />
            </div>

            {notConnected && <p className="ctx-note warn">{s.broker === "both" ? "No broker" : brokerLabel(s.broker)} is connected for {s.mode === "live" ? "real money" : "demo"} yet, so you can see the plan but not place it. Connect under Brokers.</p>}
            {loading && <p className="muted">Getting live broker prices…</p>}
            {err && <p className="err">{err}</p>}
            {pv?.limits && !loading && <p className={`sub ${pv.limits.lossHit ? "neg" : ""}`}>Daily limits today: {pv.limits.used.toFixed(2)}{pv.limits.money != null ? ` of ${pv.limits.money}` : ""} used in {pv.limits.count} trade{pv.limits.count === 1 ? "" : "s"}{pv.limits.trades != null ? ` (most ${pv.limits.trades})` : ""}, result {pv.limits.pnl >= 0 ? "+" : "−"}{Math.abs(pv.limits.pnl).toFixed(2)}{pv.limits.loss != null ? ` (stop at −${pv.limits.loss})` : ""}. Change them under Auto-trade.</p>}
            {pv && !loading && trades.length === 0 && <p className="err">{pv.skipped.join(" ") || "This can't be placed right now."}</p>}
            {pv && !loading && trades.length > 0 && (
              <>
                <ul className="rt-list">{trades.map((t) => <Row key={t.symbol} t={t} now={now} />)}</ul>
                <div className="day-sum card">
                  <div><span className="sub">Money going in</span><b className="mono">{tot.money.toFixed(2)} {c}</b></div>
                  <div><span className="sub">Expected profit (target 1)</span><b className="pos-c mono">{signed(tot.p1, c)}</b></div>
                  <div><span className="sub">If it runs to target 2</span><b className="pos-c mono">{signed(tot.p2, c)}</b></div>
                  <div><span className="sub">If the stop-loss is hit</span><b className="neg mono">{signed(-tot.loss, c)}</b></div>
                </div>
                <p className="rt-when">Come back around <b>{when(now + tot.h0 * 3600000)}</b>; {many ? "they should be" : "it should be"} done by about <b>{when(now + tot.h1 * 3600000)}</b>.{pv.closeBy ? ` Viko closes anything still open on ${when(pv.closeBy)}.` : ""}</p>
                {pv.skipped.length > 0 && <p className="sub">Left out: {pv.skipped.join(" ")}</p>}
                <p className="sub">Viko trails the stop-loss every 5 minutes so it only moves in your favour: risk halved halfway to target 1, no-loss at 80% of the way, then profit locked in as the price rises. Profit figures are targets, not promises.</p>
              </>
            )}

            {live && <label className="check bn-agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I understand this trades my real money and that I can lose it.</label>}
            <div className="rt-actions">
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className={`btn primary ${live ? "sell-btn" : ""}`} disabled={busy || loading || !trades.length || (live && !agree)} onClick={go}>
                {busy ? "Placing…" : `${live ? "Trade" : "Place on demo"} ${tot.money ? tot.money.toFixed(2) : ""} ${c}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ t, now }: { t: AutoPreviewTrade; now: number }) {
  const cur = curOf(t.broker);
  return (
    <li className="rt-row">
      <div className="rt-top">
        <b>{t.label}</b>
        <span className={`tag ${t.dir === "long" ? "ok" : "sell"}`}>{t.dir === "long" ? "Buy" : "Sell"}</span>
        <span className="tag no">{t.broker === "binance" ? "Binance" : "Deriv"} · {t.brokerSymbol} · {t.leverage}x</span>
        {t.newsAgainst && <span className="tag watch">News leans against</span>}
      </div>
      <dl className="pick-levels mono">
        <div><dt>Money</dt><dd>{t.money.toFixed(2)} {cur}</dd></div>
        <div><dt>Entry now</dt><dd>{fmt(t.entry)}</dd></div>
        <div><dt>Stop-loss</dt><dd className="neg">{fmt(t.stop)}</dd></div>
        <div><dt>Target 1 / 2</dt><dd className="pos-c">{fmt(t.target1)} / {fmt(t.target2)}</dd></div>
        <div><dt>Profit</dt><dd className="pos-c">{signed(t.profit1)} to {signed(t.profit2)}</dd></div>
        <div><dt>If stopped</dt><dd className="neg">{signed(-t.loss)}</dd></div>
      </dl>
      <p className="sub">Target 1 likely in {span(t.hours[0])} to {span(t.hours[1])} (around {when(now + t.hours[0] * 3600000)}).</p>
    </li>
  );
}

function Seg<T extends string>({ label, value, options, onChange, help }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; help?: string }) {
  return (
    <div className="auto-field">
      <span className="auto-label">{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>{options.map(([v, l]) => <button type="button" key={v} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>
      {help && <small className="sub">{help}</small>}
    </div>
  );
}
