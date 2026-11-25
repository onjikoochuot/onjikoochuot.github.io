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
    "The score is the share of all those rules that agree. Since November 2026, Approved means something stricter: Viko replayed its rules on up to 15 years of real prices (78 markets, after costs), found that most setups lost money and the score alone didn't predict results, and now approves only its tested edge: daily-chart wave-3 buys, price above its 200-day average, stop at least 1.5× the average daily range, not forex. Over 1,158 past trades like that, 43% won and the average was +0.24R after costs (+0.27R on the most recent data). Expect roughly 1–2 new approvals a day across all markets, and use waiting orders for setups still forming. Everything else is shown as Watch, with the reason.",
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
    "Judge the method on 30 or more trades before trusting it with real money. More → Track record shows how each score band has really done, after fees and slippage.",
    "Waiting orders: on any paper or real-money ticket, choose When to open → At my price (opens when the price reaches your entry) or When Viko confirms (opens only once Viko re-reads the chart and approves the setup). Viko checks every 5 minutes, cancels at no cost if the stop-loss level is hit first or time runs out, and then manages the trade like any other. Setups marked \"Waiting for entry\" get Paper (wait) and Real (wait) buttons.",
    "Ask me first: choose it under \"When the entry comes\" (the default for real money). When the entry arrives Viko alerts you and shows a banner at the top of the app; you see the live price, change the amount if you like, then Approve or Skip. Pick how long you have to answer and whether an unanswered order keeps waiting or is cancelled. You can change any waiting order's amount, or switch \"Ask me before opening\" on or off, until it opens.",
  ] },
  { id: "brokers", title: "6. Connect your brokers", open: "brokers", steps: [
    "Open Brokers. Each tab has the exact steps: Binance, Bybit, MT5 (Exness, HFM, FXPesa, XM, IC Markets, Pepperstone or any MetaTrader 5 broker, through MetaApi) and Deriv.",
    "You create an API key or token at the broker and paste it into your Supabase secrets page (link on the Brokers page), never into the app or a chat.",
    "Connect and test the demo first. For real money use keys with trading on and withdrawals off.",
  ] },
  { id: "real", title: "7. Trade with real money", open: "top", steps: [
    "Press Real money on a chart, a pick or a High performers row (or select several). Type the amount, choose Real money or Demo, the broker (or Best fit) and the risk level.",
    "Viko shows the live broker price, the stop-loss, both targets, the leverage, your expected profit at target 1 and 2, what you'd lose at the stop, and when to come back. Tick the confirmation and press Trade.",
    "From then on Viko manages it every 5 minutes. The stop-loss trails the price and only moves in your favour: risk halved halfway to target 1, moved to your entry at 80% of the way, then locking in half of the best gain once past target 1. Half the profit is taken at target 1; the rest closes at target 2, the trailing stop or Viko's time limit. Watch or collect early under Auto-trade → Running.",
  ] },
  { id: "auto", title: "8. Auto-trade with one button", open: "auto", steps: [
    "Auto-trade → Start: choose the broker, demo or live, the money, how many trades (1 to 20), how to share the money, how long (24 hours to 1 month), how strict and how much risk.",
    "The preview lists each trade and the anticipated minimum profit. Press the button and Viko picks, places and manages the trades for the whole window.",
    "Results adds everything up by day, week, month or year.",
    "Daily limits (on the Auto-trade page): the most money and the most trades per day, and a loss at which Viko stops for the day (and can close what's open). They apply to Auto-trade and every Real money button.",
  ] },
  { id: "alerts", title: "9. Alerts", open: "alerts", steps: [
    "Open Alerts. Turn on notifications for this phone or computer, and add any of Telegram, WhatsApp, email, ntfy, Discord or Slack. Each has its own short setup and a Send test button.",
    "Choose what to hear about (trade opened, target 1, trade closed with profit or loss, daily loss limit) and for which accounts (real, demo, paper).",
  ] },
  { id: "safety", title: "10. Stay safe", steps: [
    "No method wins every trade. The % is how many rules agree, not a promise. Leverage makes losses as big as profits.",
    "Start on demo, use money you can afford to lose, and keep withdrawals switched off on API keys.",
    "Check your broker is allowed where you live. In Kenya, crypto platforms need a licence under the Virtual Asset Service Providers Act.",
  ] },
];

export default function Guide({ go }: { go: Go }) {
  return (
    <section className="view guide">
      <header className="view-head"><div><h2>How to use Viko</h2><p>Version 1.1. Ten short steps from first install to trading with real money.</p></div></header>
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
