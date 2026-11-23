// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Go = (v: any) => void;

const SECTIONS: { id: string; title: string; open?: string; steps: string[] }[] = [
  { id: "start", title: "1. First time setup", open: "analyse", steps: [
    "Install Viko: Android (Chrome) → menu ⋮ → Install app. iPhone (Safari) → Share → Add to Home Screen. Laptop: the install icon in the address bar.",
    "Open Settings (top right) and paste your app key. It unlocks paper trading, the journal, brokers and real-money trading. Keep it private: anyone with it can use your account.",
    "Pick light or dark with the sun/moon button. Viko updates itself; when a new version is out a Reload bar appears.",
  ] },
  { id: "analyse", title: "2. Read any chart", open: "analyse", steps: [
    "Find a market with the search box, or tap one on the left. Each group has See all to browse every market (373 in total: crypto, stocks, indices and ETFs, forex, commodities).",
    "Choose a timeframe from 5 minutes to monthly. Viko counts the Elliott waves (Neely's rules), reads the Wyckoff phase, and checks six indicators (EMA 20/50/200, RSI, MACD, ATR, Bollinger). The verdict is Buy, Sell, Get ready or Don't trade.",
    "The score is the share of all those rules that agree. 80% or more, with the entry signal fired and at least twice the reward to risk, means Approved. If most indicators disagree, Viko won't approve the trade, however good the waves look.",
    "The tip card tells you where to enter, where the stop-loss goes and where to take profit. Under it: Paper trade this (practice) and Trade with real money.",
  ] },
  { id: "top", title: "3. High performers", open: "top", steps: [
    "Every market on every timeframe, filtered down to the strongest setups and ranked best first. It reads Viko's background scan, so it's instant.",
    "Filter by category, timeframe, minimum score (70% to 100%) and buy/sell. Leave Only ones ready to trade now ticked to hide setups still waiting for their entry signal.",
    "Each row has Chart, Paper and Real money. Tick several rows and use the bar at the bottom to paper trade or real-money trade them all at once.",
  ] },
  { id: "picks", title: "4. Today's picks and Scan", open: "picks", steps: [
    "Today's picks shows only fully approved setups at 80/90/95%. All timeframes agree shows whether short and long charts point the same way. Plan my day turns an amount into same-day trades.",
    "Tick Select to trade with others on any pick, then Trade all with real money. Or press Real money on a single card.",
    "Scan reads fresh charts right now on the markets (your watchlist, one category or all 373) and timeframes you choose, and ranks them best to worst. Use it when you want an up-to-the-minute check.",
  ] },
  { id: "paper", title: "5. Practise with paper money", open: "paper", steps: [
    "Paper trading starts with 10,000 practice dollars. Place trades from any chart, pick or High performers row, or switch on the autopilot.",
    "Judge the method on 30 or more trades before trusting it with real money.",
  ] },
  { id: "brokers", title: "6. Connect Binance and Deriv", open: "brokers", steps: [
    "Open Brokers. Each tab has the exact steps: Binance (demo at demo.binance.com, real at binance.com) and Deriv (developers.deriv.com).",
    "You create an API key or token at the broker and paste it into your Supabase secrets page (link on the Brokers page), never into the app or a chat.",
    "Connect and test the demo first. For real money use keys with trading on and withdrawals off.",
  ] },
  { id: "real", title: "7. Trade with real money", open: "top", steps: [
    "Press Real money on a chart, a pick or a High performers row (or select several). Type the amount, choose Real money or Demo, the broker (or Best fit) and the risk level.",
    "Viko shows the live broker price, the stop-loss, both targets, the leverage, your expected profit at target 1 and 2, what you'd lose at the stop, and when to come back. Tick the confirmation and press Trade.",
    "From then on Viko manages it every 5 minutes: half the profit at target 1, stop moved to your entry, the rest closed at target 2, the stop or Viko's time limit. Watch or collect early under Auto-trade → Running.",
  ] },
  { id: "auto", title: "8. Auto-trade with one button", open: "auto", steps: [
    "Auto-trade → Start: choose the broker, demo or live, the money, how many trades (1 to 20), how to share the money, how long (24 hours to 1 month), how strict and how much risk.",
    "The preview lists each trade and the anticipated minimum profit. Press the button and Viko picks, places and manages the trades for the whole window.",
    "Results adds everything up by day, week, month or year.",
  ] },
  { id: "safety", title: "9. Stay safe", steps: [
    "No method wins every trade. The % is how many rules agree, not a promise. Leverage makes losses as big as profits.",
    "Start on demo, use money you can afford to lose, and keep withdrawals switched off on API keys.",
    "Check your broker is allowed where you live. In Kenya, crypto platforms need a licence under the Virtual Asset Service Providers Act.",
  ] },
];

export default function Guide({ go }: { go: Go }) {
  return (
    <section className="view guide">
      <header className="view-head"><div><h2>How to use Viko</h2><p>Version 1. Nine short steps from first install to trading with real money.</p></div></header>
      <nav className="guide-toc" aria-label="Guide sections">{SECTIONS.map((s) => <a key={s.id} href={`#guide`} onClick={(e) => { e.preventDefault(); document.getElementById(`g-${s.id}`)?.scrollIntoView({ behavior: "smooth" }); }}>{s.title}</a>)}</nav>
      {SECTIONS.map((s) => (
        <article key={s.id} id={`g-${s.id}`} className="card guide-card">
          <h3>{s.title}</h3>
          <ul>{s.steps.map((x) => <li key={x}>{x}</li>)}</ul>
          {s.open && <button className="btn" onClick={() => go(s.open)}>Open {s.title.replace(/^\d+\. /, "")}</button>}
        </article>
      ))}
    </section>
  );
}
