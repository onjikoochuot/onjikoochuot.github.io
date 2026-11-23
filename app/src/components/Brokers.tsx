import { useEffect, useState } from "react";
import { fmt } from "../engine/analyze";
import { auto, save, store, type DerivStatus } from "../lib/api";
import { BinanceView } from "./Binance";

type Tab = "binance" | "deriv" | "other";
const SECRETS = "https://supabase.com/dashboard/project/fkrgiaeglingmogcsyik/functions/secrets";

export default function Brokers({ appKey, onNeedKey }: { appKey: string; onNeedKey: () => void }) {
  const [tab, setTab] = useState<Tab>(() => store("brokerTab", "binance"));
  const [counts, setCounts] = useState<{ total: number; binance_live: number; binance_demo: number; deriv?: number } | null>(null);
  useEffect(() => save("brokerTab", tab), [tab]);
  useEffect(() => { auto.markets().then(setCounts).catch(() => {}); }, []);
  return (
    <section className="view brokers">
      <header className="view-head">
        <div>
          <h2>Brokers</h2>
          <p>Connect the accounts Viko trades for you. Keys live only in your Supabase secrets, never in the app. {counts ? `Of Viko's ${counts.total} markets, Binance can trade ${counts.binance_live} (${counts.binance_demo} on its demo) and Deriv ${counts.deriv ?? "–"}.` : ""}</p>
        </div>
      </header>
      <div className="seg picks-tabs" role="tablist">
        {([["binance", "Binance"], ["deriv", "Deriv"], ["other", "Other brokers"]] as [Tab, string][]).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "binance" && <BinanceView appKey={appKey} onNeedKey={onNeedKey} embedded />}
      {tab === "deriv" && <DerivPanel appKey={appKey} onNeedKey={onNeedKey} />}
      {tab === "other" && <OtherBrokers />}
    </section>
  );
}

function DerivPanel({ appKey, onNeedKey }: { appKey: string; onNeedKey: () => void }) {
  const [mode, setMode] = useState<"demo" | "live">(() => store("derivMode", "demo"));
  const [st, setSt] = useState<DerivStatus | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(0);
  useEffect(() => save("derivMode", mode), [mode]);
  const load = async () => {
    if (!appKey) return;
    setBusy(true); setErr("");
    try { setSt(await auto.derivStatus(appKey, mode)); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [appKey, mode]);
  const close = async (id: number) => {
    if (!confirm("Close this Deriv contract now at the current price?")) return;
    setClosing(id);
    try { await auto.derivClose(appKey, mode, id); await load(); } catch (e) { setErr((e as Error).message); }
    setClosing(0);
  };
  return (
    <>
      <div className="seg big-seg" role="radiogroup" aria-label="Account" style={{ marginBottom: 14 }}>
        <button role="radio" aria-checked={mode === "demo"} className={mode === "demo" ? "on" : ""} onClick={() => setMode("demo")}>Demo</button>
        <button role="radio" aria-checked={mode === "live"} className={mode === "live" ? "on sell" : ""} onClick={() => setMode("live")}>Real</button>
      </div>
      {!appKey && <p className="err">Add your app key in Settings first. <button className="link" onClick={onNeedKey}>Open Settings</button></p>}
      {err && <p className="err">{err}</p>}
      <div className="bn-grid">
        <div className="card">
          <h3>Connection</h3>
          {!st ? <p className="muted">{busy ? "Checking…" : "Not checked yet."}</p> : (
            <ul className="bn-checks">
              <li className={st.keysSet ? "ok" : "bad"}>{st.keysSet ? "App ID and token saved on the server" : "No Deriv token yet: follow the steps below"}</li>
              {st.keysSet && <li className={st.connected ? "ok" : "bad"}>{st.connected ? `Signed in to ${mode === "live" ? "your real" : "your demo"} Options account ${st.account}` : "Not signed in"}</li>}
            </ul>
          )}
          <button className="btn" onClick={load} disabled={busy || !appKey}>{busy ? "Checking…" : "Test connection"}</button>
        </div>
        <div className="card">
          <h3>Balance</h3>
          {st?.connected ? <dl className="levels"><div><dt>Available</dt><dd className="mono">{st.balance?.toFixed(2)} {st.currency}</dd></div><div><dt>Open contracts</dt><dd className="mono">{st.contracts?.length ?? 0}</dd></div></dl> : <p className="muted">Shows here once connected.</p>}
        </div>
      </div>
      {st?.connected && (
        <>
          <h3 className="pick-sec">Open multiplier contracts</h3>
          {!st.contracts?.length ? <p className="muted">None open. Auto-trade places Deriv trades as two half-size contracts (one per target).</p> : (
            <table className="tbl">
              <thead><tr><th>Market</th><th>Type</th><th className="r">Stake</th><th className="r">Entry / now</th><th className="r">Profit/loss</th><th /></tr></thead>
              <tbody>{st.contracts.map((c) => (
                <tr key={c.id} style={{ cursor: "default" }}>
                  <td><b>{c.symbol}</b><span className="sub">x{c.multiplier}</span></td><td>{c.type === "MULTUP" ? "Up" : "Down"}</td>
                  <td className="r mono">{c.stake.toFixed(2)}</td><td className="r mono">{fmt(c.entry)}<span className="sub">{fmt(c.spot)}</span></td>
                  <td className={`r mono ${c.profit >= 0 ? "bull" : "bear"}`}>{c.profit >= 0 ? "+" : ""}{c.profit.toFixed(2)}</td>
                  <td><button className="btn" disabled={closing === c.id} onClick={() => close(c.id)}>{closing === c.id ? "Closing…" : "Close now"}</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </>
      )}
      <div className="card bn-steps">
        <h3>Connect your Deriv account</h3>
        <ol className="install-steps">
          <li>Sign in at <a href="https://developers.deriv.com" target="_blank" rel="noreferrer">developers.deriv.com</a> with your normal Deriv login (open a free account at deriv.com first if you don't have one).</li>
          <li>Open the <b>Dashboard</b> → <b>Applications</b> → register a new application of type <b>PAT</b> (personal access token). Any name works, such as "Viko". Copy its <b>App ID</b>.</li>
          <li>In the same dashboard, generate a <b>token</b> for that app and tick the <b>trade</b> scope. Copy it; it is shown once.</li>
          <li>Open your <a href={SECRETS} target="_blank" rel="noreferrer">Supabase secrets page</a> and add <code>DERIV_APP_ID</code> (the App ID) and <code>DERIV_TOKEN</code> (the token). One token works for both your demo and your real account.</li>
          <li>Come back here and tap <b>Test connection</b> with Demo selected. Your demo account comes with practice money already.</li>
          <li><b>Real money:</b> in Deriv's Trader's Hub, open a real <b>Options</b> account and deposit (M-Pesa works in Deriv's cashier). Then select Real here and test again.</li>
        </ol>
        <p className="ctx-note">Deriv trades are multipliers: your loss can never exceed the stake you put in. Viko sets a stop-loss and take-profit on every contract.</p>
      </div>
    </>
  );
}

const OTHERS: [string, string, string][] = [
  ["Bybit", "Crypto futures with leverage, popular in Kenya, M-Pesa via P2P.", "Has a public trading API similar to Binance, so it is the easiest next broker to add."],
  ["OKX", "Crypto futures and options.", "Public trading API; can be added the same way as Binance."],
  ["Exness / HFM / FXPesa (MetaTrader 5)", "Forex, gold, indices and stock CFDs with high leverage.", "MetaTrader has no direct web API. It needs a paid bridge service (for example MetaApi) that you sign up for and connect."],
  ["Interactive Brokers / Alpaca", "Real stocks and ETFs.", "Both have trading APIs; availability depends on your country."],
];

function OtherBrokers() {
  return (
    <>
      <p className="muted">Version 1 trades on Binance and Deriv. Between them they cover crypto, US stocks and ETFs, gold, silver, oil, gas, copper and the major forex pairs. These are the brokers that can be added next. Tell me which one you use and it goes into the next update.</p>
      <div className="pick-grid">
        {OTHERS.map(([name, what, how]) => (
          <article key={name} className="card pick">
            <div className="pick-head"><h3>{name}</h3><span className="tag no">Next update</span></div>
            <p>{what}</p>
            <p className="sub">{how}</p>
          </article>
        ))}
      </div>
      <div className="card bn-steps">
        <h3>How a new broker gets added</h3>
        <ol className="install-steps">
          <li>The broker must offer a trading API (a way for apps to place orders). Most big exchanges do.</li>
          <li>Viko gets a small connector for it on the server: price lookups, place order with stop-loss and targets, move the stop, close.</li>
          <li>You create an API key at the broker (trading on, withdrawals off) and save it in Supabase secrets, exactly as with Binance.</li>
          <li>It then appears under "Where" in Auto-trade and here under Brokers.</li>
        </ol>
      </div>
    </>
  );
}
