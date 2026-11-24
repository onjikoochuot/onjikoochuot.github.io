import { costsFor, roundTripPct } from "../engine/costs";
import { useEffect, useState } from "react";
import { fmt } from "../engine/analyze";
import { TF_HOURS } from "../engine/layman";
import type { Tf } from "../engine/types";
import { paper, save, store, type AutoPick } from "../lib/api";

/** A setup to paper trade, with Viko's latest price for it (the trade itself opens at the live price). */
export type PaperPick = AutoPick & { entry: number; tip?: string };
type Split = "each" | "equal";

const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
const usd = (x: number) => `${x < 0 ? "−" : "+"}$${Math.abs(x).toFixed(2)}`;
const when = (h: number) => {
  const ms = Date.now() + h * 3600000, far = h > 45 * 24;
  return new Date(ms).toLocaleString(undefined, far ? { day: "numeric", month: "short", year: "numeric" } : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/** Same flow as Real money: choose the amount, see the expected profit and loss, then OK. */
export default function PaperTicket({ picks, appKey, onClose, onNeedKey, onDone }: { picks: PaperPick[]; appKey: string; onClose: () => void; onNeedKey: () => void; onDone: () => void }) {
  const many = picks.length > 1;
  const [amount, setAmount] = useState<number>(() => store("paperAmount", 100));
  const [split, setSplit] = useState<Split>(() => store("paperSplit", "each"));
  const [closeAfter, setCloseAfter] = useState<number>(() => store("paperCloseAfter", 0));
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<string[] | null>(null);
  useEffect(() => { save("paperAmount", amount); save("paperSplit", split); save("paperCloseAfter", closeAfter); }, [amount, split, closeAfter]);
  useEffect(() => { if (appKey) paper.state(appKey).then((s) => setBalance(Number(s.account?.balance ?? NaN))).catch(() => {}); }, [appKey]);

  const per = many && split === "equal" ? amount / picks.length : amount;
  const rows = picks.map((p) => {
    const move = (to: number) => Math.abs(to - p.entry) / p.entry;
    const h = (p.expectBars ?? 3) * (TF_HOURS[p.tf as Tf] ?? 1);
    // Estimated fees and slippage (see Track record): a target exit is a limit order, a stop-loss exit is a market order.
    const c = costsFor(p.symbol), costWin = per * roundTripPct(c, false), costLoss = per * roundTripPct(c, true);
    return { p, cost: costLoss, loss: per * move(p.stop) + costLoss, p1: (per / 2) * move(p.target1) - costWin, p2: (per / 2) * move(p.target1) + (per / 2) * move(p.target2) - costWin, h0: h * 0.6, h1: h * 1.6 };
  });
  const tot = rows.reduce((a, r) => ({ money: a.money + per, cost: a.cost + r.cost, loss: a.loss + r.loss, p1: a.p1 + r.p1, p2: a.p2 + r.p2, h0: Math.max(a.h0, r.h0), h1: Math.max(a.h1, r.h1) }), { money: 0, cost: 0, loss: 0, p1: 0, p2: 0, h0: 0, h1: 0 });
  const tooMuch = balance != null && Number.isFinite(balance) && tot.money > balance;

  const go = async () => {
    if (!appKey) { onNeedKey(); return; }
    setBusy(true); setErr("");
    const ok: string[] = [], bad: string[] = [];
    for (const p of picks) {
      try { await paper.open(appKey, { symbol: p.symbol, label: p.label, tf: p.tf, dir: p.dir, stop: p.stop, target1: p.target1, target2: p.target2, setup: `${p.name}, ${p.tf}`, score: p.score, tip: p.tip ?? "", source: "manual", amount: Math.round(per * 100) / 100, closeAfterHours: closeAfter || undefined }); ok.push(p.label); }
      catch (e) { bad.push(`${p.label}: ${(e as Error).message}`); }
    }
    setBusy(false);
    if (ok.length) setDone(ok);
    if (bad.length) setErr(bad.join(" "));
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pt-h" onKeyDown={(e) => e.key === "Escape" && onClose()} onClick={onClose}>
      <div className="sheet ticket rt-ticket" onClick={(e) => e.stopPropagation()}>
        <p className="bn-mode">Paper: practice money</p>
        <h2 id="pt-h">{many ? `Paper trade ${picks.length} setups` : `Paper ${picks[0].dir === "long" ? "buy" : "sell"}: ${picks[0].label}`}</h2>
        <p className="sub">{many ? picks.map((p) => `${p.label} (${p.dir === "long" ? "buy" : "sell"}, ${p.tf})`).join(", ") : `${picks[0].name}, ${picks[0].tf} chart, ${picks[0].score}%`}. Viko's own stop-loss and targets are used, and the stop trails the price like a real trade.</p>

        {done ? (
          <>
            <p className="ok-msg">{done.length} paper trade{done.length > 1 ? "s" : ""} opened: {done.join(", ")}.</p>
            {err && <p className="err">Not opened: {err}</p>}
            <p>Come back around <b>{when(tot.h0)}</b>.</p>
            <div className="rt-actions"><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={onDone}>See them in Paper trading</button></div>
          </>
        ) : (
          <>
            <div className="rt-form">
              <label className="auto-field">
                <span className="auto-label">{many && split === "each" ? "Paper money per trade" : "Paper money to put in"}</span>
                <span className="money-in"><input className="cur" value="$" readOnly aria-label="Currency" /><input type="number" min={1} step="any" inputMode="decimal" autoFocus value={amount || ""} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} aria-label="Amount" /></span>
                {balance != null && Number.isFinite(balance) && <small className="sub">Paper balance: ${balance.toFixed(2)}</small>}
              </label>
              <div className="auto-field"><span className="auto-label">Close it</span>
                <div className="seg wrap" role="radiogroup" aria-label="Close it">{([[0, "At target or stop"], [24, "Within 24 h"], [48, "Within 48 h"], [72, "Within 72 h"], [168, "Within a week"]] as const).map(([v, l]) => <button key={v} role="radio" aria-checked={closeAfter === v} className={closeAfter === v ? "on" : ""} onClick={() => setCloseAfter(v)}>{l}</button>)}</div>
                <small className="sub">{closeAfter ? `If a trade hasn't reached its target or stop after ${closeAfter} hours, Viko closes it at the market price so you see the result.` : "Each trade stays open until it reaches its targets or its (trailing) stop-loss."}</small>
              </div>
              {many && (
                <div className="auto-field"><span className="auto-label">Share the money</span>
                  <div className="seg" role="radiogroup" aria-label="Share the money">{([["each", "Same amount on each"], ["equal", "Split it equally"]] as const).map(([v, l]) => <button key={v} role="radio" aria-checked={split === v} className={split === v ? "on" : ""} onClick={() => setSplit(v)}>{l}</button>)}</div>
                </div>
              )}
            </div>
            {amount > 0 && (
              <>
                <ul className="rt-list">{rows.map(({ p, loss, p1, p2, h0, h1 }) => (
                  <li key={p.symbol + p.tf} className="rt-row">
                    <div className="rt-top"><b>{p.label}</b><span className={`tag ${p.dir === "long" ? "ok" : "sell"}`}>{p.dir === "long" ? "Buy" : "Sell"}</span><span className="tag no">{p.tf} · {p.score}%</span></div>
                    <dl className="pick-levels mono">
                      <div><dt>Money</dt><dd>${per.toFixed(2)}</dd></div>
                      <div><dt>Price now</dt><dd>{fmt(p.entry)}</dd></div>
                      <div><dt>Stop-loss</dt><dd className="neg">{fmt(p.stop)} ({pc(Math.abs(p.stop - p.entry) / p.entry)})</dd></div>
                      <div><dt>Target 1 / 2</dt><dd className="pos-c">{fmt(p.target1)} / {fmt(p.target2)}</dd></div>
                      <div><dt>Profit</dt><dd className="pos-c">{usd(p1)} to {usd(p2)}</dd></div>
                      <div><dt>If stopped</dt><dd className="neg">{usd(-loss)}</dd></div>
                    </dl>
                    <p className="sub">Target 1 likely in {Math.round(h0) < 48 ? `${Math.max(1, Math.round(h0))}–${Math.round(h1)} hours` : `${Math.round(h0 / 24)}–${Math.round(h1 / 24)} days`} (around {when(h0)}).</p>
                  </li>
                ))}</ul>
                <div className="day-sum card">
                  <div><span className="sub">Paper money going in</span><b className="mono">${tot.money.toFixed(2)}</b></div>
                  <div><span className="sub">Expected profit (target 1)</span><b className="pos-c mono">{usd(tot.p1)}</b></div>
                  <div><span className="sub">If it runs to target 2</span><b className="pos-c mono">{usd(tot.p2)}</b></div>
                  <div><span className="sub">If the stop-loss is hit</span><b className="neg mono">{usd(-tot.loss)}</b></div>
                </div>
                <p className="sub">These figures are after estimated fees and slippage of up to ${tot.cost.toFixed(2)}, like a real broker would charge.</p>
                <p className="sub">Come back around {when(tot.h0)}; {many ? "they should be" : "it should be"} done by about {when(closeAfter ? Math.min(tot.h1, closeAfter) : tot.h1)}.{closeAfter ? ` Anything still open closes on ${when(closeAfter)}.` : ""} Paper trades have no leverage: the money is the size of the position. Profits are targets, not promises.</p>
              </>
            )}
            {tooMuch && <p className="err">That's more than your paper balance.</p>}
            {err && <p className="err">{err}</p>}
            <div className="rt-actions">
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn primary" disabled={busy || !(amount > 0) || tooMuch} onClick={go}>{busy ? "Opening…" : `OK, open ${many ? `${picks.length} paper trades` : "paper trade"} ($${tot.money.toFixed(2)})`}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
