// Shared market-data helpers (Binance + Yahoo). Copied into each function at deploy time.
export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
export const TF = ["1h", "4h", "1d", "1w"] as const;
export type Tf = typeof TF[number];
export const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };

export async function binance(sym: string, tf: Tf): Promise<Candle[]> {
  const hosts = ["https://data-api.binance.vision", "https://api.binance.com", "https://api1.binance.com"];
  let lastErr = "";
  for (const h of hosts) {
    try {
      const r = await fetch(`${h}/api/v3/klines?symbol=${sym}&interval=${tf}&limit=1000`);
      if (!r.ok) { lastErr = `${h} ${r.status}`; continue; }
      const rows = await r.json() as unknown[][];
      return rows.map((k) => ({ t: Math.floor(Number(k[0]) / 1000), o: +k[1]!, h: +k[2]!, l: +k[3]!, c: +k[4]!, v: +k[5]! }));
    } catch (e) { lastErr = String(e); }
  }
  throw new Error(`binance: ${lastErr}`);
}

export async function yahoo(sym: string, tf: Tf): Promise<Candle[]> {
  const cfg = { "1h": ["60m", "730d"], "4h": ["60m", "730d"], "1d": ["1d", "10y"], "1w": ["1wk", "max"] }[tf];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${cfg[0]}&range=${cfg[1]}&includePrePost=false`;
  let r = await fetch(url, { headers: UA });
  if (!r.ok) r = await fetch(url.replace("query1", "query2"), { headers: UA });
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error(j?.chart?.error?.description ?? "yahoo: no data");
  const ts: number[] = res.timestamp ?? [];
  const q = res.indicators.quote[0];
  let out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if ([o, h, l, c].some((x) => x == null || Number.isNaN(x))) continue;
    out.push({ t: ts[i], o, h, l, c, v: q.volume?.[i] ?? 0 });
  }
  if (tf === "4h") {
    const agg: Candle[] = [];
    for (const k of out) {
      const bucket = Math.floor(k.t / 14400) * 14400;
      const last = agg[agg.length - 1];
      if (last && last.t === bucket) { last.h = Math.max(last.h, k.h); last.l = Math.min(last.l, k.l); last.c = k.c; last.v += k.v; }
      else agg.push({ ...k, t: bucket });
    }
    out = agg;
  }
  return out.slice(-1000);
}


export async function candles(symbol: string, tf: Tf): Promise<Candle[]> {
  const m = symbol.match(/^(crypto|yahoo):([A-Za-z0-9.=^\-]{1,24})$/);
  if (!m) throw new Error("bad symbol");
  return m[1] === "crypto" ? binance(m[2].toUpperCase(), tf) : yahoo(m[2].toUpperCase(), tf);
}

/** Latest price and 24h change for many symbols at once. */
export async function quotes(symbols: string[]): Promise<Record<string, { price: number; change: number }>> {
  const out: Record<string, { price: number; change: number }> = {};
  const crypto = symbols.filter((s) => s.startsWith("crypto:")).map((s) => s.slice(7).toUpperCase()).filter((s) => /^[A-Z0-9]{2,20}$/.test(s));
  const yah = symbols.filter((s) => s.startsWith("yahoo:")).map((s) => s.slice(6)).filter((s) => /^[A-Za-z0-9.=^\-]{1,24}$/.test(s));
  const jobs: Promise<void>[] = [];
  if (crypto.length) jobs.push((async () => {
    for (const h of ["https://data-api.binance.vision", "https://api.binance.com"]) {
      try {
        const r = await fetch(`${h}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(crypto))}&type=MINI`);
        if (!r.ok) continue;
        for (const t of await r.json()) { const p = +t.lastPrice, o = +t.openPrice; out[`crypto:${t.symbol}`] = { price: p, change: o ? (p / o - 1) * 100 : 0 }; }
        return;
      } catch { /* next host */ }
    }
  })());
  for (const s of yah) jobs.push((async () => {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1h&range=1d`, { headers: UA });
      if (!r.ok) return;
      const meta = (await r.json())?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) return;
      const prev = meta.chartPreviousClose ?? meta.previousClose;
      out[`yahoo:${s}`] = { price: meta.regularMarketPrice, change: prev ? (meta.regularMarketPrice / prev - 1) * 100 : 0 };
    } catch { /* skip */ }
  })());
  await Promise.all(jobs);
  return out;
}

export async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
