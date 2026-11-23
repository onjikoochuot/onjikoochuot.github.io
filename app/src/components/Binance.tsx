import { useEffect, useState } from "react";
import { fmt } from "../engine/analyze";
import { binance, BN_REGIONS, save, store, type BnHistory, type BnMode, type BnOrderResult, type BnStatus } from "../lib/api";

export type BnPrefs = { mode: BnMode; region: string };
export const loadBnPrefs = (): BnPrefs => store("bnPrefs", { mode: "demo", region: "ap-south-1" });
const LEVERAGES = [1, 2, 3, 5, 10];

export type BnTradeIdea = { symbol: string; label: string; dir: "long" | "short"; entry: number; stop: number; target1: number; target2: number; setup: string; score: number };

/** Confirmation ticket for a real (or demo) Binance futures order built from a Viko setup. */
export function BinanceTicket({ idea, appKey, onClose, onNeedKey }: { idea: BnTradeIdea; appKey: string; onClose: () => void; onNeedKey: () => void }) {
  const prefs = loadBnPrefs();
  const [margin, setMargin] = useState<number>(() => store("bnMargin", 20));
  const stopFrac = Math.abs(idea.entry - idea.stop) / idea.entry;
  const safeMax = Math.max(1, Math.floor(0.7 / stopFrac));
  const [lev, setLev] = useState<number>(() => Math.min(store("bnLev", 2), safeMax));
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<BnOrderResult | null>(null);
  useEffect(() => { save("bnMargin", margin); save("bnLev", lev); }, [margin, lev]);

  const live = prefs.mode === "live";
  const size = margin * lev;
  const g = (to: number) => Math.abs(to - idea.entry) / idea.entry;
  const loss = size * stopFrac, p1 = size / 2 * g(idea.target1), p2 = p1 + size / 2 * g(idea.target2);
  const long = idea.dir === "long";

  const place = async () => {
    if (!appKey) { onNeedKey(); return; }
    setBusy(true); setErr("");
    try { setDone(await binance.order(appKey, prefs.region, { mode: prefs.mode, symbol: idea.symbol, dir: idea.dir, margin, leverage: lev, stop: idea.stop, target1: idea.target1, target2: idea.target2, label: idea.label, setup: idea.setup, score: idea.score })); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="bn-h" onKeyDown={(e) => e.key === "Escape" && onClose()} onClick={onClose}>
      <div className="sheet ticket bn-ticket" onClick={(e) => e.stopPropagation()}>
        <p className={`bn-mode ${live ? "live" : ""}`}>{live ? "LIVE: real money" : "Demo: fake money"}</p>
        <h2 id="bn-h">{long ? "Buy (long)" : "Sell (short)"} {idea.label} on Binance</h2>
        {done ? (
          <>
            <p className="ok-msg">Order filled: {done.qty} {done.symbol} at {fmt(done.entry)}, {done.leverage}x.</p>
            <dl className="levels">
              <div><dt>Stop-loss</dt><dd className="mono bear">{fmt(done.stop)}</dd></div>
              <div><dt>Target 1 (half)</dt><dd className="mono bull">{fmt(done.target1)}</dd></div>
              <div><dt>Target 2 (rest)</dt><dd className="mono bull">{fmt(done.target2)}</dd></div>
              <div><dt>Margin used</dt><dd className="mono">{done.margin} USDT</dd></div>
            </dl>
            {done.notes.map((n) => <p key={n} className="ctx-note warn">{n}</p>)}
            <p className="ctx-note">The stop-loss and targets now sit on Binance itself, so they work even when Viko is closed. When target 1 is hit, move the stop to your entry price in the Binance app.</p>
            <div className="row"><span /><button className="btn primary" onClick={onClose}>Done</button></div>
          </>
        ) : (
          <>
            <label>Margin to put in (USDT)
              <input type="number" min={1} step="any" inputMode="decimal" value={margin} onChange={(e) => setMargin(Math.max(0, Number(e.target.value)))} />
            </label>
            <div className="bn-lev">
              <span>Leverage</span>
              <div className="seg" role="radiogroup" aria-label="Leverage">
                {LEVERAGES.map((l) => <button key={l} role="radio" aria-checked={lev === l} className={lev === l ? "on" : ""} disabled={l > safeMax} title={l > safeMax ? "You'd be liquidated before the stop-loss" : undefined} onClick={() => setLev(l)}>{l}x</button>)}
              </div>
            </div>
            <dl className="levels">
              <div><dt>Position size</dt><dd className="mono">{size.toFixed(2)} USDT</dd></div>
              <div><dt>Entry, about</dt><dd className="mono">{fmt(idea.entry)}</dd></div>
              <div><dt>If the stop-loss is hit</dt><dd className="mono bear">−{loss.toFixed(2)} USDT ({Math.round(stopFrac * lev * 100)}% of margin)</dd></div>
              <div><dt>At target 1 (half)</dt><dd className="mono bull">+{p1.toFixed(2)} USDT</dd></div>
              <div><dt>Both targets</dt><dd className="mono bull">+{p2.toFixed(2)} USDT</dd></div>
              <div><dt>Stop / targets</dt><dd className="mono">{fmt(idea.stop)} / {fmt(idea.target1)} / {fmt(idea.target2)}</dd></div>
            </dl>
            <p className="ctx-note">Leverage multiplies profit and loss alike. {safeMax < 10 ? `Above ${safeMax}x, Binance would liquidate you before this stop-loss, so those choices are off.` : "Viko caps leverage at 10x."} Binance fees (about 0.05% per side) are not included.</p>
            {live && <label className="check bn-agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I understand this places a real order with my own money.</label>}
            {err && <p className="err">{err}</p>}
            <div className="row">
              <button className="link" onClick={onClose}>Cancel</button>
              <button className={`btn primary ${long ? "" : "sell-btn"}`} disabled={busy || margin <= 0 || (live && !agree)} onClick={place}>{busy ? "Sending to Binance…" : `${long ? "Buy" : "Sell"} with ${margin} USDT at ${lev}x`}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The Binance screen: connection, balance, open positions, history and set-up steps. */
export function BinanceView({ appKey, onNeedKey }: { appKey: string; onNeedKey: () => void }) {
  const [prefs, setPrefs] = useState<BnPrefs>(loadBnPrefs);
  const [st, setSt] = useState<BnStatus | null>(null);
  const [hist, setHist] = useState<BnHistory[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState("");
  const [confirmLive, setConfirmLive] = useState(false);
  const update = (p: Partial<BnPrefs>) => { const n = { ...prefs, ...p }; setPrefs(n); save("bnPrefs", n); };

  const load = async () => {
    if (!appKey) return;
    setBusy(true); setErr("");
    try {
      const [s, h] = await Promise.all([binance.status(appKey, prefs.region, prefs.mode), binance.history(appKey, prefs.region).catch(() => ({ rows: [] }))]);
      setSt(s); setHist(h.rows.filter((r) => r.mode === prefs.mode));
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [appKey, prefs.mode, prefs.region]);

  const closePos = async (symbol: string) => {
    if (!confirm(`Close your ${symbol} position at the market price now?`)) return;
    setClosing(symbol);
    try { await binance.close(appKey, prefs.region, prefs.mode, symbol); await load(); } catch (e) { setErr((e as Error).message); }
    setClosing("");
  };

  return (
    <section className="view">
      <header className="view-head">
        <div><h2>Binance</h2><p>Send Viko's trades to your Binance futures account with leverage, the stop-loss and both targets attached. Every order needs your tap to confirm.</p></div>
        <div className="seg big-seg" role="radiogroup" aria-label="Account">
          <button role="radio" aria-checked={prefs.mode === "demo"} className={prefs.mode === "demo" ? "on" : ""} onClick={() => update({ mode: "demo" })}>Demo</button>
          <button role="radio" aria-checked={prefs.mode === "live"} className={prefs.mode === "live" ? "on sell" : ""} onClick={() => setConfirmLive(true)}>Live</button>
        </div>
      </header>

      {confirmLive && prefs.mode !== "live" && (
        <div className="card bn-warn">
          <h3>Switch to real money?</h3>
          <p>Orders will use your real Binance balance. Leverage can lose your whole margin quickly. Trade the demo account until the results satisfy you.</p>
          <div className="row"><button className="link" onClick={() => setConfirmLive(false)}>Stay on demo</button><button className="btn primary sell-btn" onClick={() => { update({ mode: "live" }); setConfirmLive(false); }}>Use live account</button></div>
        </div>
      )}

      {!appKey && <p className="err">Add your app key in Settings first. <button className="link" onClick={onNeedKey}>Open Settings</button></p>}
      {err && <p className="err">{err}</p>}

      <div className="bn-grid">
        <div className="card">
          <h3>Connection</h3>
          {!st ? <p className="muted">{busy ? "Checking…" : "Not checked yet."}</p> : (
            <ul className="bn-checks">
              <li className={st.reachable ? "ok" : "bad"}>{st.reachable ? `Binance ${st.mode} servers reachable from ${st.region ?? "the server"}` : st.error}</li>
              <li className={st.keysSet ? "ok" : "bad"}>{st.keysSet ? "API keys saved on the server" : `No ${st.mode} API keys yet: follow the steps below`}</li>
              {st.keysSet && <li className={st.connected ? "ok" : "bad"}>{st.connected ? "Signed in to your futures account" : st.error}</li>}
            </ul>
          )}
          <label className="bn-region">Server region
            <select value={prefs.region} onChange={(e) => update({ region: e.target.value })}>{BN_REGIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <button className="btn" onClick={load} disabled={busy || !appKey}>{busy ? "Checking…" : "Test connection"}</button>
        </div>
        <div className="card">
          <h3>Futures wallet</h3>
          {st?.connected ? (
            <dl className="levels">
              <div><dt>Balance</dt><dd className="mono">{st.balance?.toFixed(2)} USDT</dd></div>
              <div><dt>Available</dt><dd className="mono">{st.available?.toFixed(2)} USDT</dd></div>
              <div><dt>Open profit/loss</dt><dd className={`mono ${(st.unrealized ?? 0) >= 0 ? "bull" : "bear"}`}>{(st.unrealized ?? 0) >= 0 ? "+" : ""}{st.unrealized?.toFixed(2)} USDT</dd></div>
            </dl>
          ) : <p className="muted">Shows here once connected.</p>}
        </div>
      </div>

      {st?.connected && (
        <>
          <h3 className="pick-sec">Open positions</h3>
          {!st.positions?.length ? <p className="muted">No open positions. Use "Trade on Binance" on a crypto pick or chart.</p> : (
            <table className="tbl">
              <thead><tr><th>Market</th><th className="r">Size</th><th className="r">Entry / now</th><th className="r">Profit/loss</th><th className="r">Liquidation</th><th>Protection</th><th /></tr></thead>
              <tbody>
                {st.positions.map((p) => (
                  <tr key={p.symbol} style={{ cursor: "default" }}>
                    <td><b>{p.symbol}</b><span className="sub">{p.qty > 0 ? "Long" : "Short"}{p.leverage ? `, ${p.leverage}x` : ""}</span></td>
                    <td className="r mono">{Math.abs(p.qty)}</td>
                    <td className="r mono">{fmt(p.entry)}<span className="sub">{fmt(p.mark)}</span></td>
                    <td className={`r mono ${p.pnl >= 0 ? "bull" : "bear"}`}>{p.pnl >= 0 ? "+" : ""}{p.pnl.toFixed(2)}</td>
                    <td className="r mono">{p.liq ? fmt(p.liq) : "–"}</td>
                    <td>{p.orders.length ? p.orders.map((o) => <span key={o.type + o.trigger} className="sub">{o.type === "STOP_MARKET" ? "Stop" : "Target"} {fmt(o.trigger)}</span>) : <span className="tag no">No stop-loss!</span>}</td>
                    <td><button className="btn" onClick={() => closePos(p.symbol)} disabled={closing === p.symbol}>{closing === p.symbol ? "Closing…" : "Close now"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {hist.length > 0 && (
            <>
              <h3 className="pick-sec">Orders sent from Viko</h3>
              <table className="tbl compact">
                <thead><tr><th>When</th><th>Market</th><th>Side</th><th className="r">Entry</th><th className="r">Margin</th><th>Status</th></tr></thead>
                <tbody>{hist.map((h) => (
                  <tr key={h.id} style={{ cursor: "default" }}><td>{new Date(h.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td><td>{h.label ?? h.symbol}</td><td>{h.dir === "long" ? "Buy" : "Sell"}{h.leverage ? ` ${h.leverage}x` : ""}</td><td className="r mono">{fmt(h.entry)}</td><td className="r mono">{h.margin ? `${h.margin}` : "–"}</td><td>{h.status}{h.note ? <span className="sub">{h.note}</span> : null}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}
        </>
      )}

      <div className="card bn-steps">
        <h3>Connect your Binance account</h3>
        <ol className="install-steps">
          <li><b>Start with the demo.</b> On a computer, sign in at <a href="https://demo.binance.com" target="_blank" rel="noreferrer">demo.binance.com</a> with your normal Binance login. It gives you free practice USDT.</li>
          <li>In the demo site: profile icon → <b>Demo Trading API</b> → <b>Create API</b> (system-generated). Tick <b>Enable Futures</b>. Copy the API key and the secret key. The secret is shown only once.</li>
          <li>Open your <a href="https://supabase.com/dashboard/project/fkrgiaeglingmogcsyik/functions/secrets" target="_blank" rel="noreferrer">Supabase secrets page</a> and add two secrets: <code>BINANCE_DEMO_KEY</code> (the API key) and <code>BINANCE_DEMO_SECRET</code> (the secret key).</li>
          <li>Come back here and tap <b>Test connection</b>. All three lines should turn green.</li>
          <li><b>Later, for real money:</b> on binance.com go to API Management, create a key with <b>Enable Futures</b> on and <b>withdrawals off</b>, and add it as <code>BINANCE_LIVE_KEY</code> and <code>BINANCE_LIVE_SECRET</code>. Your futures wallet needs USDT in it.</li>
        </ol>
        <p className="ctx-note">Never paste API keys into chat, email or this app. Only the Supabase secrets page holds them.</p>
      </div>
    </section>
  );
}
