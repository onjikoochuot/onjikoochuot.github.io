// Trailing stop-loss shared by every broker manager, the paper account and the tests.
// The stop only ever moves in the trade's favour (a ratchet). Prices are real prices; shorts are handled by mirroring.

export type TrailIn = {
  dir: "long" | "short";
  entry: number;
  initialStop: number;
  stop: number; // where the stop is now
  target1: number;
  target2: number;
  peak: number; // best price reached since the trade opened (highest for longs, lowest for shorts)
  price: number; // price now
  t1Hit: boolean;
};
export type TrailOut = { stop: number; why: string; locksProfit: boolean };

/**
 * Stages, measured as progress toward target 1 (R1 = distance entry → target 1):
 *  - halfway to target 1        → stop halfway between the original stop and the entry (risk cut in half)
 *  - 80% of the way to target 1 → stop at the entry (can no longer lose)
 *  - target 1 reached           → stop locks in half of the best gain so far, and keeps rising with it
 *  - 60% of the way to target 2 → stop at least at target 1
 * The stop always stays at least a quarter of R1 behind the current price, and moves only by meaningful steps.
 */
export function trailStop(x: TrailIn): TrailOut | null {
  const s = x.dir === "long" ? 1 : -1;
  const e = x.entry * s, s0 = x.initialStop * s, cur = x.stop * s, t1 = x.target1 * s, t2 = x.target2 * s;
  const px = x.price * s, pk = Math.max(x.peak * s, px);
  const r1 = t1 - e;
  if (!(r1 > 0) || ![e, s0, cur, t1, t2, px, pk].every(Number.isFinite)) return null;
  const g = pk - e;
  let cand = s0, why = "";
  if (g >= 0.5 * r1 && e - 0.5 * (e - s0) > cand) { cand = e - 0.5 * (e - s0); why = "halfway to target 1, so the risk is cut in half"; }
  if (g >= 0.8 * r1 && e > cand) { cand = e; why = "close to target 1, so the stop is now at the entry price and the trade can't lose"; }
  if ((x.t1Hit || g >= r1) && e + 0.5 * g > cand) { cand = e + 0.5 * g; why = "past target 1, so the stop locks in half of the best gain so far"; }
  if (t2 > e && g >= 0.6 * (t2 - e) && t1 > cand) { cand = t1; why = "well on the way to target 2, so the stop is at target 1"; }
  cand = Math.min(cand, px - 0.25 * r1); // room for normal swings
  if (cand <= cur + 0.05 * r1) return null; // never backwards, and no tiny moves
  return { stop: cand * s, why, locksProfit: cand > e };
}

/** Best price so far, for longs the highest and for shorts the lowest. */
export const nextPeak = (dir: "long" | "short", peak: number | null | undefined, ...prices: number[]) => {
  const all = [peak, ...prices].filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  return all.length ? (dir === "long" ? Math.max(...all) : Math.min(...all)) : NaN;
};
