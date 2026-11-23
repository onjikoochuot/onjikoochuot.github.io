import type { Setup, Tf } from "./types";
import { fmt } from "./analyze";

export type Tip = { tone: "buy" | "sell" | "wait" | "ready"; headline: string; steps: string[]; validUntil: number };

const TF_HOURS: Record<Tf, number> = { "1h": 1, "4h": 4, "1d": 24, "1w": 168 };
const TF_WORD: Record<Tf, string> = { "1h": "hourly", "4h": "4-hour", "1d": "daily", "1w": "weekly" };

export function duration(hours: number): string {
  if (hours < 20) return `${Math.max(1, Math.round(hours))} hour${Math.round(hours) === 1 ? "" : "s"}`;
  const d = hours / 24;
  if (d < 12) return `${Math.max(1, Math.round(d))} day${Math.round(d) === 1 ? "" : "s"}`;
  const w = d / 7;
  if (w < 9) return `${Math.round(w)} weeks`;
  return `${Math.round(d / 30)} months`;
}
const chg = (from: number, to: number) => `${to >= from ? "+" : "−"}${(Math.abs(to / from - 1) * 100).toFixed(1)}%`;

/** A short, plain-English instruction anyone can follow. */
export function makeTip(s: Setup | null, name: string, tf: Tf, now: number, account: number, riskPct: number): Tip {
  const h = TF_HOURS[tf];
  const validUntil = now + 3 * h * 3600;
  if (!s || s.verdict === "NO TRADE") {
    return {
      tone: "wait", validUntil,
      headline: `Don't trade ${name} right now`,
      steps: [
        `Nothing clear is setting up on the ${TF_WORD[tf]} chart, so the safest move is to do nothing.`,
        s?.hardFail ? "The wave pattern breaks one of Neely's must-pass rules, so any trade here would be a guess." : `Only ${s?.score ?? 0}% of the book rules agree, and Viko needs 80% before it says go.`,
        `Check again in about ${duration(3 * h)}, or scan other markets for a better chance.`,
      ],
    };
  }
  const buy = s.dir === "long";
  const verb = buy ? "Buy" : "Sell short";
  const lossPct = Math.abs(s.entry - s.stop) / s.entry * 100;
  const riskMoney = account * riskPct / 100;
  const holdLo = duration(s.expectBars * h * 0.6), holdHi = duration(s.expectBars * h * 1.6);
  const shortNote = buy ? "" : " (selling short means you earn when the price falls)";
  if (s.verdict === "APPROVED") {
    return {
      tone: buy ? "buy" : "sell", validUntil,
      headline: `${verb} ${name} now`,
      steps: [
        `${verb} at about ${fmt(s.entry)}, today's price${shortNote}.`,
        `Set your stop-loss at ${fmt(s.stop)}. If the price ${buy ? "falls" : "rises"} there, the trade closes automatically and you lose about ${lossPct.toFixed(1)}%.`,
        `Take profit in two steps: half at ${fmt(s.target1)} (${chg(s.entry, s.target1)}), the rest at ${fmt(s.target2)} (${chg(s.entry, s.target2)}).`,
        `When the first target is hit, move your stop to your entry price, so the rest of the trade can't lose.`,
        `Expect it to take roughly ${holdLo} to ${holdHi}. Risking ${riskPct}% of ${fmt(account)} means a worst case of about ${fmt(riskMoney)}.`,
      ],
    };
  }
  if (!s.triggered) {
    return {
      tone: "ready", validUntil,
      headline: `Get ready to ${buy ? "buy" : "sell"} ${name}, but not yet`,
      steps: [
        `Wait for a ${TF_WORD[tf]} candle to close ${buy ? "above" : "below"} ${fmt(s.entry)}. Until then, do nothing.`,
        `If that happens, ${verb.toLowerCase()} with a stop-loss at ${fmt(s.stop)} and a first target at ${fmt(s.target1)}.`,
        `Re-check Viko after that candle closes: the trade only counts once it is approved.`,
      ],
    };
  }
  return {
    tone: "wait", validUntil,
    headline: `${name} looks promising, but don't ${buy ? "buy" : "sell"} yet`,
    steps: [
      `A ${buy ? "rise" : "fall"} is possible, but only ${s.score}% of the book rules agree. Viko waits for 80%.`,
      s.rr1 < 2 ? `The reward isn't worth the risk yet: the first target is only ${s.rr1.toFixed(1)}× as far as the stop.` : `Watch for the missing confirmations listed below.`,
      `Check again in about ${duration(h)}.`,
    ],
  };
}
