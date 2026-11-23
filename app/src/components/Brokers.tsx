import { useEffect, useState } from "react";
import { fmt } from "../engine/analyze";
import { auto, save, store, type DerivStatus } from "../lib/api";
import { BinanceView } from "./Binance";

type Tab = "binance" | "bybit" | "mt5" | "deriv" | "other";
const SECRETS = "https://supabase.com/dashboard/project/fkrgiaeglingmogcsyik/functions/secrets";

export default function Brokers({ appKey, onNeedKey }: { appKey: string; onNeedKey: () => void }) {
  const [tab, setTab] = useState<Tab>(() => store("brokerTab", "binance"));
  const [counts, setCounts] = useState<{ total: number; binance_live: number; binance_demo: number; deriv?: number; bybit?: number; mt5_demo?: number; mt5_live?: number } | null>(null);
  useEffect(() => save("brokerTab", tab), [tab]);
  useEffect(() => { auto.markets().then(setCounts).catch(() => {}); }, []);
  return (
    <section className="view brokers">
      <header className="view-head">
        <div>
          <h2>Brokers</h2>
          <p>Connect the accounts Viko trades for you. Keys live only in your Supabase secrets, never in the app. {counts ? `Of Viko's ${counts.total} markets, Binance can trade ${counts.binance_live} (${counts.binance_demo} on its demo), Bybit ${counts.bybit ?? "–"}, Deriv ${counts.deriv ?? "–"}${counts.mt5_live ?? counts.mt5_demo ? ` and your MT5 broker ${counts.mt5_live ?? counts.mt5_demo}` : "; MT5 depends on your broker"}.` : ""}</p>
        </div>
      </header>
      <div className="seg picks-tabs" role="tablist">
        {([["binance", "Binance"], ["bybit", "Bybit"], ["mt5", "MT5 (Exness, HFM, FXPesa…)"], ["deriv", "Deriv"], ["other", "Others"]] as [Tab, string][]).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "binance" && <BinanceView appKey={appKey} onNeedKey={onNeedKey} embedded />}
      {tab === "deriv" && <DerivPanel appKey={appKey} onNeedKey={onNeedKey} />}
      {tab === "bybit" && <KeyBroker appKey={appKey} onNeedKey={onNeedKey} broker="bybit" intro="Bybit USDT perpetual futures: Bitcoin, Ether and hundreds of other coins with leverage. Viko places a market order with the stop-loss attached, then take-profit orders for half at target 1 and the rest at target 2." steps={[
        <><b>Start with the demo.</b> Sign in at <a href="https://www.bybit.com" target="_blank" rel="noreferrer">bybit.com</a>, open your profile menu and switch to <b>Demo Trading</b>. It comes with practice USDT.</>,
        <>While in Demo Trading: profile → <b>API</b> → <b>Create New Key</b> → <b>System-generated</b>. Permissions: <b>Contract → Orders and Positions</b> (Read-Write). Don't tick withdrawals. Copy the key and the secret.</>,
        <>On your <a href={SECRETS} target="_blank" rel="noreferrer">Supabase secrets page</a> add <code>BYBIT_DEMO_KEY</code> and <code>BYBIT_DEMO_SECRET</code>.</>,
        <>Keep the position mode on <b>One-Way</b> (the default) for USDT perpetuals. Then tap <b>Test connection</b> above.</>,
        <><b>Real money:</b> leave Demo Trading, create a key the same way on your real account, and add it as <code>BYBIT_LIVE_KEY</code> and <code>BYBIT_LIVE_SECRET</code>. Fund your Unified Trading account with USDT (P2P with M-Pesa works). Keys without an IP restriction expire after 3 months on Bybit, so renew them then.</>,
      ]} note="Bybit doesn't serve every country. If the test says Bybit refused this server's location, use Binance, MT5 or Deriv instead." />}
      {tab === "mt5" && <KeyBroker appKey={appKey} onNeedKey={onNeedKey} broker="mt5" intro="Any MetaTrader 5 broker: Exness, HFM, FXPesa, XM, IC Markets, Pepperstone, Deriv MT5 and more. Forex, gold, silver, oil, US indices and crypto CFDs. MT5 has no web API of its own, so Viko talks to it through MetaApi, a cloud service that keeps your MT5 account online." steps={[
        <>Have an MT5 account at your broker (open a <b>demo</b> first). Note its <b>login number</b>, <b>trading password</b> and <b>server name</b> (for example Exness-MT5Trial8).</>,
        <>Create an account at <a href="https://app.metaapi.cloud" target="_blank" rel="noreferrer">app.metaapi.cloud</a>. MetaApi is a paid service with a free trial; check its pricing page.</>,
        <>In MetaApi: <b>Accounts</b> → <b>Add account</b> → MetaTrader 5 → enter the login, password and server → <b>Deploy</b>. Copy the <b>account ID</b> and note its <b>region</b> (for example new-york or london).</>,
        <>In MetaApi: <b>API access</b> → generate an <b>auth token</b> and copy it.</>,
        <>On your <a href={SECRETS} target="_blank" rel="noreferrer">Supabase secrets page</a> add <code>METAAPI_TOKEN</code>, <code>METAAPI_ACCOUNT_DEMO</code> (the account ID) and, if the region isn't new-york, <code>METAAPI_REGION</code>. Then tap <b>Test connection</b>.</>,
        <><b>Real money:</b> add your real MT5 account in MetaApi the same way and save its ID as <code>METAAPI_ACCOUNT_LIVE</code>.</>,
      ]} note="Viko finds your broker's own symbol names (EURUSDm, XAUUSD, US500, USTEC…) and sizes trades in lots. It opens two half positions, each with a stop-loss, so half can close at target 1 and the rest at target 2. MT5 can't withdraw money, but MetaApi does hold your trading password, so only use an account you're comfortable connecting." />}
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
  ["OKX", "Crypto futures and options.", "Public trading API; can be added the same way as Bybit."],
  ["Bitget", "Crypto futures and copy trading.", "Public trading API; same pattern as Bybit."],
  ["Interactive Brokers / Alpaca", "Real stocks and ETFs.", "Both have trading APIs; availability depends on your country."],
];

function OtherBrokers() {
  return (
    <>
      <p className="muted">Viko trades on Binance, Bybit, Deriv and any MetaTrader 5 broker (through MetaApi). Between them they cover crypto, US stocks and ETFs, gold, silver, oil, gas, indices and forex. These can be added next.</p>
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

/** Connection test plus setup steps for a broker connected with keys in Supabase secrets. */
function KeyBroker({ appKey, onNeedKey, broker, intro, steps, note }: { appKey: string; onNeedKey: () => void; broker: "bybit" | "mt5"; intro: string; steps: React.ReactNode[]; note: string }) {
  const [mode, setMode] = useState<"demo" | "live">(() => store(`${broker}Mode`, "demo"));
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { save(`${broker}Mode`, mode); setRes(null); }, [mode, broker]);
  const test = async () => {
    if (!appKey) { onNeedKey(); return; }
    setBusy(true); setRes(null);
    try { const j = await auto.connect(appKey, broker, mode); setRes({ ok: true, text: `Connected. Free to trade: ${j.balance.toFixed(2)} ${j.currency}${j.account ? ` · ${j.account}` : ""}.` }); }
    catch (e) { setRes({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  };
  return (
    <>
      <p className="muted">{intro}</p>
      <div className="seg bn-modes" role="radiogroup" aria-label="Account">{(["demo", "live"] as const).map((m) => <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{m === "demo" ? "Demo" : "Real money"}</button>)}</div>
      <div className="card">
        <h3>Connection</h3>
        <button className="btn primary" onClick={test} disabled={busy}>{busy ? "Checking…" : "Test connection"}</button>
        {res && <p className={res.ok ? "pos-c" : "neg"}>{res.text}</p>}
      </div>
      <div className="card bn-steps">
        <h3>Connect your {broker === "bybit" ? "Bybit" : "MT5"} account</h3>
        <ol className="install-steps">{steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
        <p className="ctx-note">{note}</p>
        <p className="sub">Never paste API keys into chat, email or this app. Only the Supabase secrets page holds them.</p>
      </div>
    </>
  );
}
