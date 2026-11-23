// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Go = (v: any) => void;

const SECTIONS: { id: string; title: string; open?: string; steps: string[] }[] = [
  { id: "start", title: "1. First time setup", open: "analyse", steps: [
    "Install Viko on your phone: Android (Chrome) → menu ⋮ → Install app. iPhone (Safari) → Share → Add to Home Screen. On a laptop, use the install icon in the address bar.",
    "Open Settings (top right) and paste your app key. It unlocks paper trading, the journal, brokers and auto-trading. Keep it private: anyone with it can use your account.",
    "Pick light or dark with the moon/sun button. The app updates itself; when a new version is out you'll see a Reload bar.",
  ] },
  { id: "analyse", title: "2. Read any chart", open: "analyse", steps: [
    "Find a market with the search box, or tap one on the left. Under each group, tap See all to browse every market Viko follows (crypto, stocks, indices, forex, commodities).",
    "Choose a timeframe from 5 minutes to monthly. Viko counts the Elliott waves (Neely's rules) and reads the Wyckoff phase, then gives a verdict: Buy, Sell, Get ready or Don't trade.",
    "The plain-English tip tells you exactly where to enter, where to put the stop-loss, and where to take profit. The gauge shows how many book rules agree; 80% or more means the books approve.",
    "News and a written opinion sit under the chart and refresh about every 10–20 minutes, with warnings before big economic releases.",
  ] },
  { id: "picks", title: "3. Today's picks", open: "picks", steps: [
    "Viko scans every market on every timeframe in the background every 15 minutes. Top picks shows only setups at your chosen bar (80/90/95%).",
    "All timeframes agree shows whether the short and long charts point the same way. Plan my day turns an amount of money into same-day trades with stop-loss and profit in your currency.",
  ] },
  { id: "paper", title: "4. Practise with paper money", open: "paper", steps: [
    "Paper trading starts with 10,000 practice dollars. Place trades from any chart or pick, or switch on the autopilot to let Viko trade the paper account for you.",
    "Use this until you trust the method. The record tells you how the rules really perform; judge it after 30 or more trades.",
  ] },
  { id: "brokers", title: "5. Connect Binance and Deriv", open: "brokers", steps: [
    "Open Brokers. Each tab has the exact steps: Binance (demo at demo.binance.com, real at binance.com) and Deriv (developers.deriv.com).",
    "You create an API key or token at the broker and paste it into your Supabase secrets page (link on the Brokers page), never into the app or a chat.",
    "Always connect and test the demo first. For real money use keys with trading on and withdrawals off.",
  ] },
  { id: "auto", title: "6. Auto-trade with one button", open: "auto", steps: [
    "Open Auto-trade → Start. Choose where (Binance, Deriv or both), demo or live, how much money, how many trades, how to share the money, how long (24 hours to 1 month), how strict and how much risk.",
    "The preview shows each trade Viko would place, the leverage, what you could lose, and the anticipated minimum profit (if each trade reaches its first target). Press the button and you're done.",
    "While it runs, Viko checks every 5 minutes: it takes half the profit at target 1, moves the stop to your entry, raises it as the trade goes your way, and closes everything when your time is up.",
    "Running shows live profit or loss and lets you Collect now. Results adds everything up by day, week, month or year.",
  ] },
  { id: "safety", title: "7. Stay safe", steps: [
    "No method wins every trade. The % is how many book rules agree, not a promise. Leverage makes losses as big as profits.",
    "Start on demo, use money you can afford to lose, and keep withdrawals switched off on API keys.",
    "Check that your broker is allowed where you live. In Kenya, crypto platforms now need a local licence under the VASP Act.",
  ] },
];

export default function Guide({ go }: { go: Go }) {
  return (
    <section className="view guide">
      <header className="view-head"><div><h2>How to use Viko</h2><p>Version 1. Seven short steps from first install to auto-trading.</p></div></header>
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
