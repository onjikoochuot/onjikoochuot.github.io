import { useEffect, useState } from "react";
import { save, store } from "../lib/api";
import { Results, Running } from "./AutoTrade";
import { WaitingOrders } from "./WhenToOpen";

type Tab = "open" | "history";
/** Every real-money and demo trade Viko placed for you on a broker (Auto-trade and the Real money buttons). Paper trades have their own page. */
export default function MyTrades({ appKey, onNeedKey, onOpen, go }: { appKey: string; onNeedKey: () => void; onOpen: (id: string, tf: string) => void; go: (v: "auto" | "top" | "paper") => void }) {
  const [tab, setTab] = useState<Tab>(() => store("myTradesTab", "open"));
  useEffect(() => save("myTradesTab", tab), [tab]);
  return (
    <section className="view mytrades">
      <header className="view-head">
        <div><h2>My trades</h2><p>Your real-money and demo trades on Binance, Bybit, MT5 and Deriv, from Auto-trade and every Real money button. Viko moves each stop-loss as the price goes your way; collect any trade early here. Practice trades are under <button className="link" onClick={() => go("paper")}>Paper</button>.</p></div>
      </header>
      <div className="seg picks-tabs" role="tablist">
        {([["open", "Open now"], ["history", "History"]] as [Tab, string][]).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {!appKey && <p className="err">Add your app key in Settings first. <button className="link" onClick={onNeedKey}>Open Settings</button></p>}
      {appKey && tab === "open" && <WaitingOrders appKey={appKey} kind="real" />}
      {appKey && tab === "open" && <Running appKey={appKey} onOpen={onOpen} />}
      {appKey && tab === "history" && <Results appKey={appKey} />}
      <p className="sub">To start new trades: <button className="link" onClick={() => go("top")}>High performers</button> (pick them yourself) or <button className="link" onClick={() => go("auto")}>Auto-trade</button> (Viko picks them).</p>
    </section>
  );
}
