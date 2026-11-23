import { useMemo, useState } from "react";
import type { Setup } from "../engine/types";
import { fmt } from "../engine/analyze";

type Props = { side: "long" | "short"; label: string; price: number; atr: number; setup: Setup | null; account: number; riskPct: number; busy: boolean; onClose: () => void; onPlace: (o: { dir: "long" | "short"; stop: number; target1: number; target2: number; fromSetup: boolean }) => void };

const round = (x: number) => Number(x.toPrecision(6));

export default function OrderTicket({ side: initial, label, price, atr, setup, account, riskPct, busy, onClose, onPlace }: Props) {
  const [side, setSide] = useState<"long" | "short">(initial);
  const useSetup = !!setup && !setup.hardFail && setup.dir === side && (side === "long" ? setup.stop < price && setup.target1 > price : setup.stop > price && setup.target1 < price);
  const defaults = useMemo(() => {
    if (useSetup) return { stop: round(setup!.stop), t1: round(setup!.target1) };
    const sgn = side === "long" ? 1 : -1;
    return { stop: round(price - sgn * 1.5 * atr), t1: round(price + sgn * 3 * atr) };
  }, [side, price, atr, useSetup, setup]);
  const [stop, setStop] = useState<string>("");
  const [t1, setT1] = useState<string>("");
  const st = stop === "" ? defaults.stop : Number(stop);
  const tg = t1 === "" ? defaults.t1 : Number(t1);
  const long = side === "long";
  const valid = long ? st < price && tg > price : st > price && tg < price;
  const risk = Math.abs(price - st), reward = Math.abs(tg - price);
  const rr = risk ? reward / risk : 0;
  const units = risk ? (account * riskPct / 100) / risk : 0;
  const t2 = price + (tg - price) * 1.618;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ot-h" onKeyDown={(e) => e.key === "Escape" && onClose()} onClick={onClose}>
      <div className="sheet ticket" onClick={(e) => e.stopPropagation()}>
        <h2 id="ot-h">Paper order: {label}</h2>
        <div className="seg big-seg" role="radiogroup" aria-label="Side">
          <button role="radio" aria-checked={long} className={long ? "on buy" : ""} onClick={() => { setSide("long"); setStop(""); setT1(""); }}>Buy</button>
          <button role="radio" aria-checked={!long} className={!long ? "on sell" : ""} onClick={() => { setSide("short"); setStop(""); setT1(""); }}>Sell</button>
        </div>
        <p className="ot-price">Fills at the live market price, now <b className="mono">{fmt(price)}</b>.</p>
        <label>Stop-loss<input type="number" inputMode="decimal" step="any" value={stop === "" ? defaults.stop : stop} onChange={(e) => setStop(e.target.value)} /></label>
        <label>Take-profit (target 1)<input type="number" inputMode="decimal" step="any" value={t1 === "" ? defaults.t1 : t1} onChange={(e) => setT1(e.target.value)} /></label>
        <p className="ctx-note">{useSetup ? "Pre-filled from Viko's wave setup." : "Pre-filled from recent volatility: stop 1.5× the average bar range away, target twice as far."} Half closes at target 1; the rest runs to {fmt(t2)}.</p>
        <dl className="levels">
          <div><dt>Risk to stop</dt><dd className="mono bear">{((risk / price) * 100).toFixed(2)}%</dd></div>
          <div><dt>Reward : risk</dt><dd className={`mono ${rr >= 2 ? "bull" : ""}`}>{rr.toFixed(2)}</dd></div>
          <div><dt>Size at {riskPct}% risk</dt><dd className="mono">{units >= 100 ? units.toFixed(0) : units.toPrecision(3)} units</dd></div>
          <div><dt>Worst case</dt><dd className="mono">{fmt(account * riskPct / 100)}</dd></div>
        </dl>
        {!valid && <p className="err">{long ? "For a buy, the stop must be below the price and the target above it." : "For a sell, the stop must be above the price and the target below it."}</p>}
        {valid && rr < 1.5 && <p className="ctx-note warn">The reward is small for the risk. Viko only approves trades at 2 or better.</p>}
        <div className="row">
          <button className="link" onClick={onClose}>Cancel</button>
          <button className={`btn primary ${long ? "" : "sell-btn"}`} disabled={!valid || busy} onClick={() => onPlace({ dir: side, stop: st, target1: tg, target2: t2, fromSetup: useSetup })}>{busy ? "Placing…" : `${long ? "Buy" : "Sell"} ${label} on paper`}</button>
        </div>
      </div>
    </div>
  );
}
