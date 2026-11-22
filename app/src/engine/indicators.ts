import type { Candle, Indicators } from "./types";

export function ema(src: number[], n: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  const k = 2 / (n + 1);
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    if (i < n - 1) continue;
    if (Number.isNaN(prev)) {
      let s = 0;
      for (let j = i - n + 1; j <= i; j++) s += src[j];
      prev = s / n;
    } else prev = src[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function sma(src: number[], n: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < src.length; i++) {
    s += src[i];
    if (i >= n) s -= src[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

export function atr(c: Candle[], n = 14): number[] {
  const tr = c.map((k, i) => (i === 0 ? k.h - k.l : Math.max(k.h - k.l, Math.abs(k.h - c[i - 1].c), Math.abs(k.l - c[i - 1].c))));
  const out = new Array<number>(c.length).fill(NaN);
  let prev = NaN;
  for (let i = 0; i < c.length; i++) {
    if (i < n - 1) continue;
    if (Number.isNaN(prev)) { let s = 0; for (let j = i - n + 1; j <= i; j++) s += tr[j]; prev = s / n; }
    else prev = (prev * (n - 1) + tr[i]) / n;
    out[i] = prev;
  }
  // back-fill early values so zigzag thresholds exist from the start
  const first = out.find((x) => !Number.isNaN(x)) ?? 0;
  for (let i = 0; i < out.length && Number.isNaN(out[i]); i++) out[i] = first;
  return out;
}

export function rsi(close: number[], n = 14): number[] {
  const out = new Array<number>(close.length).fill(NaN);
  let g = 0, l = 0;
  for (let i = 1; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    const up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; out[i] = 100 - 100 / (1 + g / (l || 1e-12)); } }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; out[i] = 100 - 100 / (1 + g / (l || 1e-12)); }
  }
  return out;
}

export function computeIndicators(c: Candle[]): Indicators {
  const close = c.map((k) => k.c);
  const e12 = ema(close, 12), e26 = ema(close, 26);
  const macd = close.map((_, i) => e12[i] - e26[i]);
  const firstValid = macd.findIndex((x) => !Number.isNaN(x));
  const sigPart = firstValid >= 0 ? ema(macd.slice(firstValid), 9) : [];
  const signal = macd.map((_, i) => (i < firstValid || firstValid < 0 ? NaN : sigPart[i - firstValid]));
  const bbM = sma(close, 20);
  const sd = close.map((_, i) => {
    if (i < 19) return NaN;
    let s = 0; for (let j = i - 19; j <= i; j++) s += (close[j] - bbM[i]) ** 2;
    return Math.sqrt(s / 20);
  });
  return {
    ema20: ema(close, 20), ema50: ema(close, 50), ema200: ema(close, 200),
    rsi: rsi(close), macd, signal, hist: macd.map((m, i) => m - signal[i]),
    atr: atr(c), bbM, bbU: bbM.map((m, i) => m + 2 * sd[i]), bbL: bbM.map((m, i) => m - 2 * sd[i]),
  };
}

/** Aggregate candles by a fixed factor (used to build the higher-timeframe context). */
export function aggregate(c: Candle[], factor: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < c.length; i += factor) {
    const chunk = c.slice(i, i + factor);
    if (!chunk.length) break;
    out.push({ t: chunk[0].t, o: chunk[0].o, h: Math.max(...chunk.map((k) => k.h)), l: Math.min(...chunk.map((k) => k.l)), c: chunk[chunk.length - 1].c, v: chunk.reduce((s, k) => s + k.v, 0) });
  }
  return out;
}
