import type { Candle, WyckoffEvent, WyckoffRead } from "./types";

/*
 * Wyckoff structure reader, following Villahermosa, "The Wyckoff Methodology in Depth":
 *  Phase A  stop of the previous trend: (PS) SC/BC, AR, ST          (ch. 14-17, 21)
 *  Phase B  building the cause: tests of both range ends              (ch. 22)
 *  Phase C  the shake: Spring / UTAD, then its test                   (ch. 18, 23)
 *  Phase D  SOS/SOW breaks the Creek/Ice, LPS/BUEC (LPSY) confirms    (ch. 19-20, 24)
 *  Phase E  trend out of range                                        (ch. 25)
 * Distribution is read by mirroring prices and reusing the accumulation logic.
 */

const mirror = (c: Candle[]): Candle[] => c.map((k) => ({ t: k.t, o: -k.o, h: -k.l, l: -k.h, c: -k.c, v: k.v }));

function avg(a: number[], from: number, to: number) {
  let s = 0, n = 0;
  for (let i = Math.max(0, from); i <= Math.min(a.length - 1, to); i++) { s += a[i]; n++; }
  return n ? s / n : 0;
}

type Raw = { phase: WyckoffRead["phase"]; events: WyckoffEvent[]; top: number; bottom: number; startI: number; lastEventI: number; note: string } | null;

function readAccumulation(c: Candle[], atr: number[], useVol: boolean): Raw {
  const n = c.length;
  const vol = c.map((k) => k.v);
  const rng = c.map((k) => k.h - k.l);
  const L = Math.min(260, n - 1);
  let best: Raw = null;
  // Most recent qualifying climax wins.
  for (let j = n - 12; j >= n - L && j > 35; j--) {
    const a = atr[j];
    // Prior downtrend: price fell meaningfully into the climax (ch. 15: "after a significant downward movement").
    if (!(c[j - 30].c - c[j].l > 5 * a)) continue;
    let isLow = true;
    for (let k = j - 30; k <= Math.min(n - 1, j + 8); k++) if (c[k].l < c[j].l) { isLow = false; break; }
    if (!isLow) continue;
    const climaxVol = useVol && vol[j] >= 1.6 * avg(vol, j - 20, j - 1);
    // AR: the rally after the climax sets the range top (ch. 16).
    let ar = -1;
    for (let k = j + 2; k <= Math.min(n - 1, j + 30); k++) if (ar < 0 || c[k].h > c[ar].h) ar = k;
    if (ar < 0 || c[ar].h - c[j].l < 2.5 * a) continue;
    const top = c[ar].h, bottom = c[j].l;
    const height = top - bottom;
    if (height > 14 * a) continue; // too wide to be a range at this scale
    const events: WyckoffEvent[] = [
      { i: j, p: bottom, code: climaxVol ? "SC" : "SC(x)", name: climaxVol ? "Selling Climax" : "Selling Exhaustion (no climactic volume)" },
      { i: ar, p: top, code: "AR", name: "Automatic Rally" },
    ];
    // ST: revisit of the climax area on lower volume and narrower ranges (ch. 17).
    let st = -1;
    for (let k = ar + 2; k < n; k++) {
      if (c[k].l <= bottom + 0.35 * height) {
        const lowerVol = !useVol || vol[k] < vol[j];
        if (lowerVol) { st = k; break; }
      }
      if (c[k].c > top + 0.3 * a) break;
    }
    let phase: WyckoffRead["phase"] = "A";
    let last = ar;
    if (st > 0) { events.push({ i: st, p: c[st].l, code: "ST", name: "Secondary Test" }); phase = "B"; last = st; }
    // SOS: close above the Creek with range and volume expansion (ch. 19, significant bar ch. 27).
    let sos = -1;
    for (let k = (st > 0 ? st : ar) + 3; k < n; k++) {
      const wide = rng[k] > avg(rng, k - 10, k - 1);
      const loud = !useVol || vol[k] > avg(vol, k - 20, k - 1);
      if (c[k].c > top + 0.15 * atr[k] && wide && loud) { sos = k; break; }
      if (c[k].c < bottom - 1.2 * atr[k] && c[Math.min(n - 1, k + 2)].c < bottom) { sos = -2; break; } // range lost downward
    }
    if (sos === -2) continue;
    // Spring / shakeout: break of the range low that is quickly reclaimed (ch. 18), before the SOS.
    let spring = -1;
    const end = sos > 0 ? sos : n - 1;
    for (let k = end; k > (st > 0 ? st : ar) + 2; k--) {
      if (c[k].l < bottom) {
        let back = false;
        for (let m = k; m <= Math.min(n - 1, k + 3); m++) if (c[m].c > bottom) { back = true; break; }
        if (back) { spring = k; break; }
      }
    }
    if (spring > 0) {
      const v = vol[spring], va = avg(vol, spring - 20, spring - 1);
      const kind = !useVol ? "Spring" : v > 1.5 * va ? "Spring #1 / Terminal Shakeout" : v > 0.9 * va ? "Spring #2" : "Spring #3 (exhaustion of supply)";
      events.push({ i: spring, p: c[spring].l, code: "Spring", name: kind });
      phase = "C"; last = spring;
      // Test of the spring: higher low, volume below the prior two bars (ch. 17 "generic test").
      for (let k = spring + 2; k <= end; k++) {
        const isSwingLow = k < n - 1 && c[k].l <= c[k - 1].l && c[k].l <= c[k + 1].l;
        if (isSwingLow && c[k].l > c[spring].l && (!useVol || (vol[k] < vol[k - 1] && vol[k] < vol[k - 2]))) {
          events.push({ i: k, p: c[k].l, code: "Test", name: "Spring test" }); last = k; break;
        }
      }
    }
    if (sos > 0) {
      events.push({ i: sos, p: c[sos].h, code: "SOS", name: "Sign of Strength / Jump Across the Creek" });
      phase = "D"; last = sos;
      // LPS / BUEC: pullback that holds the Creek on lighter volume (ch. 20).
      let lps = -1;
      for (let k = sos + 2; k < n - 1; k++) {
        if (c[k].l <= c[k - 1].l && c[k].l <= c[k + 1].l) {
          if (c[k].l < bottom + 0.5 * height) break; // re-entered deep: breakout doubtful
          if (!useVol || avg(vol, k - 2, k) < vol[sos]) { lps = k; break; }
        }
      }
      if (lps > 0) {
        events.push({ i: lps, p: c[lps].l, code: c[lps].l >= top - 0.3 * atr[lps] ? "BUEC" : "LPS", name: c[lps].l >= top - 0.3 * atr[lps] ? "Back-Up to the Edge of the Creek" : "Last Point of Support" });
        last = lps;
        const after = c.slice(lps + 1);
        if (after.some((k) => k.h > c[sos].h) && c[n - 1].c > top) phase = "E";
      }
      if (c[n - 1].c < bottom + 0.5 * height) continue; // failed breakout, now a shake
    }
    // Phase B must have some duration before a spring counts (ch. 22).
    if (phase === "A" && n - 1 - ar > 40) continue;
    best = { phase, events, top, bottom, startI: j, lastEventI: last, note: climaxVol ? "Climactic volume stopped the decline." : useVol ? "The decline ended by exhaustion, not climactic volume." : "No usable volume on this market: structure read from price only." };
    break;
  }
  return best;
}

export function readWyckoff(c: Candle[], atr: number[]): WyckoffRead {
  const useVol = c.filter((k) => k.v > 0).length > c.length * 0.9;
  const acc = readAccumulation(c, atr, useVol);
  const distRaw = readAccumulation(mirror(c), atr, useVol);
  const rename: Record<string, [string, string]> = {
    SC: ["BC", "Buying Climax"], "SC(x)": ["BC(x)", "Buying Exhaustion (no climactic volume)"], AR: ["AR", "Automatic Reaction"],
    ST: ["ST", "Secondary Test"], Spring: ["UTAD", "Upthrust After Distribution"], Test: ["Test", "UTAD test"],
    SOS: ["SOW", "Sign of Weakness (break of the Ice)"], LPS: ["LPSY", "Last Point of Supply"], BUEC: ["LPSY", "Last Point of Supply (Fall Through the Ice test)"],
  };
  const dist: Raw = distRaw && {
    ...distRaw,
    top: -distRaw.bottom, bottom: -distRaw.top,
    events: distRaw.events.map((e) => ({ ...e, p: -e.p, code: rename[e.code]?.[0] ?? e.code, name: rename[e.code]?.[1] ?? e.name })),
  };
  const pick = acc && dist ? (acc.lastEventI >= dist.lastEventI ? "acc" : "dist") : acc ? "acc" : dist ? "dist" : null;
  if (!pick) return { kind: null, phase: null, events: [], top: null, bottom: null, startI: null, bias: null, note: "No Wyckoff trading range is active on this timeframe. The market is trending or fluctuating without a readable campaign (ch. 5).", volumeUsable: useVol };
  const r = (pick === "acc" ? acc : dist)!;
  const kind = pick === "acc" ? "accumulation" : "distribution";
  const bias = r.phase === "C" || r.phase === "D" || r.phase === "E" ? (pick === "acc" ? "long" : "short") : null;
  return { kind, phase: r.phase, events: r.events.sort((a, b) => a.i - b.i), top: r.top, bottom: r.bottom, startI: r.startI, bias, note: r.note, volumeUsable: useVol };
}

/** Significant bar (ch. 27): wider range than recent bars, more volume, close in the half of the move, beyond a recent level. */
export function isSignificantBar(c: Candle[], i: number, dir: "long" | "short", useVol: boolean): boolean {
  if (i < 12) return false;
  const k = c[i];
  const r = k.h - k.l;
  let rs = 0, vs = 0;
  for (let j = i - 10; j < i; j++) { rs += c[j].h - c[j].l; vs += c[j].v; }
  const wide = r > rs / 10;
  const loud = !useVol || k.v > vs / 10;
  const pos = r === 0 ? 0.5 : (k.c - k.l) / r;
  const half = dir === "long" ? pos >= 0.5 : pos <= 0.5;
  const prev = c.slice(i - 5, i);
  const beyond = dir === "long" ? k.c > Math.max(...prev.map((x) => x.h)) * 0.999 || k.c > Math.max(...prev.map((x) => x.c)) : k.c < Math.min(...prev.map((x) => x.l)) * 1.001 || k.c < Math.min(...prev.map((x) => x.c));
  return wide && loud && half && beyond;
}

/** Weis-style wave volume: total volume traded during a swing (ch. 9 "by waves"). */
export function waveVolume(c: Candle[], from: number, to: number) {
  let s = 0;
  for (let i = Math.max(0, from + 1); i <= Math.min(c.length - 1, to); i++) s += c[i].v;
  return s / Math.max(1, to - from);
}
