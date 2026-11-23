import { useEffect, useState } from "react";
import { auto, type LimitUsage, type Limits } from "../lib/api";

const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Nairobi"; } catch { return "Africa/Nairobi"; } };
const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v)) || null);
const sg = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`;

/** Daily trading limits: money, number of trades and a loss stop. Enforced by the server on every auto-trade and Real money trade. */
export default function DailyLimits({ appKey, mode }: { appKey: string; mode: "demo" | "live" }) {
  const [L, setL] = useState<Limits | null>(null);
  const [today, setToday] = useState<{ demo: LimitUsage; live: LimitUsage } | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ on: false, money: "", trades: "", loss: "", closeOnLoss: false, applies: "live" as Limits["applies"] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => auto.limits(appKey).then((j) => {
    setL(j.limits); setToday(j.today);
    setDraft({ on: j.limits.on, money: j.limits.money?.toString() ?? "", trades: j.limits.trades?.toString() ?? "", loss: j.limits.loss?.toString() ?? "", closeOnLoss: j.limits.closeOnLoss, applies: j.limits.applies });
  }).catch((e) => setMsg((e as Error).message));
  useEffect(() => { if (appKey) load(); }, [appKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveIt = async () => {
    setBusy(true); setMsg("");
    try {
      const j = await auto.limits(appKey, { on: draft.on, money: num(draft.money), trades: num(draft.trades), loss: num(draft.loss), closeOnLoss: draft.closeOnLoss, applies: draft.applies, tz: tz() });
      setL(j.limits); setToday(j.today); setMsg("Saved. Viko checks these before every new trade."); setOpen(false);
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };

  const u = today?.[mode];
  const active = L?.on && (L.applies === "all" || mode === "live");
  const parts = L?.on ? [L.money != null && `${L.money} a day`, L.trades != null && `${L.trades} trades a day`, L.loss != null && `stop after −${L.loss}`].filter(Boolean).join(" · ") : "";
  const status = !L ? "…" : !L.on ? "Off" : `${parts || "on, no limits set"}${L.applies === "live" ? " (real money)" : ""}`;

  return (
    <div className={`card limits ${u?.lossHit && active ? "hit" : ""}`}>
      <div className="limits-head">
        <div>
          <b>Daily limits:</b> {status}
          {active && u && <span className="sub">Today on {mode === "live" ? "real money" : "demo"}: {u.money.toFixed(2)} used in {u.trades} trade{u.trades === 1 ? "" : "s"}, result {sg(u.pnl)}{u.lossHit ? ". Loss limit reached: no new trades until tomorrow." : "."}</span>}
        </div>
        <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Close" : L?.on ? "Change limits" : "Set daily limits"}</button>
      </div>
      {msg && !open && <p className="sub">{msg}</p>}
      {open && (
        <div className="limits-form">
          <label className="check"><input type="checkbox" checked={draft.on} onChange={(e) => setDraft({ ...draft, on: e.target.checked })} /> Use daily limits</label>
          <div className={`limits-grid ${draft.on ? "" : "off"}`}>
            <label>Most money to put into new trades per day<input type="number" min={0} step="any" inputMode="decimal" placeholder="No limit" value={draft.money} onChange={(e) => setDraft({ ...draft, money: e.target.value })} disabled={!draft.on} /></label>
            <label>Most trades to open per day<input type="number" min={0} step={1} inputMode="numeric" placeholder="No limit" value={draft.trades} onChange={(e) => setDraft({ ...draft, trades: e.target.value })} disabled={!draft.on} /></label>
            <label>Stop for the day after losing<input type="number" min={0} step="any" inputMode="decimal" placeholder="No limit" value={draft.loss} onChange={(e) => setDraft({ ...draft, loss: e.target.value })} disabled={!draft.on} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={draft.closeOnLoss} disabled={!draft.on} onChange={(e) => setDraft({ ...draft, closeOnLoss: e.target.checked })} /> When the loss limit is reached, also close the trades still open</label>
          <div className="seg" role="radiogroup" aria-label="Applies to">
            {([["live", "Real money only"], ["all", "Real money and demo"]] as const).map(([v, l]) => <button key={v} role="radio" aria-checked={draft.applies === v} className={draft.applies === v ? "on" : ""} disabled={!draft.on} onClick={() => setDraft({ ...draft, applies: v })}>{l}</button>)}
          </div>
          <p className="sub">Counts every trade Viko opens for you (Auto-trade and the Real money buttons) from midnight your time ({tz()}). The loss counts closed trades plus what the open ones show now. Amounts are in each broker's currency (USDT or USD).</p>
          {msg && <p className="err">{msg}</p>}
          <div className="rt-actions"><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" onClick={saveIt} disabled={busy}>{busy ? "Saving…" : "Save limits"}</button></div>
        </div>
      )}
    </div>
  );
}
