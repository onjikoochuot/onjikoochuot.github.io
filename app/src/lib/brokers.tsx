import type { AutoCfg } from "./api";

/** Brokers Viko can place and manage trades on. */
export const BROKERS: { id: Exclude<AutoCfg["broker"], "both">; name: string; what: string; cur: string }[] = [
  { id: "binance", name: "Binance", what: "Crypto, gold, oil and about 200 US stocks and ETFs (futures)", cur: "USDT" },
  { id: "bybit", name: "Bybit", what: "Crypto futures", cur: "USDT" },
  { id: "mt5", name: "MT5 broker", what: "Exness, HFM, FXPesa, XM, IC Markets, Pepperstone and any MetaTrader 5 broker: forex, gold, oil, US indices", cur: "USD" },
  { id: "deriv", name: "Deriv", what: "Forex, gold, silver, Bitcoin and Ether as multipliers", cur: "USD" },
];
/** Shown in the list but not selectable yet. */
export const COMING = ["OKX", "Bitget", "Interactive Brokers", "Alpaca"];
export const brokerLabel = (b: string) => (b === "both" ? "Every connected broker" : BROKERS.find((x) => x.id === b)?.name ?? b);
export const curFor = (b: string) => BROKERS.find((x) => x.id === b)?.cur ?? "USD";

export function BrokerSelect({ value, onChange, label = "Broker" }: { value: AutoCfg["broker"]; onChange: (b: AutoCfg["broker"]) => void; label?: string }) {
  const help = value === "both" ? "Each trade goes to whichever connected broker offers that market (Binance first, then Bybit, MT5, Deriv)." : BROKERS.find((b) => b.id === value)?.what;
  return (
    <label className="auto-field">
      <span className="auto-label">{label}</span>
      <select className="auto-select" value={value} onChange={(e) => onChange(e.target.value as AutoCfg["broker"])}>
        <option value="both">Every connected broker (best fit)</option>
        {BROKERS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        <optgroup label="Coming next (not connectable yet)">{COMING.map((n) => <option key={n} disabled>{n}</option>)}</optgroup>
      </select>
      {help && <small className="sub">{help}</small>}
    </label>
  );
}
