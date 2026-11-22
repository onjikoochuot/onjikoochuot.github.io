import type { Candle, Pivot } from "./types";

/**
 * Monowave detection. Neely builds every count from monowaves: price moves
 * between changes of direction. On bar data we approximate this with an
 * ATR-scaled swing filter; the multiplier sets the wave degree being studied.
 * The final pivot is provisional (the move still in progress).
 */
export function monowaves(c: Candle[], atr: number[], mult: number): Pivot[] {
  if (c.length < 3) return [];
  const piv: Pivot[] = [];
  let dir: 1 | -1 | 0 = 0;
  let extI = 0, extP = c[0].c;
  let hiI = 0, loI = 0;
  for (let i = 1; i < c.length; i++) {
    const th = atr[i] * mult;
    if (dir === 0) {
      if (c[i].h > c[hiI].h) hiI = i;
      if (c[i].l < c[loI].l) loI = i;
      if (c[hiI].h - c[loI].l >= th) {
        if (hiI > loI) { piv.push({ i: loI, p: c[loI].l, kind: "L" }); dir = 1; extI = hiI; extP = c[hiI].h; }
        else { piv.push({ i: hiI, p: c[hiI].h, kind: "H" }); dir = -1; extI = loI; extP = c[loI].l; }
      }
      continue;
    }
    if (dir === 1) {
      if (c[i].h >= extP) { extP = c[i].h; extI = i; }
      else if (extP - c[i].l >= th) { piv.push({ i: extI, p: extP, kind: "H" }); dir = -1; extP = c[i].l; extI = i; }
    } else {
      if (c[i].l <= extP) { extP = c[i].l; extI = i; }
      else if (c[i].h - extP >= th) { piv.push({ i: extI, p: extP, kind: "L" }); dir = 1; extP = c[i].h; extI = i; }
    }
  }
  if (dir !== 0) piv.push({ i: extI, p: extP, kind: dir === 1 ? "H" : "L", provisional: true });
  return piv;
}

export const DEGREES: { key: string; name: string; mult: number }[] = [
  { key: "minor", name: "Minor degree", mult: 2.2 },
  { key: "intermediate", name: "Intermediate degree", mult: 3.6 },
  { key: "primary", name: "Primary degree", mult: 5.8 },
];

/** Line value at bar x through two pivots. */
export function lineAt(a: { i: number; p: number }, b: { i: number; p: number }, x: number) {
  if (b.i === a.i) return b.p;
  return a.p + ((b.p - a.p) * (x - a.i)) / (b.i - a.i);
}
