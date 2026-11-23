export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
export type Dir = "long" | "short";
export type Tf = "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "1d" | "1w" | "1M";

export type Pivot = { i: number; p: number; kind: "H" | "L"; provisional?: boolean };

/** One rule check. `hard` rules must pass or the setup is void. Weighted rules feed the confluence score. */
export type Check = {
  id: string;
  group: "Neely: essential" | "Neely: conditional" | "Neely: confirmation" | "Wyckoff" | "Indicators" | "Risk";
  label: string;
  pass: boolean | null; // null = not applicable (excluded from score)
  hard?: boolean;
  weight: number;
  detail: string;
  source: string; // where the rule comes from
};

export type WaveLabel = { i: number; p: number; text: string };

export type Setup = {
  id: string;
  name: string;
  dir: Dir;
  degree: string;
  pattern: string;
  labels: WaveLabel[];
  entry: number;
  stop: number;
  invalidation: number;
  target1: number;
  target2: number;
  triggered: boolean;
  triggerNote: string;
  checks: Check[];
  score: number; // 0-100 weighted confluence of book rules
  hardFail: boolean;
  rr1: number;
  rr2: number;
  verdict: "APPROVED" | "WATCH" | "NO TRADE";
  reasons: string[];
  plain: string; // plain-English instruction
  tip: string; // layman tip
  expectBars: number; // rough bars to target 1, from wave timing
};

export type WyckoffEvent = { i: number; p: number; code: string; name: string };
export type WyckoffRead = {
  kind: "accumulation" | "distribution" | null;
  phase: "A" | "B" | "C" | "D" | "E" | null;
  events: WyckoffEvent[];
  top: number | null; // creek (acc) / range high
  bottom: number | null; // ice (dist) / range low
  startI: number | null;
  bias: Dir | null;
  note: string;
  volumeUsable: boolean;
};

export type Indicators = {
  ema20: number[]; ema50: number[]; ema200: number[];
  rsi: number[]; macd: number[]; signal: number[]; hist: number[];
  atr: number[]; bbU: number[]; bbM: number[]; bbL: number[];
};

export type Analysis = {
  last: Candle;
  setups: Setup[];
  best: Setup | null;
  wyckoff: WyckoffRead;
  htfTrend: Dir | null;
  htfNote: string;
  ind: Indicators;
  pivotsByDegree: Record<string, Pivot[]>;
  supplementary: { label: string; value: string; tone: "bull" | "bear" | "flat" }[];
};
