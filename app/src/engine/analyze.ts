import type { Analysis, Candle, Check, Dir, Indicators, Pivot, Setup, Tf, WaveLabel, WyckoffRead } from "./types";
import { aggregate, computeIndicators, ema } from "./indicators";
import { DEGREES, lineAt, monowaves } from "./waves";
import { isSignificantBar, readWyckoff, waveVolume } from "./wyckoff";

/*
 * Rule engine. Neely rules are cited from Glenn Neely, "Mastering Elliott Wave" (NEoWave):
 *   ch. 3  Rule of Similarity & Balance, Rule of Neutrality
 *   ch. 5  Essential Construction Rules for impulses, Extension, Overlap, Conditional rules (Alternation, Equality, Channeling)
 *   ch. 5  Corrections: Zigzag (b <= 61.8% of a) vs Flat (b >= 61.8% of a), c-wave relationships
 *   ch. 6  Post-constructive confirmation: 2-4 trendline broken in time <= wave 5
 * Wyckoff rules are cited from Villahermosa, "The Wyckoff Methodology in Depth" by chapter.
 */

const NEELY = "Neely, Mastering Elliott Wave";
const WY = "Villahermosa, Wyckoff Methodology in Depth";
const APPROVE_SCORE = 80;
const MIN_RR = 2;

const mirror = (c: Candle[]): Candle[] => c.map((k) => ({ t: k.t, o: -k.o, h: -k.l, l: -k.h, c: -k.c, v: k.v }));
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const px = (x: number) => fmt(Math.abs(x));

type Ctx = {
  c: Candle[]; atr: number[]; useVol: boolean; dir: Dir; // dir = real direction of the long-normalised setup
  wyBias: Dir | null; wy: WyckoffRead; htf: Dir | null; degreeName: string; degreeKey: string;
  ind: Indicators; // computed on ctx.c, so for shorts these are the mirrored series and every check reads as a long
};

const IND = "Indicator filter (Viko policy, not from either book)";
/** Classic indicators as a safety filter. They carry about a quarter of the score and can stop an approval, but never create one. */
function indicatorChecks(ctx: Ctx, entry: number, stop: number): Check[] {
  const { c, ind } = ctx;
  const n = c.length - 1, close = c[n].c;
  const ok = (x: number) => Number.isFinite(x);
  const sign = ctx.dir === "long" ? 1 : -1; // show real prices in the text
  const p = (x: number) => fmt(Math.abs(x));
  const word = ctx.dir === "long" ? ["above", "below", "rising", "falling", "upper"] : ["below", "above", "falling", "rising", "lower"];
  const rsiReal = ctx.dir === "long" ? ind.rsi[n] : 100 - ind.rsi[n];
  const r = ind.rsi[n], hist = ind.hist[n], histPrev = ind.hist[n - 1];
  const atr = ind.atr[n], stopDist = Math.abs(entry - stop);
  return [
    { id: "i-ema200", group: "Indicators", weight: 2, label: `Price is on the trade's side of the 200 EMA`, pass: ok(ind.ema200[n]) ? close > ind.ema200[n] : null,
      detail: ok(ind.ema200[n]) ? `Price ${p(close * sign)} is ${close > ind.ema200[n] ? word[0] : word[1]} the 200 EMA at ${p(ind.ema200[n] * sign)}.` : "Not enough history for a 200 EMA.", source: IND },
    { id: "i-ema2050", group: "Indicators", weight: 1, label: "Short-term average leads (20 EMA vs 50 EMA)", pass: ok(ind.ema50[n]) ? ind.ema20[n] > ind.ema50[n] : null,
      detail: ok(ind.ema50[n]) ? `20 EMA ${p(ind.ema20[n] * sign)}, 50 EMA ${p(ind.ema50[n] * sign)}.` : "Not enough history.", source: IND },
    { id: "i-rsi", group: "Indicators", weight: 1, label: "RSI has momentum but isn't stretched", pass: ok(r) ? r >= 45 && r <= 72 : null,
      detail: ok(r) ? `RSI 14 is ${rsiReal.toFixed(1)}. ${r > 72 ? "Already stretched in the trade's direction: late entry." : r < 45 ? "Momentum still points the other way." : "Healthy."}` : "Not enough history.", source: IND },
    { id: "i-macd", group: "Indicators", weight: 1, label: "MACD momentum agrees", pass: ok(hist) && ok(histPrev) ? hist > 0 || hist > histPrev : null,
      detail: ok(hist) ? `MACD histogram is ${hist > 0 ? "on the trade's side" : "against the trade"} and ${hist > histPrev ? word[2] : word[3]} toward it.` : "Not enough history.", source: IND },
    { id: "i-atr", group: "Indicators", weight: 1, label: "Stop-loss sits outside normal noise (at least ¾ ATR)", pass: ok(atr) && atr > 0 ? stopDist >= 0.75 * atr : null,
      detail: ok(atr) ? `Stop is ${(stopDist / atr).toFixed(2)} ATR from the entry. ${stopDist < 0.75 * atr ? "Ordinary swings could hit it." : ""}` : "No ATR.", source: IND },
    { id: "i-bb", group: "Indicators", weight: 1, label: `Not chasing: price is inside the ${word[4]} Bollinger band`, pass: ok(ind.bbU[n]) ? close <= ind.bbU[n] : null,
      detail: ok(ind.bbU[n]) ? `Price ${p(close * sign)} vs the band at ${p(ind.bbU[n] * sign)}.` : "Not enough history.", source: IND },
  ];
}

function trigger(ctx: Ctx, prevExtreme: Pivot, low: Pivot) {
  const { c, useVol } = ctx;
  const n = c.length;
  // Wyckoff ch. 27 "reversal of movement": a bullish bar closing above the high of the last significant bearish bar.
  let sb = -1;
  for (let k = low.i; k >= Math.max(prevExtreme.i, low.i - 40); k--) if (isSignificantBar(c, k, "short", useVol)) { sb = k; break; }
  const level = sb >= 0 ? c[sb].h : Math.max(...c.slice(Math.max(0, low.i - 3), low.i + 1).map((k) => k.h));
  let at = -1;
  for (let k = low.i + 1; k < n; k++) if (c[k].c > level) { at = k; break; }
  const sigAfter = at >= 0 && c.slice(low.i + 1, n).some((_, j) => isSignificantBar(c, low.i + 1 + j, "long", useVol));
  return { level, at, fromSig: sb >= 0, sigAfter };
}

function contextChecks(ctx: Ctx, impulseFrom: number, impulseTo: number, corrFrom: number, corrTo: number, testI: number): Check[] {
  const { c, useVol, wy, wyBias, htf, dir } = ctx;
  const out: Check[] = [];
  const conflict = wyBias !== null && wyBias !== dir;
  out.push({
    id: "wy-context", group: "Wyckoff", hard: conflict, weight: 3,
    label: "Wyckoff structure supports this direction",
    pass: wy.kind === null ? false : wyBias === dir,
    detail: wy.kind === null ? "No accumulation or distribution range is readable here, so the trade has no Wyckoff cause behind it."
      : conflict ? `The active ${wy.kind} (Phase ${wy.phase}) points the other way. The book: never trade against the context.`
      : wyBias === dir ? `${wy.kind === "accumulation" ? "Accumulation" : "Distribution"} in Phase ${wy.phase} favours ${dir === "long" ? "buying" : "selling"}.`
      : `${wy.kind} still in Phase ${wy.phase}: the cause is being built, direction not yet confirmed.`,
    source: `${WY}, Part 7 (context) and ch. 21-25`,
  });
  out.push({
    id: "htf", group: "Wyckoff", hard: false, weight: 3, label: "Higher timeframe trend agrees",
    pass: htf === null ? false : htf === dir,
    detail: htf === null ? "The higher timeframe is sideways, so there is no larger structure to lean on." : htf === dir ? `Higher timeframe is trending ${dir === "long" ? "up" : "down"}.` : `Higher timeframe trends ${htf === "long" ? "up" : "down"}: this trade fights the larger structure.`,
    source: `${WY}, Part 7 "trade in favour of the larger structure"`,
  });
  const vImp = waveVolume(c, impulseFrom, impulseTo), vCor = waveVolume(c, corrFrom, corrTo);
  out.push({
    id: "effort", group: "Wyckoff", weight: 2, label: "Effort and result in harmony",
    pass: useVol ? vImp > vCor : null,
    detail: useVol ? `Average volume in the impulse leg is ${(vImp / (vCor || 1)).toFixed(2)}× the correction. ${vImp > vCor ? "Impulses on rising volume, pullbacks on falling volume." : "The pullback carried more volume than the impulse: divergence."}` : "This market has no centralised volume (forex/indices on Yahoo), so this rule is skipped.",
    source: `${WY}, ch. 9`,
  });
  const tv = testI >= 2 ? c[testI].v < c[testI - 1].v && c[testI].v < c[testI - 2].v : false;
  out.push({
    id: "test", group: "Wyckoff", weight: 1, label: "The turning point was a low-volume test",
    pass: useVol ? tv : null,
    detail: useVol ? (tv ? "Volume on the turning bar was below the two bars before it: no opposing interest (No Supply/No Demand)." : "The turning bar carried more volume than the bars before it: the test is not clean.") : "Skipped: no usable volume.",
    source: `${WY}, ch. 17 "how the test appears on the graph"`,
  });
  return out;
}

function finish(ctx: Ctx, baseIn: Omit<Setup, "score" | "hardFail" | "rr1" | "rr2" | "verdict" | "reasons" | "plain" | "tip" | "dir" | "edge">, lastClose: number, trig: ReturnType<typeof trigger>): Setup {
  let base = baseIn;
  const n = ctx.c.length;
  const entry = base.triggered ? lastClose : trig.level;
  if (base.target2 < base.target1) base = { ...base, target2: base.target1 + 0.618 * (base.target1 - base.stop) };
  const risk = entry - base.stop;
  const rr1 = risk > 0 ? (base.target1 - entry) / risk : 0;
  const rr2 = risk > 0 ? (base.target2 - entry) / risk : 0;
  const stale = base.triggered && (lastClose >= base.target1 || (trig.at >= 0 && n - 1 - trig.at > 25));
  const checks: Check[] = [...base.checks,
    { id: "rr", group: "Risk", weight: 2, hard: false, label: `Reward is at least ${MIN_RR}× the risk to target 1`, pass: rr1 >= MIN_RR, detail: `Risk ${risk.toPrecision(5)} per unit, reward to target 1 is ${rr1.toFixed(2)}R (target 2: ${rr2.toFixed(2)}R).`, source: `${WY}, ch. 27 position management (app policy: ${MIN_RR}R minimum)` },
    { id: "trigger", group: "Risk", weight: 3, hard: false, label: "Entry trigger has fired", pass: base.triggered, detail: base.triggerNote, source: `${WY}, ch. 27 "significant bar" and "reversal of movement"` },
    ...indicatorChecks(ctx, entry, base.stop),
  ];
  const indAll = checks.filter((k) => k.group === "Indicators" && k.pass !== null);
  const indAgainst = indAll.filter((k) => !k.pass).length;
  const indVeto = indAll.length >= 4 && indAgainst > indAll.length / 2; // most indicators disagree: no approval
  const scored = checks.filter((k) => k.pass !== null);
  const total = scored.reduce((s, k) => s + k.weight, 0);
  const got = scored.filter((k) => k.pass).reduce((s, k) => s + k.weight, 0);
  const score = total ? Math.round((got / total) * 100) : 0;
  const hardFail = checks.some((k) => k.hard && k.pass === false);
  const reasons: string[] = [];
  if (hardFail) reasons.push("A hard rule failed: " + checks.filter((k) => k.hard && k.pass === false).map((k) => k.label.toLowerCase()).join("; ") + ".");
  if (score < APPROVE_SCORE) reasons.push(`Rule confluence is ${score}%, below the ${APPROVE_SCORE}% bar.`);
  if (!base.triggered) reasons.push("The entry trigger has not fired yet.");
  if (rr1 < MIN_RR) reasons.push(`Reward to target 1 is only ${rr1.toFixed(2)}R.`);
  if (stale) reasons.push("Price has already travelled most of the move; the entry is stale.");
  if (indVeto) reasons.push(`${indAgainst} of ${indAll.length} indicators disagree (trend, momentum or a stretched price), so Viko won't approve it yet.`);
  const verdict: Setup["verdict"] = !hardFail && score >= APPROVE_SCORE && base.triggered && rr1 >= MIN_RR && !stale && !indVeto ? "APPROVED" : !hardFail && score >= 55 && !stale ? "WATCH" : "NO TRADE";
  return { ...base, dir: ctx.dir, entry, checks, score, hardFail, rr1, rr2, verdict, reasons, plain: "", tip: "", edge: { ok: false, why: "" } };
}

/** Similarity & Balance (Neely p. 4-3/4-4): every adjacent pair must relate by at least 1/3 in price OR time. */
function simBalance(legs: { len: number; bars: number; name: string }[]) {
  const bad: string[] = [];
  for (let k = 1; k < legs.length; k++) {
    const A = legs[k - 1], B = legs[k];
    const pOk = Math.min(A.len, B.len) >= Math.max(A.len, B.len) / 3;
    const tOk = Math.min(A.bars, B.bars) >= Math.max(A.bars, B.bars) / 3;
    if (!pOk && !tOk) bad.push(`${A.name}/${B.name}`);
  }
  return bad;
}

/** Has any close since bar `from` broken below the line through a and b (long-normalised)? */
function brokeBelow(c: Candle[], a: Pivot, b: Pivot, from: number, ceiling?: number) {
  for (let k = from + 1; k < c.length; k++) {
    if (ceiling !== undefined && c[k].c > ceiling) return -1; // left the zone: later breaks don't count
    if (c[k].c < lineAt(a, b, k)) return k;
  }
  return -1;
}

/** All long-normalised setups for one degree. Caller mirrors candles for shorts. */
function setupsForDegree(ctx: Ctx, pv: Pivot[]): Setup[] {
  const { c, atr } = ctx;
  const n = c.length;
  const out: Setup[] = [];
  const lastClose = c[n - 1].c;
  const a = atr[n - 1];
  const L = pv.length;
  const last = pv[L - 1];
  if (!last || L < 4) return out;
  const lbl = (p: Pivot, text: string): WaveLabel => ({ i: p.i, p: p.p, text });
  const N = (page: string) => `${NEELY}, p. ${page}`;

  // Every long setup below needs the current leg to be rising from a confirmed low.
  if (last.kind !== "H") return out;

  // ---------- Setup 1: start of wave 3 ----------
  {
    const [p0, p1, p2] = [pv[L - 4], pv[L - 3], pv[L - 2]];
    if (p0.kind === "L" && p1.kind === "H" && p2.kind === "L") {
      const w1 = p1.p - p0.p, w2 = p1.p - p2.p;
      const t1 = p1.i - p0.i, t2 = p2.i - p1.i;
      const ret = w2 / w1;
      const priorHighs = pv.slice(Math.max(0, L - 9), L - 4).filter((p) => p.kind === "H");
      const lastLowerHigh = priorHighs.length ? priorHighs[priorHighs.length - 1].p : -Infinity;
      const sb = simBalance([{ len: w1, bars: t1, name: "1" }, { len: w2, bars: t2, name: "2" }]);
      const brk02 = brokeBelow(c, p0, p2, p2.i, p1.p);
      const trig = trigger(ctx, p1, p2);
      const checks: Check[] = [
        { id: "e-w2", group: "Neely: essential", hard: true, weight: 1, label: "Wave 2 never retraces all of wave 1", pass: p2.p > p0.p, detail: `Wave 2 retraced ${pct(ret)} of wave 1.`, source: N("5-2, rule 3") },
        { id: "e-sb", group: "Neely: essential", hard: true, weight: 1, label: "Waves 1 and 2 are the same degree (Similarity & Balance)", pass: sb.length === 0, detail: `Wave 2 is ${pct(w2 / w1)} of wave 1 in price and ${pct(t2 / Math.max(1, t1))} in time. One of them must be at least a third.`, source: N("4-3 to 4-4") },
        { id: "e-02", group: "Neely: essential", hard: true, weight: 2, label: "The 0-2 trendline has held since wave 2 ended", pass: brk02 < 0, detail: brk02 < 0 ? "No close below the 0-2 line while price was still in wave 2's zone." : "Price closed below the 0-2 line inside wave 2's zone, so wave 2 is not finished yet (it is only wave a of 2).", source: N("5-9 to 5-10, Channeling") },
        { id: "c-ret", group: "Neely: conditional", weight: 2, label: "Wave 2 depth is typical (38.2% to 78.6%)", pass: ret >= 0.382 && ret <= 0.786, detail: `Retracement ${pct(ret)}. A very shallow wave 2 is often unfinished.`, source: N("5-2; Fibonacci ch. 12") },
        { id: "c-alt12", group: "Neely: conditional", weight: 1, label: "Wave 2 differs from wave 1 in time", pass: t2 >= 1.618 * t1 || t2 <= 0.618 * t1, detail: `Wave 1 took ${t1} bars, wave 2 ${t2} bars.`, source: N("5-5, Rule of Alternation") },
        { id: "w-choch", group: "Wyckoff", weight: 2, label: "Wave 1 changed character (broke the last lower high)", pass: p1.p > lastLowerHigh, detail: Number.isFinite(lastLowerHigh) ? `Wave 1 peaked at ${px(p1.p)} vs the prior swing high at ${px(lastLowerHigh)}.` : "No earlier swing high to compare.", source: `${WY}, ch. 16 and 19 (Change of Character)` },
        ...contextChecks(ctx, p0.i, p1.i, p1.i, p2.i, p2.i),
      ];
      out.push(finish(ctx, {
        id: `w3-${ctx.degreeKey}`, name: "Wave 3 entry", degree: ctx.degreeName, pattern: "Impulse, waves 1-2 complete",
        labels: [lbl(p0, "0"), lbl(p1, "1"), lbl(p2, "2")],
        entry: lastClose, stop: p2.p - 0.25 * a, invalidation: p0.p, target1: p2.p + w1, target2: p2.p + 1.618 * w1,
        expectBars: Math.max(3, t1),
        triggered: trig.at >= 0 && lastClose > p2.p,
        triggerNote: trig.at >= 0 ? `Price closed above ${px(trig.level)} (${trig.fromSig ? "high of the last significant bearish bar" : "recent swing high"}) ${n - 1 - trig.at} bars ago.` : `Waiting for a close above ${px(trig.level)}.`,
        checks,
      }, lastClose, trig));
    }
  }

  // ---------- Setup 2: wave 5 entry ----------
  if (L >= 6) {
    const [p0, p1, p2, p3, p4] = pv.slice(L - 6, L - 1);
    if (p0.kind === "L" && p1.kind === "H" && p2.kind === "L" && p3.kind === "H" && p4.kind === "L") {
      const w1 = p1.p - p0.p, w2 = p1.p - p2.p, w3 = p3.p - p2.p, w4 = p3.p - p4.p;
      const t1 = p1.i - p0.i, t2 = p2.i - p1.i, t3 = p3.i - p2.i, t4 = p4.i - p3.i;
      const r2 = w2 / w1, r4 = w4 / w3;
      const ext3 = w3 >= 1.618 * w1, ext1 = w1 >= 1.618 * w3;
      const trending = p4.p > p1.p;
      const altPrice = Math.max(w2, w4) / Math.min(w2, w4) >= 1.382;
      const altTime = Math.max(t2, t4) / Math.max(1, Math.min(t2, t4)) >= 1.382;
      const altSev = Math.abs(r2 - r4) >= 0.1;
      const sb = simBalance([{ len: w1, bars: t1, name: "1" }, { len: w2, bars: t2, name: "2" }, { len: w3, bars: t3, name: "3" }, { len: w4, bars: t4, name: "4" }]);
      const brk24 = brokeBelow(c, p2, p4, p4.i, p3.p);
      const trig = trigger(ctx, p3, p4);
      const checks: Check[] = [
        { id: "e-w2", group: "Neely: essential", hard: true, weight: 1, label: "Wave 2 never retraces all of wave 1", pass: p2.p > p0.p, detail: `Wave 2 retraced ${pct(r2)}.`, source: N("5-2, rule 3") },
        { id: "e-w3", group: "Neely: essential", hard: true, weight: 1, label: "Wave 3 is longer than wave 2", pass: w3 > w2, detail: `Wave 3 is ${pct(w3 / w2)} of wave 2.`, source: N("5-2, rule 4") },
        { id: "e-w4", group: "Neely: essential", hard: true, weight: 1, label: "Wave 4 never retraces all of wave 3", pass: p4.p > p2.p, detail: `Wave 4 retraced ${pct(r4)}.`, source: N("5-2, rule 5") },
        { id: "e-sb", group: "Neely: essential", hard: true, weight: 1, label: "Waves 1 to 4 are the same degree (Similarity & Balance)", pass: sb.length === 0, detail: sb.length ? `Waves ${sb.join(", ")} are less than a third of each other in both price and time.` : "Every neighbouring pair relates by at least a third in price or time.", source: N("4-3 to 4-4") },
        { id: "e-alt", group: "Neely: essential", hard: true, weight: 2, label: "Waves 2 and 4 alternate", pass: altPrice || altTime || altSev, detail: `Wave 2: ${pct(r2)} deep, ${t2} bars. Wave 4: ${pct(r4)} deep, ${t4} bars. ${[altPrice && "price", altTime && "time", altSev && "severity"].filter(Boolean).join(", ") || "No alternation"}${altPrice || altTime || altSev ? " differ." : ": likely a complex correction, not an impulse."}`, source: N("5-5 to 5-7, Rule of Alternation") },
        { id: "e-24", group: "Neely: essential", hard: true, weight: 2, label: "The 2-4 trendline has held since wave 4 ended", pass: brk24 < 0, detail: brk24 < 0 ? "No close below the 2-4 line before a new high." : "Price broke the 2-4 line before making a new high, so wave 4 is still forming.", source: N("5-10, Channeling") },
        { id: "e-ovl", group: "Neely: essential", weight: 2, label: "Wave 4 stays out of wave 2's price zone (trending impulse)", pass: trending, detail: trending ? "No overlap: a trending impulse." : "Wave 4 overlaps wave 2's zone. Only a terminal impulse is possible, and those get fully retraced afterwards.", source: N("5-8, Overlap Rule") },
        { id: "c-ext", group: "Neely: conditional", weight: 2, label: "Wave 1 or wave 3 is already extended (161.8% or more)", pass: ext1 || ext3, detail: ext3 ? `Wave 3 is extended (${(w3 / w1).toFixed(2)}× wave 1).` : ext1 ? `Wave 1 is extended (${(w1 / w3).toFixed(2)}× wave 3).` : "Neither is extended, so wave 5 must extend to at least 161.8% of the longer of waves 1 and 3: a demanding requirement.", source: N("5-4, Extension Rule") },
        ...contextChecks(ctx, p2.i, p3.i, p3.i, p4.i, p4.i),
      ];
      let t1v: number, t2v: number;
      if (ext3) { t1v = p4.p + 0.618 * w1; t2v = p4.p + w1; } // Rule of Equality: 5 ≈ 1 or 61.8% (p. 5-8, 5-12)
      else if (ext1) { t1v = p4.p + 0.382 * w3; t2v = p4.p + 0.618 * w3; } // 1st extension: 5 = 38.2% or 61.8% of 3 (p. 5-11)
      else { t1v = p4.p + 1.618 * Math.max(w1, w3); t2v = p4.p + 1.618 * (p3.p - p0.p); } // 5th extension (p. 5-12)
      if (w3 < w1) t2v = Math.min(t2v, p4.p + 0.99 * w3); // wave 3 may never be the shortest (p. 5-2, rule 7)
      t1v = Math.min(t1v, t2v);
      out.push(finish(ctx, {
        id: `w5-${ctx.degreeKey}`, name: "Wave 5 entry", degree: ctx.degreeName, pattern: trending ? "Trending impulse, waves 1-4 complete" : "Terminal impulse, waves 1-4 complete",
        labels: [lbl(p0, "0"), lbl(p1, "1"), lbl(p2, "2"), lbl(p3, "3"), lbl(p4, "4")],
        entry: lastClose, stop: p4.p - 0.25 * a, invalidation: trending ? p1.p : p2.p, target1: t1v, target2: t2v,
        expectBars: Math.max(3, ext3 ? t1 : Math.round((t1 + t3) / 2)),
        triggered: trig.at >= 0 && lastClose > p4.p,
        triggerNote: trig.at >= 0 ? `Closed above ${px(trig.level)} ${n - 1 - trig.at} bars ago.` : `Waiting for a close above ${px(trig.level)}.`,
        checks,
      }, lastClose, trig));
    }
  }

  // ---------- Setup 3: correction complete, rejoin the trend ----------
  if (L >= 6) {
    const [x0, s, pa, pb, pc] = pv.slice(L - 6, L - 1);
    if (x0.kind === "L" && s.kind === "H" && pa.kind === "L" && pb.kind === "H" && pc.kind === "L") {
      const imp = s.p - x0.p, aLen = s.p - pa.p, bLen = pb.p - pa.p, cLen = pb.p - pc.p;
      const ta = pa.i - s.i, tb = pb.i - pa.i, tc = pc.i - pb.i;
      const bRet = bLen / aLen, cRel = cLen / aLen, cOfB = cLen / bLen;
      const aOfImp = aLen / imp;
      // Neely p. 5-19..5-21 (zigzag) and 5-17..5-19 (flats)
      const zig = bRet < 0.618 && pc.p < pa.p;
      const flat = bRet >= 0.618 && cRel >= 0.382;
      let kind = "Unclassified";
      if (zig) kind = cRel < 0.618 ? "Truncated zigzag" : cRel > 1.618 ? "Elongated zigzag" : "Normal zigzag";
      else if (flat) {
        if (bRet > 1) kind = bRet > 1.382 || cLen < bLen ? (pc.p <= pa.p ? "Irregular failure flat" : "Running flat") : cRel > 1.618 ? "Elongated flat" : "Irregular flat";
        else if (bRet >= 0.81) kind = cOfB < 1 ? "C-failure flat" : cOfB > 1.382 ? "Elongated flat" : "Common flat";
        else kind = cOfB < 1 ? "Double-failure flat" : cOfB > 1.382 ? "Elongated flat" : "B-failure flat";
      }
      const usable = (zig && kind === "Normal zigzag") || (flat && kind !== "Elongated flat");
      const depth = (s.p - pc.p) / imp;
      const sb = simBalance([{ len: aLen, bars: ta, name: "a" }, { len: bLen, bars: tb, name: "b" }, { len: cLen, bars: tc, name: "c" }]);
      // Stage 1 confirmation (p. 6-3): break of the 0-B trendline in no more time than wave c took.
      let brk = -1;
      for (let k = pc.i + 1; k < n; k++) if (c[k].c > lineAt(s, pb, k)) { brk = k; break; }
      const stage1 = brk > 0 && brk - pc.i <= Math.max(1, tc);
      const sig = trigger(ctx, pb, pc);
      const trig = { level: lineAt(s, pb, n - 1), at: brk, fromSig: false, sigAfter: sig.at >= 0 };
      const checks: Check[] = [
        { id: "e-cls", group: "Neely: essential", hard: true, weight: 1, label: "The pullback is a standard zigzag or flat", pass: usable, detail: `${kind}: wave b retraced ${pct(bRet)} of a, and c is ${pct(cRel)} of a.${!usable ? (kind.startsWith("Truncated") ? " A truncated zigzag must then be retraced 81% or more, so it is not a with-trend entry." : kind.startsWith("Elongated") ? " An elongated c-wave may really be an impulse." : " Neither the zigzag nor the flat rules fit.") : ""}`, source: N("5-17 to 5-21") },
        { id: "e-zza", group: "Neely: essential", hard: zig, weight: 1, label: zig ? "Zigzag wave a retraced no more than 61.8% of the prior impulse" : "Correction did not retrace all of the prior impulse", pass: zig ? aOfImp <= 0.618 : pc.p > x0.p, detail: zig ? `Wave a retraced ${pct(aOfImp)} of the advance.` : `The correction retraced ${pct(depth)} of the advance.`, source: N(zig ? "5-19, zigzag rule 1" : "5-2") },
        { id: "e-100", group: "Neely: essential", hard: true, weight: 1, label: "The prior advance was not fully retraced", pass: pc.p > x0.p, detail: `The correction retraced ${pct(depth)} of the advance.`, source: N("6-2, Stage 2") },
        { id: "e-sb", group: "Neely: essential", hard: true, weight: 1, label: "Waves a, b and c are the same degree (Similarity & Balance)", pass: sb.length === 0, detail: sb.length ? `Waves ${sb.join(", ")} fail the one-third test in both price and time.` : "Each neighbouring wave relates by at least a third in price or time.", source: N("4-3 to 4-4") },
        { id: "k-s1", group: "Neely: confirmation", weight: 3, label: "Stage 1: the 0-B trendline broke in no more time than wave c took", pass: stage1, detail: brk > 0 ? `The 0-B line broke ${brk - pc.i} bars after the low; wave c took ${tc} bars.` : "The 0-B trendline has not been broken yet.", source: N("6-3, Flats and Zigzags") },
        { id: "c-talt", group: "Neely: conditional", weight: 1, label: "Waves a and b alternate in time", pass: tb >= 1.618 * ta || tb <= 0.618 * ta, detail: `Wave a took ${ta} bars, wave b ${tb}.`, source: N("5-34, Time alternation") },
        { id: "c-depth", group: "Neely: conditional", weight: 1, label: "Correction depth is 38.2% to 78.6% of the advance", pass: depth >= 0.382 && depth <= 0.786, detail: `Depth ${pct(depth)}.`, source: N("5-19; ch. 12") },
        { id: "w-sigbar", group: "Wyckoff", weight: 2, label: "A significant bar confirmed the turn", pass: sig.at >= 0, detail: sig.at >= 0 ? `A reversal bar closed above ${px(sig.level)}.` : `No reversal bar above ${px(sig.level)} yet.`, source: `${WY}, ch. 27` },
        ...contextChecks(ctx, x0.i, s.i, s.i, pc.i, pc.i),
      ];
      out.push(finish(ctx, {
        id: `abc-${ctx.degreeKey}`, name: "Correction complete, rejoin the trend", degree: ctx.degreeName, pattern: `${kind} (a-b-c) after an advance`,
        labels: [lbl(s, "(start)"), lbl(pa, "a"), lbl(pb, "b"), lbl(pc, "c")],
        entry: lastClose, stop: pc.p - 0.25 * a, invalidation: zig ? pc.p : x0.p, target1: s.p, target2: pc.p + imp,
        expectBars: Math.max(3, s.i - x0.i),
        triggered: stage1 && lastClose > pc.p,
        triggerNote: stage1 ? `The 0-B trendline broke ${n - 1 - brk} bars ago (Neely's Stage 1 confirmation).` : `Waiting for a close above the 0-B trendline, now near ${px(trig.level)}.`,
        checks,
      }, lastClose, trig));
    }
  }

  // ---------- Setup 4: falling impulse complete, Stage-1 confirmed reversal ----------
  if (L >= 7) {
    const [p0, p1, p2, p3, p4, p5] = pv.slice(L - 7, L - 1);
    if (p0.kind === "H" && p1.kind === "L" && p2.kind === "H" && p3.kind === "L" && p4.kind === "H" && p5.kind === "L") {
      const w1 = p0.p - p1.p, w2 = p2.p - p1.p, w3 = p2.p - p3.p, w4 = p4.p - p3.p, w5 = p4.p - p5.p;
      const t1 = p1.i - p0.i, t2 = p2.i - p1.i, t3 = p3.i - p2.i, t4 = p4.i - p3.i, t5 = p5.i - p4.i;
      const lens = [w1, w3, w5].sort((x, y) => y - x);
      const longest = w1 === lens[0] ? 1 : w3 === lens[0] ? 3 : 5;
      const ext = lens[0] >= 1.618 * lens[1] || (longest === 1 && w1 >= 1.382 * lens[1]); // exception 1, p. 5-4
      const failure5 = w5 < w4;
      const sb = simBalance([{ len: w1, bars: t1, name: "1" }, { len: w2, bars: t2, name: "2" }, { len: w3, bars: t3, name: "3" }, { len: w4, bars: t4, name: "4" }, { len: w5, bars: t5, name: "5" }]);
      const alt = Math.max(w2, w4) / Math.min(w2, w4) >= 1.382 || Math.max(t2, t4) / Math.max(1, Math.min(t2, t4)) >= 1.382 || Math.abs(w2 / w1 - w4 / w3) >= 0.1;
      let brk = -1;
      for (let k = p5.i + 1; k < n; k++) if (c[k].c > lineAt(p2, p4, k)) { brk = k; break; }
      const stage1 = brk > 0 && brk - p5.i <= t5;
      const trig = { level: lineAt(p2, p4, n - 1), at: brk, fromSig: false, sigAfter: false };
      // Stage 2 targets by extension (p. 6-2): 3rd → wave-4 zone; 1st → end of 4 then wave-2 zone; 5th → 61.8% of wave 5; 5th failure → whole impulse.
      let T1 = p4.p, T2 = p5.p + 0.618 * (p0.p - p5.p);
      if (failure5) { T1 = p4.p; T2 = p0.p; }
      else if (longest === 1) { T1 = p4.p; T2 = p1.p + 0.5 * (p2.p - p1.p); }
      else if (longest === 5) { T1 = p5.p + 0.618 * w5; T2 = p4.p + 0.5 * w4; }
      const checks: Check[] = [
        { id: "e-w2", group: "Neely: essential", hard: true, weight: 1, label: "Wave 2 never retraces all of wave 1", pass: p2.p < p0.p, detail: `Wave 2 retraced ${pct(w2 / w1)}.`, source: N("5-2, rule 3") },
        { id: "e-w3", group: "Neely: essential", hard: true, weight: 1, label: "Wave 3 is longer than wave 2", pass: w3 > w2, detail: `Wave 3 is ${pct(w3 / w2)} of wave 2.`, source: N("5-2, rule 4") },
        { id: "e-w4", group: "Neely: essential", hard: true, weight: 1, label: "Wave 4 never retraces all of wave 3", pass: p4.p < p2.p, detail: `Wave 4 retraced ${pct(w4 / w3)}.`, source: N("5-2, rule 5") },
        { id: "e-5", group: "Neely: essential", hard: true, weight: 1, label: "Wave 5 is at least 38.2% of wave 4", pass: w5 >= 0.382 * w4, detail: `Wave 5 is ${pct(w5 / w4)} of wave 4${failure5 ? " (a 5th-wave failure)" : ""}.`, source: N("5-2, rule 6") },
        { id: "e-short", group: "Neely: essential", hard: true, weight: 1, label: "Wave 3 is not the shortest of waves 1, 3 and 5", pass: !(w3 < w1 && w3 < w5), detail: `Lengths 1/3/5: ${px(w1)} / ${px(w3)} / ${px(w5)}.`, source: N("5-2, rule 7") },
        { id: "e-ext", group: "Neely: essential", hard: true, weight: 2, label: "One impulse wave is extended (the litmus test)", pass: ext, detail: `The longest is wave ${longest}, ${(lens[0] / lens[1]).toFixed(2)}× the next longest (needs 1.618).`, source: N("5-4, Extension Rule") },
        { id: "e-sb", group: "Neely: essential", hard: true, weight: 1, label: "All five waves are the same degree", pass: sb.length === 0, detail: sb.length ? `Waves ${sb.join(", ")} fail the one-third test.` : "Every neighbouring pair passes the one-third test.", source: N("4-3 to 4-4") },
        { id: "e-alt", group: "Neely: essential", hard: true, weight: 1, label: "Waves 2 and 4 alternate", pass: alt, detail: `Wave 2: ${pct(w2 / w1)} deep, ${t2} bars. Wave 4: ${pct(w4 / w3)} deep, ${t4} bars.`, source: N("5-5") },
        { id: "e-ovl", group: "Neely: essential", weight: 1, label: "No overlap between waves 4 and 2", pass: p4.p < p1.p, detail: p4.p < p1.p ? "Trending impulse." : "Overlap: a terminal impulse (usually fully retraced afterwards).", source: N("5-8, Overlap Rule") },
        { id: "k-s1", group: "Neely: confirmation", hard: true, weight: 3, label: "Stage 1: 2-4 trendline broken in no more time than wave 5 took", pass: stage1, detail: brk > 0 ? `The 2-4 line was broken ${brk - p5.i} bars after the low; wave 5 took ${t5} bars.` : "The 2-4 trendline has not been broken yet.", source: N("6-1, Stage 1") },
        ...contextChecks(ctx, p5.i, n - 1, p4.i, p5.i, p5.i),
      ];
      out.push(finish(ctx, {
        id: `rev-${ctx.degreeKey}`, name: "Impulse complete, reversal", degree: ctx.degreeName, pattern: `5-wave decline finished (wave ${longest} extended${failure5 ? ", 5th-wave failure" : ""})`,
        labels: [lbl(p0, "0"), lbl(p1, "1"), lbl(p2, "2"), lbl(p3, "3"), lbl(p4, "4"), lbl(p5, "5")],
        entry: lastClose, stop: p5.p - 0.25 * a, invalidation: p5.p, target1: T1, target2: Math.max(T1, T2),
        expectBars: Math.max(3, t5 * 2),
        triggered: stage1 && lastClose > p5.p,
        triggerNote: stage1 ? `2-4 trendline broken ${n - 1 - brk} bars ago.` : "Waiting for a break of the 2-4 trendline.",
        checks,
      }, lastClose, trig));
    }
  }
  return out;
}

function htfTrend(c: Candle[]): { dir: Dir | null; note: string } {
  if (c.length < 30) return { dir: null, note: "Not enough higher-timeframe history." };
  const e = ema(c.map((k) => k.c), Math.min(50, Math.floor(c.length / 2)));
  const n = c.length - 1;
  const slopeUp = e[n] > e[n - 5];
  const above = c[n].c > e[n];
  const atrH = computeIndicators(c).atr;
  const pv = monowaves(c, atrH, 2.5).filter((p) => !p.provisional);
  const hs = pv.filter((p) => p.kind === "H").slice(-2), ls = pv.filter((p) => p.kind === "L").slice(-2);
  const hhhl = hs.length === 2 && ls.length === 2 && hs[1].p > hs[0].p && ls[1].p > ls[0].p;
  const lhll = hs.length === 2 && ls.length === 2 && hs[1].p < hs[0].p && ls[1].p < ls[0].p;
  if (slopeUp && above && !lhll) return { dir: "long", note: `Rising average with price above it${hhhl ? ", higher highs and higher lows" : ""}.` };
  if (!slopeUp && !above && !hhhl) return { dir: "short", note: `Falling average with price below it${lhll ? ", lower highs and lower lows" : ""}.` };
  return { dir: null, note: "Mixed: the higher timeframe is ranging." };
}

const HTF_FACTOR: Record<Tf, number> = { "5m": 12, "15m": 4, "30m": 8, "1h": 4, "2h": 12, "4h": 6, "1d": 7, "1w": 4, "1M": 12 };

// ---------- Viko's tested edge ----------
// The lab replayed the engine on up to 15 years of real prices (78 markets, 15m/1h/4h/1d, after fees and slippage,
// managed exactly like live trades). Overall the setups lost money and the old score didn't predict results. One kind
// of setup made money consistently: on the most recent 30% of data it was never tuned on, and on 48 markets added later.
export const EDGE = {
  rule: "daily chart, buy only, wave-3 entry, price above its 200-day average, stop at least 1.5× the average daily range away, in stocks, stock funds, indices or commodities (not crypto or forex)",
  trades: 997, winRate: 0.435, avgR: 0.257, recentAvgR: 0.33, marketsPositive: "37 of 47",
  run: "Nov 2026",
};
/** Why a setup is or isn't inside the tested edge. Needs the market's symbol to rule out forex. */
export function testedEdge(s: Pick<Setup, "dir" | "name" | "stop">, tf: Tf, close: number, ema200: number, atr: number, symbol?: string): { ok: boolean; why: string } {
  if (symbol?.endsWith("=X")) return { ok: false, why: "Forex setups lost money in testing (spreads plus choppy swings eat the moves)." };
  if (symbol?.startsWith("crypto:")) return { ok: false, why: "Crypto setups didn't hold up in testing: small coins lost money, and even the big coins lost on the most recent years. Viko's edge is in stocks, funds, indices and commodities." };
  if (tf !== "1d") return { ok: false, why: `Only daily-chart setups have a tested edge. On ${tf} charts, setups like this lost money after costs.` };
  if (s.dir !== "long") return { ok: false, why: "Sell setups lost money in testing on every timeframe, so Viko only approves buys." };
  if (s.name !== "Wave 3 entry") return { ok: false, why: `Only wave-3 entries have a tested edge; "${s.name}" setups didn't make money in testing.` };
  if (!(close > ema200)) return { ok: false, why: "Price is below its 200-day average (a downtrend). Buys there lost money in testing." };
  if (!(atr > 0) || Math.abs(close - s.stop) < 1.5 * atr) return { ok: false, why: "The stop-loss is closer than 1.5× the average daily range, so normal swings would likely hit it. Tight stops lost money in testing." };
  return { ok: true, why: `Inside Viko's tested edge: over ${EDGE.trades} past trades like this, ${Math.round(EDGE.winRate * 100)}% won and the average was +${EDGE.avgR.toFixed(2)}R after costs.` };
}

export function analyze(c: Candle[], tf: Tf, htfCandles?: Candle[], symbol?: string): Analysis {
  const ind = computeIndicators(c);
  const mc = mirror(c);
  const indM = computeIndicators(mc);
  const wy = readWyckoff(c, ind.atr);
  const htf = htfTrend(htfCandles && htfCandles.length >= 30 ? htfCandles : aggregate(c, HTF_FACTOR[tf]));
  const useVol = wy.volumeUsable;
  const setups: Setup[] = [];
  const pivotsByDegree: Record<string, Pivot[]> = {};
  for (const d of DEGREES) {
    const pvUp = monowaves(c, ind.atr, d.mult);
    pivotsByDegree[d.key] = pvUp;
    const base = { atr: ind.atr, useVol, wy, htf: htf.dir, degreeName: d.name, degreeKey: d.key };
    for (const s of setupsForDegree({ ...base, c, ind, dir: "long", wyBias: wy.bias }, pvUp)) setups.push(s);
    const pvDn = monowaves(mc, ind.atr, d.mult);
    for (const s of setupsForDegree({ ...base, c: mc, ind: indM, dir: "short", wyBias: wy.bias === null ? null : wy.bias === "long" ? "short" : "long", htf: htf.dir === null ? null : htf.dir === "long" ? "short" : "long" }, pvDn)) {
      // un-mirror prices for shorts
      setups.push({ ...s, dir: "short", id: s.id + "-s", entry: -s.entry, stop: -s.stop, invalidation: -s.invalidation, target1: -s.target1, target2: -s.target2, labels: s.labels.map((l) => ({ ...l, p: -l.p })) });
    }
  }
  // Approval now requires the tested edge. The rule score still shows how many book rules agree, but on its own it
  // didn't predict results, so a setup outside the edge can be at most "WATCH".
  const n0 = c.length - 1, ema200 = ind.ema200[n0], atrNow = ind.atr[n0];
  for (const s of setups) {
    s.edge = testedEdge(s, tf, c[n0].c, ema200, atrNow, symbol);
    const tradeable = s.triggered && !s.hardFail && s.verdict !== "NO TRADE" && s.rr1 >= 1.5;
    if (tradeable && s.edge.ok) { s.verdict = "APPROVED"; s.reasons = [s.edge.why]; }
    else if (s.verdict === "APPROVED") { s.verdict = "WATCH"; s.reasons = [s.edge.why, ...s.reasons]; }
    else if (!s.edge.ok) s.reasons = [...s.reasons, s.edge.why];
  }
  for (const s of setups) s.plain = plainEnglish(s);
  const rank = (s: Setup) => (s.verdict === "APPROVED" ? 1000 : s.verdict === "WATCH" ? 500 : 0) + s.score - (s.hardFail ? 400 : 0);
  setups.sort((a, b) => rank(b) - rank(a));
  const n = c.length - 1;
  const r = ind.rsi[n], h = ind.hist[n];
  const supplementary: Analysis["supplementary"] = [
    { label: "RSI 14", value: r.toFixed(1), tone: r > 55 ? "bull" : r < 45 ? "bear" : "flat" },
    { label: "MACD histogram", value: h.toPrecision(3), tone: h > 0 ? "bull" : "bear" },
    { label: "Price vs EMA 200", value: Number.isNaN(ind.ema200[n]) ? "n/a" : pct(c[n].c / ind.ema200[n] - 1), tone: c[n].c > ind.ema200[n] ? "bull" : "bear" },
    { label: "EMA 20 / 50", value: ind.ema20[n] > ind.ema50[n] ? "20 above 50" : "20 below 50", tone: ind.ema20[n] > ind.ema50[n] ? "bull" : "bear" },
    { label: "ATR 14", value: pct(ind.atr[n] / c[n].c), tone: "flat" },
    { label: "Bollinger position", value: pct((c[n].c - ind.bbL[n]) / (ind.bbU[n] - ind.bbL[n] || 1)), tone: "flat" },
  ];
  return { last: c[n], setups, best: setups[0] ?? null, wyckoff: wy, htfTrend: htf.dir, htfNote: htf.note, ind, pivotsByDegree, supplementary };
}

export function plainEnglish(s: Setup): string {
  const f = (x: number) => fmt(x);
  const act = s.dir === "long" ? "Buy" : "Sell short";
  if (s.verdict === "APPROVED") return `${act} near ${f(s.entry)}. Place the stop at ${f(s.stop)}. Take part of the position at ${f(s.target1)} and the rest at ${f(s.target2)}. The count is wrong if price reaches ${f(s.invalidation)}.`;
  if (s.verdict === "WATCH" && s.triggered && s.edge && !s.edge.ok && !s.hardFail) return `Don't trade this one. ${s.edge.why} Viko only approves its tested edge: ${EDGE.rule}.`;
  if (s.verdict === "WATCH") return s.triggered ? `Don't enter yet. The pattern is forming but only ${s.score}% of the book rules agree. Re-check after the next candle closes.` : `Don't enter yet. Set an alert at ${f(s.entry)}: the trigger fires on a candle close beyond it. Then re-check this verdict.`;
  return "Don't trade this. Stand aside until a cleaner structure forms.";
}

export function fmt(x: number): string {
  if (!Number.isFinite(x)) return "–";
  const a = Math.abs(x);
  const d = a >= 1000 ? 2 : a >= 10 ? 2 : a >= 1 ? 4 : 6;
  return x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
