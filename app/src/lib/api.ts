import type { Candle, Tf } from "../engine/types";

export const API = "https://fkrgiaeglingmogcsyik.supabase.co/functions/v1/viko-market";

export type Market = "Crypto" | "Stocks" | "Forex" | "Commodities";
export type Instrument = { id: string; label: string; name: string; market: Market };

export const DEFAULT_WATCHLIST: Instrument[] = [
  { id: "crypto:BTCUSDT", label: "BTC/USDT", name: "Bitcoin", market: "Crypto" },
  { id: "crypto:ETHUSDT", label: "ETH/USDT", name: "Ether", market: "Crypto" },
  { id: "crypto:SOLUSDT", label: "SOL/USDT", name: "Solana", market: "Crypto" },
  { id: "crypto:BNBUSDT", label: "BNB/USDT", name: "BNB", market: "Crypto" },
  { id: "crypto:XRPUSDT", label: "XRP/USDT", name: "XRP", market: "Crypto" },
  { id: "yahoo:AAPL", label: "AAPL", name: "Apple", market: "Stocks" },
  { id: "yahoo:NVDA", label: "NVDA", name: "Nvidia", market: "Stocks" },
  { id: "yahoo:MSFT", label: "MSFT", name: "Microsoft", market: "Stocks" },
  { id: "yahoo:TSLA", label: "TSLA", name: "Tesla", market: "Stocks" },
  { id: "yahoo:SPY", label: "SPY", name: "S&P 500 ETF", market: "Stocks" },
  { id: "yahoo:EURUSD=X", label: "EUR/USD", name: "Euro / US dollar", market: "Forex" },
  { id: "yahoo:GBPUSD=X", label: "GBP/USD", name: "Pound / US dollar", market: "Forex" },
  { id: "yahoo:USDJPY=X", label: "USD/JPY", name: "US dollar / Yen", market: "Forex" },
  { id: "yahoo:GC=F", label: "Gold", name: "Gold futures", market: "Commodities" },
  { id: "yahoo:CL=F", label: "Crude oil", name: "WTI crude futures", market: "Commodities" },
];

const cache = new Map<string, { at: number; data: Candle[] }>();

export async function getCandles(symbol: string, tf: Tf): Promise<Candle[]> {
  const key = `${symbol}|${tf}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;
  const r = await fetch(`${API}/candles?symbol=${encodeURIComponent(symbol)}&tf=${tf}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(j.candles)) throw new Error(j.error ?? `Market data request failed (${r.status})`);
  if (j.candles.length < 120) throw new Error("Not enough price history on this timeframe to read waves. Try a higher timeframe.");
  cache.set(key, { at: Date.now(), data: j.candles });
  return j.candles;
}

export const HTF: Record<Tf, Tf | null> = { "1h": "4h", "4h": "1d", "1d": "1w", "1w": null };

export async function searchSymbols(q: string): Promise<Instrument[]> {
  const out: Instrument[] = [];
  const up = q.trim().toUpperCase();
  if (/^[A-Z0-9]{2,10}$/.test(up)) out.push({ id: `crypto:${up.endsWith("USDT") ? up : up + "USDT"}`, label: `${up.replace(/USDT$/, "")}/USDT`, name: "Crypto (Binance)", market: "Crypto" });
  try {
    const r = await fetch(`${API}/search?q=${encodeURIComponent(q)}`);
    const j = await r.json();
    for (const x of j.quotes ?? []) {
      const market: Market = x.type === "CURRENCY" ? "Forex" : x.type === "FUTURE" ? "Commodities" : x.type === "CRYPTOCURRENCY" ? "Crypto" : "Stocks";
      out.push({ id: `yahoo:${x.symbol}`, label: x.symbol, name: x.name, market });
    }
  } catch { /* search is best-effort */ }
  return out.slice(0, 9);
}

export type JournalRow = { id: string; created_at: string; symbol: string; timeframe: string; direction: string; verdict: string; score: number; entry: number; stop: number; target1: number; target2: number | null; rr: number; setup: string; outcome: string; notes: string };

async function jfetch(key: string, init: RequestInit & { query?: string } = {}) {
  const r = await fetch(`${API}/journal${init.query ?? ""}`, { ...init, headers: { "content-type": "application/json", "x-viko-key": key } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("The journal key is wrong. Check it in Settings.");
  if (!r.ok) throw new Error(j.error ?? "Journal request failed.");
  return j;
}
export const journal = {
  list: async (key: string): Promise<JournalRow[]> => (await jfetch(key)).rows,
  add: async (key: string, row: Record<string, unknown>): Promise<JournalRow> => (await jfetch(key, { method: "POST", body: JSON.stringify(row) })).row,
  update: async (key: string, id: string, patch: { outcome?: string; notes?: string }): Promise<JournalRow> => (await jfetch(key, { method: "PATCH", query: `?id=${id}`, body: JSON.stringify(patch) })).row,
};

export function store<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem("viko:" + key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export function save(key: string, v: unknown) {
  try { localStorage.setItem("viko:" + key, JSON.stringify(v)); } catch { /* private mode */ }
}
