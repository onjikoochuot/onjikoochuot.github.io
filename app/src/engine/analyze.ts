import type { Analysis, Candle, Check, Dir, Pivot, Setup, Tf, WaveLabel, WyckoffRead } from "./types";
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
};

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

function finish(ctx: Ctx, baseIn: Omit<Setup, "score" | "hardFail" | "rr1" | "rr2" | "verdict" | "reasons" | "plain" | "dir">, lastClose: number, trig: ReturnType<typeof trigger>): Setup {
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
  ];
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
  const verdict: Setup["verdict"] = !hardFail && score >= APPROVE_SCORE && base.triggered && rr1 >= MIN_RR && !stale ? "APPROVED" : !hardFail && score >= 55 && !stale ? "WATCH" : "NO TRADE";
  return { ...base, dir: ctx.dir, entry, checks, score, hardFail, rr1, rr2, verdict, reasons, plain: "" };
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

  // Current leg must be up from a confirmed low for every long setup below.
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
      const trig = trigger(ctx, p1, p2);
      const checks: Check[] = [
        { id: "e-w2", group: "Neely: essential", hard: true, weight: 1, label: "Wave 2 retraces less than 100% of wave 1", pass: p2.p > p0.p, detail: `Wave 2 retraced ${pct(ret)} of wave 1.`, source: `${NEELY}, ch. 5 Essential Construction Rules` },
        { id: "c-sim", group: "Neely: conditional", weight: 2, label: "Waves 1 and 2 are of the same degree (Similarity & Balance)", pass: w2 >= w1 / 3 || t2 >= t1 / 3, detail: `Wave 2 is ${pct(w2 / w1)} of wave 1 in price and ${pct(t2 / Math.max(1, t1))} in time; at least one must be one-third or more.`, source: `${NEELY}, ch. 3 Rule of Similarity & Balance` },
        { id: "c-ret", group: "Neely: conditional", weight: 2, label: "Wave 2 depth is typical (38.2% to 78.6%)", pass: ret >= 0.382 && ret <= 0.786, detail: `Retracement ${pct(ret)}. Shallower suggests wave 2 is unfinished; deeper weakens the count.`, source: `${NEELY}, ch. 5 retracement guidelines` },
        { id: "c-time", group: "Neely: conditional", weight: 1, label: "Wave 2 took real time to form", pass: t2 >= 0.382 * t1, detail: `Wave 2 lasted ${t2} bars against ${t1} for wave 1.`, source: `${NEELY}, ch. 3 time similarity` },
        { id: "w-choch", group: "Wyckoff", weight: 2, label: "Wave 1 changed character (broke the last lower high)", pass: p1.p > lastLowerHigh, detail: Number.isFinite(lastLowerHigh) ? `Wave 1 peaked at ${px(p1.p)} vs prior swing high ${px(lastLowerHigh)}.` : "No earlier swing high to compare.", source: `${WY}, ch. 16 and 19 (Change of Character)` },
        ...contextChecks(ctx, p0.i, p1.i, p1.i, p2.i, p2.i),
      ];
      const stop = p2.p - 0.25 * a;
      out.push(finish(ctx, {
        id: `w3-${ctx.degreeKey}`, name: "Wave 3 entry", degree: ctx.degreeName, pattern: "Impulse, waves 1-2 complete",
        labels: [lbl(p0, "0"), lbl(p1, "1"), lbl(p2, "2")],
        entry: lastClose, stop, invalidation: p0.p, target1: p2.p + w1, target2: p2.p + 1.618 * w1,
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
      const t2 = p2.i - p1.i, t4 = p4.i - p3.i, t3 = p3.i - p2.i;
      const r2 = w2 / w1, r4 = w4 / w3;
      const ext = Math.max(w1, w3) >= 1.618 * Math.min(w1, w3);
      const trending = p4.p > p1.p;
      const trig = trigger(ctx, p3, p4);
      const checks: Check[] = [
        { id: "e-w2", group: "Neely: essential", hard: true, weight: 1, label: "Wave 2 retraces less than 100% of wave 1", pass: p2.p > p0.p, detail: `Wave 2 retraced ${pct(r2)}.`, source: `${NEELY}, ch. 5 Essential Construction Rules` },
        { id: "e-w3", group: "Neely: essential", hard: true, weight: 1, label: "Wave 3 is longer than wave 2", pass: w3 > w2, detail: `Wave 3 is ${pct(w3 / w2)} of wave 2.`, source: `${NEELY}, ch. 5 Essential Construction Rules` },
        { id: "e-w4", group: "Neely: essential", hard: true, weight: 1, label: "Wave 4 retraces less than 100% of wave 3", pass: p4.p > p2.p, detail: `Wave 4 retraced ${pct(r4)}.`, source: `${NEELY}, ch. 5 Essential Construction Rules` },
        { id: "e-ovl", group: "Neely: essential", weight: 2, label: "Wave 4 stays out of wave 2's territory (trending impulse)", pass: trending, detail: trending ? "No overlap: a trending impulse." : "Wave 4 overlaps wave 2's range: only a terminal impulse is possible, which reverses hard after wave 5.", source: `${NEELY}, ch. 5 Overlap rule` },
        { id: "e-ext", group: "Neely: essential", weight: 2, label: "One wave is extended (161.8% or more of the next longest)", pass: ext, detail: ext ? `${w3 >= w1 ? "Wave 3" : "Wave 1"} is extended (${(Math.max(w1, w3) / Math.min(w1, w3)).toFixed(2)}×).` : "Neither wave 1 nor 3 is extended, so wave 5 itself must extend: a demanding requirement.", source: `${NEELY}, ch. 5 Rule of Extension` },
        { id: "c-alt", group: "Neely: conditional", weight: 2, label: "Waves 2 and 4 alternate", pass: Math.abs(r2 - r4) >= 0.2 || t2 / t4 >= 1.5 || t4 / t2 >= 1.5, detail: `Wave 2 retraced ${pct(r2)} in ${t2} bars; wave 4 retraced ${pct(r4)} in ${t4} bars.`, source: `${NEELY}, ch. 5 Rule of Alternation` },
        { id: "c-sim4", group: "Neely: conditional", weight: 1, label: "Wave 4 is of the same degree as wave 3", pass: w4 >= w3 / 3 || t4 >= t3 / 3, detail: `Wave 4 is ${pct(w4 / w3)} of wave 3 in price, ${pct(t4 / Math.max(1, t3))} in time.`, source: `${NEELY}, ch. 3 Rule of Similarity & Balance` },
        ...contextChecks(ctx, p2.i, p3.i, p3.i, p4.i, p4.i),
      ];
      let t1v: number, t2v: number;
      if (w3 >= 1.618 * w1) { t1v = p4.p + 0.618 * w1; t2v = p4.p + w1; }
      else if (w1 >= 1.618 * w3) { t1v = p4.p + 0.618 * w3; t2v = p4.p + 0.99 * w3; }
      else { t1v = p4.p + Math.max(w1, w3); t2v = p4.p + 1.618 * Math.max(w1, w3); }
      if (w3 < w1) t2v = Math.min(t2v, p4.p + 0.99 * w3); // wave 3 may never be the shortest
      t1v = Math.min(t1v, t2v);
      out.push(finish(ctx, {
        id: `w5-${ctx.degreeKey}`, name: "Wave 5 entry", degree: ctx.degreeName, pattern: trending ? "Trending impulse, waves 1-4 complete" : "Terminal impulse, waves 1-4 complete",
        labels: [lbl(p0, "0"), lbl(p1, "1"), lbl(p2, "2"), lbl(p3, "3"), lbl(p4, "4")],
        entry: lastClose, stop: p4.p - 0.25 * a, invalidation: trending ? p1.p : p2.p, target1: t1v, target2: t2v,
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
      const bRet = bLen / aLen;
      const zig = bRet <= 0.618 && pc.p < pa.p;
      const flat = bRet >= 0.618 && cLen >= 0.382 * aLen;
      const kind = zig ? "Zigzag" : flat ? (bRet > 1 ? "Expanded/irregular flat" : "Flat") : "Unclassified";
      const depth = (s.p - pc.p) / imp;
      const cRel = cLen / aLen;
      const tImp = s.i - x0.i, tCor = pc.i - s.i;
      const trig = trigger(ctx, pb, pc);
      const checks: Check[] = [
        { id: "e-cls", group: "Neely: essential", hard: true, weight: 1, label: "The pullback fits a zigzag or a flat", pass: zig || flat, detail: `Wave b retraced ${pct(bRet)} of a; c is ${pct(cRel)} of a. ${zig ? "b at or under 61.8% and c beyond a: zigzag." : flat ? "b at 61.8% or more and c at least 38.2% of a: flat." : "Neither the zigzag nor the flat rules are met."}`, source: `${NEELY}, ch. 5 corrective rules` },
        { id: "e-100", group: "Neely: essential", hard: true, weight: 1, label: "Correction did not retrace 100% of the prior impulse", pass: pc.p > x0.p, detail: `The correction retraced ${pct(depth)} of the advance.`, source: `${NEELY}, ch. 5 (a 100% retracement ends the trend)` },
        { id: "c-c", group: "Neely: conditional", weight: 2, label: zig ? "Wave c is 61.8% to 161.8% of a (zigzag)" : "Wave c is 38.2% to 161.8% of a (flat)", pass: zig ? cRel >= 0.618 && cRel <= 1.618 : cRel >= 0.382 && cRel <= 1.618, detail: `c/a = ${cRel.toFixed(2)}.`, source: `${NEELY}, ch. 5 c-wave relationships` },
        { id: "c-depth", group: "Neely: conditional", weight: 2, label: "Correction depth is 38.2% to 78.6% of the impulse", pass: depth >= 0.382 && depth <= 0.786, detail: `Depth ${pct(depth)}.`, source: `${NEELY}, ch. 5 retracement guidelines` },
        { id: "c-time", group: "Neely: conditional", weight: 1, label: "The correction consumed time", pass: tCor >= 0.382 * tImp, detail: `Correction ${tCor} bars vs impulse ${tImp} bars.`, source: `${NEELY}, ch. 3 time similarity` },
        ...contextChecks(ctx, x0.i, s.i, s.i, pc.i, pc.i),
      ];
      out.push(finish(ctx, {
        id: `abc-${ctx.degreeKey}`, name: "Correction complete, rejoin the trend", degree: ctx.degreeName, pattern: `${kind} (a-b-c) after an impulse`,
        labels: [lbl(s, "(start)"), lbl(pa, "a"), lbl(pb, "b"), lbl(pc, "c")],
        entry: lastClose, stop: pc.p - 0.25 * a, invalidation: x0.p, target1: s.p, target2: pc.p + imp,
        triggered: trig.at >= 0 && lastClose > pc.p,
        triggerNote: trig.at >= 0 ? `Closed above ${px(trig.level)} ${n - 1 - trig.at} bars ago.` : `Waiting for a close above ${px(trig.level)}.`,
        checks,
      }, lastClose, trig));
    }
  }

  // ---------- Setup 4: falling impulse complete, Stage-1 confirmed reversal ----------
  if (L >= 7) {
    const [p0, p1, p2, p3, p4, p5] = pv.slice(L - 7, L - 1);
    if (p0.kind === "H" && p1.kind === "L" && p2.kind === "H" && p3.kind === "L" && p4.kind === "H" && p5.kind === "L") {
      const w1 = p0.p - p1.p, w2 = p2.p - p1.p, w3 = p2.p - p3.p, w4 = p4.p - p3.p, w5 = p4.p - p5.p;
      const lens = [w1, w3, w5].sort((x, y) => y - x);
      const ext = lens[0] >= 1.618 * lens[1];
      const t5 = p5.i - p4.i;
      let brk = -1;
      for (let k = p5.i + 1; k < n; k++) if (c[k].c > lineAt(p2, p4, k)) { brk = k; break; }
      const stage1 = brk > 0 && brk - p5.i <= t5;
      const trig = { level: lineAt(p2, p4, n - 1), at: brk, fromSig: false, sigAfter: false };
      const checks: Check[] = [
        { id: "e-w2", group: "Neely: essential", hard: true, weight: 1, label: "Wave 2 retraces less than 100% of wave 1", pass: p2.p < p0.p, detail: `Wave 2 retraced ${pct(w2 / w1)}.`, source: `${NEELY}, ch. 5` },
        { id: "e-w4", group: "Neely: essential", hard: true, weight: 1, label: "Wave 4 retraces less than 100% of wave 3", pass: p4.p < p2.p, detail: `Wave 4 retraced ${pct(w4 / w3)}.`, source: `${NEELY}, ch. 5` },
        { id: "e-short", group: "Neely: essential", hard: true, weight: 1, label: "Wave 3 is not the shortest of waves 1, 3 and 5", pass: !(w3 < w1 && w3 < w5), detail: `Lengths 1/3/5: ${w1.toPrecision(4)} / ${w3.toPrecision(4)} / ${w5.toPrecision(4)}.`, source: `${NEELY}, ch. 5` },
        { id: "e-5", group: "Neely: essential", hard: true, weight: 1, label: "Wave 5 is at least 38.2% of wave 4", pass: w5 >= 0.382 * w4, detail: `Wave 5 is ${pct(w5 / w4)} of wave 4.`, source: `${NEELY}, ch. 5` },
        { id: "e-ext", group: "Neely: essential", weight: 2, label: "One impulse wave is extended", pass: ext, detail: `Longest is ${(lens[0] / lens[1]).toFixed(2)}× the next longest (needs 1.618).`, source: `${NEELY}, ch. 5 Rule of Extension` },
        { id: "e-ovl", group: "Neely: essential", weight: 1, label: "No overlap between waves 4 and 2", pass: p4.p < p1.p, detail: p4.p < p1.p ? "Trending impulse." : "Overlap: terminal impulse (often fully retraced afterwards).", source: `${NEELY}, ch. 5 Overlap rule` },
        { id: "k-s1", group: "Neely: confirmation", hard: true, weight: 3, label: "Stage 1: 2-4 trendline broken in no more time than wave 5 took", pass: stage1, detail: brk > 0 ? `The 2-4 line was broken ${brk - p5.i} bars after the low; wave 5 took ${t5} bars.` : "The 2-4 trendline has not been broken yet.", source: `${NEELY}, ch. 6 post-constructive rules` },
        ...contextChecks(ctx, p5.i, n - 1, p4.i, p5.i, p5.i),
      ];
      out.push(finish(ctx, {
        id: `rev-${ctx.degreeKey}`, name: "Impulse complete, reversal", degree: ctx.degreeName, pattern: "5-wave impulse finished, counter-trend move",
        labels: [lbl(p0, "0"), lbl(p1, "1"), lbl(p2, "2"), lbl(p3, "3"), lbl(p4, "4"), lbl(p5, "5")],
        entry: lastClose, stop: p5.p - 0.25 * a, invalidation: p5.p, target1: p4.p, target2: p5.p + 0.618 * (p0.p - p5.p),
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

const HTF_FACTOR: Record<Tf, number> = { "1h": 4, "4h": 6, "1d": 7, "1w": 4 };

export function analyze(c: Candle[], tf: Tf, htfCandles?: Candle[]): Analysis {
  const ind = computeIndicators(c);
  const wy = readWyckoff(c, ind.atr);
  const htf = htfTrend(htfCandles && htfCandles.length >= 30 ? htfCandles : aggregate(c, HTF_FACTOR[tf]));
  const useVol = wy.volumeUsable;
  const mc = mirror(c);
  const setups: Setup[] = [];
  const pivotsByDegree: Record<string, Pivot[]> = {};
  for (const d of DEGREES) {
    const pvUp = monowaves(c, ind.atr, d.mult);
    pivotsByDegree[d.key] = pvUp;
    const base = { atr: ind.atr, useVol, wy, htf: htf.dir, degreeName: d.name, degreeKey: d.key };
    for (const s of setupsForDegree({ ...base, c, dir: "long", wyBias: wy.bias }, pvUp)) setups.push(s);
    const pvDn = monowaves(mc, ind.atr, d.mult);
    for (const s of setupsForDegree({ ...base, c: mc, dir: "short", wyBias: wy.bias === null ? null : wy.bias === "long" ? "short" : "long", htf: htf.dir === null ? null : htf.dir === "long" ? "short" : "long" }, pvDn)) {
      // un-mirror prices for shorts
      setups.push({ ...s, dir: "short", id: s.id + "-s", entry: -s.entry, stop: -s.stop, invalidation: -s.invalidation, target1: -s.target1, target2: -s.target2, labels: s.labels.map((l) => ({ ...l, p: -l.p })) });
    }
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
  if (s.verdict === "WATCH") return s.triggered ? `Don't enter yet. The pattern is forming but only ${s.score}% of the book rules agree. Re-check after the next candle closes.` : `Don't enter yet. Set an alert at ${f(s.entry)}: the trigger fires on a candle close beyond it. Then re-check this verdict.`;
  return "Don't trade this. Stand aside until a cleaner structure forms.";
}

export function fmt(x: number): string {
  if (!Number.isFinite(x)) return "–";
  const a = Math.abs(x);
  const d = a >= 1000 ? 2 : a >= 10 ? 2 : a >= 1 ? 4 : 6;
  return x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
