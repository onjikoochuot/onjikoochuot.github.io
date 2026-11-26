import type { Setup, Tf } from "./types";
import { fmt } from "./analyze";

export type Tip = { tone: "buy" | "sell" | "wait" | "ready"; headline: string; steps: string[]; validUntil: number };
export type NewsContext = { events: { title: string; currency: string; impact: string; at: number }[]; stance: "bullish" | "bearish" | "neutral"; moodLabel: string };

function newsSteps(news: NewsContext | undefined, s: Setup | null, tfHours: number, nowSec: number): string[] {
  if (!news) return [];
  const out: string[] = [];
  const windowH = Math.max(3, 2 * tfHours);
  const soon = news.events.find((e) => e.at / 1000 > nowSec && (e.at / 1000 - nowSec) / 3600 <= windowH && (e.impact === "High" || (e.impact === "Medium" && (e.at / 1000 - nowSec) / 3600 <= 2)));
  if (soon) {
    const h = (soon.at / 1000 - nowSec) / 3600;
    out.push(`Heads up: ${soon.title} (${soon.currency}, ${soon.impact.toLowerCase()} impact) comes out in ${duration(h)}. Big news can jump the price straight past a stop-loss, so if you can, wait until it's out.`);
  }
  if (s && s.verdict !== "NO TRADE" && news.stance !== "neutral") {
    const agrees = (news.stance === "bullish") === (s.dir === "long");
    out.push(agrees ? `The news mood is ${news.stance}, which agrees with this ${s.dir === "long" ? "buy" : "sell"}.` : `The news mood is ${news.stance}, against this ${s.dir === "long" ? "buy" : "sell"}. Use half your usual size, or wait.`);
  }
  return out;
}

export const TF_HOURS: Record<Tf, number> = { "5m": 1 / 12, "15m": 0.25, "30m": 0.5, "1h": 1, "2h": 2, "4h": 4, "1d": 24, "1w": 168, "1M": 730 };
const TF_WORD: Record<Tf, string> = { "5m": "5-minute", "15m": "15-minute", "30m": "30-minute", "1h": "hourly", "2h": "2-hour", "4h": "4-hour", "1d": "daily", "1w": "weekly", "1M": "monthly" };

export function duration(hours: number): string {
  if (hours < 1) return `${Math.max(5, Math.round(hours * 60 / 5) * 5)} minutes`;
  if (hours < 20) return `${Math.max(1, Math.round(hours))} hour${Math.round(hours) === 1 ? "" : "s"}`;
  const d = hours / 24;
  if (d < 12) return `${Math.max(1, Math.round(d))} day${Math.round(d) === 1 ? "" : "s"}`;
  const w = d / 7;
  if (w < 9) return `${Math.round(w)} weeks`;
  return `${Math.round(d / 30)} months`;
}
const chg = (from: number, to: number) => `${to >= from ? "+" : "−"}${(Math.abs(to / from - 1) * 100).toFixed(1)}%`;

/** A short, plain-English instruction anyone can follow. */
export function makeTip(s: Setup | null, name: string, tf: Tf, now: number, account: number, riskPct: number, news?: NewsContext): Tip {
  const h = TF_HOURS[tf];
  const validUntil = now + 3 * h * 3600;
  const extra = newsSteps(news, s, h, now);
  if (!s || s.verdict === "NO TRADE") {
    return {
      tone: "wait", validUntil,
      headline: `Don't trade ${name} right now`,
      steps: [...extra,
        `Nothing clear is setting up on the ${TF_WORD[tf]} chart, so the safest move is to do nothing.`,
        s?.hardFail ? "The wave pattern breaks one of Neely's must-pass rules, so any trade here would be a guess." : "Viko only says go for its tested edge: a daily-chart wave-3 buy in an uptrend, in stocks, funds, indices or commodities.",
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
      steps: [...extra,
        `${verb} at about ${fmt(s.entry)}, today's price${shortNote}.`,
        `Set your stop-loss at ${fmt(s.stop)}. If the price ${buy ? "falls" : "rises"} there, the trade closes automatically and you lose about ${lossPct.toFixed(1)}%.`,
        `Take profit in two steps: half at ${fmt(s.target1)} (${chg(s.entry, s.target1)}), the rest at ${fmt(s.target2)} (${chg(s.entry, s.target2)}).`,
        `When the first target is hit, move your stop to your entry price, so the rest of the trade can't lose.`,
        s.edge?.ok ? `Give it time: in testing, half of these trades took over a month, so don't set a short time limit (Viko lets them run up to 2 months). Risking ${riskPct}% of ${fmt(account)} means a worst case of about ${fmt(riskMoney)}.` : `Expect it to take roughly ${holdLo} to ${holdHi}. Risking ${riskPct}% of ${fmt(account)} means a worst case of about ${fmt(riskMoney)}.`,
      ],
    };
  }
  // Outside the tested edge: say so plainly, whatever the rule score, so the advice never contradicts the verdict.
  if (s.edge && !s.edge.ok && !s.hardFail) {
    return {
      tone: "wait", validUntil,
      headline: `Don't trade ${name} with this setup`,
      steps: [...extra,
        s.edge.why,
        `Viko only approves its tested edge: daily-chart wave-3 buys in an uptrend, with a stop at least 1.5× the daily range, in stocks, funds, indices or commodities.`,
        `The rule score (${s.score}%) only says how many textbook rules agree; in testing it did not predict wins, so it is not a reason to trade.`,
      ],
    };
  }
  if (!s.triggered) {
    return {
      tone: "ready", validUntil,
      headline: `Get ready to ${buy ? "buy" : "sell"} ${name}, but not yet`,
      steps: [...extra,
        `Wait for a ${TF_WORD[tf]} candle to close ${buy ? "above" : "below"} ${fmt(s.entry)}. Until then, do nothing.`,
        `If that happens, ${verb.toLowerCase()} with a stop-loss at ${fmt(s.stop)} and a first target at ${fmt(s.target1)}.`,
        `Re-check Viko after that candle closes: the trade only counts once it is approved.`,
      ],
    };
  }
  return {
    tone: "wait", validUntil,
    headline: `${name} looks promising, but don't ${buy ? "buy" : "sell"} yet`,
    steps: [...extra,
      s.hardFail ? `A must-pass rule is broken (see the checklist below), so this count may be wrong.` : `A ${buy ? "rise" : "fall"} is possible, but it isn't ready to trade yet.`,
      s.rr1 < 1.5 ? `The reward isn't worth the risk yet: the first target is only ${s.rr1.toFixed(1)}× as far as the stop.` : `Watch for the missing confirmations listed below.`,
      `Check again in about ${duration(h)}.`,
    ],
  };
}
