import type { Tip } from "../engine/layman";

const TONE_WORD: Record<Tip["tone"], string> = { buy: "Buy signal", sell: "Sell signal", wait: "Stand aside", ready: "Get ready" };

export default function TipCard({ tip, onPaper, paperLabel, busy }: { tip: Tip; onPaper?: () => void; paperLabel?: string; busy?: boolean }) {
  const until = new Date(tip.validUntil * 1000);
  return (
    <section className={`tip tip-${tip.tone}`} aria-label="Simple tip">
      <p className="tip-kind">{TONE_WORD[tip.tone]}</p>
      <h2 className="tip-head">{tip.headline}</h2>
      <ol className="tip-steps">{tip.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      <div className="tip-foot">
        <span>Good until about {until.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>
        {onPaper && <button className={`btn ${tip.tone === "buy" || tip.tone === "sell" ? "primary" : ""}`} onClick={onPaper} disabled={busy}>{busy ? "Placing…" : paperLabel ?? "Paper trade this"}</button>}
      </div>
    </section>
  );
}
